import panel from '../../tienda/admin.html?raw';
import { clienteGoogle, sesionAdministracion } from '../../lib/acceso';
import { paginaIngreso } from '../../lib/pagina-ingreso';

export const dynamic = 'force-dynamic';

const html = (cuerpo: string, estado = 200) => new Response(cuerpo, {
  status: estado,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});

export async function GET() {
  const sesion = await sesionAdministracion();
  if (!sesion.admin) return html(paginaIngreso({ clientId: clienteGoogle() }), 401);
  return html(panel);
}
