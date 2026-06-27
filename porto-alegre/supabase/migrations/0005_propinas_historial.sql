-- =====================================================================
-- Porto Alegre — Migración 0005: PROPINAS · HISTORIAL · PERMISOS · DASHBOARD
--
-- REQUIERE 0002, 0003 y 0004. Pegar COMPLETO en el SQL Editor de Supabase
-- y ejecutar (Run). Idempotente y compatible con los datos actuales:
-- solo AGREGA columnas/funciones y reemplaza funciones existentes
-- conservando su comportamiento previo.
--
-- Cambios:
--  1. Limpieza de historial: limpiar_historial(desde, hasta) SOLO ADMIN;
--     borra atenciones PAGADAS (y sus consumos/abonos) en el rango de
--     fechas. NUNCA toca garzones ni auditoría. Queda en auditoría.
--  2. Permisos de mesa: editar/abonar/cerrar/transferir una atención lo
--     puede hacer SOLO su garzón dueño o un ADMIN (SIN_PERMISO_MESA). La
--     lectura sigue abierta a todos (RLS sin cambios).
--  3. Propinas: la atención guarda propina_pct, propina_monto y
--     total_final; se fijan al cerrar (una sola vez, sin duplicar).
--  4. Dashboard: dashboard_propinas(desde, hasta) → ranking por garzón.
--  5. Reapertura: reabrir_atencion pasa a ser SOLO ADMIN.
--  6. Auditoría: LIMPIAR_HISTORIAL nueva; CIERRE_MESA incluye la propina.
--  7. Concurrencia: el cierre sigue siendo compare-and-set
--     (estado='PENDIENTE'), así que no hay cierres/pagos/propinas
--     duplicados ni con 25 usuarios simultáneos.
-- =====================================================================

-- ------------------------- 1. Propinas en atenciones ------------------
alter table public.atenciones
  add column if not exists propina_pct integer not null default 0,
  add column if not exists propina_monto integer not null default 0,
  add column if not exists total_final integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'atenciones_propina_valida'
  ) then
    alter table public.atenciones
      add constraint atenciones_propina_valida
      check (propina_pct between 0 and 100 and propina_monto >= 0);
  end if;
end;
$$;

-- Backfill de cuentas ya cerradas (sin propina histórica): total_final
-- = total de la cuenta. Solo las que aún no tienen total_final.
update public.atenciones
   set total_final = total_menu + total_consumos + propina_monto
 where estado = 'PAGADA' and total_final = 0;

create index if not exists atenciones_garzon_pagada_idx
  on public.atenciones (garzon_id)
  where estado = 'PAGADA';

-- ------------------------- 2. Acción nueva de auditoría ---------------
alter table public.auditoria drop constraint if exists auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check
  check (accion in (
    'APERTURA_MESA', 'AGREGAR_PRODUCTO', 'ELIMINAR_PRODUCTO',
    'MODIFICAR_CANTIDAD', 'FIJAR_MENU', 'REGISTRAR_ABONO',
    'ELIMINAR_ABONO', 'TRANSFERENCIA_MESA', 'CIERRE_MESA',
    'REAPERTURA_MESA', 'GENERAR_PRECUENTA', 'LOGIN', 'LOGOUT',
    'CREACION_USUARIO', 'MODIFICACION_USUARIO', 'DESACTIVACION_USUARIO',
    'REGISTRO_USUARIO', 'INICIO_SESION', 'CIERRE_SESION',
    'LIMPIAR_HISTORIAL'
  ));

-- ---------------------------------------------------------------------
-- exigir_dueno_o_admin (interna): la atención solo la opera su garzón
-- dueño o un ADMIN. Base del permiso de edición/abono/cierre/transfer.
-- ---------------------------------------------------------------------
create or replace function public.exigir_dueno_o_admin(
  v_actor public.garzones,
  v_atencion public.atenciones
) returns void
language plpgsql
immutable
as $$
begin
  if v_actor.rol <> 'ADMIN'
     and (v_atencion.garzon_id is null or v_atencion.garzon_id <> v_actor.id)
  then
    raise exception 'SIN_PERMISO_MESA';
  end if;
end;
$$;

revoke execute on function
  public.exigir_dueno_o_admin(public.garzones, public.atenciones) from public;

-- ---------------------------------------------------------------------
-- agregar_consumo (reemplaza 0004): + permiso de dueño/ADMIN.
-- ---------------------------------------------------------------------
create or replace function public.agregar_consumo(
  p_atencion_id text,
  p_producto_id text,
  p_producto_nombre text,
  p_precio_unitario integer,
  p_delta integer
) returns public.consumos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_atencion public.atenciones;
  v_consumo public.consumos;
  v_antes integer;
begin
  v_actor := public.actor_actual();
  if p_delta is null or p_delta = 0 then
    raise exception 'DELTA_INVALIDO';
  end if;

  v_atencion := public.bloquear_atencion_abierta(p_atencion_id);
  perform public.exigir_dueno_o_admin(v_actor, v_atencion);

  select cantidad into v_antes
    from public.consumos
   where atencion_id = p_atencion_id and producto_id = p_producto_id;
  v_antes := coalesce(v_antes, 0);

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

  if v_antes = 0 then
    perform public.auditar(
      v_actor.id, 'AGREGAR_PRODUCTO', 'consumos', v_consumo.id,
      v_atencion.mesa_id, p_atencion_id,
      null,
      jsonb_build_object(
        'producto', coalesce(p_producto_nombre, p_producto_id),
        'cantidad', v_consumo.cantidad,
        'precioUnitario', p_precio_unitario
      ),
      null
    );
  elsif v_consumo.cantidad <> v_antes then
    perform public.auditar(
      v_actor.id, 'MODIFICAR_CANTIDAD', 'consumos', v_consumo.id,
      v_atencion.mesa_id, p_atencion_id,
      jsonb_build_object('cantidad', v_antes),
      jsonb_build_object(
        'producto', coalesce(p_producto_nombre, p_producto_id),
        'cantidad', v_consumo.cantidad
      ),
      coalesce(p_producto_nombre, p_producto_id)
    );
  end if;

  return v_consumo;
end;
$$;

-- ---------------------------------------------------------------------
-- eliminar_consumo (reemplaza 0004): + permiso de dueño/ADMIN.
-- ---------------------------------------------------------------------
create or replace function public.eliminar_consumo(
  p_atencion_id text,
  p_producto_id text,
  p_producto_nombre text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_atencion public.atenciones;
  v_consumo public.consumos;
begin
  v_actor := public.actor_actual();
  v_atencion := public.bloquear_atencion_abierta(p_atencion_id);
  perform public.exigir_dueno_o_admin(v_actor, v_atencion);

  delete from public.consumos
   where atencion_id = p_atencion_id and producto_id = p_producto_id
   returning * into v_consumo;

  update public.atenciones
     set total_consumos = coalesce((
           select sum(subtotal) from public.consumos
            where atencion_id = p_atencion_id
         ), 0),
         actualizada_en = now()
   where id = p_atencion_id;

  if v_consumo.id is not null then
    perform public.auditar(
      v_actor.id, 'ELIMINAR_PRODUCTO', 'consumos', v_consumo.id,
      v_atencion.mesa_id, p_atencion_id,
      jsonb_build_object(
        'producto', coalesce(p_producto_nombre, p_producto_id),
        'cantidad', v_consumo.cantidad,
        'subtotal', v_consumo.subtotal
      ),
      null,
      null
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- fijar_menu (reemplaza 0004): + permiso de dueño/ADMIN.
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
  v_actor public.garzones;
  v_antes public.atenciones;
  v_atencion public.atenciones;
begin
  v_actor := public.actor_actual();
  if p_total_menu is null or p_total_menu < 0 or p_total_menu > 100000000 then
    raise exception 'MONTO_INVALIDO';
  end if;

  v_antes := public.bloquear_atencion_abierta(p_atencion_id);
  perform public.exigir_dueno_o_admin(v_actor, v_antes);

  update public.atenciones
     set menu_id = p_menu_id,
         adultos = coalesce(p_adultos, 0),
         ninos_6_11 = coalesce(p_ninos_6_11, 0),
         ninos_3_5 = coalesce(p_ninos_3_5, 0),
         total_menu = case when p_menu_id is null then 0 else p_total_menu end,
         actualizada_en = now()
   where id = p_atencion_id
   returning * into v_atencion;

  perform public.auditar(
    v_actor.id, 'FIJAR_MENU', 'atenciones', p_atencion_id,
    v_atencion.mesa_id, p_atencion_id,
    jsonb_build_object('menu', v_antes.menu_id, 'totalMenu', v_antes.total_menu),
    jsonb_build_object('menu', v_atencion.menu_id, 'totalMenu', v_atencion.total_menu),
    null
  );
  return v_atencion;
end;
$$;

-- ---------------------------------------------------------------------
-- agregar_abono / eliminar_abono (reemplazan 0004): + permiso dueño/ADMIN.
-- ---------------------------------------------------------------------
create or replace function public.agregar_abono(
  p_atencion_id text,
  p_monto integer,
  p_observacion text
) returns public.abonos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_atencion public.atenciones;
  v_abono public.abonos;
begin
  v_actor := public.actor_actual();
  if p_monto is null or p_monto <= 0 or p_monto > 100000000 then
    raise exception 'MONTO_INVALIDO';
  end if;

  v_atencion := public.bloquear_atencion_abierta(p_atencion_id);
  perform public.exigir_dueno_o_admin(v_actor, v_atencion);

  insert into public.abonos (atencion_id, monto, observacion, garzon_id)
  values (
    p_atencion_id,
    p_monto,
    left(trim(coalesce(p_observacion, '')), 120),
    v_actor.id
  )
  returning * into v_abono;

  update public.atenciones
     set total_abonos = total_abonos + p_monto,
         actualizada_en = now()
   where id = p_atencion_id;

  perform public.auditar(
    v_actor.id, 'REGISTRAR_ABONO', 'abonos', v_abono.id,
    v_atencion.mesa_id, p_atencion_id,
    null,
    jsonb_build_object('monto', p_monto, 'observacion', v_abono.observacion),
    v_abono.observacion
  );
  return v_abono;
end;
$$;

create or replace function public.eliminar_abono(p_abono_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_abono public.abonos;
  v_atencion public.atenciones;
begin
  v_actor := public.actor_actual();

  select * into v_abono from public.abonos where id = p_abono_id;
  if not found then
    raise exception 'ABONO_NO_EXISTE';
  end if;

  v_atencion := public.bloquear_atencion_abierta(v_abono.atencion_id);
  perform public.exigir_dueno_o_admin(v_actor, v_atencion);

  delete from public.abonos where id = p_abono_id;

  update public.atenciones
     set total_abonos = coalesce((
           select sum(monto) from public.abonos
            where atencion_id = v_abono.atencion_id
         ), 0),
         actualizada_en = now()
   where id = v_abono.atencion_id;

  perform public.auditar(
    v_actor.id, 'ELIMINAR_ABONO', 'abonos', p_abono_id,
    v_atencion.mesa_id, v_abono.atencion_id,
    jsonb_build_object('monto', v_abono.monto, 'observacion', v_abono.observacion),
    null,
    null
  );
end;
$$;

-- ---------------------------------------------------------------------
-- transferir_atencion (reemplaza 0004): solo el dueño actual o un ADMIN
-- puede ceder la mesa (impide robar mesas de otros garzones).
-- ---------------------------------------------------------------------
create or replace function public.transferir_atencion(
  p_atencion_id text,
  p_garzon_nuevo_id text
) returns public.atenciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_atencion public.atenciones;
  v_anterior text;
  v_nuevo text;
begin
  v_actor := public.actor_actual();
  if not exists (
    select 1 from public.garzones where id = p_garzon_nuevo_id and activo
  ) then
    raise exception 'GARZON_INVALIDO';
  end if;

  v_atencion := public.bloquear_atencion_abierta(p_atencion_id);
  perform public.exigir_dueno_o_admin(v_actor, v_atencion);
  if v_atencion.garzon_id = p_garzon_nuevo_id then
    return v_atencion;
  end if;

  select nombre into v_anterior from public.garzones where id = v_atencion.garzon_id;
  select nombre into v_nuevo from public.garzones where id = p_garzon_nuevo_id;

  update public.atenciones
     set garzon_id = p_garzon_nuevo_id,
         actualizada_en = now()
   where id = p_atencion_id
   returning * into v_atencion;

  perform public.auditar(
    v_actor.id, 'TRANSFERENCIA_MESA', 'atenciones', p_atencion_id,
    v_atencion.mesa_id, p_atencion_id,
    jsonb_build_object('garzon', coalesce(v_anterior, '—')),
    jsonb_build_object('garzon', coalesce(v_nuevo, '—')),
    null
  );
  return v_atencion;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. cerrar_atencion (NUEVA FIRMA con propina). Compare-and-set sobre la
-- atención: cierra una sola vez (sin pagos/propinas duplicados) y deja
-- la propina congelada. Permiso de dueño/ADMIN.
-- ---------------------------------------------------------------------
drop function if exists public.cerrar_atencion(text);

create or replace function public.cerrar_atencion(
  p_atencion_id text,
  p_propina_pct integer default 0,
  p_propina_monto integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_atencion public.atenciones;
  v_mesa public.mesas;
  v_consumos integer;
  v_abonos integer;
  v_total integer;
  v_pct integer := coalesce(p_propina_pct, 0);
  v_propina integer := coalesce(p_propina_monto, 0);
begin
  v_actor := public.actor_actual();
  if v_pct < 0 or v_pct > 100 or v_propina < 0 or v_propina > 100000000 then
    raise exception 'PROPINA_INVALIDA';
  end if;

  select * into v_atencion from public.atenciones where id = p_atencion_id;
  if not found then
    raise exception 'ATENCION_NO_EXISTE';
  end if;
  perform public.exigir_dueno_o_admin(v_actor, v_atencion);

  select * into v_mesa
    from public.mesas where id = v_atencion.mesa_id for update;

  -- Compare-and-set: solo el primer cierre gana.
  select * into v_atencion
    from public.atenciones where id = p_atencion_id for update;
  if v_atencion.estado <> 'PENDIENTE' then
    raise exception 'ATENCION_YA_CERRADA';
  end if;

  select coalesce(sum(subtotal), 0) into v_consumos
    from public.consumos where atencion_id = p_atencion_id;
  select coalesce(sum(monto), 0) into v_abonos
    from public.abonos where atencion_id = p_atencion_id;
  v_total := v_atencion.total_menu + v_consumos;

  update public.atenciones
     set estado = 'PAGADA',
         fecha_cierre = now(),
         total_consumos = v_consumos,
         total_abonos = v_abonos,
         saldo_final = v_total - v_abonos,
         propina_pct = v_pct,
         propina_monto = v_propina,
         total_final = v_total + v_propina,
         actualizada_en = now()
   where id = p_atencion_id
   returning * into v_atencion;

  update public.mesas
     set estado = 'DISPONIBLE',
         atencion_actual_id = null,
         actualizada_en = now()
   where id = v_atencion.mesa_id
   returning * into v_mesa;

  perform public.auditar(
    v_actor.id, 'CIERRE_MESA', 'atenciones', p_atencion_id,
    v_atencion.mesa_id, p_atencion_id,
    jsonb_build_object('estado', 'PENDIENTE'),
    jsonb_build_object(
      'estado', 'PAGADA',
      'total', v_total,
      'abonos', v_abonos,
      'saldo', v_atencion.saldo_final,
      'propinaPct', v_pct,
      'propina', v_propina,
      'totalFinal', v_atencion.total_final
    ),
    case when v_propina > 0 then 'Con propina' else 'Sin propina' end
  );

  return jsonb_build_object(
    'atencion', to_jsonb(v_atencion),
    'mesa', to_jsonb(v_mesa)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. reabrir_atencion (reemplaza 0004): ahora SOLO ADMIN.
-- ---------------------------------------------------------------------
create or replace function public.reabrir_atencion(p_atencion_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_atencion public.atenciones;
  v_mesa public.mesas;
begin
  v_actor := public.actor_actual();
  if v_actor.rol <> 'ADMIN' then
    raise exception 'SOLO_ADMIN';
  end if;

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
         propina_pct = 0,
         propina_monto = 0,
         total_final = 0,
         actualizada_en = now()
   where id = p_atencion_id
   returning * into v_atencion;

  update public.mesas
     set estado = 'OCUPADA',
         atencion_actual_id = v_atencion.id,
         actualizada_en = now()
   where id = v_atencion.mesa_id
   returning * into v_mesa;

  perform public.auditar(
    v_actor.id, 'REAPERTURA_MESA', 'atenciones', p_atencion_id,
    v_atencion.mesa_id, p_atencion_id,
    jsonb_build_object('estado', 'PAGADA'),
    jsonb_build_object('estado', 'PENDIENTE'),
    null
  );

  return jsonb_build_object(
    'atencion', to_jsonb(v_atencion),
    'mesa', to_jsonb(v_mesa)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 1. limpiar_historial: SOLO ADMIN. Borra atenciones PAGADAS (y sus
-- consumos/abonos) cerradas en el rango [desde, hasta). NUNCA toca
-- garzones, productos (catálogo del cliente) ni auditoría. Auditado.
-- ---------------------------------------------------------------------
create or replace function public.limpiar_historial(
  p_desde timestamptz,
  p_hasta timestamptz
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_ids text[];
  v_count integer;
begin
  v_actor := public.actor_actual();
  if v_actor.rol <> 'ADMIN' then
    raise exception 'SOLO_ADMIN';
  end if;

  select coalesce(array_agg(id), '{}') into v_ids
    from public.atenciones
   where estado = 'PAGADA'
     and (p_desde is null or fecha_cierre >= p_desde)
     and (p_hasta is null or fecha_cierre < p_hasta);

  v_count := coalesce(array_length(v_ids, 1), 0);

  if v_count > 0 then
    delete from public.abonos where atencion_id = any(v_ids);
    delete from public.consumos where atencion_id = any(v_ids);
    delete from public.atenciones where id = any(v_ids);
  end if;

  perform public.auditar(
    v_actor.id, 'LIMPIAR_HISTORIAL', 'atenciones', null, null, null,
    null,
    jsonb_build_object(
      'cuentas', v_count,
      'desde', p_desde,
      'hasta', p_hasta
    ),
    case when v_count = 1 then '1 cuenta' else v_count || ' cuentas' end
  );

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. dashboard_propinas: SOLO ADMIN. Agregado de propinas por garzón en
-- el rango [desde, hasta) sobre atenciones PAGADAS. La pantalla calcula
-- total y promedio global a partir de estas filas.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_propinas(
  p_desde timestamptz,
  p_hasta timestamptz
) returns table (
  garzon_id text,
  nombre text,
  cuentas bigint,
  total_propinas bigint,
  total_ventas bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
begin
  v_actor := public.actor_actual();
  if v_actor.rol <> 'ADMIN' then
    raise exception 'SOLO_ADMIN';
  end if;

  return query
  select
    a.garzon_id,
    coalesce(g.nombre, '—') as nombre,
    count(*)::bigint as cuentas,
    coalesce(sum(a.propina_monto), 0)::bigint as total_propinas,
    coalesce(sum(a.total_menu + a.total_consumos), 0)::bigint as total_ventas
  from public.atenciones a
  left join public.garzones g on g.id = a.garzon_id
  where a.estado = 'PAGADA'
    and (p_desde is null or a.fecha_cierre >= p_desde)
    and (p_hasta is null or a.fecha_cierre < p_hasta)
  group by a.garzon_id, g.nombre
  order by total_propinas desc, cuentas desc;
end;
$$;

-- ----------------------- Permisos (roles Supabase) ---------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function
      public.cerrar_atencion(text, integer, integer),
      public.limpiar_historial(timestamptz, timestamptz),
      public.dashboard_propinas(timestamptz, timestamptz)
    to authenticated;
  end if;
end;
$$;
