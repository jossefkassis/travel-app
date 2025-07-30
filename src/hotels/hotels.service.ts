import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { DRIZLE } from '../database.module';
import { CreateHotelDto } from './dto/create-hotel.dto';
import { UpdateHotelDto } from './dto/update-hotel.dto';
import { eq, and, sql, asc, desc, ilike, or } from 'drizzle-orm';

@Injectable()
export class HotelsService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getHotelEntityTypeId(tx: NodePgDatabase<typeof schema> = this.db): Promise<number> {
    const rec = await tx.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'hotel'),
      columns: { id: true },
    });
    if (!rec) throw new BadRequestException('Hotel entity type not found');
    return rec.id;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    orderBy: 'createdAt' | 'name' | 'stars' | 'avgRating' = 'createdAt',
    orderDir: 'asc' | 'desc' = 'desc',
    filters: { cityId?: number; isActive?: boolean; search?: string; stars?: number } = {},
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
          ilike(schema.hotels.description, `%${filters.search}%`)
        )
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
          }
        }
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
    const hotelsWithImages = await Promise.all(hotels.map(async (hotel) => {
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
        if (att.role === 'GALLERY' && att.fileObject) galleryImages.push(att.fileObject);
      }
      
      return { ...hotel, mainImage, galleryImages };
    }));

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
            // Temporarily exclude center geometry field
            // center: true,
          }
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
      if (att.role === 'GALLERY' && att.fileObject) galleryImages.push(att.fileObject);
    }

    return { ...hotel, mainImage, galleryImages };
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
      galleryImageIds 
    } = createHotelDto;

    // Validate location
    if (!location || typeof location.lat !== 'number' || typeof location.lon !== 'number') {
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
      throw new BadRequestException('Hotel with this name already exists in this city');
    }

    // Create hotel
    const [hotel] = await this.db.insert(schema.hotels).values({
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
    }).returning();

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
      galleryImageIds 
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
        throw new BadRequestException('Hotel with this name already exists in this city');
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
    await this.db.update(schema.hotels).set(updateData).where(eq(schema.hotels.id, id));

    // Update attachments if provided
    const hotelEntityTypeId = await this.getHotelEntityTypeId();
    if (hotelEntityTypeId) {
      // Delete existing attachments
      await this.db.delete(schema.attachments).where(
        and(
          eq(schema.attachments.entityTypeId, hotelEntityTypeId),
          eq(schema.attachments.entityId, id),
        )
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
      deletedHotelId: id 
    };
  }

  async findAllByCityId(cityId: number) {
    // Get total count of hotels for this city
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.hotels)
      .where(
        and(
          eq(schema.hotels.cityId, cityId),
          eq(schema.hotels.isActive, true),
          sql`"hotels"."deleted_at" IS NULL`,
        )
      );
    const totalCount = totalCountResult[0].count;

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
        deletedAt: true,
      },
    });

    // Get images for each hotel
    const hotelEntityTypeId = await this.getHotelEntityTypeId();
    const hotelsWithImages = await Promise.all(hotels.map(async (hotel) => {
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
        if (att.role === 'GALLERY' && att.fileObject) galleryImages.push(att.fileObject);
      }
      
      return { ...hotel, mainImage, galleryImages };
    }));

    return hotelsWithImages;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
