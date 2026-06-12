-- =====================================================================
-- Porto Alegre — Migración 0002: MODELO OPERACIONAL DE MESAS
--
-- Pegar COMPLETO en el SQL Editor de Supabase y ejecutar (Run).
-- Es idempotente: se puede ejecutar más de una vez sin perder datos.
-- Si encuentra el esquema 0001 (modelo viejo), lo reemplaza (solo se
-- pierden los datos de prueba de ese modelo).
--
-- Modelo:
--  * MESAS: entidades PERMANENTES del restaurante (1 a 100). Nunca se
--    eliminan ni se recrean; solo cambian entre DISPONIBLE y OCUPADA.
--  * ATENCIONES: cada vez que un cliente ocupa una mesa se crea una
--    atención (PENDIENTE). Consumos y abonos cuelgan de la atención.
--    Al pagar, la atención se cierra (PAGADA) con sus totales
--    congelados y la mesa vuelve a DISPONIBLE. El historial es
--    ilimitado: las atenciones cerradas NUNCA se borran ni se tocan.
--  * ABONOS: pagos parciales registrados durante la atención.
--  * GARZONES: quién abre cada atención y registra cada abono.
--
-- Reportes históricos: SIEMPRE desde atenciones/consumos/abonos.
-- Las mesas solo representan el estado operativo actual.
--
-- Concurrencia (hasta 25 garzones simultáneos):
--  * Una sola atención abierta por mesa: índice UNIQUE parcial sobre
--    atenciones(mesa_id) WHERE estado='PENDIENTE'.
--  * Abrir/cerrar/reabrir bloquean la fila de la mesa (FOR UPDATE) y
--    validan estado dentro de la transacción (compare-and-set): si dos
--    garzones abren o cierran a la vez, solo uno gana y el otro recibe
--    un error claro (MESA_OCUPADA / ATENCION_YA_CERRADA).
--  * Consumos y abonos bloquean la fila de la ATENCIÓN; los agregados
--    simultáneos usan UNIQUE (atencion_id, producto_id) + incremento
--    atómico, así nunca se pierde una operación ni se duplican líneas.
--  * Orden de bloqueo único (mesa → atención) ⇒ sin deadlocks.
--  * Las tablas solo aceptan LECTURAS desde la app (RLS); todas las
--    escrituras pasan por estas funciones (security definer).
-- =====================================================================

-- ------------------------ Limpieza del modelo 0001 -------------------
-- Solo actúa si detecta el esquema viejo (mesas.numero_mesa /
-- consumos.mesa_id). Nunca toca las tablas del modelo nuevo.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'consumos' and column_name = 'mesa_id'
  ) then
    drop table public.consumos cascade;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mesas' and column_name = 'numero_mesa'
  ) then
    drop table public.mesas cascade;
  end if;
end;
$$;

drop function if exists public.cerrar_mesa(text);
drop function if exists public.reabrir_mesa(text);
drop function if exists public.nueva_cuenta(text);
drop function if exists public.fijar_menu(text, text, integer, integer, integer);
-- Comparten firma con las versiones nuevas pero cambian el nombre del
-- primer parámetro, así que no basta el create or replace de más abajo:
drop function if exists public.agregar_consumo(text, text, integer, integer);
drop function if exists public.eliminar_consumo(text, text);

-- ------------------------------ Tablas --------------------------------

create table if not exists public.garzones (
  id text primary key,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists garzones_nombre_unico
  on public.garzones (lower(nombre));

-- Mesas permanentes: SOLO estado operativo actual. Nunca se borran.
create table if not exists public.mesas (
  id text primary key,
  numero integer not null unique check (numero between 1 and 100),
  estado text not null default 'DISPONIBLE'
    check (estado in ('DISPONIBLE', 'OCUPADA')),
  atencion_actual_id text, -- atención PENDIENTE en curso (null si libre)
  created_at timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

create sequence if not exists public.atenciones_numero;

-- Atenciones: una por cada ocupación de una mesa. Historial completo.
create table if not exists public.atenciones (
  id text primary key,
  numero bigint not null unique,
  mesa_id text not null references public.mesas (id),
  garzon_id text references public.garzones (id),
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE', 'PAGADA')),
  fecha_apertura timestamptz not null default now(),
  fecha_cierre timestamptz,
  -- Menú buffet de la atención (mismo desglose que la app de reservas).
  menu_id text check (menu_id in (
    'BUFFET',
    'BUFFET_APERITIVO_VINO',
    'BUFFET_APERITIVO_VINO_BEBIDA',
    'BUFFET_APERITIVO_VINO_BEBIDA_TRAGO'
  )),
  adultos integer not null default 0 check (adultos between 0 and 99),
  ninos_6_11 integer not null default 0 check (ninos_6_11 between 0 and 99),
  ninos_3_5 integer not null default 0 check (ninos_3_5 between 0 and 99),
  -- Totales en CLP, mantenidos por las funciones en cada mutación;
  -- al cerrar quedan congelados para los reportes históricos.
  total_menu integer not null default 0 check (total_menu >= 0),
  total_consumos integer not null default 0 check (total_consumos >= 0),
  total_abonos integer not null default 0 check (total_abonos >= 0),
  saldo_final integer not null default 0,
  actualizada_en timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mesas_atencion_actual_fk'
  ) then
    alter table public.mesas
      add constraint mesas_atencion_actual_fk
      foreign key (atencion_actual_id) references public.atenciones (id);
  end if;
end;
$$;

-- Invariante central: a lo sumo UNA atención abierta por mesa.
create unique index if not exists una_atencion_abierta_por_mesa
  on public.atenciones (mesa_id)
  where estado = 'PENDIENTE';

create index if not exists atenciones_mesa_idx
  on public.atenciones (mesa_id, numero desc);
create index if not exists atenciones_historial_idx
  on public.atenciones (fecha_cierre desc)
  where estado = 'PAGADA';

create table if not exists public.consumos (
  id text primary key,
  atencion_id text not null references public.atenciones (id),
  producto_id text not null,
  cantidad integer not null check (cantidad between 1 and 99),
  precio_unitario integer not null check (precio_unitario >= 0),
  subtotal integer generated always as (cantidad * precio_unitario) stored,
  actualizado_en timestamptz not null default now(),
  constraint consumo_unico_por_producto unique (atencion_id, producto_id)
);

create index if not exists consumos_atencion_idx
  on public.consumos (atencion_id);

create table if not exists public.abonos (
  id text primary key default gen_random_uuid()::text,
  atencion_id text not null references public.atenciones (id),
  monto integer not null check (monto > 0),
  observacion text not null default '',
  garzon_id text references public.garzones (id),
  creado_en timestamptz not null default now()
);

create index if not exists abonos_atencion_idx
  on public.abonos (atencion_id);

-- ------------------------------- Seed ---------------------------------

-- Las 100 mesas permanentes (idempotente: nunca pisa una existente).
insert into public.mesas (id, numero)
select 'mesa-' || n, n
from generate_series(1, 100) as n
on conflict (id) do nothing;

-- Garzones iniciales (se pueden agregar más desde la app).
insert into public.garzones (id, nombre) values
  ('g-1', 'Juan Pérez'),
  ('g-2', 'María Silva'),
  ('g-3', 'Pedro Santos'),
  ('g-4', 'Ana Souza'),
  ('g-5', 'Diego Ramírez'),
  ('g-6', 'Carla Oliveira'),
  ('g-7', 'Felipe Costa'),
  ('g-8', 'Valentina Rojas'),
  ('g-9', 'Lucas Moreira'),
  ('g-10', 'Camila Duarte')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Seguridad: lectura directa para la app; escrituras solo vía funciones.
-- ---------------------------------------------------------------------
alter table public.garzones enable row level security;
alter table public.mesas enable row level security;
alter table public.atenciones enable row level security;
alter table public.consumos enable row level security;
alter table public.abonos enable row level security;

drop policy if exists garzones_lectura on public.garzones;
create policy garzones_lectura on public.garzones for select using (true);
drop policy if exists mesas_lectura on public.mesas;
create policy mesas_lectura on public.mesas for select using (true);
drop policy if exists atenciones_lectura on public.atenciones;
create policy atenciones_lectura on public.atenciones for select using (true);
drop policy if exists consumos_lectura on public.consumos;
create policy consumos_lectura on public.consumos for select using (true);
drop policy if exists abonos_lectura on public.abonos;
create policy abonos_lectura on public.abonos for select using (true);

-- ---------------------------------------------------------------------
-- crear_garzon: alta idempotente por nombre (dos dispositivos pueden
-- registrar a la misma persona sin error).
-- ---------------------------------------------------------------------
create or replace function public.crear_garzon(p_nombre text)
returns public.garzones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_garzon public.garzones;
begin
  if length(v_nombre) < 2 or length(v_nombre) > 40 then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  select * into v_garzon
    from public.garzones
   where lower(nombre) = lower(v_nombre);
  if found then
    if not v_garzon.activo then
      update public.garzones set activo = true where id = v_garzon.id
      returning * into v_garzon;
    end if;
    return v_garzon;
  end if;

  insert into public.garzones (id, nombre)
  values ('g-' || gen_random_uuid()::text, v_nombre)
  on conflict (lower(nombre)) do update set activo = true
  returning * into v_garzon;

  return v_garzon;
end;
$$;

-- ---------------------------------------------------------------------
-- abrir_atencion: el cliente ocupa la mesa ⇒ nueva atención PENDIENTE.
-- Compare-and-set sobre la mesa: si dos garzones abren a la vez, solo
-- uno gana; el otro recibe MESA_OCUPADA. Devuelve atención + mesa.
-- ---------------------------------------------------------------------
create or replace function public.abrir_atencion(
  p_mesa_id text,
  p_garzon_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mesa public.mesas;
  v_atencion public.atenciones;
  v_numero bigint;
begin
  if not exists (
    select 1 from public.garzones where id = p_garzon_id and activo
  ) then
    raise exception 'GARZON_INVALIDO';
  end if;

  select * into v_mesa from public.mesas where id = p_mesa_id for update;
  if not found then
    raise exception 'MESA_NO_EXISTE';
  end if;
  if v_mesa.estado = 'OCUPADA' then
    raise exception 'MESA_OCUPADA';
  end if;

  v_numero := nextval('public.atenciones_numero');
  insert into public.atenciones (id, numero, mesa_id, garzon_id)
  values ('a-' || v_numero, v_numero, p_mesa_id, p_garzon_id)
  returning * into v_atencion;

  update public.mesas
     set estado = 'OCUPADA',
         atencion_actual_id = v_atencion.id,
         actualizada_en = now()
   where id = p_mesa_id
   returning * into v_mesa;

  return jsonb_build_object(
    'atencion', to_jsonb(v_atencion),
    'mesa', to_jsonb(v_mesa)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- bloquear_atencion_abierta (interna): bloquea la fila de la atención y
-- valida que siga PENDIENTE. Base de toda mutación de consumos/abonos.
-- ---------------------------------------------------------------------
create or replace function public.bloquear_atencion_abierta(p_atencion_id text)
returns public.atenciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atencion public.atenciones;
begin
  select * into v_atencion
    from public.atenciones
   where id = p_atencion_id
     for update;
  if not found then
    raise exception 'ATENCION_NO_EXISTE';
  end if;
  if v_atencion.estado <> 'PENDIENTE' then
    raise exception 'ATENCION_PAGADA';
  end if;
  return v_atencion;
end;
$$;

revoke execute on function public.bloquear_atencion_abierta(text) from public;

-- ---------------------------------------------------------------------
-- agregar_consumo: agrega o ajusta cantidad con incremento ATÓMICO
-- sobre UNIQUE (atencion_id, producto_id): los agregados simultáneos
-- de varios garzones conmutan y nunca se pierden ni se duplican.
-- p_delta > 0 agrega; p_delta < 0 disminuye (mínimo 1).
-- ---------------------------------------------------------------------
create or replace function public.agregar_consumo(
  p_atencion_id text,
  p_producto_id text,
  p_precio_unitario integer,
  p_delta integer
) returns public.consumos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumo public.consumos;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'DELTA_INVALIDO';
  end if;

  perform public.bloquear_atencion_abierta(p_atencion_id);

  insert into public.consumos as c
    (id, atencion_id, producto_id, cantidad, precio_unitario)
  values (
    'c-' || p_atencion_id || '-' || p_producto_id,
    p_atencion_id,
    p_producto_id,
    least(greatest(p_delta, 1), 99),
    p_precio_unitario
  )
  on conflict (atencion_id, producto_id) do update
    set cantidad = least(greatest(c.cantidad + p_delta, 1), 99),
        actualizado_en = now()
  returning * into v_consumo;

  update public.atenciones
     set total_consumos = coalesce((
           select sum(subtotal) from public.consumos
            where atencion_id = p_atencion_id
         ), 0),
         actualizada_en = now()
   where id = p_atencion_id;

  return v_consumo;
end;
$$;

-- ---------------------------------------------------------------------
-- eliminar_consumo: quita la línea completa de un producto.
-- ---------------------------------------------------------------------
create or replace function public.eliminar_consumo(
  p_atencion_id text,
  p_producto_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bloquear_atencion_abierta(p_atencion_id);

  delete from public.consumos
   where atencion_id = p_atencion_id and producto_id = p_producto_id;

  update public.atenciones
     set total_consumos = coalesce((
           select sum(subtotal) from public.consumos
            where atencion_id = p_atencion_id
         ), 0),
         actualizada_en = now()
   where id = p_atencion_id;
end;
$$;

-- ---------------------------------------------------------------------
-- fijar_menu: menú buffet de la atención. El monto viene calculado por
-- la app (los precios del menú son configuración del cliente).
-- ---------------------------------------------------------------------
create or replace function public.fijar_menu(
  p_atencion_id text,
  p_menu_id text,
  p_adultos integer,
  p_ninos_6_11 integer,
  p_ninos_3_5 integer,
  p_total_menu integer
) returns public.atenciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atencion public.atenciones;
begin
  if p_total_menu is null or p_total_menu < 0 or p_total_menu > 100000000 then
    raise exception 'MONTO_INVALIDO';
  end if;

  perform public.bloquear_atencion_abierta(p_atencion_id);

  update public.atenciones
     set menu_id = p_menu_id,
         adultos = coalesce(p_adultos, 0),
         ninos_6_11 = coalesce(p_ninos_6_11, 0),
         ninos_3_5 = coalesce(p_ninos_3_5, 0),
         total_menu = case when p_menu_id is null then 0 else p_total_menu end,
         actualizada_en = now()
   where id = p_atencion_id
   returning * into v_atencion;

  return v_atencion;
end;
$$;

-- ---------------------------------------------------------------------
-- agregar_abono: pago parcial durante la atención.
-- ---------------------------------------------------------------------
create or replace function public.agregar_abono(
  p_atencion_id text,
  p_monto integer,
  p_observacion text,
  p_garzon_id text
) returns public.abonos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abono public.abonos;
begin
  if p_monto is null or p_monto <= 0 or p_monto > 100000000 then
    raise exception 'MONTO_INVALIDO';
  end if;

  perform public.bloquear_atencion_abierta(p_atencion_id);

  insert into public.abonos (atencion_id, monto, observacion, garzon_id)
  values (
    p_atencion_id,
    p_monto,
    left(trim(coalesce(p_observacion, '')), 120),
    p_garzon_id
  )
  returning * into v_abono;

  update public.atenciones
     set total_abonos = total_abonos + p_monto,
         actualizada_en = now()
   where id = p_atencion_id;

  return v_abono;
end;
$$;

-- ---------------------------------------------------------------------
-- eliminar_abono: corrige un abono mal digitado MIENTRAS la atención
-- siga abierta (las atenciones cerradas son historial intocable).
-- ---------------------------------------------------------------------
create or replace function public.eliminar_abono(p_abono_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abono public.abonos;
begin
  select * into v_abono from public.abonos where id = p_abono_id;
  if not found then
    raise exception 'ABONO_NO_EXISTE';
  end if;

  perform public.bloquear_atencion_abierta(v_abono.atencion_id);

  delete from public.abonos where id = p_abono_id;

  update public.atenciones
     set total_abonos = coalesce((
           select sum(monto) from public.abonos
            where atencion_id = v_abono.atencion_id
         ), 0),
         actualizada_en = now()
   where id = v_abono.atencion_id;
end;
$$;

-- ---------------------------------------------------------------------
-- cerrar_atencion: el cliente paga. Compare-and-set sobre la atención
-- (FOR UPDATE + validación de estado): si dos garzones cobran a la vez
-- solo uno gana y el otro recibe ATENCION_YA_CERRADA. Congela totales
-- y saldo, pasa la atención al historial y libera la mesa (DISPONIBLE).
-- Orden de bloqueo: mesa → atención.
-- ---------------------------------------------------------------------
create or replace function public.cerrar_atencion(p_atencion_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atencion public.atenciones;
  v_mesa public.mesas;
  v_consumos integer;
  v_abonos integer;
begin
  select * into v_atencion from public.atenciones where id = p_atencion_id;
  if not found then
    raise exception 'ATENCION_NO_EXISTE';
  end if;

  select * into v_mesa
    from public.mesas where id = v_atencion.mesa_id for update;

  select * into v_atencion
    from public.atenciones where id = p_atencion_id for update;
  if v_atencion.estado <> 'PENDIENTE' then
    raise exception 'ATENCION_YA_CERRADA';
  end if;

  -- Con la fila bloqueada, ningún otro garzón puede seguir agregando:
  -- estos totales son definitivos.
  select coalesce(sum(subtotal), 0) into v_consumos
    from public.consumos where atencion_id = p_atencion_id;
  select coalesce(sum(monto), 0) into v_abonos
    from public.abonos where atencion_id = p_atencion_id;

  update public.atenciones
     set estado = 'PAGADA',
         fecha_cierre = now(),
         total_consumos = v_consumos,
         total_abonos = v_abonos,
         saldo_final = total_menu + v_consumos - v_abonos,
         actualizada_en = now()
   where id = p_atencion_id
   returning * into v_atencion;

  update public.mesas
     set estado = 'DISPONIBLE',
         atencion_actual_id = null,
         actualizada_en = now()
   where id = v_atencion.mesa_id
   returning * into v_mesa;

  return jsonb_build_object(
    'atencion', to_jsonb(v_atencion),
    'mesa', to_jsonb(v_mesa)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- reabrir_atencion: corrige un cierre marcado por error. Solo sobre la
-- ÚLTIMA atención de la mesa y solo si la mesa sigue DISPONIBLE (si ya
-- entró otro cliente, la corrección es manual). Compare-and-set.
-- ---------------------------------------------------------------------
create or replace function public.reabrir_atencion(p_atencion_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atencion public.atenciones;
  v_mesa public.mesas;
begin
  select * into v_atencion from public.atenciones where id = p_atencion_id;
  if not found then
    raise exception 'ATENCION_NO_EXISTE';
  end if;

  select * into v_mesa
    from public.mesas where id = v_atencion.mesa_id for update;
  if v_mesa.estado = 'OCUPADA' then
    raise exception 'MESA_OCUPADA';
  end if;

  select * into v_atencion
    from public.atenciones where id = p_atencion_id for update;
  if v_atencion.estado <> 'PAGADA' then
    raise exception 'ATENCION_NO_PAGADA';
  end if;
  if exists (
    select 1 from public.atenciones
     where mesa_id = v_atencion.mesa_id and numero > v_atencion.numero
  ) then
    raise exception 'ATENCION_ANTIGUA';
  end if;

  update public.atenciones
     set estado = 'PENDIENTE',
         fecha_cierre = null,
         saldo_final = 0,
         actualizada_en = now()
   where id = p_atencion_id
   returning * into v_atencion;

  update public.mesas
     set estado = 'OCUPADA',
         atencion_actual_id = v_atencion.id,
         actualizada_en = now()
   where id = v_atencion.mesa_id
   returning * into v_mesa;

  return jsonb_build_object(
    'atencion', to_jsonb(v_atencion),
    'mesa', to_jsonb(v_mesa)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Realtime: publicar los cambios de las cinco tablas (solo en Supabase).
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['mesas', 'atenciones', 'consumos', 'abonos', 'garzones']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- Permisos para los roles de Supabase (si existen).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema public to anon, authenticated;
    grant select on
      public.garzones, public.mesas, public.atenciones,
      public.consumos, public.abonos
    to anon, authenticated;
    grant execute on function
      public.crear_garzon(text),
      public.abrir_atencion(text, text),
      public.agregar_consumo(text, text, integer, integer),
      public.eliminar_consumo(text, text),
      public.fijar_menu(text, text, integer, integer, integer, integer),
      public.agregar_abono(text, integer, text, text),
      public.eliminar_abono(text),
      public.cerrar_atencion(text),
      public.reabrir_atencion(text)
    to anon, authenticated;
  end if;
end;
$$;
