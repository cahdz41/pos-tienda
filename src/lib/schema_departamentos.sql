-- =============================================
-- MIGRACIÓN: Tabla de Departamentos
-- =============================================

-- Tabla de departamentos (fuente de verdad para categorías)
CREATE TABLE departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_updated_at_departments
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departments_select" ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments_insert" ON departments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "departments_update" ON departments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "departments_delete" ON departments FOR DELETE TO authenticated USING (true);

-- Poblar con las categorías existentes en products (para no perder datos)
INSERT INTO departments (name)
SELECT DISTINCT TRIM(category)
FROM products
WHERE category IS NOT NULL AND TRIM(category) <> ''
ON CONFLICT (name) DO NOTHING;
