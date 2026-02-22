import { Controller, Get, Query, BadRequestException, Inject } from '@nestjs/common';
import { DRIZLE } from 'src/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from 'src/db/schema';
import { eq, desc, asc, and, inArray } from 'drizzle-orm';

@Controller('home')
export class HomeController {
  constructor(@Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>) {}

  @Get('popular')
  async popular(
    @Query('type') type?: string,
    @Query('limit') limitStr?: string,
  ) {
    if (!type) throw new BadRequestException('type query param is required (country|city|hotel|trip)');
    const limit = limitStr ? Math.max(1, Math.min(100, parseInt(limitStr, 100))) : 100;

    if (type === 'country') {
      const countries = await this.db.query.countries.findMany({
        columns: { id: true, name: true, avgRating: true },
        orderBy: [desc(schema.countries.avgRating)],
        limit,
      });

      // find entityTypeId for country
      const et = await this.db.query.entityTypes.findFirst({ where: (t, { eq }) => eq(t.name, 'country'), columns: { id: true } });
      const etId = et?.id ?? null;

      const out = await Promise.all(countries.map(async (c: any) => {
        let img: any = null;
        if (etId) {
          const att = await this.db.query.attachments.findFirst({ where: (a, { and: _and, eq: _eq }) => _and(_eq(a.entityTypeId, etId), _eq(a.entityId, c.id)), with: { fileObject: true } });
          if (att && att.fileObject) img = `/${att.fileObject.objectKey}`;
        }
        return { id: c.id, title: c.name, avgRating: Number(c.avgRating ?? 0), image: img };
      }));

      return out;
    }

    if (type === 'city') {
      const cities = await this.db.query.cities.findMany({ columns: { id: true, name: true, avgRating: true, countryId: true }, orderBy: [desc(schema.cities.avgRating)], limit });
      const et = await this.db.query.entityTypes.findFirst({ where: (t, { eq }) => eq(t.name, 'city'), columns: { id: true } });
      const etId = et?.id ?? null;
      const out = await Promise.all(cities.map(async (c: any) => {
        let img: any = null;
        if (etId) {
          const att = await this.db.query.attachments.findFirst({ where: (a, { and: _and, eq: _eq }) => _and(_eq(a.entityTypeId, etId), _eq(a.entityId, c.id)), with: { fileObject: true } });
          if (att && att.fileObject) img = `/${att.fileObject.objectKey}`;
        }
        return { id: c.id, title: c.name, avgRating: Number(c.avgRating ?? 0), countryId: c.countryId ?? null, image: img };
      }));
      return out;
    }

    if (type === 'hotel') {
      const hotels = await this.db.query.hotels.findMany({ columns: { id: true, name: true, avgRating: true, cityId: true }, orderBy: [desc(schema.hotels.avgRating)], limit });
      const et = await this.db.query.entityTypes.findFirst({ where: (t, { eq }) => eq(t.name, 'hotel'), columns: { id: true } });
      const etId = et?.id ?? null;
      // batch load city -> country map
      const cityIds = Array.from(new Set(hotels.map((h: any) => h.cityId).filter(Boolean)));
      const cityMap = new Map<number, any>();
      if (cityIds.length) {
        const cities = await this.db.query.cities.findMany({ where: (c) => inArray(c.id, cityIds), columns: { id: true, countryId: true } });
        for (const ct of cities) cityMap.set(ct.id, ct);
      }

      const out = await Promise.all(hotels.map(async (h: any) => {
        let img: any = null;
        if (etId) {
          const att = await this.db.query.attachments.findFirst({ where: (a, { and: _and, eq: _eq }) => _and(_eq(a.entityTypeId, etId), _eq(a.entityId, h.id)), with: { fileObject: true } });
          if (att && att.fileObject) img = `/${att.fileObject.objectKey}`;
        }
        const countryId = (h.cityId ? cityMap.get(h.cityId)?.countryId : null) ?? null;
        return { id: h.id, title: h.name, avgRating: Number(h.avgRating ?? 0), cityId: h.cityId ?? null, countryId, image: img };
      }));
      return out;
    }

    if (type === 'trip') {
      const trips = await this.db.query.trips.findMany({ columns: { id: true, name: true, startDate: true, endDate: true, pricePerPerson: true, cityId: true }, orderBy: [asc(schema.trips.startDate)], limit });
      const et = await this.db.query.entityTypes.findFirst({ where: (t, { eq }) => eq(t.name, 'trip'), columns: { id: true } });
      const etId = et?.id ?? null;

      // batch load cities -> country map for trips
      const cityIds = Array.from(new Set(trips.map((t: any) => t.cityId).filter(Boolean)));
      const cityMap = new Map<number, any>();
      if (cityIds.length) {
        const cities = await this.db.query.cities.findMany({ where: (c) => inArray(c.id, cityIds), columns: { id: true, countryId: true } });
        for (const ct of cities) cityMap.set(ct.id, ct);
      }

      const out = await Promise.all(trips.map(async (t: any) => {
        let img: any = null;
        if (etId) {
          const att = await this.db.query.attachments.findFirst({ where: (a, { and: _and, eq: _eq }) => _and(_eq(a.entityTypeId, etId), _eq(a.entityId, t.id)), with: { fileObject: true } });
          if (att && att.fileObject) img = `/${att.fileObject.objectKey}`;
        }
        const countryId = (t.cityId ? cityMap.get(t.cityId)?.countryId : null) ?? null;
        return { id: t.id, title: t.name, startDate: t.startDate, endDate: t.endDate, pricePerPerson: Number(t.pricePerPerson || 0), cityId: t.cityId ?? null, countryId, image: img };
      }));
      return out;
    }

    throw new BadRequestException('Unsupported type');
  }

  @Get('upcoming-trips')
  async upcoming(@Query('limit') limitStr?: string) {
    const limit = limitStr ? Math.max(1, Math.min(100, parseInt(limitStr, 10))) : 10;
    const today = new Date().toISOString().split('T')[0];

    // fetch trips (unique rows)
    const trips = await this.db.query.trips.findMany({ columns: { id: true, name: true, startDate: true, endDate: true, pricePerPerson: true, cityId: true }, orderBy: [asc(schema.trips.startDate)], limit });

    // filter upcoming in JS
    const upcoming = trips.filter((t: any) => new Date(t.startDate) > new Date(today));

    if (!upcoming.length) return [];

    // batch load attachments for trips
    const et = await this.db.query.entityTypes.findFirst({ where: (t, { eq }) => eq(t.name, 'trip'), columns: { id: true } });
    const etId = et?.id ?? null;
    const tripIds = upcoming.map((t: any) => t.id);
    const attMap = new Map<number, any>();
    if (etId && tripIds.length) {
      const atts = await this.db.query.attachments.findMany({ where: (a) => and(eq(a.entityTypeId, etId), inArray(a.entityId, tripIds)), with: { fileObject: true } });
      for (const a of atts) {
        if (!attMap.has(a.entityId) && a.fileObject) attMap.set(a.entityId, `/${a.fileObject.objectKey}`);
      }
    }

    // batch load cities -> country map
    const cityIds = Array.from(new Set(upcoming.map((t: any) => t.cityId).filter(Boolean)));
    const cityMap = new Map<number, any>();
    if (cityIds.length) {
      const cities = await this.db.query.cities.findMany({ where: (c) => inArray(c.id, cityIds), columns: { id: true, countryId: true } });
      for (const ct of cities) cityMap.set(ct.id, ct);
    }

    return upcoming.slice(0, limit).map((t: any) => ({
      id: t.id,
      title: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      pricePerPerson: Number(t.pricePerPerson || 0),
      cityId: t.cityId ?? null,
      countryId: t.cityId ? (cityMap.get(t.cityId)?.countryId ?? null) : null,
      image: attMap.get(t.id) ?? null,
    }));
  }
}
