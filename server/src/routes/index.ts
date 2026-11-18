import { Router } from 'express';
import type { Services } from '../types/services.js';
import { adminRoutes } from './admin.js';
import { authRoutes } from './auth.js';
import { bookingsRoutes } from './bookings.js';
import { catalogRoutes } from './catalog.js';
import { configureAccess } from '../middleware/access.js';
export function apiRoutes(services: Services): Router {
  const router = Router();
  const { requireUser, requireClient } = configureAccess(router, services.authenticate);
  router.use(authRoutes(services.auth));
  router.use(catalogRoutes(services.catalog));
  router.use(bookingsRoutes(services.bookings, requireUser, requireClient));
  router.use(adminRoutes(services.admin));
  return router;
}
