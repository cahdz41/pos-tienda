-- Borradores de posts de redes sociales generados con IA a partir de
-- productos del catálogo. Migración aditiva: no modifica precios, stock,
-- fichas de producto ni visibilidad del catálogo.

create table if not exists public.store_social_posts (
  id uuid primary key default gen_random_uuid(),

  -- Productos seleccionados. Se guarda como jsonb (no uuid[] con FK por
  -- elemento, que Postgres no soporta limpio) para que borrar un producto
  -- del catálogo no rompa un borrador ya guardado.
  product_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(product_ids) = 'array'),

  idea_source text not null default 'owner_provided'
    check (idea_source in ('owner_provided', 'ai_generated')),
  idea_options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(idea_options) = 'array'),
  idea_title text not null default '',
  idea_angle text not null default '',
  idea_hook text not null default '',
  idea_cta text not null default '',
  owner_idea_text text not null default '',

  caption text not null default '',
  hashtags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(hashtags) = 'array'),
  alt_text text not null default '',
  caption_provider text check (caption_provider in ('openai', 'deepseek')),
  caption_model text,

  visual_identity_key text,
  image_model text,
  image_model_fallback_used boolean not null default false,
  -- Cada elemento: { url, cloudinary_public_id, base_image_url,
  --   source_product_id, has_logo_overlay, has_price_overlay,
  --   has_hook_overlay, position }
  images jsonb not null default '[]'::jsonb
    check (jsonb_typeof(images) = 'array'),

  platform_targets jsonb not null default '["facebook","instagram"]'::jsonb
    check (jsonb_typeof(platform_targets) = 'array'),

  status text not null default 'draft'
    check (status in ('draft', 'ready')),

  -- Reservada para la fase de publicación (Zernio): zernio_post_id,
  -- scheduled_for, published_at, platform_results. No se escribe en esta
  -- fase; existe solo para no requerir otra migración más adelante.
  publishing jsonb not null default '{}'::jsonb,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_store_social_posts_status
  on public.store_social_posts(status);
create index if not exists idx_store_social_posts_created_at
  on public.store_social_posts(created_at desc);

create or replace function public.touch_store_social_posts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_store_social_posts_updated_at
  on public.store_social_posts;
create trigger trg_store_social_posts_updated_at
before update on public.store_social_posts
for each row execute function public.touch_store_social_posts_updated_at();

alter table public.store_social_posts enable row level security;

drop policy if exists "Owners can read store social posts"
  on public.store_social_posts;
create policy "Owners can read store social posts"
on public.store_social_posts for select
to authenticated
using (public.get_my_role() = 'owner');

drop policy if exists "Owners can insert store social posts"
  on public.store_social_posts;
create policy "Owners can insert store social posts"
on public.store_social_posts for insert
to authenticated
with check (public.get_my_role() = 'owner');

drop policy if exists "Owners can update store social posts"
  on public.store_social_posts;
create policy "Owners can update store social posts"
on public.store_social_posts for update
to authenticated
using (public.get_my_role() = 'owner')
with check (public.get_my_role() = 'owner');

drop policy if exists "Owners can delete store social posts"
  on public.store_social_posts;
create policy "Owners can delete store social posts"
on public.store_social_posts for delete
to authenticated
using (public.get_my_role() = 'owner');
