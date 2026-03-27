-- =============================================
-- FIX: Trigger handle_new_user bloqueado por RLS
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- 1. Recrear la función con search_path explícito (requerido por Supabase)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'cashier')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Agregar política de INSERT en profiles para el trigger
--    (el trigger corre como service_role pero RLS lo bloquea sin esta policy)
CREATE POLICY "profiles: permitir insercion inicial" ON profiles
  FOR INSERT WITH CHECK (true);
