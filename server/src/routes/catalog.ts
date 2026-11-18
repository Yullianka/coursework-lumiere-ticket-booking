import { Router } from 'express';
import { CatalogController } from '../controllers/catalog-controller.js';
import type { CatalogService } from '../services/catalog-service.js';
export function catalogRoutes(service: CatalogService) {
  const router = Router(),
    controller = new CatalogController(service);
  router.get('/productions', controller.productions);
  router.get('/sessions', controller.sessions);
  router.get('/sessions/:id/seats', controller.seats);
  return router;
}
