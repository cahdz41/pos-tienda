-- Migración: Fecha de caducidad por variante de producto
-- Ejecutar en Supabase SQL Editor

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS expiration_date date;

-- Índice para consultas rápidas de productos próximos a vencer
CREATE INDEX IF NOT EXISTS idx_product_variants_expiration
  ON product_variants (expiration_date)
  WHERE expiration_date IS NOT NULL;

-- Comentario descriptivo
COMMENT ON COLUMN product_variants.expiration_date
  IS 'Fecha de caducidad del producto. NULL = sin fecha registrada.';
