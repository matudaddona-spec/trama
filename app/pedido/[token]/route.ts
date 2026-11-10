import { baseDeDatos } from '../../../lib/acceso';
import { aplicarPago, datosBancarios, sincronizarPedido, tokenMercadoPago } from '../../../lib/mercadopago';
import { paginaPedido } from '../../../lib/pagina-pedido';
import { leerPedido } from '../../../lib/pedidos';

export const dynamic = 'force-dynamic';

const html = (cuerpo: string, estado = 200) => new Response(cuerpo, {
  status: estado,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' },
});

// Mercado Pago vuelve acá con el número de pago. El pago se consulta en su API antes de cambiar el pedido.
export async function GET(peticion: Request, contexto: { params: Promise<{ token: string }> }) {
  const { token } = await contexto.params;
  const db = baseDeDatos();
  let pedido = await leerPedido(db, token);
  if (!pedido) return html('<!DOCTYPE html><html lang="es-AR"><meta charset="UTF-8"><title>Pedido · TRAMA</title><p style="font-family:sans-serif;padding:24px">No encontramos ese pedido. <a href="/">Volver a la tienda</a></p></html>', 404);
  const url = new URL(peticion.url);
  const pagoId = url.searchParams.get('payment_id') || url.searchParams.get('collection_id');
  const clave = tokenMercadoPago();
  if (pedido.estado !== 'pagado' && clave) {
    try {
      pedido = pagoId && pagoId !== 'null' ? await aplicarPago(db, clave, pedido, pagoId) : await sincronizarPedido(db, clave, pedido);
    } catch (error) {
      console.error('No se pudo verificar el pago:', (error as Error)?.message);
    }
  }
  return html(paginaPedido(pedido, datosBancarios()));
}
