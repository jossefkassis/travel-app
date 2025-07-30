import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { DRIZLE } from '../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { eq, and, or, ilike, asc, desc, sql, count, inArray, isNull } from 'drizzle-orm';
import { CreateAttractionDto } from './dto/create-attraction.dto';
import { UpdateAttractionDto } from './dto/update-attraction.dto';
import { CreatePoiTypeDto } from './dto/create-poi-type.dto';
import { UpdatePoiTypeDto } from './dto/update-poi-type.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class AttractionsService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll(
    page: number = 1,
    limit: number = 10,
    orderBy: 'createdAt' | 'name' | 'price' = 'createdAt',
    orderDir: 'asc' | 'desc' = 'desc',
    filters: {
      cityId?: number;
      poiTypeId?: number;
      search?: string;
      isActive?: boolean;
      minPrice?: number;
      maxPrice?: number;
      tagIds?: number[];
    } = {},
  ) {
    const offset = (page - 1) * limit;
    const conditions:any[] = [];

    // Apply filters
    if (filters.cityId) {
      conditions.push(eq(schema.pois.cityId, filters.cityId));
    }
    if (filters.poiTypeId) {
      conditions.push(eq(schema.pois.poiTypeId, filters.poiTypeId));
    }
    if (filters.isActive !== undefined) {
      conditions.push(eq(schema.pois.is_active, filters.isActive));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(schema.pois.name, `%${filters.search}%`),
          ilike(schema.pois.description, `%${filters.search}%`),
        ),
      );
    }
    if (filters.minPrice !== undefined) {
      conditions.push(sql`${schema.pois.price} >= ${filters.minPrice}`);
    }
    if (filters.maxPrice !== undefined) {
      conditions.push(sql`${schema.pois.price} <= ${filters.maxPrice}`);
    }

    // Handle tag filtering
    let poiIdsWithTags: number[] | undefined;
    if (filters.tagIds && filters.tagIds.length > 0) {
      const tagAssociations = await this.db.query.poiToPoiTags.findMany({
        where: inArray(schema.poiToPoiTags.tagId, filters.tagIds),
        columns: { poiId: true },
      });
      poiIdsWithTags = tagAssociations.map(assoc => assoc.poiId);
      if (poiIdsWithTags.length === 0) {
        // If no POIs have the specified tags, return empty result
        return {
          data: [],
          totalCount: 0,
          page,
          limit,
          totalPages: 0,
          orderBy,
          orderDir,
          filters,
        };
      }
      conditions.push(inArray(schema.pois.id, poiIdsWithTags));
    }

    // Build order expression
    let orderExpr;
    switch (orderBy) {
      case 'name':
        orderExpr = orderDir === 'asc' ? asc(schema.pois.name) : desc(schema.pois.name);
        break;
      case 'price':
        orderExpr = orderDir === 'asc' ? asc(schema.pois.price) : desc(schema.pois.price);
        break;
      default:
        orderExpr = orderDir === 'asc' ? asc(schema.pois.createdAt) : desc(schema.pois.createdAt);
    }

    // Get total count
    const [{ value: totalCount }] = await this.db
      .select({ value: count() })
      .from(schema.pois)
      .where(conditions.length ? and(...conditions) : undefined);

    // Get data with relations
    const data = await this.db.query.pois.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      limit,
      offset,
      orderBy: [orderExpr],
      with: {
        city: {
          columns: {
            id: true,
            name: true,
            slug: true,
            description: true,
            isActive: true,
            avgRating: true,
            ratingCount: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            countryId: true,
            radius: true,
            avgMealPrice: true,
          },
        },
        poiType: true,
      },
      columns: {
        id: true,
        cityId: true,
        poiTypeId: true,
        name: true,
        description: true,
        address: true,
        website: true,
        price: true,
        discountPrice: true,
        contactEmail: true,
        phone: true,
        openingHours: true,
        avgDuration: true,
        is_active: true,
        avgRating: true,
        ratingCount: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    // Get POI entity type ID for attachments
    const poiEntityType = await this.db.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'poi'),
    });

    // Enrich with images
    const dataWithImages = await Promise.all(
      data.map(async (poi) => {
        let mainImage: any = null;
        const galleryImages: any[] = [];

        if (poiEntityType) {
          const attachments = await this.db.query.attachments.findMany({
            where: and(
              eq(schema.attachments.entityTypeId, poiEntityType.id),
              eq(schema.attachments.entityId, poi.id),
            ),
            with: { fileObject: true },
          });

          for (const att of attachments) {
            if (att.role === 'MAIN' && att.fileObject) {
              mainImage = att.fileObject;
            }
            if (att.role === 'GALLERY' && att.fileObject) {
              galleryImages.push(att.fileObject);
            }
          }
        }

        // Get tags for this attraction
        const tagAssociations = await this.db.query.poiToPoiTags.findMany({
          where: eq(schema.poiToPoiTags.poiId, poi.id),
          with: { tag: true },
        });
        const tags = tagAssociations.map(assoc => assoc.tag);

        return {
          ...poi,
          mainImage,
          galleryImages,
          tags,
        };
      }),
    );

    return {
      data: dataWithImages,
      totalCount: Number(totalCount),
      page,
      limit,
      totalPages: Math.ceil(Number(totalCount) / limit),
      orderBy,
      orderDir,
      filters,
    };
  }

  async findOne(id: number) {
    const poi = await this.db.query.pois.findFirst({
      where: eq(schema.pois.id, id),
      with: {
        city: {
          columns: {
            id: true,
            name: true,
            slug: true,
            description: true,
            isActive: true,
            avgRating: true,
            ratingCount: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true,
            countryId: true,
            radius: true,
            avgMealPrice: true,
          },
        },
        poiType: true,
      },
      columns: {
        id: true,
        cityId: true,
        poiTypeId: true,
        name: true,
        description: true,
        address: true,
        website: true,
        price: true,
        discountPrice: true,
        contactEmail: true,
        phone: true,
        openingHours: true,
        avgDuration: true,
        is_active: true,
        avgRating: true,
        ratingCount: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    if (!poi) {
      throw new NotFoundException('Attraction not found');
    }

    // Get POI entity type ID for attachments
    const poiEntityType = await this.db.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'poi'),
    });

    let mainImage: any = null;
    const galleryImages: any[] = [];

    if (poiEntityType) {
      const attachments = await this.db.query.attachments.findMany({
        where: and(
          eq(schema.attachments.entityTypeId, poiEntityType.id),
          eq(schema.attachments.entityId, poi.id),
        ),
        with: { fileObject: true },
      });

      for (const att of attachments) {
        if (att.role === 'MAIN' && att.fileObject) {
          mainImage = att.fileObject;
        }
        if (att.role === 'GALLERY' && att.fileObject) {
          galleryImages.push(att.fileObject);
        }
      }
    }

    // Get tags for this attraction
    const tagAssociations = await this.db.query.poiToPoiTags.findMany({
      where: eq(schema.poiToPoiTags.poiId, poi.id),
      with: { tag: true },
    });
    const tags = tagAssociations.map(assoc => assoc.tag);

    return {
      ...poi,
      mainImage,
      galleryImages,
      tags,
    };
  }

  async create(createAttractionDto: CreateAttractionDto) {
    const {
      name,
      cityId,
      poiTypeId,
      description,
      address,
      location,
      website,
      price,
      discountPrice,
      contactEmail,
      phone,
      openingHours,
      avgDuration,
      isActive,
      mainImageId,
      galleryImageIds,
      tagIds,
    } = createAttractionDto;

    // Create the POI
    const [poi] = await this.db.insert(schema.pois).values({
      name,
      cityId,
      poiTypeId,
      description,
      address,
      location: sql`ST_SetSRID(ST_MakePoint(${location[0]}, ${location[1]}), 4326)`,
      website,
      price: price?.toString() || '0.00',
      discountPrice: discountPrice?.toString(),
      contactEmail,
      phone,
      openingHours,
      avgDuration,
      is_active: isActive ?? true,
    }).returning();

    // Get POI entity type ID
    let poiEntityType = await this.db.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'poi'),
    });

    if (!poiEntityType) {
      // Create POI entity type if it doesn't exist
      [poiEntityType] = await this.db.insert(schema.entityTypes).values({
        name: 'poi',
        displayName: 'Point of Interest',
        description: 'Tourist attractions and points of interest',
        allowsAttachments: true,
      }).returning();
    }

    // Save attachments
    if (mainImageId) {
      await this.db.insert(schema.attachments).values({
        objectId: mainImageId,
        entityTypeId: poiEntityType.id,
        entityId: poi.id,
        role: 'MAIN',
        sort: 0,
      });
    }

    if (galleryImageIds && galleryImageIds.length > 0) {
      const galleryAttachments = galleryImageIds.map((imageId, index) => ({
        objectId: imageId,
        entityTypeId: poiEntityType.id,
        entityId: poi.id,
        role: 'GALLERY' as const,
        sort: index + 1,
      }));

      await this.db.insert(schema.attachments).values(galleryAttachments);
    }

    // Save tags if provided
    if (tagIds && tagIds.length > 0) {
      const tagAssociations = tagIds.map(tagId => ({
        poiId: poi.id,
        tagId,
      }));
      await this.db.insert(schema.poiToPoiTags).values(tagAssociations);
    }

    return this.findOne(poi.id);
  }

  async update(id: number, updateAttractionDto: UpdateAttractionDto) {
    const poi = await this.db.query.pois.findFirst({
      where: eq(schema.pois.id, id),
    });

    if (!poi) {
      throw new NotFoundException('Attraction not found');
    }

    const {
      name,
      cityId,
      poiTypeId,
      description,
      address,
      location,
      website,
      price,
      discountPrice,
      contactEmail,
      phone,
      openingHours,
      avgDuration,
      isActive,
      mainImageId,
      galleryImageIds,
      tagIds,
    } = updateAttractionDto;

    // Update POI data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (cityId !== undefined) updateData.cityId = cityId;
    if (poiTypeId !== undefined) updateData.poiTypeId = poiTypeId;
    if (description !== undefined) updateData.description = description;
    if (address !== undefined) updateData.address = address;
    if (location) {
      updateData.location = sql`ST_SetSRID(ST_MakePoint(${location[0]}, ${location[1]}), 4326)`;
    }
    if (website !== undefined) updateData.website = website;
    if (price !== undefined) updateData.price = price.toString();
    if (discountPrice !== undefined) updateData.discountPrice = discountPrice.toString();
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
    if (phone !== undefined) updateData.phone = phone;
    if (openingHours !== undefined) updateData.openingHours = openingHours;
    if (avgDuration !== undefined) updateData.avgDuration = avgDuration;
    if (isActive !== undefined) updateData.is_active = isActive;
    updateData.updatedAt = new Date();

    if (Object.keys(updateData).length > 0) {
      await this.db.update(schema.pois).set(updateData).where(eq(schema.pois.id, id));
    }

    // Update attachments if provided
    if (mainImageId !== undefined || galleryImageIds !== undefined) {
      const poiEntityType = await this.db.query.entityTypes.findFirst({
        where: eq(schema.entityTypes.name, 'poi'),
      });

      if (poiEntityType) {
        // Delete existing attachments
        await this.db.delete(schema.attachments).where(
          and(
            eq(schema.attachments.entityTypeId, poiEntityType.id),
            eq(schema.attachments.entityId, id),
          ),
        );

        // Insert new attachments
        if (mainImageId) {
          await this.db.insert(schema.attachments).values({
            objectId: mainImageId,
            entityTypeId: poiEntityType.id,
            entityId: id,
            role: 'MAIN',
            sort: 0,
          });
        }

        if (galleryImageIds && galleryImageIds.length > 0) {
          const galleryAttachments = galleryImageIds.map((imageId, index) => ({
            objectId: imageId,
            entityTypeId: poiEntityType.id,
            entityId: id,
            role: 'GALLERY' as const,
            sort: index + 1,
          }));

          await this.db.insert(schema.attachments).values(galleryAttachments);
        }
      }
    }

    // Update tags if provided
    if (tagIds !== undefined) {
      // Delete existing tag associations
      await this.db.delete(schema.poiToPoiTags).where(eq(schema.poiToPoiTags.poiId, id));
      
      // Insert new tag associations if provided
      if (tagIds && tagIds.length > 0) {
        const tagAssociations = tagIds.map(tagId => ({
          poiId: id,
          tagId,
        }));
        await this.db.insert(schema.poiToPoiTags).values(tagAssociations);
      }
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    const poi = await this.db.query.pois.findFirst({
      where: eq(schema.pois.id, id),
    });

    if (!poi) {
      throw new NotFoundException('Attraction not found');
    }

    // Get POI entity type ID
    const poiEntityType = await this.db.query.entityTypes.findFirst({
      where: eq(schema.entityTypes.name, 'poi'),
    });

    // Delete attachments
    if (poiEntityType) {
      await this.db.delete(schema.attachments).where(
        and(
          eq(schema.attachments.entityTypeId, poiEntityType.id),
          eq(schema.attachments.entityId, id),
        ),
      );
    }

    // Delete the POI
    await this.db.delete(schema.pois).where(eq(schema.pois.id, id));

    return {
      message: `Attraction with ID ${id} has been deleted successfully.`,
      deletedAttractionId: id,
    };
  }

  async findAllPoiTypes() {
    return this.db.query.poiTypes.findMany({
      orderBy: [asc(schema.poiTypes.name)],
    });
  }

  async findOnePoiType(id: number) {
    const poiType = await this.db.query.poiTypes.findFirst({
      where: eq(schema.poiTypes.id, id),
    });

    if (!poiType) {
      throw new NotFoundException('POI type not found');
    }

    return poiType;
  }

  // POI Type CRUD operations
  async createPoiType(createPoiTypeDto: CreatePoiTypeDto) {
    const { name, description } = createPoiTypeDto;

    // Check if POI type with same name already exists
    const existingPoiType = await this.db.query.poiTypes.findFirst({
      where: eq(schema.poiTypes.name, name),
    });
    if (existingPoiType) {
      throw new BadRequestException('POI type with this name already exists');
    }

    const [poiType] = await this.db.insert(schema.poiTypes).values({
      name,
      description,
    }).returning();

    return poiType;
  }

  async updatePoiType(id: number, updatePoiTypeDto: UpdatePoiTypeDto) {
    const poiType = await this.db.query.poiTypes.findFirst({
      where: eq(schema.poiTypes.id, id),
    });
    if (!poiType) {
      throw new NotFoundException('POI type not found');
    }

    const { name, description } = updatePoiTypeDto;

    // Check for name conflict if name is being updated
    if (name && name !== poiType.name) {
      const existingPoiType = await this.db.query.poiTypes.findFirst({
        where: and(
          eq(schema.poiTypes.name, name),
          sql`"poi_types"."id" != ${id}`,
        ),
      });
      if (existingPoiType) {
        throw new BadRequestException('POI type with this name already exists');
      }
    }

    const updateData: any = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const [updatedPoiType] = await this.db.update(schema.poiTypes).set(updateData).where(eq(schema.poiTypes.id, id)).returning();

    return updatedPoiType;
  }

  async removePoiType(id: number) {
    const poiType = await this.db.query.poiTypes.findFirst({
      where: eq(schema.poiTypes.id, id),
    });
    if (!poiType) {
      throw new NotFoundException('POI type not found');
    }

    // Check if POI type is being used by any POIs
    const poisUsingType = await this.db.query.pois.findFirst({
      where: eq(schema.pois.poiTypeId, id),
    });
    if (poisUsingType) {
      throw new BadRequestException('Cannot delete POI type that is being used by attractions');
    }

    await this.db.delete(schema.poiTypes).where(eq(schema.poiTypes.id, id));

    return {
      message: `POI type with ID ${id} has been deleted successfully.`,
      deletedPoiTypeId: id,
    };
  }

  // Tag CRUD operations
  async findAllTags() {
    return this.db.query.tags.findMany({
      orderBy: [asc(schema.tags.name)],
    });
  }

  async findOneTag(id: number) {
    const tag = await this.db.query.tags.findFirst({
      where: eq(schema.tags.id, id),
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  async createTag(createTagDto: CreateTagDto) {
    const { name, description } = createTagDto;

    // Check if tag with same name already exists
    const existingTag = await this.db.query.tags.findFirst({
      where: eq(schema.tags.name, name),
    });
    if (existingTag) {
      throw new BadRequestException('Tag with this name already exists');
    }

    const [tag] = await this.db.insert(schema.tags).values({
      name,
      description,
    }).returning();

    return tag;
  }

  async updateTag(id: number, updateTagDto: UpdateTagDto) {
    const tag = await this.db.query.tags.findFirst({
      where: eq(schema.tags.id, id),
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    const { name, description } = updateTagDto;

    // Check for name conflict if name is being updated
    if (name && name !== tag.name) {
      const existingTag = await this.db.query.tags.findFirst({
        where: and(
          eq(schema.tags.name, name),
          sql`"tags"."id" != ${id}`,
        ),
      });
      if (existingTag) {
        throw new BadRequestException('Tag with this name already exists');
      }
    }

    const updateData: any = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    const [updatedTag] = await this.db.update(schema.tags).set(updateData).where(eq(schema.tags.id, id)).returning();

    return updatedTag;
  }

  async removeTag(id: number) {
    const tag = await this.db.query.tags.findFirst({
      where: eq(schema.tags.id, id),
    });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    // Check if tag is being used by any POIs
    const poisUsingTag = await this.db.query.poiToPoiTags.findFirst({
      where: eq(schema.poiToPoiTags.tagId, id),
    });
    if (poisUsingTag) {
      throw new BadRequestException('Cannot delete tag that is being used by attractions');
    }

    await this.db.delete(schema.tags).where(eq(schema.tags.id, id));

    return {
      message: `Tag with ID ${id} has been deleted successfully.`,
      deletedTagId: id,
    };
  }

  async findAllByCityId(cityId: number) {
    // Get all attractions for this city with images and tags
    const attractions = await this.db.query.pois.findMany({
      where: and(
        eq(schema.pois.cityId, cityId),
        eq(schema.pois.is_active, true),
        isNull(schema.pois.deletedAt),
      ),
      with: {
        poiType: true,
      },
      columns: {
        id: true,
        cityId: true,
        poiTypeId: true,
        name: true,
        description: true,
        address: true,
        website: true,
        price: true,
        discountPrice: true,
        contactEmail: true,
        phone: true,
        openingHours: true,
        avgDuration: true,
        is_active: true,
        avgRating: true,
        ratingCount: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });

    const poiEntityTypeId = await this.getPoiEntityTypeId();
    const attractionsWithImages = await Promise.all(attractions.map(async (attraction) => {
      // Get attraction images
      const attractionAttachments = await this.db.query.attachments.findMany({
        where: and(
          eq(schema.attachments.entityTypeId, poiEntityTypeId),
          eq(schema.attachments.entityId, attraction.id),
        ),
        with: { fileObject: true },
      });
      
      let attractionMainImage: any = null;
      const attractionGalleryImages: any[] = [];
      for (const att of attractionAttachments) {
        if (att.role === 'MAIN' && att.fileObject) attractionMainImage = att.fileObject;
        if (att.role === 'GALLERY' && att.fileObject) attractionGalleryImages.push(att.fileObject);
      }

      // Get attraction tags
      const tagAssociations = await this.db.query.poiToPoiTags.findMany({
        where: eq(schema.poiToPoiTags.poiId, attraction.id),
        with: { tag: true },
      });
      const tags = tagAssociations.map(assoc => assoc.tag);
      
      return { 
        ...attraction, 
        mainImage: attractionMainImage, 
        galleryImages: attractionGalleryImages,
        tags,
      };
    }));

    return attractionsWithImages;
  }

  private async getPoiEntityTypeId(tx: NodePgDatabase<typeof schema> = this.db): Promise<number> {
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
} 