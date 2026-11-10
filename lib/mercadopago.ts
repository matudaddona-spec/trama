// Cobro con Mercado Pago (Checkout Pro), en modo de prueba para la demo.
// La clave (MP_ACCESS_TOKEN) va en .dev.vars o en los secretos del servidor; nunca llega al navegador.
import { env } from 'cloudflare:workers';
import { ErrorInventario } from './inventario';
import { METODOS_PAGO, cambiarEstado, marcarPagado, type Pedido } from './pedidos';

type BaseDatos = D1Database;
const API = 'https://api.mercadopago.com';
const variables = () => env as Cloudflare.Env & Record<string, string | undefined>;

export const tokenMercadoPago = () => variables().MP_ACCESS_TOKEN || '';
export const datosBancarios = () => ({
  alias: variables().BANK_ALIAS || 'TRAMA.ROPA.DEMO',
  cbu: variables().BANK_CBU || '0000003100000000000001',
  titular: variables().BANK_HOLDER || 'TRAMA (cuenta de demostración)',
  banco: variables().BANK_NAME || 'Banco de demostración',
});

async function llamar(token: string, ruta: string, opciones: RequestInit = {}) {
  if (!token) throw new ErrorInventario('El pago con Mercado Pago todavía no está configurado. Elegí transferencia.', 503);
  const respuesta = await fetch(API + ruta, {
    ...opciones,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) },
  });
  const datos: any = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    console.error('Mercado Pago respondió', respuesta.status, datos?.message || datos?.error);
    throw new ErrorInventario(respuesta.status === 401 ? 'La clave de Mercado Pago no es válida. Revisá MP_ACCESS_TOKEN.' : 'Mercado Pago no respondió. Volvé a intentar en unos segundos.', 502);
  }
  return datos;
}

// Arma el link de pago al que va el comprador.
export async function crearLinkDePago(token: string, pedido: Pedido, origen: string) {
  const metodo = METODOS_PAGO[pedido.metodo];
  const seguro = origen.startsWith('https://');
  const vuelta = `${origen}/pedido/${pedido.token}`;
  const items = pedido.lineas.map(linea => ({
    id: linea.sku,
    title: `${linea.nombre} · ${linea.color} · Talle ${linea.talle}`,
    quantity: linea.cantidad,
    unit_price: linea.precio,
    currency_id: 'ARS',
    ...(seguro && linea.foto ? { picture_url: origen + linea.foto } : {}),
  }));
  if (pedido.envio) items.push({ id: 'envio', title: 'Envío en moto', quantity: 1, unit_price: pedido.envio, currency_id: 'ARS' });
  const excluidos = [{ id: 'ticket' }, { id: 'atm' }];
  const cuerpo = {
    items,
    payer: { name: pedido.cliente.nombre, email: pedido.cliente.email },
    external_reference: pedido.token,
    statement_descriptor: 'TRAMA',
    back_urls: { success: vuelta, pending: vuelta, failure: vuelta },
    ...(seguro ? { auto_return: 'approved', notification_url: `${origen}/api/pagos/mercadopago` } : {}),
    payment_methods: { excluded_payment_types: excluidos, installments: metodo.cuotas },
    metadata: { pedido: pedido.id },
  };
  const datos = await llamar(token, '/checkout/preferences', { method: 'POST', body: JSON.stringify(cuerpo), headers: { 'X-Idempotency-Key': `pref-${pedido.token}-${pedido.actualizadoEn}` } });
  const link = token.startsWith('TEST-') ? datos.sandbox_init_point || datos.init_point : datos.init_point;
  if (!link) throw new ErrorInventario('Mercado Pago no devolvió el link de pago.', 502);
  return link as string;
}

export function consultarPago(token: string, pagoId: string) {
  if (!/^\d{1,30}$/.test(String(pagoId))) throw new ErrorInventario('Pago inválido.');
  return llamar(token, `/v1/payments/${pagoId}`);
}

// Consulta el pago en Mercado Pago (nunca se confía en lo que dice la dirección) y actualiza el pedido.
export async function aplicarPago(db: BaseDatos, token: string, pedido: Pedido, pagoId: string) {
  if (!/^\d{1,30}$/.test(String(pagoId))) return pedido;
  const pago = await consultarPago(token, pagoId);
  if (pago.external_reference !== pedido.token) return pedido;
  if (pago.status === 'approved') {
    const pagado = Number(pago.transaction_amount);
    if (pago.currency_id !== 'ARS' || Math.abs(pagado - pedido.total) > 0.5) return cambiarEstado(db, pedido, 'rechazado', String(pago.id));
    const cuotas = pago.installments > 1 ? ` ${pago.installments} cuotas` : '';
    return marcarPagado(db, pedido, { actor: 'Mercado Pago', pagoId: String(pago.id), nota: `${pago.payment_method_id || ''}${cuotas}`.trim() });
  }
  if (['rejected', 'cancelled'].includes(pago.status)) return cambiarEstado(db, pedido, 'rechazado', String(pago.id));
  return pedido;
}

// Busca los pagos del pedido por si el comprador no volvió a la tienda.
export async function sincronizarPedido(db: BaseDatos, token: string, pedido: Pedido) {
  if (!token || !['esperando_pago', 'rechazado'].includes(pedido.estado)) return pedido;
  const datos = await llamar(token, `/v1/payments/search?sort=date_created&criteria=desc&limit=10&external_reference=${encodeURIComponent(pedido.token)}`);
  const pagos: any[] = datos.results || [];
  const aprobado = pagos.find(pago => pago.status === 'approved' && pago.external_reference === pedido.token);
  const ultimo = aprobado || pagos.find(pago => pago.external_reference === pedido.token);
  return ultimo ? aplicarPago(db, token, pedido, String(ultimo.id)) : pedido;
}
