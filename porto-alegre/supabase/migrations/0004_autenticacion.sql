-- =====================================================================
-- Porto Alegre — Migración 0004: AUTENTICACIÓN POR MESERO (Supabase Auth)
--
-- REQUIERE haber ejecutado antes 0002 y 0003. Pegar COMPLETO en el SQL
-- Editor de Supabase y ejecutar (Run). Idempotente.
--
-- Modelo:
--  * auth.users (Supabase Auth) maneja la autenticación: registro con
--    correo + contraseña, login, logout y recuperación de contraseña.
--  * `garzones` es la tabla de PERFILES del negocio (id, nombre, email,
--    teléfono, rol, activo, created_at): cada usuario registrado queda
--    enlazado vía `auth_user_id`. Un trigger crea el perfil al
--    registrarse (rol GARZON por defecto) y lo deja en la auditoría
--    (REGISTRO_USUARIO).
--  * SESIONES SEPARADAS: la identidad de TODA escritura sale de
--    auth.uid() dentro de cada función; el cliente ya no puede actuar
--    a nombre de otro. Cada acción queda asociada al usuario autenticado.
--  * RLS: solo usuarios autenticados Y ACTIVOS pueden leer; un usuario
--    desactivado conserva su cuenta pero no puede operar ni ver datos.
--  * Solo ADMIN puede crear/modificar/desactivar usuarios.
--
-- Bootstrap del primer ADMIN (una sola vez, tras registrarte en la app):
--   update public.garzones set rol = 'ADMIN' where email = 'tu@correo.cl';
-- (O regístrate con el nombre EXACTO de un perfil sin enlazar — p. ej.
--  "Administración" — y heredas su rol al reclamarlo.)
-- =====================================================================

-- ------------------- Perfiles: columnas de cuenta ---------------------

alter table public.garzones
  add column if not exists auth_user_id uuid,
  add column if not exists email text,
  add column if not exists telefono text;

create unique index if not exists garzones_auth_user_unico
  on public.garzones (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists garzones_email_unico
  on public.garzones (lower(email))
  where email is not null;

-- --------------- Acciones nuevas de auditoría (constraint) ------------

alter table public.auditoria drop constraint if exists auditoria_accion_check;
alter table public.auditoria add constraint auditoria_accion_check
  check (accion in (
    'APERTURA_MESA', 'AGREGAR_PRODUCTO', 'ELIMINAR_PRODUCTO',
    'MODIFICAR_CANTIDAD', 'FIJAR_MENU', 'REGISTRAR_ABONO',
    'ELIMINAR_ABONO', 'TRANSFERENCIA_MESA', 'CIERRE_MESA',
    'REAPERTURA_MESA', 'GENERAR_PRECUENTA', 'LOGIN', 'LOGOUT',
    'CREACION_USUARIO', 'MODIFICACION_USUARIO', 'DESACTIVACION_USUARIO',
    'REGISTRO_USUARIO', 'INICIO_SESION', 'CIERRE_SESION'
  ));

-- ---------------------------------------------------------------------
-- actor_actual (interna): perfil del usuario autenticado. Es la ÚNICA
-- fuente de identidad de las escrituras (sesiones separadas de verdad).
-- ---------------------------------------------------------------------
create or replace function public.actor_actual()
returns public.garzones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_actor public.garzones;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'NO_AUTENTICADO';
  end if;
  select * into v_actor from public.garzones where auth_user_id = v_uid;
  if not found then
    raise exception 'NO_AUTENTICADO';
  end if;
  if not v_actor.activo then
    raise exception 'USUARIO_DESACTIVADO';
  end if;
  return v_actor;
end;
$$;

revoke execute on function public.actor_actual() from public;

-- ¿La sesión actual corresponde a un usuario activo? (para las RLS)
create or replace function public.es_usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.garzones
    where auth_user_id = auth.uid() and activo
  );
$$;

-- ---------------------------------------------------------------------
-- Alta automática de perfil al registrarse (Supabase Auth). Si existe
-- un perfil SIN ENLAZAR con el mismo nombre (equipo seed), se reclama
-- conservando su rol e historial; si no, se crea uno nuevo rol GARZON.
-- ---------------------------------------------------------------------
create or replace function public.crear_perfil_garzon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_telefono text;
  v_garzon public.garzones;
begin
  v_nombre := left(trim(coalesce(
    new.raw_user_meta_data ->> 'nombre_completo',
    split_part(coalesce(new.email, 'garzon'), '@', 1)
  )), 40);
  if length(v_nombre) < 2 then
    v_nombre := 'Garzón ' || left(new.id::text, 8);
  end if;
  v_telefono := nullif(trim(coalesce(new.raw_user_meta_data ->> 'telefono', '')), '');

  -- Reclamar un perfil sin cuenta con el mismo nombre (si existe).
  select * into v_garzon
    from public.garzones
   where lower(nombre) = lower(v_nombre) and auth_user_id is null
   for update;
  if found then
    update public.garzones
       set auth_user_id = new.id,
           email = new.email,
           telefono = coalesce(v_telefono, telefono),
           activo = true
     where id = v_garzon.id
     returning * into v_garzon;
  else
    begin
      insert into public.garzones (id, nombre, rol, email, telefono, auth_user_id)
      values ('g-' || new.id, v_nombre, 'GARZON', new.email, v_telefono, new.id)
      returning * into v_garzon;
    exception when unique_violation then
      -- Nombre tomado por otra cuenta: se distingue con el correo.
      insert into public.garzones (id, nombre, rol, email, telefono, auth_user_id)
      values (
        'g-' || new.id,
        left(v_nombre || ' (' || split_part(coalesce(new.email, new.id::text), '@', 1) || ')', 40),
        'GARZON', new.email, v_telefono, new.id
      )
      returning * into v_garzon;
    end;
  end if;

  perform public.auditar(
    v_garzon.id, 'REGISTRO_USUARIO', 'garzones', v_garzon.id, null, null,
    null,
    jsonb_build_object(
      'nombre', v_garzon.nombre,
      'email', v_garzon.email,
      'rol', v_garzon.rol
    ),
    null
  );
  return new;
end;
$$;

-- El trigger solo existe en Supabase (donde existe auth.users).
do $$
begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists garzones_alta_automatica on auth.users;
    create trigger garzones_alta_automatica
      after insert on auth.users
      for each row execute function public.crear_perfil_garzon();
  end if;
end;
$$;

-- ------------- Limpieza de firmas reemplazadas del 0003 ----------------
-- (la identidad ahora sale de auth.uid(): desaparecen p_garzon_id /
-- p_actor_id de todas las funciones)
drop function if exists public.crear_garzon(text, text);
drop function if exists public.modificar_garzon(text, text, text, text);
drop function if exists public.desactivar_garzon(text, text);
drop function if exists public.registrar_sesion(text, text);
drop function if exists public.abrir_atencion(text, text);
drop function if exists public.agregar_consumo(text, text, text, integer, integer, text);
drop function if exists public.eliminar_consumo(text, text, text, text);
drop function if exists public.fijar_menu(text, text, integer, integer, integer, integer, text);
drop function if exists public.agregar_abono(text, integer, text, text);
drop function if exists public.eliminar_abono(text, text);
drop function if exists public.transferir_atencion(text, text, text);
drop function if exists public.cerrar_atencion(text, text);
drop function if exists public.reabrir_atencion(text, text);
drop function if exists public.registrar_precuenta(text, text);

-- ---------------------------------------------------------------------
-- registrar_sesion: INICIO_SESION / CIERRE_SESION del usuario actual.
-- ---------------------------------------------------------------------
create or replace function public.registrar_sesion(p_accion text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
begin
  if p_accion not in ('INICIO_SESION', 'CIERRE_SESION') then
    raise exception 'ACCION_INVALIDA';
  end if;
  v_actor := public.actor_actual();
  perform public.auditar(
    v_actor.id, p_accion, 'garzones', v_actor.id, null, null,
    null, jsonb_build_object('email', v_actor.email), null
  );
end;
$$;

-- ---------------------------------------------------------------------
-- crear_garzon: alta MANUAL de un perfil sin cuenta (solo ADMIN); sirve
-- para personal que aún no se registra (p. ej. destino de transferencias).
-- ---------------------------------------------------------------------
create or replace function public.crear_garzon(p_nombre text)
returns public.garzones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_garzon public.garzones;
begin
  v_actor := public.actor_actual();
  if v_actor.rol <> 'ADMIN' then
    raise exception 'SOLO_ADMIN';
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 40 then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  select * into v_garzon
    from public.garzones where lower(nombre) = lower(v_nombre);
  if found then
    if not v_garzon.activo then
      update public.garzones set activo = true where id = v_garzon.id
      returning * into v_garzon;
      perform public.auditar(
        v_actor.id, 'MODIFICACION_USUARIO', 'garzones', v_garzon.id,
        null, null,
        jsonb_build_object('activo', false),
        jsonb_build_object('activo', true, 'nombre', v_garzon.nombre),
        'Usuario reactivado'
      );
    end if;
    return v_garzon;
  end if;

  insert into public.garzones (id, nombre)
  values ('g-' || gen_random_uuid()::text, v_nombre)
  returning * into v_garzon;

  perform public.auditar(
    v_actor.id, 'CREACION_USUARIO', 'garzones', v_garzon.id, null, null,
    null, jsonb_build_object('nombre', v_garzon.nombre, 'rol', v_garzon.rol),
    null
  );
  return v_garzon;
end;
$$;

-- ---------------------------------------------------------------------
-- modificar_garzon / desactivar_garzon: solo ADMIN.
-- ---------------------------------------------------------------------
create or replace function public.modificar_garzon(
  p_garzon_id text,
  p_nombre text,
  p_rol text
) returns public.garzones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_antes public.garzones;
  v_garzon public.garzones;
begin
  v_actor := public.actor_actual();
  if v_actor.rol <> 'ADMIN' then
    raise exception 'SOLO_ADMIN';
  end if;
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
    v_actor.id, 'MODIFICACION_USUARIO', 'garzones', v_garzon.id, null, null,
    jsonb_build_object('nombre', v_antes.nombre, 'rol', v_antes.rol),
    jsonb_build_object('nombre', v_garzon.nombre, 'rol', v_garzon.rol),
    null
  );
  return v_garzon;
end;
$$;

create or replace function public.desactivar_garzon(p_garzon_id text)
returns public.garzones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_garzon public.garzones;
begin
  v_actor := public.actor_actual();
  if v_actor.rol <> 'ADMIN' then
    raise exception 'SOLO_ADMIN';
  end if;

  update public.garzones set activo = false where id = p_garzon_id
  returning * into v_garzon;
  if not found then
    raise exception 'GARZON_INVALIDO';
  end if;

  perform public.auditar(
    v_actor.id, 'DESACTIVACION_USUARIO', 'garzones', v_garzon.id, null, null,
    jsonb_build_object('activo', true),
    jsonb_build_object('activo', false, 'nombre', v_garzon.nombre),
    null
  );
  return v_garzon;
end;
$$;

-- ---------------------------------------------------------------------
-- abrir_atencion: la atención queda a nombre del usuario autenticado.
-- ---------------------------------------------------------------------
create or replace function public.abrir_atencion(p_mesa_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_mesa public.mesas;
  v_atencion public.atenciones;
  v_numero bigint;
begin
  v_actor := public.actor_actual();

  select * into v_mesa from public.mesas where id = p_mesa_id for update;
  if not found then
    raise exception 'MESA_NO_EXISTE';
  end if;
  if v_mesa.estado = 'OCUPADA' then
    raise exception 'MESA_OCUPADA';
  end if;

  v_numero := nextval('public.atenciones_numero');
  insert into public.atenciones (id, numero, mesa_id, garzon_id)
  values ('a-' || v_numero, v_numero, p_mesa_id, v_actor.id)
  returning * into v_atencion;

  update public.mesas
     set estado = 'OCUPADA',
         atencion_actual_id = v_atencion.id,
         actualizada_en = now()
   where id = p_mesa_id
   returning * into v_mesa;

  perform public.auditar(
    v_actor.id, 'APERTURA_MESA', 'atenciones', v_atencion.id,
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
-- agregar_consumo / eliminar_consumo / fijar_menu (actor desde la sesión).
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
-- agregar_abono / eliminar_abono.
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
-- transferir_atencion / cerrar_atencion / reabrir_atencion /
-- registrar_precuenta (actor desde la sesión).
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

create or replace function public.cerrar_atencion(p_atencion_id text)
returns jsonb
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
begin
  v_actor := public.actor_actual();

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
    v_actor.id, 'CIERRE_MESA', 'atenciones', p_atencion_id,
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

create or replace function public.registrar_precuenta(p_atencion_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.garzones;
  v_atencion public.atenciones;
begin
  v_actor := public.actor_actual();

  select * into v_atencion from public.atenciones where id = p_atencion_id;
  if not found then
    raise exception 'ATENCION_NO_EXISTE';
  end if;

  perform public.auditar(
    v_actor.id, 'GENERAR_PRECUENTA', 'atenciones', p_atencion_id,
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

-- ---------------------------------------------------------------------
-- RLS: solo usuarios AUTENTICADOS y ACTIVOS leen los datos. El perfil
-- propio siempre es visible (para detectar una cuenta desactivada).
-- ---------------------------------------------------------------------
drop policy if exists garzones_lectura on public.garzones;
create policy garzones_lectura on public.garzones
  for select to authenticated
  using (public.es_usuario_activo() or auth_user_id = auth.uid());

drop policy if exists mesas_lectura on public.mesas;
create policy mesas_lectura on public.mesas
  for select to authenticated using (public.es_usuario_activo());

drop policy if exists atenciones_lectura on public.atenciones;
create policy atenciones_lectura on public.atenciones
  for select to authenticated using (public.es_usuario_activo());

drop policy if exists consumos_lectura on public.consumos;
create policy consumos_lectura on public.consumos
  for select to authenticated using (public.es_usuario_activo());

drop policy if exists abonos_lectura on public.abonos;
create policy abonos_lectura on public.abonos
  for select to authenticated using (public.es_usuario_activo());

drop policy if exists auditoria_lectura on public.auditoria;
create policy auditoria_lectura on public.auditoria
  for select to authenticated using (public.es_usuario_activo());

-- ----------------------- Permisos (roles Supabase) ---------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    -- Sin sesión no se lee NADA (la app exige login).
    revoke select on
      public.garzones, public.mesas, public.atenciones,
      public.consumos, public.abonos, public.auditoria
    from anon;
    revoke execute on all functions in schema public from anon;

    grant select on
      public.garzones, public.mesas, public.atenciones,
      public.consumos, public.abonos, public.auditoria
    to authenticated;
    grant execute on function
      public.es_usuario_activo(),
      public.registrar_sesion(text),
      public.crear_garzon(text),
      public.modificar_garzon(text, text, text),
      public.desactivar_garzon(text),
      public.abrir_atencion(text),
      public.agregar_consumo(text, text, text, integer, integer),
      public.eliminar_consumo(text, text, text),
      public.fijar_menu(text, text, integer, integer, integer, integer),
      public.agregar_abono(text, integer, text),
      public.eliminar_abono(text),
      public.transferir_atencion(text, text),
      public.cerrar_atencion(text),
      public.reabrir_atencion(text),
      public.registrar_precuenta(text)
    to authenticated;
  end if;
end;
$$;
