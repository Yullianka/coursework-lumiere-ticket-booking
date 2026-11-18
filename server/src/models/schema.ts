import { bigint, boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  password_hash: text('password_hash').notNull(),
  display_name: text('display_name').notNull(),
  role: text('role', { enum: ['CLIENT', 'ADMIN'] })
    .notNull()
    .default('CLIENT'),
  student_verified: boolean('student_verified').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const productions = pgTable('productions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  type: text('type').notNull(),
  duration_minutes: integer('duration_minutes').notNull(),
  archived: boolean('archived').notNull().default(false),
});

export const halls = pgTable('halls', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
});

export const seats = pgTable('seats', {
  id: uuid('id').primaryKey().defaultRandom(),
  hall_id: uuid('hall_id').notNull(),
  row_number: integer('row_number').notNull(),
  seat_number: integer('seat_number').notNull(),
  category: text('category').notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  production_id: uuid('production_id').notNull(),
  hall_id: uuid('hall_id').notNull(),
  starts_at: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
  ends_at: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
  archived: boolean('archived').notNull().default(false),
});

export const session_prices = pgTable('session_prices', {
  session_id: uuid('session_id').notNull(),
  category: text('category').notNull(),
  price_kopecks: integer('price_kopecks').notNull(),
});

export const discounts = pgTable('discounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  type: text('type').notNull(),
  percent: integer('percent').notNull(),
  valid_from: timestamp('valid_from', { withTimezone: true, mode: 'date' }).notNull(),
  valid_to: timestamp('valid_to', { withTimezone: true, mode: 'date' }).notNull(),
  active: boolean('active').notNull().default(true),
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  session_id: uuid('session_id').notNull(),
  status: text('status').notNull().default('PENDING'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const session_seats = pgTable('session_seats', {
  session_id: uuid('session_id').notNull(),
  seat_id: uuid('seat_id').notNull(),
  hall_id: uuid('hall_id').notNull(),
  category: text('category').notNull(),
  status: text('status').notNull().default('AVAILABLE'),
  booking_id: uuid('booking_id'),
});

export const booking_items = pgTable('booking_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  booking_id: uuid('booking_id').notNull(),
  session_id: uuid('session_id').notNull(),
  seat_id: uuid('seat_id').notNull(),
  discount_id: uuid('discount_id'),
  base_price_kopecks: integer('base_price_kopecks').notNull(),
  discount_kopecks: integer('discount_kopecks').notNull().default(0),
  final_price_kopecks: integer('final_price_kopecks').notNull(),
  discount_name: text('discount_name').notNull().default('NONE'),
});

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  booking_item_id: uuid('booking_item_id').notNull(),
  sold_at: timestamp('sold_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const auth_sessions = pgTable('auth_sessions', {
  token_hash: text('token_hash').primaryKey(),
  user_id: uuid('user_id').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const booking_audit = pgTable('booking_audit', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  booking_id: uuid('booking_id').notNull(),
  event_type: text('event_type').notNull(),
  status: text('status').notNull(),
  occurred_at: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
});
