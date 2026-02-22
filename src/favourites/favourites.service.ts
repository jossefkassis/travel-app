/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Inject } from '@nestjs/common';
import { DRIZLE } from '../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

type EntityTypeName = 'city' | 'country' | 'hotel' | 'poi' | 'trip';
type FavouriteCard = {
  entityType: EntityTypeName;
  entityId: number;
  title: string;
  mainImage: (typeof schema.fileObjects.$inferSelect & { url: string }) | null;
};

@Injectable()
export class FavouritesService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  private entityTypeIdCache = new Map<EntityTypeName, number>();
  private entityTypeNameById = new Map<number, EntityTypeName>();

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

  private async getEntityTypeId(name: EntityTypeName) {
    const cached = this.entityTypeIdCache.get(name);
    if (cached) return cached;
    const rec = await this.db.query.entityTypes.findFirst({
      where: (et, { eq }) => eq(et.name, name),
      columns: { id: true },
    });
    if (!rec) throw new Error(`Unknown entity type: ${name}`);
    this.entityTypeIdCache.set(name, rec.id);
    return rec.id;
  }

  async add(userId: string, entityType: EntityTypeName, entityId: number) {
    const entityTypeId = await this.getEntityTypeId(entityType);

    // revive soft-deleted if present
    const revived = await this.db
      .update(schema.favourites)
      .set({ deletedAt: null })
      .where(
        and(
          eq(schema.favourites.userId, userId),
          eq(schema.favourites.entityTypeId, entityTypeId),
          eq(schema.favourites.entityId, entityId),
        ),
      )
      .returning();

    if (revived.length) return revived[0];

    await this.db
      .insert(schema.favourites)
      .values({ userId, entityTypeId, entityId })
      .onConflictDoNothing();

    return { ok: true };
  }

  async remove(userId: string, entityType: EntityTypeName, entityId: number) {
    const entityTypeId = await this.getEntityTypeId(entityType);
    await this.db
      .update(schema.favourites)
      .set({ deletedAt: sql`now()` })
      .where(
        and(
          eq(schema.favourites.userId, userId),
          eq(schema.favourites.entityTypeId, entityTypeId),
          eq(schema.favourites.entityId, entityId),
          isNull(schema.favourites.deletedAt),
        ),
      );
    return { ok: true };
  }

  async listMine(
    userId: string,
    type?: EntityTypeName,
    page = 1,
    limit = 20,
  ): Promise<{
    items: Record<EntityTypeName, FavouriteCard[]>;
    page: number;
    limit: number;
  }> {
    const where = [
      eq(schema.favourites.userId, userId),
      isNull(schema.favourites.deletedAt),
    ];
    if (type) {
      where.push(
        eq(schema.favourites.entityTypeId, await this.getEntityTypeId(type)),
      );
    }

    // 1) Page favourites
    const favRows = await this.db
      .select({
        entityTypeId: schema.favourites.entityTypeId,
        entityId: schema.favourites.entityId,
      })
      .from(schema.favourites)
      .where(and(...where))
      .limit(limit)
      .offset((page - 1) * limit);

    // if no rows, return empty groups
    if (!favRows.length) {
      return {
        items: {
          city: [],
          country: [],
          hotel: [],
          poi: [],
          trip: [],
        },
        page,
        limit,
      };
    }

    // 2) Group IDs by entityTypeId
    const byType = new Map<number, number[]>();
    for (const f of favRows) {
      const arr = byType.get(f.entityTypeId) ?? [];
      arr.push(f.entityId);
      byType.set(f.entityTypeId, arr);
    }

    const buildImage = (fo?: typeof schema.fileObjects.$inferSelect | null) =>
      fo ? { ...fo, url: `/${fo.objectKey}` } : null;

    // 3) Collect flat results
    const results: FavouriteCard[] = [];
    for (const [entityTypeId, ids] of byType) {
      const typeName = await this.getEntityTypeNameById(entityTypeId);

      // shorthand: pick your table and title field
      let table: any, titleCol: any;
      switch (typeName) {
        case 'city':
          table = schema.cities;
          titleCol = schema.cities.name;
          break;
        case 'country':
          table = schema.countries;
          titleCol = schema.countries.name;
          break;
        case 'hotel':
          table = schema.hotels;
          titleCol = schema.hotels.name;
          break;
        case 'poi':
          table = schema.pois;
          titleCol = schema.pois.name;
          break;
        case 'trip':
          table = schema.trips;
          titleCol = schema.trips.name; // or .title if you have that
          break;
      }

      const rows = await this.db
        .select({
          id: table.id,
          title: titleCol,
          file: schema.fileObjects,
        })
        .from(table)
        .leftJoin(
          schema.attachments,
          and(
            eq(schema.attachments.entityTypeId, entityTypeId),
            eq(schema.attachments.entityId, table.id),
            eq(schema.attachments.role, 'MAIN'),
          ),
        )
        .leftJoin(
          schema.fileObjects,
          eq(schema.attachments.objectId, schema.fileObjects.id),
        )
        .where(inArray(table.id, ids));

      for (const r of rows) {
        results.push({
          entityType: typeName,
          entityId: r.id,
          title: r.title,
          mainImage: buildImage(r.file),
        });
      }
    }

    // 4) group the flat array by entityType
    const grouped: Record<EntityTypeName, FavouriteCard[]> = {
      city: [],
      country: [],
      hotel: [],
      poi: [],
      trip: [],
    };
    for (const fav of results) {
      grouped[fav.entityType].push(fav);
    }

    return {
      items: grouped,
      page,
      limit,
    };
  }
  async countFor(type: EntityTypeName, entityId: number) {
    const entityTypeId = await this.getEntityTypeId(type);
    const [r] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.favourites)
      .where(
        and(
          eq(schema.favourites.entityTypeId, entityTypeId),
          eq(schema.favourites.entityId, entityId),
          isNull(schema.favourites.deletedAt),
        ),
      );
    return r.count;
  }

  async listFavourites(
    entityType: EntityTypeName,
    entityId: number,
    page = 1,
    limit = 20,
  ): Promise<{
    total: number;
    items: any[];
    page: number;
    limit: number;
  }> {
    const entityTypeId = await this.getEntityTypeId(entityType);

    // 1) pull a page of favourites with user + avatar
    const rows = await this.db
      .select({
        createdAt: schema.favourites.createdAt,
        userId: schema.users.id,
        userName: schema.users.name,
        userUsername: schema.users.username,
        avatarFile: schema.fileObjects,
      })
      .from(schema.favourites)
      .leftJoin(schema.users, eq(schema.favourites.userId, schema.users.id))
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
          eq(schema.favourites.entityTypeId, entityTypeId),
          eq(schema.favourites.entityId, entityId),
          isNull(schema.favourites.deletedAt),
        ),
      )
      .orderBy(desc(schema.favourites.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    // 2) map into your DTO
    const items: any[] = rows.map((r) => ({
      createdAt: r.createdAt,
      user: {
        id: r.userId,
        name: r.userName ?? r.userUsername,
        username: r.userUsername,
        avatar: r.avatarFile
          ? {
              ...r.avatarFile,
              url: `/${r.avatarFile.bucket}/${r.avatarFile.objectKey}`,
            }
          : null,
      },
    }));

    // 3) get total count
    const [{ count }] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.favourites)
      .where(
        and(
          eq(schema.favourites.entityTypeId, entityTypeId),
          eq(schema.favourites.entityId, entityId),
          isNull(schema.favourites.deletedAt),
        ),
      );

    return { total: count, items, page, limit };
  }
}
