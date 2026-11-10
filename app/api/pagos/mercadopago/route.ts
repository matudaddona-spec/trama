import { baseDeDatos, jsonSinCache } from '../../../../lib/acceso';
import { aplicarPago, consultarPago, tokenMercadoPago } from '../../../../lib/mercadopago';
import { leerPedido } from '../../../../lib/pedidos';

export const dynamic = 'force-dynamic';

// Aviso automático de Mercado Pago cuando cambia un pago (sólo con la web publicada en https).
// El aviso no se cree: el pago se vuelve a consultar en la API antes de tocar el pedido.
export async function POST(peticion: Request) {
  try {
    const url = new URL(peticion.url);
    const cuerpo: any = await peticion.json().catch(() => ({}));
    const tipo = url.searchParams.get('type') || url.searchParams.get('topic') || cuerpo?.type;
    const id = url.searchParams.get('data.id') || url.searchParams.get('id') || cuerpo?.data?.id;
    const token = tokenMercadoPago();
    if (tipo !== 'payment' || !id || !token) return jsonSinCache({ ok: true });
    const pago = await consultarPago(token, String(id));
    const db = baseDeDatos();
    const pedido = await leerPedido(db, pago.external_reference);
    if (pedido && pedido.estado !== 'pagado') await aplicarPago(db, token, pedido, String(id));
  } catch (error) {
    console.error('No se pudo procesar el aviso de Mercado Pago:', (error as Error)?.message);
  }
  return jsonSinCache({ ok: true });
}
