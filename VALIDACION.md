# Revisión de la demo TRAMA

Fecha: 10/11/2026.

- `npm test`: 35 de 35 pruebas pasaron (carrito, envíos, texto del pedido e inventario compartido).
- `npm run build`: compila sin errores.
- La portada carga los 16 productos con su foto. Ninguna imagen queda rota.
- Al elegir otro color en la ficha cambia la foto. Al sumar a la bolsa se actualiza el contador.
- La bolsa calcula subtotal, envío y total, y arma el mensaje de WhatsApp.
- En celular (375 px) la página no se desborda hacia los costados.
- Panel `/admin` con el acceso local de prueba: muestra 111 variantes. Una venta de prueba por **Instagram** se registró y después se anuló, devolviendo el stock.

Todo el stock, los precios y los envíos son de prueba. No hay cobros online.

El archivo `ARCHIVOS-DE-LA-ENTREGA.json` viene de la entrega de *Tienda Marce* y no describe esta versión.
