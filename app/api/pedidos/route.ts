import { baseDeDatos, exigirPeticionDeTienda, jsonSinCache, leerCuerpo, responderError } from '../../../lib/acceso';
import { ErrorInventario } from '../../../lib/inventario';
import { crearLinkDePago, tokenMercadoPago } from '../../../lib/mercadopago';
import { METODOS_PAGO, crearPedido, type MetodoPago } from '../../../lib/pedidos';

export const dynamic = 'force-dynamic';

// Crea el pedido con precios del servidor y, si se paga con Mercado Pago, devuelve el link de pago.
export async function POST(peticion: Request) {
  try {
    exigirPeticionDeTienda(peticion);
    const entrada = (await leerCuerpo(peticion)) as { metodo?: MetodoPago };
    if (METODOS_PAGO[entrada?.metodo as MetodoPago]?.mercadoPago && !tokenMercadoPago()) {
      throw new ErrorInventario('El pago con Mercado Pago todavía no está configurado. Elegí transferencia.', 503);
    }
    const db = baseDeDatos();
    const pedido = await crearPedido(db, entrada);
    const pagina = `/pedido/${pedido.token}`;
    if (pedido.estado !== 'esperando_pago') return jsonSinCache({ token: pedido.token, destino: pagina }, 201);
    try {
      return jsonSinCache({ token: pedido.token, destino: await crearLinkDePago(tokenMercadoPago(), pedido, new URL(peticion.url).origin) }, 201);
    } catch (error) {
      console.error('No se pudo crear el link de pago:', (error as Error)?.message);
      return jsonSinCache({ token: pedido.token, destino: pagina }, 201);
    }
  } catch (error) { return responderError(error); }
}
