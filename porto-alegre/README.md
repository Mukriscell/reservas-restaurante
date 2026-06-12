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

## 4. Estructura de carpetas

```
porto-alegre/
  index.html                  → shell + manifest + tema sin parpadeo
  vercel.json                 → despliegue en Vercel (SPA + service worker)
  supabase/migrations/
    0001_esquema.sql          → esquema histórico (modelo viejo)
    0002_atenciones.sql       → ESQUEMA VIGENTE: mesas permanentes,
                                atenciones, consumos, abonos, garzones,
                                RLS, RPCs transaccionales, seed, Realtime
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
    sync/supabase.ts          → cliente, mapeos, RPCs, historial bajo demanda
    estado/contexto.tsx       → reducer + optimistic updates + Realtime
    util/                     → dinero (CLP), búsqueda, fechas, tema
    componentes/              → TarjetaMesa, Buscador, LineaConsumo,
                                SelectorMenu, SelectorGarzon, SeccionAbonos,
                                ItemAtencion, Aviso, Conexion, BotonTema
    pantallas/                → PantallaMesas, PantallaMesa,
                                PantallaDesglose, PantallaHistorial
```

## 5. Base de datos

**Supabase (Postgres)** — cinco tablas:

| Tabla | Contenido |
|---|---|
| `mesas` | Las 100 mesas permanentes: `numero`, `estado` (DISPONIBLE/OCUPADA), `atencion_actual_id`, `created_at` |
| `atenciones` | Una por ocupación: `numero` correlativo (#145), `mesa_id`, `garzon_id`, estado, fechas de apertura/cierre y totales congelados (`total_menu`, `total_consumos`, `total_abonos`, `saldo_final`) |
| `consumos` | Una fila por producto y atención: `cantidad`, `precio_unitario`, `subtotal` calculado |
| `abonos` | Pagos parciales: `monto`, `observacion`, `garzon_id`, fecha |
| `garzones` | Quién atiende (seed de 10, se agregan más desde la app) |

El catálogo de productos es un módulo estático del cliente (precios
capturados al agregar). En modo local, el mismo modelo se guarda versionado
en localStorage bajo `porto-alegre-mesas`.

### Configurar Supabase (una sola vez)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → pega completo
   [`supabase/migrations/0002_atenciones.sql`](supabase/migrations/0002_atenciones.sql)
   y ejecuta (**Run**). Sirve igual para un proyecto nuevo o para
   actualizar el esquema viejo (0001), y es idempotente: re-ejecutarlo no
   borra el historial.
3. **Project Settings → API keys** → copia la clave *Publishable*
   (`sb_publishable_…`) y, en **Project Settings → General**, la *Project
   URL* (`https://….supabase.co`).
4. Configura las variables (build):
   - Local: copia `.env.example` a `.env` y complétalas.
   - Vercel: agrégalas como *Environment Variables* del proyecto
     (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) y vuelve a desplegar.

> La clave publishable/anon es pública por diseño (viaja en el navegador);
> la protección real son las políticas RLS + funciones del esquema. Los
> garzones se eligen por nombre en cada dispositivo (sin contraseña, como
> un POS de barra): cada atención y abono queda registrado a su nombre.

## 6. Pantallas y diseño

Identidad **restobar brasileño premium**: paleta Verde Brasil `#009739`
(principal), Amarillo Brasil desaturado (secundario) y **azul marino
elegante** de la bandera (apoyo y fondo del modo oscuro), sobre neutros
blanco/gris. **Light y Dark Mode completos** (botón en el header, recuerda
la preferencia y respeta la del sistema).

| Pantalla | Qué hace |
|---|---|
| **Mesas** | Las 100 mesas permanentes: verde = libre, amarillo = ocupada (con total y garzón), **azul = última mesa seleccionada**. Header con garzón de turno e Historial. |
| **Mesa** | Tres vistas: mesa **libre** (abrir atención + cuentas anteriores), **cuenta abierta** (buscador fijo, carta a un toque, consumos, **abonos con saldo pendiente**, cobrar en dos toques) y **recibo** recién cobrado (reabrir / desglose). |
| **Desglose** | La cuenta completa de una atención (abierta o histórica): menú según personas, consumos `2 x Heineken = $7.600`, abonos y TOTAL con saldo. |
| **Historial** | Las atenciones pagadas de todas las mesas (más recientes primero) con resumen del día; cada una abre su desglose. |

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
pnpm build             # typecheck + bundle de producción en dist/
pnpm start             # sirve dist/ localmente
```

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
