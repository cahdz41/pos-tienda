-- =============================================
-- MIGRACIÓN V2 — POS COMPLETO
-- Ejecutar en Supabase SQL Editor
-- Requiere que schema.sql (v1) ya esté aplicado
-- =============================================

-- ─────────────────────────────────────────────
-- 1. PERFILES DE USUARIO (vinculado a auth.users)
-- ─────────────────────────────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('owner', 'cashier')),
  pin TEXT, -- PIN de 4 dígitos para acceso rápido (opcional)
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger: crear perfil automáticamente al registrar usuario en auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'cashier')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- 2. CLIENTES (para crédito y registro)
-- ─────────────────────────────────────────────
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  credit_limit NUMERIC(10,2) DEFAULT 0,       -- límite de crédito autorizado
  credit_balance NUMERIC(10,2) DEFAULT 0,     -- saldo pendiente actual (deuda)
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_customers_name ON customers(name);
CREATE INDEX idx_customers_phone ON customers(phone);

CREATE TRIGGER set_updated_at_customers
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- 3. TURNOS / CORTE DE CAJA
-- ─────────────────────────────────────────────
CREATE TABLE shifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cashier_id UUID REFERENCES profiles(id),
  opening_amount NUMERIC(10,2) NOT NULL DEFAULT 0,  -- efectivo inicial al abrir
  closing_amount NUMERIC(10,2),                      -- efectivo contado al cerrar
  expected_cash NUMERIC(10,2),                       -- efectivo esperado (calculado)
  cash_difference NUMERIC(10,2),                     -- diferencia (closing - expected)
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes TEXT,
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX idx_shifts_cashier ON shifts(cashier_id);
CREATE INDEX idx_shifts_status ON shifts(status);

-- ─────────────────────────────────────────────
-- 4. MOVIMIENTOS DE EFECTIVO (entradas/salidas)
-- ─────────────────────────────────────────────
CREATE TABLE cash_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
  cashier_id UUID REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),   -- entrada o salida
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL,                                -- motivo del movimiento
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cash_movements_shift ON cash_movements(shift_id);

-- ─────────────────────────────────────────────
-- 5. MODIFICAR TABLA SALES
--    Agregar: shift_id, customer_id, cashier_id, actualizar payment_method
-- ─────────────────────────────────────────────
ALTER TABLE sales
  ADD COLUMN shift_id UUID REFERENCES shifts(id),
  ADD COLUMN cashier_id UUID REFERENCES profiles(id),
  ADD COLUMN customer_id UUID REFERENCES customers(id),
  ADD COLUMN amount_paid NUMERIC(10,2),        -- cuánto pagó el cliente (efectivo)
  ADD COLUMN change_given NUMERIC(10,2),       -- cambio entregado
  ADD COLUMN discount NUMERIC(10,2) DEFAULT 0; -- descuento total aplicado

-- Actualizar constraint de payment_method para incluir 'credit'
ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_payment_method_check;

ALTER TABLE sales
  ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'credit'));

CREATE INDEX idx_sales_shift ON sales(shift_id);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_cashier ON sales(cashier_id);
CREATE INDEX idx_sales_created_at ON sales(created_at);

-- ─────────────────────────────────────────────
-- 6. ABONOS A CRÉDITO
-- ─────────────────────────────────────────────
CREATE TABLE credit_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES shifts(id),
  cashier_id UUID REFERENCES profiles(id),
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_credit_payments_customer ON credit_payments(customer_id);

-- ─────────────────────────────────────────────
-- 7. AJUSTES DE INVENTARIO (trazabilidad)
-- ─────────────────────────────────────────────
CREATE TABLE inventory_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  cashier_id UUID REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('add', 'remove', 'correction')),
  quantity_before NUMERIC(10,2) NOT NULL,
  quantity_change NUMERIC(10,2) NOT NULL,   -- positivo = entrada, negativo = salida
  quantity_after NUMERIC(10,2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_inv_adjustments_variant ON inventory_adjustments(variant_id);

-- ─────────────────────────────────────────────
-- 8. ACTUALIZAR sale_items — agregar discount por línea
-- ─────────────────────────────────────────────
ALTER TABLE sale_items
  ADD COLUMN discount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN subtotal NUMERIC(10,2);  -- unit_price * quantity - discount

-- ─────────────────────────────────────────────
-- 9. ROW LEVEL SECURITY (RLS)
-- ─────────────────────────────────────────────

-- Habilitar RLS en todas las tablas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados pueden leer su propio perfil
CREATE POLICY "profiles: ver propio" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Política: owner puede ver todos los perfiles
CREATE POLICY "profiles: owner ve todos" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- Política: owner puede modificar perfiles
CREATE POLICY "profiles: owner modifica" ON profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

-- Política: usuarios autenticados pueden leer/escribir datos operativos
CREATE POLICY "sales: autenticados pueden operar" ON sales
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "sale_items: autenticados pueden operar" ON sale_items
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "products: autenticados leen" ON products
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "products: owner modifica" ON products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "variants: autenticados leen" ON product_variants
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "variants: owner modifica" ON product_variants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "customers: autenticados pueden operar" ON customers
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "shifts: autenticados pueden operar" ON shifts
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "cash_movements: autenticados pueden operar" ON cash_movements
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "credit_payments: autenticados pueden operar" ON credit_payments
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "inv_adjustments: autenticados pueden operar" ON inventory_adjustments
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────
-- 10. FUNCIÓN: Actualizar saldo de crédito del cliente
--     Se llama automáticamente al insertar una venta a crédito
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_customer_credit_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo actuar en ventas a crédito con cliente asignado
  IF NEW.payment_method = 'credit' AND NEW.customer_id IS NOT NULL THEN
    UPDATE customers
    SET credit_balance = credit_balance + NEW.total
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_credit_sale_created
  AFTER INSERT ON sales
  FOR EACH ROW EXECUTE FUNCTION update_customer_credit_on_sale();

-- Función: reducir saldo al registrar un abono
CREATE OR REPLACE FUNCTION update_customer_credit_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE customers
  SET credit_balance = GREATEST(0, credit_balance - NEW.amount)
  WHERE id = NEW.customer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_credit_payment_created
  AFTER INSERT ON credit_payments
  FOR EACH ROW EXECUTE FUNCTION update_customer_credit_on_payment();

-- ─────────────────────────────────────────────
-- 11. VISTA: Resumen de turno activo
-- ─────────────────────────────────────────────
CREATE OR REPLACE VIEW shift_summary AS
SELECT
  s.id AS shift_id,
  s.cashier_id,
  p.name AS cashier_name,
  s.opening_amount,
  s.status,
  s.opened_at,
  -- Total ventas del turno
  COALESCE(SUM(sa.total), 0) AS total_sales,
  COUNT(sa.id) AS num_transactions,
  -- Por método de pago
  COALESCE(SUM(CASE WHEN sa.payment_method = 'cash' THEN sa.total ELSE 0 END), 0) AS cash_sales,
  COALESCE(SUM(CASE WHEN sa.payment_method = 'card' THEN sa.total ELSE 0 END), 0) AS card_sales,
  COALESCE(SUM(CASE WHEN sa.payment_method = 'credit' THEN sa.total ELSE 0 END), 0) AS credit_sales,
  -- Movimientos de efectivo
  COALESCE(SUM(CASE WHEN cm.type = 'in' THEN cm.amount ELSE 0 END), 0) AS cash_in,
  COALESCE(SUM(CASE WHEN cm.type = 'out' THEN cm.amount ELSE 0 END), 0) AS cash_out
FROM shifts s
LEFT JOIN profiles p ON p.id = s.cashier_id
LEFT JOIN sales sa ON sa.shift_id = s.id
LEFT JOIN cash_movements cm ON cm.shift_id = s.id
GROUP BY s.id, s.cashier_id, p.name, s.opening_amount, s.status, s.opened_at;
