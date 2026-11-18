import type {
  DiscountInput,
  HallInput,
  ProductionInput,
  SessionInput,
} from '../types/admin-input.js';
import { HttpError } from '../middleware/errors.js';
import type { PostgresAdminRepository as AdminStore } from '../repositories/admin-repository.js';
export class AdminService {
  constructor(
    private readonly repository: AdminStore,
    private readonly expire: () => Promise<void>,
  ) {}
  productions() {
    return this.repository.productions();
  }
  halls() {
    return this.repository.halls();
  }
  sessions() {
    return this.repository.sessions();
  }
  discounts() {
    return this.repository.discounts();
  }
  users() {
    return this.repository.users();
  }
  createProduction(input: ProductionInput) {
    return this.repository.createProduction(input);
  }
  updateProduction(id: string, input: ProductionInput) {
    return this.repository.updateProduction(id, input);
  }
  createHall(input: HallInput) {
    if (
      [...input.vipRows, ...input.balconyRows].some((r) => r > input.rows) ||
      input.vipRows.some((r) => input.balconyRows.includes(r))
    )
      throw new HttpError(400, 'Перевірте категорії рядів.');
    return this.repository.createHall(input);
  }
  renameHall(id: string, input: { name: string }) {
    return this.repository.renameHall(id, input);
  }
  saveSession(id: string | undefined, input: SessionInput) {
    if (new Date(input.startsAt).getTime() <= Date.now())
      throw new HttpError(400, 'Початок сеансу має бути в майбутньому.');
    return this.repository.saveSession(id, input);
  }
  saveDiscount(id: string | undefined, input: DiscountInput) {
    if (new Date(input.validTo) <= new Date(input.validFrom))
      throw new HttpError(400, 'Некоректний період знижки.');
    return this.repository.saveDiscount(id, input);
  }
  verifyStudent(id: string, input: { studentVerified: boolean }) {
    return this.repository.verifyStudent(id, input);
  }
  async reports(input: { from: string; to: string }) {
    if (
      new Date(input.to) <= new Date(input.from) ||
      new Date(input.to).getTime() - new Date(input.from).getTime() > 366 * 86400000
    )
      throw new HttpError(400, 'Оберіть період до одного року.');
    await this.expire();
    return this.repository.reports(input);
  }
}
