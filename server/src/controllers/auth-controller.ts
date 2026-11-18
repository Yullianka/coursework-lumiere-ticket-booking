import type { RequestHandler } from 'express';
import type { AuthService } from '../services/auth-service.js';
import { readToken } from '../middleware/cookies.js';
import { cookieOptions, credentials, text } from '../middleware/validation.js';
export class AuthController {
  constructor(private readonly service: AuthService) {}
  register: RequestHandler = async (req, res) => {
    const result = await this.service.register(
      credentials.extend({ displayName: text.max(100) }).parse(req.body),
    );
    res.cookie('lumiere_session', result.token, cookieOptions);
    res.status(201).json({ id: result.id });
  };
  login: RequestHandler = async (req, res) => {
    const result = await this.service.login(credentials.parse(req.body));
    res.cookie('lumiere_session', result.token, cookieOptions);
    res.json({ id: result.id });
  };
  me: RequestHandler = (_req, res) => {
    res.json({ user: res.locals.account ?? null });
  };
  logout: RequestHandler = async (req, res) => {
    await this.service.logout(readToken(req.headers.cookie));
    res.clearCookie('lumiere_session', cookieOptions);
    res.status(204).end();
  };
}
