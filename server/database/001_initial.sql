-- Initial schema. Transaction and version tracking are managed by the migration runner.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE CHECK (email = lower(email)),
 password_hash text NOT NULL,
 display_name text NOT NULL,
 role text NOT NULL DEFAULT 'CLIENT' CHECK (role IN ('CLIENT','ADMIN')),
 student_verified boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE productions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (length(trim(title)) > 0),
 description text NOT NULL DEFAULT '',
 type text NOT NULL CHECK (type IN ('FILM','PLAY')),
 duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
 archived boolean NOT NULL DEFAULT false
);
CREATE TABLE halls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL UNIQUE
);
CREATE TABLE seats (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hall_id uuid NOT NULL REFERENCES halls(id),
 row_number integer NOT NULL CHECK (row_number > 0),
 seat_number integer NOT NULL CHECK (seat_number > 0),
 category text NOT NULL CHECK (category IN ('STANDARD','VIP','BALCONY')),
 UNIQUE(hall_id,row_number,seat_number),
 UNIQUE(id,hall_id,category)
);
CREATE TABLE sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 production_id uuid NOT NULL REFERENCES productions(id),
 hall_id uuid NOT NULL REFERENCES halls(id),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 archived boolean NOT NULL DEFAULT false,
 CHECK (ends_at > starts_at),
 UNIQUE(id,hall_id),
 EXCLUDE USING gist (hall_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
);
CREATE TABLE session_prices (
 session_id uuid NOT NULL REFERENCES sessions(id),
 category text NOT NULL CHECK (category IN ('STANDARD','VIP','BALCONY')),
 price_kopecks integer NOT NULL CHECK (price_kopecks >= 0),
 PRIMARY KEY(session_id,category)
);
CREATE TABLE discounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL UNIQUE,
 type text NOT NULL CHECK (type IN ('STUDENT','PROMO')),
 percent integer NOT NULL CHECK (percent BETWEEN 1 AND 100),
 valid_from timestamptz NOT NULL,
 valid_to timestamptz NOT NULL,
 active boolean NOT NULL DEFAULT true,
 CHECK (valid_to > valid_from)
);
CREATE TABLE bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 session_id uuid NOT NULL REFERENCES sessions(id),
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','CANCELLED','EXPIRED')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 CHECK (expires_at > created_at),
 UNIQUE(id,session_id)
);
CREATE TABLE session_seats (
 session_id uuid NOT NULL,
 seat_id uuid NOT NULL,
 hall_id uuid NOT NULL,
 category text NOT NULL,
 status text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','RESERVED','SOLD')),
 booking_id uuid,
 PRIMARY KEY(session_id,seat_id),
 FOREIGN KEY(session_id,hall_id) REFERENCES sessions(id,hall_id),
 FOREIGN KEY(seat_id,hall_id,category) REFERENCES seats(id,hall_id,category),
 FOREIGN KEY(session_id,category) REFERENCES session_prices(session_id,category),
 FOREIGN KEY(booking_id,session_id) REFERENCES bookings(id,session_id),
 CHECK ((status = 'AVAILABLE' AND booking_id IS NULL) OR
        (status IN ('RESERVED','SOLD') AND booking_id IS NOT NULL))
);
CREATE TABLE booking_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id uuid NOT NULL,
 session_id uuid NOT NULL,
 seat_id uuid NOT NULL,
 discount_id uuid REFERENCES discounts(id),
 base_price_kopecks integer NOT NULL CHECK (base_price_kopecks >= 0),
 discount_kopecks integer NOT NULL DEFAULT 0 CHECK (discount_kopecks >= 0),
 final_price_kopecks integer NOT NULL CHECK (final_price_kopecks >= 0),
 CHECK (final_price_kopecks = base_price_kopecks - discount_kopecks),
 UNIQUE(booking_id,seat_id),
 FOREIGN KEY(booking_id,session_id) REFERENCES bookings(id,session_id),
 FOREIGN KEY(session_id,seat_id) REFERENCES session_seats(session_id,seat_id)
);
CREATE TABLE tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_item_id uuid NOT NULL UNIQUE REFERENCES booking_items(id),
 sold_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_owner_idx ON bookings(user_id,created_at DESC);
CREATE INDEX bookings_expiry_idx ON bookings(expires_at) WHERE status = 'PENDING';
CREATE INDEX sessions_starts_idx ON sessions(starts_at);
CREATE INDEX tickets_sold_idx ON tickets(sold_at);
