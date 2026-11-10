import { clearSessionCookie } from '../../../lib/admin-auth.mjs';

export const dynamic = 'force-dynamic';

export function GET(peticion: Request) {
  return new Response(null, {
    status: 303,
    headers: { Location: '/admin', 'Set-Cookie': clearSessionCookie(new URL(peticion.url).protocol === 'https:'), 'Cache-Control': 'no-store' },
  });
}
