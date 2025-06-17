import { sql, relations } from 'drizzle-orm';
import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
  numeric,
  primaryKey,
  check,
  serial,
  index,
  time,
  date,
  unique,
  geometry,
} from 'drizzle-orm/pg-core';

/* ──────────────────────────────── ENUMS ──────────────────────────────── */
export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);

export const scopeEnum = pgEnum('scope', ['PUBLIC', 'PRIVATE']);

export const flightStatusEnum = pgEnum('flight_status', [
  'SCHEDULED',
  'DELAYED',
  'CANCELLED',
  'LANDED',
]);

export const taxiStatusEnum = pgEnum('taxi_status', [
  'REQUESTED',
  'ACCEPTED',
  'EN_ROUTE',
  'COMPLETED',
  'CANCELLED',
  'ARRIVED_AT_PICKUP',
  'IN_PROGRESS',
]);

export const bookingStatusEnum = pgEnum('booking_status', [
  'CONFIRMED',
  'CANCELLED',
]);
export const txSourceEnum = pgEnum('tx_source', [
  'TOPUP',
  'BOOKING',
  'REFUND',
  'ADMIN_ADJUST',
]);
export const txStatusEnum = pgEnum('tx_status', [
  'PENDING',
  'POSTED',
  'REJECTED',
]);

export const orderItemEntityEnum = pgEnum('order_item_entity_type', [
  'flight',
  'room',
  'event',
]);

// Ensure all entries in this enum have a corresponding relation
export const attachmentEntityEnum = pgEnum('attachment_entity_type', [
  'country',
  'city',
  'airport',
  'airline',
  'flight',
  'hotel',
  'room',
  'event',
  'attraction',
  'taxi_service',
  'organizer',
]);

export const attachmentRoleEnum = pgEnum('attachment_role', [
  'GALLERY',
  'MAIN',
  'ICON',
]);

export const packageDiscountTypeEnum = pgEnum('package_discount_type', [
  'percentage',
  'fixed_amount',
]);
export const promoCodeTypeEnum = pgEnum('promo_code_type', [
  'percentage',
  'fixed_amount',
]);
export const promoCodeApplyToEnum = pgEnum('promo_code_apply_to', [
  'cart',
  'specific_entities',
]);

// New Enum for Refund Policy entity types (can include taxi, separate from order items)
export const refundEntityTypeEnum = pgEnum('refund_entity_type', [
  'flight',
  'room',
  'event',
  'taxi', // Taxi can be specified for refund policies
]);

export const orderStatusEnum = pgEnum('order_status', [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'COMPLETED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]);

/* helper */
export const now = () => timestamp('created_at').defaultNow();
export const deletedAt = () => timestamp('deleted_at');

/* ──────────────────────────── AUTH & WALLET ─────────────────────────── */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }),
  username: varchar('username', { length: 100 }).unique(),
  email: varchar('email', { length: 150 }).unique(),
  phone: varchar('phone', { length: 20 }),
  birthDate: date('birth_date'),
  password: varchar('password', { length: 255 }), // null if OAuth
  provider: varchar('provider', { length: 50 }).default('local'),
  providerId: varchar('provider_id', { length: 100 }),
  role: userRoleEnum('role').default('user').notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // Session should cascade delete with user
  jti: varchar('jti', { length: 100 }).notNull().unique(),
  refreshToken: varchar('refresh_token', { length: 500 }).notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: now(),
  expiresAt: timestamp('expires_at').notNull(),
});

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }), // Wallet should cascade delete with user
    balance: numeric('balance', { precision: 12, scale: 2 }).default('0'),
    currency: varchar('currency', { length: 3 }).default('USD'),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (wallets) => [index('wallets_user_id_idx').on(wallets.userId)],
);

export const userTransactions = pgTable('user_transactions', {
  id: serial('id').primaryKey(),
  walletId: uuid('wallet_id').references(() => wallets.id, {
    onDelete: 'cascade', // Transactions should cascade delete with wallet
  }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // + / –
  source: txSourceEnum('source').notNull(),
  status: txStatusEnum('status').default('POSTED'),
  note: text('note'),
  orderId: integer('order_id').references(() => orders.id, {
    // Link to a general order
    onDelete: 'set null', // If order is deleted, transaction remains
  }),
  taxiOrderId: integer('taxi_order_id').references(() => taxiOrders.id, {
    // Link to a taxi order
    onDelete: 'set null', // If taxi order is deleted, transaction remains
  }),
  createdAt: now(),
});
/* ───────────────────────────── FILES & MEDIA ─────────────────────────── */
export const fileObjects = pgTable('file_objects', {
  id: serial('id').primaryKey(),
  bucket: varchar('bucket', { length: 50 }).notNull(),
  objectKey: varchar('object_key', { length: 255 }).notNull(),
  mime: varchar('mime', { length: 80 }).notNull(),
  size: integer('size'),
  scope: scopeEnum('scope').notNull().default('PUBLIC'),
  ownerId: uuid('owner_id').references(() => users.id, {
    onDelete: 'set null',
  }), // File objects can remain even if owner is deleted, but ownerId becomes null
  encrypted: boolean('encrypted').default(false),
  uploadedAt: now(),
  deletedAt: deletedAt(),
});

export const userAvatars = pgTable('user_avatars', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }), // Avatar should cascade delete with user
  fileObjectId: integer('file_object_id')
    .notNull()
    .references(() => fileObjects.id, { onDelete: 'restrict' }), // File object should NOT be deleted if it's an avatar
  createdAt: timestamp('created_at').defaultNow(),
});

export const userSecureFiles = pgTable('user_secure_files', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // Secure files should cascade delete with user
  objectKey: varchar('object_key', { length: 255 }).notNull(),
  bucket: varchar('bucket', { length: 50 }).notNull(),
  mime: varchar('mime', { length: 80 }).notNull(),
  size: integer('size'),
  encryptedKey: text('encrypted_key').notNull(), // Only the app can decrypt this
  synced: boolean('synced').default(false),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow(),
  deletedAt: deletedAt(),
});

export const attachments = pgTable(
  'attachments',
  {
    objectId: integer('object_id').references(() => fileObjects.id, {
      onDelete: 'cascade', // If a file object is deleted, remove its attachment record
    }),
    entityType: attachmentEntityEnum('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    role: attachmentRoleEnum('role').default('GALLERY'),
    sort: integer('sort').default(0),
  },
  (t) => [primaryKey({ columns: [t.objectId, t.entityType, t.entityId] })],
);

/* ─────────────────────── SOCIAL (FAVOURITE, REVIEW) ─────────────────── */
export const favourites = pgTable(
  'favourites',
  {
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // Favourites should cascade delete with user
    entityType: attachmentEntityEnum('entity_type').notNull(), // Using the same enum as attachments for consistency
    entityId: integer('entity_id').notNull(),
    createdAt: now(),
    deletedAt: deletedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityType, t.entityId] })],
);

export const reviews = pgTable(
  'reviews',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // Reviews should cascade delete with user
    entityType: attachmentEntityEnum('entity_type').notNull(), // Using the same enum as attachments for consistency
    entityId: integer('entity_id').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: now(),
    deletedAt: deletedAt(),
  },
  (t) => [check('rating_between_1_and_5', sql`${t.rating} BETWEEN 1 AND 5`)],
);

/* ────────────────────────── REFERENCE GEOGRAPHY ─────────────────────── */
export const countries = pgTable('countries', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 2 }).unique(), // ISO-3166-1
  name: varchar('name', { length: 90 }).notNull(),
  is_active: boolean('is_active').default(true),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(), // Added for consistency
});

export const cities = pgTable(
  'cities',
  {
    id: serial('id').primaryKey(),
    countryId: integer('country_id').references(() => countries.id, {
      onDelete: 'restrict', // Don't delete city if country is deleted (handle manually or set null)
    }),
    name: varchar('name', { length: 90 }).notNull(),
    location: geometry('location', {
      type: 'point',
      mode: 'xy',
      srid: 4326,
    }).notNull(),
    is_active: boolean('is_active').default(true),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default(
      '0.00',
    ),
    ratingCount: integer('rating_count').default(0),
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow(), // Added
    deletedAt: deletedAt(), // Added for consistency
  },
  (t) => [index('cities_location_gix').using('gist', t.location)],
);

/* ───────────────────────────── HOTELS & ROOMS ───────────────────────── */
export const hotels = pgTable(
  'hotels',
  {
    id: serial('id').primaryKey(),
    cityId: integer('city_id').references(() => cities.id, {
      onDelete: 'restrict', // Don't delete hotel if city is deleted
    }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    stars: integer('stars'),
    address: varchar('address', { length: 255 }),
    location: geometry('location', {
      type: 'point',
      mode: 'xy',
      srid: 4326,
    }).notNull(),
    checkInTime: time('check_in_time').default('14:00'),
    checkOutTime: time('check_out_time').default('12:00'),
    is_active: boolean('is_active').default(true),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default(
      '0.00',
    ),
    ratingCount: integer('rating_count').default(0),
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow(), // Added
    deletedAt: deletedAt(), // Added for consistency
  },
  (t) => [index('hotales_location_gix').using('gist', t.location)],
);

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  hotelId: integer('hotel_id').references(() => hotels.id, {
    onDelete: 'cascade', // Rooms should cascade delete with hotel
  }),
  label: varchar('label', { length: 60 }),
  personCap: integer('person_cap').default(2),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  discountPrice: numeric('discount_price', { precision: 10, scale: 2 }),
  is_active: boolean('is_active').default(true),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(), // Added for consistency
});

export const roomReservations = pgTable(
  'room_reservations',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }), // Room reservations should cascade delete with room
    orderId: integer('order_id') // link to payment
      .references(() => orders.id, { onDelete: 'cascade' }), // Room reservations should cascade delete with order
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // Room reservations should cascade delete with user
    startDate: date('start_date').notNull(), // inclusive (check-in day)
    endDate: date('end_date').notNull(), // exclusive (check-out day)
    guests: integer('guests').default(1),
    status: bookingStatusEnum('status').default('CONFIRMED'),
    price: numeric('price', { precision: 10, scale: 2 }),
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow(), // Added
    deletedAt: deletedAt(), // Added for consistency
  },
  (t) => [check('valid_range', sql`${t.endDate} > ${t.startDate}`)],
);

/* ─────────────────────────────── FLIGHTS ────────────────────────────── */
export const airports = pgTable(
  'airports',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 3 }).unique(), // IATA
    cityId: integer('city_id').references(() => cities.id, {
      onDelete: 'restrict', // Don't delete airport if city is deleted
    }),
    name: varchar('name', { length: 120 }).notNull(),
    location: geometry('location', {
      type: 'point',
      mode: 'xy',
      srid: 4326,
    }).notNull(),
    is_active: boolean('is_active').default(true),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default(
      '0.00',
    ),
    ratingCount: integer('rating_count').default(0),
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow(), // Added
    deletedAt: deletedAt(), // Added for consistency
  },
  (t) => [index('airports_location_gix').using('gist', t.location)],
);

export const airlines = pgTable('airlines', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  website: varchar('website', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  is_active: boolean('is_active').default(true),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(),
});

export const flights = pgTable('flights', {
  id: serial('id').primaryKey(),
  flightNo: varchar('flight_no', { length: 8 }).notNull(),
  origin: integer('origin').references(() => airports.id, {
    onDelete: 'restrict',
  }), // Don't delete airport if flights exist
  airlineId: integer('airline_id').references(() => airlines.id, {
    onDelete: 'restrict',
  }), // Don't delete airline if flights exist
  destination: integer('destination').references(() => airports.id, {
    onDelete: 'restrict',
  }), // Don't delete airport if flights exist
  departureAt: timestamp('departure_at').notNull(),
  arrivalAt: timestamp('arrival_at').notNull(),
  status: flightStatusEnum('status').default('SCHEDULED'),
  is_active: boolean('is_active').default(true),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(),
});

export const seatClasses = pgTable('seat_class', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 12 }).unique().notNull(),
  label: varchar('label', { length: 40 }),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: deletedAt(),
});

export const flightInventory = pgTable(
  'flight_inventory',
  {
    flightId: integer('flight_id').references(() => flights.id, {
      onDelete: 'cascade', // Flight inventory should cascade delete with flight
    }),
    classId: integer('class_id').references(() => seatClasses.id, {
      onDelete: 'restrict',
    }), // Don't delete seat class if inventory exists
    seatsTotal: integer('seats_total').notNull(),
    seatsSold: integer('seats_sold').default(0),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    discountPrice: numeric('discount_price', { precision: 10, scale: 2 }),
    createdAt: now(), // Added
    updatedAt: timestamp('updated_at').defaultNow(), // Added
  },
  (t) => [primaryKey({ columns: [t.flightId, t.classId] })],
);

export const flightBookings = pgTable('flight_bookings', {
  id: serial('id').primaryKey(),
  flightId: integer('flight_id')
    .notNull()
    .references(() => flights.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  classId: integer('class_id')
    .notNull()
    .references(() => seatClasses.id, { onDelete: 'restrict' }),
  numberOfSeats: integer('number_of_seats').notNull().default(1), // Tracks how many seats are part of this booking
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  status: bookingStatusEnum('status').default('CONFIRMED').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: deletedAt(),
  orderId: integer('order_id').references(() => orders.id, {
    onDelete: 'cascade',
  }),
});

export const flightBookingSeats = pgTable(
  'flight_booking_seats',
  {
    id: serial('id').primaryKey(),
    flightBookingId: integer('flight_booking_id')
      .notNull()
      .references(() => flightBookings.id, { onDelete: 'cascade' }), // Each seat belongs to a flight booking
    seatNumber: varchar('seat_number', { length: 10 }).notNull(), // e.g., '12A', '12B'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: deletedAt(),
  },
  (t) => [unique('unq_seat_per_booking').on(t.flightBookingId, t.seatNumber)],
);

/* ─────────────────────────────── TAXI ───────────────────────────────── */
export const taxiServices = pgTable('taxi_service', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  baseFare: numeric('base_fare', { precision: 8, scale: 2 }).notNull(),
  perKm: numeric('per_km', { precision: 8, scale: 2 }).notNull(),
  perMin: numeric('per_min', { precision: 8, scale: 2 }).notNull(),
  is_active: boolean('is_active').default(true),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(),
});

export const taxiOrders = pgTable(
  'taxi_order',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // Taxi orders should cascade delete with user
    serviceId: integer('service_id').references(() => taxiServices.id, {
      onDelete: 'restrict',
    }), // Don't delete taxi service if orders exist
    pickupLocation: geometry('location', {
      type: 'point',
      mode: 'xy',
      srid: 4326,
    }).notNull(),
    dropLocation: geometry('location', {
      type: 'point',
      mode: 'xy',
      srid: 4326,
    }).notNull(),
    distanceKm: numeric('distance_km', { precision: 8, scale: 2 }),
    durationMin: integer('duration_min'),
    price: numeric('price', { precision: 10, scale: 2 }),
    status: taxiStatusEnum('status').default('REQUESTED'),
    requestedAt: now(),
    createdAt: now(), // Added for general record creation timestamp
    updatedAt: timestamp('updated_at').defaultNow(), // Added
    deletedAt: deletedAt(), // Added for consistency
  },
  (t) => [
    index('pickup_location_gix').using('gist', t.pickupLocation),
    index('drop_location_gix').using('gist', t.dropLocation),
  ],
);

/* ───────────────────────────── EVENTS / TICKETS ─────────────────────── */
export const organizers = pgTable('organizers', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  website: varchar('website', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  is_active: boolean('is_active').default(true),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(),
});

export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    cityId: integer('city_id').references(() => cities.id, {
      onDelete: 'restrict', // Don't delete event if city is deleted
    }),
    organizerId: integer('organizer_id').references(() => organizers.id, {
      onDelete: 'cascade', // Events should cascade delete with organizer
    }),
    title: varchar('title', { length: 140 }).notNull(),
    location: geometry('location', {
      type: 'point',
      mode: 'xy',
      srid: 4326,
    }).notNull(),
    description: text('description'),
    venue: varchar('venue', { length: 140 }),
    startsAt: timestamp('starts_at').notNull(),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default(
      '0.00',
    ),
    ratingCount: integer('rating_count').default(0),
    endsAt: timestamp('ends_at'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    discountPrice: numeric('discount_price', { precision: 10, scale: 2 }),
    capacity: integer('capacity'),
    is_active: boolean('is_active').default(true),
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow(), // Added
    deletedAt: deletedAt(),
  },
  (t) => [index('events_location_gix').using('gist', t.location)],
);

export const eventTags = pgTable('event_tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  slug: varchar('slug', { length: 60 }).notNull().unique(),
  createdAt: now(), // Added
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(), // Added
});

export const eventTagMappings = pgTable(
  'event_tag_mappings',
  {
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }), // Tag mapping should cascade delete with event
    tagId: integer('tag_id')
      .notNull()
      .references(() => eventTags.id, { onDelete: 'cascade' }), // Tag mapping should cascade delete with tag
  },
  (t) => [primaryKey({ columns: [t.eventId, t.tagId] })],
);

export const eventTickets = pgTable('event_tickets', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }), // Event tickets should cascade delete with event
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // Event tickets should cascade delete with user
  orderId: integer('order_id').references(() => orders.id, {
    onDelete: 'cascade', // Event tickets should cascade delete with order
  }),
  numberOfTickets: integer('number_of_tickets ').default(1),
  status: bookingStatusEnum('status').default('CONFIRMED'),
  price: numeric('price', { precision: 10, scale: 2 }), // snapshot
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(), // Added
});

export const eventTicketNumbers = pgTable(
  'event_ticket_numbers',
  {
    id: serial('id').primaryKey(),
    eventTicketId: integer('event_ticket_id')
      .notNull()
      .references(() => eventTickets.id, { onDelete: 'cascade' }), // Links to the parent eventTickets booking
    ticketNumber: varchar('ticket_number', { length: 50 }).notNull().unique(), // Unique identifier for each physical ticket
    // You can optionally add a 'status' field here if individual tickets need their own lifecycle (e.g., 'UNUSED', 'USED', 'INVALID')
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: deletedAt(),
  },
  (t) => [unique('unq_ticket_number').on(t.ticketNumber)],
);

/* ───────────────────────────── ATTRACTIONS ──────────────────────────── */
export const attractions = pgTable(
  'attraction',
  {
    id: serial('id').primaryKey(),
    cityId: integer('city_id').references(() => cities.id, {
      onDelete: 'restrict', // Don't delete attraction if city is deleted
    }),
    name: varchar('name', { length: 140 }).notNull(),
    description: text('description'),
    location: geometry('location', {
      type: 'point',
      mode: 'xy',
      srid: 4326,
    }).notNull(),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default(
      '0.00',
    ),
    ratingCount: integer('rating_count').default(0),
    is_active: boolean('is_active').default(true),
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow(), // Added
    deletedAt: deletedAt(), // Added
  },
  (t) => [index('attraction_location_gix').using('gist', t.location)],
);

/* ─────────────────────────── REFUND POLICY DATA ─────────────────────── */
export const refundPolicy = pgTable('refund_policy', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  policyText: text('policy_text'), // General policy text
  // Fields for dynamic refunds based on type
  entityType: refundEntityTypeEnum('entity_type'), // 'flight', 'room', 'event', 'taxi'
  triggerMinutesBeforeService: integer('trigger_minutes_before_service'), // e.g., 24*60 for 24 hours before
  triggerStatus: varchar('trigger_status', { length: 50 }), // e.g., 'CANCELLED', 'ARRIVED_AT_PICKUP' for taxi
  refundPercentage: numeric('refund_percentage', { precision: 5, scale: 2 }), // e.g., 0.50 for 50%
  description: text('description'), // Specific description for this dynamic rule
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(), // Added
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // Orders should cascade delete with user
  promoCodeId: integer('promo_code_id').references(() => promoCodes.id, {
    onDelete: 'set null', // If promo code is deleted, remove from order but keep order
  }),
  packageId: integer('package_id').references(() => packages.id, {
    onDelete: 'set null', // If package is deleted, remove from order but keep order
  }),
  discountAmount: numeric('discount_amount', {
    precision: 10,
    scale: 2,
  }).default('0.00'), // Total discount applied
  packageDiscountAmount: numeric('package_discount_amount', {
    precision: 10,
    scale: 2,
  }).default('0.00'), // Specific discount from package
  promoCodeDiscountAmount: numeric('promo_code_discount_amount', {
    precision: 10,
    scale: 2,
  }).default('0.00'), // Specific discount from promo code
  total: numeric('total', { precision: 10, scale: 2 }).notNull(),
  status: orderStatusEnum('status').default('CONFIRMED'), // Changed to orderStatusEnum
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(), // Added
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }), // Order items should cascade delete with order
  entityType: orderItemEntityEnum('entity_type').notNull(), // 'flight', 'room', 'event'
  entityId: integer('entity_id'), // This links to flightBookings.id, roomReservations.id, eventTickets.id
  title: varchar('title', { length: 150 }).notNull(), // snapshot title
  image: varchar('image', { length: 500 }), // snapshot image url
  price: numeric('price', { precision: 10, scale: 2 }).notNull(), // snapshot total price for this item
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: deletedAt(),
});

export const carts = pgTable('carts', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique() // One cart per user
    .references(() => users.id, { onDelete: 'cascade' }), // Cart should cascade delete with user
  promoCodeId: integer('promo_code_id').references(() => promoCodes.id, {
    onDelete: 'set null', // If promo code is deleted, remove from cart but keep cart
  }),
  packageId: integer('package_id').references(() => packages.id, {
    onDelete: 'set null', // If package is deleted, remove from cart but keep cart
  }),
  discountAmount: numeric('discount_amount', {
    precision: 10,
    scale: 2,
  }).default('0.00'), // Total discount applied to the cart from either promo code or package
  packageDiscountAmount: numeric('package_discount_amount', {
    precision: 10,
    scale: 2,
  }).default('0.00'), // Specific discount from package
  promoCodeDiscountAmount: numeric('promo_code_discount_amount', {
    precision: 10,
    scale: 2,
  }).default('0.00'), // Specific discount from promo code
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: deletedAt(), // Added
});

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  cartId: integer('cart_id') // Changed from userId to cartId
    .notNull()
    .references(() => carts.id, { onDelete: 'cascade' }), // Cart items should cascade delete with the cart
  entityType: orderItemEntityEnum('entity_type').notNull(), // 'flight', 'room', 'event', 'taxi_order'
  entityId: integer('entity_id').notNull(), // The ID of the specific entity (flight.id, room.id, event.id)

  // --- Booking-specific details for the cart item ---
  // For Flights:
  classId: integer('class_id').references(() => seatClasses.id, {
    onDelete: 'restrict',
  }), // e.g., Economy, Business
  numberOfSeats: integer('number_of_seats').default(1), // How many seats for this flight item

  // For Events:
  numberOfTickets: integer('number_of_tickets').default(1), // How many tickets for this event item

  // For Rooms:
  checkInDate: date('check_in_date'),
  checkOutDate: date('check_out_date'),

  // General cart item details:
  price: numeric('price', { precision: 10, scale: 2 }), // Snapshot price when added
  addedAt: timestamp('added_at').defaultNow(),
  lastUpdatedAt: timestamp('last_updated_at').defaultNow(),
  deletedAt: deletedAt(), // Added (if you wish to soft delete cart items)
});

export const packages = pgTable('packages', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  discountType: packageDiscountTypeEnum('discount_type').notNull(), // 'percentage' or 'fixed_amount'
  discountValue: numeric('discount_value', {
    precision: 10,
    scale: 2,
  }).notNull(), // e.g., 10 for 10% or 25.00 for $25
  minEntities: integer('min_entities').default(1), // Minimum number of required entities to apply package
  maxUsesGlobal: integer('max_uses_global'), // Total uses across all users (nullable for unlimited)
  currentUsesGlobal: integer('current_uses_global').default(0),
  maxUsesPerUser: integer('max_uses_per_user'), // Max uses per individual user (nullable for unlimited)
  isActive: boolean('is_active').default(true),
  startsAt: timestamp('starts_at').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: deletedAt(), // Added for soft deletion
});

export const packageRequiredEntities = pgTable(
  'package_required_entities',
  {
    packageId: integer('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    entityType: orderItemEntityEnum('entity_type').notNull(), // 'flight', 'room', 'event' (NOT taxi here)
    entityId: integer('entity_id'), // Optional: Specific entity ID if package requires a specific item (e.g., flight to specific city)
    minQuantity: integer('min_quantity').default(1), // Minimum quantity of this entity type
    maxQuantity: integer('max_quantity'), // Maximum quantity of this entity type
    createdAt: now(), // Added
    updatedAt: timestamp('updated_at').defaultNow(), // Added
    deletedAt: deletedAt(), // Added
  },
  (t) => [primaryKey({ columns: [t.packageId, t.entityType, t.entityId] })], // Composite PK for uniqueness
);

export const packageUsages = pgTable(
  'package_usages',
  {
    id: serial('id').primaryKey(),
    packageId: integer('package_id')
      .notNull()
      .references(() => packages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orderId: integer('order_id') // Link to a general order (NOT taxi order)
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    usedAt: now(),
    deletedAt: deletedAt(),
  },
  (t) => [unique('package_usage_unique_per_order').on(t.packageId, t.orderId)], // A package can only be used once per order
);

export const promoCodes = pgTable('promo_codes', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).unique().notNull(), // The actual code string
  type: promoCodeTypeEnum('type').notNull(), // 'percentage' or 'fixed_amount'
  value: numeric('value', { precision: 10, scale: 2 }).notNull(), // e.g., 20 for 20% or 10.00 for $10
  minCartValue: numeric('min_cart_value', { precision: 10, scale: 2 }).default(
    '0.00',
  ), // Optional: minimum cart value
  maxDiscountValue: numeric('max_discount_value', { precision: 10, scale: 2 }), // Optional: max discount applied (e.g., 20% off up to $50)
  appliesTo: promoCodeApplyToEnum('applies_to').default('cart').notNull(), // 'cart' or 'specific_entities'
  maxUsesGlobal: integer('max_uses_global'), // Total uses across all users (nullable for unlimited)
  currentUsesGlobal: integer('current_uses_global').default(0),
  maxUsesPerUser: integer('max_uses_per_user'), // Max uses per individual user (nullable for unlimited)
  isPublic: boolean('is_public').default(true), // True for public codes, false for private/targeted
  isActive: boolean('is_active').default(true),
  startsAt: timestamp('starts_at').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  description: text('description'),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: deletedAt(), // Added for soft deletion
});

export const promoCodeEntities = pgTable(
  'promo_code_entities',
  {
    promoCodeId: integer('promo_code_id')
      .notNull()
      .references(() => promoCodes.id, { onDelete: 'cascade' }), // If promo code deleted, remove mapping
    entityType: orderItemEntityEnum('entity_type').notNull(), // 'flight', 'room', 'event' (NOT taxi here)
    entityId: integer('entity_id').notNull(), // ID of the specific flight/room/event
    createdAt: now(), // Added
    updatedAt: timestamp('updated_at').defaultNow(), // Added
    deletedAt: deletedAt(), // Added
  },
  (t) => [primaryKey({ columns: [t.promoCodeId, t.entityType, t.entityId] })],
);

export const promoCodeUsages = pgTable(
  'promo_code_usages',
  {
    id: serial('id').primaryKey(),
    promoCodeId: integer('promo_code_id')
      .notNull()
      .references(() => promoCodes.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orderId: integer('order_id') // Link to a general order (NOT taxi order)
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    usedAt: now(),
    deletedAt: deletedAt(),
  },
  (t) => [
    unique('promo_code_usage_unique_per_order').on(t.promoCodeId, t.orderId),
  ], // A promo code can only be used once per order
);

export const chats = pgTable('chats', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // Chats should cascade delete with user
  status: varchar('status', { length: 20 }).default('OPEN'), // OPEN, CLOSED, ESCALATED
  isReadByAdmin: boolean('is_read_by_admin').default(false),
  isReadByUser: boolean('is_read_by_user').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: deletedAt(),
});
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  chatId: integer('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }), // Messages should cascade delete with chat
  sender: varchar('sender', { length: 10 }).notNull(), // 'USER' or 'ADMIN'
  message: text('message').notNull(),
  faqId: integer('faq_id').references(() => faq.id, { onDelete: 'set null' }), // FAQ can be set to null if FAQ is deleted
  createdAt: timestamp('created_at').defaultNow(),
});
export const faq = pgTable('faq', {
  id: serial('id').primaryKey(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(), // Added
  deletedAt: deletedAt(), // Added
});

/* ─────────────────────────── RELATIONS ─────────────────────── */

// --- USER RELATIONS ---
export const usersRelations = relations(users, ({ one, many }) => ({
  sessions: many(sessions),
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
  transactions: many(userTransactions),
  avatar: one(userAvatars, {
    fields: [users.id],
    references: [userAvatars.userId],
  }),
  privateFiles: many(userSecureFiles),
  favorites: many(favourites),
  reviews: many(reviews),
  taxiOrders: many(taxiOrders),
  orders: many(orders),
  cart: one(carts, {
    fields: [users.id],
    references: [carts.userId],
  }),
  roomReservations: many(roomReservations),
  flightBookings: many(flightBookings),
  eventTickets: many(eventTickets),
  chats: many(chats),
  fileObjects: many(fileObjects), // User owns many file objects
  packageUsages: many(packageUsages), // Added: User can have many package usages
  promoCodeUsages: many(promoCodeUsages), // Added: User can have many promo code usages
}));

// --- SESSION RELATIONS ---
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// --- WALLET RELATIONS ---
export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
  transactions: many(userTransactions),
}));

// --- USER TRANSACTION RELATIONS ---
export const userTransactionsRelations = relations(
  userTransactions,
  ({ one }) => ({
    wallet: one(wallets, {
      fields: [userTransactions.walletId],
      references: [wallets.id],
    }),
  }),
);

// --- FILE OBJECT RELATIONS ---
export const fileObjectsRelations = relations(fileObjects, ({ one, many }) => ({
  owner: one(users, {
    fields: [fileObjects.ownerId],
    references: [users.id],
  }),
  avatar: one(userAvatars, {
    fields: [fileObjects.id],
    references: [userAvatars.fileObjectId],
  }),
  attachments: many(attachments), // A file object can be part of many attachments
}));

// --- USER AVATAR RELATIONS ---
export const userAvatarsRelations = relations(userAvatars, ({ one }) => ({
  user: one(users, {
    fields: [userAvatars.userId],
    references: [users.id],
  }),
  fileObject: one(fileObjects, {
    fields: [userAvatars.fileObjectId],
    references: [fileObjects.id],
  }),
}));

// --- USER SECURE FILES RELATIONS ---
export const userPrivateFilesRelations = relations(
  userSecureFiles,
  ({ one }) => ({
    user: one(users, {
      fields: [userSecureFiles.userId],
      references: [users.id],
    }),
  }),
);

// --- ATTACHMENTS RELATIONS (Polymorphic) ---
export const attachmentsRelations = relations(attachments, ({ one }) => ({
  fileObject: one(fileObjects, {
    fields: [attachments.objectId],
    references: [fileObjects.id],
  }),
  // Polymorphic relations for entityId/entityType
  country: one(countries, {
    fields: [attachments.entityId],
    references: [countries.id],
  }),
  city: one(cities, {
    fields: [attachments.entityId],
    references: [cities.id],
  }),
  airport: one(airports, {
    fields: [attachments.entityId],
    references: [airports.id],
  }),
  airline: one(airlines, {
    fields: [attachments.entityId],
    references: [airlines.id],
  }),
  flight: one(flights, {
    fields: [attachments.entityId],
    references: [flights.id],
  }),
  hotel: one(hotels, {
    fields: [attachments.entityId],
    references: [hotels.id],
  }),
  room: one(rooms, {
    fields: [attachments.entityId],
    references: [rooms.id],
  }),
  event: one(events, {
    fields: [attachments.entityId],
    references: [events.id],
  }),
  attraction: one(attractions, {
    fields: [attachments.entityId],
    references: [attractions.id],
  }),
  taxiService: one(taxiServices, {
    fields: [attachments.entityId],
    references: [taxiServices.id],
  }),
  organizer: one(organizers, {
    fields: [attachments.entityId],
    references: [organizers.id],
  }),
}));

// --- FAVOURITES RELATIONS (Polymorphic) ---
export const favouritesRelations = relations(favourites, ({ one }) => ({
  user: one(users, {
    fields: [favourites.userId],
    references: [users.id],
  }),
  // Polymorphic relations for entityId/entityType
  country: one(countries, {
    fields: [favourites.entityId],
    references: [countries.id],
  }),
  city: one(cities, {
    fields: [favourites.entityId],
    references: [cities.id],
  }),
  airport: one(airports, {
    fields: [favourites.entityId],
    references: [airports.id],
  }),
  airline: one(airlines, {
    fields: [favourites.entityId],
    references: [airlines.id],
  }),
  flight: one(flights, {
    fields: [favourites.entityId],
    references: [flights.id],
  }),
  hotel: one(hotels, {
    fields: [favourites.entityId],
    references: [hotels.id],
  }),
  room: one(rooms, {
    fields: [favourites.entityId],
    references: [rooms.id],
  }),
  event: one(events, {
    fields: [favourites.entityId],
    references: [events.id],
  }),
  attraction: one(attractions, {
    fields: [favourites.entityId],
    references: [attractions.id],
  }),
  taxiService: one(taxiServices, {
    fields: [favourites.entityId],
    references: [taxiServices.id],
  }),
  organizer: one(organizers, {
    fields: [favourites.entityId],
    references: [organizers.id],
  }),
  // Added: If packages/promo codes can be favorited
  package: one(packages, {
    fields: [favourites.entityId],
    references: [packages.id],
  }),
  promoCode: one(promoCodes, {
    fields: [favourites.entityId],
    references: [promoCodes.id],
  }),
}));

// --- REVIEWS RELATIONS (Polymorphic) ---
export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  // Polymorphic relations for entityId/entityType
  country: one(countries, {
    fields: [reviews.entityId],
    references: [countries.id],
  }),
  city: one(cities, {
    fields: [reviews.entityId],
    references: [cities.id],
  }),
  airport: one(airports, {
    fields: [reviews.entityId],
    references: [airports.id],
  }),
  airline: one(airlines, {
    fields: [reviews.entityId],
    references: [airlines.id],
  }),
  flight: one(flights, {
    fields: [reviews.entityId],
    references: [flights.id],
  }),
  hotel: one(hotels, {
    fields: [reviews.entityId],
    references: [hotels.id],
  }),
  room: one(rooms, {
    fields: [reviews.entityId],
    references: [rooms.id],
  }),
  event: one(events, {
    fields: [reviews.entityId],
    references: [events.id],
  }),
  attraction: one(attractions, {
    fields: [reviews.entityId],
    references: [attractions.id],
  }),
  taxiService: one(taxiServices, {
    fields: [reviews.entityId],
    references: [taxiServices.id],
  }),
  organizer: one(organizers, {
    fields: [reviews.entityId],
    references: [organizers.id],
  }),
  // Added: If packages/promo codes can be reviewed
  package: one(packages, {
    fields: [reviews.entityId],
    references: [packages.id],
  }),
  promoCode: one(promoCodes, {
    fields: [reviews.entityId],
    references: [promoCodes.id],
  }),
}));

// --- GEOGRAPHY RELATIONS ---
export const countriesRelations = relations(countries, ({ many }) => ({
  cities: many(cities),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const citiesRelations = relations(cities, ({ one, many }) => ({
  country: one(countries, {
    fields: [cities.countryId],
    references: [countries.id],
  }),
  hotels: many(hotels),
  airports: many(airports),
  events: many(events),
  attractions: many(attractions),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

// --- HOTEL & ROOM RELATIONS ---
export const hotelsRelations = relations(hotels, ({ one, many }) => ({
  city: one(cities, {
    fields: [hotels.cityId],
    references: [cities.id],
  }),
  rooms: many(rooms),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const roomsRelations = relations(rooms, ({ one, many }) => ({
  hotel: one(hotels, {
    fields: [rooms.hotelId],
    references: [hotels.id],
  }),
  reservations: many(roomReservations),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const roomReservationsRelations = relations(
  roomReservations,
  ({ one }) => ({
    room: one(rooms, {
      fields: [roomReservations.roomId],
      references: [rooms.id],
    }),
    order: one(orders, {
      fields: [roomReservations.orderId],
      references: [orders.id],
    }),
    user: one(users, {
      fields: [roomReservations.userId],
      references: [users.id],
    }),
  }),
);

// --- FLIGHT RELATIONS ---
export const airportsRelations = relations(airports, ({ one, many }) => ({
  city: one(cities, {
    fields: [airports.cityId],
    references: [cities.id],
  }),
  originFlights: many(flights, {
    relationName: 'originAirport', // Distinct relation name for flights starting here
  }),
  destinationFlights: many(flights, {
    relationName: 'destinationAirport', // Distinct relation name for flights ending here
  }),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const airlinesRelations = relations(airlines, ({ many }) => ({
  flights: many(flights),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const flightsRelations = relations(flights, ({ one, many }) => ({
  originAirport: one(airports, {
    fields: [flights.origin],
    references: [airports.id],
    relationName: 'originAirport', // Link to the 'originAirport' relation on airports
  }),
  destinationAirport: one(airports, {
    fields: [flights.destination],
    references: [airports.id],
    relationName: 'destinationAirport', // Link to the 'destinationAirport' relation on airports
  }),
  airline: one(airlines, {
    fields: [flights.airlineId],
    references: [airlines.id],
  }),
  inventory: many(flightInventory),
  bookings: many(flightBookings),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const seatClassesRelations = relations(seatClasses, ({ many }) => ({
  flightInventory: many(flightInventory),
  flightBookings: many(flightBookings),
}));

export const flightInventoryRelations = relations(
  flightInventory,
  ({ one }) => ({
    flight: one(flights, {
      fields: [flightInventory.flightId],
      references: [flights.id],
    }),
    seatClass: one(seatClasses, {
      fields: [flightInventory.classId],
      references: [seatClasses.id],
    }),
  }),
);

export const flightBookingsRelations = relations(
  flightBookings,
  ({ one, many }) => ({
    flight: one(flights, {
      fields: [flightBookings.flightId],
      references: [flights.id],
    }),
    seatClass: one(seatClasses, {
      fields: [flightBookings.classId],
      references: [seatClasses.id],
    }),
    order: one(orders, {
      fields: [flightBookings.orderId],
      references: [orders.id],
    }),
    user: one(users, {
      fields: [flightBookings.userId],
      references: [users.id],
    }),
    flightBookingSeats: many(flightBookingSeats),
  }),
);

export const flightBookingSeatsRelations = relations(
  flightBookingSeats,
  ({ one }) => ({
    flightBooking: one(flightBookings, {
      fields: [flightBookingSeats.flightBookingId],
      references: [flightBookings.id],
    }),
  }),
);

// --- TAXI RELATIONS ---
export const taxiServicesRelations = relations(taxiServices, ({ many }) => ({
  orders: many(taxiOrders),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const taxiOrdersRelations = relations(taxiOrders, ({ one }) => ({
  user: one(users, {
    fields: [taxiOrders.userId],
    references: [users.id],
  }),
  service: one(taxiServices, {
    fields: [taxiOrders.serviceId],
    references: [taxiServices.id],
  }),
  orderItem: one(orderItems, {
    // Added: A taxi order can be an order item
    fields: [taxiOrders.id],
    references: [orderItems.entityId],
  }),
}));

// --- EVENT RELATIONS ---
export const organizersRelations = relations(organizers, ({ many }) => ({
  events: many(events),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const eventTagsRelations = relations(eventTags, ({ many }) => ({
  eventTagMappings: many(eventTagMappings),
}));

export const eventTagMappingsRelations = relations(
  eventTagMappings,
  ({ one }) => ({
    event: one(events, {
      fields: [eventTagMappings.eventId],
      references: [events.id],
    }),
    tag: one(eventTags, {
      fields: [eventTagMappings.tagId],
      references: [eventTags.id],
    }),
  }),
);

export const eventsRelations = relations(events, ({ one, many }) => ({
  city: one(cities, {
    fields: [events.cityId],
    references: [cities.id],
  }),
  organizer: one(organizers, {
    fields: [events.organizerId],
    references: [organizers.id],
  }),
  tags: many(eventTagMappings), // Mappings, not direct tags
  tickets: many(eventTickets),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const eventTicketsRelations = relations(
  eventTickets,
  ({ one, many }) => ({
    event: one(events, {
      fields: [eventTickets.eventId],
      references: [events.id],
    }),
    user: one(users, {
      fields: [eventTickets.userId],
      references: [users.id],
    }),
    order: one(orders, {
      fields: [eventTickets.orderId],
      references: [orders.id],
    }),
    eventTicketNumbers: many(eventTicketNumbers),
  }),
);

export const eventTicketNumbersRelations = relations(
  eventTicketNumbers,
  ({ one }) => ({
    eventTicket: one(eventTickets, {
      fields: [eventTicketNumbers.eventTicketId],
      references: [eventTickets.id],
    }),
  }),
);

// --- ATTRACTION RELATIONS ---
export const attractionsRelations = relations(attractions, ({ one, many }) => ({
  city: one(cities, {
    fields: [attractions.cityId],
    references: [cities.id],
  }),
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

// --- ORDER RELATIONS ---
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
  roomReservations: many(roomReservations),
  flightBookings: many(flightBookings),
  eventTickets: many(eventTickets),
  // Re-added relations from previous step:
  promoCode: one(promoCodes, {
    // Re-added
    fields: [orders.promoCodeId],
    references: [promoCodes.id],
  }),
  package: one(packages, {
    // Re-added
    fields: [orders.packageId],
    references: [packages.id],
  }),
  packageUsages: many(packageUsages), // Added: An order can have many package usages (though usually one, this allows tracking)
  promoCodeUsages: many(promoCodeUsages), // Added: An order can have many promo code usages (though usually one)
}));

// --- ORDER ITEM RELATIONS ---
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  // Polymorphic relations for entityId/entityType for order items (application-handled joins)
  // These are often handled in services based on entityType, but can be defined for explicit joins:
  flightBooking: one(flightBookings, {
    // Added for explicit join, assuming entityId points to booking
    fields: [orderItems.entityId],
    references: [flightBookings.id],
  }),
  roomReservation: one(roomReservations, {
    // Added for explicit join, assuming entityId points to reservation
    fields: [orderItems.entityId],
    references: [roomReservations.id],
  }),
  eventTicket: one(eventTickets, {
    // Added for explicit join, assuming entityId points to ticket
    fields: [orderItems.entityId],
    references: [eventTickets.id],
  }),
}));

// --- CART RELATIONS ---
export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, {
    fields: [carts.userId],
    references: [users.id],
  }),
  promoCode: one(promoCodes, {
    fields: [carts.promoCodeId],
    references: [promoCodes.id],
  }),
  package: one(packages, {
    fields: [carts.packageId],
    references: [packages.id],
  }),
  cartItems: many(cartItems), // A cart can have many items
}));

// --- CART ITEM RELATIONS ---
export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
  // Relation for seatClass (for flight items)
  seatClass: one(seatClasses, {
    fields: [cartItems.classId],
    references: [seatClasses.id],
  }),
}));

// --- CHAT RELATIONS ---
export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  messages: many(messages),
}));

// --- MESSAGE RELATIONS ---
export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
  faq: one(faq, {
    fields: [messages.faqId],
    references: [faq.id],
  }),
}));

// --- PACKAGES & PROMO CODES RELATIONS ---
export const packagesRelations = relations(packages, ({ many }) => ({
  requiredEntities: many(packageRequiredEntities),
  usages: many(packageUsages),
  carts: many(carts),
  orders: many(orders),
  // Added: For consistency with polymorphic attachments, favourites, reviews
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const packageRequiredEntitiesRelations = relations(
  packageRequiredEntities,
  ({ one }) => ({
    package: one(packages, {
      fields: [packageRequiredEntities.packageId],
      references: [packages.id],
    }),
    // Polymorphic relations for entityId/entityType for items that can be in a general order
    flight: one(flights, {
      fields: [packageRequiredEntities.entityId],
      references: [flights.id],
    }),
    room: one(rooms, {
      fields: [packageRequiredEntities.entityId],
      references: [rooms.id],
    }),
    event: one(events, {
      fields: [packageRequiredEntities.entityId],
      references: [events.id],
    }),
    taxiService: one(taxiServices, {
      // Added for consistency with orderItemEntityEnum
      fields: [packageRequiredEntities.entityId],
      references: [taxiServices.id],
    }),
    attraction: one(attractions, {
      // Added: If attractions can be part of package requirements
      fields: [packageRequiredEntities.entityId],
      references: [attractions.id],
    }),
  }),
);

export const packageUsagesRelations = relations(packageUsages, ({ one }) => ({
  package: one(packages, {
    fields: [packageUsages.packageId],
    references: [packages.id],
  }),
  user: one(users, {
    fields: [packageUsages.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [packageUsages.orderId],
    references: [orders.id],
  }),
}));

export const promoCodesRelations = relations(promoCodes, ({ many }) => ({
  entities: many(promoCodeEntities),
  usages: many(promoCodeUsages),
  carts: many(carts),
  orders: many(orders),
  // Added: For consistency with polymorphic attachments, favourites, reviews
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const promoCodeEntitiesRelations = relations(
  promoCodeEntities,
  ({ one }) => ({
    promoCode: one(promoCodes, {
      fields: [promoCodeEntities.promoCodeId],
      references: [promoCodes.id],
    }),
    // Polymorphic relations for entityId/entityType for items that can be in a general order
    flight: one(flights, {
      fields: [promoCodeEntities.entityId],
      references: [flights.id],
    }),
    room: one(rooms, {
      fields: [promoCodeEntities.entityId],
      references: [rooms.id],
    }),
    event: one(events, {
      fields: [promoCodeEntities.entityId],
      references: [events.id],
    }),
    taxiService: one(taxiServices, {
      // Added for consistency with orderItemEntityEnum
      fields: [promoCodeEntities.entityId],
      references: [taxiServices.id],
    }),
    attraction: one(attractions, {
      // Added: If attractions can be part of promo code applicability
      fields: [promoCodeEntities.entityId],
      references: [attractions.id],
    }),
  }),
);

export const promoCodeUsagesRelations = relations(
  promoCodeUsages,
  ({ one }) => ({
    promoCode: one(promoCodes, {
      fields: [promoCodeUsages.promoCodeId],
      references: [promoCodes.id],
    }),
    user: one(users, {
      fields: [promoCodeUsages.userId],
      references: [users.id],
    }),
    order: one(orders, {
      fields: [promoCodeUsages.orderId],
      references: [orders.id],
    }),
  }),
);
