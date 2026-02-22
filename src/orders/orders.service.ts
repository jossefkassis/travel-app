import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { DRIZLE } from '../database.module';
import { eq, inArray, and, ilike, or, desc, sql, isNull } from 'drizzle-orm';
import { TripsService } from 'src/trips/trips.service';
import { HotelsService } from 'src/hotels/hotels.service';

type OrderRow = {
  id: number;
  status: string;
  totalAmount: string;
  createdAt: Date;
};

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly tripsService: TripsService,
    private readonly hotelsService: HotelsService,
  ) {}

  async listUserOrders(
    userId: string,
    filters?: { tripId?: number; hotelId?: number },
  ) {
    // Fetch orders for the user
    const orders = await this.db.query.orders.findMany({
      where: (o) => eq(o.userId, userId),
      columns: { id: true, status: true, totalAmount: true, createdAt: true },
    });
  
    // Precompute hotel room type ids if filtering by hotel
    let hotelRoomTypeIds: number[] | null = null;
    if (filters?.hotelId) {
      const types = await this.db.query.hotelRoomTypes.findMany({
        where: (rt, { eq }) => eq(rt.hotelId, filters.hotelId!),
        columns: { id: true },
      });
      hotelRoomTypeIds = types.map((t: any) => t.id);
    }
  
    const results: any[] = [];
    for (const o of orders) {
      // load order items
      const items = await this.db.query.orderItems.findMany({
        where: (it) => eq(it.orderId, o.id),
      });
  
      // ---------- items enrichment ----------
      const itemsEnriched: any[] = [];
  
      // RoomTypeIds that belong to this order (for fallback linkage)
      const orderRoomTypeIds = items
        .filter((it: any) => it.itemType === 'ROOM')
        .map((it: any) => Number(it.itemId));
  
      for (const it of items) {
        if (it.itemType === 'TRIP') {
          const trip = await this.db.query.trips.findFirst({
            where: eq(schema.trips.id, it.itemId),
            columns: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              withMeals: true,
              withTransport: true,
              hotelIncluded: true,
              pricePerPerson: true,
              mealPricePerPerson: true,
              transportationPricePerPerson: true,
            },
            with: {
              tripHotels: {
                with: {
                  hotel: { columns: { id: true, name: true, currency: true } },
                  roomType: { columns: { id: true, label: true } },
                },
              },
            },
          });
  
          const th = (trip?.tripHotels ?? [])[0];
          itemsEnriched.push({
            type: it.itemType,
            trip: trip
              ? {
                  id: trip.id,
                  name: trip.name,
                  startDate: trip.startDate,
                  endDate: trip.endDate,
                  withMeals: trip.withMeals,
                  withTransport: trip.withTransport,
                  hotelIncluded: trip.hotelIncluded,
                  pricePerPerson: Number(trip.pricePerPerson ?? 0),
                  perPersonMeals: Number(trip.mealPricePerPerson ?? 0),
                  perPersonTransport: Number(trip.transportationPricePerPerson ?? 0),
                  hotel:
                    trip.hotelIncluded && th
                      ? {
                          hotelId: th.hotel?.id ?? null,
                          hotelName: th.hotel?.name ?? null,
                          currency: th.hotel?.currency ?? null,
                          roomTypeId: th.roomType?.id ?? null,
                          roomTypeLabel: th.roomType?.label ?? null,
                          roomsNeeded: th.roomsNeeded,
                        }
                      : null,
                }
              : null,
            seats: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          });
        } else if (it.itemType === 'ROOM') {
          // Reservations for this order/user OR legacy fallback (HOTEL_ONLY + same user + roomType from this order)
          const reservations = await this.db.query.roomReservations.findMany({
            where: (r) =>
              and(
                eq(r.userId, userId),
                or(
                  eq(r.sourceId, o.id),
                  and(
                    eq(r.source, 'HOTEL_ONLY' as any),
                    isNull(r.sourceId),
                    orderRoomTypeIds.length
                      ? inArray(r.roomTypeId, orderRoomTypeIds)
                      : eq(r.roomTypeId, -1), // harmless false if none
                  ),
                ),
              ),
          });
  
          const mapped: any[] = [];
          for (const r of reservations) {
            const rt = await this.db.query.hotelRoomTypes.findFirst({
              where: eq(schema.hotelRoomTypes.id, r.roomTypeId),
              columns: {
                id: true,
                hotelId: true,
                label: true,
                baseNightlyRate: true,
              },
              with: {
                hotel: { columns: { id: true, name: true, currency: true } },
              },
            });
  
            if (hotelRoomTypeIds && !hotelRoomTypeIds.includes(r.roomTypeId)) continue;
  
            const nights =
              (new Date(r.checkOutDate).getTime() - new Date(r.checkInDate).getTime()) /
              (1000 * 60 * 60 * 24);
            const perNightRate = Number(rt?.baseNightlyRate ?? 0);
            const reservationTotal = Number((perNightRate * r.roomsBooked * nights).toFixed(2));
  
            mapped.push({
              reservationId: r.id,
              roomTypeId: r.roomTypeId,
              roomTypeLabel: rt?.label ?? null,
              hotelId: rt?.hotel?.id ?? null,
              hotelName: rt?.hotel?.name ?? null,
              currency: rt?.hotel?.currency ?? null,
              checkInDate: r.checkInDate,
              checkOutDate: r.checkOutDate,
              nights,
              roomsBooked: r.roomsBooked,
              perNightRate,
              reservationTotal,
              source: r.source,
              sourceId: r.sourceId,
            });
          }
  
          itemsEnriched.push({
            type: it.itemType,
            roomsReservations: mapped,
            seats: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          });
        } else {
          itemsEnriched.push({
            type: it.itemType,
            seats: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
          });
        }
      }
  
      // ---------- trip bookings linked to this order ----------
      const tripBookings = await this.db.query.tripBookings.findMany({
        where: (tb) => eq(tb.sourceId, o.id),
      });
      const bookingsForTrips: any[] = [];
      for (const b of tripBookings) {
        const t = await this.db.query.trips.findFirst({
          where: eq(schema.trips.id, b.tripId),
          columns: {
            startDate: true,
            endDate: true,
            withMeals: true,
            withTransport: true,
            hotelIncluded: true,
          },
        });
        if (filters?.tripId && b.tripId !== filters.tripId) continue;
        bookingsForTrips.push({
          bookingId: b.id,
          type: 'TRIP',
          tripId: b.tripId,
          seats: b.seats,
          total: b.total,
          source: b.source,
          sourceId: b.sourceId,
          startDate: t?.startDate ?? null,
          endDate: t?.endDate ?? null,
          withMeals: t?.withMeals ?? null,
          withTransport: t?.withTransport ?? null,
          hotelIncluded: t?.hotelIncluded ?? null,
        });
      }
  
      // ---------- room reservations linked to this order and user ----------
      const roomReservations = await this.db.query.roomReservations.findMany({
        where: (rr) =>
          and(
            eq(rr.userId, userId),
            or(
              eq(rr.sourceId, o.id),
              and(
                eq(rr.source, 'HOTEL_ONLY' as any),
                orderRoomTypeIds.length
                  ? inArray(rr.roomTypeId, orderRoomTypeIds)
                  : eq(rr.roomTypeId, -1),
              ),
            ),
          ),
      });
  
      const bookingsForRooms: any[] = [];
      for (const rr of roomReservations) {
        const rt = await this.db.query.hotelRoomTypes.findFirst({
          where: eq(schema.hotelRoomTypes.id, rr.roomTypeId),
          columns: { id: true, hotelId: true, label: true, baseNightlyRate: true },
          with: { hotel: { columns: { id: true, name: true, currency: true } } },
        });
        if (filters?.hotelId && rt?.hotelId !== filters.hotelId) continue;
  
        const nights =
          (new Date(rr.checkOutDate).getTime() - new Date(rr.checkInDate).getTime()) /
          (1000 * 60 * 60 * 24);
        const perNightRate = Number(rt?.baseNightlyRate ?? 0);
        const reservationTotal = Number((perNightRate * rr.roomsBooked * nights).toFixed(2));
  
        bookingsForRooms.push({
          bookingId: rr.id,
          type: 'ROOM',
          roomTypeId: rr.roomTypeId,
          roomTypeLabel: rt?.label ?? null,
          hotelId: rt?.hotel?.id ?? null,
          hotelName: rt?.hotel?.name ?? null,
          currency: rt?.hotel?.currency ?? null,
          checkInDate: rr.checkInDate,
          checkOutDate: rr.checkOutDate,
          nights,
          roomsBooked: rr.roomsBooked,
          perNightRate,
          reservationTotal,
          source: rr.source,
          sourceId: rr.sourceId,
        });
      }
  
      const mergedBookings = [...bookingsForTrips, ...bookingsForRooms];
  
      results.push({
        orderId: o.id,
        status: o.status,
        total: o.totalAmount,
        createdAt: o.createdAt,
        items: itemsEnriched,
        bookings: mergedBookings,
      });
    }
  
    return results;
  }
  

  /**
   * Cancel an order and all its related bookings/reservations.
   * Requesting user may be the owner or an admin with `payment:view:all` permission.
   */
  async cancelOrder(requestingUser: { id: string; roleId?: number }, orderId: number) {
    const order = await this.db.query.orders.findFirst({
      where: eq(schema.orders.id, orderId),
      columns: { id: true, userId: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // allow if owner
    let allowed = order.userId === requestingUser.id;
    if (!allowed) {
      // check admin permission
      if (!requestingUser.roleId) throw new ForbiddenException('Not allowed');
      const role = await this.db.query.roles.findFirst({
        where: eq(schema.roles.id, requestingUser.roleId),
        with: { rolePermissions: { with: { permission: true } } },
      });
      const perms = (role?.rolePermissions || []).map((rp: any) => rp.permission.name);
      allowed = perms.includes('payment:view:all');
      if (!allowed) throw new ForbiddenException('Not allowed');
    }

    // 1) cancel trip bookings linked to this order
    const tripBookings = await this.db.query.tripBookings.findMany({
      where: eq(schema.tripBookings.sourceId, orderId),
    });
    let tripsCancelled = 0;
    for (const tb of tripBookings) {
      // call TripsService.cancelTripBooking as the booking owner
      await this.tripsService.cancelTripBooking(tb.userId as string, tb.id as number);
      tripsCancelled++;
    }

    // 2) cancel room reservations linked to this order
    const reservations = await this.db.query.roomReservations.findMany({
      where: eq(schema.roomReservations.sourceId, orderId),
    });
    let roomsCancelled = 0;
    for (const rr of reservations) {
      await this.hotelsService.cancelRoomReservation(rr.userId as string, rr.id as number);
      roomsCancelled++;
    }

    // 3) mark order cancelled
    await this.db.update(schema.orders).set({ status: 'CANCELLED', updatedAt: new Date() }).where(eq(schema.orders.id, orderId));

    // notify order owner
    try {
      await this.db.insert(schema.notifications).values({
        userId: order.userId,
        title: 'Order cancelled',
        body: `Your order #${orderId} has been cancelled.`,
        data: JSON.stringify({ type: 'ORDER_CANCELLED', orderId }),
      });
    } catch (e) {
      // log and continue
      // eslint-disable-next-line no-console
      console.warn('Failed to write order cancelled notification', e);
    }

    return { ok: true, tripsCancelled, roomsCancelled, orderId };
  }

  /**
   * Admin: list all orders with optional filters (search by user name/email, status, date range)
   */
  async listAllOrders(opts: {
    page?: number;
    limit?: number;
    search?: string; // user name or email
    status?: string;
    startDate?: string; // inclusive YYYY-MM-DD
    endDate?: string;   // inclusive YYYY-MM-DD
  } = {}) {
    const page  = opts.page  && opts.page  > 0 ? opts.page  : 1;
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 20;
    const offset = (page - 1) * limit;
  
    const conditions: any[] = [];
  
    if (opts.status) conditions.push(eq(schema.orders.status, opts.status as any));
    if (opts.startDate) conditions.push(sql`${schema.orders.createdAt} >= ${opts.startDate}`);
    if (opts.endDate)   conditions.push(sql`${schema.orders.createdAt} <= ${opts.endDate}`);
  
    if (opts.search) {
      conditions.push(
        or(
          ilike(schema.users.name,  `%${opts.search}%`),
          ilike(schema.users.email, `%${opts.search}%`),
        ),
      );
    }
  
    // --- totals for pagination
    const totalCountResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.orders)
      .leftJoin(schema.users, eq(schema.users.id, schema.orders.userId))
      .where(conditions.length ? and(...conditions) : undefined);
    const totalCount = totalCountResult[0].count;
  
    // --- fetch orders + user
    const rows = await this.db
      .select({
        orderId:     schema.orders.id,
        status:      schema.orders.status,
        totalAmount: schema.orders.totalAmount,
        createdAt:   schema.orders.createdAt,
        userId:      schema.users.id,
        userName:    schema.users.name,
        userEmail:   schema.users.email,
      })
      .from(schema.orders)
      .leftJoin(schema.users, eq(schema.users.id, schema.orders.userId))
      .where(conditions.length ? (and(...conditions) as any) : undefined)
      .orderBy(desc(schema.orders.createdAt))
      .limit(limit)
      .offset(offset);
  
    const userIds = Array.from(new Set(rows.map((r: any) => r.userId).filter(Boolean)));
  
    // --- total paid per user (for shown users)
    const userTotalsMap = new Map<string, number>();
    if (userIds.length) {
      const totals = await this.db
        .select({
          userId: schema.orders.userId,
          totalPaid: sql<number>`COALESCE(SUM(${schema.orders.totalAmount}), 0)`,
        })
        .from(schema.orders)
        .where(inArray(schema.orders.userId, userIds))
        .groupBy(schema.orders.userId as any);
      for (const t of totals) userTotalsMap.set(t.userId, Number(t.totalPaid));
    }
  
    // --- batch load items/bookings/reservations
    const orderIds = rows.map((r: any) => r.orderId);
  
    const itemsByOrder = new Map<number, any[]>();
    const tripDetailsMap = new Map<number, any>();      // tripId -> trip details (dates, options, hotel info)
    const roomTypeDetailsMap = new Map<number, any>();  // roomTypeId -> {label, baseNightlyRate, hotel:{...}}
    const reservationsByOrder = new Map<number, any[]>(); // orderId -> reservations[]
    const tripBookingsByOrder = new Map<number, any[]>(); // orderId -> tripBookings[]
  
    if (orderIds.length) {
      // order items
      const items = await this.db.query.orderItems.findMany({
        where: (it) => inArray(it.orderId, orderIds),
      });
      for (const it of items) {
        const arr = itemsByOrder.get(it.orderId) || [];
        arr.push(it);
        itemsByOrder.set(it.orderId, arr);
      }
  
      // unique tripIds & roomTypeIds referenced by items
      const tripIds = Array.from(
        new Set(items.filter((i: any) => i.itemType === 'TRIP').map((i: any) => i.itemId)),
      );
      const roomTypeIds = Array.from(
        new Set(items.filter((i: any) => i.itemType === 'ROOM').map((i: any) => i.itemId)),
      );
  
      // trip details (dates/options/hotel)
      if (tripIds.length) {
        const trips = await this.db.query.trips.findMany({
          where: (t) => inArray(t.id, tripIds),
          columns: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            withMeals: true,
            withTransport: true,
            hotelIncluded: true,
            pricePerPerson: true,
            mealPricePerPerson: true,
            transportationPricePerPerson: true,
          },
          with: {
            tripHotels: {
              with: {
                hotel:   { columns: { id: true, name: true, currency: true } },
                roomType:{ columns: { id: true, label: true } },
              },
            },
          },
        });
        for (const t of trips) {
          const th = (t.tripHotels ?? [])[0];
          tripDetailsMap.set(t.id, {
            id: t.id,
            name: t.name,
            startDate: t.startDate,
            endDate: t.endDate,
            withMeals: t.withMeals,
            withTransport: t.withTransport,
            hotelIncluded: t.hotelIncluded,
            pricePerPerson: Number(t.pricePerPerson ?? 0),
            perPersonMeals: Number(t.mealPricePerPerson ?? 0),
            perPersonTransport: Number(t.transportationPricePerPerson ?? 0),
            hotel: t.hotelIncluded && th ? {
              hotelId: th.hotel?.id ?? null,
              hotelName: th.hotel?.name ?? null,
              currency: th.hotel?.currency ?? null,
              roomTypeId: th.roomType?.id ?? null,
              roomTypeLabel: th.roomType?.label ?? null,
              roomsNeeded: th.roomsNeeded,
            } : null,
          });
        }
      }
  
      // roomType details (label, baseNightlyRate, hotel)
      if (roomTypeIds.length) {
        const rts = await this.db.query.hotelRoomTypes.findMany({
          where: (rt) => inArray(rt.id, roomTypeIds),
          columns: { id: true, hotelId: true, label: true, baseNightlyRate: true },
          with: { hotel: { columns: { id: true, name: true, currency: true } } },
        });
        for (const rt of rts) {
          roomTypeDetailsMap.set(rt.id, {
            id: rt.id,
            label: rt.label,
            baseNightlyRate: Number(rt.baseNightlyRate ?? 0),
            hotel: rt.hotel ? { id: rt.hotel.id, name: rt.hotel.name, currency: rt.hotel.currency } : null,
          });
        }
      }
  
      // reservations tied to these orders (all users, admin view)
      const reservations = await this.db.query.roomReservations.findMany({
        where: (r) => inArray(r.sourceId, orderIds),
      });
      for (const rr of reservations) {
        const sid = rr.sourceId as number | null;
        if (sid == null) continue;
        const arr = reservationsByOrder.get(sid) || [];
        arr.push(rr);
        reservationsByOrder.set(sid, arr);
      }
  
      // trip bookings tied to these orders
      const tripBookings = await this.db.query.tripBookings.findMany({
        where: (tb) => inArray(tb.sourceId, orderIds),
      });
      for (const tb of tripBookings) {
        const sid = tb.sourceId as number | null;
        if (sid == null) continue;
        const arr = tripBookingsByOrder.get(sid) || [];
        arr.push(tb);
        tripBookingsByOrder.set(sid, arr);
      }
    }
  
    // --- build result
    const data = rows.map((r: any) => {
      const rawItems = itemsByOrder.get(r.orderId) || [];
  
      const enrichedItems = rawItems.map((it: any) => {
        if (it.itemType === 'TRIP') {
          const trip = tripDetailsMap.get(it.itemId) || null;
          return {
            id: it.id,
            type: it.itemType,
            trip, // includes dates/options/hotel breakdown
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
            refundAmount: it.refundAmount,
          };
        }
  
        if (it.itemType === 'ROOM') {
          const rt = roomTypeDetailsMap.get(it.itemId) || null;
          const orderReservations = reservationsByOrder.get(r.orderId) || [];
          const relatedRes = orderReservations.filter((res: any) => res.roomTypeId === it.itemId);
          const mappedRes = relatedRes.map((res: any) => {
            const nights = (
              (new Date(res.checkOutDate).getTime() - new Date(res.checkInDate).getTime())
              / (1000 * 60 * 60 * 24)
            );
            const perNightRate = rt ? Number(rt.baseNightlyRate ?? 0) : 0;
            const reservationTotal = Number((perNightRate * res.roomsBooked * nights).toFixed(2));
            return {
              reservationId: res.id,
              roomTypeId: res.roomTypeId,
              roomTypeLabel: rt?.label ?? null,
              hotelId: rt?.hotel?.id ?? null,
              hotelName: rt?.hotel?.name ?? null,
              currency: rt?.hotel?.currency ?? null,
              checkInDate: res.checkInDate,
              checkOutDate: res.checkOutDate,
              nights,
              roomsBooked: res.roomsBooked,
              perNightRate,
              reservationTotal,
              source: res.source,
              sourceId: res.sourceId,
            };
          });
  
          return {
            id: it.id,
            type: it.itemType,
            roomTypeId: it.itemId,
            roomTypeLabel: rt?.label ?? null,
            hotelId: rt?.hotel?.id ?? null,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
            reservations: mappedRes,
          };
        }
  
        // fallback item type
        return {
          id: it.id,
          type: it.itemType,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
        };
      });
  
      // bookings section
      const tripBookings = (tripBookingsByOrder.get(r.orderId) || []).map((tb: any) => {
        const t = tripDetailsMap.get(tb.tripId) || null;
        return {
          bookingId: tb.id,
          type: 'TRIP',
          tripId: tb.tripId,
          seats: tb.seats,
          total: tb.total,
          source: tb.source,
          sourceId: tb.sourceId,
          // snapshot from trip details
          startDate: t?.startDate ?? null,
          endDate: t?.endDate ?? null,
          withMeals: t?.withMeals ?? null,
          withTransport: t?.withTransport ?? null,
          hotelIncluded: t?.hotelIncluded ?? null,
        };
      });
  
      const roomResBookings = (reservationsByOrder.get(r.orderId) || []).map((rr: any) => {
        const rt = roomTypeDetailsMap.get(rr.roomTypeId) || null;
        const nights = (
          (new Date(rr.checkOutDate).getTime() - new Date(rr.checkInDate).getTime())
          / (1000 * 60 * 60 * 24)
        );
        const perNightRate = rt ? Number(rt.baseNightlyRate ?? 0) : 0;
        const reservationTotal = Number((perNightRate * rr.roomsBooked * nights).toFixed(2));
        return {
          bookingId: rr.id,
          type: 'ROOM',
          roomTypeId: rr.roomTypeId,
          roomTypeLabel: rt?.label ?? null,
          hotelId: rt?.hotel?.id ?? null,
          hotelName: rt?.hotel?.name ?? null,
          currency: rt?.hotel?.currency ?? null,
          checkInDate: rr.checkInDate,
          checkOutDate: rr.checkOutDate,
          nights,
          roomsBooked: rr.roomsBooked,
          perNightRate,
          reservationTotal,
          source: rr.source,
          sourceId: rr.sourceId,
        };
      });
  
      return {
        orderId: r.orderId,
        status: r.status,
        total: parseFloat(r.totalAmount),
        createdAt: r.createdAt,
        user: {
          id: r.userId,
          name: r.userName,
          email: r.userEmail,
          totalPaid: r.userId ? userTotalsMap.get(r.userId) ?? 0 : 0,
        },
        items: enrichedItems,
        bookings: [...tripBookings, ...roomResBookings],
      };
    });
  
    return {
      data,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }
  
}


