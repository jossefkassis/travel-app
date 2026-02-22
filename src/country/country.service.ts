/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/countries/country.service.ts

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { DRIZLE } from 'src/database.module';
import * as schema from '../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  eq,
  sql,
  inArray,
  isNull,
  asc,
  desc,
  isNotNull,
} from 'drizzle-orm';
import { CityService } from '../city/city.service';

// --- Type Definitions ---
// Drizzle's inferred types for select operations
type CountryRecord = typeof schema.countries.$inferSelect;
type AttachmentSelect = typeof schema.attachments.$inferSelect;
type FileObjectSelect = typeof schema.fileObjects.$inferSelect;

type FavouriteDTO = {
  userId: string | null;
  createdAt: Date | null;
};

// The final output type that the controller expects
export type CountryWithImages = Omit<CountryRecord, 'attachments'> & {
  mainImage: FileObjectSelect | null;
  galleryImages: FileObjectSelect[];
};

// Type for country with cities
export type CountryWithCities = CountryWithImages & {
  attachments?: any[]; // as you already return
  cities: any[]; // from cityService
  reviewsCount: number;
  favouritesCount: number;
  reviews: any[];
  favourites: FavouriteDTO[];
};

// Type for the raw result of a LEFT JOIN query
// This will represent one row from the flattened join result
type JoinedCountryAttachmentRow = {
  countries: CountryRecord;
  attachments: AttachmentSelect | null;
  // CHANGE THIS LINE:
  // fileObjects: FileObjectSelect | null;
  file_objects: FileObjectSelect | null; // <--- Changed from 'fileObjects' to 'file_objects'
};
@Injectable()
export class CountryService {
  constructor(
    @Inject(DRIZLE) private db: NodePgDatabase<typeof schema>,
    @Inject(forwardRef(() => CityService))
    private readonly cityService: CityService,
  ) {}

  private async getCountryEntityTypeId(
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<number> {
    const rec = await tx.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'country'),
      columns: { id: true },
    });
    if (!rec) {
      throw new Error(
        "Entity type 'country' is missing in the database. Please seed your entity_types table.",
      );
    }
    return rec.id;
  }

  private async getCityEntityTypeId(
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

  /**
   * Transforms a flat array of joined country/attachment/file_object rows
   * into a structured array of CountryWithImages, grouping attachments.
   */
  private processJoinedCountryResults(
    joinedResults: JoinedCountryAttachmentRow[],
  ): CountryWithImages[] {
    const countryMap = new Map<number, CountryWithImages>();

    for (const row of joinedResults) {
      const countryId = row.countries.id;
      if (!countryMap.has(countryId)) {
        // Initialize country entry if not already present
        countryMap.set(countryId, {
          ...row.countries,
          mainImage: null,
          galleryImages: [],
        });
      }

      const countryEntry = countryMap.get(countryId)!; // Non-null assertion is safe here

      // Process attachments if they exist for this row
      if (row.attachments && row.file_objects) {
        if (row.attachments.role === 'MAIN') {
          // Only assign if mainImage hasn't been found yet (or take the first one found)
          if (!countryEntry.mainImage) {
            countryEntry.mainImage = row.file_objects;
          }
        } else if (row.attachments.role === 'GALLERY') {
          countryEntry.galleryImages.push(row.file_objects);
        }
      }
    }

    // After populating, ensure gallery images are sorted
    const finalResults = Array.from(countryMap.values());

    return finalResults;
  }

  // --- CRUD Operations ---

  async create(createCountryDto: CreateCountryDto): Promise<CountryWithImages> {
    const {
      mainImageId,
      galleryImageIds = [],
      ...countryData
    } = createCountryDto;

    return this.db.transaction(async (tx) => {
      const [newCountry] = await tx
        .insert(schema.countries)
        .values({
          ...countryData,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning(); // Return the full new country object

      if (!newCountry) {
        throw new Error('Failed to create country.'); // Should ideally not happen with .returning()
      }

      const entityTypeId = await this.getCountryEntityTypeId(tx);

      // Handle mainImageId insertion
      if (mainImageId !== null && mainImageId !== undefined) {
        const fileObjectExists = await tx.query.fileObjects.findFirst({
          where: eq(schema.fileObjects.id, mainImageId),
          columns: { id: true },
        });
        if (!fileObjectExists) {
          throw new BadRequestException(
            `Main image ID ${mainImageId} not found.`,
          );
        }
        await tx.insert(schema.attachments).values({
          objectId: mainImageId,
          entityId: newCountry.id, // Use new country's ID
          entityTypeId,
          role: 'MAIN',
          sort: 0,
        });
      }

      // Handle galleryImageIds insertion
      if (galleryImageIds.length > 0) {
        const existingFileObjects = await tx.query.fileObjects.findMany({
          where: inArray(schema.fileObjects.id, galleryImageIds),
          columns: { id: true },
        });
        if (existingFileObjects.length !== galleryImageIds.length) {
          const foundIds = new Set(existingFileObjects.map((fo) => fo.id));
          const missingIds = galleryImageIds.filter(
            (imgId) => !foundIds.has(imgId),
          );
          throw new BadRequestException(
            `One or more gallery image IDs are invalid or not found: ${missingIds.join(', ')}`,
          );
        }

        const attachmentsToInsert: (typeof schema.attachments.$inferInsert)[] =
          galleryImageIds.map((fileObjectId, index) => ({
            objectId: fileObjectId,
            entityId: newCountry.id, // Use new country's ID
            entityTypeId,
            role: 'GALLERY',
            sort: index,
          }));
        await tx.insert(schema.attachments).values(attachmentsToInsert);
      }

      // Fetch the newly created country with its attachments for the response
      const rawResults = await tx
        .select()
        .from(schema.countries)
        .leftJoin(
          schema.attachments,
          and(
            eq(schema.attachments.entityId, schema.countries.id),
            eq(schema.attachments.entityTypeId, entityTypeId),
          ),
        )
        .leftJoin(
          schema.fileObjects,
          eq(schema.attachments.objectId, schema.fileObjects.id),
        )
        .where(eq(schema.countries.id, newCountry.id)); // Query using the new country's ID

      if (rawResults.length === 0) {
        throw new NotFoundException(
          `Country with ID ${newCountry.id} not found after creation.`,
        );
      }

      return this.processJoinedCountryResults(rawResults)[0];
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    orderBy: 'createdAt' | 'name' = 'createdAt',
    orderDir: 'asc' | 'desc' = 'desc',
  ): Promise<{
    data: CountryWithImages[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    orderBy: 'createdAt' | 'name';
    orderDir: 'asc' | 'desc';
  }> {
    const offset = (page - 1) * limit;
    const entityTypeId = await this.getCountryEntityTypeId();

    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.countries)
      .where(isNull(schema.countries.deletedAt));

    const totalCount = totalCountResult[0].count;

    // Determine order column and direction
    let orderColumn: any = schema.countries.createdAt;
    if (orderBy === 'name') {
      orderColumn = schema.countries.name;
    }
    const orderExpr = orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

    // Fetch countries with their attachments using explicit joins
    const rawResults = await this.db
      .select()
      .from(schema.countries)
      .leftJoin(
        schema.attachments,
        and(
          eq(schema.attachments.entityId, schema.countries.id),
          eq(schema.attachments.entityTypeId, entityTypeId),
        ),
      )
      .leftJoin(
        schema.fileObjects,
        eq(schema.attachments.objectId, schema.fileObjects.id),
      )
      .where(isNull(schema.countries.deletedAt))
      .limit(limit)
      .offset(offset)
      .orderBy(orderExpr);

    const transformedCountries: CountryWithImages[] =
      this.processJoinedCountryResults(rawResults);

    return {
      data: transformedCountries,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      orderBy,
      orderDir,
    };
  }

  async findOne(
    id: number,
    tx: NodePgDatabase<typeof schema> = this.db,
  ): Promise<CountryWithImages | null> {
    const entityTypeId = await this.getCountryEntityTypeId(tx);

    const rawResults = await tx
      .select()
      .from(schema.countries)
      .leftJoin(
        schema.attachments,
        and(
          eq(schema.attachments.entityId, schema.countries.id),
          eq(schema.attachments.entityTypeId, entityTypeId),
        ),
      )
      .leftJoin(
        schema.fileObjects,
        eq(schema.attachments.objectId, schema.fileObjects.id),
      )
      .where(eq(schema.countries.id, id));

    if (rawResults.length === 0) {
      return null; // No country found or no attachments for it
    }

    // Process the joined results (it will always be an array, take the first element)
    return this.processJoinedCountryResults(rawResults)[0];
  }

  async findOneClient(id: number): Promise<CountryWithCities | null> {
    const entityTypeId = await this.getCountryEntityTypeId();

    // 1) country + attachments
    const rawResults = await this.db
      .select()
      .from(schema.countries)
      .leftJoin(
        schema.attachments,
        and(
          eq(schema.attachments.entityId, schema.countries.id),
          eq(schema.attachments.entityTypeId, entityTypeId),
        ),
      )
      .leftJoin(
        schema.fileObjects,
        eq(schema.attachments.objectId, schema.fileObjects.id),
      )
      .where(
        and(
          eq(schema.countries.id, id),
          eq(schema.countries.is_active, true),
          isNull(schema.countries.deletedAt),
        ),
      );

    if (rawResults.length === 0) return null;
    const country = this.processJoinedCountryResults(rawResults)[0];

    // 2) cities
    const citiesResult = await this.cityService.findAllClient(
      1,
      1000,
      'createdAt',
      'desc',
      { countryId: id },
    );

    // 3) counts + enriched lists
    const [reviewsCountRow, favouritesCountRow, reviewsRaw, favouritesRaw] =
      await Promise.all([
        // count reviews
        this.db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(schema.reviews)
          .where(
            and(
              eq(schema.reviews.entityTypeId, entityTypeId),
              eq(schema.reviews.entityId, id),
              isNull(schema.reviews.deletedAt),
            ),
          ),

        // count favourites
        this.db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(schema.favourites)
          .where(
            and(
              eq(schema.favourites.entityTypeId, entityTypeId),
              eq(schema.favourites.entityId, id),
              isNull(schema.favourites.deletedAt),
            ),
          ),

        // reviews list + user info + avatar
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
              eq(schema.reviews.entityTypeId, entityTypeId),
              eq(schema.reviews.entityId, id),
              isNull(schema.reviews.deletedAt),
            ),
          )
          .orderBy(desc(schema.reviews.createdAt))
          .limit(50),

        // favourites list + user info + avatar
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
              eq(schema.favourites.entityTypeId, entityTypeId),
              eq(schema.favourites.entityId, id),
              isNull(schema.favourites.deletedAt),
            ),
          )
          .orderBy(desc(schema.favourites.createdAt)),
      ]);

    // map into final shapes
    const reviews: any[] = reviewsRaw.map((r) => ({
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

    const favourites: any[] = favouritesRaw.map((f) => ({
      createdAt: f.createdAt,
      user: {
        id: f.userId!,
        name: f.userName,
        avatarUrl: f.avatarBucket ? `${f.avatarBucket}/${f.avatarKey}` : null,
      },
    }));

    return {
      ...country,
      cities: citiesResult.data,
      reviewsCount: reviewsCountRow[0]?.count ?? 0,
      favouritesCount: favouritesCountRow[0]?.count ?? 0,
      reviews,
      favourites,
    };
  }

  async update(
    id: number,
    updateCountryDto: UpdateCountryDto,
  ): Promise<CountryWithImages> {
    const { mainImageId, galleryImageIds, ...countryData } = updateCountryDto;
    console.log('Full updateCountryDto:', updateCountryDto);
    console.log('countryData after destructuring:', countryData);
    console.log('is_active value:', countryData.is_active);
    console.log('Type of is_active:', typeof countryData.is_active);
    return this.db.transaction(async (tx) => {
      // 1. Update the base country data
      if (Object.keys(countryData).length > 0) {
        console.log('Data being sent to database update:', {
          ...countryData,
          updatedAt: new Date(),
        });
        const [updatedCountryBaseCheck] = await tx
          .update(schema.countries)
          .set({
            ...countryData,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.countries.id, id),
              isNull(schema.countries.deletedAt),
            ),
          )
          .returning({ id: schema.countries.id });

        if (!updatedCountryBaseCheck) {
          throw new NotFoundException(
            `Country with ID ${id} not found or is trashed.`,
          );
        }
      } else {
        // If only image IDs are sent, ensure the country exists before proceeding with attachments.
        const existingCountry = await tx.query.countries.findFirst({
          where: and(
            eq(schema.countries.id, id),
            isNull(schema.countries.deletedAt),
          ),
          columns: { id: true },
        });
        if (!existingCountry) {
          throw new NotFoundException(
            `Country with ID ${id} not found or is trashed.`,
          );
        }
      }

      // 2. Handle mainImageId updates conditionally
      const entityTypeId = await this.getCountryEntityTypeId(tx); // Get entityTypeId inside transaction

      if (mainImageId !== undefined) {
        // First, delete any existing MAIN attachment for this country
        await tx
          .delete(schema.attachments)
          .where(
            and(
              eq(schema.attachments.entityId, id),
              eq(schema.attachments.entityTypeId, entityTypeId),
              eq(schema.attachments.role, 'MAIN'),
            ),
          );

        // If a new mainImageId (number) was provided, insert it
        if (mainImageId !== null) {
          // Validate if mainImageId exists in fileObjects before inserting attachment
          const fileObjectExists = await tx.query.fileObjects.findFirst({
            where: eq(schema.fileObjects.id, mainImageId),
            columns: { id: true },
          });
          if (!fileObjectExists) {
            throw new BadRequestException(
              `Main image ID ${mainImageId} not found.`,
            );
          }

          await tx.insert(schema.attachments).values({
            objectId: mainImageId,
            entityId: id,
            entityTypeId,
            role: 'MAIN',
            sort: 0,
          });
        }
      }

      // 3. Handle galleryImageIds updates conditionally
      if (galleryImageIds !== undefined) {
        // Delete all existing GALLERY attachments for this country
        await tx
          .delete(schema.attachments)
          .where(
            and(
              eq(schema.attachments.entityId, id),
              eq(schema.attachments.entityTypeId, entityTypeId),
              eq(schema.attachments.role, 'GALLERY'),
            ),
          );

        // If new gallery images were provided (even an empty array means "clear all then add none")
        if (galleryImageIds.length > 0) {
          // Validate all galleryImageIds exist in fileObjects before inserting attachments
          const existingFileObjects = await tx.query.fileObjects.findMany({
            where: inArray(schema.fileObjects.id, galleryImageIds),
            columns: { id: true },
          });
          if (existingFileObjects.length !== galleryImageIds.length) {
            const foundIds = new Set(existingFileObjects.map((fo) => fo.id));
            const missingIds = galleryImageIds.filter(
              (imgId) => !foundIds.has(imgId),
            );
            throw new BadRequestException(
              `One or more gallery image IDs are invalid or not found: ${missingIds.join(', ')}`,
            );
          }

          const attachmentsToInsert: (typeof schema.attachments.$inferInsert)[] =
            galleryImageIds.map((fileObjectId, index) => ({
              objectId: fileObjectId,
              entityId: id,
              entityTypeId,
              role: 'GALLERY',
              sort: index,
            }));
          await tx.insert(schema.attachments).values(attachmentsToInsert);
        }
      }

      // 4. Fetch the updated country with its attachments for the response
      const rawResults = await tx
        .select()
        .from(schema.countries)
        .leftJoin(
          schema.attachments,
          and(
            eq(schema.attachments.entityId, schema.countries.id),
            eq(schema.attachments.entityTypeId, entityTypeId),
          ),
        )
        .leftJoin(
          schema.fileObjects,
          eq(schema.attachments.objectId, schema.fileObjects.id),
        )
        .where(eq(schema.countries.id, id));

      if (rawResults.length === 0) {
        throw new NotFoundException(
          `Country with ID ${id} not found after update operations.`,
        );
      }

      // 5. Transform and return the result
      return this.processJoinedCountryResults(rawResults)[0];
    });
  }

  async softDelete(id: number): Promise<{ message: string; id: number }> {
    return this.db.transaction(async (tx) => {
      const [deletedCountry] = await tx
        .update(schema.countries)
        .set({ deletedAt: new Date(), is_active: false })
        .where(eq(schema.countries.id, id))
        .returning({ id: schema.countries.id });
      if (!deletedCountry) {
        throw new NotFoundException(`Country with ID ${id} not found.`);
      }
      return {
        message: `Country with ID ${id} has been soft-deleted and deactivated.`,
        id: deletedCountry.id,
      };
    });
  }

  async restore(id: number): Promise<{ message: string; id: number }> {
    return this.db.transaction(async (tx) => {
      const [restoredCountry] = await tx
        .update(schema.countries)
        .set({ deletedAt: null })
        .where(eq(schema.countries.id, id))
        .returning({ id: schema.countries.id });
      if (!restoredCountry) {
        throw new NotFoundException(`Country with ID ${id} not found.`);
      }
      return {
        message: `Country with ID ${id} has been restored (deletedAt is now null, isActive remains false).`,
        id: restoredCountry.id,
      };
    });
  }

  async hardDelete(id: number): Promise<{ message: string; id: number }> {
    return this.db.transaction(async (tx) => {
      const [deletedCountry] = await tx
        .delete(schema.countries)
        .where(eq(schema.countries.id, id))
        .returning({ id: schema.countries.id });
      if (!deletedCountry) {
        throw new NotFoundException(`Country with ID ${id} not found.`);
      }
      return {
        message: `Country with ID ${id} has been hard-deleted.`,
        id: deletedCountry.id,
      };
    });
  }
  // --- Client-facing (Public) Endpoints ---

  async findAllClient(
    page: number = 1,
    limit: number = 10,
    orderBy: 'createdAt' | 'name' = 'createdAt',
    orderDir: 'asc' | 'desc' = 'desc',
  ): Promise<{
    data: CountryWithImages[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    orderBy: 'createdAt' | 'name';
    orderDir: 'asc' | 'desc';
  }> {
    const offset = (page - 1) * limit;
    const entityTypeId = await this.getCountryEntityTypeId();

    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.countries)
      .where(
        and(
          eq(schema.countries.is_active, true),
          isNull(schema.countries.deletedAt),
        ),
      );

    const totalCount = totalCountResult[0].count;

    let orderColumn: any = schema.countries.createdAt;
    if (orderBy === 'name') {
      orderColumn = schema.countries.name;
    }
    const orderExpr = orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const rawResults = await this.db
      .select()
      .from(schema.countries)
      .leftJoin(
        schema.attachments,
        and(
          eq(schema.attachments.entityId, schema.countries.id),
          eq(schema.attachments.entityTypeId, entityTypeId),
        ),
      )
      .leftJoin(
        schema.fileObjects,
        eq(schema.attachments.objectId, schema.fileObjects.id),
      )
      .where(
        and(
          eq(schema.countries.is_active, true),
          isNull(schema.countries.deletedAt),
        ),
      )
      .limit(limit)
      .offset(offset)
      .orderBy(orderExpr);

    const transformedCountries: CountryWithImages[] =
      this.processJoinedCountryResults(rawResults);
    return {
      data: transformedCountries,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      orderBy,
      orderDir,
    };
  }

  async findAllTrashed(
    page: number = 1,
    limit: number = 10,
    orderBy: 'deletedAt' | 'name' = 'deletedAt',
    orderDir: 'asc' | 'desc' = 'desc',
  ): Promise<{
    data: CountryWithImages[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    orderBy: 'deletedAt' | 'name';
    orderDir: 'asc' | 'desc';
  }> {
    const offset = (page - 1) * limit;
    const entityTypeId = await this.getCountryEntityTypeId();

    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.countries)
      .where(isNotNull(schema.countries.deletedAt));

    const totalCount = totalCountResult[0].count;

    let orderColumn: any = schema.countries.deletedAt;
    if (orderBy === 'name') {
      orderColumn = schema.countries.name;
    }
    const orderExpr = orderDir === 'asc' ? asc(orderColumn) : desc(orderColumn);

    const rawResults = await this.db
      .select()
      .from(schema.countries)
      .leftJoin(
        schema.attachments,
        and(
          eq(schema.attachments.entityId, schema.countries.id),
          eq(schema.attachments.entityTypeId, entityTypeId),
        ),
      )
      .leftJoin(
        schema.fileObjects,
        eq(schema.attachments.objectId, schema.fileObjects.id),
      )
      .where(sql`"countries"."deleted_at" IS NOT NULL`)
      .limit(limit)
      .offset(offset)
      .orderBy(orderExpr);

    const transformedCountries: CountryWithImages[] =
      this.processJoinedCountryResults(rawResults);
    return {
      data: transformedCountries,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      orderBy,
      orderDir,
    };
  }
}
