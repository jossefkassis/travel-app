/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { DRIZLE } from 'src/database.module';
import * as schema from '../db/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';

type CountryRecord = typeof schema.countries.$inferSelect;
type CountryWithImages = Omit<
  typeof schema.countries.$inferSelect,
  'attachments'
> & {
  mainImage: typeof schema.fileObjects.$inferSelect | null;
  galleryImages: (typeof schema.fileObjects.$inferSelect)[];
};

@Injectable()
export class CountryService {
  constructor(@Inject(DRIZLE) private db: NodePgDatabase<typeof schema>) {}

  create(createCountryDto: CreateCountryDto) {
    const {
      mainImageId,
      galleryImageIds = [],
      ...countryData
    } = createCountryDto;

    return this.db.transaction(async (tx) => {
      // Step 1: Insert country
      try {
        const [country] = await tx
          .insert(schema.countries)
          .values({
            ...countryData,
          })
          .returning();

        // Step 2: Prepare attachments
        const attachments: (typeof schema.attachments.$inferInsert)[] = [];

        if (mainImageId) {
          attachments.push({
            objectId: Number(mainImageId),
            entityId: country.id,
            entityType: 'country',
            role: 'MAIN',
            sort: 0,
          });
        }

        if (galleryImageIds.length) {
          galleryImageIds.forEach((id, index) => {
            attachments.push({
              objectId: Number(id),
              entityId: country.id,
              entityType: 'country',
              role: 'GALLERY',
              sort: index,
            });
          });
        }

        if (attachments.length) {
          await tx.insert(schema.attachments).values(attachments);
        }

        const result = await tx.query.countries.findFirst({
          where: eq(schema.countries.id, country.id),
          with: {
            attachments: {
              where: eq(schema.attachments.entityType, 'country'), // <--- Keep the `where` here
              with: {
                fileObject: true,
              },
            },
          },
        });

        if (!result) {
          throw new NotFoundException(
            `Country with ID ${country.id} not found after creation.`,
          );
        }

        // Now, TypeScript should correctly infer `result.attachments` as an array (even if empty)
        const allAttachments = result.attachments;

        const mainImage =
          allAttachments.find((att) => att.role === 'MAIN' && att.fileObject)
            ?.fileObject || null;

        const galleryImages = allAttachments
          .filter(
            (
              att,
            ): att is typeof schema.attachments.$inferSelect & {
              fileObject: typeof schema.fileObjects.$inferSelect;
            } => att.role === 'GALLERY' && !!att.fileObject,
          )
          .map((att) => att.fileObject);

        const finalResult: CountryWithImages = {
          ...country,
          mainImage: mainImage,
          galleryImages: galleryImages,
        };
        return finalResult;
      } catch (error: any) {
        if (error?.code === '23505') {
          // Now we can use the exact constraint name AND the detail from the error
          if (error.constraint === 'countries_code_unique') {
            // Using error.detail to provide the exact conflicting value
            throw new ConflictException(
              `Country with code '${createCountryDto.code}' already exists. ${error.detail}`,
            );
            // Or just: throw new ConflictException(`Country with code '${createCountryDto.code}' already exists.`);
          }
          // Fallback for any other unique constraint violations
          throw new ConflictException(
            'A record with this unique identifier already exists.',
          );
        }
        // Re-throw if it's a different kind of error
        throw error;
      }
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: CountryWithImages[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;

    // 1. Get total count for pagination metadata
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` }) // Use sql`count(*)` for type safety
      .from(schema.countries)
      .where(isNull(schema.countries.deletedAt));

    const totalCount = totalCountResult[0].count;

    // 2. Fetch countries with eager-loaded attachments and fileObjects, applying pagination
    const countries = await this.db.query.countries.findMany({
      limit: limit,
      offset: offset,
      where: isNull(schema.countries.deletedAt),
      with: {
        attachments: {
          where: eq(schema.attachments.entityType, 'country'), // Filter attachments to 'country' type
          with: {
            fileObject: true, // Eager load the fileObject for each attachment
          },
        },
      },
      // You might want to add an orderBy clause here, e.g., by name or createdAt
      orderBy: [schema.countries.createdAt],
    });

    // 3. Transform each country object to the desired output format
    const transformedCountries: CountryWithImages[] = countries.map(
      (country) => {
        // Destructure 'attachments' out of each country object
        const { attachments: allAttachments, ...countryDetails } = country;

        const mainImage =
          allAttachments.find((att) => att.role === 'MAIN' && att.fileObject)
            ?.fileObject || null;

        const galleryImages = allAttachments
          .filter(
            (
              att,
            ): att is typeof schema.attachments.$inferSelect & {
              fileObject: typeof schema.fileObjects.$inferSelect;
            } => att.role === 'GALLERY' && !!att.fileObject,
          )
          .map((att) => att.fileObject); // Map to the actual fileObject data

        return {
          ...countryDetails, // Spread basic country properties
          mainImage: mainImage, // Add the main image
          galleryImages: galleryImages, // Add the gallery images array
        };
      },
    );

    // 4. Return the paginated data
    return {
      data: transformedCountries,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  async findTrashed(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: CountryRecord[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;

    // 1. Get total count for pagination metadata
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` }) // Use sql`count(*)` for type safety
      .from(schema.countries)
      .where(isNotNull(schema.countries.deletedAt));

    const totalCount = totalCountResult[0].count;

    // 2. Fetch countries with eager-loaded attachments and fileObjects, applying pagination
    const countries = await this.db.query.countries.findMany({
      limit: limit,
      offset: offset,
      where: isNotNull(schema.countries.deletedAt),
      orderBy: [schema.countries.deletedAt],
    });

    // 4. Return the paginated data
    return {
      data: countries,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  async findOne(id: number): Promise<CountryWithImages | null> {
    const country = await this.db.query.countries.findFirst({
      where: eq(schema.countries.id, id),
      with: {
        attachments: {
          where: eq(schema.attachments.entityType, 'country'),
          with: {
            fileObject: true,
          },
        },
      },
    });

    if (!country) {
      return null;
    }

    const { attachments: allAttachments, ...countryDetails } = country;

    const mainImage =
      allAttachments.find((att) => att.role === 'MAIN' && att.fileObject)
        ?.fileObject || null;

    const galleryImages = allAttachments
      .filter(
        (
          att,
        ): att is typeof schema.attachments.$inferSelect & {
          fileObject: typeof schema.fileObjects.$inferSelect;
        } => att.role === 'GALLERY' && !!att.fileObject,
      )
      .map((att) => att.fileObject);

    const finalResult: CountryWithImages = {
      ...countryDetails,
      mainImage: mainImage,
      galleryImages: galleryImages,
    };

    return finalResult;
  }

  async update(
    id: number,
    updateCountryDto: UpdateCountryDto,
  ): Promise<CountryWithImages> {
    const {
      mainImageId, // will be number | null | undefined
      galleryImageIds, // will be number[] | undefined
      ...countryData // Contains other fields like name, code, is_active
    } = updateCountryDto;

    // Use a transaction to ensure atomicity of country data and attachment updates
    return this.db.transaction(async (tx) => {
      // 1. Update the base country data
      // Only perform an UPDATE on the countries table if there are non-image fields to update
      if (Object.keys(countryData).length > 0) {
        const [updatedCountryBaseCheck] = await tx // Renamed to avoid confusion with the final fetch
          .update(schema.countries)
          .set({
            ...countryData,
            updatedAt: new Date(), // Ensure updatedAt is updated
          })
          .where(
            and(
              eq(schema.countries.id, id),
              isNull(schema.countries.deletedAt),
            ),
          )
          .returning({ id: schema.countries.id }); // Only returning ID to confirm update

        if (!updatedCountryBaseCheck) {
          throw new NotFoundException(`Country with ID ${id} not found.`);
        }
      } else {
        // If only image IDs are sent in the DTO, we still need to confirm the country exists
        // before attempting to modify its attachments.
        const existingCountry = await tx.query.countries.findFirst({
          where: eq(schema.countries.id, id),
          columns: { id: true }, // Only fetch ID to confirm existence
        });
        if (!existingCountry) {
          throw new NotFoundException(`Country with ID ${id} not found.`);
        }
      }

      // 2. Handle mainImageId updates conditionally
      // This block executes ONLY if mainImageId was explicitly sent in the DTO (could be null or a number)
      if (mainImageId !== undefined) {
        // First, delete any existing MAIN attachment for this country
        await tx.delete(schema.attachments).where(
          and(
            eq(schema.attachments.entityId, id),
            eq(schema.attachments.entityType, 'country' as const), // Use 'as const' for enum types
            eq(schema.attachments.role, 'MAIN' as const), // Use 'as const' for enum types
          ),
        );

        // If a new mainImageId (number) was provided, insert it
        if (mainImageId !== null) {
          await tx.insert(schema.attachments).values({
            objectId: mainImageId,
            entityId: id,
            entityType: 'country' as const, // Use 'as const' for enum types
            role: 'MAIN' as const, // Use 'as const' for enum types
            sort: 0,
          });
        }
      }

      // 3. Handle galleryImageIds updates conditionally
      // This block executes ONLY if galleryImageIds was explicitly sent in the DTO (could be [] or [ids])
      if (galleryImageIds !== undefined) {
        // Delete all existing GALLERY attachments for this country
        await tx.delete(schema.attachments).where(
          and(
            eq(schema.attachments.entityId, id),
            eq(schema.attachments.entityType, 'country' as const), // Use 'as const' for enum types
            eq(schema.attachments.role, 'GALLERY' as const), // Use 'as const' for enum types
          ),
        );

        // If new gallery images were provided (even an empty array means "clear all then add none")
        if (galleryImageIds.length > 0) {
          const attachmentsToInsert = galleryImageIds.map(
            (fileObjectId, index) => ({
              objectId: fileObjectId,
              entityId: id,
              entityType: 'country' as const, // Use 'as const' for enum types
              role: 'GALLERY' as const, // Use 'as const' for enum types
              sort: index,
            }),
          );
          await tx.insert(schema.attachments).values(attachmentsToInsert);
        }
      }

      const queriedCountryWithAttachments = await tx.query.countries.findFirst({
        where: eq(schema.countries.id, id),
        with: {
          attachments: {
            where: eq(schema.attachments.entityType, 'country' as const), // Use 'as const' here too
            with: {
              fileObject: true,
            },
          },
        },
      });

      if (!queriedCountryWithAttachments) {
        throw new NotFoundException(
          `Country with ID ${id} not found after update operations.`,
        );
      }

      // Now, transform 'queriedCountryWithAttachments' to the desired output format
      const { attachments: allAttachments, ...countryDetails } =
        queriedCountryWithAttachments;

      const mainImage =
        allAttachments.find((att) => att.role === 'MAIN' && att.fileObject)
          ?.fileObject || null;

      const galleryImages = allAttachments
        .filter(
          (
            att,
          ): att is typeof schema.attachments.$inferSelect & {
            fileObject: typeof schema.fileObjects.$inferSelect;
          } => att.role === 'GALLERY' && !!att.fileObject,
        )
        .map((att) => att.fileObject);

      const finalResult: CountryWithImages = {
        ...countryDetails,
        mainImage: mainImage,
        galleryImages: galleryImages,
      };

      return finalResult;
    });
  }

  async softDelete(id: number) {
    const [deletedCountry] = await this.db // Renamed to avoid confusion with the final fetch
      .update(schema.countries)
      .set({
        is_active: false,
        deletedAt: new Date(), // Ensure updatedAt is updated
        updatedAt: new Date(), // Ensure updatedAt is updated
      })
      .where(
        and(eq(schema.countries.id, id), isNull(schema.countries.deletedAt)),
      )
      .returning({ id: schema.countries.id });
    if (!deletedCountry) {
      throw new NotFoundException(
        `Country with ID ${id} not found or trahed already.`,
      );
    }
    return {
      message: `country #${deletedCountry.id} is trashed successfully`,
    };
  }
  async restore(id: number) {
    const [restoredCountry] = await this.db
      .update(schema.countries)
      .set({
        is_active: false,
        deletedAt: null,
        updatedAt: new Date(), // updatedAt is updated
      })
      .where(
        and(eq(schema.countries.id, id), isNotNull(schema.countries.deletedAt)),
      )
      .returning({ id: schema.countries.id });
    if (!restoredCountry) {
      throw new NotFoundException(`Country with ID ${id} not found or trahed.`);
    }
    return {
      message: `country #${restoredCountry.id} is restored successfully`,
    };
  }

  async remove(id: number): Promise<{ message: string; id: number }> {
    return this.db.transaction(async (tx) => {
      // 1. Check if the country exists AND if it has any associated cities
      const countryWithCities = await tx.query.countries.findFirst({
        where:
          (and(eq(schema.countries.id, id)),
          isNotNull(schema.countries.deletedAt)),
        with: {
          cities: {
            // Assuming 'cities' is a defined relation in your countries schema
            columns: { id: true }, // Only fetch city ID to check for existence
            limit: 1, // Only need to fetch one city to know if any exist
          },
        },
      });

      if (!countryWithCities) {
        throw new NotFoundException(`Country with ID ${id} not found.`);
      }

      // 2. Check if any cities were found for this country
      if (countryWithCities.cities && countryWithCities.cities.length > 0) {
        throw new BadRequestException(
          `Cannot permanently delete country with ID ${id}. It still has associated cities.` +
            ` Please delete all cities in this country first.`,
        );
      }

      // 3. If no cities, proceed with cascading deletions of directly related data

      // Delete country-related attachments
      await tx
        .delete(schema.attachments)
        .where(
          and(
            eq(schema.attachments.entityId, id),
            eq(schema.attachments.entityType, 'country' as const),
          ),
        );

      // IMPORTANT: Adjust these parts based on your actual schema for reviews and favorites.
      // The following assumes 'reviews' and 'favorites' tables also have 'entityType' and 'entityId'
      // columns, and 'country' is a valid entityType for them.
      if (schema.reviews) {
        // Check if schema.reviews is defined in your schema.ts
        await tx
          .delete(schema.reviews)
          .where(
            and(
              eq(schema.reviews.entityId, id),
              eq(schema.reviews.entityType, 'country' as const),
            ),
          );
      }

      if (schema.favourites) {
        // Check if schema.favorites is defined in your schema.ts
        await tx
          .delete(schema.favourites)
          .where(
            and(
              eq(schema.favourites.entityId, id),
              eq(schema.favourites.entityType, 'country' as const),
            ),
          );
      }

      // 4. Finally, hard delete the country itself
      const [deletedCountryResult] = await tx
        .delete(schema.countries)
        .where(eq(schema.countries.id, id))
        .returning({ id: schema.countries.id }); // Return the ID of the deleted country

      if (!deletedCountryResult) {
        // This case should ideally not happen if countryWithCities was found initially,
        // but it's good for robustness to confirm the deletion.
        throw new NotFoundException(
          `Country with ID ${id} could not be deleted.`,
        );
      }

      return {
        message: `Country with ID ${id} and its associated attachments, reviews, and favorites have been permanently deleted.`,
        id: deletedCountryResult.id,
      };
    });
  }

  //client actions
  async findAllClient(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: CountryWithImages[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;

    // 1. Get total count for pagination metadata
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` }) // Use sql`count(*)` for type safety
      .from(schema.countries)
      .where(eq(schema.countries.is_active, true));

    const totalCount = totalCountResult[0].count;

    // 2. Fetch countries with eager-loaded attachments and fileObjects, applying pagination
    const countries = await this.db.query.countries.findMany({
      limit: limit,
      offset: offset,
      where: isNull(schema.countries.deletedAt),
      with: {
        attachments: {
          where: eq(schema.attachments.entityType, 'country'), // Filter attachments to 'country' type
          with: {
            fileObject: true, // Eager load the fileObject for each attachment
          },
        },
      },
      // You might want to add an orderBy clause here, e.g., by name or createdAt
      orderBy: [schema.countries.createdAt],
    });

    // 3. Transform each country object to the desired output format
    const transformedCountries: CountryWithImages[] = countries.map(
      (country) => {
        // Destructure 'attachments' out of each country object
        const { attachments: allAttachments, ...countryDetails } = country;

        const mainImage =
          allAttachments.find((att) => att.role === 'MAIN' && att.fileObject)
            ?.fileObject || null;

        const galleryImages = allAttachments
          .filter(
            (
              att,
            ): att is typeof schema.attachments.$inferSelect & {
              fileObject: typeof schema.fileObjects.$inferSelect;
            } => att.role === 'GALLERY' && !!att.fileObject,
          )
          .map((att) => att.fileObject); // Map to the actual fileObject data

        return {
          ...countryDetails, // Spread basic country properties
          mainImage: mainImage, // Add the main image
          galleryImages: galleryImages, // Add the gallery images array
        };
      },
    );

    // 4. Return the paginated data
    return {
      data: transformedCountries,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  async findOneClient(id: number): Promise<CountryWithImages | null> {
    const country = await this.db.query.countries.findFirst({
      where: and(
        eq(schema.countries.id, id),
        eq(schema.countries.is_active, true),
      ),
      with: {
        attachments: {
          where: eq(schema.attachments.entityType, 'country'),
          with: {
            fileObject: true,
          },
        },
      },
    });

    if (!country) {
      throw new NotFoundException(`Country with ID ${id} not found.`);
    }

    const { attachments: allAttachments, ...countryDetails } = country;

    const mainImage =
      allAttachments.find((att) => att.role === 'MAIN' && att.fileObject)
        ?.fileObject || null;

    const galleryImages = allAttachments
      .filter(
        (
          att,
        ): att is typeof schema.attachments.$inferSelect & {
          fileObject: typeof schema.fileObjects.$inferSelect;
        } => att.role === 'GALLERY' && !!att.fileObject,
      )
      .map((att) => att.fileObject);

    const finalResult: CountryWithImages = {
      ...countryDetails,
      mainImage: mainImage,
      galleryImages: galleryImages,
    };

    return finalResult;
  }
}
