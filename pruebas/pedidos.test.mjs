import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buscarVariante,
  precioUnitario,
  normalizarCarrito,
  cambiarCantidad,
  calcularTotales,
  calcularVentanaEnvio,
  validarEntrega,
  crearTextoPedido,
} from '../public/assets/js/pedidos.js';
import { CONFIGURACION } from '../public/assets/js/configuracion.js';

// Un catálogo pequeño y explícito mantiene las expectativas independientes
// de las cantidades y los precios elegidos para la demostración visual.
const productos = [
  {
    id: 'top',
    nombre: 'Top deportivo',
    precio: 10000,
    descuento: 15,
    variantes: [
      { sku: 'TOP-ROJO-S', color: 'Rojo', talle: 'S', stock: 2 },
      { sku: 'TOP-ROJO-M', color: 'Rojo', talle: 'M', stock: 1 },
      { sku: 'TOP-AZUL-S', color: 'Azul', talle: 'S', stock: 3 },
      { sku: 'TOP-GRIS-S', color: 'Gris', talle: 'S', stock: 0 },
    ],
  },
  {
    id: 'remera',
    nombre: 'Remera básica',
    precio: 4000,
    descuento: 0,
    variantes: [
      { sku: 'REMERA-BLANCO-S', color: 'Blanco', talle: 'S', stock: 5 },
    ],
  },
];

const pedidoMixto = [
  { sku: 'TOP-ROJO-S', cantidad: 2 },
  { sku: 'REMERA-BLANCO-S', cantidad: 1 },
];
const formatoMoneda = valor => `$ ${valor.toLocaleString('es-AR')}`;
const datosRetiro = {
  tipo: 'retiro',
  fecha: '2026-11-02',
  horario: '11:00–14:00',
  nombre: '',
  notas: '',
};
const datosEnvio = {
  tipo: 'envio',
  direccion: 'San Martín 123, Lomas de Zamora',
  fechaEnvio: '2026-11-02',
  horarioEnvio: '11:00–14:00',
  nombre: '  Ana  ',
  notas: '  Tocar timbre  ',
};

test('el subtotal aplica la promoción a cada unidad antes de sumar el pedido', () => {
  assert.equal(precioUnitario(productos[0]), 8500);
  assert.equal(precioUnitario(productos[1]), 4000);
  const totales = calcularTotales(pedidoMixto, productos, 'retiro', CONFIGURACION.costoEnvio);
  assert.equal(totales.subtotal, 21000);
  assert.equal(totales.unidades, 3);
  assert.deepEqual(totales.lineas.map(linea => linea.importe), [17000, 4000]);
});

test('el envío de $3.500 se cobra una sola vez por pedido', () => {
  assert.equal(CONFIGURACION.costoEnvio, 3500);
  const totales = calcularTotales(pedidoMixto, productos, 'envio', CONFIGURACION.costoEnvio);
  assert.equal(totales.envio, 3500);
  assert.equal(totales.total, 24500);

  const pedidoMayor = [...pedidoMixto, { sku: 'TOP-AZUL-S', cantidad: 3 }];
  const mayor = calcularTotales(pedidoMayor, productos, 'envio', CONFIGURACION.costoEnvio);
  assert.equal(mayor.unidades, 6);
  assert.equal(mayor.envio, 3500);
  assert.equal(mayor.total, 50000);
});

test('elegir retiro elimina el envío y conserva el subtotal de los productos', () => {
  const totales = calcularTotales(pedidoMixto, productos, 'retiro', CONFIGURACION.costoEnvio);
  assert.equal(totales.envio, 0);
  assert.equal(totales.total, 21000);
});

test('un carrito vacío no genera un cargo de envío ni un total a pagar', () => {
  const totales = calcularTotales([], productos, 'envio', CONFIGURACION.costoEnvio);
  assert.deepEqual(totales.lineas, []);
  assert.equal(totales.unidades, 0);
  assert.equal(totales.subtotal, 0);
  assert.equal(totales.envio, 0);
  assert.equal(totales.total, 0);
});

test('color y talle mantienen líneas y límites de stock independientes', () => {
  let carrito = cambiarCantidad([], 'TOP-ROJO-S', 2, productos);
  carrito = cambiarCantidad(carrito, 'TOP-ROJO-M', 1, productos);
  carrito = cambiarCantidad(carrito, 'TOP-AZUL-S', 3, productos);
  assert.equal(carrito.length, 3);
  assert.equal(calcularTotales(carrito, productos, 'retiro', 3500).unidades, 6);

  carrito = cambiarCantidad(carrito, 'TOP-ROJO-S', 1, productos);
  assert.deepEqual(carrito.find(linea => linea.sku === 'TOP-ROJO-M'), { sku: 'TOP-ROJO-M', cantidad: 1 });
  assert.deepEqual(carrito.find(linea => linea.sku === 'TOP-AZUL-S'), { sku: 'TOP-AZUL-S', cantidad: 3 });
  assert.equal(buscarVariante(productos, 'TOP-ROJO-M').variante.talle, 'M');
  assert.equal(buscarVariante(productos, 'TOP-AZUL-S').variante.color, 'Azul');
});

test('no se pueden pedir más unidades de una variante que las disponibles', () => {
  const carrito = cambiarCantidad([], 'TOP-ROJO-S', 99, productos);
  assert.deepEqual(carrito, [{ sku: 'TOP-ROJO-S', cantidad: 2 }]);
  assert.deepEqual(cambiarCantidad(carrito, 'TOP-GRIS-S', 1, productos), carrito);

  const repetidos = normalizarCarrito([
    { sku: 'TOP-ROJO-S', cantidad: 1 },
    { sku: 'TOP-ROJO-S', cantidad: 2 },
  ], productos);
  assert.deepEqual(repetidos, [{ sku: 'TOP-ROJO-S', cantidad: 2 }]);
});

test('llevar una línea a cero la elimina sin alterar las otras ni el carrito de entrada', () => {
  const original = structuredClone(pedidoMixto);
  const resultado = cambiarCantidad(original, 'TOP-ROJO-S', 0, productos);
  assert.deepEqual(resultado, [{ sku: 'REMERA-BLANCO-S', cantidad: 1 }]);
  assert.deepEqual(original, pedidoMixto);
  assert.deepEqual(cambiarCantidad(resultado, 'REMERA-BLANCO-S', -1, productos), []);
});

test('persistencia inválida, cantidades malformadas y productos desconocidos no crean líneas', () => {
  for (const valor of [null, undefined, {}, 1, '[]', '{JSON roto']) {
    assert.deepEqual(normalizarCarrito(valor, productos), []);
  }
  const recuperado = normalizarCarrito([
    null,
    {},
    { sku: 'DESCONOCIDO', cantidad: 3 },
    { sku: 'TOP-GRIS-S', cantidad: 1 },
    { sku: 'TOP-ROJO-S', cantidad: '2' },
    { sku: 'TOP-ROJO-S', cantidad: 1.5 },
    { sku: 'TOP-ROJO-S', cantidad: 0 },
    { sku: 'TOP-ROJO-S', cantidad: -2 },
    { sku: 'REMERA-BLANCO-S', cantidad: 1 },
  ], productos);
  assert.deepEqual(recuperado, [{ sku: 'REMERA-BLANCO-S', cantidad: 1 }]);
  assert.equal(buscarVariante(productos, 'DESCONOCIDO'), null);
});

test('cambiar un SKU inexistente o una cantidad no entera no agrega productos', () => {
  assert.deepEqual(cambiarCantidad(pedidoMixto, 'DESCONOCIDO', 1, productos), pedidoMixto);
  assert.deepEqual(cambiarCantidad(pedidoMixto, 'TOP-ROJO-S', 1.5, productos), pedidoMixto);
});

test('un carrito persistido que solo contiene artículos inválidos tampoco cobra envío', () => {
  const totales = calcularTotales([
    { sku: 'DESCONOCIDO', cantidad: 5 },
    { sku: 'TOP-GRIS-S', cantidad: 1 },
  ], productos, 'envio', CONFIGURACION.costoEnvio);
  assert.equal(totales.total, 0);
  assert.equal(totales.envio, 0);
});

test('el texto de WhatsApp conserva variantes, cantidades, dirección y total de prueba', () => {
  const totales = calcularTotales(pedidoMixto, productos, 'envio', CONFIGURACION.costoEnvio);
  const texto = crearTextoPedido(totales, datosEnvio, CONFIGURACION, formatoMoneda);
  assert.match(texto, /Top deportivo · Rojo · talle S/);
  assert.match(texto, /Remera básica · Blanco · talle S/);
  assert.match(texto, /2 × \$ 8\.500 = \$ 17\.000/);
  assert.match(texto, /Subtotal: \$ 21\.000/);
  assert.match(texto, /Envío en moto \(de prueba\): \$ 3\.500/);
  assert.match(texto, /Dirección: San Martín 123, Lomas de Zamora/);
  assert.match(texto, /Entrega solicitada: 2026-11-02 · 11:00–14:00/);
  assert.match(texto, /Plazo de muestra: 1 a 3 días hábiles/);
  assert.match(texto, /Fecha y horario a confirmar por WhatsApp/);
  assert.match(texto, /TOTAL DE PRUEBA: \$ 24\.500/);
  assert.match(texto, /Nombre: Ana/);
  assert.match(texto, /Notas: Tocar timbre/);
  assert.match(texto, /DEMO/);
  assert.match(texto, /precios y stock simulados/);
  assert.match(texto, /No es una compra confirmada/);
  assert.match(texto, /confirmás disponibilidad, precio final y entrega/);
});

test('el texto para retiro informa fecha, horario y ausencia de costo de envío', () => {
  const totales = calcularTotales(pedidoMixto, productos, 'retiro', CONFIGURACION.costoEnvio);
  const texto = crearTextoPedido(totales, datosRetiro, CONFIGURACION, formatoMoneda);
  assert.match(texto, /Retiro sin cargo/);
  assert.match(texto, /Fecha solicitada: 2026-11-02 · 11:00–14:00/);
  assert.match(texto, /TOTAL DE PRUEBA: \$ 21\.000/);
  assert.doesNotMatch(texto, /Dirección:/);
});

test('el retiro acepta lunes y sábados con una franja habilitada', () => {
  assert.equal(validarEntrega(datosRetiro, CONFIGURACION, '2026-10-31'), '');
  assert.equal(validarEntrega({ ...datosRetiro, fecha: '2026-10-31', horario: '16:00–20:00' }, CONFIGURACION, '2026-10-31'), '');
});

test('el retiro rechaza domingo, fecha pasada, fecha imposible y horario no ofrecido', () => {
  assert.match(validarEntrega({ ...datosRetiro, fecha: '2026-11-01' }, CONFIGURACION, '2026-10-31'), /lunes a sábados/i);
  assert.match(validarEntrega({ ...datosRetiro, fecha: '2026-10-30' }, CONFIGURACION, '2026-10-31'), /a partir de hoy/i);
  assert.match(validarEntrega({ ...datosRetiro, fecha: '2026-02-30' }, CONFIGURACION, '2026-01-01'), /no es válida/i);
  assert.match(validarEntrega({ ...datosRetiro, horario: '03:00' }, CONFIGURACION, '2026-10-31'), /franjas/i);
  assert.match(validarEntrega({ ...datosRetiro, fecha: '' }, CONFIGURACION, '2026-10-31'), /fecha/i);
});

test('el envío exige una dirección y usa su propia fecha y franja, sin pedir retiro', () => {
  const hoy = '2026-10-31';
  assert.match(validarEntrega({ tipo: 'envio', direccion: '' }, CONFIGURACION, hoy), /calle, número y localidad/i);
  assert.match(validarEntrega({ tipo: 'envio', direccion: '  123  ' }, CONFIGURACION, hoy), /calle, número y localidad/i);
  assert.match(validarEntrega({ tipo: 'envio', direccion: null }, CONFIGURACION, hoy), /calle, número y localidad/i);
  assert.equal(validarEntrega(datosEnvio, CONFIGURACION, hoy), '');
  assert.equal(validarEntrega({ ...datosEnvio, fecha: '2026-11-01', horario: '03:00' }, CONFIGURACION, hoy), '');
  assert.match(validarEntrega({ tipo: 'otro' }, CONFIGURACION, hoy), /cómo querés recibir/i);
});

test('un pedido del sábado ofrece lunes, martes y miércoles para enviar', () => {
  assert.deepEqual(calcularVentanaEnvio(CONFIGURACION, '2026-10-31'), {
    desde: '2026-11-02',
    hasta: '2026-11-04',
    fechas: ['2026-11-02', '2026-11-03', '2026-11-04'],
  });
});

test('un pedido del domingo también comienza su ventana de envío el lunes', () => {
  assert.deepEqual(calcularVentanaEnvio(CONFIGURACION, '2026-11-01').fechas, [
    '2026-11-02', '2026-11-03', '2026-11-04',
  ]);
});

test('el sábado cuenta como día de envío y el domingo se saltea al cruzar de mes', () => {
  assert.deepEqual(calcularVentanaEnvio(CONFIGURACION, '2026-10-30').fechas, [
    '2026-10-31', '2026-11-02', '2026-11-03',
  ]);
});

test('el plazo configurable comienza al alcanzar el mínimo de días hábiles', () => {
  const configuracion = { ...CONFIGURACION, plazoEnvioDiasHabiles: { minimo: 2, maximo: 3 } };
  assert.deepEqual(calcularVentanaEnvio(configuracion, '2026-10-31'), {
    desde: '2026-11-03', hasta: '2026-11-04', fechas: ['2026-11-03', '2026-11-04'],
  });
});

test('el envío rechaza fechas ausentes, imposibles, pasadas, domingos y fuera del plazo', () => {
  const hoy = '2026-10-31';
  assert.match(validarEntrega({ ...datosEnvio, fechaEnvio: '' }, CONFIGURACION, hoy), /fecha de envío/i);
  assert.match(validarEntrega({ ...datosEnvio, fechaEnvio: '2026-02-30' }, CONFIGURACION, hoy), /no es válida/i);
  assert.match(validarEntrega({ ...datosEnvio, fechaEnvio: '2026-10-30' }, CONFIGURACION, hoy), /a partir de hoy/i);
  assert.match(validarEntrega({ ...datosEnvio, fechaEnvio: '2026-11-01' }, CONFIGURACION, hoy), /lunes a sábados/i);
  assert.match(validarEntrega({ ...datosEnvio, fechaEnvio: '2026-10-31' }, CONFIGURACION, hoy), /entre 2026-11-02 y 2026-11-04/);
  assert.match(validarEntrega({ ...datosEnvio, fechaEnvio: '2026-11-05' }, CONFIGURACION, hoy), /entre 2026-11-02 y 2026-11-04/);
});

test('el envío permite ambas franjas dentro del horario y rechaza otras horas', () => {
  const hoy = '2026-10-31';
  assert.equal(validarEntrega({ ...datosEnvio, horarioEnvio: '16:00–20:00' }, CONFIGURACION, hoy), '');
  assert.match(validarEntrega({ ...datosEnvio, horarioEnvio: '' }, CONFIGURACION, hoy), /franjas de envío/i);
  assert.match(validarEntrega({ ...datosEnvio, horarioEnvio: '22:00–23:00' }, CONFIGURACION, hoy), /franjas de envío/i);
});

test('el cálculo de la ventana rechaza configuración sin días o plazo válido', () => {
  assert.throws(() => calcularVentanaEnvio({ ...CONFIGURACION, diasEnvio: [] }, '2026-10-31'), RangeError);
  assert.throws(() => calcularVentanaEnvio({ ...CONFIGURACION, plazoEnvioDiasHabiles: { minimo: 3, maximo: 1 } }, '2026-10-31'), RangeError);
});
