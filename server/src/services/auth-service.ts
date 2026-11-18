import { HttpError } from '../middleware/errors.js';
export interface AccountStore {
  create(input: { email: string; password: string; displayName: string }): Promise<{ id: string }>;
  verify(email: string, password: string): Promise<string | undefined>;
  issue(userId: string): Promise<string>;
  revoke(token: string): Promise<void>;
}
export class AuthService {
  constructor(private readonly accounts: AccountStore) {}
  async register(input: { email: string; password: string; displayName: string }) {
    const { id } = await this.accounts.create(input);
    return { id, token: await this.accounts.issue(id) };
  }
  async login(input: { email: string; password: string }) {
    const id = await this.accounts.verify(input.email, input.password);
    if (!id) throw new HttpError(401, 'Неправильна пошта або пароль.');
    return { id, token: await this.accounts.issue(id) };
  }
  async logout(token?: string) {
    if (token) await this.accounts.revoke(token);
  }
}
