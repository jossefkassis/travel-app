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

export const attachmentEntityEnum = pgEnum('attachment_entity_type', [
  'country',
  'city',
  'airport',
  'flight',
  'hotel',
  'room',
  'event',
  'attraction',
  'taxi_service',
  'organizer',
]);
//truu
export const attachmentRoleEnum = pgEnum('attachment_role', [
  'GALLERY',
  'MAIN',
  'ICON',
]);

/* helper */
export const now = () => timestamp('created_at').defaultNow();

/* ──────────────────────────── AUTH & WALLET ─────────────────────────── */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }),
  username: varchar('username', { length: 100 }).unique(),
  email: varchar('email', { length: 150 }).unique(),
  phone: varchar('phone', { length: 20 }),
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
    .references(() => users.id, { onDelete: 'cascade' }),
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
      .references(() => users.id, { onDelete: 'cascade' }),
    balance: numeric('balance', { precision: 12, scale: 2 }).default('0'),
    currency: varchar('currency', { length: 3 }).default('USD'),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (wallets) => ({
    userIdIdx: index('wallets_user_id_idx').on(wallets.userId),
  }),
);

/* single ledger for top-ups, bookings, refunds, admin adjusts */
export const userTransactions = pgTable('user_transactions', {
  id: serial('id').primaryKey(),
  walletId: uuid('wallet_id').references(() => wallets.id, {
    onDelete: 'cascade',
  }),

  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(), // + / –
  source: txSourceEnum('source').notNull(),
  status: txStatusEnum('status').default('POSTED'),
  note: text('note'),

  bookingKind: varchar('booking_kind', { length: 10 }), // 'ROOM','FLIGHT',…
  bookingId: integer('booking_id'), // FK later in code

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
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  encrypted: boolean('encrypted').default(false),
  uploadedAt: now(),
});

export const userAvatars = pgTable('user_avatars', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  fileObjectId: integer('file_object_id')
    .notNull()
    .references(() => fileObjects.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. User Private Gallery

export const userSecureFiles = pgTable('user_secure_files', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  objectKey: varchar('object_key', { length: 255 }).notNull(),
  bucket: varchar('bucket', { length: 50 }).notNull(),

  mime: varchar('mime', { length: 80 }).notNull(),
  size: integer('size'),
  encryptedKey: text('encrypted_key').notNull(), // Only the app can decrypt this

  synced: boolean('synced').default(false),
  lastSyncedAt: timestamp('last_synced_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const attachments = pgTable(
  'attachments',
  {
    objectId: integer('object_id').references(() => fileObjects.id, {
      onDelete: 'cascade',
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
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    entityType: attachmentEntityEnum('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    createdAt: now(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityType, t.entityId] })],
);

export const reviews = pgTable(
  'reviews',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    entityType: attachmentEntityEnum('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: now(),
  },
  (t) => [check('rating_between_1_and_5', sql`${t.rating} BETWEEN 1 AND 5`)],
);

/* ────────────────────────── REFERENCE GEOGRAPHY ─────────────────────── */
export const countries = pgTable('countries', {
  code: varchar('code', { length: 2 }).primaryKey(), // ISO-3166-1
  name: varchar('name', { length: 90 }).notNull(),
  is_active: boolean('is_active').default(true),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  createdAt: now(),
});

export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  country: varchar('country', { length: 2 }).references(() => countries.code, {
    onDelete: 'restrict',
  }),
  name: varchar('name', { length: 90 }).notNull(),
  lat: numeric('lat', { precision: 8, scale: 5 }),
  lon: numeric('lon', { precision: 8, scale: 5 }),
  is_active: boolean('is_active').default(true),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  createdAt: now(),
});

/* ───────────────────────────── HOTELS & ROOMS ───────────────────────── */
export const hotels = pgTable('hotels', {
  id: serial('id').primaryKey(),
  cityId: integer('city_id').references(() => cities.id, {
    onDelete: 'restrict',
  }),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'), // ← fixed typo
  stars: integer('stars'),
  address: varchar('address', { length: 255 }),
  lat: numeric('lat', { precision: 8, scale: 5 }),
  lon: numeric('lon', { precision: 8, scale: 5 }),
  is_active: boolean('is_active').default(true),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  createdAt: now(),
});

export const rooms = pgTable('rooms', {
  id: serial('id').primaryKey(),
  hotelId: integer('hotel_id').references(() => hotels.id, {
    onDelete: 'cascade',
  }),
  label: varchar('label', { length: 60 }),
  personCap: integer('person_cap').default(2),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  discountPrice: numeric('discount_price', { precision: 10, scale: 2 }),
  is_active: boolean('is_active').default(true),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  createdAt: now(),
});

/* ─────────────────────────────── FLIGHTS ────────────────────────────── */
export const airports = pgTable('airports', {
  code: varchar('code', { length: 3 }).primaryKey(), // IATA
  cityId: integer('city_id').references(() => cities.id, {
    onDelete: 'restrict',
  }),
  name: varchar('name', { length: 120 }).notNull(),
  lat: numeric('lat', { precision: 8, scale: 5 }),
  lon: numeric('lon', { precision: 8, scale: 5 }),
  is_active: boolean('is_active').default(true),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  createdAt: now(),
});

export const flights = pgTable('flights', {
  id: serial('id').primaryKey(),
  flightNo: varchar('flight_no', { length: 8 }).notNull(),
  origin: varchar('origin', { length: 3 }).references(() => airports.code),
  destination: varchar('destination', { length: 3 }).references(
    () => airports.code,
  ),
  departureAt: timestamp('departure_at').notNull(),
  arrivalAt: timestamp('arrival_at').notNull(),
  status: flightStatusEnum('status').default('SCHEDULED'),
  is_active: boolean('is_active').default(true),
  createdAt: now(),
});

export const seatClasses = pgTable('seat_class', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 12 }).unique().notNull(),
  label: varchar('label', { length: 40 }),
});

export const flightInventory = pgTable(
  'flight_inventory',
  {
    flightId: integer('flight_id').references(() => flights.id, {
      onDelete: 'cascade',
    }),
    classId: integer('class_id').references(() => seatClasses.id),
    seatsTotal: integer('seats_total').notNull(),
    seatsSold: integer('seats_sold').default(0),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    discountPrice: numeric('discount_price', { precision: 10, scale: 2 }),
  },
  (t) => [primaryKey({ columns: [t.flightId, t.classId] })],
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
});

export const taxiOrders = pgTable('taxi_order', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  serviceId: integer('service_id').references(() => taxiServices.id),
  pickupLat: numeric('pickup_lat', { precision: 8, scale: 5 }),
  pickupLon: numeric('pickup_lon', { precision: 8, scale: 5 }),
  dropLat: numeric('drop_lat', { precision: 8, scale: 5 }),
  dropLon: numeric('drop_lon', { precision: 8, scale: 5 }),
  distanceKm: numeric('distance_km', { precision: 8, scale: 2 }),
  durationMin: integer('duration_min'),
  price: numeric('price', { precision: 10, scale: 2 }),
  status: taxiStatusEnum('status').default('REQUESTED'),
  requestedAt: now(),
});

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
});

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  cityId: integer('city_id').references(() => cities.id, {
    onDelete: 'restrict',
  }),
  organizerId: integer('organizer_id').references(() => organizers.id, {
    onDelete: 'cascade',
  }),
  title: varchar('title', { length: 140 }).notNull(),
  description: text('description'),
  venue: varchar('venue', { length: 140 }),
  startsAt: timestamp('starts_at').notNull(),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  endsAt: timestamp('ends_at'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  discountPrice: numeric('discount_price', { precision: 10, scale: 2 }),
  capacity: integer('capacity'),
  is_active: boolean('is_active').default(true),
  createdAt: now(),
});

export const eventTags = pgTable('event_tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  slug: varchar('slug', { length: 60 }).notNull().unique(),
});

export const eventTagMappings = pgTable(
  'event_tag_mappings',
  {
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => eventTags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.tagId] })],
);

/* ───────────────────────────── ATTRACTIONS ──────────────────────────── */
export const attractions = pgTable('attraction', {
  id: serial('id').primaryKey(),
  cityId: integer('city_id').references(() => cities.id, {
    onDelete: 'restrict',
  }),
  name: varchar('name', { length: 140 }).notNull(),
  description: text('description'),
  lat: numeric('lat', { precision: 8, scale: 5 }),
  lon: numeric('lon', { precision: 8, scale: 5 }),
  avgRating: numeric('avg_rating', { precision: 3, scale: 2 }).default('0.00'),
  ratingCount: integer('rating_count').default(0),
  is_active: boolean('is_active').default(true),
  createdAt: now(),
});

/* ─────────────────────────── REFUND POLICY DATA ─────────────────────── */
export const refundPolicy = pgTable('refund_policy', {
  daysBefore: integer('days_before').primaryKey(), // 7,5,3,1,0
  percent: integer('percent').notNull(), // 100,80,50,20,0
  description: varchar('description', { length: 255 }),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  total: numeric('total', { precision: 10, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).default('CONFIRMED'), // e.g., CONFIRMED, CANCELLED

  createdAt: timestamp('created_at').defaultNow(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),

  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),

  entityType: orderItemEntityEnum('entity_type').notNull(), // 'flight', 'room', 'event'
  entityId: integer('entity_id'), // nullable if deleted later

  title: varchar('title', { length: 150 }).notNull(), // snapshot title
  image: varchar('image', { length: 500 }), // snapshot image url

  quantity: integer('quantity').default(1),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(), // snapshot price

  createdAt: timestamp('created_at').defaultNow(),
});

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  entityType: orderItemEntityEnum('entity_type').notNull(), // 'flight', 'room', 'event'
  entityId: integer('entity_id').notNull(),
  quantity: integer('quantity').default(1),
  price: numeric('price', { precision: 10, scale: 2 }),
  addedAt: timestamp('added_at').defaultNow(),
  lastUpdatedAt: timestamp('last_updated_at').defaultNow(),
});

export const chats = pgTable('chats', {
  id: serial('id').primaryKey(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  status: varchar('status', { length: 20 }).default('OPEN'), // OPEN, CLOSED, ESCALATED
  isReadByAdmin: boolean('is_read_by_admin').default(false),
  isReadByUser: boolean('is_read_by_user').default(true),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),

  chatId: integer('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),

  sender: varchar('sender', { length: 10 }).notNull(), // 'USER' or 'ADMIN'
  message: text('message').notNull(),

  // Optional linkage to auto-response
  faqId: integer('faq_id').references(() => faq.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at').defaultNow(),
});
export const faq = pgTable('faq', {
  id: serial('id').primaryKey(),

  question: text('question').notNull(),
  answer: text('answer').notNull(),
  isActive: boolean('is_active').default(true),

  createdAt: timestamp('created_at').defaultNow(),
});

/* ─────────────────────────── Relations ─────────────────────── */

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  fileObject: one(fileObjects, {
    fields: [attachments.objectId],
    references: [fileObjects.id],
  }),
}));

// Attachments → users (reverse reference if needed)
export const fileObjectsRelations = relations(fileObjects, ({ one, many }) => ({
  owner: one(users, {
    fields: [fileObjects.ownerId],
    references: [users.id],
  }),
  avatar: one(userAvatars, {
    fields: [fileObjects.id],
    references: [userAvatars.fileObjectId],
  }),
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

// User Private Files relations
export const userPrivateFilesRelations = relations(
  userSecureFiles,
  ({ one }) => ({
    user: one(users, {
      fields: [userSecureFiles.userId],
      references: [users.id],
    }),
  }),
);

// Sessions → Users
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// Wallets → Users
export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
}));

// UserTransactions → Wallets
export const userTransactionsRelations = relations(
  userTransactions,
  ({ one }) => ({
    wallet: one(wallets, {
      fields: [userTransactions.walletId],
      references: [wallets.id],
    }),
  }),
);

// Favourites → Users
export const favouritesRelations = relations(favourites, ({ one }) => ({
  user: one(users, {
    fields: [favourites.userId],
    references: [users.id],
  }),
}));

// Reviews → Users
export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
}));

// Hotels → Cities
export const hotelsRelations = relations(hotels, ({ one }) => ({
  city: one(cities, {
    fields: [hotels.cityId],
    references: [cities.id],
  }),
}));

// Rooms → Hotels
export const roomsRelations = relations(rooms, ({ one }) => ({
  hotel: one(hotels, {
    fields: [rooms.hotelId],
    references: [hotels.id],
  }),
}));

// Flights → Airports (origin & destination)
export const flightsRelations = relations(flights, ({ one }) => ({
  originAirport: one(airports, {
    fields: [flights.origin],
    references: [airports.code],
  }),
  destinationAirport: one(airports, {
    fields: [flights.destination],
    references: [airports.code],
  }),
}));

// FlightInventory → Flights & SeatClasses
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

// TaxiOrders → Users & TaxiServices
export const taxiOrdersRelations = relations(taxiOrders, ({ one }) => ({
  user: one(users, {
    fields: [taxiOrders.userId],
    references: [users.id],
  }),
  service: one(taxiServices, {
    fields: [taxiOrders.serviceId],
    references: [taxiServices.id],
  }),
}));

// Events
export const organizersRelations = relations(organizers, ({ many }) => ({
  events: many(events),
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
  tags: many(eventTagMappings),
}));

// Attractions → Cities
export const attractionsRelations = relations(attractions, ({ one }) => ({
  city: one(cities, {
    fields: [attractions.cityId],
    references: [cities.id],
  }),
}));

// Orders → Users
export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
}));

// OrderItems → Orders
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
}));

// CartItems → Users
export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  user: one(users, {
    fields: [cartItems.userId],
    references: [users.id],
  }),
}));
export const usersRelations = relations(users, ({ one, many }) => ({
  sessions: many(sessions),
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
  transactions: many(userTransactions),

  // Media
  avatar: one(userAvatars, {
    fields: [users.id],
    references: [userAvatars.userId],
  }),
  privateFiles: many(userSecureFiles),

  // Social
  favorites: many(favourites),
  reviews: many(reviews),

  taxiOrders: many(taxiOrders),
  // Commerce
  orders: many(orders),
  cartItems: many(cartItems),
}));
export const chatsRelations = relations(chats, ({ one, many }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  messages: many(messages),
}));

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
