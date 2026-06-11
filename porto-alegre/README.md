# Porto Alegre — Consumo de mesas

> **App móvil (PWA) para garzones**: registro de consumo de bebestibles por
> mesa, con menú buffet, totales automáticos y persistencia local en el
> dispositivo.

Vive en `/porto-alegre`, **apartada de MESALISTA** (la app de reservas en la
raíz del repositorio), y se instala en cualquier celular como una app normal.

## 1. Arquitectura

**SPA estática (Vite + React 18 + TypeScript + Tailwind) instalable como
PWA, sin backend.** La especificación exige persistir toda la información
**localmente**: el estado completo (mesas y consumos) vive en `localStorage`
del dispositivo del garzón, detrás de un módulo de almacenamiento versionado.
El servidor (Railway) solo entrega archivos estáticos; tras la primera carga,
el service worker deja la app operativa incluso sin conexión.

```
UI (pantallas + componentes)
        │ dispatch(acción)
Estado global: Context + useReducer   ←  única fuente de verdad en memoria
        │ efecto de persistencia
db/almacen.ts (localStorage, esquema versionado)   ←  "base de datos"
        +
data/catalogo.ts · data/menus.ts (catálogo y menús: seeder de solo lectura)
```

## 2. Estructura de carpetas

```
porto-alegre/
  index.html                  → shell + manifest + meta PWA
  railway.json                → build/arranque para Railway
  public/
    manifest.webmanifest      → identidad de la app instalable
    sw.js                     → service worker (offline tras primera carga)
    icons/                    → íconos 192/512 + maskable
  src/
    main.tsx                  → arranque + registro del service worker
    App.tsx                   → navegación entre pantallas (por estado)
    tipos.ts                  → Mesa, Producto, ConsumoMesa, MenuMesa
    data/
      catalogo.ts             → seeder: catálogo completo de la carta
      menus.ts                → menús buffet (mismos valores que MESALISTA)
    db/
      almacen.ts              → localStorage: cargar/guardar + seed de 100 mesas
    estado/
      contexto.tsx            → reducer con todas las operaciones de negocio
    util/
      dinero.ts               → formato CLP ($7.600)
      busqueda.ts             → normalización (mayúsculas/acentos) y match parcial
      fechas.ts               → formato fecha/hora es-CL
    componentes/
      TarjetaMesa.tsx         → celda de la grilla (número, estado, total)
      Buscador.tsx            → barra de búsqueda en tiempo real
      LineaConsumo.tsx        → línea de cuenta con stepper y eliminar
      SelectorMenu.tsx        → menú buffet + contadores de personas
    pantallas/
      PantallaMesas.tsx       → principal: las 100 mesas
      PantallaMesa.tsx        → detalle: estado, menú, cuenta, agregar
      PantallaDesglose.tsx    → desglose completo de la mesa seleccionada
```

## 3. Base de datos

`localStorage` bajo la clave `porto-alegre-mesas`, con esquema versionado:

```jsonc
{
  "version": 1,
  "mesas": [ // exactamente 100, seed automático al primer uso
    {
      "id": "mesa-7", "numeroMesa": 7, "estado": "PENDIENTE", // o "PAGADA"
      "total": 87650, "fechaApertura": "2026-06-11T23:40:00.000Z",
      "fechaCierre": null,
      "menu": { "menuId": "BUFFET_APERITIVO_VINO", "adultos": 2, "ninos6a11": 1, "ninos3a5": 1 }
    }
  ],
  "consumos": [
    { "id": "c-mesa-7-heineken", "mesaId": "mesa-7", "productoId": "heineken",
      "cantidad": 2, "precioUnitario": 3800, "subtotal": 7600 }
  ]
}
```

- `total` se recalcula en cada mutación: **menú + consumos**.
- Si la versión del esquema no calza o los datos están corruptos, se
  re-inicializa con el seed (100 mesas pendientes en $0).
- El **catálogo de productos** es un módulo estático (`data/catalogo.ts`)
  con ids estables derivados del nombre: es el seeder pedido y la fuente de
  verdad de precios.

## 4. Pantallas

| Pantalla | Qué hace |
|---|---|
| **Principal** | Las 100 mesas con número, estado y total. Amarillo = PENDIENTE, verde = PAGADA. |
| **Mesa** | Total acumulado, marcar pagada (con confirmación), menú buffet por persona, cuenta con steppers de cantidad y eliminar, buscador con agregado de productos en un toque. PAGADA bloquea todo y muestra el candado de cierre, con opciones *Reabrir cuenta* y *Nueva cuenta*. |
| **Desglose** | La cuenta completa de la mesa seleccionada: líneas del menú según personas/niños y menú elegido por los adultos, líneas `2 x Heineken = $7.600`, subtotales y TOTAL. |

## 5. Componentes reutilizables

`TarjetaMesa` (memoizada), `Buscador`, `LineaConsumo` (memoizada),
`SelectorMenu` (con su `Contador` de personas interno).

## 6. Menú buffet (igual que la app de reservas)

Mismos valores y desglose que MESALISTA: el menú elegido aplica por adulto y
los niños pagan tarifa fija por tramo.

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
pnpm dev        # desarrollo → http://localhost:5173
pnpm build      # typecheck + bundle de producción en dist/
pnpm start      # sirve dist/ (igual que en Railway)
```

## 8. Instalar en el celular (PWA)

Con la app desplegada (HTTPS), abre la URL en el teléfono:

- **Android (Chrome)**: menú ⋮ → *Agregar a la pantalla principal* → *Instalar*.
- **iPhone (Safari)**: *Compartir* → *Agregar a pantalla de inicio*.

Queda con ícono y ventana propios y funciona sin conexión después de la
primera carga (los datos son locales al dispositivo).

## 9. Desplegar en Railway (proyecto `observant-emotion`)

El repo ya incluye `porto-alegre/railway.json`. En [railway.com](https://railway.com):

1. Abre el proyecto **observant-emotion** → **+ Create → GitHub Repo** →
   `Mukriscell/reservas-restaurante` (rama `main`).
2. En el servicio nuevo: **Settings → Source → Root Directory** = `porto-alegre`.
3. **Settings → Networking → Generate Domain** → obtienes
   `https://….up.railway.app` para abrir e instalar en los celulares.

Cada `git push` a `main` re-despliega automáticamente. (Alternativa gratis:
el mismo root directory funciona en Vercel o Render.)

## 10. Decisiones técnicas

- **PWA en vez de binario nativo**: el requisito de desplegarla en Railway y
  "descargarla" en cualquier celular se cumple con una PWA instalable; evita
  tiendas de apps y mantiene un solo código.
- **Sin backend ni librerías de estado/rutas**: la spec exige persistencia
  local; `Context + useReducer + localStorage` cubren 100 mesas y una carta
  de 124 productos sin dependencias extra. Navegación por estado (3 vistas).
- **Rendimiento**: tarjetas y líneas de cuenta memoizadas, contexto de
  `dispatch` separado del de datos (las pantallas que solo despachan no se
  re-renderizan), filtrado de búsqueda con `useMemo`, bundle ~55 kB gzip.
- **Una línea por producto**: agregar un producto ya presente suma cantidad
  (id de consumo determinista `c-<mesa>-<producto>`), igual que opera un
  garzón.
- **Mesas pagadas**: el reducer bloquea cualquier mutación sobre una mesa
  PAGADA (defensa en profundidad, además de ocultar los controles). *Reabrir*
  corrige un pago marcado por error; *Nueva cuenta* (con confirmación) deja
  la mesa lista para los siguientes clientes — es el complemento mínimo del
  ciclo apertura/cierre que definen `fechaApertura`/`fechaCierre`.
- **Búsqueda**: normaliza mayúsculas y acentos ("jager" encuentra *Mojito
  Jäger*) con coincidencia parcial, como exige el spec.
- **`serve` como único agregado de producción** para servir `dist/` en
  Railway; el resto del runtime es solo React.
