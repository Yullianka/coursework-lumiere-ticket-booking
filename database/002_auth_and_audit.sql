CREATE TABLE auth_sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);
ALTER TABLE booking_items ADD COLUMN discount_name text NOT NULL DEFAULT 'NONE';
CREATE TABLE booking_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id),
 event_type text NOT NULL, status text NOT NULL, occurred_at timestamptz NOT NULL
);
CREATE INDEX booking_audit_booking_idx ON booking_audit(booking_id);
