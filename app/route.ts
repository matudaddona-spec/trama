import tiendaHtml from '../tienda/index.html?raw';

// Se conserva la tienda de HTML/CSS/JS existente. Vinext aporta las rutas del servidor.
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(tiendaHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
