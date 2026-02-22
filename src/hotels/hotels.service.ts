/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { DRIZLE } from '../database.module';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { BookHotelDto } from './dto/book-hotel.dto';
import { BookHotelResponseDto } from './dto/book-hotel-response.dto';
import {
  eq,
  and,
  sql,
  asc,
  desc,
  ilike,
  or,
  not,
  exists,
  isNull,
  inArray,
} from 'drizzle-orm';

@Injectable()
export class HotelsService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getHotelEntityTypeId(
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<number> {
    const rec = await tx.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'hotel'),
      columns: { id: true },
    });
    if (!rec) throw new BadRequestException('Hotel entity type not found');
    return rec.id;
  }

  private async getRoomTypeEntityTypeId(): Promise<number> {
    return this.getEntityTypeId('roomType');
  }

  /** helper to pull an entityTypeId by name (cache it) */
  private entityTypeIdCache = new Map<string, number>();
  private async getEntityTypeId(name: string): Promise<number> {
    const cached = this.entityTypeIdCache.get(name);
    if (cached) return cached;
    const rec = await this.db.query.entityTypes.findFirst({
      where: (t, { eq }) => eq(t.name, name),
      columns: { id: true },
    });
    if (!rec) throw new Error(`Unknown entity type ${name}`);
    this.entityTypeIdCache.set(name, rec.id);
    return rec.id;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    orderBy: 'createdAt' | 'name' | 'stars' | 'avgRating' = 'createdAt',
    orderDir: 'asc' | 'desc' = 'desc',
    filters: {
      cityId?: number;
      isActive?: boolean;
      search?: string;
      stars?: number;
    } = {},
  ) {
    const offset = (page - 1) * limit;
    const conditions: any[] = [];

    if (filters.cityId) {
      conditions.push(eq(schema.hotels.cityId, filters.cityId));
    }
    if (filters.isActive !== undefined) {
      conditions.push(eq(schema.hotels.isActive, filters.isActive));
    }
    if (filters.stars) {
      conditions.push(eq(schema.hotels.stars, filters.stars));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(schema.hotels.name, `%${filters.search}%`),
          ilike(schema.hotels.description, `%${filters.search}%`),
        ),
      );
    }
    conditions.push(sql`"hotels"."deleted_at" IS NULL`);

    // Get total count
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.hotels)
      .where(conditions.length ? and(...conditions) : undefined);
    const totalCount = totalCountResult[0].count;

    // Determine order column
    let orderColumn: any = schema.hotels.createdAt;
    if (orderBy === 'name') orderColumn = schema.hotels.name;
    if (orderBy === 'stars') orderColumn = schema.hotels.stars;
    if (orderBy === 'avgRating') orderColumn = schema.hotels.avgRating;
    const orderExpr = orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

    // Fetch hotels with basic relations
    const hotels = await this.db.query.hotels.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: {
        city: {
          columns: {
            id: true,
            name: true,
            slug: true,
            description: true,
            countryId: true,
            radius: true,
            avgMealPrice: true,
            isActive: true,
            avgRating: true,
            ratingCount: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            // Temporarily exclude center geometry field
            // center: true,
          },
        },
      },
      limit,
      offset,
      orderBy: [orderExpr],
      columns: {
        id: true,
        name: true,
        slug: true,
        description: true,
        cityId: true,
        stars: true,
        address: true,
        phone: true,
        email: true,
        checkInTime: true,
        checkOutTime: true,
        currency: true,
        isActive: true,
        avgRating: true,
        ratingCount: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        // Temporarily exclude location geometry field
        // location: true,
      },
    });

    // Fetch images for each hotel
    const hotelEntityTypeId = await this.getHotelEntityTypeId();
    const hotelsWithImages = await Promise.all(
      hotels.map(async (hotel) => {
        const attachments = await this.db.query.attachments.findMany({
          where: and(
            eq(schema.attachments.entityTypeId, hotelEntityTypeId),
            eq(schema.attachments.entityId, hotel.id),
          ),
          with: { fileObject: true },
        });

        let mainImage: any = null;
        const galleryImages: any[] = [];
        for (const att of attachments) {
          if (att.role === 'MAIN' && att.fileObject) mainImage = att.fileObject;
          if (att.role === 'GALLERY' && att.fileObject)
            galleryImages.push(att.fileObject);
        }

        return { ...hotel, mainImage, galleryImages };
      }),
    );

    return {
      data: hotelsWithImages,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      orderBy,
      orderDir,
      filters,
    };
  }

  async findAvailable(opts: {
    cityId: number;
    startDate: string; // e.g. '2025-08-15'
    endDate: string; // e.g. '2025-08-20'
    page: number;
    limit: number;
  }) {
    const { cityId, startDate, endDate, page, limit } = opts;
    const offset = (page - 1) * limit;

    // 1) Define a subquery that finds any inventory row
    //    for this roomType *in* the date range where it's totally sold out:
    const soldOut = this.db
      .select()
      .from(schema.roomInventory)
      .where(
        and(
          // correlate to the current roomType
          eq(schema.roomInventory.roomTypeId, schema.hotelRoomTypes.id),
          // date falls in your requested window
          sql`${schema.roomInventory.date} BETWEEN ${startDate} AND ${endDate}`,
          // zero rooms available
          sql`${schema.roomInventory.availableRooms} = 0`,
        ),
      );

    // 2) Fetch hotels + roomTypes, **excluding** any roomType with a soldOut entry
    const rows = await this.db
      .select({
        hotel: schema.hotels,
        roomType: schema.hotelRoomTypes,
      })
      .from(schema.hotels)
      .innerJoin(
        schema.hotelRoomTypes,
        eq(schema.hotelRoomTypes.hotelId, schema.hotels.id),
      )
      .where(
        and(
          eq(schema.hotels.cityId, cityId),
          // only roomTypes *without* any sold-out day in the window
          not(exists(soldOut)),
        ),
      )
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.hotels.createdAt));

    // 3) Group by hotel.id so each hotel appears once, listing all its available roomTypes
    const map = new Map<number, { hotel: any; roomTypes: any[] }>();
    for (const { hotel, roomType } of rows) {
      if (!map.has(hotel.id)) {
        map.set(hotel.id, { hotel, roomTypes: [] });
      }
      map.get(hotel.id)!.roomTypes.push(roomType);
    }
    // 3.5) Compute min available rooms per roomType across the date range
    const allRoomTypeIds: number[] = [];
    for (const v of map.values()) {
      for (const rt of v.roomTypes) allRoomTypeIds.push(rt.id);
    }

    const minAvailMap = new Map<number, number>();
    if (allRoomTypeIds.length) {
      const mins = await this.db
        .select({ roomTypeId: schema.roomInventory.roomTypeId, minAvailable: sql<number>`MIN(${schema.roomInventory.availableRooms})` })
        .from(schema.roomInventory)
        .where(
          and(
            inArray(schema.roomInventory.roomTypeId, allRoomTypeIds),
            sql`${schema.roomInventory.date} BETWEEN ${startDate} AND ${endDate}`,
          ),
        )
        .groupBy(schema.roomInventory.roomTypeId as any);
      for (const m of mins) minAvailMap.set(m.roomTypeId, Number(m.minAvailable));
    }

    // Replace roomTypes' totalRooms with availableRooms (min across range or totalRooms if no inventory rows)
    const data = Array.from(map.values()).map((entry) => ({
      hotel: entry.hotel,
      roomTypes: entry.roomTypes.map((rt: any) => {
        const avail = minAvailMap.has(rt.id) ? minAvailMap.get(rt.id)! : rt.totalRooms;
        return { ...rt, totalRooms: avail };
      }),
    }));

    // 4) Count distinct hotels for pagination
    const [{ count: totalCount }] = await this.db
      .select({ count: sql<number>`COUNT(DISTINCT "hotels"."id")` })
      .from(schema.hotels)
      .innerJoin(
        schema.hotelRoomTypes,
        eq(schema.hotelRoomTypes.hotelId, schema.hotels.id),
      )
      .where(and(eq(schema.hotels.cityId, cityId), not(exists(soldOut))));

    return {
      data,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  async findOne(id: number) {
    const hotel = await this.db.query.hotels.findFirst({
      where: eq(schema.hotels.id, id),
      with: {
        city: {
          columns: {
            id: true,
            name: true,
            slug: true,
            description: true,
            countryId: true,
            radius: true,
            avgMealPrice: true,
            isActive: true,
            avgRating: true,
            ratingCount: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
          },
        },
        roomTypes: true,
      },
      columns: {
        id: true,
        name: true,
        slug: true,
        description: true,
        cityId: true,
        stars: true,
        address: true,
        phone: true,
        email: true,
        checkInTime: true,
        checkOutTime: true,
        currency: true,
        isActive: true,
        avgRating: true,
        ratingCount: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        location: true,
      },
    });

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    // Fetch images
    const hotelEntityTypeId = await this.getHotelEntityTypeId();
    const attachments = await this.db.query.attachments.findMany({
      where: and(
        eq(schema.attachments.entityTypeId, hotelEntityTypeId),
        eq(schema.attachments.entityId, hotel.id),
      ),
      with: { fileObject: true },
    });

    let mainImage: any = null;
    const galleryImages: any[] = [];
    for (const att of attachments) {
      if (att.role === 'MAIN' && att.fileObject) mainImage = att.fileObject;
      if (att.role === 'GALLERY' && att.fileObject)
        galleryImages.push(att.fileObject);
    }

    const roomTypeEntityTypeId = await this.getRoomTypeEntityTypeId();
    const roomTypeIds = hotel.roomTypes.map((rt) => rt.id);
    const roomTypeMap = new Map<
      number,
      typeof schema.fileObjects.$inferSelect
    >();
    if (roomTypeIds.length) {
      const rta = await this.db.query.attachments.findMany({
        where: and(
          eq(schema.attachments.entityTypeId, roomTypeEntityTypeId),
          inArray(schema.attachments.entityId, roomTypeIds),
          eq(schema.attachments.role, 'MAIN'),
        ),
        with: { fileObject: true },
      });
      for (const a of rta) {
        if (a.fileObject) roomTypeMap.set(a.entityId, a.fileObject);
      }
    }
    const roomTypes = hotel.roomTypes.map((rt) => ({
      ...rt,
      mainImage: roomTypeMap.has(rt.id)
        ? {
            ...roomTypeMap.get(rt.id)!,
            url: `/${roomTypeMap.get(rt.id)!.bucket}/${
              roomTypeMap.get(rt.id)!.objectKey
            }`,
          }
        : null,
    }));

    const [reviewsCountRow, favouritesCountRow, reviewsRaw, favouritesRaw] =
      await Promise.all([
        // count reviews
        this.db
          .select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
          .from(schema.reviews)
          .where(
            and(
              eq(schema.reviews.entityTypeId, hotelEntityTypeId),
              eq(schema.reviews.entityId, id),
              isNull(schema.reviews.deletedAt),
            ),
          ),

        // count favourites
        this.db
          .select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
          .from(schema.favourites)
          .where(
            and(
              eq(schema.favourites.entityTypeId, hotelEntityTypeId),
              eq(schema.favourites.entityId, id),
              isNull(schema.favourites.deletedAt),
            ),
          ),

        // reviews list w/ user+avatar
        this.db
          .select({
            id: schema.reviews.id,
            rating: schema.reviews.rating,
            comment: schema.reviews.comment,
            createdAt: schema.reviews.createdAt,
            userId: schema.users.id,
            userName: schema.users.name,
            avatarBucket: schema.fileObjects.bucket,
            avatarKey: schema.fileObjects.objectKey,
          })
          .from(schema.reviews)
          .leftJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
          .leftJoin(
            schema.userAvatars,
            eq(schema.userAvatars.userId, schema.users.id),
          )
          .leftJoin(
            schema.fileObjects,
            eq(schema.fileObjects.id, schema.userAvatars.fileObjectId),
          )
          .where(
            and(
              eq(schema.reviews.entityTypeId, hotelEntityTypeId),
              eq(schema.reviews.entityId, id),
              isNull(schema.reviews.deletedAt),
            ),
          )
          .orderBy(desc(schema.reviews.createdAt))
          .limit(50),

        // favourites list w/ user+avatar
        this.db
          .select({
            createdAt: schema.favourites.createdAt,
            userId: schema.users.id,
            userName: schema.users.name,
            avatarBucket: schema.fileObjects.bucket,
            avatarKey: schema.fileObjects.objectKey,
          })
          .from(schema.favourites)
          .leftJoin(schema.users, eq(schema.users.id, schema.favourites.userId))
          .leftJoin(
            schema.userAvatars,
            eq(schema.userAvatars.userId, schema.users.id),
          )
          .leftJoin(
            schema.fileObjects,
            eq(schema.fileObjects.id, schema.userAvatars.fileObjectId),
          )
          .where(
            and(
              eq(schema.favourites.entityTypeId, hotelEntityTypeId),
              eq(schema.favourites.entityId, id),
              isNull(schema.favourites.deletedAt),
            ),
          )
          .orderBy(desc(schema.favourites.createdAt)),
      ]);

    // 4) map into neat DTOs
    const reviews = reviewsRaw.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      user: {
        id: r.userId!,
        name: r.userName,
        avatarUrl: r.avatarBucket ? `/${r.avatarBucket}/${r.avatarKey}` : null,
      },
    }));

    const favourites = favouritesRaw.map((f) => ({
      createdAt: f.createdAt,
      user: {
        id: f.userId!,
        name: f.userName,
        avatarUrl: f.avatarBucket ? `/${f.avatarBucket}/${f.avatarKey}` : null,
      },
    }));

    return {
      ...hotel,
      roomTypes,
      mainImage,
      galleryImages,
      reviewsCount: reviewsCountRow[0]?.count ?? 0,
      favouritesCount: favouritesCountRow[0]?.count ?? 0,
      reviews,
      favourites,
    };
  }

  async create(createHotelDto: CreateHotelDto) {
    const {
      name,
      cityId,
      description,
      stars,
      address,
      phone,
      email,
      location,
      checkInTime,
      checkOutTime,
      currency = 'USD',
      mainImageId,
      galleryImageIds,
    } = createHotelDto;

    // Validate location
    if (
      !location ||
      typeof location.lat !== 'number' ||
      typeof location.lon !== 'number'
    ) {
      throw new BadRequestException('location with lat and lon is required');
    }

    // Check if city exists
    const city = await this.db.query.cities.findFirst({
      where: eq(schema.cities.id, cityId),
    });
    if (!city) {
      throw new BadRequestException('City not found');
    }

    // Generate slug from name
    const slug = this.generateSlug(name);

    // Check if hotel with same name in city already exists
    const existingHotel = await this.db.query.hotels.findFirst({
      where: and(
        eq(schema.hotels.name, name),
        eq(schema.hotels.cityId, cityId),
      ),
    });
    if (existingHotel) {
      throw new BadRequestException(
        'Hotel with this name already exists in this city',
      );
    }

    // Create hotel
    const [hotel] = await this.db
      .insert(schema.hotels)
      .values({
        name,
        cityId,
        slug,
        description,
        stars,
        address,
        phone,
        email,
        location: sql`ST_SetSRID(ST_MakePoint(${location.lon}, ${location.lat}), 4326)`,
        checkInTime: checkInTime || '14:00',
        checkOutTime: checkOutTime || '12:00',
        currency,
      })
      .returning();

    // Save attachments (main and gallery images)
    const hotelEntityTypeId = await this.getHotelEntityTypeId();
    if (hotelEntityTypeId && hotel) {
      if (mainImageId) {
        await this.db.insert(schema.attachments).values({
          objectId: mainImageId,
          entityTypeId: hotelEntityTypeId,
          entityId: hotel.id,
          role: 'MAIN',
        });
      }
      if (galleryImageIds && Array.isArray(galleryImageIds)) {
        for (const imgId of galleryImageIds) {
          await this.db.insert(schema.attachments).values({
            objectId: imgId,
            entityTypeId: hotelEntityTypeId,
            entityId: hotel.id,
            role: 'GALLERY',
          });
        }
      }
    }

    return this.findOne(hotel.id);
  }

  async update(id: number, updateHotelDto: UpdateHotelDto) {
    const hotel = await this.db.query.hotels.findFirst({
      where: eq(schema.hotels.id, id),
    });
    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    const {
      name,
      cityId,
      description,
      stars,
      address,
      phone,
      email,
      location,
      checkInTime,
      checkOutTime,
      currency,
      mainImageId,
      galleryImageIds,
    } = updateHotelDto;

    // Check if city exists if cityId is being updated
    if (cityId) {
      const city = await this.db.query.cities.findFirst({
        where: eq(schema.cities.id, cityId),
      });
      if (!city) {
        throw new BadRequestException('City not found');
      }
    }

    // Check for name conflict if name is being updated
    if (name && name !== hotel.name) {
      const existingHotel = await this.db.query.hotels.findFirst({
        where: and(
          eq(schema.hotels.name, name),
          eq(schema.hotels.cityId, cityId || hotel.cityId),
          sql`"hotels"."id" != ${id}`,
        ),
      });
      if (existingHotel) {
        throw new BadRequestException(
          'Hotel with this name already exists in this city',
        );
      }
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updateData.name = name;
    if (cityId !== undefined) updateData.cityId = cityId;
    if (description !== undefined) updateData.description = description;
    if (stars !== undefined) updateData.stars = stars;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (checkInTime !== undefined) updateData.checkInTime = checkInTime;
    if (checkOutTime !== undefined) updateData.checkOutTime = checkOutTime;
    if (currency !== undefined) updateData.currency = currency;
    if (location) {
      updateData.location = sql`ST_SetSRID(ST_MakePoint(${location.lon}, ${location.lat}), 4326)`;
    }

    // Update hotel
    await this.db
      .update(schema.hotels)
      .set(updateData)
      .where(eq(schema.hotels.id, id));

    // Update attachments if provided
    const hotelEntityTypeId = await this.getHotelEntityTypeId();
    if (hotelEntityTypeId) {
      // Delete existing attachments
      await this.db
        .delete(schema.attachments)
        .where(
          and(
            eq(schema.attachments.entityTypeId, hotelEntityTypeId),
            eq(schema.attachments.entityId, id),
          ),
        );

      // Insert new attachments
      if (mainImageId) {
        await this.db.insert(schema.attachments).values({
          objectId: mainImageId,
          entityTypeId: hotelEntityTypeId,
          entityId: id,
          role: 'MAIN',
        });
      }
      if (galleryImageIds && Array.isArray(galleryImageIds)) {
        for (const imgId of galleryImageIds) {
          await this.db.insert(schema.attachments).values({
            objectId: imgId,
            entityTypeId: hotelEntityTypeId,
            entityId: id,
            role: 'GALLERY',
          });
        }
      }
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    const hotel = await this.db.query.hotels.findFirst({
      where: eq(schema.hotels.id, id),
    });
    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    // Delete hotel (this will cascade to room types and reservations)
    await this.db.delete(schema.hotels).where(eq(schema.hotels.id, id));

    return {
      message: `Hotel with ID ${id} has been deleted successfully.`,
      deletedHotelId: id,
    };
  }

  async findAllByCityId(cityId: number) {
    // Get all hotels for this city with images
    const hotels = await this.db.query.hotels.findMany({
      where: and(
        eq(schema.hotels.cityId, cityId),
        eq(schema.hotels.isActive, true),
        sql`"hotels"."deleted_at" IS NULL`,
      ),
      with: {
        roomTypes: {
          where: eq(schema.hotelRoomTypes.isActive, true),
        },
      },
      columns: {
        id: true,
        name: true,
        slug: true,
        description: true,
        cityId: true,
        stars: true,
        address: true,
        phone: true,
        email: true,
        checkInTime: true,
        checkOutTime: true,
        currency: true,
        isActive: true,
        avgRating: true,
        ratingCount: true,
        createdAt: true,
        updatedAt: true,
        location:true,
        deletedAt: true,
      },
    });

    // Get images for each hotel
    const hotelEntityTypeId = await this.getHotelEntityTypeId();
    const hotelsWithImages = await Promise.all(
      hotels.map(async (hotel) => {
        const attachments = await this.db.query.attachments.findMany({
          where: and(
            eq(schema.attachments.entityTypeId, hotelEntityTypeId),
            eq(schema.attachments.entityId, hotel.id),
          ),
          with: { fileObject: true },
        });

        let mainImage: any = null;
        const galleryImages: any[] = [];
        for (const att of attachments) {
          if (att.role === 'MAIN' && att.fileObject) mainImage = att.fileObject;
          if (att.role === 'GALLERY' && att.fileObject)
            galleryImages.push(att.fileObject);
        }

        return { ...hotel, mainImage, galleryImages };
      }),
    );

    return hotelsWithImages;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  // ==================== ROOM BOOKING METHODS ====================

  async getDefaultRefundPolicy(
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<number> {
    // Check if default refund policy exists (we'll use the 7+ days policy as the main one)
    let refundPolicy = await tx.query.refundPolicy.findFirst({
      where: eq(
        schema.refundPolicy.name,
        'Default Hotel Refund Policy - 7+ Days',
      ),
      columns: { id: true },
    });

    if (!refundPolicy) {
      // Create multiple refund policies for different time ranges
      const policies = [
        {
          name: 'Default Hotel Refund Policy - 7+ Days',
          policyText: '100% refund if cancelled 7+ days before check-in',
          triggerMinutesBeforeService: 7 * 24 * 60, // 7 days
          triggerStatus: 'CANCELLED',
          refundPercentage: '1.00', // 100%
          description: 'Full refund for cancellations 7+ days before check-in',
        },
        {
          name: 'Default Hotel Refund Policy - 5-7 Days',
          policyText: '70% refund if cancelled 5-7 days before check-in',
          triggerMinutesBeforeService: 5 * 24 * 60, // 5 days
          triggerStatus: 'CANCELLED',
          refundPercentage: '0.70', // 70%
          description: '70% refund for cancellations 5-7 days before check-in',
        },
        {
          name: 'Default Hotel Refund Policy - 2-5 Days',
          policyText: '30% refund if cancelled 2-5 days before check-in',
          triggerMinutesBeforeService: 2 * 24 * 60, // 2 days
          triggerStatus: 'CANCELLED',
          refundPercentage: '0.30', // 30%
          description: '30% refund for cancellations 2-5 days before check-in',
        },
        {
          name: 'Default Hotel Refund Policy - 0-2 Days',
          policyText: 'No refund if cancelled less than 2 days before check-in',
          triggerMinutesBeforeService: 0, // 0 days
          triggerStatus: 'CANCELLED',
          refundPercentage: '0.00', // 0%
          description:
            'No refund for cancellations less than 2 days before check-in',
        },
      ];

      for (const policy of policies) {
        await tx.insert(schema.refundPolicy).values(policy);
      }

      // Get the main policy (7+ days) to return
      refundPolicy = await tx.query.refundPolicy.findFirst({
        where: eq(
          schema.refundPolicy.name,
          'Default Hotel Refund Policy - 7+ Days',
        ),
        columns: { id: true },
      });
    }

    return refundPolicy?.id || 0;
  }

  // New method to calculate refund amount based on cancellation date
  async calculateRefundAmount(
    orderItemId: number,
    cancellationDate: Date,
    checkInDate: string,
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<{
    refundAmount: number;
    refundPercentage: number;
    policyName: string;
  }> {
    // Get the order item
    const orderItem = await tx.query.orderItems.findFirst({
      where: eq(schema.orderItems.id, orderItemId),
      columns: { totalPrice: true, refundPolicyId: true },
    });

    if (!orderItem) {
      throw new NotFoundException('Order item not found');
    }

    // Calculate days before check-in
    const checkIn = new Date(checkInDate);
    const daysBeforeCheckIn = Math.ceil(
      (checkIn.getTime() - cancellationDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Get all refund policies and find the applicable one
    const policies = await tx.query.refundPolicy.findMany({
      where: eq(schema.refundPolicy.triggerStatus, 'CANCELLED'),
      orderBy: [desc(schema.refundPolicy.triggerMinutesBeforeService)],
    });

    let applicablePolicy: any = null;
    for (const policy of policies) {
      const policyDays = policy?.triggerMinutesBeforeService
        ? policy.triggerMinutesBeforeService / (24 * 60)
        : 0;
      if (daysBeforeCheckIn >= policyDays) {
        applicablePolicy = policy;
        break;
      }
    }

    if (!applicablePolicy) {
      // No refund
      return {
        refundAmount: 0,
        refundPercentage: 0,
        policyName: 'No refund policy applicable',
      };
    }

    const refundPercentage = Number(applicablePolicy.refundPercentage);
    const refundAmount = Number(orderItem.totalPrice) * refundPercentage;

    return {
      refundAmount,
      refundPercentage,
      policyName: applicablePolicy.name,
    };
  }

  async checkRoomAvailability(
    roomTypeId: number,
    checkInDate: string,
    checkOutDate: string,
    roomsRequested: number,
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

    // Parse dates
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (checkIn >= checkOut) {
      return {
        available: false,
        message: 'Check-out date must be after check-in date',
      };
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

      if (availableRooms < roomsRequested) {
        return {
          available: false,
          message: `Only ${availableRooms} rooms available on ${date.toISOString().split('T')[0]}`,
          roomType,
        };
      }
    }

    return { available: true, roomType };
  }

  async calculateTotalPrice(
    roomTypeId: number,
    checkInDate: string,
    checkOutDate: string,
    roomsBooked: number,
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<{
    totalPrice: number;
    pricePerNight: number;
    numberOfNights: number;
  }> {
    const roomType = await tx.query.hotelRoomTypes.findFirst({
      where: eq(schema.hotelRoomTypes.id, roomTypeId),
      columns: { baseNightlyRate: true },
    });

    if (!roomType) {
      throw new NotFoundException('Room type not found');
    }

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
    const numberOfNights = Math.ceil(
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
    );
    const pricePerNight = Number(roomType.baseNightlyRate);
    const totalPrice = pricePerNight * numberOfNights * roomsBooked;

    return { totalPrice, pricePerNight, numberOfNights };
  }

  async updateRoomInventory(
    roomTypeId: number,
    checkInDate: string,
    checkOutDate: string,
    roomsBooked: number,
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<void> {
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);
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
            bookedRooms: (existingInventory.bookedRooms || 0) + roomsBooked,
            availableRooms:
              (existingInventory.availableRooms || 0) - roomsBooked,
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
          bookedRooms: roomsBooked,
          availableRooms: roomType.totalRooms - roomsBooked,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  async bookRoom(
    userId: string,
    bookHotelDto: BookHotelDto,
  ): Promise<BookHotelResponseDto> {
    const {
      roomTypeId,
      checkInDate,
      checkOutDate,
      roomsBooked,
      source = 'HOTEL_ONLY',
      sourceId,
    } = bookHotelDto;
  
    return this.db.transaction(async (tx) => {
      // 1) availability
      const availabilityCheck = await this.checkRoomAvailability(
        roomTypeId,
        checkInDate,
        checkOutDate,
        roomsBooked,
        tx,
      );
      if (!availabilityCheck.available) {
        throw new BadRequestException(availabilityCheck.message);
      }
      const roomType = availabilityCheck.roomType;
  
      // 2) total price
      const { totalPrice, numberOfNights } = await this.calculateTotalPrice(
        roomTypeId,
        checkInDate,
        checkOutDate,
        roomsBooked,
        tx,
      );
  
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
        throw new BadRequestException(`Insufficient balance (need ${totalPrice})`);
      }
      const beforeBal = Number(walletAfter.balance) + totalPrice;
      const afterBal = Number(walletAfter.balance);
  
      // 4) refund policy
      const refundPolicyId = await this.getDefaultRefundPolicy(tx);
  
      // 5) create order
      const [order] = await tx
        .insert(schema.orders)
        .values({
          userId,
          status: 'CONFIRMED',
          totalAmount: totalPrice.toString(),
        })
        .returning();
  
      // 6) create order item
      await tx.insert(schema.orderItems).values({
        orderId: order.id,
        itemType: 'ROOM',
        itemId: roomTypeId,
        quantity: roomsBooked,
        unitPrice: roomType.baseNightlyRate.toString(),
        totalPrice: totalPrice.toString(),
        refundPolicyId,
      });
  
      // 7) normalize reservation source + sourceId
      const reservationSource = source ?? 'HOTEL_ONLY';
      const reservationSourceId =
        reservationSource === 'HOTEL_ONLY'
          ? order.id                      // bind hotel-only reservations to their order
          : (sourceId ?? order.id);       // fallback if caller left sourceId blank
  
      // 8) create reservation
      const [reservation] = await tx
        .insert(schema.roomReservations)
        .values({
          roomTypeId,
          checkInDate,
          checkOutDate,
          roomsBooked,
          source: reservationSource,
          sourceId: reservationSourceId,
          userId,
          refundPolicyId,
        })
        .returning();
  
      // 9) update inventory
      await this.updateRoomInventory(
        roomTypeId,
        checkInDate,
        checkOutDate,
        roomsBooked,
        tx,
      );
  
      // 10) ledger + payment history
      await tx.insert(schema.userTransactions).values({
        walletId: walletAfter.id,
        amount: (-totalPrice).toString(),
        source: 'BOOKING',
        status: 'POSTED',
        balanceBefore: beforeBal.toString(),
        balanceAfter: afterBal.toString(),
        orderId: order.id,
        note: `Booking #${reservation.id} (${roomsBooked} rooms)`,
      });
  
      await tx.insert(schema.paymentHistory).values({
        orderId: order.id,
        paymentAmount: totalPrice.toString(),
        paymentMethod: 'WALLET',
        paymentStatus: 'POSTED',
      });
  
      return {
        reservationId: reservation.id,
        orderId: order.id,
        totalAmount: totalPrice,
        checkInDate,
        checkOutDate,
        roomsBooked,
        roomTypeLabel: roomType.label,
        hotelName: roomType.hotel.name,
        currency: roomType.hotel.currency,
        numberOfNights,
      };
    });
  }
  

  async cancelRoomReservation(
    userId: string,
    reservationId: number,
  ): Promise<{ ok: true; refundedAmount: number }> {
    return this.db.transaction(async (tx) => {
      // 1) fetch reservation
      const res = await tx.query.roomReservations.findFirst({
        where: and(
          eq(schema.roomReservations.id, reservationId),
          eq(schema.roomReservations.userId, userId),
          isNull(schema.roomReservations.cancelledAt),
        ),
        columns: {
          id: true,
          roomTypeId: true,
          checkInDate: true,
          checkOutDate: true,
          roomsBooked: true,
          sourceId: true, // orderId
        },
      });
      if (!res) throw new NotFoundException('Reservation not found');
      const todayYMD = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
      if (todayYMD > res.checkInDate) {
        throw new BadRequestException('Stay already started; cancellation not allowed after check-in date.');
      }
  
      // 2) mark cancelled
      await tx
        .update(schema.roomReservations)
        .set({ cancelledAt: new Date() })
        .where(eq(schema.roomReservations.id, reservationId));
  
      // 3) restore inventory
      await this.updateRoomInventory(
        res.roomTypeId,
        res.checkInDate,
        res.checkOutDate,
        -res.roomsBooked,
        tx,
      );
  
      // 4) cancel order
      const orderId = res.sourceId!;
      await tx
        .update(schema.orders)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(schema.orders.id, orderId));
  
      // 5) compute refund %
      const today = new Date();
      const checkIn = new Date(res.checkInDate);
      const ms = checkIn.getTime() - today.getTime();
      const days = ms / (1000 * 60 * 60 * 24);
  
      let pct = 0;
      if (days > 7) pct = 1.0;
      else if (days > 5) pct = 0.8;
      else if (days > 3) pct = 0.4;
      else pct = 0;
  
      // 6) fetch original totalPrice
      const [{ totalPrice }] = await tx
        .select({ totalPrice: schema.orderItems.totalPrice })
        .from(schema.orderItems)
        .where(
          and(
            eq(schema.orderItems.orderId, orderId),
            eq(schema.orderItems.itemType, 'ROOM'),
            eq(schema.orderItems.itemId, res.roomTypeId),
          ),
        );
  
      const raw = Number(totalPrice);
      const refundAmount = parseFloat((raw * pct).toFixed(2));
  
      // 7) update orderItems.refundAmount
      await tx
        .update(schema.orderItems)
        .set({ refundAmount: refundAmount.toString() })
        .where(
          and(
            eq(schema.orderItems.orderId, orderId),
            eq(schema.orderItems.itemType, 'ROOM'),
            eq(schema.orderItems.itemId, res.roomTypeId),
          ),
        );
  
      // 8) credit wallet
      const [walletAfter] = await tx
        .update(schema.wallets)
        .set({
          balance: sql`${schema.wallets.balance} + ${refundAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.wallets.userId, userId))
        .returning({
          id: schema.wallets.id,
          balance: schema.wallets.balance,
        });
      if (!walletAfter) throw new Error('Wallet not found');
  
      const afterBal = Number(walletAfter.balance);
      const beforeBal = afterBal - refundAmount;
  
      // 9) ledger
      await tx.insert(schema.userTransactions).values({
        walletId: walletAfter.id,
        amount: refundAmount.toString(),
        source: 'REFUND',
        status: 'POSTED',
        balanceBefore: beforeBal.toString(),
        balanceAfter: afterBal.toString(),
        orderId,
        note: `Refund ${pct * 100}% for reservation #${reservationId}`,
      });
  
      // 10) payment history
      await tx.insert(schema.paymentHistory).values({
        orderId,
        paymentAmount: refundAmount.toString(),
        paymentMethod: 'WALLET',
        paymentStatus: refundAmount > 0 ? 'REFUNDED' : 'POSTED',
      });
  
      return { ok: true, refundedAmount: refundAmount };
    });
  }
}
