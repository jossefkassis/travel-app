import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { DRIZLE } from '../database.module';
import { CreateRoomTypeDto } from './dto/create-room-type.dto';
import { UpdateRoomTypeDto } from './dto/update-room-type.dto';
import { eq, and, sql, asc, desc, ilike, or } from 'drizzle-orm';

@Injectable()
export class RoomTypesService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getRoomTypeEntityTypeId(tx: NodePgDatabase<typeof schema> = this.db): Promise<number> {
    const rec = await tx.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'roomType'),
      columns: { id: true },
    });
    if (!rec) throw new BadRequestException('Room type entity type not found');
    return rec.id;
  }

  async findAll(
    hotelId: number,
    page: number = 1,
    limit: number = 10,
    orderBy: 'createdAt' | 'label' | 'baseNightlyRate' | 'capacity' = 'createdAt',
    orderDir: 'asc' | 'desc' = 'desc',
    filters: { isActive?: boolean; search?: string; minPrice?: number; maxPrice?: number; minCapacity?: number } = {},
  ) {
    const offset = (page - 1) * limit;
    const conditions: any[] = [eq(schema.hotelRoomTypes.hotelId, hotelId)];
    
    if (filters.isActive !== undefined) {
      conditions.push(eq(schema.hotelRoomTypes.isActive, filters.isActive));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(schema.hotelRoomTypes.label, `%${filters.search}%`),
          ilike(schema.hotelRoomTypes.description, `%${filters.search}%`)
        )
      );
    }
    if (filters.minPrice) {
      conditions.push(sql`${schema.hotelRoomTypes.baseNightlyRate} >= ${filters.minPrice}`);
    }
    if (filters.maxPrice) {
      conditions.push(sql`${schema.hotelRoomTypes.baseNightlyRate} <= ${filters.maxPrice}`);
    }
    if (filters.minCapacity) {
      conditions.push(sql`${schema.hotelRoomTypes.capacity} >= ${filters.minCapacity}`);
    }

    // Get total count
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.hotelRoomTypes)
      .where(conditions.length ? and(...conditions) : undefined);
    const totalCount = totalCountResult[0].count;

    // Determine order column
    let orderColumn: any = schema.hotelRoomTypes.createdAt;
    if (orderBy === 'label') orderColumn = schema.hotelRoomTypes.label;
    if (orderBy === 'baseNightlyRate') orderColumn = schema.hotelRoomTypes.baseNightlyRate;
    if (orderBy === 'capacity') orderColumn = schema.hotelRoomTypes.capacity;
    const orderExpr = orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

    // Fetch room types with hotel relation
    const roomTypes = await this.db.query.hotelRoomTypes.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      with: {
        hotel: {
          columns: {
            id: true,
            name: true,
            slug: true,
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
          }
        },
        roomInventory: {
          columns: {
            id: true,
            date: true,
            totalRooms: true,
            bookedRooms: true,
            availableRooms: true,
            updatedAt: true,
          },
          orderBy: [asc(schema.roomInventory.date)],
        },
      },
      limit,
      offset,
      orderBy: [orderExpr],
      columns: {
        id: true,
        hotelId: true,
        label: true,
        description: true,
        capacity: true,
        totalRooms: true,
        baseNightlyRate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Fetch images for each room type and process inventory
    const roomTypeEntityTypeId = await this.getRoomTypeEntityTypeId();
    const roomTypesWithImages = await Promise.all(roomTypes.map(async (roomType) => {
      const attachments = await this.db.query.attachments.findMany({
        where: and(
          eq(schema.attachments.entityTypeId, roomTypeEntityTypeId),
          eq(schema.attachments.entityId, roomType.id),
        ),
        with: { fileObject: true },
      });
      
      let mainImage: any = null;
      const galleryImages: any[] = [];
      for (const att of attachments) {
        if (att.role === 'MAIN' && att.fileObject) mainImage = att.fileObject;
        if (att.role === 'GALLERY' && att.fileObject) galleryImages.push(att.fileObject);
      }

      // Process inventory data
      const inventorySummary = this.processInventoryData(roomType.roomInventory);
      
      return { 
        ...roomType, 
        mainImage, 
        galleryImages,
        inventorySummary,
      };
    }));

    return {
      data: roomTypesWithImages,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      orderBy,
      orderDir,
      filters: { ...filters, hotelId },
    };
  }

  async findOne(id: number) {
    const roomType = await this.db.query.hotelRoomTypes.findFirst({
      where: eq(schema.hotelRoomTypes.id, id),
      with: {
        hotel: {
          columns: {
            id: true,
            name: true,
            slug: true,
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
          }
        },
        roomInventory: {
          columns: {
            id: true,
            date: true,
            totalRooms: true,
            bookedRooms: true,
            availableRooms: true,
            updatedAt: true,
          },
          orderBy: [asc(schema.roomInventory.date)],
        },
      },
      columns: {
        id: true,
        hotelId: true,
        label: true,
        description: true,
        capacity: true,
        totalRooms: true,
        baseNightlyRate: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!roomType) {
      throw new NotFoundException('Room type not found');
    }

    // Fetch images
    const roomTypeEntityTypeId = await this.getRoomTypeEntityTypeId();
    const attachments = await this.db.query.attachments.findMany({
      where: and(
        eq(schema.attachments.entityTypeId, roomTypeEntityTypeId),
        eq(schema.attachments.entityId, roomType.id),
      ),
      with: { fileObject: true },
    });
    
    let mainImage: any = null;
    const galleryImages: any[] = [];
    for (const att of attachments) {
      if (att.role === 'MAIN' && att.fileObject) mainImage = att.fileObject;
      if (att.role === 'GALLERY' && att.fileObject) galleryImages.push(att.fileObject);
    }

    // Process inventory data to show availability summary
    const inventorySummary = this.processInventoryData(roomType.roomInventory);

    return { 
      ...roomType, 
      mainImage, 
      galleryImages,
      inventorySummary,
    };
  }

  private processInventoryData(inventory: any[]): {
    totalDays: number;
    availableDays: number;
    fullyBookedDays: number;
    partiallyBookedDays: number;
    nextAvailableDate?: string;
    availabilityByDate: Array<{
      date: string;
      totalRooms: number;
      bookedRooms: number;
      availableRooms: number;
      occupancyRate: number;
    }>;
  } {
    if (!inventory || inventory.length === 0) {
      return {
        totalDays: 0,
        availableDays: 0,
        fullyBookedDays: 0,
        partiallyBookedDays: 0,
        availabilityByDate: [],
      };
    }

    let availableDays = 0;
    let fullyBookedDays = 0;
    let partiallyBookedDays = 0;
    let nextAvailableDate: string | undefined;

    const availabilityByDate = inventory.map(item => {
      const occupancyRate = (item.bookedRooms / item.totalRooms) * 100;
      
      if (item.availableRooms === item.totalRooms) {
        availableDays++;
        if (!nextAvailableDate) {
          nextAvailableDate = item.date;
        }
      } else if (item.availableRooms === 0) {
        fullyBookedDays++;
      } else {
        partiallyBookedDays++;
        if (!nextAvailableDate) {
          nextAvailableDate = item.date;
        }
      }

      return {
        date: item.date,
        totalRooms: item.totalRooms,
        bookedRooms: item.bookedRooms,
        availableRooms: item.availableRooms,
        occupancyRate: Math.round(occupancyRate * 100) / 100, // Round to 2 decimal places
      };
    });

    return {
      totalDays: inventory.length,
      availableDays,
      fullyBookedDays,
      partiallyBookedDays,
      nextAvailableDate,
      availabilityByDate,
    };
  }

  async create(hotelId: number, createRoomTypeDto: CreateRoomTypeDto) {
    const { 
      label, 
      description, 
      capacity, 
      totalRooms, 
      baseNightlyRate,
      mainImageId,
      galleryImageIds 
    } = createRoomTypeDto;

    // Check if hotel exists
    const hotel = await this.db.query.hotels.findFirst({
      where: eq(schema.hotels.id, hotelId),
    });
    if (!hotel) {
      throw new BadRequestException('Hotel not found');
    }

    // Check if room type with same label in hotel already exists
    const existingRoomType = await this.db.query.hotelRoomTypes.findFirst({
      where: and(
        eq(schema.hotelRoomTypes.label, label),
        eq(schema.hotelRoomTypes.hotelId, hotelId),
      ),
    });
    if (existingRoomType) {
      throw new BadRequestException('Room type with this label already exists in this hotel');
    }

    // Create room type
    const [roomType] = await this.db.insert(schema.hotelRoomTypes).values({
      hotelId,
      label,
      description,
      capacity,
      totalRooms,
      baseNightlyRate: baseNightlyRate.toString(),
    }).returning();

    // Save attachments (main and gallery images)
    const roomTypeEntityTypeId = await this.getRoomTypeEntityTypeId();
    if (roomTypeEntityTypeId && roomType) {
      if (mainImageId) {
        await this.db.insert(schema.attachments).values({
          objectId: mainImageId,
          entityTypeId: roomTypeEntityTypeId,
          entityId: roomType.id,
          role: 'MAIN',
        });
      }
      if (galleryImageIds && Array.isArray(galleryImageIds)) {
        for (const imgId of galleryImageIds) {
          await this.db.insert(schema.attachments).values({
            objectId: imgId,
            entityTypeId: roomTypeEntityTypeId,
            entityId: roomType.id,
            role: 'GALLERY',
          });
        }
      }
    }

    return this.findOne(roomType.id);
  }

  async update(id: number, updateRoomTypeDto: UpdateRoomTypeDto) {
    const roomType = await this.db.query.hotelRoomTypes.findFirst({
      where: eq(schema.hotelRoomTypes.id, id),
    });
    if (!roomType) {
      throw new NotFoundException('Room type not found');
    }

    const { 
      label, 
      description, 
      capacity, 
      totalRooms, 
      baseNightlyRate,
      mainImageId,
      galleryImageIds 
    } = updateRoomTypeDto;

    // Check for label conflict if label is being updated
    if (label && label !== roomType.label) {
      const existingRoomType = await this.db.query.hotelRoomTypes.findFirst({
        where: and(
          eq(schema.hotelRoomTypes.label, label),
          eq(schema.hotelRoomTypes.hotelId, roomType.hotelId),
          sql`"hotel_room_types"."id" != ${id}`,
        ),
      });
      if (existingRoomType) {
        throw new BadRequestException('Room type with this label already exists in this hotel');
      }
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(),
    };
    if (label !== undefined) updateData.label = label;
    if (description !== undefined) updateData.description = description;
    if (capacity !== undefined) updateData.capacity = capacity;
    if (totalRooms !== undefined) updateData.totalRooms = totalRooms;
    if (baseNightlyRate !== undefined) updateData.baseNightlyRate = baseNightlyRate.toString();

    // Update room type
    await this.db.update(schema.hotelRoomTypes).set(updateData).where(eq(schema.hotelRoomTypes.id, id));

    // Update attachments if provided
    const roomTypeEntityTypeId = await this.getRoomTypeEntityTypeId();
    if (roomTypeEntityTypeId) {
      // Delete existing attachments
      await this.db.delete(schema.attachments).where(
        and(
          eq(schema.attachments.entityTypeId, roomTypeEntityTypeId),
          eq(schema.attachments.entityId, id),
        )
      );

      // Insert new attachments
      if (mainImageId) {
        await this.db.insert(schema.attachments).values({
          objectId: mainImageId,
          entityTypeId: roomTypeEntityTypeId,
          entityId: id,
          role: 'MAIN',
        });
      }
      if (galleryImageIds && Array.isArray(galleryImageIds)) {
        for (const imgId of galleryImageIds) {
          await this.db.insert(schema.attachments).values({
            objectId: imgId,
            entityTypeId: roomTypeEntityTypeId,
            entityId: id,
            role: 'GALLERY',
          });
        }
      }
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    const roomType = await this.db.query.hotelRoomTypes.findFirst({
      where: eq(schema.hotelRoomTypes.id, id),
    });
    if (!roomType) {
      throw new NotFoundException('Room type not found');
    }

    // Delete room type (this will cascade to reservations)
    await this.db.delete(schema.hotelRoomTypes).where(eq(schema.hotelRoomTypes.id, id));

    return { 
      message: `Room type with ID ${id} has been deleted successfully.`,
      deletedRoomTypeId: id 
    };
  }
} 