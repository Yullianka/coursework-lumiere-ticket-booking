export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => {
    throw new Error('Сервер тимчасово недоступний. Спробуйте ще раз.');
  });
  if (!response.ok) throw new Error(data.error?.message ?? 'Не вдалося виконати запит.');
  return data as T;
}
export const money = (value: number | string) =>
  new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    maximumFractionDigits: 2,
  }).format(Number(value) / 100);
export const when = (value: string) =>
  new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Kyiv',
  }).format(new Date(value));
export const category: Record<string, string> = {
  STANDARD: 'Стандарт',
  VIP: 'VIP',
  BALCONY: 'Балкон',
};
export interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'CLIENT' | 'ADMIN';
  student_verified: boolean;
}
export interface Session {
  id: string;
  title: string;
  description: string;
  type: 'FILM' | 'PLAY';
  starts_at: string;
  hall_name: string;
  duration_minutes: number;
  available: number;
  min_price: number;
}
export interface Seat {
  id: string;
  row_number: number;
  seat_number: number;
  category: string;
  price_kopecks: number;
  status: string;
}
export interface Booking {
  id: string;
  title: string;
  starts_at: string;
  hall_name: string;
  expires_at: string;
  status: string;
  total_kopecks: number;
  items: {
    id: string;
    row: number;
    seat: number;
    category: string;
    price: number;
    discount: string;
    ticketId: string | null;
  }[];
}
