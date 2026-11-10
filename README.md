# TRAMA · ropa urbana (demo)

Tienda de demostración de una marca inventada, **TRAMA**, con 16 productos de ropa urbana (remeras, buzos, pantalones, camperas y accesorios), fotos por color, bolsa de compras, pedido por WhatsApp y **stock compartido por producto, color y talle**.

Se armó a partir de una copia de *Tienda Marce*: se conservó el funcionamiento (carrito, inventario y panel) y se cambiaron por completo la marca, el diseño, los textos, los productos y las fotos.

El panel privado está en **`/admin`**. Permite registrar ventas de WhatsApp, local, Instagram o web, ajustar cantidades y anular ventas devolviendo sus unidades. Agregar al carrito o abrir WhatsApp no descuenta stock.

**Todo es de prueba:** precios, stock, envíos y horarios. Las fotos son libres de Unsplash ([REFERENCIAS-IMAGENES.md](REFERENCIAS-IMAGENES.md)).

## Pagos (de prueba)

Desde la bolsa, **Pagar ahora** pide nombre, correo y WhatsApp y ofrece:

| Forma de pago | Cómo funciona |
| --- | --- |
| Tarjeta de crédito o débito | Va a Mercado Pago (hasta 3 cuotas). Al volver, el pedido queda pagado solo y se descuenta el stock. |
| Mercado Pago | Igual, con el dinero de la cuenta o tarjetas guardadas. |
| Transferencia | 10% OFF. Muestra alias y CBU de demostración. El pago se confirma en **/admin → Pedidos**. |

- El servidor calcula precios y total; el navegador no puede cambiarlos. Un pago se da por aprobado sólo después de consultarlo a Mercado Pago.
- Al pagarse, el pedido se registra como venta **Web** en el historial y descuenta el stock una sola vez.
- La clave de prueba de Mercado Pago va en `.dev.vars` como `MP_ACCESS_TOKEN` (ver `.dev.vars.example`). Ese archivo no se comparte. Para pagar usá las tarjetas de prueba de Mercado Pago y un comprador de prueba.

## Para adaptarla a un cliente

| Qué cambiar | Dónde |
| --- | --- |
| Nombre, WhatsApp, Instagram, envío y horarios | `public/assets/js/configuracion.js` |
| Productos, precios, talles y stock inicial | `public/datos/productos.json` |
| Foto de cada color | `public/datos/imagenes-colores.json` y `public/assets/img/productos/` |
| Textos de la portada, categorías, preguntas frecuentes | `tienda/index.html` |
| Colores y tipografías | variables al principio de `public/assets/css/estilos.css` |

## Fuentes principales

| Carpeta | Responsabilidad |
| --- | --- |
| `tienda/` | HTML de la tienda y de la administración. |
| `public/` | CSS, JavaScript del navegador, imágenes y catálogo inicial. |
| `app/` | Rutas de la web y de la API. |
| `lib/` | Permisos y operaciones del inventario. |
| `db/` y `drizzle/` | Esquema y migraciones de D1. |
| `worker/` | Entrada del servidor publicado. |
| `pruebas/` | Comprobaciones del carrito y del inventario. |

## Comandos habituales

```text
npm run install:ci
npm run dev
npm test
npm run build
```

La base local necesita su migración una sola vez; los pasos están en [EMPEZAR-AQUI.md](EMPEZAR-AQUI.md) y [LEEME.md](LEEME.md).
