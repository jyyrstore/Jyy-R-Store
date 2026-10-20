ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS public_id text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_public_id_uidx
  ON payments(public_id);
