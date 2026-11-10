import { baseDeDatos, exigirAdministracion, jsonSinCache, leerCuerpo, responderError } from '../../../../../lib/acceso';
import { ErrorInventario } from '../../../../../lib/inventario';
import { cambiarEstado, leerPedidoPorId, marcarPagado } from '../../../../../lib/pedidos';

export const dynamic = 'force-dynamic';

// Confirmar a mano un pago (por ejemplo, una transferencia) o cancelar un pedido sin pagar.
export async function POST(peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirAdministracion(peticion);
    const { id } = await contexto.params;
    if (!/^\d{1,10}$/.test(id)) throw new ErrorInventario('Pedido inválido.');
    const db = baseDeDatos();
    const pedido = await leerPedidoPorId(db, Number(id));
    if (!pedido) throw new ErrorInventario('No encontramos el pedido.', 404);
    const { accion } = (await leerCuerpo(peticion)) as { accion?: string };
    if (accion === 'pagado') return jsonSinCache({ pedido: await marcarPagado(db, pedido, { actor: usuario.email, nota: 'Pago confirmado a mano' }) });
    if (accion === 'cancelado') {
      if (pedido.estado === 'pagado') throw new ErrorInventario('Un pedido pagado no se cancela desde acá: anulá su venta en el historial.', 409);
      return jsonSinCache({ pedido: await cambiarEstado(db, pedido, 'cancelado') });
    }
    throw new ErrorInventario('Acción inválida.');
  } catch (error) { return responderError(error); }
}
