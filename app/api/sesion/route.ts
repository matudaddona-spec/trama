import { jsonSinCache, responderError, sesionAdministracion } from '../../../lib/acceso';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sesion = await sesionAdministracion();
    return jsonSinCache({ admin: sesion.admin });
  } catch (error) { return responderError(error); }
}
