import { baseDeDatos, jsonSinCache, responderError } from '../../../lib/acceso';
import { leerCatalogo } from '../../../lib/inventario';

export const dynamic = 'force-dynamic';

export async function GET() {
  try { return jsonSinCache(await leerCatalogo(baseDeDatos())); }
  catch (error) { return responderError(error); }
}
