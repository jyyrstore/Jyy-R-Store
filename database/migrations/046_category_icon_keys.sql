-- Persist the selected global SVG icon for each category level.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS icon_key text;
