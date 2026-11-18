import { HttpError } from '../middleware/errors.js';
import type { CatalogFilter } from '../types/catalog.js';
import type { PostgresCatalogRepository as CatalogRepository } from '../repositories/catalog-repository.js';
export class CatalogService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly expire: () => Promise<void>,
  ) {}
  productions() {
    return this.repository.productions();
  }
  async sessions(filter: CatalogFilter) {
    await this.expire();
    return this.repository.sessions(filter);
  }
  async seating(id: string) {
    await this.expire();
    const result = await this.repository.seating(id);
    if (!result) throw new HttpError(404, 'Сеанс не знайдено.');
    return result;
  }
}
