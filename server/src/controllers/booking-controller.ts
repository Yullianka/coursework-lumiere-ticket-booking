import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { BookingWorkflow } from '../services/booking-workflow.js';
import { id, account } from '../middleware/validation.js';
const reservation = z.object({
  sessionId: id,
  seatIds: z.array(id).min(1).max(8),
  promoCode: z.string().trim().toUpperCase().max(32).optional(),
});
export class BookingController {
  constructor(private readonly service: BookingWorkflow) {}
  reserve: RequestHandler = async (req, res) => {
    res.status(201).json(await this.service.reserve(account(res).id, reservation.parse(req.body)));
  };
  mine: RequestHandler = async (_req, res) => {
    res.json(await this.service.mine(account(res).id));
  };
  change(action: 'pay' | 'cancel'): RequestHandler {
    return async (req, res) => {
      res.json(await this.service.change(account(res).id, id.parse(req.params.id), action));
    };
  }
}
