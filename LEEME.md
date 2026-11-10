# TRAMA · ropa urbana: guía de uso y mantenimiento

La tienda conserva su interfaz de HTML, CSS y JavaScript. Un servidor Worker con Vinext consulta y actualiza un inventario central en Cloudflare D1. Así, todos los navegadores consultan las mismas cantidades por producto, color y talle.

**El inventario se inicia con los productos y las cantidades de la demo. Los movimientos quedan guardados en la base compartida. Antes de usarlo para ventas reales hay que reemplazar esas cantidades por las existencias verificadas del cliente.** Las fotos, precios, promociones, envío y horarios siguen siendo de muestra. Mercado Pago no está conectado y esta versión no procesa cobros ni devoluciones de dinero.

## Cómo usar el panel de stock

Abrir `/admin` en la misma dirección de la tienda e iniciar sesión con una cuenta autorizada. El enlace «Administrar stock» aparece en la tienda para las cuentas que tienen ese permiso.

### Registrar una venta

1. Buscar la prenda por nombre, color, talle o código.
2. En la combinación vendida, elegir **Registrar venta**.
3. Indicar la cantidad y el origen: **WhatsApp**, **Local**, **Instagram** o **Web · venta confirmada**.
4. Revisar la vista previa, por ejemplo **3 disponibles − 1 vendida = 2 en stock**.
5. Elegir **Confirmar venta y descontar stock** cuando la operación comercial esté concretada.

El servidor descuenta únicamente la variante elegida. Una remera bordó talle M tiene su propio código y cantidad; no se descuenta de otra remera o talle. Si el stock cambió o ya no alcanza, se rechaza la operación. Las cantidades no pueden quedar negativas.

**Agregar una prenda al carrito, copiar un pedido, abrir WhatsApp o visitar el resumen no confirma una venta ni descuenta stock.** Por ahora, la confirmación se hace en el panel; el pago online sigue pendiente. El origen «Web» sirve para registrar manualmente una venta ya confirmada por otro medio.

### Cargar mercadería o corregir un conteo

Elegir **Ajustar stock** en la variante correspondiente. El campo pide la **cantidad total que queda disponible**, no la cantidad a sumar. Si hay 2 unidades y entran 5, guardar **7**. Agregar una referencia opcional ayuda a entender el movimiento después.

Si otra persona cambió esa variante mientras el panel estaba abierto, actualizar el inventario y revisar el nuevo conteo antes de guardar otra corrección.

### Anular una venta

En **Ventas registradas**, elegir **Anular y devolver stock** y confirmar la operación. Se restituyen las unidades de esa venta y se conserva el registro de la anulación. Esta acción no devuelve dinero ni cancela un pago externo.

### Si se corta la conexión

Si aparece «Hay una operación sin respuesta», usar **Reintentar operación**. El panel conserva la misma referencia para que el servidor consulte o complete esa operación sin descontarla dos veces. No crear una venta nueva para reemplazar un reintento pendiente.

El panel muestra las últimas 30 ventas y consulta periódicamente el inventario. La tienda actualiza las cantidades mientras está visible y cuando se vuelve a su pestaña; un cambio puede tardar unos segundos en verse. El botón **Actualizar stock** permite consultar de inmediato desde el panel.

## Qué se guarda

D1 conserva las existencias por SKU, ventas confirmadas, ajustes, anulaciones y movimientos de inventario. Los datos sobreviven a una recarga, al uso desde otra computadora y a una nueva publicación de la web.

La carga inicial inserta las 146 variantes una sola vez, con las cantidades ficticias del catálogo. **Releer el catálogo o publicar otra versión no repone ni reinicia el stock.** El JSON es la referencia inicial de productos; después, las cantidades vigentes provienen de D1 y se modifican desde el panel.

La bolsa del cliente se guarda sólo en su navegador con SKU y cantidad. El nombre, la dirección y las notas del pedido no se guardan en esa bolsa persistida. Una bolsa no reserva mercadería: la venta se vuelve a validar al confirmarla.

## Cómo está organizado el código

```text
tienda/
  index.html                       Estructura y textos de la tienda.
  admin.html                       Estructura del panel privado.
public/
  assets/css/estilos.css            Diseño de la tienda y sus colores.
  assets/css/administracion.css     Diseño del panel de stock.
  assets/js/configuracion.js       WhatsApp, Instagram, envío y retiro.
  assets/js/pedidos.js             Reglas del carrito y de entrega.
  assets/js/app.js                 Tienda y consulta del inventario compartido.
  assets/js/administracion.js      Acciones y mensajes del panel privado.
  assets/img/                      Fotos ilustrativas de la demo.
  datos/productos.json             Catálogo y cantidades iniciales de prueba.
  datos/imagenes-colores.json       Foto y recorte de cada producto/color.
app/
  route.ts                         Entrega el HTML de la tienda.
  admin/route.ts                   Entrega el panel después de autorizar la cuenta.
  api/                             Consultas y operaciones del servidor.
  chatgpt-auth.ts                  Identidad de la sesión provista por Sites.
lib/
  inventario.ts                    Lectura, ventas, ajustes y anulaciones en D1.
  acceso.ts                        Permisos, validación de solicitudes y respuestas.
db/
  schema.ts                        Definición del esquema de la base.
  index.ts                         Acceso de Drizzle al enlace D1.
drizzle/                           Migraciones SQL y su metadata.
worker/index.ts                    Entrada del servidor publicado.
vite.config.ts                     Integración de Vinext, Worker y recursos de Sites.
pruebas/                           Pruebas del carrito y del inventario.
.openai/hosting.json               Identidad del Site y enlace D1 DB.
REFERENCIAS-IMAGENES.md             Procedencia y prompts de las imágenes ilustrativas.
```

`dist/` es salida generada al compilar. No editar allí ni usar esa carpeta como fuente: los cambios propios se hacen en `public/`, `tienda/`, `app/`, `lib/` o `db/`, según corresponda.

## Dónde cambiar cada cosa

### Textos, diseño e imágenes

Los textos y la estructura están en `tienda/index.html` y `tienda/admin.html`. Los colores principales de la tienda se ajustan en las variables de `:root` de `public/assets/css/estilos.css`.

`public/datos/imagenes-colores.json` relaciona cada producto y color con su foto. El detalle y la miniatura del carrito acompañan el color elegido. Cada entrada contiene `archivo`, `x`, `y`, `ancho`, `alto`, `anchoHoja` y `altoHoja`. Para una foto individual se usan `x: 0`, `y: 0` y las dimensiones completas. Los nombres de color deben coincidir con los del catálogo, incluidos los acentos.

Las 46 combinaciones de imágenes actuales son ilustrativas. No acreditan el diseño exacto, marca o composición de la mercadería real.

### Productos y cantidades

`public/datos/productos.json` define los nombres, categorías, precios de muestra y variantes iniciales. Cada variante tiene un `sku` estable que la relaciona con la existencia en la base.

Para cambiar cantidades de variantes ya cargadas, usar el panel. Modificar su valor `stock` en el JSON no reemplaza la cantidad guardada en D1. Esta versión administra el catálogo inicial; dar de alta nuevos modelos o códigos requiere completar también su incorporación al inventario, no sólo agregar una tarjeta visual.

Los importes del catálogo son números en pesos argentinos, sin símbolo ni separadores de miles. `descuento` es un porcentaje; usar `0` para quitar la promoción de muestra.

### WhatsApp, envío y retiro

Editar `public/assets/js/configuracion.js`:

- `telefonoWhatsapp`: número con país y área, sólo dígitos; actualmente `5491158263678`.
- `instagram`: perfil del negocio.
- `costoEnvio`: actualmente **3000**, aplicado una sola vez al elegir envío.
- `plazoEnvioDiasHabiles`: de **1 a 3 días hábiles** de prueba.
- `diasEnvio`: de lunes a sábados; domingo es `0` y se omite.
- `franjasEnvio`: **10:00–13:00** y **16:00–19:00**.
- `diasRetiro`, `franjasRetiro` y `horariosRetiro`: días y franjas para solicitar retiro sin cargo.

Las fechas y franjas elegidas aparecen en el resumen y en el pedido copiado a WhatsApp. Todavía no representan cupos ni una agenda de reparto real; no se contemplan feriados y el dueño debe confirmar la coordinación.

## Acceso a la administración

Sites gestiona el inicio de sesión. El servidor autoriza las operaciones mediante la variable de entorno **`INVENTORY_ADMIN_EMAILS`**, una lista de correos permitidos separados por coma, punto y coma o salto de línea. Configurar esa variable en el alojamiento; no colocar correos de autorización, claves ni credenciales en el JavaScript del navegador.

Para habilitar la cuenta del dueño se necesita conocer y autorizar su cuenta de acceso. La política de acceso al Site y el permiso de administración son controles distintos: mantener la audiencia del sitio y autorizar sólo las cuentas acordadas.

En desarrollo local portable, el starter simula una sesión de prueba `seedy@sites.test`; esa autorización local no se incluye en la publicación. Las rutas de autenticación son provistas por Sites y no se debe crear un segundo sistema de contraseñas.

## Rutas del servidor

| Ruta | Función |
| --- | --- |
| `GET /api/catalogo` | Devuelve el catálogo con las cantidades compartidas actuales. |
| `GET /api/sesion` | Informa si la sesión puede administrar stock. |
| `GET /api/admin/inventario` | Consulta privada de variantes, ventas recientes y movimientos. |
| `POST /api/admin/ventas` | Confirma una venta y descuenta las variantes. |
| `POST /api/admin/ajustes` | Guarda una corrección de stock y su referencia. |
| `POST /api/admin/ventas/:id/anular` | Anula una venta y devuelve sus unidades. |

Las escrituras se autorizan en el servidor y deben provenir del panel de la misma tienda. La clave de cada operación permite reintentar una respuesta perdida sin duplicar la modificación. Las ventas y sus movimientos se guardan en una transacción.

## Desarrollo local y pruebas

Se necesita una versión moderna de Node compatible con `package.json`. Al preparar una copia nueva del proyecto, instalar las dependencias del archivo de bloqueo:

```text
npm run install:ci
```

Para desarrollar con el servidor y D1 local:

```text
npm run dev
```

Abrir la dirección local que indique el servidor. En el perfil portable, visitar `/signin-with-chatgpt?return_to=/admin` inicia la sesión ficticia de desarrollo. Las bases local y publicada son independientes.

Para ejecutar las comprobaciones:

```text
npm test
```

Para compilar la salida que usa el Worker:

```text
npm run build
```

El esquema está en `db/schema.ts`. Después de cambiarlo se genera una migración nueva con `npm run db:generate`; revisar y conservar el SQL y su metadata. No modificar migraciones ya aplicadas ni colocar datos iniciales en ellas.

Una base local nueva necesita las migraciones antes de usar el inventario. Después de compilar para generar la configuración de Wrangler, aplicar cada SQL pendiente una sola vez. Para la migración inicial actual:

```text
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_keen_meteorite.sql
```

No repetir ese comando sobre una base que ya tiene esa migración. Los archivos SQLite y la carpeta `.wrangler/` son estado local y quedan fuera de Git.

## Publicación y cuidado de los datos

Se conserva el mismo `project_id` en `.openai/hosting.json`. El manifiesto declara `d1: "DB"`; ya no publica `dist/` como sitio estático. El proceso de Sites compila el Worker, conserva las migraciones y aplica el esquema del D1 publicado antes de activar la versión.

No crear otro Site ni otra base para actualizar esta tienda. Publicar código no debe borrar, reiniciar o reemplazar las existencias. Las credenciales se gestionan fuera del código y los archivos de entorno y secretos quedan excluidos de Git.

Antes de una operación sobre datos comerciales reales, conservar un respaldo adecuado y revisar el cambio de esquema. Las copias de bases y los registros locales de prueba tampoco se publican como recursos de la tienda.

## Información pendiente para salir de la demo

- Cantidades, modelos y variantes verificadas del negocio.
- Fotos propias y precios y promociones vigentes.
- Dirección, días y horarios de retiro definitivos; zonas y tarifas de envío.
- Cuenta que usará el dueño para administrar el stock.
- Integración de pagos, sólo cuando Martín autorice esa etapa.
