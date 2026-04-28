-- Migración v2: agregar columna type a special_orders
-- Ejecutar esto en el SQL Editor de Supabase después de haber corrido encargos.sql

alter table special_orders add column if not exists type text not null default 'order' check (type in ('order', 'delivery'));
