export interface ProductionInput {
  title: string;
  description: string;
  type: 'FILM' | 'PLAY';
  durationMinutes: number;
  archived: boolean;
}
export interface HallInput {
  name: string;
  rows: number;
  seatsPerRow: number;
  vipRows: number[];
  balconyRows: number[];
}
export interface SessionInput {
  productionId: string;
  hallId: string;
  startsAt: string;
  prices: { STANDARD: number; VIP: number; BALCONY: number };
  archived: boolean;
}
export interface DiscountInput {
  code: string;
  percent: number;
  validFrom: string;
  validTo: string;
  active: boolean;
}
