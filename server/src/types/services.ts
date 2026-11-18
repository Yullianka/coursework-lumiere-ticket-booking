import type { AdminService } from '../services/admin-service.js';
import type { AuthService } from '../services/auth-service.js';
import type { BookingWorkflow } from '../services/booking-workflow.js';
import type { CatalogService } from '../services/catalog-service.js';
export interface Account {
  id: string;
  email: string;
  display_name: string;
  role: 'CLIENT' | 'ADMIN';
  student_verified: boolean;
}
export interface Services {
  admin: AdminService;
  auth: AuthService;
  bookings: BookingWorkflow;
  catalog: CatalogService;
  authenticate(cookie?: string): Promise<Account | undefined>;
}
