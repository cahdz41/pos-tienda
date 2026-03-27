-- =============================================
-- CREAR USUARIOS DEL POS DIRECTAMENTE EN AUTH
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- Paso 1: Corregir el trigger (fix RLS)
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

-- Política de INSERT en profiles (necesaria para el trigger)
DROP POLICY IF EXISTS "profiles: permitir insercion inicial" ON profiles;
CREATE POLICY "profiles: permitir insercion inicial" ON profiles
  FOR INSERT WITH CHECK (true);

-- Paso 2: Crear los 3 usuarios directamente en auth.users
DO $$
DECLARE
  owner_id   UUID := gen_random_uuid();
  cajero1_id UUID := gen_random_uuid();
  cajero2_id UUID := gen_random_uuid();
BEGIN

  -- ── Owner: Holly ──
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    raw_app_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new
  ) VALUES (
    owner_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'holly@chocholand.com',
    crypt('Ratota', gen_salt('bf')),
    now(),
    '{"name":"Holly","role":"owner"}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  -- ── Cajero 1: Chucho ──
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    raw_app_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new
  ) VALUES (
    cajero1_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'chucho@chocholand.com',
    crypt('chucho', gen_salt('bf')),
    now(),
    '{"name":"Chucho","role":"cashier"}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  -- ── Cajero 2 ──
  INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    raw_app_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new
  ) VALUES (
    cajero2_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'cajero2@chocholand.com',
    crypt('cajero2', gen_salt('bf')),
    now(),
    '{"name":"Cajero 2","role":"cashier"}'::jsonb,
    '{"provider":"email","providers":["email"]}'::jsonb,
    now(), now(),
    '', '', '', ''
  );

  -- Paso 3: Insertar perfiles manualmente (respaldo si el trigger no dispara)
  INSERT INTO public.profiles (id, name, role)
  VALUES
    (owner_id,   'Holly',    'owner'),
    (cajero1_id, 'Chucho',   'cashier'),
    (cajero2_id, 'Cajero 2', 'cashier')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Usuarios creados correctamente:';
  RAISE NOTICE '  holly@chocholand.com    → owner';
  RAISE NOTICE '  chucho@chocholand.com   → cashier';
  RAISE NOTICE '  cajero2@chocholand.com  → cashier';

END $$;

-- Verificación: deberías ver 3 filas
SELECT id, name, role, created_at FROM public.profiles ORDER BY created_at;r
