# Porto Alegre — Consumo de mesas

> **App móvil (PWA) para garzones de un restobar brasileño**: mesas
> permanentes, una **atención** por cada ocupación (consumos + abonos +
> saldo pendiente), historial ilimitado de ventas y **sincronización en
> tiempo real hasta para 25 garzones** (Supabase Realtime), con modo
> claro/oscuro e identidad visual Brasil (verde, amarillo y azul marino).

Vive en `/porto-alegre`, **apartada de MESALISTA** (la app de reservas en la
raíz del repositorio), y se instala en cualquier celular o tablet como una
app normal.

## 1. Modelo operacional

Las **mesas son entidades permanentes** del restaurante: las 100 mesas
numeradas existen siempre en la base de datos, **nunca se eliminan ni se
recrean** — la Mesa 12 siempre será la Mesa 12 — y solo alternan entre
`DISPONIBLE` y `OCUPADA`.

Cada vez que llega un cliente se crea una **atención** (cuenta) asociada a
la mesa y al garzón que atiende; consumos y abonos se registran **en la
atención**, nunca en la mesa:

```
Cliente llega   → abrir_atencion(mesa 12, Juan Pérez)
                    Mesa 12: OCUPADA · Atención #145: PENDIENTE
Durante         → consumos · abonos · saldo pendiente (total − abonado)
Cliente paga    → cerrar_atencion(#145)
                    Atención #145: PAGADA (totales congelados → historial)
                    Mesa 12: DISPONIBLE (intacta, lista para reutilizarse)
```

Esto da **historial ilimitado** (miles de atenciones), reportes precisos y
mesas reutilizables infinitamente sin perder información. **Toda consulta
histórica sale de `atenciones`/`consumos`/`abonos`**, nunca del estado
actual de las mesas: las mesas solo representan la operación presente.

## 2. Arquitectura

**SPA (Vite + React 18 + TypeScript + Tailwind) instalable como PWA**, con
dos modos de operación detrás del mismo estado global:

```
UI (pantallas + componentes)
        │ acciones (API del contexto)
Estado global: Context + useReducer ── optimistic updates
        │                                    │
        │ persistencia/caché                 │ confirmación
db/almacen.ts (localStorage)        sync/supabase.ts
                                      ├─ RPCs transaccionales (escrituras)
                                      ├─ Realtime (cambios de todos los garzones)
                                      └─ revalidación de estado al reconectar
```

- **Modo compartido** (con `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`):
  la fuente de verdad es Postgres en Supabase. Los consumos y el menú se
  aplican al instante (optimistic update) y se confirman con una RPC;
  **abrir/cerrar/reabrir atenciones, abonos y garzones esperan la
  confirmación del servidor** (operaciones con bloqueo lógico). La carga
  inicial trae mesas + garzones + atenciones abiertas; el historial se
  consulta bajo demanda (puede crecer sin límite).
- **Modo local** (sin esas variables): un solo dispositivo con localStorage
  —historial incluido—, útil para desarrollo y demos. La interfaz indica el
  modo en todo momento (pill *Sincronizado / Sin conexión / Modo local*).

## 3. Concurrencia y consistencia (hasta 25 garzones)

Las tablas **solo aceptan lecturas** desde la app (RLS sin políticas de
escritura); **toda escritura pasa por funciones SQL transaccionales**
(`security definer`) definidas en
[`supabase/migrations/0002_atenciones.sql`](supabase/migrations/0002_atenciones.sql):

| Requisito | Mecanismo |
|---|---|
| Una sola atención abierta por mesa | Índice `UNIQUE` parcial sobre `atenciones(mesa_id) WHERE estado='PENDIENTE'` + `abrir_atencion` con compare-and-set: si dos garzones abren a la vez, uno gana y el otro recibe `MESA_OCUPADA` |
| Sin registros duplicados | `UNIQUE (atencion_id, producto_id)` + upsert: una línea por producto por atención |
| Sin pérdida de información (Caso 1) | `agregar_consumo` hace **incremento atómico** (`cantidad = cantidad + delta`): las operaciones simultáneas conmutan y nunca se pisan |
| Bloqueo lógico al cobrar (Caso 2) | `cerrar_atencion` es **compare-and-set** (`FOR UPDATE` + validación de estado): el segundo garzón recibe `ATENCION_YA_CERRADA`; al ganar, congela totales y libera la mesa en la misma transacción |
| Abonos consistentes | Cada abono bloquea la fila de la atención, valida `PENDIENTE` y actualiza `total_abonos` en la misma transacción |
| Sin deadlocks | Orden de bloqueo único en todas las funciones: **mesa → atención** |
| Historial intocable | Las atenciones `PAGADAS` solo se pueden leer (las funciones rechazan toda mutación con `ATENCION_PAGADA`); `reabrir_atencion` solo corrige la **última** cuenta de la mesa y solo si sigue libre |
| Optimistic updates + revalidación | La UI aplica consumos al instante; si la RPC es rechazada se avisa y se **revalida** esa atención contra la base; además se recarga todo al (re)conectar |
| Sincronización instantánea | Realtime publica `mesas`, `atenciones`, `consumos`, `abonos` y `garzones`; cada evento se aplica como estado autoritativo en todos los dispositivos |

Verificado contra Postgres real: 20 rondas de **doble apertura** y 20 de
**doble cierre** simultáneos terminaron siempre con exactamente un ganador;
30 incrementos en paralelo + 1 producto concurrente quedaron en
`cantidad=30` y 2 filas; 10 abonos paralelos sumaron exacto; y el rol de la
app no puede hacer `UPDATE`/`DELETE` directo (RLS).

> Si se corta la conexión en modo compartido, la app pasa a **solo lectura**
> (pill roja *Sin conexión*) para impedir divergencias, y al volver la señal
> el canal se reconecta y revalida todo el estado.

## 3b. Auditoría completa e inalterable

Tabla `auditoria`
([`0003_auditoria.sql`](supabase/migrations/0003_auditoria.sql)) con
**quién** (usuario + nombre y rol congelados al momento de la acción),
**qué** (acción/entidad), **dónde** (mesa/atención), **estado anterior y
nuevo** (jsonb) y fecha exacta:

- **Inalterable de verdad**: la app solo puede leer (RLS + revocación de
  INSERT/UPDATE/DELETE) y triggers `before update/delete/truncate`
  rechazan cambios **incluso para las funciones del sistema**: los
  registros nunca se modifican ni se eliminan.
- **Registro automático**: cada función RPC escribe su registro dentro de
  la misma transacción (sin triggers genéricos: cada acción guarda su
  semántica). Acciones cubiertas: `APERTURA_MESA`, `AGREGAR_PRODUCTO`,
  `ELIMINAR_PRODUCTO`, `MODIFICAR_CANTIDAD` (antes → después),
  `FIJAR_MENU`, `REGISTRAR_ABONO`, `ELIMINAR_ABONO`,
  `TRANSFERENCIA_MESA` (garzón anterior → nuevo), `CIERRE_MESA` (total,
  abonos y saldo), `REAPERTURA_MESA`, `GENERAR_PRECUENTA`, `LOGIN`,
  `LOGOUT`, `CREACION_USUARIO`, `MODIFICACION_USUARIO` y
  `DESACTIVACION_USUARIO`.
- **Pantalla de auditoría** con filtros (fecha, usuario, mesa, tipo de
  acción) y búsqueda (nombre / número de mesa). El **ADMIN** (rol en
  `garzones`) ve todo; un **garzón** solo sus acciones y las de sus
  propias mesas.
- **Transferencia de mesa**: una atención abierta puede traspasarse a
  otro garzón (`transferir_atencion`), con auditoría antes/después.
- En **modo local** la auditoría se replica en localStorage (append-only,
  tope de 2.000 registros).

## 3c. Autenticación por mesero (Supabase Auth)

En modo compartido **cada mesero trabaja con su propia sesión**:

- **Registro** con nombre completo, correo y contraseña (teléfono
  opcional). Un trigger crea el perfil en `garzones` con **rol GARZON**
  por defecto y lo audita (`REGISTRO_USUARIO`). Si existe un perfil sin
  cuenta con el mismo nombre (equipo seed), el registro **lo reclama**
  conservando rol e historial.
- **Login / logout** con correo y contraseña, sesión **persistida** en el
  dispositivo y renovada sola; `INICIO_SESION` y `CIERRE_SESION` quedan
  en la auditoría. **Recuperación de contraseña** por correo incluida.
- **Sesiones separadas de verdad**: la identidad de TODA escritura sale
  de `auth.uid()` **dentro de las funciones SQL** — el cliente ya no
  puede actuar a nombre de otro; cada atención, consumo y abono queda
  asociado al usuario autenticado.
- **Protección de rutas**: sin sesión solo se ve el acceso. Un usuario
  **desactivado** no puede operar ni leer datos (RLS lo deja fuera) y ve
  una pantalla de cuenta desactivada.
- **RLS**: las tablas solo se leen con sesión de un usuario **activo**
  (`es_usuario_activo()`); `anon` no lee nada. Solo **ADMIN** puede
  crear/modificar/desactivar usuarios (validado en el servidor).
- El **garzón** ve sus mesas con el filtro *“Mis mesas”*; el **ADMIN**
  ve el panel general y toda la auditoría.

> **Bootstrap del primer ADMIN** (una vez): regístrate en la app y luego
> ejecuta en el SQL Editor
> `update garzones set rol='ADMIN' where email='tu@correo.cl';`
> — o regístrate con el nombre exacto `Administración` para reclamar el
> perfil ADMIN seed. En **modo local** (sin Supabase) no hay cuentas: se
> elige el garzón en el dispositivo, como hasta ahora.

## 3d. Precuenta PDF

Desde cualquier mesa activa, **Generar precuenta** produce un PDF
profesional formato ticket 80 mm con la identidad Porto Alegre
(encabezado verde Brasil, logo, acento amarillo): fecha/hora, mesa,
garzón responsable, detalle de consumo, menú buffet, **resumen por
categorías**, resumen financiero con abonos y **saldo pendiente**
destacado, y pie *"Gracias por preferir Porto Alegre"*. Se puede
**descargar, compartir** (hoja nativa del teléfono) **o imprimir**, y
cada emisión queda en la auditoría (`GENERAR_PRECUENTA`). jsPDF se carga
bajo demanda (code-splitting), así que el bundle principal no crece.

## 4. Estructura de carpetas

```
porto-alegre/
  index.html                  → shell + manifest + tema sin parpadeo
  vercel.json                 → despliegue en Vercel (SPA + service worker)
  supabase/migrations/
    0001_esquema.sql          → esquema histórico (modelo viejo)
    0002_atenciones.sql       → mesas permanentes, atenciones, consumos,
                                abonos, garzones, RLS, RPCs, seed, Realtime
    0003_auditoria.sql        → auditoría inalterable + roles + RPCs con
                                registro automático + transferencia
    0004_autenticacion.sql    → Supabase Auth: perfiles enlazados,
                                identidad desde auth.uid(), RLS solo
                                para usuarios activos
  public/
    manifest.webmanifest      → identidad de la app instalable
    sw.js                     → service worker (offline tras primera carga)
    icons/                    → íconos 192/512 + maskable (verde Brasil)
  src/
    main.tsx · App.tsx        → arranque, navegación, garzón, aviso global
    tipos.ts                  → Mesa, Atencion, Consumo, Abono, Garzon
    data/catalogo.ts          → seeder: carta completa (124 productos)
    data/menus.ts             → menús buffet (mismos valores que MESALISTA)
    db/almacen.ts             → localStorage (modo local + caché offline,
                                migra el esquema v1 sin perder cuentas)
    sync/supabase.ts          → cliente, mapeos, RPCs, historial y
                                auditoría bajo demanda
    estado/contexto.tsx       → reducer + optimistic updates + Realtime
    util/                     → dinero (CLP), búsqueda, fechas, tema,
                                auditoría (descripciones), precuenta (PDF)
    componentes/              → TarjetaMesa, Buscador, LineaConsumo,
                                SelectorMenu, SelectorGarzon (+ gestión de
                                usuarios ADMIN), SeccionAbonos,
                                ItemAtencion, Aviso, Conexion, BotonTema
    pantallas/                → PantallaAcceso (login/registro/recuperar),
                                PantallaMesas, PantallaMesa,
                                PantallaDesglose, PantallaHistorial,
                                PantallaAuditoria
```

## 5. Base de datos

**Supabase (Postgres)** — cinco tablas:

| Tabla | Contenido |
|---|---|
| `mesas` | Las 100 mesas permanentes: `numero`, `estado` (DISPONIBLE/OCUPADA), `atencion_actual_id`, `created_at` |
| `atenciones` | Una por ocupación: `numero` correlativo (#145), `mesa_id`, `garzon_id`, estado, fechas de apertura/cierre y totales congelados (`total_menu`, `total_consumos`, `total_abonos`, `saldo_final`) |
| `consumos` | Una fila por producto y atención: `cantidad`, `precio_unitario`, `subtotal` calculado |
| `abonos` | Pagos parciales: `monto`, `observacion`, `garzon_id`, fecha |
| `garzones` | Perfiles del negocio: nombre, `rol` ADMIN/GARZON, `email`, `telefono`, `activo` y enlace a la cuenta (`auth_user_id`) |
| `auditoria` | Registro inalterable de toda acción (solo INSERT desde las funciones; solo SELECT para la app) |

El catálogo de productos es un módulo estático del cliente (precios
capturados al agregar). En modo local, el mismo modelo se guarda versionado
en localStorage bajo `porto-alegre-mesas`.

### Configurar Supabase (una sola vez)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → pega y ejecuta (**Run**), en orden:
   [`0002_atenciones.sql`](supabase/migrations/0002_atenciones.sql),
   [`0003_auditoria.sql`](supabase/migrations/0003_auditoria.sql) y
   [`0004_autenticacion.sql`](supabase/migrations/0004_autenticacion.sql).
   Sirven igual para un proyecto nuevo o para actualizar el esquema
   viejo, y son idempotentes: re-ejecutarlos no borra historial ni
   auditoría.
3. **Authentication → URL Configuration** → en *Site URL* pon la URL de
   la app (la de Vercel), para que el enlace de recuperar contraseña
   vuelva a la app. (Opcional: en *Sign In / Up* puedes desactivar
   *Confirm email* para que el equipo entre sin paso de confirmación.)
4. **Project Settings → API keys** → copia la clave *Publishable*
   (`sb_publishable_…`) y, en **Project Settings → General**, la *Project
   URL* (`https://….supabase.co`).
5. Configura las variables (build):
   - Local: copia `.env.example` a `.env` y complétalas.
   - Vercel: agrégalas como *Environment Variables* del proyecto
     (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) y vuelve a desplegar.

> La clave publishable/anon es pública por diseño (viaja en el navegador);
> la protección real son **Supabase Auth + RLS + funciones**: sin sesión
> de un usuario activo no se lee ni se escribe nada, y la identidad de
> cada acción sale del token (no del cliente). Solo en modo local (sin
> Supabase) el garzón se elige por nombre en el dispositivo, estilo POS.

## 6. Pantallas y diseño

Identidad **restobar brasileño premium**: paleta Verde Brasil `#009739`
(principal), Amarillo Brasil desaturado (secundario) y **azul marino
elegante** de la bandera (apoyo y fondo del modo oscuro), sobre neutros
blanco/gris. **Light y Dark Mode completos** (botón en el header, recuerda
la preferencia y respeta la del sistema).

| Pantalla | Qué hace |
|---|---|
| **Mesas** | Las 100 mesas permanentes: verde = libre, amarillo = ocupada (con total y garzón), **azul = última mesa seleccionada**. Header con garzón de turno e Historial. |
| **Mesa** | Tres vistas: mesa **libre** (abrir atención + cuentas anteriores), **cuenta abierta** (buscador fijo, carta a un toque, consumos, **abonos con saldo pendiente**, **precuenta PDF**, **transferir mesa**, cobrar en dos toques) y **recibo** recién cobrado (reabrir / desglose). |
| **Desglose** | La cuenta completa de una atención (abierta o histórica): menú según personas, consumos `2 x Heineken = $7.600`, abonos y TOTAL con saldo. |
| **Historial** | Las atenciones pagadas de todas las mesas (más recientes primero) con resumen del día; cada una abre su desglose. |
| **Auditoría** | Registro inalterable con filtros por fecha/usuario/mesa/acción y búsqueda. ADMIN ve todo; el garzón, solo lo suyo. |

Botones de mínimo 48 px, tipografía contundente y layout de dos columnas en
tablets (carta junto a la cuenta), estilo POS moderno.

## 7. Menú buffet (igual que la app de reservas)

| Concepto | Precio |
|---|---|
| Buffet | $20.990 por adulto |
| Buffet + Aperitivo + Vino | $25.500 por adulto |
| Buffet + Aperitivo + Vino + Bebida | $27.700 por adulto |
| Buffet + Aperitivo + Vino + Bebida + Trago | $30.900 por adulto |
| Niños 6–11 años | $9.990 c/u |
| Niños 3–5 años | $4.990 c/u (menores de 3 no pagan) |

## 8. Ejecución

Requisitos: Node 20+ y pnpm 9+.

```bash
cd porto-alegre
pnpm install
cp .env.example .env   # opcional: credenciales de Supabase (modo compartido)
pnpm dev               # desarrollo → http://localhost:5173
pnpm build             # bundle de producción en dist/ (rápido: sin tsc)
pnpm check             # typecheck completo + build (para CI / antes de subir)
pnpm start             # sirve dist/ localmente
```

> `pnpm build` ya no ejecuta `tsc --noEmit`: los deploys en Vercel
> compilan en segundos y el typecheck queda en `pnpm check`/`pnpm
> typecheck` para correrlo en local o CI.

## 9. Instalar en el celular (PWA)

Con la app desplegada (HTTPS), abre la URL en el teléfono:

- **Android (Chrome)**: menú ⋮ → *Agregar a la pantalla principal* → *Instalar*.
- **iPhone (Safari)**: *Compartir* → *Agregar a pantalla de inicio*.

## 10. Desplegar en Vercel

1. En [vercel.com](https://vercel.com), **Add New… → Project** → importa
   `Mukriscell/reservas-restaurante`. (Si MESALISTA ya está en Vercel, este
   es un **segundo proyecto** sobre el mismo repositorio.)
2. **Root Directory** → *Edit* → selecciona `porto-alegre`. Vercel detecta
   Vite solo (build `pnpm build`, salida `dist/`); `vercel.json` ya trae el
   rewrite de SPA y el no-cache del service worker.
3. **Environment Variables** → agrega `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` (sin ellas queda en modo local, sin
   sincronización entre garzones).
4. **Deploy** → la URL `*.vercel.app` resultante es la que se abre e
   instala en los celulares.

Producción se publica desde la rama configurada en **Settings → Git →
Production Branch**; cada `git push` a esa rama re-despliega
automáticamente (las demás ramas generan previews).

## 11. Decisiones técnicas

- **Mesas permanentes + atenciones**: las mesas nunca se borran ni se
  resetean; "cuenta nueva" significa **abrir otra atención**, así el
  historial es ilimitado y los reportes no dependen del estado operativo.
- **Escrituras solo por RPC**: ninguna app cliente puede hacer `UPDATE`
  directo; los invariantes (una atención abierta por mesa, estados,
  cantidades, totales congelados) viven en la base y son imposibles de
  saltar desde un dispositivo.
- **Incrementos por delta en vez de "set cantidad"**: las operaciones de
  varios garzones conmutan; no existe el *lost update* clásico.
- **Apertura y cierre por compare-and-set, sin optimismo**: ocupar y cobrar
  son las operaciones de bloqueo lógico, así que esperan la confirmación
  del servidor (~1 viaje) y pierden con un mensaje claro si otro garzón
  ganó. Los totales del cierre se calculan con la fila bloqueada: son
  definitivos.
- **Totales mantenidos en la atención**: cada RPC actualiza
  `total_consumos`/`total_abonos` en la misma transacción; la grilla de
  100 mesas y el historial no necesitan sumar consumos fila a fila.
- **IDs deterministas** (`c-<atencion>-<producto>`): el optimistic update y
  la fila del servidor coinciden y la reconciliación es trivial.
- **Sin conexión ⇒ solo lectura** en modo compartido: preferimos bloquear
  un momento antes que inventar una cola offline que pueda divergir.
- **Sin dependencias extra**: estado con Context + useReducer, navegación
  por estado, avisos propios; `@supabase/supabase-js` es la única adición
  (exigida por el requisito) y `serve` para servir estáticos.
- **Paleta con escalas completas** (`verde`, `amarillo`, `azul` en Tailwind)
  y clases componibles (`tarjeta`, `btn`, `pill`) para mantener consistencia
  visual en ambos temas sin duplicar estilos.
