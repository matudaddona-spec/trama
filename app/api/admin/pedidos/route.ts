import { baseDeDatos, exigirAdministracion, jsonSinCache, responderError } from '../../../../lib/acceso';
import { sincronizarPedido, tokenMercadoPago } from '../../../../lib/mercadopago';
import { ESTADOS_PEDIDO, METODOS_PAGO, listarPedidos } from '../../../../lib/pedidos';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await exigirAdministracion();
    const db = baseDeDatos();
    // Antes de mostrar, revisa en Mercado Pago los pedidos que siguen esperando el pago.
    const token = tokenMercadoPago();
    if (token) {
      const pendientes = (await listarPedidos(db)).filter(pedido => ['esperando_pago', 'rechazado'].includes(pedido.estado)).slice(0, 10);
      for (const pedido of pendientes) {
        await sincronizarPedido(db, token, pedido).catch(error => console.error('No se pudo revisar el pedido', pedido.id, error?.message));
      }
    }
    const metodos = Object.fromEntries(Object.entries(METODOS_PAGO).map(([clave, metodo]) => [clave, metodo.nombre]));
    return jsonSinCache({ pedidos: await listarPedidos(db), estados: ESTADOS_PEDIDO, metodos });
  } catch (error) { return responderError(error); }
}
