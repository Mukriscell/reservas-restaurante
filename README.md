# MESALISTA

> **Sistema de reservas de mesas para restaurantes**
> *Reserva online, gestión por salones y exportación a Excel.*

MESALISTA es una página web donde los clientes de un restaurante reservan su mesa mediante un formulario, y el equipo del restaurante administra y exporta todas las reservas a planillas Excel divididas según los datos del formulario.

## Funcionalidades

### Formulario público de reserva (`/`)

- **Nombre de la persona encargada de la mesa** (+ teléfono opcional).
- **Fecha y hora** de la reserva.
- **Cantidad de personas**, separada por tramo:
  - Adultos (desde 12 años)
  - Niños de 6 a 11 años — **$9.990** c/u
  - Niños de 3 a 5 años — **$4.990** c/u (menores de 3 no pagan)
- **Opción de menú** (precio por adulto):
  | Menú | Precio por persona |
  |---|---|
  | Buffet | $20.990 |
  | Buffet + Aperitivo + Vino | $25.500 |
  | Buffet + Aperitivo + Vino + Bebida | $27.700 |
  | Buffet + Aperitivo + Vino + Bebida + Trago | $30.900 |
- **Salón** para la mesa (opcional): Salón Eventos, Salón 1, Salón 2, 2do Piso o Terraza Techada.
- **Checkbox de accesibilidad**: indica si asiste una persona con discapacidad.
- **Detalles adicionales**: cuadro de texto libre (alergias, celebraciones, etc.).
- **Total estimado** calculado en vivo en el resumen lateral.

### Panel de administración (`/admin`)

- Tabla con todas las reservas (encargado, fecha/hora, personas, menú, salón, accesibilidad, detalles y total).
- Botón **Exportar a Excel**: descarga un `.xlsx` con las reservas divididas en tablas (hojas) según lo pedido en el formulario:
  - `Todas las Reservas` — tabla completa con fila de totales.
  - Una hoja por **salón** (incluida `Sin preferencia`).
  - Una hoja por **tipo de menú**.
  - `Accesibilidad` — reservas que requieren espacio accesible.
  - `Tarifas` — referencia de precios.

  Ejemplo de planilla generada: [`docs/reservastest.xlsx`](docs/reservastest.xlsx).

## Stack

- **Next.js 15** (App Router) · **TypeScript** · **TailwindCSS**
- **Zod** para validación del contrato del formulario (front ↔ API)
- **ExcelJS** para la generación de las planillas
- Persistencia en archivo JSON (`data/reservas.json`) tras una interfaz de repositorio, intercambiable por Prisma/PostgreSQL sin tocar el resto de la app.

## Estructura

```
src/
  app/
    page.tsx                      → formulario público de reserva
    admin/page.tsx                → panel de administración
    api/reservas/route.ts         → GET (listar) / POST (crear)
    api/reservas/export/route.ts  → GET descarga del Excel
  lib/
    menu.ts        → catálogo de menús y precios, cálculo de totales
    salones.ts     → salones disponibles
    validation.ts  → schema Zod de la reserva
    db.ts          → persistencia (JSON file repository)
    excel.ts       → generación del libro Excel multi-hoja
    types.ts       → tipos de dominio
```

## Cómo correr (desarrollo)

Requisitos: Node 20+, pnpm 9+.

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:3000
- Admin: http://localhost:3000/admin
- API: `GET/POST /api/reservas` · `GET /api/reservas/export`

### Probar por API

```bash
curl -s localhost:3000/api/reservas -H 'Content-Type: application/json' -d '{
  "nombreEncargado": "María González",
  "fecha": "2026-07-15",
  "hora": "20:30",
  "adultos": 4,
  "ninos6a11": 2,
  "ninos3a5": 1,
  "menuId": "BUFFET_APERITIVO_VINO",
  "salon": "Terraza Techada",
  "accesibilidad": true,
  "detalles": "Cumpleaños, necesitamos torta a las 22:00"
}'

# Descargar el Excel con las reservas
curl -sL -o reservas.xlsx localhost:3000/api/reservas/export
```

## Build de producción

```bash
pnpm build
pnpm start
```
