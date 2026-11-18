import { Router } from 'express';
import { AdminController } from '../controllers/admin-controller.js';
import type { AdminService } from '../services/admin-service.js';
export function adminRoutes(service: AdminService) {
  const router = Router(),
    controller = new AdminController(service);
  for (const entity of ['productions', 'halls', 'sessions', 'discounts', 'users'] as const)
    router.get('/admin/' + entity, controller.list(entity));
  router.post('/admin/productions', controller.createProduction);
  router.patch('/admin/productions/:id', controller.updateProduction);
  router.post('/admin/halls', controller.createHall);
  router.patch('/admin/halls/:id', controller.renameHall);
  for (const update of [false, true]) {
    router[update ? 'patch' : 'post'](
      '/admin/sessions' + (update ? '/:id' : ''),
      controller.saveSession(update),
    );
    router[update ? 'patch' : 'post'](
      '/admin/discounts' + (update ? '/:id' : ''),
      controller.saveDiscount(update),
    );
  }
  router.patch('/admin/users/:id', controller.verifyStudent);
  router.get('/admin/reports', controller.reports);
  return router;
}
