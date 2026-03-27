-- =============================================
-- MIGRACIÓN: Lealtad (Monedero Electrónico)
-- =============================================

-- 1. Ampliar constraint de payment_method para soportar 'transfer' y 'mixed'
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales
  ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'credit', 'transfer', 'mixed'));

-- 2. Columnas de lealtad en customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS whatsapp       TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS loyalty_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_spent   NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 3. Tabla de auditoría del monedero
CREATE TABLE loyalty_transactions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id     UUID REFERENCES sales(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN ('earned', 'redeemed')),
  amount      NUMERIC(10,2) NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_select" ON loyalty_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "loyalty_insert" ON loyalty_transactions FOR INSERT TO authenticated WITH CHECK (true);
-- Sin UPDATE ni DELETE — registro inmutable por diseño

-- 4. Tabla de métodos de pago por venta (pagos mixtos)
CREATE TABLE sale_payments (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id    UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method     TEXT NOT NULL CHECK (method IN ('cash', 'card', 'transfer', 'wallet', 'credit')),
  amount     NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_payments_select" ON sale_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "sale_payments_insert" ON sale_payments FOR INSERT TO authenticated WITH CHECK (true);
