export interface Production {
  id: string;
  title: string;
  description: string;
  type: string;
  duration_minutes: number;
  archived: boolean;
}
export interface CatalogFilter {
  search: string;
  type?: 'FILM' | 'PLAY';
  day?: string;
  sort: 'date_asc' | 'date_desc' | 'price_asc' | 'price_desc';
}
export interface CatalogSession {
  id: string;
  title: string;
  description: string;
  type: 'FILM' | 'PLAY';
  duration_minutes: number;
  starts_at: Date;
  hall_name: string;
  available: number;
  min_price: number;
}
export interface CatalogSeat {
  id: string;
  status: string;
  row_number: number;
  seat_number: number;
  category: string;
  price_kopecks: number;
}
