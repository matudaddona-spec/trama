import { baseDeDatos, exigirAdministracion, jsonSinCache, responderError } from '../../../../lib/acceso';
import { leerInventario } from '../../../../lib/inventario';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await exigirAdministracion();
    return jsonSinCache(await leerInventario(baseDeDatos()));
  } catch (error) { return responderError(error); }
}
