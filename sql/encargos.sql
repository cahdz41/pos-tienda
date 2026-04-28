-- Crear tabla de encargos (pedidos especiales en tienda física)
-- Ejecutar esto en el SQL Editor de Supabase

create table if not exists special_orders (
  id uuid default gen_random_uuid() primary key,
  customer_id uuid not null references customers(id) on delete restrict,
  product_id uuid references product_variants(id) on delete set null,
  product_name text,
  sale_price numeric(12,2) not null,
  estimated_delivery_date date,
  deposit numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índices útiles
create index if not exists idx_special_orders_customer_id on special_orders(customer_id);
create index if not exists idx_special_orders_status on special_orders(status);
create index if not exists idx_special_orders_created_at on special_orders(created_at desc);

-- Políticas RLS
alter table special_orders enable row level security;

create policy "Enable all access for authenticated users" on special_orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
