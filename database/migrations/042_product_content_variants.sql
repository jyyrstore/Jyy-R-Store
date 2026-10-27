-- Keep legacy product content shared; optionally scope content to a variant.
ALTER TABLE product_contents
  ADD COLUMN IF NOT EXISTS variant_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='product_variants_id_product_id_unique'
      AND conrelid='product_variants'::regclass
      AND contype='u'
  ) THEN
    ALTER TABLE product_variants
      ADD CONSTRAINT product_variants_id_product_id_unique
      UNIQUE (id, product_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='product_contents_variant_product_fkey'
      AND conrelid='product_contents'::regclass
      AND confrelid='product_variants'::regclass
      AND contype='f'
  ) THEN
    ALTER TABLE product_contents
      ADD CONSTRAINT product_contents_variant_product_fkey
      FOREIGN KEY (variant_id, product_id)
      REFERENCES product_variants(id, product_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_contents_variant_scope_idx
  ON product_contents(product_id, variant_id, sort_order, created_at);
