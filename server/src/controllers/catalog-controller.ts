import type { RequestHandler } from 'express';
import type { CatalogService } from '../services/catalog-service.js';
import { id, catalogQuery } from '../middleware/validation.js';
export class CatalogController {
  constructor(private readonly service: CatalogService) {}
  productions: RequestHandler = async (_req, res) => {
    res.json(await this.service.productions());
  };
  sessions: RequestHandler = async (req, res) => {
    res.json(await this.service.sessions(catalogQuery.parse(req.query)));
  };
  seats: RequestHandler = async (req, res) => {
    res.json(await this.service.seating(id.parse(req.params.id)));
  };
}
