-- =====================================================================
-- Porto Alegre — Migración 0003: SISTEMA DE AUDITORÍA COMPLETA
--
-- REQUIERE haber ejecutado antes 0002_atenciones.sql.
-- Pegar COMPLETO en el SQL Editor de Supabase y ejecutar (Run).
-- Es idempotente: se puede ejecutar más de una vez sin perder datos.
--
-- Auditoría:
--  * Tabla `auditoria` INALTERABLE: solo lectura para la app; triggers
--    que rechazan UPDATE/DELETE/TRUNCATE incluso para las funciones.
--    Los registros NUNCA se modifican ni se eliminan.
--  * Cada registro guarda: quién (usuario_id + nombre y rol congelados),
--    qué (accion/entidad/entidad_id), dónde (mesa_numero/atencion_id),
--    estado anterior y nuevo (jsonb), observación y fecha exacta.
--  * Las acciones se registran AUTOMÁTICAMENTE dentro de la misma
--    transacción de cada función RPC: si la operación falla, no hay
--    registro fantasma; si se registra, la operación ocurrió.
--
-- Acciones: APERTURA_MESA · AGREGAR_PRODUCTO · ELIMINAR_PRODUCTO ·
--   MODIFICAR_CANTIDAD · FIJAR_MENU · REGISTRAR_ABONO · ELIMINAR_ABONO ·
--   TRANSFERENCIA_MESA · CIERRE_MESA · REAPERTURA_MESA ·
--   GENERAR_PRECUENTA · LOGIN · LOGOUT · CREACION_USUARIO ·
--   MODIFICACION_USUARIO · DESACTIVACION_USUARIO
--
-- Roles: garzones.rol ('ADMIN' | 'GARZON'). El ADMIN ve toda la
-- auditoría; el garzón solo la de sus propias mesas (filtro de la app).
-- =====================================================================

-- ----------------------- Roles en garzones ----------------------------

alter table public.garzones
  add column if not exists rol text not null default 'GARZON';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'garzones_rol_valido'
  ) then
    alter table public.garzones
      add constraint garzones_rol_valido check (rol in ('ADMIN', 'GARZON'));
  end if;
end;
$$;

-- Cuenta de administración (puede ver toda la auditoría).
insert into public.garzones (id, nombre, rol)
values ('g-admin', 'Administración', 'ADMIN')
on conflict (id) do nothing;
update public.garzones set rol = 'ADMIN' where id = 'g-admin';

-- --------------------------- Tabla auditoria --------------------------

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  usuario_id text references public.garzones (id),
  nombre_usuario text not null default '',
  rol_usuario text not null default '',
  accion text not null check (accion in (
    'APERTURA_MESA', 'AGREGAR_PRODUCTO', 'ELIMINAR_PRODUCTO',
    'MODIFICAR_CANTIDAD', 'FIJAR_MENU', 'REGISTRAR_ABONO',
    'ELIMINAR_ABONO', 'TRANSFERENCIA_MESA', 'CIERRE_MESA',
    'REAPERTURA_MESA', 'GENERAR_PRECUENTA', 'LOGIN', 'LOGOUT',
    'CREACION_USUARIO', 'MODIFICACION_USUARIO', 'DESACTIVACION_USUARIO'
  )),
  entidad text not null,
  entidad_id text,
  mesa_numero integer,
  atencion_id text,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  observacion text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists auditoria_fecha_idx
  on public.auditoria (created_at desc);
create index if not exists auditoria_usuario_idx
  on public.auditoria (usuario_id, created_at desc);
create index if not exists auditoria_mesa_idx
  on public.auditoria (mesa_numero, created_at desc);
create index if not exists auditoria_accion_idx
  on public.auditoria (accion, created_at desc);
create index if not exists auditoria_atencion_idx
  on public.auditoria (atencion_id);

-- Inalterable: ni siquiera las funciones security definer pueden
-- modificar o borrar registros (solo INSERT y SELECT).
create or replace function public.auditoria_es_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'AUDITORIA_INMUTABLE';
end;
$$;

drop trigger if exists auditoria_sin_cambios on public.auditoria;
create trigger auditoria_sin_cambios
  before update or delete on public.auditoria
  for each row execute function public.auditoria_es_inmutable();

drop trigger if exists auditoria_sin_truncate on public.auditoria;
create trigger auditoria_sin_truncate
  before truncate on public.auditoria
  for each statement execute function public.auditoria_es_inmutable();

alter table public.auditoria enable row level security;
drop policy if exists auditoria_lectura on public.auditoria;
create policy auditoria_lectura on public.auditoria for select using (true);

-- ---------------------------------------------------------------------
-- auditar (interna): inserta el registro congelando nombre y rol del
-- usuario al momento de la acción. No se expone a los clientes.
-- ---------------------------------------------------------------------
create or replace function public.auditar(
  p_usuario_id text,
  p_accion text,
  p_entidad text,
  p_entidad_id text,
  p_mesa_id text,
  p_atencion_id text,
  p_valor_anterior jsonb,
  p_valor_nuevo jsonb,
  p_observacion text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_garzon public.garzones;
  v_mesa_numero integer;
begin
  select * into v_garzon from public.garzones where id = p_usuario_id;
  if p_mesa_id is not null then
    select numero into v_mesa_numero from public.mesas where id = p_mesa_id;
  end if;

  insert into public.auditoria
    (usuario_id, nombre_usuario, rol_usuario, accion, entidad, entidad_id,
     mesa_numero, atencion_id, valor_anterior, valor_nuevo, observacion)
  values (
    case when v_garzon.id is null then null else v_garzon.id end,
    coalesce(v_garzon.nombre, 'sistema'),
    coalesce(v_garzon.rol, ''),
    p_accion,
    p_entidad,
    p_entidad_id,
    v_mesa_numero,
    p_atencion_id,
    p_valor_anterior,
    p_valor_nuevo,
    left(trim(coalesce(p_observacion, '')), 300)
  );
end;
$$;

revoke execute on function public.auditar(
  text, text, text, text, text, text, jsonb, jsonb, text
) from public;

-- ------------- Limpieza de firmas reemplazadas del 0002 ----------------
-- (cambian de parámetros para incorporar el actor y el nombre del
-- producto; las versiones nuevas se crean a continuación)
drop function if exists public.agregar_consumo(text, text, integer, integer);
drop function if exists public.eliminar_consumo(text, text);
drop function if exists public.fijar_menu(text, text, integer, integer, integer, integer);
drop function if exists public.eliminar_abono(text);
drop function if exists public.cerrar_atencion(text);
drop function if exists public.reabrir_atencion(text);
drop function if exists public.crear_garzon(text);

-- ---------------------------------------------------------------------
-- crear_garzon: alta idempotente por nombre + auditoría
-- (CREACION_USUARIO si es nuevo, MODIFICACION_USUARIO si se reactiva).
-- ---------------------------------------------------------------------
create or replace function public.crear_garzon(
  p_nombre text,
  p_actor_id text
) returns public.garzones
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
      perform public.auditar(
        coalesce(p_actor_id, v_garzon.id), 'MODIFICACION_USUARIO',
        'garzones', v_garzon.id, null, null,
        jsonb_build_object('activo', false),
        jsonb_build_object('activo', true, 'nombre', v_garzon.nombre),
        'Usuario reactivado'
      );
    end if;
    return v_garzon;
  end if;

  insert into public.garzones (id, nombre)
  values ('g-' || gen_random_uuid()::text, v_nombre)
  on conflict (lower(nombre)) do update set activo = true
  returning * into v_garzon;

  perform public.auditar(
    coalesce(p_actor_id, v_garzon.id), 'CREACION_USUARIO',
    'garzones', v_garzon.id, null, null,
    null,
    jsonb_build_object('nombre', v_garzon.nombre, 'rol', v_garzon.rol),
    null
  );
  return v_garzon;
end;
$$;

-- ---------------------------------------------------------------------
-- modificar_garzon: renombrar y/o cambiar rol + auditoría.
-- ---------------------------------------------------------------------
create or replace function public.modificar_garzon(
  p_garzon_id text,
  p_nombre text,
  p_rol text,
  p_actor_id text
) returns public.garzones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_antes public.garzones;
  v_garzon public.garzones;
begin
  if length(v_nombre) < 2 or length(v_nombre) > 40 then
    raise exception 'NOMBRE_INVALIDO';
  end if;
  if p_rol is null or p_rol not in ('ADMIN', 'GARZON') then
    raise exception 'ROL_INVALIDO';
  end if;

  select * into v_antes from public.garzones where id = p_garzon_id for update;
  if not found then
    raise exception 'GARZON_INVALIDO';
  end if;

  begin
    update public.garzones
       set nombre = v_nombre, rol = p_rol
     where id = p_garzon_id
     returning * into v_garzon;
  exception when unique_violation then
    raise exception 'NOMBRE_DUPLICADO';
  end;

  perform public.auditar(
    p_actor_id, 'MODIFICACION_USUARIO', 'garzones', v_garzon.id, null, null,
    jsonb_build_object('nombre', v_antes.nombre, 'rol', v_antes.rol),
    jsonb_build_object('nombre', v_garzon.nombre, 'rol', v_garzon.rol),
    null
  );
  return v_garzon;
end;
$$;

-- ---------------------------------------------------------------------
-- desactivar_garzon: baja lógica (el historial lo sigue referenciando).
-- ---------------------------------------------------------------------
create or replace function public.desactivar_garzon(
  p_garzon_id text,
  p_actor_id text
) returns public.garzones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_garzon public.garzones;
begin
  update public.garzones set activo = false where id = p_garzon_id
  returning * into v_garzon;
  if not found then
    raise exception 'GARZON_INVALIDO';
  end if;

  perform public.auditar(
    p_actor_id, 'DESACTIVACION_USUARIO', 'garzones', v_garzon.id, null, null,
    jsonb_build_object('activo', true),
    jsonb_build_object('activo', false, 'nombre', v_garzon.nombre),
    null
  );
  return v_garzon;
end;
$$;

-- ---------------------------------------------------------------------
-- registrar_sesion: LOGIN / LOGOUT del garzón en un dispositivo.
-- ---------------------------------------------------------------------
create or replace function public.registrar_sesion(
  p_garzon_id text,
  p_accion text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_accion not in ('LOGIN', 'LOGOUT') then
    raise exception 'ACCION_INVALIDA';
  end if;
  if not exists (select 1 from public.garzones where id = p_garzon_id) then
    raise exception 'GARZON_INVALIDO';
  end if;
  perform public.auditar(
    p_garzon_id, p_accion, 'garzones', p_garzon_id, null, null,
    null, null, null
  );
end;
$$;

-- ---------------------------------------------------------------------
-- abrir_atencion (reemplaza 0002): + auditoría APERTURA_MESA.
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

  perform public.auditar(
    p_garzon_id, 'APERTURA_MESA', 'atenciones', v_atencion.id,
    p_mesa_id, v_atencion.id,
    jsonb_build_object('estadoMesa', 'DISPONIBLE'),
    jsonb_build_object('estadoMesa', 'OCUPADA', 'atencion', v_atencion.numero),
    null
  );

  return jsonb_build_object(
    'atencion', to_jsonb(v_atencion),
    'mesa', to_jsonb(v_mesa)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- agregar_consumo (reemplaza 0002): incremento atómico + auditoría
-- AGREGAR_PRODUCTO (línea nueva) o MODIFICAR_CANTIDAD (antes → después).
-- ---------------------------------------------------------------------
create or replace function public.agregar_consumo(
  p_atencion_id text,
  p_producto_id text,
  p_producto_nombre text,
  p_precio_unitario integer,
  p_delta integer,
  p_garzon_id text
) returns public.consumos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atencion public.atenciones;
  v_consumo public.consumos;
  v_antes integer;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'DELTA_INVALIDO';
  end if;

  v_atencion := public.bloquear_atencion_abierta(p_atencion_id);

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
      p_garzon_id, 'AGREGAR_PRODUCTO', 'consumos', v_consumo.id,
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
      p_garzon_id, 'MODIFICAR_CANTIDAD', 'consumos', v_consumo.id,
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
-- eliminar_consumo (reemplaza 0002): + auditoría ELIMINAR_PRODUCTO.
-- ---------------------------------------------------------------------
create or replace function public.eliminar_consumo(
  p_atencion_id text,
  p_producto_id text,
  p_producto_nombre text,
  p_garzon_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atencion public.atenciones;
  v_consumo public.consumos;
begin
  v_atencion := public.bloquear_atencion_abierta(p_atencion_id);

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
      p_garzon_id, 'ELIMINAR_PRODUCTO', 'consumos', v_consumo.id,
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
-- fijar_menu (reemplaza 0002): + auditoría FIJAR_MENU.
-- ---------------------------------------------------------------------
create or replace function public.fijar_menu(
  p_atencion_id text,
  p_menu_id text,
  p_adultos integer,
  p_ninos_6_11 integer,
  p_ninos_3_5 integer,
  p_total_menu integer,
  p_garzon_id text
) returns public.atenciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes public.atenciones;
  v_atencion public.atenciones;
begin
  if p_total_menu is null or p_total_menu < 0 or p_total_menu > 100000000 then
    raise exception 'MONTO_INVALIDO';
  end if;

  v_antes := public.bloquear_atencion_abierta(p_atencion_id);

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
    p_garzon_id, 'FIJAR_MENU', 'atenciones', p_atencion_id,
    v_atencion.mesa_id, p_atencion_id,
    jsonb_build_object('menu', v_antes.menu_id, 'totalMenu', v_antes.total_menu),
    jsonb_build_object('menu', v_atencion.menu_id, 'totalMenu', v_atencion.total_menu),
    null
  );
  return v_atencion;
end;
$$;

-- ---------------------------------------------------------------------
-- agregar_abono (reemplaza 0002): + auditoría REGISTRAR_ABONO.
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
  v_atencion public.atenciones;
  v_abono public.abonos;
begin
  if p_monto is null or p_monto <= 0 or p_monto > 100000000 then
    raise exception 'MONTO_INVALIDO';
  end if;

  v_atencion := public.bloquear_atencion_abierta(p_atencion_id);

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

  perform public.auditar(
    p_garzon_id, 'REGISTRAR_ABONO', 'abonos', v_abono.id,
    v_atencion.mesa_id, p_atencion_id,
    null,
    jsonb_build_object('monto', p_monto, 'observacion', v_abono.observacion),
    v_abono.observacion
  );
  return v_abono;
end;
$$;

-- ---------------------------------------------------------------------
-- eliminar_abono (reemplaza 0002): + auditoría ELIMINAR_ABONO.
-- ---------------------------------------------------------------------
create or replace function public.eliminar_abono(
  p_abono_id text,
  p_garzon_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abono public.abonos;
  v_atencion public.atenciones;
begin
  select * into v_abono from public.abonos where id = p_abono_id;
  if not found then
    raise exception 'ABONO_NO_EXISTE';
  end if;

  v_atencion := public.bloquear_atencion_abierta(v_abono.atencion_id);

  delete from public.abonos where id = p_abono_id;

  update public.atenciones
     set total_abonos = coalesce((
           select sum(monto) from public.abonos
            where atencion_id = v_abono.atencion_id
         ), 0),
         actualizada_en = now()
   where id = v_abono.atencion_id;

  perform public.auditar(
    p_garzon_id, 'ELIMINAR_ABONO', 'abonos', p_abono_id,
    v_atencion.mesa_id, v_abono.atencion_id,
    jsonb_build_object('monto', v_abono.monto, 'observacion', v_abono.observacion),
    null,
    null
  );
end;
$$;

-- ---------------------------------------------------------------------
-- transferir_atencion: traspasa la mesa a otro garzón + auditoría
-- TRANSFERENCIA_MESA (antes → después).
-- ---------------------------------------------------------------------
create or replace function public.transferir_atencion(
  p_atencion_id text,
  p_garzon_nuevo_id text,
  p_actor_id text
) returns public.atenciones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atencion public.atenciones;
  v_anterior text;
  v_nuevo text;
begin
  if not exists (
    select 1 from public.garzones where id = p_garzon_nuevo_id and activo
  ) then
    raise exception 'GARZON_INVALIDO';
  end if;

  v_atencion := public.bloquear_atencion_abierta(p_atencion_id);
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
    p_actor_id, 'TRANSFERENCIA_MESA', 'atenciones', p_atencion_id,
    v_atencion.mesa_id, p_atencion_id,
    jsonb_build_object('garzon', coalesce(v_anterior, '—')),
    jsonb_build_object('garzon', coalesce(v_nuevo, '—')),
    null
  );
  return v_atencion;
end;
$$;

-- ---------------------------------------------------------------------
-- cerrar_atencion (reemplaza 0002): + auditoría CIERRE_MESA con total,
-- abonos y saldo congelados.
-- ---------------------------------------------------------------------
create or replace function public.cerrar_atencion(
  p_atencion_id text,
  p_garzon_id text
) returns jsonb
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

  perform public.auditar(
    p_garzon_id, 'CIERRE_MESA', 'atenciones', p_atencion_id,
    v_atencion.mesa_id, p_atencion_id,
    jsonb_build_object('estado', 'PENDIENTE'),
    jsonb_build_object(
      'estado', 'PAGADA',
      'total', v_atencion.total_menu + v_consumos,
      'abonos', v_abonos,
      'saldo', v_atencion.saldo_final
    ),
    null
  );

  return jsonb_build_object(
    'atencion', to_jsonb(v_atencion),
    'mesa', to_jsonb(v_mesa)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- reabrir_atencion (reemplaza 0002): + auditoría REAPERTURA_MESA.
-- ---------------------------------------------------------------------
create or replace function public.reabrir_atencion(
  p_atencion_id text,
  p_garzon_id text
) returns jsonb
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

  perform public.auditar(
    p_garzon_id, 'REAPERTURA_MESA', 'atenciones', p_atencion_id,
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
-- registrar_precuenta: deja en auditoría la emisión de la precuenta PDF
-- con el total y saldo del momento.
-- ---------------------------------------------------------------------
create or replace function public.registrar_precuenta(
  p_atencion_id text,
  p_garzon_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atencion public.atenciones;
begin
  select * into v_atencion from public.atenciones where id = p_atencion_id;
  if not found then
    raise exception 'ATENCION_NO_EXISTE';
  end if;

  perform public.auditar(
    p_garzon_id, 'GENERAR_PRECUENTA', 'atenciones', p_atencion_id,
    v_atencion.mesa_id, p_atencion_id,
    null,
    jsonb_build_object(
      'total', v_atencion.total_menu + v_atencion.total_consumos,
      'abonos', v_atencion.total_abonos,
      'saldo', v_atencion.total_menu + v_atencion.total_consumos
               - v_atencion.total_abonos
    ),
    null
  );
end;
$$;

-- ----------------------- Permisos (roles Supabase) ---------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant select on public.auditoria to anon, authenticated;
    revoke insert, update, delete, truncate on public.auditoria
      from anon, authenticated;
    grant execute on function
      public.crear_garzon(text, text),
      public.modificar_garzon(text, text, text, text),
      public.desactivar_garzon(text, text),
      public.registrar_sesion(text, text),
      public.abrir_atencion(text, text),
      public.agregar_consumo(text, text, text, integer, integer, text),
      public.eliminar_consumo(text, text, text, text),
      public.fijar_menu(text, text, integer, integer, integer, integer, text),
      public.agregar_abono(text, integer, text, text),
      public.eliminar_abono(text, text),
      public.transferir_atencion(text, text, text),
      public.cerrar_atencion(text, text),
      public.reabrir_atencion(text, text),
      public.registrar_precuenta(text, text)
    to anon, authenticated;
  end if;
end;
$$;
