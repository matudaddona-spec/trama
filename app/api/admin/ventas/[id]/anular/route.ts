import { baseDeDatos, exigirAdministracion, jsonSinCache, leerCuerpo, responderError } from '../../../../../../lib/acceso';
import { anularVenta } from '../../../../../../lib/inventario';

export const dynamic = 'force-dynamic';

export async function POST(peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await exigirAdministracion(peticion);
    const { id } = await contexto.params;
    const resultado = await anularVenta(baseDeDatos(), id, await leerCuerpo(peticion), usuario.userId);
    return jsonSinCache(resultado);
  } catch (error) { return responderError(error); }
}
