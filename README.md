# MESALISTA

> **Sistema de reservas de mesas para restaurantes**
> *Reserva online, confirmación por correo, gestión por salones y exportación a Excel.*

MESALISTA es una página web donde los clientes de un restaurante reservan su mesa mediante un formulario, reciben la confirmación por correo y pueden cancelar o cambiar su hora de llegada; el equipo del restaurante administra todo desde un panel con login y exporta las reservas a planillas Excel divididas según los datos del formulario.

## Funcionalidades

### Formulario público de reserva (`/`)

- **Nombre de la persona encargada de la mesa** (+ teléfono opcional).
- **Correo electrónico**: ahí llega la confirmación de la mesa y el enlace para gestionar la reserva.
- **Fecha y hora de ingreso**, restringidas a los horarios de atención (ver tabla más abajo).
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
- **Abono**: las mesas de **10 o más personas** deben dejar un abono obligatorio al reservar (opcional para mesas más pequeñas). El monto abonado se descuenta después del total de la cuenta y queda como saldo pendiente en el panel y el Excel.
- **Total estimado** calculado en vivo en el resumen lateral, con abono y saldo.

### Horarios de ingreso

| Día | Almuerzo | Cena |
|---|---|---|
| Viernes | — | 18:30 a 22:15 |
| Sábado | 12:45 a 16:15 | 18:30 a 22:15 |
| Domingo | 12:45 a 16:15 | — |

El formulario solo ofrece horas dentro de estas ventanas (en pasos de 15 minutos) y la API rechaza reservas en días u horas fuera de horario.

### Correo de confirmación y gestión de la reserva (`/reserva/<código>`)

Al reservar, el cliente recibe un **correo confirmando su mesa** con todos los
datos y un enlace personal de gestión, que también se muestra en la pantalla
de éxito. Desde ese enlace puede, mientras la reserva no haya ocurrido:

- **Cancelar la reserva** ante cualquier eventualidad: queda marcada como
  cancelada en el panel y pasa a su propia hoja del Excel.
- **Cambiar su hora de llegada**, solo a horas dentro del horario de
  atención de ese día (la API rechaza cualquier hora fuera de rango).

Cada cambio se confirma también por correo. El envío usa SMTP y se configura
con variables de entorno (ver [Correos por SMTP](#correos-por-smtp)); sin esa
configuración la app funciona igual, solo que no envía correos y el cliente
guarda el enlace que aparece en pantalla.

### Panel de administración (`/admin`)

La administración va **separada de la interfaz del cliente**: requiere
iniciar sesión en `/admin/login` con las credenciales de administrador
(ver [Acceso de administrador](#acceso-de-administrador)). Sin sesión, el
panel redirige al login y la API de listado/exportación responde 401.

- Tabla con todas las reservas (encargado con correo y teléfono, fecha/hora con servicio, personas, menú, salón, accesibilidad, detalles, total, abono y saldo pendiente). Las canceladas se distinguen con una etiqueta y no suman en las estadísticas.
- Botón **Cerrar sesión**.
- Botón **Exportar a Excel**: descarga un `.xlsx` con las reservas divididas en tablas (hojas) según lo pedido en el formulario:
  - `Todas las Reservas` — tabla completa con fila de totales.
  - Una hoja por **salón** (incluida `Sin preferencia`).
  - Una hoja por **tipo de menú**.
  - `Almuerzo` y `Cena` — según el servicio al que ingresa la mesa.
  - `Con abono` — mesas que dejaron abono, con su saldo pendiente.
  - `Accesibilidad` — reservas que requieren espacio accesible.
  - `Canceladas` — reservas anuladas por el cliente (fuera de las hojas anteriores).
  - `Tarifas` y `Horarios` — referencia de precios, regla de abono y horarios de ingreso.

  Todas las tablas incluyen las columnas **Correo**, **Abono** y **Saldo pendiente** (total − abono).

  Ejemplo de planilla generada: [`docs/reservastest.xlsx`](docs/reservastest.xlsx).

## Instalar como aplicación (PWA)

MESALISTA es una **Progressive Web App**: se instala desde el navegador y queda
como cualquier otra aplicación, con su propio ícono y ventana, en computadores
y celulares.

| Dispositivo | Cómo instalar |
|---|---|
| **PC / Mac** (Chrome o Edge) | Abre la página y haz clic en el ícono de instalación al final de la barra de direcciones (o menú **⋮ → Instalar MESALISTA**). |
| **Android** (Chrome) | Abre la página → menú **⋮ → Agregar a la pantalla principal → Instalar**. |
| **iPhone / iPad** (Safari) | Abre la página → botón **Compartir** → **Agregar a pantalla de inicio**. |

Requisitos: el navegador ofrece la instalación cuando la página se sirve por
**HTTPS** (o desde `http://localhost` en el mismo computador). Para instalarla
en celulares u otros equipos, despliega la app gratis (ver
[Desplegar gratis](#desplegar-gratis-vercel-o-render)) y abre esa URL desde
cada dispositivo.

## Stack

- **Next.js 15** (App Router) · **TypeScript** · **TailwindCSS**
- **Zod** para validación del contrato del formulario (front ↔ API)
- **ExcelJS** para la generación de las planillas
- **Nodemailer** para los correos de confirmación (SMTP)
- **Firebase Firestore** como base de datos (SDK Admin en el servidor), con
  respaldo en archivo JSON local (`data/reservas.json`) para desarrollar sin
  credenciales — ambas detrás de la misma interfaz de repositorio en `src/lib/db.ts`.
- Sesión de administrador con **cookie firmada (HMAC-SHA256)**, sin dependencias extra.

## Estructura

```
src/
  app/
    page.tsx                      → formulario público de reserva
    reserva/[id]/page.tsx         → gestión de una reserva (cancelar / cambiar hora)
    admin/page.tsx                → panel de administración (requiere sesión)
    admin/login/page.tsx          → login del administrador
    api/reservas/route.ts         → GET listar (admin) / POST crear
    api/reservas/[id]/route.ts    → PATCH cancelar o cambiar hora
    api/reservas/export/route.ts  → GET descarga del Excel (admin)
    api/admin/login/route.ts      → POST iniciar sesión / DELETE cerrarla
  lib/
    menu.ts        → catálogo de menús y precios, cálculo de totales
    salones.ts     → salones disponibles
    horarios.ts    → días y ventanas de ingreso, hora actual de Chile
    validation.ts  → schemas Zod (crear reserva, acciones de gestión)
    db.ts          → persistencia (Firestore o JSON local)
    excel.ts       → generación del libro Excel multi-hoja
    mail.ts        → correos de confirmación/cambio/cancelación (SMTP)
    auth.ts        → credenciales y sesión del administrador
    types.ts       → tipos de dominio
```

## Ejecutar desde Visual Studio Code

Requisitos: [Node.js 20+](https://nodejs.org) y [Visual Studio Code](https://code.visualstudio.com).

1. Clona el repositorio y ábrelo en VS Code:

   ```bash
   git clone https://github.com/Mukriscell/reservas-restaurante.git
   cd reservas-restaurante
   code .
   ```

2. Abre la terminal integrada (**Ctrl+`**) e instala las dependencias:

   ```bash
   npm install   # o `pnpm install` si usas pnpm
   ```

3. Presiona **F5** (configuración *MESALISTA: iniciar y abrir en el navegador*): arranca el servidor de desarrollo y se abre <http://localhost:3000> solo. Equivale a correr `npm run dev` en la terminal.

4. Prueba la página:
   - <http://localhost:3000> — completa el formulario y envía una reserva; en la pantalla de éxito aparece el enlace para gestionar la reserva (cancelar / cambiar hora).
   - <http://localhost:3000/admin> — te pedirá iniciar sesión; en desarrollo el acceso es **admin / mesalista**. Revisa la reserva en el panel y descarga la planilla con **Exportar a Excel**.

> `.vscode/launch.json` trae una segunda configuración, *MESALISTA: debug full stack (Chrome)*, que permite poner breakpoints tanto en el código del servidor como del navegador.

## Cómo correr (terminal)

Requisitos: Node 20+, pnpm 9+.

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:3000
- Admin: http://localhost:3000/admin (en desarrollo: admin / mesalista)
- API: `POST /api/reservas` · `PATCH /api/reservas/:id` · `GET /api/reservas` y `GET /api/reservas/export` (con sesión de admin)

### Probar por API

```bash
# Crear una reserva — sábado 2026-07-18, ingreso a la cena (18:30–22:15)
curl -s localhost:3000/api/reservas -H 'Content-Type: application/json' -d '{
  "nombreEncargado": "María González",
  "email": "maria@ejemplo.cl",
  "fecha": "2026-07-18",
  "hora": "20:30",
  "adultos": 4,
  "ninos6a11": 2,
  "ninos3a5": 1,
  "menuId": "BUFFET_APERITIVO_VINO",
  "salon": "Terraza Techada",
  "accesibilidad": true,
  "abono": 30000,
  "detalles": "Cumpleaños, necesitamos torta a las 22:00"
}'
# La respuesta incluye urlGestion (enlace de gestión) y correoEnviado.

# Cambiar la hora de llegada (solo dentro del horario de ese día)
curl -s -X PATCH localhost:3000/api/reservas/<id> \
  -H 'Content-Type: application/json' -d '{"accion":"cambiarHora","hora":"21:00"}'

# Cancelar la reserva
curl -s -X PATCH localhost:3000/api/reservas/<id> \
  -H 'Content-Type: application/json' -d '{"accion":"cancelar"}'

# Endpoints de administración: primero inicia sesión y guarda la cookie
curl -s -c cookies.txt -X POST localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' -d '{"usuario":"admin","clave":"mesalista"}'
curl -s -b cookies.txt localhost:3000/api/reservas
curl -sL -b cookies.txt -o reservas.xlsx localhost:3000/api/reservas/export
```

## Build de producción

```bash
pnpm build
pnpm start
```

## Configuración (variables de entorno)

Todas las variables están documentadas en [`.env.example`](.env.example).
Para desarrollo local puedes copiarlo a `.env` y completar lo que necesites.

### Acceso de administrador

| Variable | Uso |
|---|---|
| `ADMIN_USER` | Usuario del panel (por defecto `admin`). |
| `ADMIN_PASSWORD` | Contraseña del panel. **Obligatoria en producción**: sin ella el login queda deshabilitado. En desarrollo, si falta, el acceso es `admin` / `mesalista`. |

La sesión dura 8 horas y viaja en una cookie `httpOnly` firmada con
HMAC-SHA256 (derivada de `ADMIN_PASSWORD`, así que cambiarla cierra las
sesiones abiertas).

### Correos por SMTP

| Variable | Uso |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` | Servidor SMTP (ej. `smtp.gmail.com` / `587`). |
| `SMTP_USER` / `SMTP_PASS` | Credenciales SMTP. Con Gmail usa una [contraseña de aplicación](https://myaccount.google.com/apppasswords). |
| `MAIL_FROM` | Remitente visible (opcional; por defecto `SMTP_USER`). |
| `APP_URL` | URL pública para los enlaces de los correos (opcional; si falta se deduce de cada petición). |

Sin SMTP configurado la app avisa por consola y sigue funcionando sin correos.

## Base de datos en Firebase (Firestore)

Las reservas se guardan en la colección `reservas` de Firestore cuando la app
encuentra credenciales en el entorno. Configuración (una sola vez):

1. En [Firebase Console](https://console.firebase.google.com): **Agregar proyecto** (ej. `mesalista`).
2. **Compilación → Firestore Database → Crear base de datos**, en modo
   producción y la ubicación más cercana (p. ej. `southamerica-west1`).
3. **Configuración del proyecto (⚙️) → Cuentas de servicio → Generar nueva
   clave privada** → descarga un archivo `.json`. **No lo subas al repositorio.**
4. Entrega la credencial por variable de entorno (ver `.env.example`):
   - `FIREBASE_SERVICE_ACCOUNT` = contenido completo del `.json`, **o**
   - `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`.

Los navegadores nunca tocan Firestore: solo el servidor accede con el SDK
Admin, así que puedes dejar las reglas de seguridad de Firestore **cerradas**
(denegar lecturas y escrituras de clientes).

Sin credenciales, la app funciona igual guardando en `data/reservas.json`
(solo desarrollo). Para probar contra el emulador oficial:
`FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm start`.

## Desplegar gratis (Vercel o Render)

> Railway ya no tiene plan gratuito permanente (solo un crédito de prueba
> inicial), por eso la recomendación es Vercel o Render. El repo conserva
> `railway.json` por si algún día quieres pagarlo.

### Opción recomendada: Vercel

[Vercel](https://vercel.com) son los creadores de Next.js y su plan **Hobby
es gratis** (sin tarjeta de crédito): HTTPS, dominio `*.vercel.app` y
re-despliegue automático con cada push. Sus límites gratuitos (100 GB de
transferencia y 1M de invocaciones al mes) sobran para este proyecto.

1. Crea tu cuenta en [vercel.com/signup](https://vercel.com/signup) con
   **Continue with GitHub**.
2. **Add New… → Project** → importa `Mukriscell/reservas-restaurante`
   (rama `main`). Vercel detecta Next.js + pnpm solo; no cambies el build.
3. Antes de **Deploy**, abre **Environment Variables** y agrega:
   - `FIREBASE_SERVICE_ACCOUNT` → contenido del `.json` de la cuenta de servicio.
   - `ADMIN_USER` y `ADMIN_PASSWORD` → credenciales del panel.
   - (Opcional) `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` para los correos.
4. **Deploy** → en ~1 minuto tienes tu URL `https://….vercel.app`.

> En Vercel no hay disco persistente: configura `FIREBASE_SERVICE_ACCOUNT`
> para que las reservas vivan en Firestore. El plan Hobby es para uso
> personal/no comercial.

### Alternativa: Render

Si prefieres un servidor "siempre encendido" estilo Railway,
[Render](https://render.com) tiene plan gratuito (tampoco pide tarjeta). El
repo incluye [`render.yaml`](render.yaml) con todo configurado:

1. Crea tu cuenta en [render.com](https://render.com) con GitHub.
2. **New → Blueprint** → elige `Mukriscell/reservas-restaurante`: Render lee
   `render.yaml` y crea el servicio web gratuito.
3. Completa las variables que pide (`FIREBASE_SERVICE_ACCOUNT`, `ADMIN_USER`,
   `ADMIN_PASSWORD`); las de SMTP se agregan después en **Environment** si
   quieres correos.
4. Al terminar obtienes tu URL `https://….onrender.com`.

> Limitación del plan gratis de Render: el servicio **se duerme tras 15
> minutos sin visitas** y la siguiente visita tarda ~1 minuto en despertarlo.

Ambas URLs son HTTPS, así que desde ellas la PWA se puede **instalar en
cualquier celular o computador**, y cada `git push` a `main` vuelve a
desplegar automáticamente.
