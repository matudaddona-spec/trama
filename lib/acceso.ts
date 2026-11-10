import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { GOOGLE_CLIENT_ID, readSession } from './admin-auth.mjs';
import { ErrorInventario } from './inventario';

type Variables = Cloudflare.Env & { SESSION_SECRET?: string; GOOGLE_CLIENT_ID?: string };
const variables = () => env as Variables;

// En producción la clave se carga con `wrangler secret put SESSION_SECRET`.
export const claveSesion = () => variables().SESSION_SECRET || (import.meta.env.DEV ? 'trama-clave-solo-para-desarrollo-local' : '');
export const clienteGoogle = () => variables().GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID;

// El acceso es con Google: el servidor verifica la cuenta y guarda una sesión firmada en una cookie.
// En la compu (modo desarrollo) también sirve el acceso local de prueba.
export async function sesionAdministracion() {
  const sesion = await readSession((await headers()).get('cookie'), claveSesion());
  if (sesion) return { usuario: { userId: sesion.email, email: sesion.email, nombre: sesion.name }, admin: true };
  if (import.meta.env.DEV) {
    const local = await getChatGPTUser();
    if (local?.email === 'seedy@sites.test') return { usuario: { userId: local.userId, email: local.email, nombre: local.displayName }, admin: true };
  }
  return { usuario: null, admin: false };
}

export async function exigirAdministracion(peticion?: Request) {
  const sesion = await sesionAdministracion();
  if (!sesion.usuario) throw new ErrorInventario('Iniciá sesión para administrar el stock.', 401);
  if (!sesion.admin) throw new ErrorInventario('Tu cuenta no tiene acceso a la administración del stock.', 403);
  if (peticion) {
    const origen = peticion.headers.get('origin');
    if (!origen || origen !== new URL(peticion.url).origin) throw new ErrorInventario('La solicitud debe hacerse desde el panel de esta tienda.', 403);
    if (!/^application\/json(?:\s*;|$)/i.test(peticion.headers.get('content-type') || '')) throw new ErrorInventario('La solicitud debe enviarse como JSON.', 415);
  }
  return sesion.usuario;
}

export async function leerCuerpo(peticion: Request): Promise<unknown> {
  const longitud = Number(peticion.headers.get('content-length') || 0);
  if (longitud > 32_768) throw new ErrorInventario('La solicitud es demasiado grande.', 413);
  const texto = await peticion.text();
  if (new TextEncoder().encode(texto).byteLength > 32_768) throw new ErrorInventario('La solicitud es demasiado grande.', 413);
  try { return JSON.parse(texto); }
  catch { throw new ErrorInventario('No pudimos interpretar los datos enviados.'); }
}

// Las compras sólo se aceptan desde la propia tienda y como JSON.
export function exigirPeticionDeTienda(peticion: Request) {
  const origen = peticion.headers.get('origin');
  if (!origen || origen !== new URL(peticion.url).origin) throw new ErrorInventario('La compra debe hacerse desde la tienda.', 403);
  if (!/^application\/json(?:\s*;|$)/i.test(peticion.headers.get('content-type') || '')) throw new ErrorInventario('La solicitud debe enviarse como JSON.', 415);
}

export function baseDeDatos(): D1Database {
  if (!env.DB) throw new Error('El inventario compartido no está configurado.');
  return env.DB;
}

export function jsonSinCache(valor: unknown, estado = 200) {
  return Response.json(valor, { status: estado, headers: { 'Cache-Control': 'no-store', 'Vary': 'Cookie' } });
}

export function responderError(error: unknown) {
  if (error instanceof ErrorInventario) return jsonSinCache({ error: error.message }, error.estado);
  console.error('No se pudo completar una solicitud del inventario.');
  return jsonSinCache({ error: 'No pudimos completar la operación. Podés reintentar sin duplicarla.' }, 500);
}
