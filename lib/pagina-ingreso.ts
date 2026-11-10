// Pantalla de ingreso al administrador con el botón oficial de Google.
const e = (texto: unknown) => String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function paginaIngreso({ clientId, mensaje = '' }: { clientId: string; mensaje?: string }) {
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Ingresar · Administración de TRAMA</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23121212'/%3E%3Cpath d='M14 18h36v8H36v26h-8V26H14z' fill='%23ff5a1f'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{--tinta:#121212;--papel:#faf9f6;--hueso:#f1efe9;--gris:#77746d;--linea:#d9d6cd;--senal:#ff5a1f;--alerta:#b3261e}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:var(--tinta);color:var(--tinta);font-family:Archivo,Arial,sans-serif}
.tarjeta{width:100%;max-width:420px;background:var(--papel);border-top:6px solid var(--senal);padding:36px 30px;text-align:center}
.marca{font-weight:900;font-stretch:75%;font-size:40px;text-decoration:none;color:var(--tinta)}
.marca sup{color:var(--senal);font-size:14px}
.mono{font-family:'JetBrains Mono',monospace;font-size:12px;text-transform:uppercase;color:var(--gris);margin:18px 0 8px}
h1{font-weight:900;font-stretch:75%;font-size:34px;text-transform:uppercase;margin:0 0 10px}
p{color:#3b3a37;line-height:1.6;margin:0 0 24px}
#boton-google{display:flex;justify-content:center;min-height:44px}
.aviso{display:none;margin-top:20px;padding:14px 16px;text-align:left;font-size:14px;line-height:1.5;background:#f7e3e1;color:var(--alerta)}
.aviso.visible{display:block}
.aviso strong{display:block;text-transform:uppercase;margin-bottom:4px}
.volver{display:inline-block;margin-top:24px;color:var(--gris);font-size:14px}
</style>
</head>
<body>
<main class="tarjeta" aria-labelledby="titulo">
<a class="marca" href="/" aria-label="TRAMA, volver a la tienda">TRAMA<sup>®</sup></a>
<p class="mono">Acceso privado</p>
<h1 id="titulo">Administración</h1>
<p>Ingresá con tu cuenta de Google. Sólo las cuentas autorizadas pueden entrar al panel.</p>
<div id="boton-google"></div>
<div id="aviso" class="aviso ${mensaje ? 'visible' : ''}" role="alert">${mensaje ? `<strong>Sin acceso</strong>${e(mensaje)}` : ''}</div>
<a class="volver" href="/">← Volver a la tienda</a>
</main>
<script>
function mostrar(titulo, texto) {
  const caja = document.getElementById('aviso');
  caja.className = 'aviso visible';
  caja.innerHTML = '';
  const t = document.createElement('strong');
  t.textContent = titulo;
  caja.append(t, document.createTextNode(texto));
}
async function alIngresar(respuesta) {
  try {
    const r = await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: respuesta.credential }) });
    const datos = await r.json().catch(() => ({}));
    if (r.ok) return location.replace('/admin');
    if (r.status === 403) return mostrar('No tenés autorización', (datos.email ? 'La cuenta ' + datos.email + ' no' : 'Esta cuenta no') + ' tiene permiso para entrar al panel.');
    mostrar('No se pudo ingresar', datos.error || 'Volvé a intentar en unos segundos.');
  } catch {
    mostrar('No se pudo ingresar', 'Revisá tu conexión y volvé a intentar.');
  }
}
function iniciarGoogle() {
  google.accounts.id.initialize({ client_id: ${JSON.stringify(clientId)}, callback: alIngresar, ux_mode: 'popup' });
  google.accounts.id.renderButton(document.getElementById('boton-google'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'es' });
}
</script>
<script src="https://accounts.google.com/gsi/client" async defer onload="iniciarGoogle()"></script>
</body>
</html>`;
}
