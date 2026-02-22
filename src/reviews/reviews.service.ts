/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DRIZLE } from '../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

type EntityTypeName = 'city' | 'country' | 'hotel' | 'poi' | 'trip';

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private entityTypeIdCache = new Map<EntityTypeName, number>();
  private entityTypeNameById = new Map<number, EntityTypeName>();

  private async getEntityTypeId(name: EntityTypeName) {
    const cached = this.entityTypeIdCache.get(name);
    if (cached) return cached;
    const rec = await this.db.query.entityTypes.findFirst({
      where: (et, { eq }) => eq(et.name, name),
      columns: { id: true },
    });
    if (!rec) throw new Error(`Unknown entity type: ${name}`);
    this.entityTypeIdCache.set(name, rec.id);
    this.entityTypeNameById.set(rec.id, name);
    return rec.id;
  }

  private async getEntityTypeNameById(id: number): Promise<EntityTypeName> {
    const cached = this.entityTypeNameById.get(id);
    if (cached) return cached;
    const rec = await this.db.query.entityTypes.findFirst({
      where: (et, { eq }) => eq(et.id, id),
      columns: { name: true },
    });
    if (!rec) throw new Error(`Unknown entity type id: ${id}`);
    const name = rec.name as EntityTypeName;
    this.entityTypeNameById.set(id, name);
    return name;
  }

  // Recompute avg_rating & rating_count on the right table after a write
  private async recomputeAggregates(entityTypeId: number, entityId: number) {
    const [agg] = await this.db
      .select({
        avg: sql<number>`COALESCE(AVG(${schema.reviews.rating}), 0)`,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(schema.reviews)
      .where(
        and(
          eq(schema.reviews.entityTypeId, entityTypeId),
          eq(schema.reviews.entityId, entityId),
          isNull(schema.reviews.deletedAt),
        ),
      );

    const typeName = await this.getEntityTypeNameById(entityTypeId);

    // choose destination table
    let table:
      | typeof schema.cities
      | typeof schema.countries
      | typeof schema.hotels
      | typeof schema.pois
      | typeof schema.trips;

    console.log(typeName, entityId, entityTypeId);

    switch (typeName) {
      case 'city':
        table = schema.cities;
        break;
      case 'country':
        table = schema.countries;
        break;
      case 'hotel':
        table = schema.hotels;
        break;
      case 'poi':
        table = schema.pois;
        break;
      case 'trip':
        table = schema.trips;
        break;
      default:
        throw new Error(`Unsupported entity type: ${typeName}`);
    }

    await this.db
      .update(table as any)
      .set({
        avgRating: agg.avg as any,
        ratingCount: agg.cnt as any,
        updatedAt: new Date(),
      })
      .where(eq((table as any).id, entityId));
  }

  async upsert(
    userId: string,
    entityType: EntityTypeName,
    entityId: number,
    rating: number,
    comment?: string,
  ) {
    const entityTypeId = await this.getEntityTypeId(entityType);

    // update if active review exists
    const updated = await this.db
      .update(schema.reviews)
      .set({ rating, comment })
      .where(
        and(
          eq(schema.reviews.userId, userId),
          eq(schema.reviews.entityTypeId, entityTypeId),
          eq(schema.reviews.entityId, entityId),
          isNull(schema.reviews.deletedAt),
        ),
      )
      .returning();

    if (!updated.length) {
      // revive soft-deleted
      const revived = await this.db
        .update(schema.reviews)
        .set({ rating, comment, deletedAt: null })
        .where(
          and(
            eq(schema.reviews.userId, userId),
            eq(schema.reviews.entityTypeId, entityTypeId),
            eq(schema.reviews.entityId, entityId),
          ),
        )
        .returning();

      if (!revived.length) {
        await this.db.insert(schema.reviews).values({
          userId,
          entityTypeId,
          entityId,
          rating,
          comment,
        });
      }
    }

    await this.recomputeAggregates(entityTypeId, entityId);
    return { ok: true };
  }

  // src/reviews/reviews.service.ts
  // make sure you have: import { and, desc, eq, isNull, sql } from 'drizzle-orm';

  async list(
    entityType: EntityTypeName,
    entityId: number,
    page = 1,
    limit = 20,
  ) {
    const entityTypeId = await this.getEntityTypeId(entityType);

    const rows = await this.db
      .select({
        reviewId: schema.reviews.id,
        rating: schema.reviews.rating,
        comment: schema.reviews.comment,
        createdAt: schema.reviews.createdAt,

        userId: schema.users.id,
        userName: schema.users.name,
        userUsername: schema.users.username,

        avatarFile: schema.fileObjects, // full fileObjects row; we'll build url below
      })
      .from(schema.reviews)
      .leftJoin(schema.users, eq(schema.reviews.userId, schema.users.id))
      .leftJoin(
        schema.userAvatars,
        eq(schema.userAvatars.userId, schema.users.id),
      )
      .leftJoin(
        schema.fileObjects,
        eq(schema.userAvatars.fileObjectId, schema.fileObjects.id),
      )
      .where(
        and(
          eq(schema.reviews.entityTypeId, entityTypeId),
          eq(schema.reviews.entityId, entityId),
          isNull(schema.reviews.deletedAt),
        ),
      )
      .orderBy(desc(schema.reviews.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const items = rows.map((r) => ({
      id: r.reviewId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      user: {
        id: r.userId,
        name: r.userName ?? r.userUsername, // fall back to username if name is null
        username: r.userUsername,
        avatar: r.avatarFile
          ? {
              ...r.avatarFile,
              url: `/${r.avatarFile.bucket}/${r.avatarFile.objectKey}`,
            }
          : null,
      },
    }));

    const [{ count }] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.reviews)
      .where(
        and(
          eq(schema.reviews.entityTypeId, entityTypeId),
          eq(schema.reviews.entityId, entityId),
          isNull(schema.reviews.deletedAt),
        ),
      );

    const [{ avg }] = await this.db
      .select({ avg: sql<number>`COALESCE(AVG(${schema.reviews.rating}), 0)` })
      .from(schema.reviews)
      .where(
        and(
          eq(schema.reviews.entityTypeId, entityTypeId),
          eq(schema.reviews.entityId, entityId),
          isNull(schema.reviews.deletedAt),
        ),
      );

    return { total: count, avgRating: avg, items, page, limit };
  }

  async removeMine(userId: string, reviewId: number) {
    const review = await this.db.query.reviews.findFirst({
      where: (r, { eq, and, isNull }) =>
        and(eq(r.id, reviewId), isNull(r.deletedAt)),
      columns: { id: true, userId: true, entityTypeId: true, entityId: true },
    });

    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) throw new ForbiddenException();

    await this.db
      .update(schema.reviews)
      .set({ deletedAt: new Date() })
      .where(eq(schema.reviews.id, reviewId));

    await this.recomputeAggregates(review.entityTypeId, review.entityId);
    return { ok: true };
  }
}
