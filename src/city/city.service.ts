/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DRIZLE } from 'src/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { and, eq, ilike, desc, asc, sql, or, isNull } from 'drizzle-orm';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { HotelsService } from '../hotels/hotels.service';
import { AttractionsService } from '../attractions/attractions.service';

@Injectable()
export class CityService {
  constructor(
    @Inject(DRIZLE) private db: NodePgDatabase<typeof schema>,
    @Inject(forwardRef(() => HotelsService))
    private readonly hotelsService: HotelsService,
    @Inject(forwardRef(() => AttractionsService))
    private readonly attractionsService: AttractionsService,
  ) {}

  async create(createCityDto: CreateCityDto) {
    const {
      name,
      countryId,
      location,
      is_active = true,
      description,
      avgMealPrice,
      radius,
      mealPricePerPerson,
      transportRatePerKm,
    } = createCityDto;
    if (
      !location ||
      typeof location.lat !== 'number' ||
      typeof location.lon !== 'number'
    ) {
      throw new BadRequestException('location with lat and lon is required');
    }

    // Check if country exists
    const country = await this.db.query.countries.findFirst({
      where: eq(schema.countries.id, countryId),
    });

    if (!country) {
      throw new BadRequestException('Country not found');
    }

    // Generate slug from name
    const slug = this.generateSlug(name);

    // Check if city with same name in country already exists
    const existingCity = await this.db.query.cities.findFirst({
      where: and(
        eq(schema.cities.name, name),
        eq(schema.cities.countryId, countryId),
      ),
    });

    if (existingCity) {
      throw new BadRequestException(
        'City with this name already exists in this country',
      );
    }

    // Create city with location
    const [city] = await this.db
      .insert(schema.cities)
      .values({
        name,
        countryId,
        slug,
        center: sql`ST_SetSRID(ST_MakePoint(${location.lon}, ${location.lat}), 4326)`,
        isActive: is_active,
        description,
        avgMealPrice:
          avgMealPrice !== undefined ? avgMealPrice.toString() : undefined,
        radius: radius !== undefined ? radius.toString() : undefined,
      })
      .returning();

    if (city && mealPricePerPerson !== undefined) {
      await this.db.insert(schema.cityMealPrices).values({
        cityId: city.id,
        mealPricePerPerson: mealPricePerPerson.toString(),
      });
    }

    if (city && transportRatePerKm !== undefined) {
      await this.db.insert(schema.distanceRates).values({
        cityId: city.id,
        transportRatePerKm: transportRatePerKm.toString(),
      });
    }

    // Save attachments (main and gallery images)
    const cityEntityTypeId = await this.getCityEntityTypeId();
    if (cityEntityTypeId && city) {
      if (createCityDto.mainImageId) {
        await this.db.insert(schema.attachments).values({
          objectId: createCityDto.mainImageId,
          entityTypeId: cityEntityTypeId,
          entityId: city.id,
          role: 'MAIN',
        });
      }
      if (
        createCityDto.galleryImageIds &&
        Array.isArray(createCityDto.galleryImageIds)
      ) {
        for (const imgId of createCityDto.galleryImageIds) {
          await this.db.insert(schema.attachments).values({
            objectId: imgId,
            entityTypeId: cityEntityTypeId,
            entityId: city.id,
            role: 'GALLERY',
          });
        }
      }
    }

    return city;
  }

  async getCityEntityTypeId(
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<number> {
    const rec = await tx.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'city'),
      columns: { id: true },
    });
    if (!rec) {
      throw new Error(
        "Entity type 'city' is missing in the database. Please seed your entity_types table.",
      );
    }
    return rec.id;
  }

  async getHotelEntityTypeId(
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<number> {
    const rec = await tx.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'hotel'),
      columns: { id: true },
    });
    if (!rec) {
      throw new Error(
        "Entity type 'hotel' is missing in the database. Please seed your entity_types table.",
      );
    }
    return rec.id;
  }

  async getPoiEntityTypeId(
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<number> {
    const rec = await tx.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'poi'),
      columns: { id: true },
    });
    if (!rec) {
      throw new Error(
        "Entity type 'poi' is missing in the database. Please seed your entity_types table.",
      );
    }
    return rec.id;
  }

  private processJoinedCityResults(joinedResults: any[]): any[] {
    const cityMap = new Map<number, any>();
    for (const row of joinedResults) {
      const cityId = row.cities.id;
      if (!cityMap.has(cityId)) {
        cityMap.set(cityId, {
          ...row.cities,
          mainImage: null,
          galleryImages: [],
        });
      }
      const cityEntry = cityMap.get(cityId);
      if (row.attachments && row.file_objects) {
        if (row.attachments.role === 'MAIN') {
          if (!cityEntry.mainImage) {
            cityEntry.mainImage = row.file_objects;
          }
        } else if (row.attachments.role === 'GALLERY') {
          cityEntry.galleryImages.push(row.file_objects);
        }
      }
    }
    return Array.from(cityMap.values());
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    orderBy: 'createdAt' | 'name' = 'createdAt',
    orderDir: 'asc' | 'desc' = 'desc',
    filters: { countryId?: number; isActive?: boolean; search?: string } = {},
  ) {
    console.log('filters.search items', filters.search);
    const offset = (page - 1) * limit;
    const conditions: any[] = [];
    if (filters.countryId) {
      conditions.push(eq(schema.cities.countryId, filters.countryId));
    }
    if (filters.isActive !== undefined) {
      conditions.push(eq(schema.cities.isActive, filters.isActive));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(schema.cities.name, `%${filters.search}%`),
          ilike(schema.cities.description, `%${filters.search}%`),
        ),
      );
    }
    conditions.push(sql`"cities"."deleted_at" IS NULL`);
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cities)
      .where(conditions.length ? and(...conditions) : undefined);
    const totalCount = totalCountResult[0].count;
    let orderColumn: any = schema.cities.createdAt;
    if (orderBy === 'name') orderColumn = schema.cities.name;
    const orderExpr = orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

    // Fetch cities with their attachments using explicit joins
    const cityEntityTypeId = await this.getCityEntityTypeId();
    const rawResults = await this.db
      .select()
      .from(schema.cities)
      .leftJoin(
        schema.attachments,
        and(
          eq(schema.attachments.entityId, schema.cities.id),
          eq(schema.attachments.entityTypeId, cityEntityTypeId),
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

    const transformedCities = this.processJoinedCityResults(rawResults);

    return {
      data: transformedCities,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      orderBy,
      orderDir,
      filters,
    };
  }

  async findAllClient(
    page: number = 1,
    limit: number = 10,
    orderBy: 'createdAt' | 'name' = 'createdAt',
    orderDir: 'asc' | 'desc' = 'desc',
    filters: { countryId?: number; search?: string } = {},
  ) {
    // Use the same logic as findAll, but only active cities
    return this.findAll(page, limit, orderBy, orderDir, {
      ...filters,
      isActive: true,
    });
  }

  async findAllTrashed(
    page: number = 1,
    limit: number = 10,
    orderBy: 'deletedAt' | 'name' = 'deletedAt',
    orderDir: 'asc' | 'desc' = 'desc',
    filters: { countryId?: number; search?: string } = {},
  ) {
    const offset = (page - 1) * limit;
    const conditions: any[] = [sql`"cities"."deleted_at" IS NOT NULL`];
    if (filters.countryId) {
      conditions.push(eq(schema.cities.countryId, filters.countryId));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(schema.cities.name, `%${filters.search}%`),
          ilike(schema.cities.description, `%${filters.search}%`),
        ),
      );
    }
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cities)
      .where(conditions.length ? and(...conditions) : undefined);
    const totalCount = totalCountResult[0].count;
    let orderColumn: any = schema.cities.deletedAt;
    if (orderBy === 'name') orderColumn = schema.cities.name;
    const orderExpr = orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

    // Use with for meal price and distance rate
    const data = await this.db.query.cities.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      limit,
      offset,
      orderBy: [orderExpr],
      with: {
        country: true,
        cityMealPrices: true,
        distanceRates: true,
      },
    });

    // Fetch city entityTypeId for images
    const cityEntityTypeId = await this.getCityEntityTypeId();
    const dataWithImages = await Promise.all(
      data.map(async (city) => {
        // Get images (main and gallery)
        const attachments = await this.db.query.attachments.findMany({
          where: and(
            eq(schema.attachments.entityTypeId, cityEntityTypeId),
            eq(schema.attachments.entityId, city.id),
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
        const mealPricePerPerson =
          city.cityMealPrices?.[0]?.mealPricePerPerson ?? null;
        const transportRatePerKm =
          city.distanceRates?.[0]?.transportRatePerKm ?? null;
        return {
          ...city,
          mainImage,
          galleryImages,
          mealPricePerPerson,
          transportRatePerKm,
        };
      }),
    );

    return {
      data: dataWithImages,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      orderBy,
      orderDir,
      filters,
    };
  }

  async softDelete(id: number) {
    const [city] = await this.db
      .update(schema.cities)
      .set({ deletedAt: new Date(), isActive: false })
      .where(eq(schema.cities.id, id))
      .returning();
    if (!city) throw new NotFoundException(`City with ID ${id} not found.`);
    return {
      message: `City with ID ${id} has been soft-deleted and deactivated.`,
      id: city.id,
    };
  }

  async restore(id: number) {
    const [city] = await this.db
      .update(schema.cities)
      .set({ deletedAt: null })
      .where(eq(schema.cities.id, id))
      .returning();
    if (!city) throw new NotFoundException(`City with ID ${id} not found.`);
    return {
      message: `City with ID ${id} has been restored (deletedAt is now null, isActive remains false).`,
      id: city.id,
    };
  }

  async hardDelete(id: number) {
    const [city] = await this.db
      .delete(schema.cities)
      .where(eq(schema.cities.id, id))
      .returning();
    if (!city) throw new NotFoundException(`City with ID ${id} not found.`);
    return {
      message: `City with ID ${id} has been hard-deleted.`,
      id: city.id,
    };
  }

  async findOne(id: number) {
    const cityEntityTypeId = await this.getCityEntityTypeId();
    const city = await this.db.query.cities.findFirst({
      where: eq(schema.cities.id, id),
      with: {
        country: true,
        cityMealPrices: true,
        distanceRates: true,
      },
    });
    if (!city) {
      throw new NotFoundException('City not found');
    }
    // Get images (main and gallery)
    const attachments = await this.db.query.attachments.findMany({
      where: and(
        eq(schema.attachments.entityTypeId, cityEntityTypeId),
        eq(schema.attachments.entityId, city.id),
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
    const [reviewsCountRow, favouritesCountRow, reviewsRaw, favouritesRaw] =
      await Promise.all([
        // count reviews
        this.db
          .select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
          .from(schema.reviews)
          .where(
            and(
              eq(schema.reviews.entityTypeId, cityEntityTypeId),
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
              eq(schema.favourites.entityTypeId, cityEntityTypeId),
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
              eq(schema.reviews.entityTypeId, cityEntityTypeId),
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
              eq(schema.favourites.entityTypeId, cityEntityTypeId),
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

    // 5) return combined
    return {
      ...city,
      mainImage,
      galleryImages,
      reviewsCount: reviewsCountRow[0]?.count ?? 0,
      favouritesCount: favouritesCountRow[0]?.count ?? 0,
      reviews,
      favourites,
    };
  }

  async findOneWithHotelsAndAttractions(id: number) {
    const cityEntityTypeId = await this.getCityEntityTypeId();

    // Get city with basic data
    const city = await this.db.query.cities.findFirst({
      where: eq(schema.cities.id, id),
      with: {
        country: true,
        cityMealPrices: true,
        distanceRates: true,
      },
      columns: {
        id: true,
        name: true,
        slug: true,
        description: true,
        countryId: true,
        radius: true,
        center:true,
        avgMealPrice: true,
        isActive: true,
        avgRating: true,
        ratingCount: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    if (!city) {
      throw new NotFoundException('City not found');
    }

    // Get city images
    const cityAttachments = await this.db.query.attachments.findMany({
      where: and(
        eq(schema.attachments.entityTypeId, cityEntityTypeId),
        eq(schema.attachments.entityId, city.id),
      ),
      with: { fileObject: true },
    });
    let cityMainImage: any = null;
    const cityGalleryImages: any[] = [];
    for (const att of cityAttachments) {
      if (att.role === 'MAIN' && att.fileObject) cityMainImage = att.fileObject;
      if (att.role === 'GALLERY' && att.fileObject)
        cityGalleryImages.push(att.fileObject);
    }

    // Get hotels and attractions using the service methods
    const hotels = await this.hotelsService.findAllByCityId(id);
    const attractions = await this.attractionsService.findAllByCityId(id);

    const mealPricePerPerson =
      city.cityMealPrices?.[0]?.mealPricePerPerson ?? null;
    const transportRatePerKm =
      city.distanceRates?.[0]?.transportRatePerKm ?? null;

    return {
      ...city,
      mainImage: cityMainImage,
      galleryImages: cityGalleryImages,
      mealPricePerPerson,
      transportRatePerKm,
      hotels,
      attractions,
    };
  }

  async findBySlug(slug: string) {
    const city = await this.db.query.cities.findFirst({
      where: eq(schema.cities.slug, slug),
      with: {
        country: true,
        hotels: {
          where: eq(schema.hotels.isActive, true),
          with: {
            roomTypes: {
              where: eq(schema.hotelRoomTypes.isActive, true),
            },
          },
        },
        airports: {
          where: eq(schema.airports.is_active, true),
        },
        pois: {
          where: eq(schema.pois.is_active, true),
          with: {
            poiType: true,
          },
        },
      },
    });

    if (!city) {
      throw new NotFoundException('City not found');
    }

    return city;
  }

  async searchCities(searchTerm: string, limit = 10) {
    const cities = await this.db.query.cities.findMany({
      where: and(
        ilike(schema.cities.name, `%${searchTerm}%`),
        eq(schema.cities.isActive, true),
      ),
      with: {
        country: true,
      },
      limit,
      orderBy: [asc(schema.cities.name)],
    });

    return cities;
  }

  async getPopularCities(limit = 10) {
    const cities = await this.db.query.cities.findMany({
      where: eq(schema.cities.isActive, true),
      with: {
        country: true,
      },
      limit,
      orderBy: [desc(schema.cities.avgRating), desc(schema.cities.ratingCount)],
    });

    return cities;
  }

  async update(id: number, updateCityDto: UpdateCityDto) {
    const city = await this.findOne(id);
    if (!city) {
      throw new NotFoundException('City not found');
    }
    const updateData: any = {};
    if (updateCityDto.name) {
      updateData.name = updateCityDto.name;
      updateData.slug = this.generateSlug(updateCityDto.name);
    }
    if (updateCityDto.countryId) {
      // Check if country exists
      const country = await this.db.query.countries.findFirst({
        where: eq(schema.countries.id, updateCityDto.countryId),
      });
      if (!country) {
        throw new BadRequestException('Country not found');
      }
      updateData.countryId = updateCityDto.countryId;
    }
    if (updateCityDto.description) {
      updateData.description = updateCityDto.description;
    }
    if (updateCityDto.avgMealPrice !== undefined) {
      updateData.avgMealPrice = updateCityDto.avgMealPrice;
    }
    if (updateCityDto.isActive !== undefined) {
      updateData.isActive = updateCityDto.isActive;
    }
    if (updateCityDto.location) {
      updateData.center = sql`ST_SetSRID(ST_MakePoint(${updateCityDto.location.lon}, ${updateCityDto.location.lat}), 4326)`;
    }
    if (updateCityDto.radius !== undefined) {
      updateData.radius = updateCityDto.radius;
    }
    // Update city
    await this.db
      .update(schema.cities)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(schema.cities.id, id));

    // Update attachments if new image IDs are provided
    const cityEntityTypeId = await this.getCityEntityTypeId();
    if (cityEntityTypeId) {
      if (updateCityDto.mainImageId) {
        // Remove old main image
        await this.db
          .delete(schema.attachments)
          .where(
            and(
              eq(schema.attachments.entityTypeId, cityEntityTypeId),
              eq(schema.attachments.entityId, id),
              eq(schema.attachments.role, 'MAIN'),
            ),
          );
        // Add new main image
        await this.db.insert(schema.attachments).values({
          objectId: updateCityDto.mainImageId,
          entityTypeId: cityEntityTypeId,
          entityId: id,
          role: 'MAIN',
        });
      }
      if (
        updateCityDto.galleryImageIds &&
        Array.isArray(updateCityDto.galleryImageIds)
      ) {
        // Remove old gallery images
        await this.db
          .delete(schema.attachments)
          .where(
            and(
              eq(schema.attachments.entityTypeId, cityEntityTypeId),
              eq(schema.attachments.entityId, id),
              eq(schema.attachments.role, 'GALLERY'),
            ),
          );
        // Add new gallery images
        for (const imgId of updateCityDto.galleryImageIds) {
          await this.db.insert(schema.attachments).values({
            objectId: imgId,
            entityTypeId: cityEntityTypeId,
            entityId: id,
            role: 'GALLERY',
          });
        }
      }
    }
    // Update cityMealPrices if provided
    if (updateCityDto.mealPricePerPerson !== undefined) {
      const existingMealPrice = await this.db.query.cityMealPrices.findFirst({
        where: eq(schema.cityMealPrices.cityId, id),
      });
      if (existingMealPrice) {
        await this.db
          .update(schema.cityMealPrices)
          .set({
            mealPricePerPerson: updateCityDto.mealPricePerPerson.toString(),
            updatedAt: new Date(),
          })
          .where(eq(schema.cityMealPrices.cityId, id));
      } else {
        await this.db.insert(schema.cityMealPrices).values({
          cityId: id,
          mealPricePerPerson: updateCityDto.mealPricePerPerson.toString(),
        });
      }
    }
    // Update distanceRates if provided
    if (updateCityDto.transportRatePerKm !== undefined) {
      const existingRate = await this.db.query.distanceRates.findFirst({
        where: eq(schema.distanceRates.cityId, id),
      });
      if (existingRate) {
        await this.db
          .update(schema.distanceRates)
          .set({
            transportRatePerKm: updateCityDto.transportRatePerKm.toString(),
            updatedAt: new Date(),
          })
          .where(eq(schema.distanceRates.cityId, id));
      } else {
        await this.db.insert(schema.distanceRates).values({
          cityId: id,
          transportRatePerKm: updateCityDto.transportRatePerKm.toString(),
        });
      }
    }
    // Return updated city with images and prices
    return this.findOne(id);
  }

  async remove(id: number) {
    // Check if city has related data
    const hasHotels = await this.db.query.hotels.findFirst({
      where: eq(schema.hotels.cityId, id),
    });

    const hasAirports = await this.db.query.airports.findFirst({
      where: eq(schema.airports.cityId, id),
    });

    const hasPois = await this.db.query.pois.findFirst({
      where: eq(schema.pois.cityId, id),
    });

    if (hasHotels || hasAirports || hasPois) {
      throw new BadRequestException(
        'Cannot delete city with related data. Consider deactivating instead.',
      );
    }

    await this.db
      .update(schema.cities)
      .set({ deletedAt: new Date() })
      .where(eq(schema.cities.id, id));

    return { message: 'City deleted successfully' };
  }

  async deactivate(id: number) {
    await this.db
      .update(schema.cities)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.cities.id, id));

    return { message: 'City deactivated successfully' };
  }

  async activate(id: number) {
    await this.db
      .update(schema.cities)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(schema.cities.id, id));

    return { message: 'City activated successfully' };
  }

  async getCityStats(id: number) {
    const city = await this.findOne(id);

    // Get counts
    const hotels = await this.db.query.hotels.findMany({
      where: and(
        eq(schema.hotels.cityId, id),
        eq(schema.hotels.isActive, true),
      ),
    });

    const airports = await this.db.query.airports.findMany({
      where: and(
        eq(schema.airports.cityId, id),
        eq(schema.airports.is_active, true),
      ),
    });

    const pois = await this.db.query.pois.findMany({
      where: and(eq(schema.pois.cityId, id), eq(schema.pois.is_active, true)),
    });

    return {
      city,
      stats: {
        hotels: hotels.length,
        airports: airports.length,
        pointsOfInterest: pois.length,
      },
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
