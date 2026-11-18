import { drizzle } from 'drizzle-orm/node-postgres';
import type { DatabaseClient, DatabasePool } from './database.js';
import * as schema from '../models/schema.js';
export const orm = (client: DatabasePool | DatabaseClient) => drizzle(client, { schema });
