import { Router, type RequestHandler } from 'express';
import { BookingController } from '../controllers/booking-controller.js';
import type { BookingWorkflow } from '../services/booking-workflow.js';
export function bookingsRoutes(
  service: BookingWorkflow,
  requireUser: RequestHandler,
  requireClient: RequestHandler,
) {
  const router = Router(),
    controller = new BookingController(service);
  router.post('/bookings', requireUser, requireClient, controller.reserve);
  router.get('/bookings/mine', requireUser, requireClient, controller.mine);
  for (const action of ['pay', 'cancel'] as const)
    router.post(`/bookings/:id/${action}`, requireUser, requireClient, controller.change(action));
  return router;
}
