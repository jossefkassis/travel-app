import { relations, sql } from 'drizzle-orm';
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
  geometry,
  interval,
  uniqueIndex,
  smallint,
  unique,
} from 'drizzle-orm/pg-core';

/* ──────────────────────────────── ENUMS ──────────────────────────────── */
export const scopeEnum = pgEnum('scope', ['PUBLIC', 'PRIVATE']);

export const flightStatusEnum = pgEnum('flight_status', [
  'SCHEDULED',
  'DELAYED',
  'CANCELLED',
  'LANDED',
]);

export const bookingStatusEnum = pgEnum('booking_status', [
  'PENDONG',
  'CONFIRMED',
  'CANCELLED',
  'POSTED',
  'REFUNDED',
]);
export const paymentStatusEnum = pgEnum('booking_status', [
  'CONFIRMED',
  'CANCELLED',
  'POSTED',
  'REFUNDED',
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
  'TRIP',
  'ROOM',
  'FLIGHT',
]);

export const attachmentRoleEnum = pgEnum('attachment_role', [
  'GALLERY',
  'MAIN',
  'ICON',
  'DOCUMENT',
]);

export const tripTypeEnum = pgEnum('trip_type', ['CUSTOM', 'PREDEFINED']);
export const orderStatusEnum = pgEnum('order_status', [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'COMPLETED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED',
]);

export const reservationSourceEnum = pgEnum('reservation_source', [
  'PREDEFINED_TRIP',
  'CUSTOM_TRIP',
  'HOTEL_ONLY',
]);

export const balanceRequestStatusEnum = pgEnum('balance_request_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

/* helper */
export const now = () => timestamp('created_at').defaultNow();
export const deletedAt = () => timestamp('deleted_at');

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(), // Retained UUID as per your input
    name: varchar('name', { length: 100 }),
    username: varchar('username', { length: 100 }).unique(),
    email: varchar('email', { length: 150 }).unique(),
    phone: varchar('phone', { length: 20 }),
    birthDate: date('birth_date'),
    password: varchar('password', { length: 255 }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    isActive: boolean('is_active').default(true),
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('email_index').on(t.email),
    index('username_index').on(t.username),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(), // Retained UUID as per your input
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    jti: varchar('jti', { length: 100 }).notNull().unique(),
    refreshToken: varchar('refresh_token', { length: 500 }).notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: now(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(), // e.g., 'Admin', 'Guide', 'Customer', 'Editor'
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: deletedAt(), // Optional soft delete
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(), // e.g., 'manage_users', 'create_trips', 'view_bookings', 'edit_pois'
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: deletedAt(), // Optional soft delete
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: integer('role_id') // Integer to match roles.id (serial)
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: integer('permission_id') // Integer to match permissions.id (serial)
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const guides = pgTable(
  'guides',
  {
    id: uuid('id').defaultRandom().primaryKey(), // Reference to user (guide)
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // Guide is a user
    pricePerDay: numeric('price_per_day', {
      precision: 10,
      scale: 2,
    }).notNull(), // Price per day
    description: text('description').default(''), // Description of the guide
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    cityId: integer('city_id')
      .references(() => cities.id, { onDelete: 'set null' })
      .notNull(),
  },
  (t) => [
    index('guides_user_id_idx').on(t.userId),
    index('guides_city_id_idx').on(t.cityId),
  ],
);

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

export const userTransactions = pgTable(
  'user_transactions',
  {
    id: serial('id').primaryKey(),
    walletId: uuid('wallet_id').references(() => wallets.id, {
      onDelete: 'cascade', // Transactions should cascade delete with wallet
    }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // + / –
    source: txSourceEnum('source').notNull(),
    status: txStatusEnum('status').default('POSTED'),
    balanceBefore: numeric('balance_before', { precision: 12, scale: 2 }),
    balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }),
    balanceRequestId: integer('balance_request_id').references(
      () => balanceRequests.id,
      { onDelete: 'set null' },
    ),
    note: text('note'),
    orderId: integer('order_id').references(() => orders.id, {
      onDelete: 'set null', // If order is deleted, transaction remains
    }),
    createdAt: now(),
  },
  (t) => [index('tx_wallet_idx').on(t.walletId)],
);
export const balanceRequests = pgTable(
  'balance_requests',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    note: text('note'),
    status: balanceRequestStatusEnum('status').notNull().default('PENDING'),
    processedBy: uuid('processed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('balance_requests_user_idx').on(t.userId),
    index('balance_requests_status_idx').on(t.status),
  ],
);
export const userPushTokens = pgTable(
  'user_push_tokens',
  {
    id: serial('id').primaryKey(),

    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    token: varchar('token', { length: 255 }).unique().notNull(),

    device: varchar('device', { length: 20 }),

    disabled: boolean('disabled').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('push_tokens_token_idx').on(t.token),
    index('push_tokens_user_idx').on(t.userId),
  ],
);
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 150 }).notNull(),

    body: text('body'),

    data: text('data'), // store JSON.stringify(payload) if you need it

    isRead: boolean('is_read').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    readAt: timestamp('read_at'),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId),
    index('notifications_read_idx').on(t.isRead),
  ],
);
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

export const entityTypes = pgTable('entity_types', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).unique().notNull(), // e.g., 'trip', 'hotel', 'poi'
  displayName: varchar('display_name', { length: 100 }), // e.g., 'Trip', 'Hotel'
  description: text('description'),
  allowsAttachments: boolean('allows_attachments').default(true),
});

export const attachments = pgTable(
  'attachments',
  {
    objectId: integer('object_id')
      .notNull()
      .references(() => fileObjects.id, {
        onDelete: 'cascade', // If a file object is deleted, remove its attachment record
      }),
    entityTypeId: integer('entity_type_id')
      .notNull()
      .references(() => entityTypes.id, { onDelete: 'restrict' }),
    entityId: integer('entity_id').notNull(),
    role: attachmentRoleEnum('role').default('GALLERY'),
    sort: integer('sort').default(0),
  },
  (t) => [primaryKey({ columns: [t.objectId, t.entityTypeId, t.entityId] })],
);

/* ─────────────────────── SOCIAL (FAVOURITE, REVIEW) ─────────────────── */
export const favourites = pgTable(
  'favourites',
  {
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // Favourites should cascade delete with user
    entityTypeId: integer('entity_type_id')
      .notNull()
      .references(() => entityTypes.id, { onDelete: 'restrict' }),
    entityId: integer('entity_id').notNull(),
    createdAt: now(),
    deletedAt: deletedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityTypeId, t.entityId] })],
);

export const reviews = pgTable(
  'reviews',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // Reviews should cascade delete with user
    entityTypeId: integer('entity_type_id')
      .notNull()
      .references(() => entityTypes.id, { onDelete: 'restrict' }),
    entityId: integer('entity_id').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: now(),
    deletedAt: deletedAt(),
  },
  (t) => [check('rating_between_1_and_5', sql`${t.rating} BETWEEN 1 AND 5`)],
);

/* ────────────────────────── REFERENCE GEOGRAPHY ─────────────────────── */
export const countries = pgTable(
  'countries',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 2 }).unique().notNull(), // ISO-3166-1
    name: varchar('name', { length: 90 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    timezone: varchar('timezone', { length: 50 }).notNull(),
    description: text('description'),
    is_active: boolean('is_active').default(true),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default(
      '0.00',
    ),
    ratingCount: integer('rating_count').default(0),
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow(), // Added
    deletedAt: deletedAt(), // Added for consistency
  },
  (t) => [
    check('countries_avg_rating_range', sql`${t.avgRating} BETWEEN 0 AND 5`),
    index('countries_code_idx').on(t.code),
  ],
);

export const cities = pgTable(
  'cities',
  {
    id: serial('id').primaryKey(),

    countryId: integer('country_id')
      .references(() => countries.id, { onDelete: 'restrict' })
      .notNull(),

    name: varchar('name', { length: 90 }).notNull(),

    slug: varchar('slug', { length: 120 }).notNull().unique(),

    description: text('description'),

    /* Geo fields ------------------------------------------------------ */
    center: geometry('center', { type: 'point', srid: 4326 }),
    radius: numeric('radius', { precision: 10, scale: 2 }),
    /* Business data --------------------------------------------------- */
    avgMealPrice: numeric('avg_meal_price', { precision: 8, scale: 2 }).default(
      '0',
    ),

    isActive: boolean('is_active').default(true),

    avgRating: numeric('avg_rating', { precision: 4, scale: 2 }).default('0'),
    ratingCount: integer('rating_count').default(0),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('cities_center_gix').using('gist', t.center),
    check('cities_avg_meal_price_non_negative', sql`${t.avgMealPrice} >= 0`),
    uniqueIndex('cities_country_name_uix').on(t.countryId, t.name),
  ],
);
export const cityMealPrices = pgTable(
  'city_meal_prices',
  {
    id: serial('id').primaryKey(),
    cityId: integer('city_id')
      .references(() => cities.id, { onDelete: 'restrict' })
      .notNull(),
    mealPricePerPerson: numeric('meal_price_per_person', {
      precision: 10,
      scale: 2,
    }).notNull(), // Price per person
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('city_meal_prices_city_id_idx').on(t.cityId)],
);

export const distanceRates = pgTable(
  'distance_rates',
  {
    id: serial('id').primaryKey(),
    cityId: integer('city_id')
      .references(() => cities.id, { onDelete: 'restrict' })
      .notNull(),
    transportRatePerKm: numeric('transport_rate_per_km', {
      precision: 10,
      scale: 2,
    }).notNull(), // Rate per km
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('distance_rates_city_id_idx').on(t.cityId)],
);

/* ───────────────────────────── HOTELS & ROOMS ───────────────────────── */
export const hotels = pgTable(
  'hotels',
  {
    id: serial('id').primaryKey(),

    cityId: integer('city_id')
      .references(() => cities.id, { onDelete: 'restrict' })
      .notNull(),

    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull().unique(), // “ritz-paris”

    description: text('description'),

    stars: integer('stars').notNull(), // 1-5 only

    address: varchar('address', { length: 255 }),
    phone: varchar('phone', { length: 25 }),
    email: varchar('email', { length: 120 }),

    location: geometry('location', { type: 'point', srid: 4326 }).notNull(),

    checkInTime: time('check_in_time').default('14:00'),
    checkOutTime: time('check_out_time').default('12:00'),

    currency: varchar('currency', { length: 3 }).default('USD').notNull(),

    isActive: boolean('is_active').default(true),

    avgRating: numeric('avg_rating', { precision: 4, scale: 2 }).default('0'),
    ratingCount: integer('rating_count').default(0),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: deletedAt(),
  },
  (t) => [
    /* ---- data-quality guards ------------------------------------ */
    check('hotel_stars_range', sql`${t.stars} BETWEEN 1 AND 5`),
    check('hotel_rating_range', sql`${t.avgRating} BETWEEN 0 AND 5`),

    /* ---- unique per-city name so no duplicate “Hilton” ---------- */
    uniqueIndex('hotel_city_name_uix').on(t.cityId, t.name),

    /* ---- spatial look-ups (“show hotels near …”) ---------------- */
    index('hotels_location_gix').using('gist', t.location),

    /* fast slug look-up */
    index('hotel_slug_idx').on(t.slug),
  ],
);

export const hotelRoomTypes = pgTable(
  'hotel_room_types',
  {
    id: serial('id').primaryKey(),
    hotelId: integer('hotel_id')
      .references(() => hotels.id, { onDelete: 'cascade' })
      .notNull(),
    label: varchar('label', { length: 80 }).notNull(),
    description: text('description'),
    capacity: smallint('capacity').notNull(),
    totalRooms: smallint('total_rooms').notNull(),
    baseNightlyRate: numeric('base_nightly_rate', {
      precision: 10,
      scale: 2,
    }).notNull(),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    check('room_capacity_positive', sql`${t.capacity} >= 1`),
    check('room_capacity_max', sql`${t.capacity} <= 12`),
    check('room_inventory_positive', sql`${t.totalRooms} >= 1`),
    check('room_rate_non_negative', sql`${t.baseNightlyRate} >= 0`),
    uniqueIndex('room_type_hotel_label_uix').on(t.hotelId, t.label),
    index('room_types_hotel_idx').on(t.hotelId),
  ],
);
export const roomReservations = pgTable(
  'room_reservations',
  {
    id: serial('id').primaryKey(),
    roomTypeId: integer('room_type_id')
      .references(() => hotelRoomTypes.id, { onDelete: 'cascade' })
      .notNull(),
    checkInDate: date('check_in_date').notNull(),
    checkOutDate: date('check_out_date').notNull(),
    roomsBooked: smallint('rooms_booked').notNull(),
    source: reservationSourceEnum('source').notNull(),
    sourceId: integer('source_id'),
    userId: uuid('user_id'),
    refundPolicyId: integer('refund_policy_id').references(
      () => refundPolicy.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    check('rooms_positive', sql`${t.roomsBooked} > 0`),
    check('valid_range', sql`${t.checkOutDate} > ${t.checkInDate}`), // Ensure check-out is after check-in
    index('room_reservations_room_type_idx').on(t.roomTypeId),
    index('room_reservations_source_idx').on(t.source, t.sourceId),
    uniqueIndex('room_reservations_unique_idx').on(
      t.roomTypeId,
      t.checkInDate,
      t.checkOutDate,
    ), // Prevent overlapping for same room type
  ],
);

export const roomInventory = pgTable(
  'room_inventory',
  {
    id: serial('id').primaryKey(),
    roomTypeId: integer('room_type_id')
      .references(() => hotelRoomTypes.id, { onDelete: 'cascade' })
      .notNull(),
    date: date('date').notNull(),
    totalRooms: smallint('total_rooms').notNull(),
    bookedRooms: smallint('booked_rooms').default(0),
    availableRooms: smallint('available_rooms').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('room_inventory_unique_uix').on(t.roomTypeId, t.date),
    index('room_inventory_room_type_idx').on(t.roomTypeId),
  ],
);
/* ───────────────────────────── ATTRACTIONS ──────────────────────────── */

export const poiTypes = pgTable('poi_types', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 80 }).notNull().unique(), // e.g., Museum, Restaurant, Park, Landmark
  description: text('description'),
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const tags = pgTable(
  'tags',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull().unique(), // The tag name (e.g., "Adventure", "Luxury")
    description: text('description'), // Optional description of the tag
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('tags_name_idx').on(t.name)],
);

export const pois = pgTable(
  'pois',
  {
    id: serial('id').primaryKey(),
    cityId: integer('city_id').references(() => cities.id, {
      onDelete: 'restrict', // Don't delete city if POIs exist
    }),
    poiTypeId: integer('poi_type_id').references(() => poiTypes.id, {
      onDelete: 'restrict', // Don't delete type if POIs exist
    }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    address: varchar('address', { length: 255 }), // Optional, for display
    location: geometry('location', {
      type: 'point',
      mode: 'xy',
      srid: 4326, // WGS 84 (latitude, longitude)
    }).notNull(),
    website: varchar('website', { length: 255 }),
    price: numeric('price', { precision: 10, scale: 2 })
      .default('0.00')
      .notNull(),
    discountPrice: numeric('discount_price', { precision: 10, scale: 2 }), // Optional discounted price
    contactEmail: varchar('contact_email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),
    openingHours: text('opening_hours'),
    avgDuration: interval('avg_duration'),
    is_active: boolean('is_active').default(true),
    avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default(
      '0.00',
    ),
    ratingCount: integer('rating_count').default(0),
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [index('pois_location_gix').using('gist', t.location)],
);

export const poiToPoiTags = pgTable(
  'poi_to_poi_tags',
  {
    poiId: integer('poi_id')
      .notNull()
      .references(() => pois.id, { onDelete: 'cascade' }), // If POI is deleted, its tag associations are deleted
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }), // Don't delete tag if it's still used by POIs
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [primaryKey({ columns: [t.poiId, t.tagId] })], // Ensures unique combination of POI and Tag
);

export const tripToTags = pgTable(
  'trip_to_tags',
  {
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }), // If trip is deleted, its tag associations are deleted
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }), // Don't delete tag if it's still used by trips
    createdAt: now(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: deletedAt(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.tagId] })], // Ensures unique combination of Trip and Tag
);

export const trips = pgTable(
  'trips',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    cityId: integer('city_id').references(() => cities.id, {
      onDelete: 'restrict', // Don't delete city if POIs exist
    }),
    createdBy: uuid('created_by') // Added reference to the user who created the custom trip
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tripType: tripTypeEnum('trip_type').default('PREDEFINED'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    refundPolicyId: integer('refund_policy_id')
      .references(() => refundPolicy.id, { onDelete: 'cascade' })
      .notNull(),
    pricePerPerson: numeric('price_per_person', {
      precision: 10,
      scale: 2,
    }).notNull(),
    minPeople: integer('min_people').default(1).notNull(),
    maxPeople: integer('max_people').default(1).notNull(),
    minSeatsPerUser: integer('min_seats_per_user').default(1).notNull(), // Min seats per user
    maxSeatsPerUser: integer('max_seats_per_user').default(1).notNull(), // Max seats per user
    withMeals: boolean('with_meals').default(false), // Whether meals are included
    withTransport: boolean('with_transport').default(false), // Whether transport is included
    hotelIncluded: boolean('hotel_included').default(false), // Whether hotel is included
    mealPricePerPerson: numeric('meal_price_per_person', {
      precision: 10,
      scale: 2,
    }).default('0'), // Meal price for whole trip
    transportationPricePerPerson: numeric('transportation_price_per_person', {
      precision: 10,
      scale: 2,
    }).default('0'), // Transportation price for whole trip
    guideId: uuid('guide_id').references(() => guides.id, {
      onDelete: 'set null',
    }), // Guide assigned to the trip
    meetLocationAdress: varchar('meet_location_address', { length: 255 }), // Custom meet location if no hotel
    meetLocation: geometry('meet_location', {
      type: 'point',
      mode: 'xy',
      srid: 4326,
    }).notNull(),
    dropLocationAdress: varchar('drop_location_address', { length: 255 }), // Custom drop location if no hotel
    dropLocation: geometry('drop_location', {
      type: 'point',
      mode: 'xy',
      srid: 4326,
    }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('trips_name_idx').on(t.name),
    index('trips_city_idx').on(t.cityId),
    index('trips_start_date_idx').on(t.startDate),
    index('trips_end_date_idx').on(t.endDate),
    index('trips_price_per_person_idx').on(t.pricePerPerson),
    index('trips_min_people_idx').on(t.minPeople),
    index('trips_max_people_idx').on(t.maxPeople),
  ],
);

export const tripDays = pgTable(
  'trip_days',
  {
    id: serial('id').primaryKey(),
    tripId: integer('trip_id')
      .references(() => trips.id, { onDelete: 'cascade' })
      .notNull(),
    dayNumber: integer('day_number').notNull(), // Day 1, Day 2, etc.
    startTime: time('start_time').default('09:00'), // Default start time (could be updated)
    endTime: time('end_time').default('18:00'), // Default end time
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('trip_days_trip_idx').on(t.tripId),
    uniqueIndex('trip_days_day_number_uix').on(t.tripId, t.dayNumber),
  ],
);

export const tripPois = pgTable(
  'trip_pois',
  {
    id: serial('id').primaryKey(),
    tripDayId: integer('trip_day_id')
      .references(() => tripDays.id, { onDelete: 'cascade' })
      .notNull(),
    poiId: integer('poi_id')
      .references(() => pois.id, { onDelete: 'cascade' })
      .notNull(),
    visitOrder: integer('visit_order').notNull(), // The order of visiting POIs
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('trip_pois_trip_day_idx').on(t.tripDayId),
    index('trip_pois_poi_idx').on(t.poiId),
  ],
);

export const tripGuides = pgTable(
  'trip_guides',
  {
    id: serial('id').primaryKey(),
    tripId: integer('trip_id')
      .references(() => trips.id, { onDelete: 'cascade' })
      .notNull(),
    guideId: uuid('guide_id')
      .references(() => guides.id, { onDelete: 'cascade' })
      .notNull(), // Employee who is the guide
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('trip_guides_trip_idx').on(t.tripId),
    index('trip_guides_guide_idx').on(t.guideId),
  ],
);

export const guideAvailability = pgTable(
  'guide_availability',
  {
    id: serial('id').primaryKey(),
    guideId: uuid('guide_id')
      .references(() => guides.id, { onDelete: 'cascade' })
      .notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    source: reservationSourceEnum('source').notNull().default('PREDEFINED_TRIP'),
    sourceId: integer('source_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('guide_availability_guide_idx').on(t.guideId)],
);

export const tripHotels = pgTable(
  'trip_hotels',
  {
    tripId: integer('trip_id')
      .references(() => trips.id, { onDelete: 'cascade' })
      .notNull(),
    hotelId: integer('hotel_id')
      .references(() => hotels.id, { onDelete: 'cascade' })
      .notNull(),
    roomTypeId: integer('room_type_id')
      .references(() => hotelRoomTypes.id, { onDelete: 'cascade' })
      .notNull(),
    roomsNeeded: smallint('rooms_needed').notNull(), // total rooms blocked for this trip
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tripId, t.hotelId, t.roomTypeId] }), // Composite key for tripId, hotelId, and roomTypeId
    index('trip_hotels_hotel_idx').on(t.hotelId), // Index for hotel lookup
    index('trip_hotels_room_type_idx').on(t.roomTypeId), // Index for room type lookup
  ],
);

export const tripBookings = pgTable(
  'trip_bookings',
  {
    id: serial('id').primaryKey(),
    tripType: tripTypeEnum('trip_type').default('PREDEFINED'),
    tripId: integer('trip_id')
      .references(() => trips.id, { onDelete: 'cascade' })
      .notNull(),
    refundPolicyId: integer('refund_policy_id')
      .references(() => refundPolicy.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    seats: integer('seats').notNull(),                       // ← new
    source: reservationSourceEnum('source').notNull(),      // ← new
    sourceId: integer('source_id'),                          // ← new (e.g. orderId)
    total: numeric('total', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('trip_bookings_trip_idx').on(t.tripId),
    index('trip_bookings_user_idx').on(t.userId),
  ],
);

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

export const flights = pgTable(
  'flights',
  {
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
  },
  (t) => [unique('flight_number').on(t.flightNo, t.airlineId, t.departureAt)],
);

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

/* ─────────────────────────── REFUND POLICY DATA ─────────────────────── */
export const refundPolicy = pgTable('refund_policy', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  policyText: text('policy_text'),
  triggerMinutesBeforeService: integer('trigger_minutes_before_service'), // e.g., 24*60 for 24 hours before
  triggerStatus: varchar('trigger_status', { length: 50 }), // e.g., 'CANCELLED',
  refundPercentage: numeric('refund_percentage', { precision: 5, scale: 2 }), // e.g., 0.50 for 50%
  description: text('description'), // Specific description for this dynamic rule
  createdAt: now(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: deletedAt(),
});

export const carts = pgTable(
  'carts',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(), // Associated user
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('carts_user_idx').on(t.userId)],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: serial('id').primaryKey(),
    cartId: integer('cart_id')
      .references(() => carts.id, { onDelete: 'cascade' })
      .notNull(), // Reference to the cart
    itemType: orderItemEntityEnum('item_type').notNull(), // Type of item: 'TRIP', 'ROOM', etc.
    itemId: integer('item_id').notNull(), // ID of the specific item (trip ID, room type ID)
    quantity: smallint('quantity').notNull(), // Quantity of the item
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(), // Price per item (trip, room)
    totalPrice: numeric('total_price', { precision: 10, scale: 2 }).notNull(), // Total price for this item
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('cart_items_cart_idx').on(t.cartId),
    index('cart_items_item_type_idx').on(t.itemType),
    index('cart_items_item_id_idx').on(t.itemId),
  ],
);
export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  discountPercentage: numeric('discount_percentage', {
    precision: 5,
    scale: 2,
  }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 10, scale: 2 }), // Fixed discount amount
  maxDiscountAmount: numeric('max_discount_amount', {
    precision: 10,
    scale: 2,
  }),
  isGlobal: boolean('is_global').default(false),
  usesLimit: integer('uses_limit').default(0),
  currentUses: integer('current_uses').default(0),
  validFrom: timestamp('valid_from'),
  validTo: timestamp('valid_to'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  itemId: integer('item_id'),
  applicableTo: varchar('applicable_to', { length: 50 }).default('cart'),
});

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(), // User who made the order
    status: orderStatusEnum('status').default('PENDING'), // Status of the order (e.g., PENDING, COMPLETED, CANCELLED)
    totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(), // Total order value
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('orders_user_idx').on(t.userId)],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(), // Reference to the order
    itemType: orderItemEntityEnum('item_type').notNull(), // Type of item: 'TRIP', 'ROOM', etc.
    itemId: integer('item_id').notNull(), // ID of the specific item (trip ID, room type ID)
    quantity: smallint('quantity').notNull(), // Quantity (e.g., number of rooms or trip tickets)
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(), // Price per item (trip, room)
    totalPrice: numeric('total_price', { precision: 10, scale: 2 }).notNull(), // Total price for this item
    appliedCouponId: integer('applied_coupon_id').references(() => coupons.id, {
      onDelete: 'set null',
    }),
    refundPolicyId: integer('refund_policy_id').references(
      () => refundPolicy.id,
      { onDelete: 'set null' },
    ), // Refund policy if applicable
    refundAmount: numeric('refund_amount', { precision: 10, scale: 2 }).default(
      '0',
    ), // Refund amount if canceled
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_item_type_idx').on(t.itemType),
    index('order_items_item_id_idx').on(t.itemId),
  ],
);

export const paymentHistory = pgTable(
  'payment_history',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    paymentAmount: numeric('payment_amount', {
      precision: 10,
      scale: 2,
    }).notNull(),
    paymentDate: timestamp('payment_date').defaultNow().notNull(),
    paymentMethod: varchar('payment_method', { length: 50 }).notNull(), // E.g., 'Credit Card', 'PayPal'
    paymentStatus: bookingStatusEnum('payment_status').notNull(), // E.g., 'Completed', 'Pending'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('payment_history_order_idx').on(t.orderId)],
);

export const chatRooms = pgTable(
  'chat_rooms',
  {
    id: serial('id').primaryKey(),
    tripId: integer('trip_id')
      .references(() => trips.id, { onDelete: 'cascade' })
      .notNull(), // The trip linked to the chat room (for predefined trips)
    isCustomTrip: boolean('is_custom_trip').default(false), // Flag to indicate if it's a custom trip
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('chat_rooms_trip_idx').on(t.tripId), // Index for efficient lookup of chat rooms by trip
  ],
);
export const chatMembers = pgTable(
  'chat_members',
  {
    id: serial('id').primaryKey(),
    chatRoomId: integer('chat_room_id')
      .references(() => chatRooms.id, { onDelete: 'cascade' })
      .notNull(), // Reference to the chat room
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(), // User who is part of the chat room
    role: varchar('role', { length: 20 }).default('USER').notNull(), // User's role (e.g., 'USER', 'GUIDE')
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('chat_members_chat_room_idx').on(t.chatRoomId),
    index('chat_members_user_idx').on(t.userId),
    uniqueIndex('chat_members_room_user_uix').on(t.chatRoomId,t.userId),
  ],
);
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial('id').primaryKey(),
    chatRoomId: integer('chat_room_id')
      .references(() => chatRooms.id, { onDelete: 'cascade' })
      .notNull(), // Reference to the chat room
    senderId: uuid('sender_id')
      .references(() => users.id, { onDelete: 'set null' })
      .notNull(), // User who sent the message
    message: text('message').notNull(), // The message content
    sentAt: timestamp('sent_at').defaultNow().notNull(), // When the message was sent
  },
  (t) => [
    index('chat_messages_chat_room_idx').on(t.chatRoomId),
    index('chat_messages_sender_idx').on(t.senderId),
  ],
);
export const usersRelations = relations(users, ({ one, many }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  sessions: many(sessions),
  guides: one(guides, {
    fields: [users.id],
    references: [guides.userId],
  }),
  wallets: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
  fileObjects: many(fileObjects), // ownerId
  userAvatars: one(userAvatars, {
    fields: [users.id],
    references: [userAvatars.userId],
  }),
  userSecureFiles: many(userSecureFiles),
  favourites: many(favourites),
  reviews: many(reviews),
  tripsCreated: many(trips), // createdBy
  tripBookings: many(tripBookings),
  flightBookings: many(flightBookings),
  carts: many(carts),
  orders: many(orders),
  chatMembers: many(chatMembers),
  chatMessages: many(chatMessages), // senderId
  pushTokens: many(userPushTokens),
  notifications: many(notifications),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
    permission: one(permissions, {
      fields: [rolePermissions.permissionId],
      references: [permissions.id],
    }),
  }),
);

export const guidesRelations = relations(guides, ({ one, many }) => ({
  user: one(users, {
    fields: [guides.userId],
    references: [users.id],
  }),
  city: one(cities, {
    fields: [guides.cityId],
    references: [cities.id],
  }),
  trips: many(trips), // Guide assigned to the trip
  tripGuides: many(tripGuides), // For many-to-many through trip_guides
  guideAvailability: many(guideAvailability),
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
  userTransactions: many(userTransactions),
}));

export const userTransactionsRelations = relations(
  userTransactions,
  ({ one }) => ({
    wallet: one(wallets, {
      fields: [userTransactions.walletId],
      references: [wallets.id],
    }),
    order: one(orders, {
      fields: [userTransactions.orderId],
      references: [orders.id],
    }),
  }),
);

export const userPushTokensRelations = relations(userPushTokens, ({ one }) => ({
  user: one(users, {
    fields: [userPushTokens.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const fileObjectsRelations = relations(fileObjects, ({ one, many }) => ({
  owner: one(users, {
    fields: [fileObjects.ownerId],
    references: [users.id],
  }),
  userAvatars: many(userAvatars),
  attachments: many(attachments),
}));

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

export const userSecureFilesRelations = relations(
  userSecureFiles,
  ({ one }) => ({
    user: one(users, {
      fields: [userSecureFiles.userId],
      references: [users.id],
    }),
  }),
);

export const entityTypesRelations = relations(entityTypes, ({ many }) => ({
  attachments: many(attachments),
  favourites: many(favourites),
  reviews: many(reviews),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  fileObject: one(fileObjects, {
    fields: [attachments.objectId],
    references: [fileObjects.id],
  }),
  entityType: one(entityTypes, {
    fields: [attachments.entityTypeId],
    references: [entityTypes.id],
  }),
}));

export const favouritesRelations = relations(favourites, ({ one }) => ({
  user: one(users, {
    fields: [favourites.userId],
    references: [users.id],
  }),
  entityType: one(entityTypes, {
    fields: [favourites.entityTypeId],
    references: [entityTypes.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  entityType: one(entityTypes, {
    fields: [reviews.entityTypeId],
    references: [entityTypes.id],
  }),
}));

export const countriesRelations = relations(countries, ({ many }) => ({
  cities: many(cities),
}));

export const citiesRelations = relations(cities, ({ one, many }) => ({
  country: one(countries, {
    fields: [cities.countryId],
    references: [countries.id],
  }),
  guides: many(guides),
  cityMealPrices: many(cityMealPrices),
  distanceRates: many(distanceRates),
  hotels: many(hotels),
  pois: many(pois),
  airports: many(airports),
  trips: many(trips),
}));

export const cityMealPricesRelations = relations(cityMealPrices, ({ one }) => ({
  city: one(cities, {
    fields: [cityMealPrices.cityId],
    references: [cities.id],
  }),
}));

export const distanceRatesRelations = relations(distanceRates, ({ one }) => ({
  city: one(cities, {
    fields: [distanceRates.cityId],
    references: [cities.id],
  }),
}));

export const hotelsRelations = relations(hotels, ({ one, many }) => ({
  city: one(cities, {
    fields: [hotels.cityId],
    references: [cities.id],
  }),
  roomTypes: many(hotelRoomTypes),
  tripHotels: many(tripHotels),
}));

export const hotelRoomTypesRelations = relations(
  hotelRoomTypes,
  ({ one, many }) => ({
    hotel: one(hotels, {
      fields: [hotelRoomTypes.hotelId],
      references: [hotels.id],
    }),
    roomReservations: many(roomReservations),
    roomInventory: many(roomInventory),
    tripHotels: many(tripHotels),
  }),
);

export const roomReservationsRelations = relations(
  roomReservations,
  ({ one }) => ({
    roomType: one(hotelRoomTypes, {
      fields: [roomReservations.roomTypeId],
      references: [hotelRoomTypes.id],
    }),
    user: one(users, {
      fields: [roomReservations.userId],
      references: [users.id],
    }),
    refundPolicy: one(refundPolicy, {
      fields: [roomReservations.refundPolicyId],
      references: [refundPolicy.id],
    }),
  }),
);

export const roomInventoryRelations = relations(roomInventory, ({ one }) => ({
  roomType: one(hotelRoomTypes, {
    fields: [roomInventory.roomTypeId],
    references: [hotelRoomTypes.id],
  }),
}));

export const poiTypesRelations = relations(poiTypes, ({ many }) => ({
  pois: many(pois),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  poiToPoiTags: many(poiToPoiTags),
  tripToTags: many(tripToTags),
}));

export const poisRelations = relations(pois, ({ one, many }) => ({
  city: one(cities, {
    fields: [pois.cityId],
    references: [cities.id],
  }),
  poiType: one(poiTypes, {
    fields: [pois.poiTypeId],
    references: [poiTypes.id],
  }),
  poiToPoiTags: many(poiToPoiTags),
  tripPois: many(tripPois),
}));

export const poiToPoiTagsRelations = relations(poiToPoiTags, ({ one }) => ({
  poi: one(pois, {
    fields: [poiToPoiTags.poiId],
    references: [pois.id],
  }),
  tag: one(tags, {
    fields: [poiToPoiTags.tagId],
    references: [tags.id],
  }),
}));

export const tripToTagsRelations = relations(tripToTags, ({ one }) => ({
  trip: one(trips, {
    fields: [tripToTags.tripId],
    references: [trips.id],
  }),
  tag: one(tags, {
    fields: [tripToTags.tagId],
    references: [tags.id],
  }),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  city: one(cities, {
    fields: [trips.cityId],
    references: [cities.id],
  }),
  createdBy: one(users, {
    fields: [trips.createdBy],
    references: [users.id],
  }),
  refundPolicy: one(refundPolicy, {
    fields: [trips.refundPolicyId],
    references: [refundPolicy.id],
  }),
  guide: one(guides, {
    fields: [trips.guideId],
    references: [guides.id],
  }),
  tripToTags: many(tripToTags),
  tripDays: many(tripDays),
  tripGuides: many(tripGuides),
  tripHotels: many(tripHotels),
  tripBookings: many(tripBookings),
  chatRooms: many(chatRooms), // One trip can have many chat rooms (e.g., custom trips)
}));

export const tripDaysRelations = relations(tripDays, ({ one, many }) => ({
  trip: one(trips, {
    fields: [tripDays.tripId],
    references: [trips.id],
  }),
  tripPois: many(tripPois),
}));

export const tripPoisRelations = relations(tripPois, ({ one }) => ({
  tripDay: one(tripDays, {
    fields: [tripPois.tripDayId],
    references: [tripDays.id],
  }),
  poi: one(pois, {
    fields: [tripPois.poiId],
    references: [pois.id],
  }),
}));

export const tripGuidesRelations = relations(tripGuides, ({ one }) => ({
  trip: one(trips, {
    fields: [tripGuides.tripId],
    references: [trips.id],
  }),
  guide: one(guides, {
    fields: [tripGuides.guideId],
    references: [guides.id],
  }),
}));

export const guideAvailabilityRelations = relations(
  guideAvailability,
  ({ one }) => ({
    guide: one(guides, {
      fields: [guideAvailability.guideId],
      references: [guides.id],
    }),
  }),
);

export const tripHotelsRelations = relations(tripHotels, ({ one }) => ({
  trip: one(trips, {
    fields: [tripHotels.tripId],
    references: [trips.id],
  }),
  hotel: one(hotels, {
    fields: [tripHotels.hotelId],
    references: [hotels.id],
  }),
  roomType: one(hotelRoomTypes, {
    fields: [tripHotels.roomTypeId],
    references: [hotelRoomTypes.id],
  }),
}));

export const tripBookingsRelations = relations(tripBookings, ({ one }) => ({
  trip: one(trips, {
    fields: [tripBookings.tripId],
    references: [trips.id],
  }),
  refundPolicy: one(refundPolicy, {
    fields: [tripBookings.refundPolicyId],
    references: [refundPolicy.id],
  }),
  user: one(users, {
    fields: [tripBookings.userId],
    references: [users.id],
  }),
}));

export const airportsRelations = relations(airports, ({ one, many }) => ({
  city: one(cities, {
    fields: [airports.cityId],
    references: [cities.id],
  }),
  originFlights: many(flights, { relationName: 'originAirport' }),
  destinationFlights: many(flights, { relationName: 'destinationAirport' }),
}));

export const airlinesRelations = relations(airlines, ({ many }) => ({
  flights: many(flights),
}));

export const flightsRelations = relations(flights, ({ one, many }) => ({
  originAirport: one(airports, {
    fields: [flights.origin],
    references: [airports.id],
    relationName: 'originAirport',
  }),
  destinationAirport: one(airports, {
    fields: [flights.destination],
    references: [airports.id],
    relationName: 'destinationAirport',
  }),
  airline: one(airlines, {
    fields: [flights.airlineId],
    references: [airlines.id],
  }),
  flightInventory: many(flightInventory),
  flightBookings: many(flightBookings),
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
    user: one(users, {
      fields: [flightBookings.userId],
      references: [users.id],
    }),
    seatClass: one(seatClasses, {
      fields: [flightBookings.classId],
      references: [seatClasses.id],
    }),
    order: one(orders, {
      fields: [flightBookings.orderId],
      references: [orders.id],
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

export const refundPolicyRelations = relations(refundPolicy, ({ many }) => ({
  trips: many(trips),
  roomReservations: many(roomReservations),
  tripBookings: many(tripBookings),
  orderItems: many(orderItems),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, {
    fields: [carts.userId],
    references: [users.id],
  }),
  cartItems: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
}));

export const couponsRelations = relations(coupons, ({ many }) => ({
  appliedToOrderItems: many(orderItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  orderItems: many(orderItems),
  paymentHistory: many(paymentHistory),
  userTransactions: many(userTransactions),
  flightBookings: many(flightBookings), // Flight bookings can be part of an order
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  coupon: one(coupons, {
    fields: [orderItems.appliedCouponId],
    references: [coupons.id],
  }),
  refundPolicy: one(refundPolicy, {
    fields: [orderItems.refundPolicyId],
    references: [refundPolicy.id],
  }),
}));

export const paymentHistoryRelations = relations(paymentHistory, ({ one }) => ({
  order: one(orders, {
    fields: [paymentHistory.orderId],
    references: [orders.id],
  }),
}));

export const chatRoomsRelations = relations(chatRooms, ({ one, many }) => ({
  trip: one(trips, {
    fields: [chatRooms.tripId],
    references: [trips.id],
  }),
  chatMembers: many(chatMembers),
  chatMessages: many(chatMessages),
}));

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chatRoom: one(chatRooms, {
    fields: [chatMembers.chatRoomId],
    references: [chatRooms.id],
  }),
  user: one(users, {
    fields: [chatMembers.userId],
    references: [users.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  chatRoom: one(chatRooms, {
    fields: [chatMessages.chatRoomId],
    references: [chatRooms.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
  }),
}));
