# Porto Alegre — Consumo de mesas

> **App móvil (PWA) para garzones de un restobar brasileño**: registro de
> consumo de bebestibles por mesa con **sincronización en tiempo real entre
> 3 y 15 garzones** (Supabase Realtime), menú buffet, totales automáticos,
> modo claro/oscuro e identidad visual Brasil (verde, amarillo y azul marino).

Vive en `/porto-alegre`, **apartada de MESALISTA** (la app de reservas en la
raíz del repositorio), y se instala en cualquier celular o tablet como una
app normal.

## 1. Arquitectura

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
  la fuente de verdad es Postgres en Supabase. Cada mutación se aplica al
  instante en pantalla (optimistic update) y se confirma con una función
  RPC transaccional; los cambios de los demás garzones llegan por el canal
  Realtime y pisan el estado local con los valores autoritativos.
- **Modo local** (sin esas variables): un solo dispositivo con localStorage,
  útil para desarrollo y demos. La interfaz indica el modo en todo momento
  (pill *Sincronizado / Sin conexión / Modo local*).

## 2. Concurrencia y consistencia (3–15 garzones)

Las tablas **solo aceptan lecturas** desde la app (RLS sin políticas de
escritura); **toda escritura pasa por funciones SQL transaccionales**
(`security definer`) definidas en
[`supabase/migrations/0001_esquema.sql`](supabase/migrations/0001_esquema.sql):

| Requisito | Mecanismo |
|---|---|
| Sin registros duplicados | `UNIQUE (mesa_id, producto_id)` + upsert: una línea por producto por mesa |
| Sin pérdida de información (Caso 1) | `agregar_consumo` hace **incremento atómico** (`cantidad = cantidad + delta`): las operaciones simultáneas conmutan y nunca se pisan |
| Sin sobrescrituras accidentales | Cada RPC bloquea la fila de la mesa (`SELECT … FOR UPDATE`) y valida su estado dentro de la transacción |
| Bloqueo lógico al cerrar (Caso 2) | `cerrar_mesa` es un **compare-and-set**: `UPDATE … WHERE estado='PENDIENTE'`; el segundo garzón recibe `MESA_YA_CERRADA` y la app muestra *"La mesa ya fue cerrada por otro garzón"* |
| Consistencia transaccional | `nueva_cuenta` borra consumos y resetea la mesa en una sola transacción; agregar a una mesa que otro garzón está cerrando espera el lock y es rechazado con `MESA_PAGADA` |
| Optimistic updates + revalidación | La UI aplica el cambio al instante; si la RPC es rechazada se muestra el aviso y se **revalida** esa mesa contra la base; además se recarga todo el estado en cada (re)conexión del canal |
| Sincronización instantánea | Realtime publica `mesas` y `consumos`; cada evento se aplica como estado autoritativo en todos los dispositivos |

Verificado contra Postgres real: 30 incrementos en paralelo + 1 producto
concurrente terminan exactamente en `heineken: 30` y `mojito: 1` (2 filas), y
en 20 rondas de doble cierre simultáneo siempre ganó exactamente uno.

> Si se corta la conexión en modo compartido, la app pasa a **solo lectura**
> (pill roja *Sin conexión*) para impedir divergencias, y al volver la señal
> el canal se reconecta y revalida todo el estado.

## 3. Estructura de carpetas

```
porto-alegre/
  index.html                  → shell + manifest + tema sin parpadeo
  vercel.json                 → despliegue en Vercel (SPA + service worker)
  supabase/migrations/
    0001_esquema.sql          → tablas, RLS, RPCs transaccionales, seed, Realtime
  public/
    manifest.webmanifest      → identidad de la app instalable
    sw.js                     → service worker (offline tras primera carga)
    icons/                    → íconos 192/512 + maskable (verde Brasil)
  src/
    main.tsx · App.tsx        → arranque, navegación, aviso global
    tipos.ts                  → Mesa, Producto, ConsumoMesa, MenuMesa
    data/catalogo.ts          → seeder: carta completa (124 productos)
    data/menus.ts             → menús buffet (mismos valores que MESALISTA)
    db/almacen.ts             → localStorage (modo local + caché offline)
    sync/supabase.ts          → cliente, mapeos, RPCs y traducción de errores
    estado/contexto.tsx       → reducer + optimistic updates + Realtime
    util/                     → dinero (CLP), búsqueda, fechas, tema
    componentes/              → TarjetaMesa, Buscador, LineaConsumo,
                                SelectorMenu, Aviso, Conexion, BotonTema
    pantallas/                → PantallaMesas, PantallaMesa, PantallaDesglose
```

## 4. Base de datos

**Supabase (Postgres)** — tablas `mesas` (100 filas seed, estado
PENDIENTE/PAGADA, fechas, menú buffet) y `consumos` (una fila por producto y
mesa con `cantidad`, `precio_unitario` y `subtotal` calculado). El catálogo
de productos es un módulo estático del cliente (precios capturados al
agregar). En modo local, el mismo estado se guarda versionado en
localStorage bajo `porto-alegre-mesas`.

### Configurar Supabase (una sola vez)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor → New query** → pega completo
   [`supabase/migrations/0001_esquema.sql`](supabase/migrations/0001_esquema.sql)
   y ejecuta (**Run**). Crea tablas, seguridad, funciones, seed y Realtime.
3. **Project Settings → API** → copia *Project URL* y la clave *anon public*.
4. Configura las variables (build):
   - Local: copia `.env.example` a `.env` y complétalas.
   - Vercel: agrégalas como *Environment Variables* del proyecto
     (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) y vuelve a desplegar.

> La clave `anon` es pública por diseño (viaja en el navegador); la
> protección real son las políticas RLS + funciones del esquema. No hay
> login de garzones porque no fue solicitado: cualquiera con la URL puede
> operar, igual que un POS de barra.

## 5. Pantallas y diseño

Identidad **restobar brasileño premium**: paleta Verde Brasil `#009739`
(principal), Amarillo Brasil desaturado (secundario) y **azul marino
elegante** de la bandera (apoyo y fondo del modo oscuro), sobre neutros
blanco/gris. **Light y Dark Mode completos** (botón en el header, recuerda
la preferencia y respeta la del sistema).

| Pantalla | Qué hace |
|---|---|
| **Mesas** | Las 100 mesas: amarillo suave = pendiente, verde = pagada, **azul = última mesa seleccionada**. Tarjetas redondeadas con sombra suave y total visible. |
| **Mesa** | Flujo de garzón en segundos: el **buscador queda fijo en el header** y la carta a un toque de distancia; total gigante siempre visible; *Cobrar mesa* en dos toques. Mesa pagada queda bloqueada con candado, *Reabrir* y *Nueva cuenta*. |
| **Desglose** | La cuenta completa: menú según personas/niños y menú elegido por los adultos, consumos `2 x Heineken = $7.600`, subtotales y TOTAL destacado. |

Botones de mínimo 48 px, tipografía contundente y layout de dos columnas en
tablets (carta junto a la cuenta), estilo POS moderno.

## 6. Menú buffet (igual que la app de reservas)

| Concepto | Precio |
|---|---|
| Buffet | $20.990 por adulto |
| Buffet + Aperitivo + Vino | $25.500 por adulto |
| Buffet + Aperitivo + Vino + Bebida | $27.700 por adulto |
| Buffet + Aperitivo + Vino + Bebida + Trago | $30.900 por adulto |
| Niños 6–11 años | $9.990 c/u |
| Niños 3–5 años | $4.990 c/u (menores de 3 no pagan) |

## 7. Ejecución

Requisitos: Node 20+ y pnpm 9+.

```bash
cd porto-alegre
pnpm install
cp .env.example .env   # opcional: credenciales de Supabase (modo compartido)
pnpm dev               # desarrollo → http://localhost:5173
pnpm build             # typecheck + bundle de producción en dist/
pnpm start             # sirve dist/ localmente
```

## 8. Instalar en el celular (PWA)

Con la app desplegada (HTTPS), abre la URL en el teléfono:

- **Android (Chrome)**: menú ⋮ → *Agregar a la pantalla principal* → *Instalar*.
- **iPhone (Safari)**: *Compartir* → *Agregar a pantalla de inicio*.

## 9. Desplegar en Vercel

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

## 10. Decisiones técnicas

- **Escrituras solo por RPC**: ninguna app cliente puede hacer `UPDATE`
  directo; los invariantes (estados, cantidades, unicidad) viven en la base
  y son imposibles de saltar desde un dispositivo.
- **Incrementos por delta en vez de "set cantidad"**: las operaciones de
  varios garzones conmutan; no existe el *lost update* clásico.
- **Cierre por compare-and-set, sin optimismo**: cobrar es la operación de
  bloqueo lógico, así que espera la confirmación del servidor (~1 viaje) y
  pierde con un mensaje claro si otro garzón ganó.
- **IDs deterministas** (`c-<mesa>-<producto>`): el optimistic update y la
  fila del servidor coinciden y la reconciliación es trivial.
- **Sin conexión ⇒ solo lectura** en modo compartido: preferimos bloquear
  un momento antes que inventar una cola offline que pueda divergir.
- **Sin dependencias extra**: estado con Context + useReducer, navegación
  por estado, avisos propios; `@supabase/supabase-js` es la única adición
  (exigida por el requisito) y `serve` para servir estáticos.
- **Paleta con escalas completas** (`verde`, `amarillo`, `azul` en Tailwind)
  y clases componibles (`tarjeta`, `btn`, `pill`) para mantener consistencia
  visual en ambos temas sin duplicar estilos.
