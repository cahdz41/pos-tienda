-- Fase 2: publicación real a Facebook/Instagram vía Zernio.
-- Amplía los estados posibles de store_social_posts para cubrir posts
-- programados y ya publicados. Migración aditiva, no toca datos existentes.

alter table public.store_social_posts drop constraint if exists store_social_posts_status_check;
alter table public.store_social_posts add constraint store_social_posts_status_check
  check (status in ('draft', 'ready', 'scheduled', 'published'));

-- La columna "publishing" (jsonb) ya existía reservada desde la Fase 1 sin
-- escribirse. A partir de ahora guarda:
-- { zernio_post_id, scheduled_for, published_at, platforms, platform_results, requested_at }
