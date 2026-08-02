-- Control de cuentas 1B
-- Caso real de Chocholand:
--   efectivo      -> Caja de tienda
--   transferencia -> Mercado Pago (importe completo)
--   tarjeta       -> Mercado Pago (importe menos 4.05% de comisión)
--
-- Ejecutar después de sql/control_salidas_1a.sql.

begin;

create table if not exists public.money_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_type text not null check (account_type in ('cash', 'digital_wallet')),
  opening_balance numeric(12,2) not null default 0,
  initialized_at timestamptz,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.money_accounts (code, name, account_type, display_order)
values
  ('cash', 'Caja de tienda', 'cash', 1),
  ('mercado_pago', 'Mercado Pago', 'digital_wallet', 2)
on conflict (code) do update set
  name = excluded.name,
  account_type = excluded.account_type,
  display_order = excluded.display_order;

create table if not exists public.financial_settings (
  singleton boolean primary key default true check (singleton),
  card_fee_rate numeric(8,6) not null default 0.040500
    check (card_fee_rate >= 0 and card_fee_rate <= 0.20),
  ledger_started_at timestamptz,
  started_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.financial_settings (singleton, card_fee_rate)
values (true, 0.040500)
on conflict (singleton) do nothing;

create table if not exists public.account_movements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.money_accounts(id),
  direction text not null check (direction in ('in', 'out')),
  amount numeric(12,2) not null check (amount > 0),
  entry_type text not null check (entry_type in (
    'sale', 'card_fee', 'cash_movement', 'credit_payment', 'transfer', 'adjustment'
  )),
  description text not null,
  reference_type text,
  reference_id uuid,
  component text not null default 'main',
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_account_movements_reference
  on public.account_movements(reference_type, reference_id, component)
  where reference_type is not null and reference_id is not null;
create index if not exists idx_account_movements_account_date
  on public.account_movements(account_id, occurred_at desc);
create index if not exists idx_account_movements_status
  on public.account_movements(status);

alter table public.cash_movements
  add column if not exists account_id uuid references public.money_accounts(id);

comment on column public.cash_movements.account_id is
  'Cuenta afectada. Nulo únicamente en movimientos anteriores a Control de cuentas 1B.';

create or replace function public.set_financial_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_money_accounts_updated_at on public.money_accounts;
create trigger trg_money_accounts_updated_at
before update on public.money_accounts
for each row execute function public.set_financial_updated_at();

drop trigger if exists trg_financial_settings_updated_at on public.financial_settings;
create trigger trg_financial_settings_updated_at
before update on public.financial_settings
for each row execute function public.set_financial_updated_at();

-- Reemplaza la protección de 1A para exigir también una cuenta en movimientos nuevos.
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
  selected_account_active boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Los movimientos de dinero no se eliminan; deben cancelarse.';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'Se requiere una sesión válida.';
    end if;
    if new.scope is null or new.category_id is null then
      raise exception 'El alcance y la categoría son obligatorios.';
    end if;
    if new.account_id is null then
      raise exception 'La cuenta de dinero es obligatoria.';
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

    select is_active into selected_account_active
    from public.money_accounts where id = new.account_id;
    if selected_account_active is null or not selected_account_active then
      raise exception 'La cuenta seleccionada no está disponible.';
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

  new.id := old.id;
  new.shift_id := old.shift_id;
  new.type := old.type;
  new.amount := old.amount;
  new.reason := old.reason;
  new.created_at := old.created_at;
  new.scope := old.scope;
  new.category_id := old.category_id;
  new.account_id := old.account_id;
  new.beneficiary := old.beneficiary;
  new.notes := old.notes;
  new.created_by := old.created_by;
  new.status := 'cancelled';
  new.cancelled_at := now();
  new.cancelled_by := auth.uid();
  return new;
end;
$$;

create or replace function public.post_sale_payment_to_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  started_at timestamptz;
  fee_rate numeric(8,6);
  target_account uuid;
  sale_user uuid;
  sale_status text;
  fee_amount numeric(12,2);
begin
  select ledger_started_at, card_fee_rate
    into started_at, fee_rate
  from public.financial_settings where singleton = true;

  if started_at is null or new.created_at < started_at or new.method = 'wallet' then
    return new;
  end if;

  select cashier_id, status into sale_user, sale_status
  from public.sales where id = new.sale_id;
  if sale_status <> 'completed' then return new; end if;

  if new.method = 'cash' then
    select id into target_account from public.money_accounts where code = 'cash' and is_active;
  elsif new.method in ('card', 'transfer') then
    select id into target_account from public.money_accounts where code = 'mercado_pago' and is_active;
  else
    return new;
  end if;

  insert into public.account_movements (
    account_id, direction, amount, entry_type, description,
    reference_type, reference_id, component, occurred_at, created_by
  ) values (
    target_account, 'in', new.amount, 'sale',
    case new.method
      when 'cash' then 'Venta cobrada en efectivo'
      when 'card' then 'Venta cobrada con tarjeta'
      else 'Venta cobrada por transferencia'
    end,
    'sale_payment', new.id, 'gross', new.created_at, sale_user
  ) on conflict do nothing;

  if new.method = 'card' then
    fee_amount := round(new.amount * fee_rate, 2);
    if fee_amount > 0 then
      insert into public.account_movements (
        account_id, direction, amount, entry_type, description,
        reference_type, reference_id, component, occurred_at, created_by
      ) values (
        target_account, 'out', fee_amount, 'card_fee',
        'Comisión Mercado Pago por cobro con tarjeta',
        'sale_payment', new.id, 'fee', new.created_at, sale_user
      ) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_post_sale_payment_to_account on public.sale_payments;
create trigger trg_post_sale_payment_to_account
after insert on public.sale_payments
for each row execute function public.post_sale_payment_to_account();

create or replace function public.post_credit_payment_to_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  started_at timestamptz;
  fee_rate numeric(8,6);
  target_account uuid;
  fee_amount numeric(12,2);
begin
  select ledger_started_at, card_fee_rate
    into started_at, fee_rate
  from public.financial_settings where singleton = true;
  if started_at is null or new.created_at < started_at then return new; end if;

  if new.payment_method = 'cash' then
    select id into target_account from public.money_accounts where code = 'cash' and is_active;
  elsif new.payment_method = 'card' then
    select id into target_account from public.money_accounts where code = 'mercado_pago' and is_active;
  else
    return new;
  end if;

  insert into public.account_movements (
    account_id, direction, amount, entry_type, description,
    reference_type, reference_id, component, occurred_at, created_by
  ) values (
    target_account, 'in', new.amount, 'credit_payment',
    'Abono de cliente a crédito',
    'credit_payment', new.id, 'gross', new.created_at, new.cashier_id
  ) on conflict do nothing;

  if new.payment_method = 'card' then
    fee_amount := round(new.amount * fee_rate, 2);
    if fee_amount > 0 then
      insert into public.account_movements (
        account_id, direction, amount, entry_type, description,
        reference_type, reference_id, component, occurred_at, created_by
      ) values (
        target_account, 'out', fee_amount, 'card_fee',
        'Comisión Mercado Pago por abono con tarjeta',
        'credit_payment', new.id, 'fee', new.created_at, new.cashier_id
      ) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_post_credit_payment_to_account on public.credit_payments;
create trigger trg_post_credit_payment_to_account
after insert on public.credit_payments
for each row execute function public.post_credit_payment_to_account();

create or replace function public.post_cash_movement_to_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  started_at timestamptz;
begin
  select ledger_started_at into started_at
  from public.financial_settings where singleton = true;
  if started_at is null or new.created_at < started_at or new.status <> 'posted' then
    return new;
  end if;

  insert into public.account_movements (
    account_id, direction, amount, entry_type, description,
    reference_type, reference_id, component, occurred_at, created_by
  ) values (
    new.account_id, new.type, new.amount, 'cash_movement',
    new.reason || ' · ' || new.beneficiary,
    'cash_movement', new.id, 'main', new.created_at, new.created_by
  ) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_post_cash_movement_to_account on public.cash_movements;
create trigger trg_post_cash_movement_to_account
after insert on public.cash_movements
for each row execute function public.post_cash_movement_to_account();

create or replace function public.cancel_linked_account_movements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'cash_movements'
     and old.status = 'posted' and new.status = 'cancelled' then
    update public.account_movements
    set status = 'cancelled', cancelled_at = coalesce(new.cancelled_at, now()),
        cancellation_reason = new.cancellation_reason
    where reference_type = 'cash_movement' and reference_id = new.id and status = 'posted';
  elsif tg_table_name = 'sales'
     and old.status = 'completed' and new.status = 'cancelled' then
    update public.account_movements
    set status = 'cancelled', cancelled_at = coalesce(new.cancelled_at, now()),
        cancellation_reason = coalesce(new.cancel_reason, 'Venta cancelada')
    where reference_type = 'sale_payment'
      and reference_id in (select id from public.sale_payments where sale_id = new.id)
      and status = 'posted';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cancel_cash_account_movement on public.cash_movements;
create trigger trg_cancel_cash_account_movement
after update on public.cash_movements
for each row execute function public.cancel_linked_account_movements();

drop trigger if exists trg_cancel_sale_account_movements on public.sales;
create trigger trg_cancel_sale_account_movements
after update on public.sales
for each row execute function public.cancel_linked_account_movements();

create or replace function public.initialize_money_accounts(
  p_cash_balance numeric,
  p_mercado_pago_balance numeric
)
returns setof public.money_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  started_at timestamptz;
begin
  if auth.uid() is null or public.get_my_role() <> 'owner' then
    raise exception 'Solo el propietario puede inicializar las cuentas.';
  end if;
  if p_cash_balance < 0 or p_mercado_pago_balance < 0 then
    raise exception 'Los saldos iniciales no pueden ser negativos.';
  end if;
  if (select ledger_started_at from public.financial_settings where singleton = true) is not null then
    raise exception 'Las cuentas ya fueron inicializadas.';
  end if;

  started_at := clock_timestamp();
  update public.money_accounts
  set opening_balance = case code
        when 'cash' then round(p_cash_balance, 2)
        when 'mercado_pago' then round(p_mercado_pago_balance, 2)
        else opening_balance end,
      initialized_at = started_at
  where code in ('cash', 'mercado_pago');

  update public.financial_settings
  set ledger_started_at = started_at, started_by = auth.uid()
  where singleton = true;

  return query select * from public.money_accounts order by display_order;
end;
$$;

create or replace function public.set_card_fee_percentage(p_percentage numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  result numeric;
begin
  if auth.uid() is null or public.get_my_role() <> 'owner' then
    raise exception 'Solo el propietario puede cambiar la comisión.';
  end if;
  if p_percentage < 0 or p_percentage > 20 then
    raise exception 'La comisión debe estar entre 0%% y 20%%.';
  end if;
  update public.financial_settings
  set card_fee_rate = round(p_percentage / 100, 6)
  where singleton = true
  returning card_fee_rate into result;
  return result;
end;
$$;

create or replace view public.money_account_balances
with (security_invoker = true)
as
select
  account.id,
  account.code,
  account.name,
  account.account_type,
  account.opening_balance,
  account.initialized_at,
  account.is_active,
  account.display_order,
  account.opening_balance + coalesce(sum(
    case
      when movement.status = 'posted' and movement.direction = 'in' then movement.amount
      when movement.status = 'posted' and movement.direction = 'out' then -movement.amount
      else 0
    end
  ), 0) as balance
from public.money_accounts account
left join public.account_movements movement on movement.account_id = account.id
group by account.id;

alter table public.money_accounts enable row level security;
alter table public.financial_settings enable row level security;
alter table public.account_movements enable row level security;

drop policy if exists "Authenticated users can view money accounts" on public.money_accounts;
create policy "Authenticated users can view money accounts"
on public.money_accounts for select to authenticated
using (auth.uid() is not null);

drop policy if exists "Authenticated users can view financial settings" on public.financial_settings;
create policy "Authenticated users can view financial settings"
on public.financial_settings for select to authenticated
using (auth.uid() is not null);

drop policy if exists "Owners can view account movements" on public.account_movements;
create policy "Owners can view account movements"
on public.account_movements for select to authenticated
using (public.get_my_role() = 'owner');

grant select on public.money_accounts, public.financial_settings to authenticated;
grant select on public.money_account_balances to authenticated;
grant select on public.account_movements to authenticated;
revoke insert, update, delete on public.money_accounts from authenticated;
revoke insert, update, delete on public.financial_settings from authenticated;
revoke insert, update, delete on public.account_movements from authenticated;
grant execute on function public.initialize_money_accounts(numeric, numeric) to authenticated;
grant execute on function public.set_card_fee_percentage(numeric) to authenticated;

commit;
