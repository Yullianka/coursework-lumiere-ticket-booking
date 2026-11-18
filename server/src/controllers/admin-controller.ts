import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { AdminService } from '../services/admin-service.js';
import { id, text, date, production, sessionSchema, discount } from '../middleware/validation.js';
const hall = z.object({
  name: text,
  rows: z.number().int().min(1).max(20),
  seatsPerRow: z.number().int().min(1).max(30),
  vipRows: z.array(z.number().int().min(1).max(20)).default([]),
  balconyRows: z.array(z.number().int().min(1).max(20)).default([]),
});

export class AdminController {
  constructor(private readonly service: AdminService) {}
  list(entity: 'productions' | 'halls' | 'sessions' | 'discounts' | 'users'): RequestHandler {
    return async (_req, res) => {
      res.json(await this.service[entity]());
    };
  }
  createProduction: RequestHandler = async (req, res) => {
    res.status(201).json(await this.service.createProduction(production.parse(req.body)));
  };
  updateProduction: RequestHandler = async (req, res) => {
    res.json(
      await this.service.updateProduction(id.parse(req.params.id), production.parse(req.body)),
    );
  };
  createHall: RequestHandler = async (req, res) => {
    res.status(201).json(await this.service.createHall(hall.parse(req.body)));
  };
  renameHall: RequestHandler = async (req, res) => {
    res.json(
      await this.service.renameHall(
        id.parse(req.params.id),
        z.object({ name: text }).parse(req.body),
      ),
    );
  };
  saveSession(update: boolean): RequestHandler {
    return async (req, res) => {
      res
        .status(update ? 200 : 201)
        .json(
          await this.service.saveSession(
            update ? id.parse(req.params.id) : undefined,
            sessionSchema.parse(req.body),
          ),
        );
    };
  }
  saveDiscount(update: boolean): RequestHandler {
    return async (req, res) => {
      res
        .status(update ? 200 : 201)
        .json(
          await this.service.saveDiscount(
            update ? id.parse(req.params.id) : undefined,
            discount.parse(req.body),
          ),
        );
    };
  }
  verifyStudent: RequestHandler = async (req, res) => {
    res.json(
      await this.service.verifyStudent(
        id.parse(req.params.id),
        z.object({ studentVerified: z.boolean() }).parse(req.body),
      ),
    );
  };
  reports: RequestHandler = async (req, res) => {
    res.json(await this.service.reports(z.object({ from: date, to: date }).parse(req.query)));
  };
}
