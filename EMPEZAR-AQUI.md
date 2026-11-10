# TRAMA (demo de ropa urbana) — empezar acá

Esta carpeta contiene el código completo de la web, con sus imágenes, estilos, carrito, panel de administración, base de inventario definida por migraciones y pruebas. La entrega se preparó el 10/11/2026 a partir del proyecto actual.

## Para revisar o editar

Abrir la carpeta completa en un editor, por ejemplo Visual Studio Code.

- `tienda/index.html`: estructura y textos de la tienda.
- `tienda/admin.html`: estructura del panel de stock.
- `public/assets/css/`: colores y diseño.
- `public/assets/js/`: carrito, entregas, WhatsApp y acciones del panel.
- `public/assets/js/configuracion.js`: teléfono, Instagram, envío y horarios de prueba.
- `public/assets/img/productos/`: fotos libres de Unsplash, una por producto y color.
- `public/datos/productos.json`: los 16 productos, precios, talles y stock inicial. `imagenes-colores.json` dice qué foto va con cada color.
- `app/` y `lib/`: rutas, permisos y funcionamiento del inventario compartido.
- `db/` y `drizzle/`: esquema y migraciones de la base.
- `pruebas/`: comprobaciones del carrito y del stock.

La guía detallada está en **LEEME.md**. **README.md** ofrece un resumen de la organización. Se conservan también los componentes y herramientas que usa el proyecto.

## Para ejecutarla en otra computadora

Se necesita Node.js con npm, compatible con la versión indicada en `package.json`. Abrir una terminal dentro de esta carpeta.

1. Instalar las dependencias del proyecto:

```text
npm run install:ci
```

2. Compilar para generar la configuración local:

```text
npm run build
```

3. En una base local nueva, aplicar la migración inicial una sola vez:

```text
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_keen_meteorite.sql
```

4. Iniciar la web y abrir la dirección que muestre la terminal:

```text
npm run dev
```

La tienda completa necesita ese servidor. Abrir solamente el HTML con doble clic no ejecuta el inventario compartido. Usar los comandos anteriores; `scripts/servidor.mjs` se conserva como una utilidad de la etapa estática anterior.

En desarrollo local, `/signin-with-chatgpt?return_to=/admin` permite entrar con la sesión ficticia del entorno de pruebas. La autorización para administrar la web publicada se configura por separado en el servidor.

## Estado de la tienda

El stock se controla por producto, color y talle. Se descuenta al confirmar una venta en el panel; agregar al carrito o abrir WhatsApp no reserva ni descuenta mercadería. Ajustar stock pide la cantidad final disponible. Anular una venta devuelve sus unidades y no procesa devoluciones de dinero.

Las fotos, precios, promociones, horarios, envío y cantidades iniciales son de demostración. Mercado Pago y el ingreso propio del dueño con contraseña todavía están pendientes. La base local y la publicada son independientes.

Esta es una entrega de código: las contraseñas, credenciales del alojamiento y los registros de la base publicada se gestionan aparte. Las dependencias se reinstalan con el primer comando; no hace falta entregar `node_modules`. El archivo `.openai/hosting.json` conserva la asociación con el alojamiento existente; no publica cambios por sí solo.

Para ejecutar las pruebas:

```text
npm test
```
