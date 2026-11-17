import { z } from 'zod';
import { createDatabasePool } from '../infrastructure/database.js';
import { hashPassword } from '../infrastructure/auth.js';
const input = z
  .object({
    DATABASE_URL: z.string().min(1),
    ADMIN_EMAIL: z
      .string()
      .email()
      .transform((s) => s.toLowerCase()),
    ADMIN_PASSWORD: z.string().min(12).max(128),
    ADMIN_NAME: z.string().min(1).default('Administrator'),
  })
  .parse(process.env);
const pool = createDatabasePool(input.DATABASE_URL);
try {
  await pool.query(
    "INSERT INTO users(email,password_hash,display_name,role) VALUES ($1,$2,$3,'ADMIN')",
    [input.ADMIN_EMAIL, await hashPassword(input.ADMIN_PASSWORD), input.ADMIN_NAME],
  );
  console.log('Administrator created. Existing users are never overwritten.');
} finally {
  await pool.end();
}
