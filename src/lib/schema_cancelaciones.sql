-- Migración: soporte para cancelar/anular ventas
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar campo status a la tabla sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'cancelled'));

-- 2. Campo para registrar quién anuló la venta y el motivo
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 3. Índice para filtrar rápido por status
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
