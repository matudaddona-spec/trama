// Los datos que cambian con más frecuencia están juntos en este archivo.
// En esta versión, precios, stock, envío y horarios sirven solamente para la demo.
export const CONFIGURACION = Object.freeze({
  nombreTienda: 'TRAMA',
  // Número de prueba: reemplazarlo por el WhatsApp real del cliente.
  telefonoWhatsapp: '5491100000000',
  instagram: 'https://www.instagram.com/',
  claveCarrito: 'trama-carrito-v1',
  costoEnvio: 3500,
  nombreEnvio: 'Envío en moto',
  // Plazo y horarios ficticios: se usan para elegir una entrega en la demo.
  // Los días se numeran como Date.getDay(): domingo 0, lunes 1, sábado 6.
  plazoEnvioDiasHabiles: { minimo: 1, maximo: 3 },
  diasEnvio: [1, 2, 3, 4, 5, 6],
  franjasEnvio: ['11:00–14:00', '16:00–20:00'],
  horariosEnvio: 'Lunes a sábados · 11:00 a 14:00 y 16:00 a 20:00',
  horariosRetiro: 'Lunes a sábados · 11:00 a 14:00 y 16:00 a 20:00',
  franjasRetiro: ['11:00–14:00', '16:00–20:00'],
  diasRetiro: [1, 2, 3, 4, 5, 6],
  modoDemostracion: true,
});
