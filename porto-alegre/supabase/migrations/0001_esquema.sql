-- =====================================================================
-- Porto Alegre — Esquema de base de datos (Supabase / Postgres)
--
-- Pegar COMPLETO en el SQL Editor de Supabase y ejecutar (Run).
-- Es idempotente: se puede ejecutar más de una vez sin romper nada.
--
-- Diseño de concurrencia (3 a 15 garzones simultáneos):
--  * Caso 1 (agregados simultáneos): UNIQUE (mesa_id, producto_id) +
--    upsert con incremento atómico ⇒ nunca se pierde una operación y
--    nunca se duplican líneas.
--  * Caso 2 (doble cierre): UPDATE condicionado a estado='PENDIENTE'
--    (compare-and-set) ⇒ solo un cierre gana; el segundo recibe
--    MESA_YA_CERRADA.
--  * Toda mutación bloquea la fila de la mesa (SELECT ... FOR UPDATE)
--    y valida su estado dentro de la transacción ⇒ no se puede agregar
--    a una mesa mientras otro garzón la está cerrando.
--  * Los clientes solo tienen permiso de LECTURA sobre las tablas;
--    todas las escrituras pasan por estas funciones (security definer).
-- =====================================================================

create table if not exists public.mesas (
  id text primary key,
  numero_mesa integer not null unique check (numero_mesa between 1 and 100),
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'PAGADA')),
  fecha_apertura timestamptz,
  fecha_cierre timestamptz,
  menu_id text check (menu_id in (
    'BUFFET',
    'BUFFET_APERITIVO_VINO',
    'BUFFET_APERITIVO_VINO_BEBIDA',
    'BUFFET_APERITIVO_VINO_BEBIDA_TRAGO'
  )),
  adultos integer not null default 0 check (adultos between 0 and 99),
  ninos_6_11 integer not null default 0 check (ninos_6_11 between 0 and 99),
  ninos_3_5 integer not null default 0 check (ninos_3_5 between 0 and 99),
  actualizada_en timestamptz not null default now()
);

create table if not exists public.consumos (
  id text primary key,
  mesa_id text not null references public.mesas (id) on delete cascade,
  producto_id text not null,
  cantidad integer not null check (cantidad between 1 and 99),
  precio_unitario integer not null check (precio_unitario >= 0),
  subtotal integer generated always as (cantidad * precio_unitario) stored,
  actualizado_en timestamptz not null default now(),
  constraint consumo_unico_por_producto unique (mesa_id, producto_id)
);

create index if not exists consumos_mesa_idx on public.consumos (mesa_id);

-- Seed: las 100 mesas numeradas.
insert into public.mesas (id, numero_mesa)
select 'mesa-' || n, n
from generate_series(1, 100) as n
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Seguridad: lectura directa para la app; escrituras solo vía funciones.
-- ---------------------------------------------------------------------
alter table public.mesas enable row level security;
alter table public.consumos enable row level security;

drop policy if exists mesas_lectura on public.mesas;
create policy mesas_lectura on public.mesas for select using (true);

drop policy if exists consumos_lectura on public.consumos;
create policy consumos_lectura on public.consumos for select using (true);

-- ---------------------------------------------------------------------
-- agregar_consumo: agrega o ajusta cantidad con incremento ATÓMICO.
-- p_delta > 0 agrega; p_delta < 0 disminuye (mínimo 1).
-- ---------------------------------------------------------------------
create or replace function public.agregar_consumo(
  p_mesa_id text,
  p_producto_id text,
  p_precio_unitario integer,
  p_delta integer
) returns public.consumos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa public.mesas;
  v_consumo public.consumos;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'DELTA_INVALIDO';
  end if;

  select * into v_mesa from public.mesas where id = p_mesa_id for update;
  if not found then
    raise exception 'MESA_NO_EXISTE';
  end if;
  if v_mesa.estado = 'PAGADA' then
    raise exception 'MESA_PAGADA';
  end if;

  insert into public.consumos as c
    (id, mesa_id, producto_id, cantidad, precio_unitario)
  values (
    'c-' || p_mesa_id || '-' || p_producto_id,
    p_mesa_id,
    p_producto_id,
    least(greatest(p_delta, 1), 99),
    p_precio_unitario
  )
  on conflict (mesa_id, producto_id) do update
    set cantidad = least(greatest(c.cantidad + p_delta, 1), 99),
        actualizado_en = now()
  returning * into v_consumo;

  update public.mesas
     set fecha_apertura = coalesce(fecha_apertura, now()),
         actualizada_en = now()
   where id = p_mesa_id;

  return v_consumo;
end;
$$;

-- ---------------------------------------------------------------------
-- eliminar_consumo: quita la línea completa de un producto.
-- ---------------------------------------------------------------------
create or replace function public.eliminar_consumo(
  p_mesa_id text,
  p_producto_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa public.mesas;
begin
  select * into v_mesa from public.mesas where id = p_mesa_id for update;
  if not found then
    raise exception 'MESA_NO_EXISTE';
  end if;
  if v_mesa.estado = 'PAGADA' then
    raise exception 'MESA_PAGADA';
  end if;

  delete from public.consumos
   where mesa_id = p_mesa_id and producto_id = p_producto_id;

  update public.mesas set actualizada_en = now() where id = p_mesa_id;
end;
$$;

-- ---------------------------------------------------------------------
-- fijar_menu: menú buffet de la mesa (menú elegido por los adultos +
-- cantidades de personas). Solo sobre mesas pendientes.
-- ---------------------------------------------------------------------
create or replace function public.fijar_menu(
  p_mesa_id text,
  p_menu_id text,
  p_adultos integer,
  p_ninos_6_11 integer,
  p_ninos_3_5 integer
) returns public.mesas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa public.mesas;
begin
  select * into v_mesa from public.mesas where id = p_mesa_id for update;
  if not found then
    raise exception 'MESA_NO_EXISTE';
  end if;
  if v_mesa.estado = 'PAGADA' then
    raise exception 'MESA_PAGADA';
  end if;

  update public.mesas
     set menu_id = p_menu_id,
         adultos = coalesce(p_adultos, 0),
         ninos_6_11 = coalesce(p_ninos_6_11, 0),
         ninos_3_5 = coalesce(p_ninos_3_5, 0),
         fecha_apertura = case
           when p_menu_id is not null then coalesce(fecha_apertura, now())
           else fecha_apertura
         end,
         actualizada_en = now()
   where id = p_mesa_id
   returning * into v_mesa;

  return v_mesa;
end;
$$;

-- ---------------------------------------------------------------------
-- cerrar_mesa: bloqueo lógico (compare-and-set). Si dos garzones cierran
-- a la vez, solo uno gana; el otro recibe MESA_YA_CERRADA.
-- ---------------------------------------------------------------------
create or replace function public.cerrar_mesa(p_mesa_id text)
returns public.mesas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa public.mesas;
begin
  update public.mesas
     set estado = 'PAGADA',
         fecha_cierre = now(),
         actualizada_en = now()
   where id = p_mesa_id
     and estado = 'PENDIENTE'
   returning * into v_mesa;

  if not found then
    if not exists (select 1 from public.mesas where id = p_mesa_id) then
      raise exception 'MESA_NO_EXISTE';
    end if;
    raise exception 'MESA_YA_CERRADA';
  end if;

  return v_mesa;
end;
$$;

-- ---------------------------------------------------------------------
-- reabrir_mesa: corrige un cierre marcado por error (PAGADA → PENDIENTE)
-- conservando la cuenta. También compare-and-set.
-- ---------------------------------------------------------------------
create or replace function public.reabrir_mesa(p_mesa_id text)
returns public.mesas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa public.mesas;
begin
  update public.mesas
     set estado = 'PENDIENTE',
         fecha_cierre = null,
         actualizada_en = now()
   where id = p_mesa_id
     and estado = 'PAGADA'
   returning * into v_mesa;

  if not found then
    if not exists (select 1 from public.mesas where id = p_mesa_id) then
      raise exception 'MESA_NO_EXISTE';
    end if;
    raise exception 'MESA_NO_PAGADA';
  end if;

  return v_mesa;
end;
$$;

-- ---------------------------------------------------------------------
-- nueva_cuenta: una mesa PAGADA recibe clientes nuevos; borra consumos
-- y menú y la deja pendiente en $0, todo en una transacción.
-- ---------------------------------------------------------------------
create or replace function public.nueva_cuenta(p_mesa_id text)
returns public.mesas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa public.mesas;
begin
  select * into v_mesa from public.mesas where id = p_mesa_id for update;
  if not found then
    raise exception 'MESA_NO_EXISTE';
  end if;
  if v_mesa.estado <> 'PAGADA' then
    raise exception 'MESA_NO_PAGADA';
  end if;

  delete from public.consumos where mesa_id = p_mesa_id;

  update public.mesas
     set estado = 'PENDIENTE',
         fecha_apertura = null,
         fecha_cierre = null,
         menu_id = null,
         adultos = 0,
         ninos_6_11 = 0,
         ninos_3_5 = 0,
         actualizada_en = now()
   where id = p_mesa_id
   returning * into v_mesa;

  return v_mesa;
end;
$$;

-- ---------------------------------------------------------------------
-- Realtime: publicar los cambios de ambas tablas (solo en Supabase).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'mesas'
    ) then
      alter publication supabase_realtime add table public.mesas;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'consumos'
    ) then
      alter publication supabase_realtime add table public.consumos;
    end if;
  end if;
end;
$$;

-- Permisos de ejecución para los roles de Supabase (si existen).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema public to anon, authenticated;
    grant select on public.mesas, public.consumos to anon, authenticated;
    grant execute on function
      public.agregar_consumo(text, text, integer, integer),
      public.eliminar_consumo(text, text),
      public.fijar_menu(text, text, integer, integer, integer),
      public.cerrar_mesa(text),
      public.reabrir_mesa(text),
      public.nueva_cuenta(text)
    to anon, authenticated;
  end if;
end;
$$;
