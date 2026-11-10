// Pedidos con pago: el servidor calcula precios y total, guarda el pedido y,
// cuando el pago se confirma, descuenta el stock una sola vez como venta "web".
import catalogoInicial from '../public/datos/productos.json' with { type: 'json' };
import { CONFIGURACION } from '../public/assets/js/configuracion.js';
import { precioUnitario, validarEntrega } from '../public/assets/js/pedidos.js';
import fotos from '../public/datos/imagenes-colores.json' with { type: 'json' };
import { ErrorInventario, asegurarCatalogoInicial, confirmarVenta } from './inventario';

type BaseDatos = D1Database;
type Registro = Record<string, any>;

export const METODOS_PAGO = {
  tarjeta: { nombre: 'Tarjeta de crédito o débito', detalle: 'Hasta 3 cuotas sin interés · con Mercado Pago', descuento: 0, cuotas: 3, mercadoPago: true },
  mercadopago: { nombre: 'Mercado Pago', detalle: 'Con el dinero de tu cuenta o tus tarjetas guardadas', descuento: 0, cuotas: 1, mercadoPago: true },
  transferencia: { nombre: 'Transferencia bancaria', detalle: '10% OFF · te mostramos el alias al confirmar', descuento: 0.1, cuotas: 1, mercadoPago: false },
} as const;
export type MetodoPago = keyof typeof METODOS_PAGO;

export const ESTADOS_PEDIDO: Record<string, string> = {
  esperando_pago: 'Esperando el pago',
  esperando_transferencia: 'Esperando la transferencia',
  pagado: 'Pagado',
  rechazado: 'Pago rechazado',
  cancelado: 'Cancelado',
};

export type Pedido = {
  id: number;
  token: string;
  estado: string;
  metodo: MetodoPago;
  total: number;
  pagoId: string | null;
  creadoEn: string;
  actualizadoEn: string;
  cliente: { nombre: string; email: string; telefono: string };
  entrega: { tipo: 'retiro' | 'envio'; direccion?: string; fecha: string; horario: string };
  lineas: { sku: string; nombre: string; color: string; talle: string; cantidad: number; precio: number; foto: string }[];
  unidades: number;
  subtotal: number;
  descuento: number;
  envio: number;
  pagadoEn?: string;
  pagadoPor?: string;
  notaPago?: string;
  ventaId?: string;
  problemaStock?: string;
};

const variantes = new Map(
  catalogoInicial.productos.flatMap(producto => producto.variantes.map(variante => [variante.sku, { producto, variante }] as const)),
);
const fotosPorProducto = fotos.productos as Record<string, Record<string, string>>;

const fallar = (mensaje: string, estado = 400): never => { throw new ErrorInventario(mensaje, estado); };
function texto(valor: unknown, etiqueta: string, minimo: number, maximo: number) {
  const limpio = String(valor ?? '').trim();
  if (limpio.length < minimo || limpio.length > maximo) fallar(`Revisá ${etiqueta}.`);
  return limpio;
}

// La fecha "de hoy" se toma en horario de Argentina, aunque el servidor esté en otra zona.
function hoyEnArgentina() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

let tablaLista: Promise<unknown> | null = null;
export function asegurarTablaPedidos(db: BaseDatos) {
  tablaLista ??= db.prepare('CREATE TABLE IF NOT EXISTS pedidos (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, estado TEXT NOT NULL, metodo TEXT NOT NULL, total INTEGER NOT NULL, datos TEXT NOT NULL, pago_id TEXT, creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL)')
    .run()
    .catch(error => { tablaLista = null; throw error; });
  return tablaLista;
}

// Valida la bolsa contra el catálogo y el stock actual, y calcula el total con precios del servidor.
export async function cotizarPedido(db: BaseDatos, entrada: unknown) {
  const datos = (entrada && typeof entrada === 'object' ? entrada : {}) as Registro;
  const metodo = String(datos.metodo ?? '') as MetodoPago;
  const pago = METODOS_PAGO[metodo];
  if (!pago) fallar('Elegí una forma de pago.');

  const c = (datos.cliente ?? {}) as Registro;
  const cliente = {
    nombre: texto(c.nombre, 'tu nombre y apellido', 3, 80),
    email: texto(c.email, 'tu correo', 6, 120).toLowerCase(),
    telefono: texto(c.telefono, 'tu teléfono', 6, 30),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cliente.email)) fallar('Revisá tu correo.');
  if (cliente.telefono.replace(/\D/g, '').length < 8) fallar('Revisá tu teléfono.');

  const e = (datos.entrega ?? {}) as Registro;
  const datosEntrega = {
    tipo: e.tipo === 'envio' ? 'envio' : 'retiro',
    direccion: String(e.direccion ?? ''), fecha: String(e.fecha ?? ''), horario: String(e.horario ?? ''),
    fechaEnvio: String(e.fechaEnvio ?? ''), horarioEnvio: String(e.horarioEnvio ?? ''),
  };
  const errorEntrega = validarEntrega(datosEntrega, CONFIGURACION, hoyEnArgentina());
  if (errorEntrega) fallar(errorEntrega);
  const entrega = datosEntrega.tipo === 'envio'
    ? { tipo: 'envio' as const, direccion: texto(datosEntrega.direccion, 'la dirección', 8, 160), fecha: datosEntrega.fechaEnvio, horario: datosEntrega.horarioEnvio }
    : { tipo: 'retiro' as const, fecha: datosEntrega.fecha, horario: datosEntrega.horario };

  const pedidas = Array.isArray(datos.lineas) ? datos.lineas : [];
  if (!pedidas.length) fallar('Tu bolsa está vacía.');
  if (pedidas.length > 30) fallar('El pedido tiene demasiadas prendas.');
  const cantidades = new Map<string, number>();
  for (const linea of pedidas) {
    const sku = String(linea?.sku ?? '');
    const cantidad = Number(linea?.cantidad);
    if (!variantes.has(sku)) fallar('Una prenda de la bolsa ya no existe. Quitala y volvé a intentar.', 409);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) fallar('Revisá las cantidades de la bolsa.');
    cantidades.set(sku, (cantidades.get(sku) ?? 0) + cantidad);
  }

  await asegurarCatalogoInicial(db);
  const lineas: Pedido['lineas'] = [];
  for (const [sku, cantidad] of cantidades) {
    const { producto, variante } = variantes.get(sku)!;
    const fila = await db.prepare('SELECT cantidad FROM existencias WHERE sku = ?').bind(sku).first<Registro>();
    const disponible = Number(fila?.cantidad ?? 0);
    if (disponible < cantidad) fallar(`De ${producto.nombre} (${variante.color}, talle ${variante.talle}) ${disponible === 0 ? 'no quedan unidades' : `quedan ${disponible}`}. Ajustá la bolsa.`, 409);
    const foto = fotosPorProducto[producto.id]?.[variante.color] || Object.values(fotosPorProducto[producto.id] ?? {})[0] || '';
    lineas.push({ sku, nombre: producto.nombre, color: variante.color, talle: variante.talle, cantidad, precio: precioUnitario(producto), foto: foto ? `/${foto}` : '' });
  }

  const subtotal = lineas.reduce((suma, linea) => suma + linea.precio * linea.cantidad, 0);
  const descuento = Math.round(subtotal * pago.descuento);
  const envio = entrega.tipo === 'envio' ? CONFIGURACION.costoEnvio : 0;
  return {
    metodo, cliente, entrega, lineas,
    unidades: lineas.reduce((suma, linea) => suma + linea.cantidad, 0),
    subtotal, descuento, envio,
    total: subtotal - descuento + envio,
  };
}

function desarmar(fila: Registro | null): Pedido | null {
  if (!fila) return null;
  return { ...JSON.parse(fila.datos), id: fila.id, token: fila.token, estado: fila.estado, metodo: fila.metodo, total: fila.total, pagoId: fila.pago_id, creadoEn: fila.creado_en, actualizadoEn: fila.actualizado_en };
}

export async function crearPedido(db: BaseDatos, entrada: unknown) {
  await asegurarTablaPedidos(db);
  const cotizacion = await cotizarPedido(db, entrada);
  const token = crypto.randomUUID().replace(/-/g, '');
  const ahora = new Date().toISOString();
  const estado = METODOS_PAGO[cotizacion.metodo].mercadoPago ? 'esperando_pago' : 'esperando_transferencia';
  await db.prepare('INSERT INTO pedidos (token, estado, metodo, total, datos, creado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(token, estado, cotizacion.metodo, cotizacion.total, JSON.stringify(cotizacion), ahora, ahora).run();
  return (await leerPedido(db, token))!;
}

export async function leerPedido(db: BaseDatos, token: string) {
  await asegurarTablaPedidos(db);
  if (!/^[a-f0-9]{32}$/.test(String(token))) return null;
  return desarmar(await db.prepare('SELECT * FROM pedidos WHERE token = ?').bind(token).first<Registro>());
}

export async function leerPedidoPorId(db: BaseDatos, id: number) {
  await asegurarTablaPedidos(db);
  return desarmar(await db.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first<Registro>());
}

export async function listarPedidos(db: BaseDatos) {
  await asegurarTablaPedidos(db);
  const filas = await db.prepare('SELECT * FROM pedidos ORDER BY id DESC LIMIT 100').all<Registro>();
  return filas.results.map(fila => desarmar(fila)!);
}

async function guardarDatos(db: BaseDatos, pedido: Pedido, cambios: Partial<Pedido>) {
  const { id, token, estado, metodo, total, pagoId, creadoEn, actualizadoEn, ...datos } = { ...pedido, ...cambios };
  await db.prepare('UPDATE pedidos SET datos = ?, actualizado_en = ? WHERE id = ?').bind(JSON.stringify(datos), new Date().toISOString(), pedido.id).run();
}

// Marca el pedido como pagado una sola vez y registra la venta web, que descuenta el stock.
// La clave de la venta es fija por pedido: si se repite, el inventario no descuenta dos veces.
export async function marcarPagado(db: BaseDatos, pedido: Pedido, { actor, pagoId = null, nota = '' }: { actor: string; pagoId?: string | null; nota?: string }) {
  const ahora = new Date().toISOString();
  const resultado = await db.prepare("UPDATE pedidos SET estado = 'pagado', pago_id = COALESCE(?, pago_id), actualizado_en = ? WHERE id = ? AND estado IN ('esperando_pago', 'esperando_transferencia', 'rechazado')")
    .bind(pagoId, ahora, pedido.id).run();
  const actual = (await leerPedidoPorId(db, pedido.id))!;
  if (!resultado.meta?.changes) return actual;
  const cambios: Partial<Pedido> = { pagadoEn: ahora, pagadoPor: actor, ...(nota ? { notaPago: nota } : {}) };
  try {
    const { venta } = await confirmarVenta(db, {
      claveOperacion: `pedido-${actual.token}`,
      canal: 'web',
      lineas: actual.lineas.map(linea => ({ sku: linea.sku, cantidad: linea.cantidad })),
      nota: `Pedido web #${actual.id} · ${actual.cliente.nombre} · ${METODOS_PAGO[actual.metodo]?.nombre ?? actual.metodo}`,
    }, `pedido-web:${actor}`);
    cambios.ventaId = venta.id;
  } catch (error) {
    cambios.problemaStock = error instanceof ErrorInventario ? error.message : 'No se pudo descontar el stock automáticamente.';
  }
  await guardarDatos(db, actual, cambios);
  return (await leerPedidoPorId(db, pedido.id))!;
}

export async function cambiarEstado(db: BaseDatos, pedido: Pedido, estado: 'rechazado' | 'cancelado' | 'esperando_pago', pagoId: string | null = null) {
  await db.prepare("UPDATE pedidos SET estado = ?, pago_id = COALESCE(?, pago_id), actualizado_en = ? WHERE id = ? AND estado != 'pagado'")
    .bind(estado, pagoId, new Date().toISOString(), pedido.id).run();
  return (await leerPedidoPorId(db, pedido.id))!;
}
