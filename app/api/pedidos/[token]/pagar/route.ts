import { baseDeDatos, exigirPeticionDeTienda, jsonSinCache, responderError } from '../../../../../lib/acceso';
import { ErrorInventario } from '../../../../../lib/inventario';
import { crearLinkDePago, tokenMercadoPago } from '../../../../../lib/mercadopago';
import { METODOS_PAGO, leerPedido } from '../../../../../lib/pedidos';

export const dynamic = 'force-dynamic';

// Reintentar el pago de un pedido que quedó sin pagar o fue rechazado.
export async function POST(peticion: Request, contexto: { params: Promise<{ token: string }> }) {
  try {
    exigirPeticionDeTienda(peticion);
    const { token } = await contexto.params;
    const pedido = await leerPedido(baseDeDatos(), token);
    if (!pedido) throw new ErrorInventario('No encontramos el pedido.', 404);
    if (!METODOS_PAGO[pedido.metodo]?.mercadoPago || !['esperando_pago', 'rechazado'].includes(pedido.estado)) {
      throw new ErrorInventario('Este pedido ya no se puede pagar.', 409);
    }
    return jsonSinCache({ destino: await crearLinkDePago(tokenMercadoPago(), pedido, new URL(peticion.url).origin) });
  } catch (error) { return responderError(error); }
}
