import { baseDeDatos, exigirAdministracion, jsonSinCache, leerCuerpo, responderError } from '../../../../lib/acceso';
import { confirmarVenta } from '../../../../lib/inventario';

export const dynamic = 'force-dynamic';

export async function POST(peticion: Request) {
  try {
    const usuario = await exigirAdministracion(peticion);
    const resultado = await confirmarVenta(baseDeDatos(), await leerCuerpo(peticion), usuario.userId);
    return jsonSinCache(resultado);
  } catch (error) { return responderError(error); }
}
