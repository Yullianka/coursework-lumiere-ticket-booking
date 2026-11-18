import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Account } from '../types/services.js';

export const id = z.string().uuid();
export const text = z.string().trim().min(1).max(200);
export const date = z.string().datetime({ offset: true });
export const catalogQuery = z.object({
  search: z.string().trim().max(200).default(''),
  type: z.enum(['FILM', 'PLAY']).optional(),
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const parsed = new Date(value + 'T00:00:00Z');
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }, 'Некоректна дата.')
    .optional(),
  sort: z.enum(['date_asc', 'date_desc', 'price_asc', 'price_desc']).default('date_asc'),
});

export const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
});

export const production = z.object({
  title: text,
  description: z.string().max(5000),
  type: z.enum(['FILM', 'PLAY']),
  durationMinutes: z.number().int().min(1).max(600),
  archived: z.boolean().default(false),
});

export const prices = z.object({
  STANDARD: z.number().int().min(0).max(100000000),
  VIP: z.number().int().min(0).max(100000000),
  BALCONY: z.number().int().min(0).max(100000000),
});

export const sessionSchema = z.object({
  productionId: id,
  hallId: id,
  startsAt: date,
  prices,
  archived: z.boolean().default(false),
});

export const discount = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,32}$/),
  percent: z.number().int().min(1).max(100),
  validFrom: date,
  validTo: date,
  active: z.boolean().default(true),
});

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 7 * 24 * 3600 * 1000,
};

export const account = (res: Parameters<RequestHandler>[1]) => res.locals.account as Account;
