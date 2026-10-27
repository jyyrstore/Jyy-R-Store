-- Product variants: independent price and inventory per option.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'FIXED';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_pricing_mode_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_pricing_mode_check
      CHECK (pricing_mode IN ('FIXED','VARIANT'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  amount bigint CHECK (amount IS NULL OR amount > 0),
  price bigint NOT NULL CHECK (price >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reserved_stock integer NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reserved_stock <= stock)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_active_label_unique
  ON product_variants(product_id, lower(label)) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS product_variants_product_sort_idx
  ON product_variants(product_id, is_active, sort_order, created_at);

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS variant_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cart_items_variant_id_fkey') THEN
    ALTER TABLE cart_items ADD CONSTRAINT cart_items_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
  END IF;
END $$;
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_cart_id_product_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_fixed_product_unique
  ON cart_items(cart_id, product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_variant_unique
  ON cart_items(cart_id, product_id, variant_id) WHERE variant_id IS NOT NULL;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id uuid;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_label text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_amount bigint;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='order_items_variant_id_fkey') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_variant_id_fkey
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_variants_published_read ON product_variants;
CREATE POLICY product_variants_published_read ON product_variants
  FOR SELECT USING (
    is_active = true AND EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_variants.product_id AND p.status = 'PUBLISHED'
    )
  );
