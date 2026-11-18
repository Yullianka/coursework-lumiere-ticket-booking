import { Router } from 'express';
import { AuthController } from '../controllers/auth-controller.js';
import type { AuthService } from '../services/auth-service.js';
export function authRoutes(service: AuthService) {
  const router = Router(),
    controller = new AuthController(service);
  router.post('/auth/register', controller.register);
  router.post('/auth/login', controller.login);
  router.get('/auth/me', controller.me);
  router.post('/auth/logout', controller.logout);
  return router;
}
