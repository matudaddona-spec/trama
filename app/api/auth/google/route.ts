import { AuthError, createSession, isAuthorized, sessionCookie, verifyGoogleCredential } from '../../../../lib/admin-auth.mjs';
import { claveSesion, clienteGoogle, jsonSinCache, leerCuerpo, responderError } from '../../../../lib/acceso';
import { ErrorInventario } from '../../../../lib/inventario';

export const dynamic = 'force-dynamic';

// Recibe el token firmado por Google, lo verifica y abre una sesión si el correo está autorizado.
export async function POST(peticion: Request) {
  try {
    const url = new URL(peticion.url);
    const origen = peticion.headers.get('origin');
    if (!origen || origen !== url.origin) throw new ErrorInventario('La solicitud debe hacerse desde esta tienda.', 403);
    const { credential } = (await leerCuerpo(peticion)) as { credential?: string };
    try {
      const usuario = await verifyGoogleCredential(credential, clienteGoogle());
      if (!isAuthorized(usuario.email)) return jsonSinCache({ error: 'No tenés autorización para entrar al panel.', email: usuario.email }, 403);
      const sesion = await createSession(usuario, claveSesion());
      return new Response(JSON.stringify({ ok: true, email: usuario.email }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': sessionCookie(sesion, url.protocol === 'https:') },
      });
    } catch (error) {
      if (error instanceof AuthError) return jsonSinCache({ error: error.message }, (error as AuthError & { status: number }).status === 403 ? 400 : (error as AuthError & { status: number }).status);
      throw error;
    }
  } catch (error) { return responderError(error); }
}
