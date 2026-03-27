-- =============================================
-- MIGRACIÓN: Proveedores, Combos, Combo Items
-- =============================================

-- Tipo de venta en productos (Unidad / Paquete)
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_type TEXT DEFAULT 'unidad' CHECK (sale_type IN ('unidad', 'paquete'));

-- Tabla de proveedores
CREATE TABLE suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_updated_at_suppliers
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Agregar supplier_id a products (opcional)
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- Tabla de combos
CREATE TABLE combos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_updated_at_combos
  BEFORE UPDATE ON combos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Componentes de cada combo
CREATE TABLE combo_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  combo_id UUID REFERENCES combos(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1
);

CREATE INDEX idx_combo_items_combo_id ON combo_items(combo_id);

-- RLS: suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_insert" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "suppliers_update" ON suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "suppliers_delete" ON suppliers FOR DELETE TO authenticated USING (true);

-- RLS: combos
ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "combos_select" ON combos FOR SELECT TO authenticated USING (true);
CREATE POLICY "combos_insert" ON combos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "combos_update" ON combos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "combos_delete" ON combos FOR DELETE TO authenticated USING (true);

-- RLS: combo_items
ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "combo_items_select" ON combo_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "combo_items_insert" ON combo_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "combo_items_update" ON combo_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "combo_items_delete" ON combo_items FOR DELETE TO authenticated USING (true);
