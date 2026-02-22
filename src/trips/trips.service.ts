/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { DRIZLE } from '../database.module';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { eq, and, sql, asc, desc, ilike, isNull, inArray } from 'drizzle-orm';
import { CalculateTripDraftDto } from './dto/calc-trip.dto';
import { CreateAndBookCustomTripDto } from './dto/create-custom-trip.dto';

export type TripTypeLiteral = 'CUSTOM' | 'PREDEFINED';

export type TripPriceBreakdown = {
  poi: number;
  lodging: number;
  meals: number;
  transport: number;
  guide: number;
};
export type TripPriceQuote = {
  total: number;
  perPerson: number;
  perPersonPoi: number;
  perPersonMeals: number;
  perPersonTransport: number;
  nights: number;
  distanceKm: number;
  breakdown: {
    poi: number;
    lodging: number;
    meals: number;
    transport: number;
    guide: number;
  };
  warnings?: string[];
};

type RoomTypeSlice = Pick<
  typeof schema.hotelRoomTypes.$inferSelect,
  'id' | 'hotelId' | 'baseNightlyRate' | 'capacity' | 'isActive'
>;

type ConfirmDraft = CalculateTripDraftDto & {
  name?: string;
  meetLocation?: { lon: number; lat: number };
  dropLocation?: { lon: number; lat: number };
  meetLocationAddress?: string;
  dropLocationAddress?: string;
};

export type CreateCustomTripResult = {
  tripId: number;
  orderId: number;
  bookingId: number;
  chatRoomId: number;
  insertedChatMembers: { userId: string; role: string }[];
  price: Awaited<ReturnType<TripsService['calculateCustomTripPrice']>>;
};

@Injectable()
export class TripsService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private diffNights(startISO: string, endISO: string): number {
    const start = new Date(startISO).getTime();
    const end = new Date(endISO).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 1;
    return Math.max(1, Math.ceil((end - start) / 86_400_000));
  }

  private async releaseHotelRoomInventory(
    roomTypeId: number,
    startDate: string,
    endDate: string,
    rooms: number,
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<void> {
    const checkIn = new Date(startDate);
    const checkOut = new Date(endDate);
    const currentDate = new Date(checkIn);
  
    const rt = await tx.query.hotelRoomTypes.findFirst({
      where: eq(schema.hotelRoomTypes.id, roomTypeId),
      columns: { totalRooms: true },
    });
    if (!rt) throw new NotFoundException('Room type not found');
  
    while (currentDate < checkOut) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const inv = await tx.query.roomInventory.findFirst({
        where: and(
          eq(schema.roomInventory.roomTypeId, roomTypeId),
          eq(schema.roomInventory.date, dateStr),
        ),
      });
  
      if (inv) {
        await tx.update(schema.roomInventory)
          .set({
            bookedRooms: Math.max(0, (inv.bookedRooms || 0) - rooms),
            availableRooms: Math.min(inv.totalRooms, (inv.availableRooms || 0) + rooms),
            updatedAt: new Date(),
          })
          .where(eq(schema.roomInventory.id, inv.id));
      } else {
        await tx.insert(schema.roomInventory).values({
          roomTypeId,
          date: dateStr,
          totalRooms: rt.totalRooms,
          bookedRooms: 0,
          availableRooms: rt.totalRooms,
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  
  private haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
    const R = 6371; // km
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  async getTripEntityTypeId(
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<number> {
    const rec = await tx.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'trip'),
      columns: { id: true },
    });
    if (!rec) {
      // Create the trip entity type if it doesn't exist
      const [newRec] = await tx
        .insert(schema.entityTypes)
        .values({
          name: 'trip',
          description: 'Trip entity type for attachments',
        })
        .returning({ id: schema.entityTypes.id });
      return newRec.id;
    }
    return rec.id;
  }

  async checkGuideAvailability(
    guideId: string,
    startDate: string,
    endDate: string,
    tx = this.db,
    opts?: { skipSource?: 'PREDEFINED_TRIP'|'CUSTOM_TRIP'; skipSourceId?: number },
  ) {
    const whereParts = [
      eq(schema.guideAvailability.guideId, guideId),
      sql`${schema.guideAvailability.startDate} < ${endDate}`,
      sql`${schema.guideAvailability.endDate} > ${startDate}`,
    ];
    if (opts?.skipSource && opts?.skipSourceId != null) {
      whereParts.push(
        sql`NOT (${schema.guideAvailability.source} = ${opts.skipSource} AND ${schema.guideAvailability.sourceId} = ${opts.skipSourceId})`
      );
    }
    const rows = await tx.query.guideAvailability.findMany({ where: and(...whereParts) });
    return rows.length
      ? { available:false, message:`Guide is not available from ${startDate} to ${endDate}. Already booked for overlapping dates.` }
      : { available:true };
  }
  
  async checkHotelRoomAvailability(
    hotelId: number,
    roomTypeId: number,
    startDate: string,
    endDate: string,
    roomsNeeded: number,
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<{ available: boolean; message?: string; roomType?: any }> {
    // Get room type details
    const roomType = await tx.query.hotelRoomTypes.findFirst({
      where: eq(schema.hotelRoomTypes.id, roomTypeId),
      with: {
        hotel: {
          columns: {
            id: true,
            name: true,
            currency: true,
          },
        },
      },
    });

    if (!roomType) {
      return { available: false, message: 'Room type not found' };
    }

    if (!roomType.isActive) {
      return { available: false, message: 'Room type is not active' };
    }

    // Check if room type belongs to the specified hotel
    if (roomType.hotelId !== hotelId) {
      return {
        available: false,
        message: 'Room type does not belong to the specified hotel',
      };
    }

    // Parse dates
    const checkIn = new Date(startDate);
    const checkOut = new Date(endDate);

    if (checkIn >= checkOut) {
      return { available: false, message: 'End date must be after start date' };
    }

    // Check availability for each day in the range
    const datesToCheck: Date[] = [];
    const currentDate = new Date(checkIn);
    while (currentDate < checkOut) {
      datesToCheck.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Check inventory for each date
    for (const date of datesToCheck) {
      const inventory = await tx.query.roomInventory.findFirst({
        where: and(
          eq(schema.roomInventory.roomTypeId, roomTypeId),
          eq(schema.roomInventory.date, date.toISOString().split('T')[0]),
        ),
      });

      let availableRooms = roomType.totalRooms;
      if (inventory) {
        availableRooms = inventory.availableRooms;
      }

      if (availableRooms < roomsNeeded) {
        return {
          available: false,
          message: `Only ${availableRooms} rooms available on ${date.toISOString().split('T')[0]}`,
          roomType,
        };
      }
    }

    return { available: true, roomType };
  }

  async updateHotelRoomInventory(
    hotelId: number,
    roomTypeId: number,
    startDate: string,
    endDate: string,
    roomsNeeded: number,
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<void> {
    const checkIn = new Date(startDate);
    const checkOut = new Date(endDate);
    const currentDate = new Date(checkIn);

    while (currentDate < checkOut) {
      const dateStr = currentDate.toISOString().split('T')[0];

      // Check if inventory record exists for this date
      const existingInventory = await tx.query.roomInventory.findFirst({
        where: and(
          eq(schema.roomInventory.roomTypeId, roomTypeId),
          eq(schema.roomInventory.date, dateStr),
        ),
      });

      if (existingInventory) {
        // Update existing inventory
        await tx
          .update(schema.roomInventory)
          .set({
            bookedRooms: (existingInventory.bookedRooms || 0) + roomsNeeded,
            availableRooms:
              (existingInventory.availableRooms || 0) - roomsNeeded,
            updatedAt: new Date(),
          })
          .where(eq(schema.roomInventory.id, existingInventory.id));
      } else {
        // Get room type total rooms
        const roomType = await tx.query.hotelRoomTypes.findFirst({
          where: eq(schema.hotelRoomTypes.id, roomTypeId),
          columns: { totalRooms: true },
        });

        if (!roomType) {
          throw new NotFoundException('Room type not found');
        }

        // Create new inventory record
        await tx.insert(schema.roomInventory).values({
          roomTypeId,
          date: dateStr,
          totalRooms: roomType.totalRooms,
          bookedRooms: roomsNeeded,
          availableRooms: roomType.totalRooms - roomsNeeded,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  async getDefaultRefundPolicy(
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<number> {
    // Check if default refund policy exists
    let refundPolicy = await tx.query.refundPolicy.findFirst({
      where: eq(
        schema.refundPolicy.name,
        'Default Trip Refund Policy - 7+ Days',
      ),
      columns: { id: true },
    });

    if (!refundPolicy) {
      // Create multiple refund policies for different time ranges
      const policies = [
        {
          name: 'Default Trip Refund Policy - 7+ Days',
          policyText: '100% refund if cancelled 7+ days before trip start',
          triggerMinutesBeforeService: 7 * 24 * 60, // 7 days
          triggerStatus: 'CANCELLED',
          refundPercentage: '1.00', // 100%
          description:
            'Full refund for cancellations 7+ days before trip start',
        },
        {
          name: 'Default Trip Refund Policy - 5-7 Days',
          policyText: '70% refund if cancelled 5-7 days before trip start',
          triggerMinutesBeforeService: 5 * 24 * 60, // 5 days
          triggerStatus: 'CANCELLED',
          refundPercentage: '0.70', // 70%
          description:
            '70% refund for cancellations 5-7 days before trip start',
        },
        {
          name: 'Default Trip Refund Policy - 2-5 Days',
          policyText: '30% refund if cancelled 2-5 days before trip start',
          triggerMinutesBeforeService: 2 * 24 * 60, // 2 days
          triggerStatus: 'CANCELLED',
          refundPercentage: '0.30', // 30%
          description:
            '30% refund for cancellations 2-5 days before trip start',
        },
        {
          name: 'Default Trip Refund Policy - 0-2 Days',
          policyText:
            'No refund if cancelled less than 2 days before trip start',
          triggerMinutesBeforeService: 0, // 0 days
          triggerStatus: 'CANCELLED',
          refundPercentage: '0.00', // 0%
          description:
            'No refund for cancellations less than 2 days before trip start',
        },
      ];

      for (const policy of policies) {
        await tx.insert(schema.refundPolicy).values(policy);
      }

      // Get the main policy (7+ days) to return
      refundPolicy = await tx.query.refundPolicy.findFirst({
        where: eq(
          schema.refundPolicy.name,
          'Default Trip Refund Policy - 7+ Days',
        ),
        columns: { id: true },
      });
    }

    return refundPolicy?.id ?? 0;
  }
  
  async checkTripAvailability(
    tripId: number,
    seats: number,
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<{ available: boolean; message?: string; trip?: any }> {
    // Fetch trip, its min/max seats & total bookings so far
    const trip = await tx.query.trips.findFirst({
      where: eq(schema.trips.id, tripId),
      columns: {
        id: true,
        pricePerPerson: true,
        minSeatsPerUser: true,
        maxSeatsPerUser: true,
        maxPeople: true,
      },
    });
    if (!trip) return { available: false, message: 'Trip not found' };

    if (seats < trip.minSeatsPerUser || seats > trip.maxSeatsPerUser) {
      return {
        available: false,
        message: `You must book between ${trip.minSeatsPerUser} and ${trip.maxSeatsPerUser} seats`,
      };
    }

    // Sum existing bookings
  const [{ booked }] = await tx
  .select({
    booked: sql<number>`COALESCE(SUM(${schema.tripBookings.seats}), 0)`,
  })
  .from(schema.tripBookings)
  .where(
    and(
      eq(schema.tripBookings.tripId, tripId),
      isNull(schema.tripBookings.cancelledAt),
    ),
  );
    if (Number(booked) + Number(seats) > trip.maxPeople) {
      return {
        available: false,
        message: `Only ${
          trip.maxPeople - booked
        } seats remaining on this trip`,
      };
    }

    return { available: true, trip };
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    orderBy:
      | 'createdAt'
      | 'name'
      | 'pricePerPerson'
      | 'startDate' = 'createdAt',
    orderDir: 'asc' | 'desc' = 'desc',
    filters: {
      tripType?: 'CUSTOM' | 'PREDEFINED';
      withMeals?: boolean;
      withTransport?: boolean;
      hotelIncluded?: boolean;
      search?: string;
      minPrice?: number;
      maxPrice?: number;
      minPeople?: number;
      maxPeople?: number;
      cityId?: number;
    } = {},
  ) {
    const offset = (page - 1) * limit;
    const conditions: any[] = [];

    // your existing filters → conditions.push(...)
    if (filters.tripType)
      conditions.push(eq(schema.trips.tripType, filters.tripType));
    if (filters.withMeals !== undefined)
      conditions.push(eq(schema.trips.withMeals, filters.withMeals));
    if (filters.withTransport !== undefined)
      conditions.push(eq(schema.trips.withTransport, filters.withTransport));
    if (filters.hotelIncluded !== undefined)
      conditions.push(eq(schema.trips.hotelIncluded, filters.hotelIncluded));
    if (filters.search)
      conditions.push(ilike(schema.trips.name, `%${filters.search}%`));
    if (filters.minPrice)
      conditions.push(
        sql`${schema.trips.pricePerPerson} >= ${filters.minPrice}`,
      );
    if (filters.maxPrice)
      conditions.push(
        sql`${schema.trips.pricePerPerson} <= ${filters.maxPrice}`,
      );
    if (filters.minPeople)
      conditions.push(sql`${schema.trips.maxPeople} >= ${filters.minPeople}`);
    if (filters.maxPeople)
      conditions.push(sql`${schema.trips.minPeople} <= ${filters.maxPeople}`);
    if (filters.cityId)
      conditions.push(eq(schema.trips.cityId, filters.cityId));

    // total count
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.trips)
      .where(conditions.length ? and(...conditions) : undefined);
    const totalCount = totalCountResult[0].count;

    // order expression
    let orderColumn: any = schema.trips.createdAt;
    if (orderBy === 'name') orderColumn = schema.trips.name;
    if (orderBy === 'pricePerPerson') orderColumn = schema.trips.pricePerPerson;
    if (orderBy === 'startDate') orderColumn = schema.trips.startDate;
    const orderExpr = orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

    // fetch trip entityTypeId
    const tripEntityTypeId = await this.getTripEntityTypeId();

    // raw join query
    const rawResults = await this.db
      .select()
      .from(schema.trips)
      .leftJoin(
        schema.attachments,
        and(
          eq(schema.attachments.entityId, schema.trips.id),
          eq(schema.attachments.entityTypeId, tripEntityTypeId),
        ),
      )
      .leftJoin(
        schema.fileObjects,
        eq(schema.attachments.objectId, schema.fileObjects.id),
      )
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limit)
      .offset(offset)
      .orderBy(orderExpr);

    // transform into proper shape
    const data = this.processJoinedTripResults(rawResults);

    return {
      data,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      orderBy,
      orderDir,
      filters,
    };
  }

  // identical pattern to your city helper
  private processJoinedTripResults(joined: any[]): any[] {
    const map = new Map<number, any>();
    for (const row of joined) {
      const t = row.trips;
      if (!map.has(t.id)) {
        map.set(t.id, { ...t, mainImage: null, galleryImages: [] });
      }
      const entry = map.get(t.id);
      if (row.attachments && row.file_objects) {
        if (row.attachments.role === 'MAIN') {
          entry.mainImage = row.file_objects;
        } else if (row.attachments.role === 'GALLERY') {
          entry.galleryImages.push(row.file_objects);
        }
      }
    }
    return Array.from(map.values());
  }

  async findOne(id: number) {
    const trip = await this.db.query.trips.findFirst({
      where: eq(schema.trips.id, id),
      with: {
        city: {
          columns: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          columns: {
            id: true,
            name: true,
            username: true,
            email: true,
          },
        },
        guide: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                username: true,
                email: true,
              },
            },
            city: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
        tripDays: {
          with: {
            tripPois: {
              with: {
                poi: {
                  columns: {
                    id: true,
                    name: true,
                    description: true,
                    address: true,
                    price: true,
                    avgRating: true,
                    ratingCount: true,
                  },
                },
              },
            },
          },
        },
        tripHotels: {
          with: {
            hotel: {
              columns: {
                id: true,
                name: true,
                stars: true,
                address: true,
              },
            },
            roomType: {
              columns: {
                id: true,
                label: true,
                baseNightlyRate: true,
              },
            },
          },
        },
        tripToTags: {
          with: {
            tag: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      columns: {
        id: true,
        name: true,
        cityId: true,
        createdBy: true,
        tripType: true,
        startDate: true,
        endDate: true,
        pricePerPerson: true,
        minPeople: true,
        maxPeople: true,
        minSeatsPerUser: true,
        maxSeatsPerUser: true,
        withMeals: true,
        withTransport: true,
        hotelIncluded: true,
        mealPricePerPerson: true,
        transportationPricePerPerson: true,
        guideId: true,
        meetLocationAdress: true,
        meetLocation: true,
        dropLocationAdress: true,
        dropLocation: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    // Fetch trip attachments (main + gallery)
    const tripEntityTypeId = await this.getTripEntityTypeId();
    const tripAttachments = await this.db.query.attachments.findMany({
      where: and(
        eq(schema.attachments.entityTypeId, tripEntityTypeId),
        eq(schema.attachments.entityId, trip.id),
      ),
      with: { fileObject: true },
    });

    let mainImage: any = null;
    const galleryImages: any[] = [];
    for (const att of tripAttachments) {
      if (att.role === 'MAIN' && att.fileObject) mainImage = att.fileObject;
      if (att.role === 'GALLERY' && att.fileObject)
        galleryImages.push(att.fileObject);
    }

    // Enrich POIs with mainImage
    const poiEntityType = await this.db.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'poi'),
      columns: { id: true },
    });
    if (poiEntityType && trip.tripDays) {
      for (const day of trip.tripDays) {
        if (!day.tripPois) continue;
        for (const tp of day.tripPois) {
          const poi = tp.poi;
          if (!poi) continue;
          const atts = await this.db.query.attachments.findMany({
            where: and(
              eq(schema.attachments.entityTypeId, poiEntityType.id),
              eq(schema.attachments.entityId, poi.id),
              eq(schema.attachments.role, 'MAIN'),
            ),
            with: { fileObject: true },
          });
          (tp as any).poi = { ...(tp.poi as any), mainImage: atts[0]?.fileObject ?? null };
        }
      }
    }

    // Enrich Hotels and RoomTypes with main images
    const hotelEntityType = await this.db.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'hotel'),
      columns: { id: true },
    });
    const roomTypeEntityType = await this.db.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'roomType'),
      columns: { id: true },
    });

    if (trip.tripHotels) {
      for (const th of trip.tripHotels) {
        // hotel main image
        if (hotelEntityType && th.hotel) {
          const hatts = await this.db.query.attachments.findMany({
            where: and(
              eq(schema.attachments.entityTypeId, hotelEntityType.id),
              eq(schema.attachments.entityId, th.hotel.id),
              eq(schema.attachments.role, 'MAIN'),
            ),
            with: { fileObject: true },
          });
          (th as any).hotel = { ...(th.hotel as any), mainImage: hatts[0]?.fileObject ?? null };
        }

        // roomType main image
        if (roomTypeEntityType && th.roomType) {
          const ratts = await this.db.query.attachments.findMany({
            where: and(
              eq(schema.attachments.entityTypeId, roomTypeEntityType.id),
              eq(schema.attachments.entityId, th.roomType.id),
              eq(schema.attachments.role, 'MAIN'),
            ),
            with: { fileObject: true },
          });
          (th as any).roomType = { ...(th.roomType as any), mainImage: ratts[0]?.fileObject ?? null };
        }
      }
    }

    // Attach guide user avatar (GUID/URL)
    if (trip.guide?.user) {
      const gid = trip.guide.user.id;
      const avatarRow = await this.db
        .select({ bucket: schema.fileObjects.bucket, objectKey: schema.fileObjects.objectKey })
        .from(schema.userAvatars)
        .leftJoin(schema.fileObjects, eq(schema.fileObjects.id, schema.userAvatars.fileObjectId))
        .where(eq(schema.userAvatars.userId, gid));
      const a = avatarRow[0];
      (trip as any).guide = { ...(trip.guide as any), user: { ...(trip.guide.user as any), avatar: a ? { bucket: a.bucket, objectKey: a.objectKey } : null } };
    }

    return { ...trip, mainImage, galleryImages };
  }

  async listMyTripBookings(userId: string) {
    const tripEntityTypeId = await this.getTripEntityTypeId();
    const rows = await this.db
      .select({
        bookingId: schema.tripBookings.id,
        tripId: schema.trips.id,
        tripName: schema.trips.name,
        seats: schema.tripBookings.seats,
        total: schema.tripBookings.total,
        bookedAt: schema.tripBookings.createdAt,
        mainImageBucket: schema.fileObjects.bucket,
        mainImageKey: schema.fileObjects.objectKey,
        chatRoomId: schema.chatRooms.id,
      })
      .from(schema.tripBookings)
      .leftJoin(schema.trips, eq(schema.tripBookings.tripId, schema.trips.id))
      .leftJoin(
        schema.attachments,
        and(
          eq(schema.attachments.entityTypeId, tripEntityTypeId),
          eq(schema.attachments.entityId, schema.trips.id),
          eq(schema.attachments.role, 'MAIN'),
        ),
      )
      .leftJoin(
        schema.fileObjects,
        eq(schema.attachments.objectId, schema.fileObjects.id),
      )
      .leftJoin(
        schema.chatRooms,
        eq(schema.chatRooms.tripId, schema.trips.id),
      )
      .where(
        and(
          eq(schema.tripBookings.userId, userId),
          isNull(schema.tripBookings.cancelledAt),
        ),
      );

    return rows.map((r) => ({
      bookingId: r.bookingId,
      trip: {
        id: r.tripId,
        name: r.tripName,
        mainImage: r.mainImageBucket
          ? { bucket: r.mainImageBucket, objectKey: r.mainImageKey, url: `/${r.mainImageBucket}/${r.mainImageKey}` }
          : null,
      },
      seats: r.seats,
      total: parseFloat(r.total),
      bookedAt: r.bookedAt,
      chatRoomId: r.chatRoomId,
    }));
  }


  async ensureChatRoomForTrip(
    tx: NodePgDatabase<typeof schema>,
    tripId: number,
    bookingUserId: string,
    isCustomTrip = false,
  ): Promise<{
    chatRoomId: number;
    insertedMembers: { userId: string; role: string }[];
    missingUserIds: string[];
  }> {
    // 1) find/create room
    const existing = await tx.query.chatRooms.findFirst({
      where: eq(schema.chatRooms.tripId, tripId),
      columns: { id: true },
    });
    const chatRoomId = existing
      ? existing.id
      : (
          await tx
            .insert(schema.chatRooms)
            .values({ tripId, isCustomTrip })
            .returning({ id: schema.chatRooms.id })
        )[0].id;
  
    // 2) build candidate list
    const candidates: Array<{ userId: string; role: string }> = [
      { userId: bookingUserId, role: 'Customer' },
    ];
  
    // guide → lookup guides.userId
    const trip = await tx.query.trips.findFirst({
      where: eq(schema.trips.id, tripId),
      columns: { guideId: true },
    });
    if (trip?.guideId) {
      const guide = await tx.query.guides.findFirst({
        where: eq(schema.guides.id, trip.guideId),
        columns: { userId: true },
      });
      if (guide) {
        candidates.push({ userId: guide.userId, role: 'Guide' });
      }
    }
  
    // admins
    const adminRole = await tx.query.roles.findFirst({
      where: (r, { ilike }) => ilike(r.name, '%admin%'),
      columns: { id: true },
    });
    if (adminRole) {
      const admins = await tx.query.users.findMany({
        where: (u, { eq }) => eq(u.roleId, adminRole.id),
        columns: { id: true },
      });
      admins.forEach((a) => candidates.push({ userId: a.id, role: 'Super Admin' }));
    }
  
    // 3) filter out non‐existent users
    const ids = Array.from(new Set(candidates.map((c) => c.userId)));
    const goodRows = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.id, ids));
    const goodSet = new Set(goodRows.map((r) => r.id));
  
    const inserted: { userId: string; role: string }[] = [];
    const missing: string[] = [];
  
    for (const { userId, role } of candidates) {
      if (!goodSet.has(userId)) {
        missing.push(userId);
        continue;
      }
      await tx
        .insert(schema.chatMembers)
        .values({ chatRoomId, userId, role })
        .onConflictDoNothing({
          target: [schema.chatMembers.chatRoomId, schema.chatMembers.userId],
        });
      inserted.push({ userId, role });
    }
  
    return { chatRoomId, insertedMembers: inserted, missingUserIds: missing };
  }

  async bookTrip(userId: string,dto: any) 
  {
    const { tripId, seats, source = 'PREDEFINED_TRIP' } = dto;

    return this.db.transaction(async (tx) => {
      // 1) availability
      const avail = await this.checkTripAvailability(tripId, seats, tx);
      if (!avail.available) throw new BadRequestException(avail.message);
      const trip = avail.trip!;

      // 2) total cost — include meal & transport if present on the trip
      const fullTrip = await tx.query.trips.findFirst({
        where: eq(schema.trips.id, tripId),
        columns: {
          pricePerPerson: true,
          withMeals: true,
          mealPricePerPerson: true,
          withTransport: true,
          transportationPricePerPerson: true,
        },
      });
      const unitPrice = Number(fullTrip?.pricePerPerson ?? trip.pricePerPerson ?? 0);
      const totalPrice = Number((unitPrice * seats).toFixed(2));

      // 3) atomic debit wallet
      const [walletAfter] = await tx
        .update(schema.wallets)
        .set({
          balance: sql`${schema.wallets.balance} - ${totalPrice}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.wallets.userId, userId),
            sql`${schema.wallets.balance} >= ${totalPrice}`,
          ),
        )
        .returning({
          id: schema.wallets.id,
          balance: schema.wallets.balance,
        });
      if (!walletAfter) {
        throw new BadRequestException(
          `Insufficient balance: need ${totalPrice}`,
        );
      }
      const afterBal = Number(walletAfter.balance);
      const beforeBal = afterBal + totalPrice;

      // 4) create order (CONFIRMED)
      const [order] = await tx
        .insert(schema.orders)
        .values({
          userId,
          status: 'CONFIRMED',
          totalAmount: totalPrice.toFixed(2),
        })
        .returning();

      // 5) order item
      const refundPolicyId = await this.getDefaultRefundPolicy(tx);
      await tx.insert(schema.orderItems).values({
        orderId: order.id,
        itemType: 'TRIP',
        itemId: tripId,
        quantity: seats,
        unitPrice: unitPrice.toString(),
        totalPrice: totalPrice.toFixed(2),
        refundPolicyId,
      });

      // 6) trip booking record
    const [booking] =await tx.insert(schema.tripBookings).values({
      tripId,
      userId,
      seats,
      source,
      sourceId: order.id,
      refundPolicyId,
      total: totalPrice.toFixed(2),
    }).returning();

      // 7) ledger
      await tx.insert(schema.userTransactions).values({
        walletId: walletAfter.id,
        amount: (-totalPrice).toFixed(2),
        source: 'BOOKING',
        status: 'POSTED',
        balanceBefore: beforeBal.toFixed(2),
        balanceAfter: afterBal.toFixed(2),
        orderId: order.id,
        note: `Trip#${tripId} booking of ${seats} seat(s)`,
      });

      // 8) payment history
      await tx.insert(schema.paymentHistory).values({
        orderId: order.id,
        paymentAmount: totalPrice.toFixed(2),
        paymentMethod: 'WALLET',
        paymentStatus: 'POSTED',
      });

      const { chatRoomId, insertedMembers, missingUserIds } = await this.ensureChatRoomForTrip(
        tx,
        tripId,
        userId,
      );
      return {
        bookingId: booking.id,
        chatRoomId,
        insertedChatMembers: insertedMembers,
        missingChatMemberUserIds: missingUserIds,
        orderId: order.id,
        totalAmount: totalPrice,
        seats,
      };
    });
  }

  async cancelTripBooking(
    userId: string,
    bookingId: number,
  ): Promise<{ ok: true; refundedAmount: number }> {
    return this.db.transaction(async (tx) => {
      // 1) fetch booking
      const bk = await tx.query.tripBookings.findFirst({
        where: and(
          eq(schema.tripBookings.id, bookingId),
          eq(schema.tripBookings.userId, userId),
          isNull(schema.tripBookings.cancelledAt),
        ),
        columns: {
          id: true,
          tripId: true,
          seats: true,
          total: true,
          sourceId: true,        // orderId
          refundPolicyId: true,
          createdAt: true,
        },
      });
      if (!bk) throw new NotFoundException('Booking not found');
  
      // 2) load trip to branch logic (CUSTOM vs PREDEFINED)
      const trip = await tx.query.trips.findFirst({
        where: eq(schema.trips.id, bk.tripId),
        columns: {
          id: true,
          tripType: true,
          startDate: true,
          endDate: true,
          guideId: true,
          hotelIncluded: true,
        },
        with: { tripHotels: true },
      });
      if (!trip) throw new NotFoundException('Trip not found');

      const todayYMD = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
      if (todayYMD > trip.startDate) {
        throw new BadRequestException('Trip already started; cancellation not allowed after the start date.');
      }
  
      // 3) soft‐cancel booking
      await tx.update(schema.tripBookings)
        .set({ cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.tripBookings.id, bookingId));
  
      // 4) cancel order
      const orderId = bk.sourceId!;
      await tx.update(schema.orders)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(schema.orders.id, orderId));
  
      // 5) refund calc (same as you had)
      const ms = new Date(trip.startDate).getTime() - Date.now();
      const days = ms / (1000 * 60 * 60 * 24);
      let pct = 0;
      if (days > 7) pct = 1;
      else if (days > 5) pct = 0.8;
      else if (days > 3) pct = 0.4;
      const rawTotal = Number(bk.total);
      const refundAmount = parseFloat((rawTotal * pct).toFixed(2));
  
      await tx.update(schema.orderItems)
        .set({ refundAmount: refundAmount.toString() })
        .where(
          and(
            eq(schema.orderItems.orderId, orderId),
            eq(schema.orderItems.itemType, 'TRIP'),
            eq(schema.orderItems.itemId, bk.tripId),
          ),
        );
  
      // 6) credit wallet + ledger + payment history (unchanged)
      const [w] = await tx.update(schema.wallets)
        .set({
          balance: sql`${schema.wallets.balance} + ${refundAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.wallets.userId, userId))
        .returning({ id: schema.wallets.id, balance: schema.wallets.balance });
      if (!w) throw new Error('No wallet');
      const after = Number(w.balance);
      const before = after - refundAmount;
  
      await tx.insert(schema.userTransactions).values({
        walletId: w.id,
        amount: refundAmount.toString(),
        source: 'REFUND',
        status: 'POSTED',
        balanceBefore: before.toString(),
        balanceAfter: after.toString(),
        orderId,
        note: `Refund ${pct * 100}% for trip booking #${bookingId}`,
      });
  
      await tx.insert(schema.paymentHistory).values({
        orderId,
        paymentAmount: refundAmount.toString(),
        paymentMethod: 'WALLET',
        paymentStatus: 'REFUNDED',
      });
  
// --- Chat cleanup ---
        const room = await tx.query.chatRooms.findFirst({
          where: eq(schema.chatRooms.tripId, bk.tripId),
          columns: { id: true, isCustomTrip: true },
        });

        if (room) {
          if (trip.tripType === 'CUSTOM') {
            // One shot: deleting the room cascades to chat_members and chat_messages
            await tx.delete(schema.chatRooms).where(eq(schema.chatRooms.id, room.id));
          } else {
            // Predefined: just remove this user from the room
            await tx.delete(schema.chatMembers).where(
              and(
                eq(schema.chatMembers.chatRoomId, room.id),
                eq(schema.chatMembers.userId, userId),
              ),
            );

            // If room has no members left, remove it
            const [{ cnt }] = await tx
              .select({ cnt: sql<number>`count(*)` })
              .from(schema.chatMembers)
              .where(eq(schema.chatMembers.chatRoomId, room.id));

            if (Number(cnt) === 0) {
              await tx.delete(schema.chatRooms).where(eq(schema.chatRooms.id, room.id));
              // messages will cascade-delete with the room
            }
          }
        }

  
      // 8) **Release resources only for CUSTOM trips**
      if (trip.tripType === 'CUSTOM') {
        // release guide hold for this trip (idempotent)
        if (trip.guideId) {
          await tx.delete(schema.guideAvailability).where(
            and(
              eq(schema.guideAvailability.guideId, trip.guideId),
              eq(schema.guideAvailability.source, 'CUSTOM_TRIP'),
              eq(schema.guideAvailability.sourceId, trip.id),
            ),
          );
        }
  
        // release hotel inventory and reservation (if any)
        const th = trip.tripHotels?.[0];
        if (trip.hotelIncluded && th) {
          // add back the rooms into inventory between startDate..endDate
          await this.releaseHotelRoomInventory(
            th.roomTypeId,
            trip.startDate,
            trip.endDate,
            th.roomsNeeded,
            tx,
          );
  
          await tx.delete(schema.roomReservations).where(
            and(
              eq(schema.roomReservations.roomTypeId, th.roomTypeId),
              eq(schema.roomReservations.source, 'CUSTOM_TRIP'),
              eq(schema.roomReservations.sourceId, trip.id),
            ),
          );
        }
  
        // (optional) if you want to fully retire the custom trip after cancellation:
      }
  
  
      return { ok: true, refundedAmount: refundAmount };
    });
  }
  
  async create(userId: string, createTripDto: CreateTripDto) {
    const {
      name,
      cityId,
      tripType,
      startDate,
      endDate,
      pricePerPerson,
      minPeople,
      maxPeople,
      minSeatsPerUser,
      maxSeatsPerUser,
      withMeals,
      withTransport,
      hotelIncluded,
      mealPricePerPerson = 0,
      transportationPricePerPerson = 0,
      guideId,
      meetLocationAddress,
      meetLocation,
      dropLocationAddress,
      dropLocation,
      mainImageId,
      galleryImageIds,
      tripDays,
      hotels = [],
      tagIds = [],
    } = createTripDto;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      throw new BadRequestException('End date must be after start date');
    }

    // Validate people limits
    if (minPeople > maxPeople) {
      throw new BadRequestException(
        'Minimum people cannot be greater than maximum people',
      );
    }

    if (minSeatsPerUser > maxSeatsPerUser) {
      throw new BadRequestException(
        'Minimum seats per user cannot be greater than maximum seats per user',
      );
    }

    // Validate city
    const city = await this.db.query.cities.findFirst({
      where: eq(schema.cities.id, cityId),
    });
    if (!city) {
      throw new BadRequestException('City not found');
    }

    // Validate guide if provided
    if (guideId) {
      const guide = await this.db.query.guides.findFirst({
        where: eq(schema.guides.id, guideId),
      });
      if (!guide) {
        throw new BadRequestException('Guide not found');
      }
    }

    // Validate hotels if included
    if (hotelIncluded && hotels.length === 0) {
      throw new BadRequestException(
        'Hotels must be specified when hotel is included',
      );
    }

    // Validate that only one hotel and room type is specified
    if (hotels.length > 1) {
      throw new BadRequestException(
        'Only one hotel and room type can be specified per trip',
      );
    }

    for (const hotel of hotels) {
      const hotelExists = await this.db.query.hotels.findFirst({
        where: eq(schema.hotels.id, hotel.hotelId),
      });
      if (!hotelExists) {
        throw new BadRequestException(
          `Hotel with ID ${hotel.hotelId} not found`,
        );
      }

      const roomTypeExists = await this.db.query.hotelRoomTypes.findFirst({
        where: eq(schema.hotelRoomTypes.id, hotel.roomTypeId),
      });
      if (!roomTypeExists) {
        throw new BadRequestException(
          `Room type with ID ${hotel.roomTypeId} not found`,
        );
      }
    }

    // Validate POIs
    for (const day of tripDays) {
      for (const poi of day.pois) {
        const poiExists = await this.db.query.pois.findFirst({
          where: eq(schema.pois.id, poi.poiId),
        });
        if (!poiExists) {
          throw new BadRequestException(`POI with ID ${poi.poiId} not found`);
        }
      }
    }

    // Validate tags
    for (const tagId of tagIds) {
      const tagExists = await this.db.query.tags.findFirst({
        where: eq(schema.tags.id, tagId),
      });
      if (!tagExists) {
        throw new BadRequestException(`Tag with ID ${tagId} not found`);
      }
    }

    return this.db.transaction(async (tx) => {
      // Check guide availability if guide is provided
      if (guideId) {
        const guideAvailability = await this.checkGuideAvailability(
          guideId,
          startDate,
          endDate,
          tx,
        );
        if (!guideAvailability.available) {
          throw new BadRequestException(guideAvailability.message);
        }
      }

      // Check hotel room availability if hotel is included
      let roomType: any = null;
      if (hotelIncluded && hotels.length > 0) {
        const hotel = hotels[0]; // Only one hotel allowed
        const hotelAvailability = await this.checkHotelRoomAvailability(
          hotel.hotelId,
          hotel.roomTypeId,
          startDate,
          endDate,
          hotel.roomsNeeded,
          tx,
        );
        if (!hotelAvailability.available) {
          throw new BadRequestException(hotelAvailability.message);
        }
        roomType = hotelAvailability.roomType;
      }

      // Get or create default refund policy
      const refundPolicyId = await this.getDefaultRefundPolicy(tx);

      const tripInsertData = {
        name: name.trim(),
        cityId,
        createdBy: userId,
        tripType,
        startDate,
        endDate,
        pricePerPerson: pricePerPerson.toString(),
        minPeople,
        maxPeople,
        minSeatsPerUser,
        maxSeatsPerUser,
        withMeals,
        withTransport,
        hotelIncluded,
        mealPricePerPerson: mealPricePerPerson.toString(),
        transportationPricePerPerson: transportationPricePerPerson.toString(),
        guideId,
        meetLocationAdress: meetLocationAddress,
        dropLocationAdress: dropLocationAddress,
        refundPolicyId,

        // ✅ These must always be passed
        meetLocation: sql`ST_SetSRID(ST_MakePoint(${meetLocation?.lon}, ${meetLocation?.lat}), 4326)`,
        dropLocation: sql`ST_SetSRID(ST_MakePoint(${dropLocation?.lon}, ${dropLocation?.lat}), 4326)`,
      };

      const [trip] = await tx
        .insert(schema.trips)
        .values(tripInsertData)
        .returning();

      // Create trip days and POIs
      for (const day of tripDays) {
        const [tripDay] = await tx
          .insert(schema.tripDays)
          .values({
            tripId: trip.id,
            dayNumber: day.dayNumber,
            startTime: day.startTime,
            endTime: day.endTime,
            description: day.description,
          })
          .returning();

        // Create trip POIs for this day
        for (const poi of day.pois) {
          await tx.insert(schema.tripPois).values({
            tripDayId: tripDay.id,
            poiId: poi.poiId,
            visitOrder: poi.visitOrder,
          });
        }
      }

      // Create trip hotels
      for (const hotel of hotels) {
        await tx.insert(schema.tripHotels).values({
          tripId: trip.id,
          hotelId: hotel.hotelId,
          roomTypeId: hotel.roomTypeId,
          roomsNeeded: hotel.roomsNeeded,
        });
      }

      // Create trip tags
      for (const tagId of tagIds) {
        await tx.insert(schema.tripToTags).values({
          tripId: trip.id,
          tagId,
        });
      }

      // Create guide availability record if guide is provided
      if (guideId) {
        await tx.insert(schema.guideAvailability).values({
          guideId,
          startDate,
          endDate,
          source: tripType === 'CUSTOM' ? 'CUSTOM_TRIP' : 'PREDEFINED_TRIP',
          sourceId : trip.id,
        });
      }

      // Create room reservation and update inventory if hotel is included
      if (hotelIncluded && hotels.length > 0) {
        const hotel = hotels[0];

        // Update hotel room inventory
        await this.updateHotelRoomInventory(
          hotel.hotelId,
          hotel.roomTypeId,
          startDate,
          endDate,
          hotel.roomsNeeded,
          tx,
        );

        // Create room reservation for predefined trip
        await tx.insert(schema.roomReservations).values({
          roomTypeId: hotel.roomTypeId,
          checkInDate: startDate,
          checkOutDate: endDate,
          roomsBooked: hotel.roomsNeeded,
          source: tripType === 'CUSTOM' ? 'CUSTOM_TRIP' : 'PREDEFINED_TRIP',
          sourceId: trip.id,
          refundPolicyId,
        });
      }

      // Save attachments (main and gallery images)
      const tripEntityTypeId = await this.getTripEntityTypeId(tx);
      if (tripEntityTypeId && trip) {
        if (mainImageId) {
          await tx.insert(schema.attachments).values({
            objectId: mainImageId,
            entityTypeId: tripEntityTypeId,
            entityId: trip.id,
            role: 'MAIN',
          });
        }
        if (galleryImageIds && Array.isArray(galleryImageIds)) {
          for (const imgId of galleryImageIds) {
            await tx.insert(schema.attachments).values({
              objectId: imgId,
              entityTypeId: tripEntityTypeId,
              entityId: trip.id,
              role: 'GALLERY',
            });
          }
        }
      }

      return trip;
    });
  }

  async update(id: number, dto: UpdateTripDto) {
    // Load current + relations you need to reconcile
    const current = await this.db.query.trips.findFirst({
      where: eq(schema.trips.id, id),
      with: {
        tripHotels: true,
        tripDays: { with: { tripPois: true } },
        tripToTags: true,
      },
    });
    if (!current) throw new NotFoundException('Trip not found');
  
    return this.db.transaction(async (tx) => {
      // ---------- Resolve “effective” new values (fallback to current) ----------
      const name = dto.name ?? current.name;
      const cityId = dto.cityId ?? current.cityId!;
      const tripType = dto.tripType ?? current.tripType;
      const startDate = dto.startDate ?? (current as any).startDate;
      const endDate = dto.endDate ?? (current as any).endDate;
      const withMeals = dto.withMeals ?? (current as any).withMeals;
      const withTransport = dto.withTransport ?? (current as any).withTransport;
      const hotelIncluded = dto.hotelIncluded ?? (current as any).hotelIncluded;
      const guideId = dto.guideId ?? (current as any).guideId ?? null;
      const minPeople = dto.minPeople ?? (current as any).minPeople ?? 1;
      const maxPeople = dto.maxPeople ?? (current as any).maxPeople ?? 1;
      const minSeatsPerUser = dto.minSeatsPerUser ?? (current as any).minSeatsPerUser ?? 1;
      const maxSeatsPerUser = dto.maxSeatsPerUser ?? (current as any).maxSeatsPerUser ?? 1;
  
      // Optional meet/drop
      const meetLocationAddress = dto.meetLocationAddress ?? (current as any).meetLocationAdress ?? null;
      const dropLocationAddress = dto.dropLocationAddress ?? (current as any).dropLocationAdress ?? null;
  
      // ---------- (A) Validate basics ----------
      if (new Date(startDate) >= new Date(endDate)) {
        throw new BadRequestException('End date must be after start date');
      }
      if (minPeople > maxPeople) throw new BadRequestException('minPeople > maxPeople');
      if (minSeatsPerUser > maxSeatsPerUser) throw new BadRequestException('minSeatsPerUser > maxSeatsPerUser');
  
      const city = await tx.query.cities.findFirst({ where: eq(schema.cities.id, cityId) });
      if (!city) throw new BadRequestException('City not found');
  
      if (guideId) {
        const guide = await tx.query.guides.findFirst({ where: eq(schema.guides.id, guideId) });
        if (!guide) throw new BadRequestException('Guide not found');
      }
  
      // ---------- (B) Recompute price (no admin-typed price) ----------
      // Use dto.tripDays/dto.pois if provided; else reconstruct from DB
      const newDays = dto.tripDays?.length
        ? dto.tripDays
        : (current.tripDays || []).map(d => ({
            dayNumber: d.dayNumber,
            startTime: (d as any).startTime,
            endTime: (d as any).endTime,
            description: d.description || '',
            pois: (d.tripPois || [])
              .sort((a,b)=> a.visitOrder - b.visitOrder)
              .map(p => ({ poiId: p.poiId, visitOrder: p.visitOrder })),
          }));
  
      const flatPois = newDays
        .flatMap(d => d.pois.map(p => ({ dayNumber: d.dayNumber, visitOrder: p.visitOrder, poiId: p.poiId })))
        .sort((a,b)=> a.dayNumber - b.dayNumber || a.visitOrder - b.visitOrder);
  
      const calcDraft: any = {
        cityId,
        startDate,
        endDate,
        people: Math.max(1, Number(minPeople)),
        withMeals,
        withTransport,
        hotelIncluded,
        includeGuide: !!guideId,
        guideId: guideId ?? undefined,
        pois: flatPois,
      };
  
      // Hotel in draft if included
      const curTH = (current.tripHotels ?? [])[0];
      const dtoHotel = dto.hotels?.[0];
      if (hotelIncluded) {
        const roomTypeId = dtoHotel?.roomTypeId ?? curTH?.roomTypeId;
        const roomsRequested = dtoHotel?.roomsNeeded ?? curTH?.roomsNeeded ?? 1;
        if (roomTypeId) calcDraft.hotels = [{ roomTypeId, roomsRequested }];
      }
  
      const quote = await this.calculateCustomTripPrice(calcDraft);
      const pricePerPerson = quote.perPerson;                        // total per traveler
      const mealPricePerPerson = withMeals ? quote.perPersonMeals : 0;
      const transportationPricePerPerson = withTransport ? quote.perPersonTransport : 0;
  
    // ---------- (C) GUIDE availability (tagged by trip) ----------
    const hadGuideBefore = !!current.guideId;
    const hasGuideNow = !!guideId;
    const guideChanged = guideId !== (current as any).guideId;
    const datesChanged = startDate !== (current as any).startDate || endDate !== (current as any).endDate;

    if (!hasGuideNow && hadGuideBefore) {
      // guide unset → remove previous hold(s) for this trip
      await tx.delete(schema.guideAvailability).where(
        and(
          eq(schema.guideAvailability.guideId, (current as any).guideId),
          eq(schema.guideAvailability.source, 'PREDEFINED_TRIP'),
          eq(schema.guideAvailability.sourceId, id),
        ),
      );
    }

    if (hasGuideNow) {
      // check availability, but ignore our own current hold for this trip
      const avail = await this.checkGuideAvailability(
        guideId!, startDate, endDate, tx,
        { skipSource: 'PREDEFINED_TRIP', skipSourceId: id },
      );
      if (!avail.available) throw new BadRequestException(avail.message);

      // idempotent replace: delete our prior hold for this trip (if any), then insert new range
      await tx.delete(schema.guideAvailability).where(
        and(
          eq(schema.guideAvailability.guideId, guideId!),
          eq(schema.guideAvailability.source, 'PREDEFINED_TRIP'),
          eq(schema.guideAvailability.sourceId, id),
        ),
      );
      await tx.insert(schema.guideAvailability).values({
        guideId: guideId!,
        startDate,
        endDate,
        source: 'PREDEFINED_TRIP',
        sourceId: id, // the trip id
      });
    }

      // ---------- (D) HOTEL inventory/reservations ----------
      const beforeTH = (current.tripHotels ?? [])[0]; // may be undefined
      const afterHotel = hotelIncluded
        ? (dto.hotels?.[0] ?? (beforeTH
            ? { hotelId: beforeTH.hotelId, roomTypeId: beforeTH.roomTypeId, roomsNeeded: beforeTH.roomsNeeded }
            : undefined))
        : undefined;
  
      const hotelChanged =
        Boolean(hotelIncluded) !== Boolean((current as any).hotelIncluded) ||
        (beforeTH?.roomTypeId ?? null) !== (afterHotel?.roomTypeId ?? null) ||
        (beforeTH?.roomsNeeded ?? null) !== (afterHotel?.roomsNeeded ?? null) ||
        datesChanged;
  
      if (hotelChanged) {
        // release previous
        if ((current as any).hotelIncluded && beforeTH) {
          await this.releaseHotelRoomInventory(
            beforeTH.roomTypeId,
            (current as any).startDate,
            (current as any).endDate,
            beforeTH.roomsNeeded,
            tx,
          );
          await tx.delete(schema.roomReservations).where(
            and(
              eq(schema.roomReservations.roomTypeId, beforeTH.roomTypeId),
              eq(schema.roomReservations.checkInDate, (current as any).startDate),
              eq(schema.roomReservations.checkOutDate, (current as any).endDate),
              eq(schema.roomReservations.source, 'PREDEFINED_TRIP'),
              eq(schema.roomReservations.sourceId, id),
            ),
          );
          await tx.delete(schema.tripHotels).where(
            and(eq(schema.tripHotels.tripId, id), eq(schema.tripHotels.roomTypeId, beforeTH.roomTypeId)),
          );
        }
  
        // reserve next
        if (hotelIncluded && afterHotel) {
          const avail = await this.checkHotelRoomAvailability(
            afterHotel.hotelId, afterHotel.roomTypeId, startDate, endDate, afterHotel.roomsNeeded, tx,
          );
          if (!avail.available) throw new BadRequestException(avail.message);
  
          await this.updateHotelRoomInventory(
            afterHotel.hotelId, afterHotel.roomTypeId, startDate, endDate, afterHotel.roomsNeeded, tx,
          );
  
          await tx.insert(schema.tripHotels).values({
            tripId: id,
            hotelId: afterHotel.hotelId,
            roomTypeId: afterHotel.roomTypeId,
            roomsNeeded: afterHotel.roomsNeeded,
          }).onConflictDoUpdate({
            target: [schema.tripHotels.tripId, schema.tripHotels.hotelId, schema.tripHotels.roomTypeId],
            set: { roomsNeeded: afterHotel.roomsNeeded, updatedAt: new Date() },
          });
  
          const refundPolicyId = current.refundPolicyId ?? (await this.getDefaultRefundPolicy(tx));
          await tx.insert(schema.roomReservations).values({
            roomTypeId: afterHotel.roomTypeId,
            checkInDate: startDate,
            checkOutDate: endDate,
            roomsBooked: afterHotel.roomsNeeded,
            source: 'PREDEFINED_TRIP',
            sourceId: id,
            refundPolicyId,
          });
        }
      }
  
      // ---------- (E) Replace trip days + POIs if provided ----------
      if (dto.tripDays?.length) {
        // remove all old days (cascade deletes trip_pois)
        await tx.delete(schema.tripDays).where(eq(schema.tripDays.tripId, id));
  
        for (const d of dto.tripDays) {
          const [td] = await tx.insert(schema.tripDays).values({
            tripId: id,
            dayNumber: d.dayNumber,
            startTime: d.startTime,
            endTime: d.endTime,
            description: d.description ?? '',
          }).returning({ id: schema.tripDays.id });
  
          for (const p of (d.pois || [])) {
            await tx.insert(schema.tripPois).values({
              tripDayId: td.id,
              poiId: p.poiId,
              visitOrder: p.visitOrder,
            });
          }
        }
      }
  
      // ---------- (F) Replace tags if provided ----------
      if (dto.tagIds) {
        await tx.delete(schema.tripToTags).where(eq(schema.tripToTags.tripId, id));
        for (const tagId of dto.tagIds) {
          await tx.insert(schema.tripToTags).values({ tripId: id, tagId });
        }
      }
  
      // ---------- (G) Replace attachments if provided ----------
      const tripEntityTypeId = await this.getTripEntityTypeId(tx);
      if (tripEntityTypeId) {
        if (dto.mainImageId !== undefined) {
          // delete old MAIN, insert new (if not nullish)
          await tx.delete(schema.attachments).where(
            and(
              eq(schema.attachments.entityTypeId, tripEntityTypeId),
              eq(schema.attachments.entityId, id),
              eq(schema.attachments.role, 'MAIN'),
            ),
          );
          if (dto.mainImageId) {
            await tx.insert(schema.attachments).values({
              objectId: dto.mainImageId,
              entityTypeId: tripEntityTypeId,
              entityId: id,
              role: 'MAIN',
            });
          }
        }
        if (dto.galleryImageIds) {
          // replace GALLERY entirely
          await tx.delete(schema.attachments).where(
            and(
              eq(schema.attachments.entityTypeId, tripEntityTypeId),
              eq(schema.attachments.entityId, id),
              eq(schema.attachments.role, 'GALLERY'),
            ),
          );
          for (const imgId of dto.galleryImageIds) {
            await tx.insert(schema.attachments).values({
              objectId: imgId,
              entityTypeId: tripEntityTypeId,
              entityId: id,
              role: 'GALLERY',
            });
          }
        }
      }
  
      // ---------- (H) Final trip row update (with computed prices) ----------
      const updateData: any = {
        name,
        cityId,
        tripType,
        startDate,
        endDate,
        minPeople,
        maxPeople,
        minSeatsPerUser,
        maxSeatsPerUser,
        withMeals,
        withTransport,
        hotelIncluded,
        guideId,
        pricePerPerson: pricePerPerson.toString(),
        mealPricePerPerson: mealPricePerPerson.toString(),
        transportationPricePerPerson: transportationPricePerPerson.toString(),
        updatedAt: new Date(),
      };
  
      if (dto.meetLocation) {
        updateData.meetLocation = sql`ST_SetSRID(ST_MakePoint(${dto.meetLocation.lon}, ${dto.meetLocation.lat}), 4326)`;
      }
      if (dto.dropLocation) {
        updateData.dropLocation = sql`ST_SetSRID(ST_MakePoint(${dto.dropLocation.lon}, ${dto.dropLocation.lat}), 4326)`;
      }
      if (meetLocationAddress !== null) updateData.meetLocationAdress = meetLocationAddress ?? null;
      if (dropLocationAddress !== null) updateData.dropLocationAdress = dropLocationAddress ?? null;
  
      await tx.update(schema.trips).set(updateData).where(eq(schema.trips.id, id));
  
      return this.findOne(id);
    });
  }
  

  async remove(id: number) {
    return this.db.transaction(async (tx) => {
      // Load only what we need
      const trip = await tx.query.trips.findFirst({
        where: eq(schema.trips.id, id),
        columns: {
          id: true,
          startDate: true,
          endDate: true,
          guideId: true,
          tripType: true,
        },
        with: {
          tripHotels: {
            columns: {
              hotelId: true,
              roomTypeId: true,
              roomsNeeded: true,
            },
          },
        },
      });
      if (!trip) throw new NotFoundException('Trip not found');
  
      const { startDate, endDate } = trip;
      const source =
        trip.tripType === 'PREDEFINED' ? 'PREDEFINED_TRIP' : 'CUSTOM_TRIP';
  
      // --- 1) Release hotel inventory + delete matching reservations
      for (const th of trip.tripHotels ?? []) {
        // Decrement your per-day inventory
        await this.releaseHotelRoomInventory(
          th.roomTypeId,
          startDate,
          endDate,
          th.roomsNeeded,
          tx,
        );
  
        // Delete the exact reservation rows this trip created (date+roomType)
        await tx
          .delete(schema.roomReservations)
          .where(
            and(
              eq(schema.roomReservations.roomTypeId, th.roomTypeId),
              eq(schema.roomReservations.checkInDate, startDate),
              eq(schema.roomReservations.checkOutDate, endDate),
              // If you have source/sourceId columns on room_reservations, keep these two lines:
              eq(schema.roomReservations.source, source),
              eq(schema.roomReservations.sourceId, id),
            ),
          );
      }
  
      // --- 2) Release guide availability hold
      if (trip.guideId) {
        // If you added source/sourceId to guide_availability (recommended)
        await tx
          .delete(schema.guideAvailability)
          .where(
            and(
              eq(schema.guideAvailability.guideId, trip.guideId),
              eq(schema.guideAvailability.startDate, startDate),
              eq(schema.guideAvailability.endDate, endDate),
              // keep these if columns exist:
              eq(schema.guideAvailability.source, source),
              eq(schema.guideAvailability.sourceId, id),
            ),
          );
        // If you DON'T have source/sourceId on guide_availability,
        // the 3 conditions (guideId + exact start/end) are enough.
      }
  
      // --- 3) Delete the trip (CASCADE will remove chat room/members/messages, days, pois, trip_hotels, tags, etc.)
      await tx.delete(schema.trips).where(eq(schema.trips.id, id));
  
      return { ok: true, deletedTripId: id };
    });
  }
  

  async getHotelsByCity(cityId: number) {
    const hotels = await this.db.query.hotels.findMany({
      where: and(
        eq(schema.hotels.cityId, cityId),
        eq(schema.hotels.isActive, true),
      ),
      with: {
        roomTypes: {
          where: eq(schema.hotelRoomTypes.isActive, true),
          columns: {
            id: true,
            label: true,
            description: true,
            capacity: true,
            totalRooms: true,
            baseNightlyRate: true,
            isActive: true,
          },
        },
      },
      columns: {
        id: true,
        name: true,
        stars: true,
        address: true,
        currency: true,
      },
    });

    return hotels;
  }

  async calculateCustomTripPrice(draft: CalculateTripDraftDto): Promise<TripPriceQuote> {
    const people = Number(draft.people || 0);
    if (people <= 0) throw new BadRequestException('people must be > 0');
  
    const nights = this.diffNights(draft.startDate, draft.endDate);
  
    // ---- City + latest meal/transport rates
    const city = await this.db.query.cities.findFirst({
      where: eq(schema.cities.id, draft.cityId),
      columns: { id: true, avgMealPrice: true }, // ✅ booleans, not expressions
    });
    if (!city) throw new BadRequestException('City not found');
    
    // Latest meal price (fallback to cities.avgMealPrice)
    const latestMeal = await this.db.query.cityMealPrices.findMany({
      where: eq(schema.cityMealPrices.cityId, draft.cityId),
      columns: { mealPricePerPerson: true, createdAt: true }, // ✅ booleans
      orderBy: desc(schema.cityMealPrices.createdAt),
      limit: 1,
    });
    const mealPerPerson = latestMeal.length
      ? Number(latestMeal[0].mealPricePerPerson ?? 0)
      : Number(city.avgMealPrice ?? 0);
    
    // Latest transport rate per km
    const latestRate = await this.db.query.distanceRates.findMany({
      where: eq(schema.distanceRates.cityId, draft.cityId),
      columns: { transportRatePerKm: true, createdAt: true }, // ✅ booleans
      orderBy: desc(schema.distanceRates.createdAt),
      limit: 1,
    });
    const transportRatePerKm = latestRate.length
      ? Number(latestRate[0].transportRatePerKm ?? 0)
      : 0;
    // ---- POIs (discount or base price) – treated per person
    const poiIds = draft.pois?.map(p => p.poiId) ?? [];
    const pois = poiIds.length
      ? await this.db
          .select({
            id: schema.pois.id,
            price: schema.pois.price,
            discountPrice: schema.pois.discountPrice,
          })
          .from(schema.pois)
          .where(inArray(schema.pois.id, poiIds))
      : [];
    const poiMap = new Map(pois.map(p => [p.id, p]));
    const poiTotal = (draft.pois ?? []).reduce((sum, p) => {
      const row = poiMap.get(p.poiId);
      if (!row) return sum;
      const base = Number(row.price ?? 0);
      const discVal = row.discountPrice == null ? null : Number(row.discountPrice);
      const unit = discVal != null && !Number.isNaN(discVal) && discVal >= 0 && discVal < base ? discVal : base;
      return sum + unit * people;
    }, 0);
  
    // ---- Lodging
    let lodging = 0;
    const warnings: string[] = [];
    if (draft.hotelIncluded && (draft.hotels?.length ?? 0) > 0) {
      const first = draft.hotels![0]; // your flow: one room type
      const roomType = await this.db.query.hotelRoomTypes.findFirst({
        where: eq(schema.hotelRoomTypes.id, first.roomTypeId),
        columns: {
          id: true,
          baseNightlyRate: true, // numeric -> string in PG, convert with Number(...)
          capacity: true,        // smallint
          totalRooms: true,      // smallint (optional to use)
          isActive: true,
        },
      });
      if (!roomType) throw new BadRequestException('Room type not found');
      if (roomType.isActive === false) throw new BadRequestException('Room type is not active');

      const capacity = Number(roomType.capacity ?? 1);
      const minRoomsByCapacity = Math.ceil(people / Math.max(1, capacity));
      const requested = Number(first.roomsRequested || 0);
      const localRoomsUsed = Math.max(requested, minRoomsByCapacity);
      if (localRoomsUsed > requested) {
        warnings.push(`Rooms increased to ${localRoomsUsed} to cover ${people} people (capacity ${capacity}/room).`);
      }

      lodging = Number(roomType.baseNightlyRate ?? 0) * localRoomsUsed * nights;
    }
  
    // ---- Meals
    const meals = draft.withMeals ? mealPerPerson * people * nights : 0;
  
    // ---- Transport
// ---- Transport: auto-compute distance from draft POIs (per day), then rate from distanceRates
let distanceKm = 0;

if (draft.withTransport && (draft.pois?.length ?? 0) > 0) {
  // 1) fetch coords for all used POIs
  const poiIds = Array.from(new Set((draft.pois ?? []).map((p: any) => Number(p.poiId)))) as number[];
  // Use ST_X/ST_Y to read lon/lat from geometry
  const coordRows = await this.db
    .select({
      id: schema.pois.id,
      lon: sql<number>`ST_X(${schema.pois.location})`,
      lat: sql<number>`ST_Y(${schema.pois.location})`,
    })
    .from(schema.pois)
    .where(inArray(schema.pois.id, poiIds));

  const coordMap = new Map(coordRows.map(r => [r.id, { lon: Number(r.lon), lat: Number(r.lat) }]));

  // 2) group by day, sort by visitOrder, sum day path lengths
  const byDay = new Map<number, Array<{ poiId: number; visitOrder: number }>>();
  for (const p of draft.pois) {
    if (!byDay.has(p.dayNumber)) byDay.set(p.dayNumber, []);
    byDay.get(p.dayNumber)!.push({ poiId: p.poiId, visitOrder: p.visitOrder });
  }

  for (const [, list] of byDay) {
    list.sort((a, b) => a.visitOrder - b.visitOrder);
    for (let i = 1; i < list.length; i++) {
      const a = coordMap.get(list[i - 1].poiId);
      const b = coordMap.get(list[i].poiId);
      if (!a || !b) continue;
      distanceKm += this.haversineKm(a, b);
    }
  }
}

const transport = draft.withTransport ? distanceKm * transportRatePerKm : 0;

  
    // ---- Guide (optional) — pricePerDay × nights; shows in breakdown and naturally divides via perPerson
    let guide = 0;
    if (draft.includeGuide && draft.guideId) {
      const g = await this.db.query.guides.findFirst({
        where: eq(schema.guides.id, draft.guideId),
        columns: {
           pricePerDay: true,
           cityId: true 
          },
      });
      if (!g) throw new BadRequestException('Guide not found');
      // (optional) ensure guide is in same city:
      // if (g.cityId !== draft.cityId) warnings.push('Guide is from a different city; pricing applied anyway.');
      guide = Number(g.pricePerDay ?? 0) * nights;
    }
  
    // ---- Total
    const total = poiTotal + lodging + meals + transport + guide;
    const perPerson          = Number((total / people).toFixed(2));
    const perPersonPoi       = Number((poiTotal / people).toFixed(2));
    const perPersonMeals     = Number((meals / people).toFixed(2));
    const perPersonTransport = Number((transport / people).toFixed(2));
    
    return {
      total: Number(total.toFixed(2)),
      perPerson,                             // total per traveler (includes lodging & guide)
      perPersonPoi,                          // POIs per person
      perPersonMeals,                        // meals per person
      perPersonTransport,                    // transport per person
      nights,
      distanceKm: Number(distanceKm.toFixed(2)),
      breakdown: {
        poi: Number(poiTotal.toFixed(2)),
        lodging: Number(lodging.toFixed(2)),
        meals: Number(meals.toFixed(2)),
        transport: Number(transport.toFixed(2)),
        guide: Number(guide.toFixed(2)),
      },
      warnings: warnings.length ? warnings : undefined,
    };
  }


  async createCustomTripAndOrder(userId: string, draft: ConfirmDraft): Promise<CreateCustomTripResult> {
    // 1) Recalculate price (server-authoritative)
    const quote = await this.calculateCustomTripPrice(draft);
    const people = draft.people;
  
    // 2) Figure out lodging specifics (roomsUsed, roomType, hotelId)
    let roomsUsed = 0;
    let roomTypeRow: RoomTypeSlice | null = null;
  
    if (draft.hotelIncluded && (draft.hotels?.length ?? 0) > 0) {
      const first = draft.hotels![0];
      roomTypeRow = (await this.db.query.hotelRoomTypes.findFirst({
        where: eq(schema.hotelRoomTypes.id, first.roomTypeId),
        columns:{
          id:true,
          hotelId:true,
          baseNightlyRate:true,
          capacity:true,
          isActive:true,
        }
      })) as RoomTypeSlice | null;
      if (!roomTypeRow) throw new BadRequestException('Room type not found');
      if (roomTypeRow.isActive === false) throw new BadRequestException('Room type is not active');
  
      const capacity = Number(roomTypeRow.capacity ?? 1);
      const minRoomsByCapacity = Math.ceil(people / Math.max(1, capacity));
      const requested = Number(first.roomsRequested || 0);
      roomsUsed = Math.max(requested, minRoomsByCapacity);
    }
  
    // 3) Derive meet/drop if not provided (fallback to first & last POI coords)
    let meetGeomSql = draft.meetLocation
      ? sql`ST_SetSRID(ST_MakePoint(${draft.meetLocation.lon}, ${draft.meetLocation.lat}), 4326)`
      : undefined;
    let dropGeomSql = draft.dropLocation
      ? sql`ST_SetSRID(ST_MakePoint(${draft.dropLocation.lon}, ${draft.dropLocation.lat}), 4326)`
      : undefined;
  
    if (!meetGeomSql || !dropGeomSql) {
      const allPoiIds = Array.from(new Set((draft.pois ?? []).map((p: any) => Number(p.poiId)))) as number[];
      if (allPoiIds.length) {
        const coordRows = await this.db
          .select({
            id: schema.pois.id,
            lon: sql<number>`ST_X(${schema.pois.location})`,
            lat: sql<number>`ST_Y(${schema.pois.location})`,
          })
          .from(schema.pois)
          .where(inArray(schema.pois.id, allPoiIds));
  
        const coordMap = new Map(coordRows.map(r => [r.id, { lon: Number(r.lon), lat: Number(r.lat) }]));
        // first by (min dayNumber, then min visitOrder)
        const firstPoi = [...draft.pois].sort((a,b)=> a.dayNumber - b.dayNumber || a.visitOrder - b.visitOrder)[0];
        const lastPoi  = [...draft.pois].sort((a,b)=> b.dayNumber - a.dayNumber || b.visitOrder - a.visitOrder)[0];
        if (!meetGeomSql && firstPoi) {
          const c = coordMap.get(firstPoi.poiId);
          if (c) meetGeomSql = sql`ST_SetSRID(ST_MakePoint(${c.lon}, ${c.lat}), 4326)`;
        }
        if (!dropGeomSql && lastPoi) {
          const c = coordMap.get(lastPoi.poiId);
          if (c) dropGeomSql = sql`ST_SetSRID(ST_MakePoint(${c.lon}, ${c.lat}), 4326)`;
        }
      }
    }
    if (!meetGeomSql || !dropGeomSql) {
      throw new BadRequestException('meet/drop location is required (provide in body or ensure POIs exist with coordinates).');
    }
  
    // 4) Persist everything atomically
    const now = new Date();
    return this.db.transaction(async (tx) => {
      // Refund policy
      const refundPolicyId = await this.getDefaultRefundPolicy(tx);
  
      // If including a guide, optionally set on trip
      const guideId = draft.includeGuide ? draft.guideId ?? null : null;
  
      // Compute per-person extras for storing on trip
      // (meals stored per person for full trip; transport per person; pricePerPerson = total/people)
      const perPerson = quote.perPerson;
      const mealsPerPersonForTrip = draft.withMeals ? Number((quote.breakdown.meals / people).toFixed(2)) : 0;
      const transportPerPersonForTrip = draft.withTransport ? Number((quote.breakdown.transport / people).toFixed(2)) : 0;
  
      // Insert Trip
      const [trip] = await tx.insert(schema.trips).values({
        name: (draft.name ?? `Custom Trip – City#${draft.cityId} – ${draft.startDate}`),
        cityId: draft.cityId,
        createdBy: userId,
        tripType: 'CUSTOM',
        startDate: draft.startDate,
        endDate: draft.endDate,
        refundPolicyId,
        pricePerPerson: perPerson.toFixed(2),
        minPeople: people,
        maxPeople: people,
        minSeatsPerUser: 1,
        maxSeatsPerUser: people,
        withMeals: draft.withMeals,
        withTransport: draft.withTransport,
        hotelIncluded: !!draft.hotelIncluded,
        mealPricePerPerson: mealsPerPersonForTrip.toFixed(2),
        transportationPricePerPerson: transportPerPersonForTrip.toFixed(2),
        guideId: guideId ?? undefined,
        meetLocationAdress: draft.meetLocationAddress ?? null,
        dropLocationAdress: draft.dropLocationAddress ?? null,
        meetLocation: meetGeomSql!,
        dropLocation: dropGeomSql!,
        createdAt: now,
        updatedAt: now,
      }).returning();
  
      if (!trip) throw new BadRequestException('Failed to create trip');
  
      // Trip days
      const dayNumbers = [...new Set((draft.pois ?? []).map(p => p.dayNumber))].sort((a,b)=>a-b);
      const dayRows = await tx.insert(schema.tripDays).values(
        dayNumbers.map(dn => ({
          tripId: trip.id,
          dayNumber: dn,
          // You could compute start/end time from POIs later if you track durations
        }))
      ).returning({ id: schema.tripDays.id, dayNumber: schema.tripDays.dayNumber });
  
      const dayIdByNumber = new Map(dayRows.map(d => [d.dayNumber, d.id]));
  
      // Trip POIs
      if (draft.pois?.length) {
        await tx.insert(schema.tripPois).values(
          draft.pois.map(p => ({
            tripDayId: dayIdByNumber.get(p.dayNumber)!,
            poiId: p.poiId,
            visitOrder: p.visitOrder,
          }))
        );
      }
  
      // Trip hotel (+ inventory + reservation)
      if (draft.hotelIncluded && roomsUsed > 0 && roomTypeRow) {
        await tx.insert(schema.tripHotels).values({
          tripId: trip.id,
          hotelId: roomTypeRow.hotelId!,
          roomTypeId: roomTypeRow.id!,
          roomsNeeded: roomsUsed,
        });
  
        // Update inventory for each night + create reservation record
        await this.updateHotelRoomInventory(
          roomTypeRow.hotelId!,
          roomTypeRow.id,
          draft.startDate,
          draft.endDate,
          roomsUsed,
          tx,
        );
  
        await tx.insert(schema.roomReservations).values({
          roomTypeId: roomTypeRow.id,
          checkInDate: draft.startDate,
          checkOutDate: draft.endDate,
          roomsBooked: roomsUsed,
          source: 'CUSTOM_TRIP', // ensure your enum includes this
          sourceId: trip.id,
          refundPolicyId,
          userId, // optional, but useful traceability
        });
      }
  
      // If a guide is included, you may want to block their availability window:
      if (guideId) {
        await tx.insert(schema.guideAvailability).values({
          guideId,
          startDate: draft.startDate,
          endDate: draft.endDate,
        });
      }
  
      // Create an Order (PENDING by default; you can charge later)
      const [order] = await tx.insert(schema.orders).values({
        userId,
        status: 'PENDING',
        totalAmount: quote.total.toFixed(2),
        createdAt: now,
        updatedAt: now,
      }).returning();
  
      if (!order) throw new BadRequestException('Failed to create order');
  
      // Create Trip Booking (for the full party)
      const [booking] = await tx.insert(schema.tripBookings).values({
        tripType: 'CUSTOM',
        tripId: trip.id,
        refundPolicyId,
        userId,
        seats: people,
        source: 'CUSTOM_TRIP', // ensure in reservationSourceEnum
        sourceId: order.id,
        total: quote.total.toFixed(2),
      }).returning();
  
      if (!booking) throw new BadRequestException('Failed to create booking');
  
      // Ensure chat room (customer + guide + admins)
      // (Minor tweak: allow marking it as custom)
      const { chatRoomId, insertedMembers } = await this.ensureChatRoomForTrip(
        tx,
        trip.id,
        userId,
        /* isCustom */ true,
      );
  
      return {
        tripId: trip.id,
        orderId: order.id,
        bookingId: booking.id,
        chatRoomId,
        insertedChatMembers: insertedMembers,
        price: quote,
      };
    });
  }

  private async buildMeetDropGeomFromDraftOrPOIs(tx: NodePgDatabase<typeof schema>, draft: any) {
    let meetGeomSql = draft.meetLocation
      ? sql`ST_SetSRID(ST_MakePoint(${draft.meetLocation.lon}, ${draft.meetLocation.lat}), 4326)`
      : undefined;
    let dropGeomSql = draft.dropLocation
      ? sql`ST_SetSRID(ST_MakePoint(${draft.dropLocation.lon}, ${draft.dropLocation.lat}), 4326)`
      : undefined;

    if (!meetGeomSql || !dropGeomSql) {
      const allPoiIds = Array.from(new Set((draft.pois ?? []).map((p: any) => Number(p.poiId)))) as number[];
      if (allPoiIds.length) {
        const coordRows = await tx
          .select({ id: schema.pois.id, lon: sql<number>`ST_X(${schema.pois.location})`, lat: sql<number>`ST_Y(${schema.pois.location})` })
          .from(schema.pois)
          .where((p) => inArray(p.id, allPoiIds));
        const coordMap = new Map(coordRows.map((r: any) => [r.id, { lon: Number(r.lon), lat: Number(r.lat) }]));
        const firstPoi = [...(draft.pois ?? [])].sort((a: any, b: any) => a.dayNumber - b.dayNumber || a.visitOrder - b.visitOrder)[0];
        const lastPoi = [...(draft.pois ?? [])].sort((a: any, b: any) => b.dayNumber - a.dayNumber || b.visitOrder - a.visitOrder)[0];
        if (!meetGeomSql && firstPoi) {
          const c = coordMap.get(firstPoi.poiId);
          if (c) meetGeomSql = sql`ST_SetSRID(ST_MakePoint(${c.lon}, ${c.lat}), 4326)`;
        }
        if (!dropGeomSql && lastPoi) {
          const c = coordMap.get(lastPoi.poiId);
          if (c) dropGeomSql = sql`ST_SetSRID(ST_MakePoint(${c.lon}, ${c.lat}), 4326)`;
        }
      }
    }

    if (!meetGeomSql || !dropGeomSql) {
      throw new BadRequestException('meet/drop location is required (provide in body or ensure POIs exist with coordinates).');
    }

    return { meetGeomSql, dropGeomSql };
  }


  async createTripFromDraftUnified(
    userId: string,
    draft: import('./dto/calc-trip.dto').CalculateTripDraftDto & {
      name?: string;
      meetLocation?: { lon:number; lat:number; locationAddress?: string };
      dropLocation?: { lon:number; lat:number; locationAddress?: string };
      meetLocationAddress?: string;
      dropLocationAddress?: string;
    },
    tripType: TripTypeLiteral,
    opts?: {
      bookNow?: boolean; // CUSTOM: true, PREDEFINED: false
      seatsOverride?: number;
      seatPolicy?: { minSeatsPerUser: number; maxSeatsPerUser: number; minPeople: number; maxPeople: number };
    }
  ) {
    const now = new Date();
    const quote = await this.calculateCustomTripPrice(draft);
    const people = draft.people;
    const seats = opts?.seatsOverride ?? people;
  
    return this.db.transaction(async (tx) => {
      const refundPolicyId = await this.getDefaultRefundPolicy(tx);
  
      // --- meet/drop (use provided or fallback to POIs) ---
      const { meetGeomSql, dropGeomSql } = await this.buildMeetDropGeomFromDraftOrPOIs(tx, draft);
  
      // --- seat policy (predefined vs custom) ---
      const minPeople = tripType === 'PREDEFINED' ? (opts?.seatPolicy?.minPeople ?? 1) : people;
      const maxPeople = tripType === 'PREDEFINED' ? (opts?.seatPolicy?.maxPeople ?? Math.max(people,1)) : people;
      const minSeatsPerUser = tripType === 'PREDEFINED' ? (opts?.seatPolicy?.minSeatsPerUser ?? 1) : 1;
      const maxSeatsPerUser = tripType === 'PREDEFINED' ? (opts?.seatPolicy?.maxSeatsPerUser ?? Math.max(people,1)) : people;
  
      // --- room selection (enforce capacity) ---
      let roomsUsed = 0;
      let pickedRoomType: { id:number; hotelId:number } | null = null;
      if (draft.hotelIncluded && (draft.hotels?.length ?? 0) > 0) {
        const first = draft.hotels![0];
        const rt = await tx.query.hotelRoomTypes.findFirst({
          where: eq(schema.hotelRoomTypes.id, first.roomTypeId),
          columns: { id:true, hotelId:true, baseNightlyRate:true, capacity:true, isActive:true },
        });
        if (!rt) throw new BadRequestException('Room type not found');
        if (rt.isActive === false) throw new BadRequestException('Room type inactive');
        const capacity = Number(rt.capacity ?? 1);
        const minRoomsByCapacity = Math.ceil(people / Math.max(1, capacity));
        const requested = Number(first.roomsRequested || 0);
        roomsUsed = Math.max(requested, minRoomsByCapacity);
        pickedRoomType = { id: rt.id, hotelId: rt.hotelId };
      }
  
      // --- store per-person numbers derived from calculator ---
      const perPerson = quote.perPerson;
      const mealsPerPersonForTrip = draft.withMeals ? Number((quote.breakdown.meals / people).toFixed(2)) : 0;
      const transportPerPersonForTrip = draft.withTransport ? Number((quote.breakdown.transport / people).toFixed(2)) : 0;
  
      // --- Trip ---
      const [trip] = await tx.insert(schema.trips).values({
        name: draft.name ?? `${tripType} Trip – City#${draft.cityId} – ${draft.startDate}`,
        cityId: draft.cityId,
        createdBy: userId,
        tripType,
        startDate: draft.startDate,
        endDate: draft.endDate,
        refundPolicyId,
        pricePerPerson: perPerson.toFixed(2),
        minPeople,
        maxPeople,
        minSeatsPerUser,
        maxSeatsPerUser,
        withMeals: draft.withMeals,
        withTransport: draft.withTransport,
        hotelIncluded: !!draft.hotelIncluded,
        mealPricePerPerson: mealsPerPersonForTrip.toFixed(2),
        transportationPricePerPerson: transportPerPersonForTrip.toFixed(2),
        guideId: draft.includeGuide ? draft.guideId ?? null : null,
        meetLocationAdress: draft.meetLocationAddress ?? draft.meetLocation?.locationAddress ?? null,
        dropLocationAdress: draft.dropLocationAddress ?? draft.dropLocation?.locationAddress ?? null,
        meetLocation: meetGeomSql!,
        dropLocation: dropGeomSql!,
        createdAt: now,
        updatedAt: now,
      }).returning();
  
      // --- Days & POIs ---
      const dayNumbers = [...new Set((draft.pois ?? []).map(p => p.dayNumber))].sort((a,b)=>a-b);
      const dayRows = dayNumbers.length
        ? await tx.insert(schema.tripDays).values(
            dayNumbers.map(dn => ({ tripId: trip.id, dayNumber: dn }))
          ).returning({ id: schema.tripDays.id, dayNumber: schema.tripDays.dayNumber })
        : [];
      const dayIdByNumber = new Map(dayRows.map(d => [d.dayNumber, d.id]));
  
      if (draft.pois?.length) {
        await tx.insert(schema.tripPois).values(
          draft.pois.map(p => ({
            tripDayId: dayIdByNumber.get(p.dayNumber)!,
            poiId: p.poiId,
            visitOrder: p.visitOrder,
          }))
        );
      }
  
      // --- Hotel + Inventory + Reservation (no booking yet) ---
      if (draft.hotelIncluded && pickedRoomType && roomsUsed > 0) {
        await tx.insert(schema.tripHotels).values({
          tripId: trip.id,
          hotelId: pickedRoomType.hotelId,
          roomTypeId: pickedRoomType.id,
          roomsNeeded: roomsUsed,
        });
        if (tripType === 'PREDEFINED') {
          const tripEntityTypeId = await this.getTripEntityTypeId(tx);
          if (tripEntityTypeId) {
            // if you supply these from the controller body
            const mainImageId = (draft as any).mainImageId;
            const galleryImageIds: number[] = (draft as any).galleryImageIds ?? [];

            if (mainImageId) {
              await tx.insert(schema.attachments).values({
                objectId: mainImageId,
                entityTypeId: tripEntityTypeId,
                entityId: trip.id,
                role: 'MAIN',
              });
            }
            for (const gid of galleryImageIds) {
              await tx.insert(schema.attachments).values({
                objectId: gid,
                entityTypeId: tripEntityTypeId,
                entityId: trip.id,
                role: 'GALLERY',
              });
            }
          }
        }

        await this.updateHotelRoomInventory(
          pickedRoomType.hotelId, pickedRoomType.id,
          draft.startDate, draft.endDate, roomsUsed, tx
        );
  
        await tx.insert(schema.roomReservations).values({
          roomTypeId: pickedRoomType.id,
          checkInDate: draft.startDate,
          checkOutDate: draft.endDate,
          roomsBooked: roomsUsed,
          source: tripType === 'CUSTOM' ? 'CUSTOM_TRIP' : 'PREDEFINED_TRIP',
          sourceId: trip.id,
          refundPolicyId,
          userId,
        });
      }
  
      // --- Guide availability block if included ---
      if (draft.includeGuide && draft.guideId) {
        await tx.insert(schema.guideAvailability).values({
          guideId: draft.guideId,
          startDate: draft.startDate,
          endDate: draft.endDate,
        });
      }
  
      // --- If CUSTOM: create Order + Booking + Chat ---
      if (opts?.bookNow) {
        const [order] = await tx.insert(schema.orders).values({
          userId,
          status: 'PENDING', // change to CONFIRMED if you handle wallet here
          totalAmount: quote.total.toFixed(2),
          createdAt: now, updatedAt: now,
        }).returning();
  
        const [booking] = await tx.insert(schema.tripBookings).values({
          tripType,
          tripId: trip.id,
          refundPolicyId,
          userId,
          seats,
          source: 'CUSTOM_TRIP',
          sourceId: order.id,
          total: quote.total.toFixed(2),
        }).returning();
  
        const { chatRoomId, insertedMembers } = await this.ensureChatRoomForTrip(tx, trip.id, userId);
  
        return {
          tripId: trip.id,
          orderId: order.id,
          bookingId: booking.id,
          chatRoomId,
          insertedChatMembers: insertedMembers,
          price: quote,
        };
      }
  
      // PREDEFINED: no booking/order/chat now
      return { tripId: trip.id, price: quote };
    });
  }

  // trips.service.ts (add this helper)
// Client sends: { trip: CreateTripDtoLikeButNoPrice, seats }
// We calculate on server, then create + book in ONE transaction.
async createCustomTripAndBook(userId: string, dto: CreateAndBookCustomTripDto) {
  const { trip, seats } = dto;
  if (trip.tripType !== 'CUSTOM') throw new BadRequestException('trip.tripType must be CUSTOM');
  if (!seats || seats < 1) throw new BadRequestException('seats must be > 0');

  // Flatten POIs for distance/transport calc
  const flatPois = (trip.tripDays ?? [])
    .flatMap(d => (d.pois ?? []).map(p => ({ dayNumber: d.dayNumber, visitOrder: p.visitOrder, poiId: p.poiId })))
    .sort((a,b) => a.dayNumber - b.dayNumber || a.visitOrder - b.visitOrder);

  // Build calc draft (roomsRequested from trip.hotels[0])
  let hotelsDraft: { roomTypeId: number; roomsRequested: number }[] | undefined;
  if (trip.hotelIncluded && trip.hotels?.length) {
    const h = trip.hotels[0];
    hotelsDraft = [{ roomTypeId: h.roomTypeId, roomsRequested: h.roomsNeeded }];
  }

  const calcDraft: CalculateTripDraftDto = {
    cityId: trip.cityId,
    startDate: trip.startDate,
    endDate: trip.endDate,
    people: seats,
    withMeals: trip.withMeals,
    withTransport: trip.withTransport,
    hotelIncluded: trip.hotelIncluded,
    includeGuide: !!trip.guideId,
    guideId: trip.guideId,
    meetLocation: trip.meetLocation,
    dropLocation: trip.dropLocation,
    hotels: hotelsDraft,
    pois: flatPois,
  };

  // Server-side quote
  const quote = await this.calculateCustomTripPrice(calcDraft);

  // Compose CreateTripDto with computed prices; people policy ties to seats
  const createDto: CreateTripDto = {
    ...trip,
    tripType: 'CUSTOM',
    pricePerPerson: quote.perPerson,
    mealPricePerPerson: trip.withMeals ? quote.perPersonMeals : 0,
    transportationPricePerPerson: trip.withTransport ? quote.perPersonTransport : 0,
    minPeople: seats,
    maxPeople: seats,
    minSeatsPerUser: 1,
    maxSeatsPerUser: seats,
  };

  // If no hotel, require meet/drop coords
  if (!createDto.hotelIncluded) {
    if (!createDto.meetLocation || !createDto.dropLocation) {
      throw new BadRequestException('meetLocation & dropLocation are required when no hotel is selected');
    }
  }

  // All-or-nothing
  return this.db.transaction(async (tx) => {
    const created = await this.createTripInTx(tx, userId, createDto);
    const booking = await this.bookTripInTx(tx, userId, {
      tripId: created.id,
      seats,
      source: 'CUSTOM_TRIP',
    });
    return { trip: created, booking, quote };
  });
}


// Create a trip INSIDE an existing transaction (no nested tx)
private async createTripInTx(
  tx,                // whatever type your tx is
  userId: string,
  createTripDto: CreateTripDto
) {
  const {
    name,
    cityId,
    tripType,
    startDate,
    endDate,
    pricePerPerson,
    minPeople,
    maxPeople,
    minSeatsPerUser,
    maxSeatsPerUser,
    withMeals,
    withTransport,
    hotelIncluded,
    mealPricePerPerson = 0,
    transportationPricePerPerson = 0,
    guideId,
    meetLocationAddress,
    meetLocation,
    dropLocationAddress,
    dropLocation,
    mainImageId,
    galleryImageIds,
    tripDays,
    hotels = [],
    tagIds = [],
  } = createTripDto;

  // --- validations (same as your create) ---
  if (new Date(startDate) >= new Date(endDate)) {
    throw new BadRequestException('End date must be after start date');
  }
  if (minPeople > maxPeople) throw new BadRequestException('minPeople > maxPeople');
  if (minSeatsPerUser > maxSeatsPerUser) throw new BadRequestException('minSeatsPerUser > maxSeatsPerUser');

  const city = await tx.query.cities.findFirst({ where: eq(schema.cities.id, cityId) });
  if (!city) throw new BadRequestException('City not found');

  if (guideId) {
    const guide = await tx.query.guides.findFirst({ where: eq(schema.guides.id, guideId) });
    if (!guide) throw new BadRequestException('Guide not found');
  }

  if (hotelIncluded && hotels.length === 0) {
    throw new BadRequestException('Hotels must be specified when hotel is included');
  }
  if (hotels.length > 1) {
    throw new BadRequestException('Only one hotel and room type can be specified per trip');
  }
  for (const h of hotels) {
    const hotelExists = await tx.query.hotels.findFirst({ where: eq(schema.hotels.id, h.hotelId) });
    if (!hotelExists) throw new BadRequestException(`Hotel with ID ${h.hotelId} not found`);
    const roomTypeExists = await tx.query.hotelRoomTypes.findFirst({ where: eq(schema.hotelRoomTypes.id, h.roomTypeId) });
    if (!roomTypeExists) throw new BadRequestException(`Room type with ID ${h.roomTypeId} not found`);
  }

  for (const day of tripDays) {
    for (const poi of day.pois) {
      const poiExists = await tx.query.pois.findFirst({ where: eq(schema.pois.id, poi.poiId) });
      if (!poiExists) throw new BadRequestException(`POI with ID ${poi.poiId} not found`);
    }
  }
  for (const tagId of tagIds) {
    const tagExists = await tx.query.tags.findFirst({ where: eq(schema.tags.id, tagId) });
    if (!tagExists) throw new BadRequestException(`Tag with ID ${tagId} not found`);
  }

  // --- availability checks inside tx ---
  if (guideId) {
    const gAvail = await this.checkGuideAvailability(guideId, startDate, endDate, tx);
    if (!gAvail.available) throw new BadRequestException(gAvail.message);
  }

  if (hotelIncluded && hotels.length > 0) {
    const h = hotels[0];
    const hAvail = await this.checkHotelRoomAvailability(h.hotelId, h.roomTypeId, startDate, endDate, h.roomsNeeded, tx);
    if (!hAvail.available) throw new BadRequestException(hAvail.message);
  }

  const refundPolicyId = await this.getDefaultRefundPolicy(tx);

  // --- insert trip ---
  const [trip] = await tx.insert(schema.trips).values({
    name: name.trim(),
    cityId,
    createdBy: userId,
    tripType,
    startDate,
    endDate,
    pricePerPerson: pricePerPerson.toString(),
    minPeople,
    maxPeople,
    minSeatsPerUser,
    maxSeatsPerUser,
    withMeals,
    withTransport,
    hotelIncluded,
    mealPricePerPerson: mealPricePerPerson.toString(),
    transportationPricePerPerson: transportationPricePerPerson.toString(),
    guideId,
    meetLocationAdress: meetLocationAddress,
    dropLocationAdress: dropLocationAddress,
    refundPolicyId,
    meetLocation: sql`ST_SetSRID(ST_MakePoint(${meetLocation?.lon}, ${meetLocation?.lat}), 4326)`,
    dropLocation: sql`ST_SetSRID(ST_MakePoint(${dropLocation?.lon}, ${dropLocation?.lat}), 4326)`,
  }).returning();

  // --- trip days + pois ---
  for (const day of tripDays) {
    const [tripDay] = await tx.insert(schema.tripDays).values({
      tripId: trip.id,
      dayNumber: day.dayNumber,
      startTime: day.startTime,
      endTime: day.endTime,
      description: day.description ?? '',
    }).returning();

    for (const poi of day.pois) {
      await tx.insert(schema.tripPois).values({
        tripDayId: tripDay.id,
        poiId: poi.poiId,
        visitOrder: poi.visitOrder,
      });
    }
  }

  // --- trip hotels ---
  for (const h of hotels) {
    await tx.insert(schema.tripHotels).values({
      tripId: trip.id,
      hotelId: h.hotelId,
      roomTypeId: h.roomTypeId,
      roomsNeeded: h.roomsNeeded,
    });
  }

  // --- trip tags ---
  for (const tagId of tagIds) {
    await tx.insert(schema.tripToTags).values({ tripId: trip.id, tagId });
  }

  // --- holds: guide availability ---
  if (guideId) {
    await tx.insert(schema.guideAvailability).values({
      guideId,
      startDate,
      endDate,
      source: tripType === 'CUSTOM' ? 'CUSTOM_TRIP' : 'PREDEFINED_TRIP',
      sourceId: trip.id,
    });
  }

  // --- holds: room inventory + reservation ---
  if (hotelIncluded && hotels.length > 0) {
    const h = hotels[0];
    await this.updateHotelRoomInventory(h.hotelId, h.roomTypeId, startDate, endDate, h.roomsNeeded, tx);
    await tx.insert(schema.roomReservations).values({
      roomTypeId: h.roomTypeId,
      checkInDate: startDate,
      checkOutDate: endDate,
      roomsBooked: h.roomsNeeded,
      source: tripType === 'CUSTOM' ? 'CUSTOM_TRIP' : 'PREDEFINED_TRIP',
      sourceId: trip.id,
      refundPolicyId,
    });
  }

  // --- attachments ---
  const tripEntityTypeId = await this.getTripEntityTypeId(tx);
  if (tripEntityTypeId) {
    if (mainImageId) {
      await tx.insert(schema.attachments).values({
        objectId: mainImageId,
        entityTypeId: tripEntityTypeId,
        entityId: trip.id,
        role: 'MAIN',
      });
    }
    if (galleryImageIds?.length) {
      for (const imgId of galleryImageIds) {
        await tx.insert(schema.attachments).values({
          objectId: imgId,
          entityTypeId: tripEntityTypeId,
          entityId: trip.id,
          role: 'GALLERY',
        });
      }
    }
  }

  return trip;
}

// Book a trip INSIDE an existing transaction (no nested tx)
private async bookTripInTx(
  tx,
  userId: string,
  dto: { tripId: number; seats: number; source?: 'PREDEFINED_TRIP' | 'CUSTOM_TRIP' }
) {
  const { tripId, seats, source = 'PREDEFINED_TRIP' } = dto;

  // 1) availability
  const avail = await this.checkTripAvailability(tripId, seats, tx);
  if (!avail.available) throw new BadRequestException(avail.message);
  const trip = avail.trip!;

  // 2) price
  const fullTrip = await tx.query.trips.findFirst({
    where: eq(schema.trips.id, tripId),
    columns: {
      pricePerPerson: true,
      withMeals: true,
      mealPricePerPerson: true,
      withTransport: true,
      transportationPricePerPerson: true,
    },
  });
  const unitPrice = Number(fullTrip?.pricePerPerson ?? trip.pricePerPerson ?? 0);
  const totalPrice = Number((unitPrice * seats).toFixed(2));

  // 3) debit wallet atomically
  const [walletAfter] = await tx
    .update(schema.wallets)
    .set({
      balance: sql`${schema.wallets.balance} - ${totalPrice}`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(schema.wallets.userId, userId), sql`${schema.wallets.balance} >= ${totalPrice}`),
    )
    .returning({ id: schema.wallets.id, balance: schema.wallets.balance });

  if (!walletAfter) throw new BadRequestException(`Insufficient balance: need ${totalPrice}`);
  const afterBal = Number(walletAfter.balance);
  const beforeBal = afterBal + totalPrice;

  // 4) order
  const [order] = await tx.insert(schema.orders).values({
    userId,
    status: 'CONFIRMED',
    totalAmount: totalPrice.toFixed(2),
  }).returning();

  // 5) order item
  const refundPolicyId = await this.getDefaultRefundPolicy(tx);
  await tx.insert(schema.orderItems).values({
    orderId: order.id,
    itemType: 'TRIP',
    itemId: tripId,
    quantity: seats,
    unitPrice: unitPrice.toString(),
    totalPrice: totalPrice.toFixed(2),
    refundPolicyId,
  });

  // 6) trip booking
  const [booking] = await tx.insert(schema.tripBookings).values({
    tripId,
    userId,
    seats,
    source,
    sourceId: order.id,
    refundPolicyId,
    total: totalPrice.toFixed(2),
  }).returning();

  // 7) ledger
  await tx.insert(schema.userTransactions).values({
    walletId: walletAfter.id,
    amount: (-totalPrice).toFixed(2),
    source: 'BOOKING',
    status: 'POSTED',
    balanceBefore: beforeBal.toFixed(2),
    balanceAfter: afterBal.toFixed(2),
    orderId: order.id,
    note: `Trip#${tripId} booking of ${seats} seat(s)`,
  });

  // 8) payment history
  await tx.insert(schema.paymentHistory).values({
    orderId: order.id,
    paymentAmount: totalPrice.toFixed(2),
    paymentMethod: 'WALLET',
    paymentStatus: 'POSTED',
  });

  // 9) chat room (idempotent)
  const { chatRoomId, insertedMembers, missingUserIds } =
    await this.ensureChatRoomForTrip(tx, tripId, userId);

  return {
    bookingId: booking.id,
    chatRoomId,
    insertedChatMembers: insertedMembers,
    missingChatMemberUserIds: missingUserIds,
    orderId: order.id,
    totalAmount: totalPrice,
    seats,
  };
}


}
