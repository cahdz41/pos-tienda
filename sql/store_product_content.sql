-- Fichas enriquecidas de productos de la tienda.
-- Migración aditiva: no modifica precios, stock ni visibilidad del catálogo.

create table if not exists public.store_product_content (
  product_id uuid primary key references public.products(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published')),
  reference_variant_id uuid references public.product_variants(id) on delete set null,
  reference_flavor text not null default '',
  short_description text not null default '',
  key_features jsonb not null default '[]'::jsonb
    check (jsonb_typeof(key_features) = 'array'),
  serving_size text not null default '',
  servings_per_container text not null default '',
  presentation text not null default '',
  nutrition_facts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(nutrition_facts) = 'array'),
  ingredients text not null default '',
  directions text not null default '',
  nutrition_label_url text,
  research_sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(research_sources) = 'array'),
  research_warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(research_warnings) = 'array'),
  research_model text,
  research_prompt_version text,
  research_input_hash text,
  research_usage jsonb,
  researched_at timestamptz,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_product_content_status
  on public.store_product_content(status);
create index if not exists idx_store_product_content_researched_at
  on public.store_product_content(researched_at desc);

create or replace function public.touch_store_product_content_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_store_product_content_updated_at
  on public.store_product_content;
create trigger trg_store_product_content_updated_at
before update on public.store_product_content
for each row execute function public.touch_store_product_content_updated_at();

alter table public.store_product_content enable row level security;

drop policy if exists "Owners can read store product content"
  on public.store_product_content;
create policy "Owners can read store product content"
on public.store_product_content for select
to authenticated
using (public.get_my_role() = 'owner');
drop policy if exists "Owners can insert store product content"
  on public.store_product_content;
create policy "Owners can insert store product content"
on public.store_product_content for insert
to authenticated
with check (public.get_my_role() = 'owner');

drop policy if exists "Owners can update store product content"
  on public.store_product_content;
create policy "Owners can update store product content"
on public.store_product_content for update
to authenticated
using (public.get_my_role() = 'owner')
with check (public.get_my_role() = 'owner');

create table if not exists public.store_product_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  event_type text not null
    check (event_type in ('view', 'flavor_select', 'add_to_cart')),
  entry_point text not null default 'direct'
    check (entry_point in ('catalog', 'offer', 'direct')),
  session_key text not null check (char_length(session_key) between 8 and 80),
  created_at timestamptz not null default now()
);

create index if not exists idx_store_product_events_product_created
  on public.store_product_events(product_id, created_at desc);
create index if not exists idx_store_product_events_type_created
  on public.store_product_events(event_type, created_at desc);

alter table public.store_product_events enable row level security;

-- Las escrituras públicas pasan por /api/store/events, que valida y usa
-- la clave de servicio. No se concede INSERT directo a anon.
drop policy if exists "Owners can read store product events"
  on public.store_product_events;
create policy "Owners can read store product events"
on public.store_product_events for select
to authenticated
using (public.get_my_role() = 'owner');
