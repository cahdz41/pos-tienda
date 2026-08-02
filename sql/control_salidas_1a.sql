-- Control de salidas 1A
-- Ejecutar una sola vez en el SQL Editor de Supabase antes de desplegar la UI.
-- La migración conserva los movimientos anteriores sin asignarles una
-- clasificación que no podamos comprobar.

begin;

create table if not exists public.cash_movement_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null check (scope in ('business', 'family')),
  movement_type text not null default 'both'
    check (movement_type in ('in', 'out', 'both')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, name)
);

comment on table public.cash_movement_categories is
  'Catálogo para clasificar entradas y salidas de caja por negocio o familia.';

insert into public.cash_movement_categories (name, scope, movement_type)
values
  ('Aportación del propietario', 'business', 'in'),
  ('Cobro extraordinario', 'business', 'in'),
  ('Ajuste de caja', 'business', 'both'),
  ('Compra a proveedor', 'business', 'out'),
  ('Renta del local', 'business', 'out'),
  ('Nómina', 'business', 'out'),
  ('Servicios del local', 'business', 'out'),
  ('Publicidad', 'business', 'out'),
  ('Impuestos', 'business', 'out'),
  ('Capital de deuda', 'business', 'out'),
  ('Intereses y comisiones', 'business', 'out'),
  ('Otro movimiento del negocio', 'business', 'both'),
  ('Retiro del propietario', 'family', 'out'),
  ('Comida y despensa', 'family', 'out'),
  ('Servicios de casa', 'family', 'out'),
  ('Infonavit', 'family', 'out'),
  ('Deuda personal', 'family', 'out'),
  ('Otro gasto familiar', 'family', 'out')
on conflict (scope, name) do nothing;

alter table public.cash_movements
  add column if not exists scope text
    check (scope in ('business', 'family')),
  add column if not exists category_id uuid
    references public.cash_movement_categories(id),
  add column if not exists beneficiary text,
  add column if not exists notes text,
  add column if not exists created_by uuid
    references public.profiles(id),
  add column if not exists status text not null default 'posted'
    check (status in ('posted', 'cancelled')),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid
    references public.profiles(id),
  add column if not exists cancellation_reason text;

comment on column public.cash_movements.scope is
  'business = operación del negocio; family = retiro o gasto familiar.';
comment on column public.cash_movements.category_id is
  'Nulo únicamente en movimientos históricos creados antes de Control de salidas 1A.';
comment on column public.cash_movements.created_by is
  'Usuario responsable. Nulo únicamente en movimientos históricos.';

create index if not exists idx_cash_movements_category
  on public.cash_movements(category_id);
create index if not exists idx_cash_movements_scope_status
  on public.cash_movements(scope, status);

create or replace function public.set_cash_movement_category_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cash_movement_category_updated_at
  on public.cash_movement_categories;
create trigger trg_cash_movement_category_updated_at
before update on public.cash_movement_categories
for each row execute function public.set_cash_movement_category_updated_at();

create or replace function public.protect_cash_movement_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_scope text;
  selected_type text;
  selected_active boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Los movimientos de caja no se eliminan; deben cancelarse.';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Se requiere una sesión válida.';
    end if;
    if new.scope is null or new.category_id is null then
      raise exception 'El alcance y la categoría son obligatorios.';
    end if;
    if nullif(btrim(new.beneficiary), '') is null then
      raise exception 'El beneficiario u origen es obligatorio.';
    end if;

    select scope, movement_type, is_active
      into selected_scope, selected_type, selected_active
    from public.cash_movement_categories
    where id = new.category_id;

    if selected_scope is null or not selected_active then
      raise exception 'La categoría seleccionada no está disponible.';
    end if;
    if selected_scope <> new.scope then
      raise exception 'La categoría no corresponde al alcance seleccionado.';
    end if;
    if selected_type not in ('both', new.type) then
      raise exception 'La categoría no corresponde al tipo de movimiento.';
    end if;

    new.created_by := auth.uid();
    new.status := 'posted';
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.cancellation_reason := null;
    return new;
  end if;

  if old.status = 'cancelled' then
    raise exception 'Un movimiento cancelado no puede modificarse.';
  end if;
  if new.status <> 'cancelled' then
    raise exception 'Los movimientos registrados no se editan; solo pueden cancelarse.';
  end if;
  if public.get_my_role() <> 'owner' then
    raise exception 'Solo el propietario puede cancelar movimientos.';
  end if;
  if nullif(btrim(new.cancellation_reason), '') is null then
    raise exception 'El motivo de cancelación es obligatorio.';
  end if;

  -- Todos los datos originales quedan inmutables.
  new.id := old.id;
  new.shift_id := old.shift_id;
  new.type := old.type;
  new.amount := old.amount;
  new.reason := old.reason;
  new.created_at := old.created_at;
  new.scope := old.scope;
  new.category_id := old.category_id;
  new.beneficiary := old.beneficiary;
  new.notes := old.notes;
  new.created_by := old.created_by;
  new.status := 'cancelled';
  new.cancelled_at := now();
  new.cancelled_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_protect_cash_movement_history
  on public.cash_movements;
create trigger trg_protect_cash_movement_history
before insert or update or delete on public.cash_movements
for each row execute function public.protect_cash_movement_history();

create or replace function public.cancel_cash_movement(
  p_movement_id uuid,
  p_reason text
)
returns public.cash_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.cash_movements;
begin
  if auth.uid() is null or public.get_my_role() <> 'owner' then
    raise exception 'Solo el propietario puede cancelar movimientos.';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'El motivo de cancelación es obligatorio.';
  end if;

  update public.cash_movements
  set status = 'cancelled', cancellation_reason = btrim(p_reason)
  where id = p_movement_id and status = 'posted'
  returning * into result;

  if result.id is null then
    raise exception 'El movimiento no existe o ya fue cancelado.';
  end if;
  return result;
end;
$$;

alter table public.cash_movement_categories enable row level security;

drop policy if exists "Authenticated users can view cash movement categories"
  on public.cash_movement_categories;
create policy "Authenticated users can view cash movement categories"
on public.cash_movement_categories for select
to authenticated
using (auth.uid() is not null);

drop policy if exists "Owners can insert cash movement categories"
  on public.cash_movement_categories;
create policy "Owners can insert cash movement categories"
on public.cash_movement_categories for insert
to authenticated
with check (public.get_my_role() = 'owner');

drop policy if exists "Owners can update cash movement categories"
  on public.cash_movement_categories;
create policy "Owners can update cash movement categories"
on public.cash_movement_categories for update
to authenticated
using (public.get_my_role() = 'owner')
with check (public.get_my_role() = 'owner');

grant select, insert, update on public.cash_movement_categories to authenticated;
revoke delete on public.cash_movement_categories from authenticated;
revoke delete on public.cash_movements from authenticated;
grant execute on function public.cancel_cash_movement(uuid, text) to authenticated;

commit;
