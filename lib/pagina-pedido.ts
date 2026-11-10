// Página de seguimiento del pedido: estado del pago, detalle y datos para transferir.
import { CONFIGURACION } from '../public/assets/js/configuracion.js';
import { ESTADOS_PEDIDO, METODOS_PAGO, type Pedido } from './pedidos';

const e = (texto: unknown) => String(texto ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const plata = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

const titulos: Record<string, [string, string]> = {
  pagado: ['¡Listo, tu compra está paga!', 'Ya estamos preparando tu pedido. Te escribimos por WhatsApp para coordinar la entrega.'],
  esperando_transferencia: ['Pedido recibido', 'Transferí el total a esta cuenta. Cuando la veamos, confirmamos el pago y preparamos tu pedido.'],
  esperando_pago: ['Falta completar el pago', 'Tu pedido quedó guardado. Podés pagarlo ahora con Mercado Pago.'],
  rechazado: ['El pago no se aprobó', 'No se hizo ningún cobro. Podés intentar de nuevo o con otro medio de pago.'],
  cancelado: ['Pedido cancelado', 'Si fue un error, escribinos y lo resolvemos.'],
};

export function paginaPedido(pedido: Pedido, banco: { alias: string; cbu: string; titular: string; banco: string }) {
  const [titulo, bajada] = titulos[pedido.estado] || [ESTADOS_PEDIDO[pedido.estado] || pedido.estado, ''];
  const metodo = METODOS_PAGO[pedido.metodo];
  const puedePagar = metodo?.mercadoPago && ['esperando_pago', 'rechazado'].includes(pedido.estado);
  const vaciarBolsa = ['pagado', 'esperando_transferencia'].includes(pedido.estado);
  const icono = pedido.estado === 'pagado' ? '✓' : ['rechazado', 'cancelado'].includes(pedido.estado) ? '!' : '…';
  const whatsapp = `https://wa.me/${CONFIGURACION.telefonoWhatsapp}?text=${encodeURIComponent(
    pedido.estado === 'esperando_transferencia'
      ? `Hola ${CONFIGURACION.nombreTienda}, te paso el comprobante de la transferencia del pedido #${pedido.id} (${plata(pedido.total)}).`
      : `Hola ${CONFIGURACION.nombreTienda}, te escribo por el pedido #${pedido.id}.`,
  )}`;
  const entrega = pedido.entrega.tipo === 'envio'
    ? `Envío en moto a ${e(pedido.entrega.direccion)} · ${e(pedido.entrega.fecha)}, ${e(pedido.entrega.horario)}`
    : `Retiro en el showroom · ${e(pedido.entrega.fecha)}, ${e(pedido.entrega.horario)}`;

  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#121212">
<title>Pedido #${pedido.id} · TRAMA</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23121212'/%3E%3Cpath d='M14 18h36v8H36v26h-8V26H14z' fill='%23ff5a1f'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
:root{--tinta:#121212;--hueso:#f1efe9;--papel:#faf9f6;--gris:#77746d;--linea:#d9d6cd;--senal:#ff5a1f;--verde:#1f7a4a;--alerta:#b3261e}
*{box-sizing:border-box}
body{margin:0;background:var(--papel);color:var(--tinta);font-family:Archivo,Arial,sans-serif;line-height:1.5}
header{background:var(--tinta);padding:16px}
header a{color:var(--papel);text-decoration:none;font-weight:900;font-stretch:75%;font-size:28px}
header sup{color:var(--senal);font-size:12px}
main{max-width:680px;margin:0 auto;padding:32px 16px 64px;display:grid;gap:16px}
.tarjeta{background:#fff;border:1px solid var(--linea);padding:24px}
.estado{display:flex;gap:18px;align-items:flex-start;border-top:4px solid var(--tinta)}
.estado-pagado{border-top-color:var(--verde)}
.estado-rechazado,.estado-cancelado{border-top-color:var(--alerta)}
.estado-esperando_transferencia,.estado-esperando_pago{border-top-color:var(--senal)}
.icono{flex:0 0 52px;height:52px;display:grid;place-items:center;font-weight:900;font-size:24px;background:var(--hueso)}
.estado-pagado .icono{background:var(--verde);color:#fff}
.estado-rechazado .icono,.estado-cancelado .icono{background:#f7e3e1;color:var(--alerta)}
.mono{font-family:'JetBrains Mono',monospace;font-size:12px;text-transform:uppercase;color:var(--gris);margin:0 0 8px}
h1{font-weight:900;font-stretch:75%;font-size:34px;line-height:1;text-transform:uppercase;margin:0 0 8px}
p{margin:0;color:#3b3a37}
ul{list-style:none;margin:0;padding:0}
li{display:flex;gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid var(--linea)}
li img{width:56px;height:70px;object-fit:cover;background:var(--hueso)}
li span{flex:1;font-weight:700}
li small{display:block;color:var(--gris);font-weight:400}
.fila{display:flex;justify-content:space-between;padding:6px 0;color:#3b3a37}
.fila.total{border-top:1.5px solid var(--tinta);margin-top:8px;padding-top:12px;font-weight:900;font-size:22px;color:var(--tinta)}
.fila.descuento span:last-child{color:var(--verde);font-weight:700}
dl{display:grid;grid-template-columns:auto 1fr;gap:10px 16px;margin:0}
dt{color:var(--gris)}
dd{margin:0;font-weight:700;word-break:break-all;display:flex;gap:8px;align-items:center;justify-content:space-between}
.copiar{border:1px solid var(--linea);background:var(--papel);padding:4px 10px;font:600 12px Archivo,sans-serif;cursor:pointer}
.boton{display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:0 20px;border:1.5px solid var(--senal);background:var(--senal);color:var(--tinta);font:700 15px Archivo,sans-serif;text-transform:uppercase;text-decoration:none;cursor:pointer;width:100%;margin-top:16px}
.boton:hover{background:var(--tinta);border-color:var(--tinta);color:#fff}
.boton-borde{background:transparent;border-color:var(--tinta)}
.boton[disabled]{opacity:.6;cursor:wait}
.error{color:var(--alerta);margin-top:10px}
.nota{font-size:13px;color:var(--gris);margin-top:12px}
.demo{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--gris);text-transform:uppercase;text-align:center}
</style>
</head>
<body>
<header><a href="/" aria-label="TRAMA, volver a la tienda">TRAMA<sup>®</sup></a></header>
<main>
<section class="tarjeta estado estado-${e(pedido.estado)}" aria-live="polite">
<div class="icono" aria-hidden="true">${icono}</div>
<div><p class="mono">Pedido #${pedido.id} · ${e(ESTADOS_PEDIDO[pedido.estado] || pedido.estado)}</p><h1>${e(titulo)}</h1><p>${e(bajada)}</p></div>
</section>
${pedido.estado === 'esperando_transferencia' ? `<section class="tarjeta"><p class="mono">Datos para transferir</p><dl>
<dt>Monto</dt><dd>${plata(pedido.total)}</dd>
<dt>Alias</dt><dd><span>${e(banco.alias)}</span><button class="copiar" data-copiar="${e(banco.alias)}">Copiar</button></dd>
<dt>CBU</dt><dd><span>${e(banco.cbu)}</span><button class="copiar" data-copiar="${e(banco.cbu)}">Copiar</button></dd>
<dt>Titular</dt><dd>${e(banco.titular)}</dd>
<dt>Banco</dt><dd>${e(banco.banco)}</dd>
</dl><a class="boton" href="${e(whatsapp)}" target="_blank" rel="noopener noreferrer">Mandar el comprobante por WhatsApp</a>
<p class="nota">Cuando veamos la transferencia confirmamos tu pedido. Datos bancarios de demostración: no transfieras dinero real.</p></section>` : ''}
${puedePagar ? `<section class="tarjeta"><p class="mono">${e(metodo.nombre)}</p><p>Total a pagar: <b>${plata(pedido.total)}</b>${metodo.cuotas > 1 ? ` · hasta ${metodo.cuotas} cuotas sin interés` : ''}</p><button class="boton" id="pagar" type="button">Pagar con Mercado Pago</button><p class="error" id="error" role="alert"></p></section>` : ''}
<section class="tarjeta"><p class="mono">Tu pedido</p><ul>${pedido.lineas.map(linea => `<li>${linea.foto ? `<img src="${e(linea.foto)}" alt="">` : ''}<span>${e(linea.nombre)}<small>${e(linea.color)} · talle ${e(linea.talle)} · ${linea.cantidad} ${linea.cantidad === 1 ? 'unidad' : 'unidades'}</small></span><b>${plata(linea.precio * linea.cantidad)}</b></li>`).join('')}</ul>
<div class="fila"><span>Subtotal</span><span>${plata(pedido.subtotal)}</span></div>
${pedido.descuento ? `<div class="fila descuento"><span>10% OFF por transferencia</span><span>−${plata(pedido.descuento)}</span></div>` : ''}
<div class="fila"><span>${pedido.entrega.tipo === 'envio' ? 'Envío en moto' : 'Retiro'}</span><span>${pedido.envio ? plata(pedido.envio) : 'Sin cargo'}</span></div>
<div class="fila total"><span>Total</span><span>${plata(pedido.total)}</span></div>
<p class="nota">${entrega}. Pago: ${e(metodo?.nombre || pedido.metodo)}.</p>
</section>
<a class="boton boton-borde" href="/#coleccion">Seguir mirando la tienda</a>
<a class="boton boton-borde" href="${e(whatsapp)}" target="_blank" rel="noopener noreferrer">¿Dudas? Escribinos por WhatsApp</a>
<p class="demo">Tienda de demostración · pagos de prueba, sin cobros reales</p>
</main>
<script>
${vaciarBolsa ? `try { localStorage.removeItem(${JSON.stringify(CONFIGURACION.claveCarrito)}); } catch {}` : ''}
document.addEventListener('click', async evento => {
  const copiar = evento.target.closest('[data-copiar]');
  if (copiar) {
    try { await navigator.clipboard.writeText(copiar.dataset.copiar); copiar.textContent = '¡Copiado!'; } catch {}
    return;
  }
  const pagar = evento.target.closest('#pagar');
  if (!pagar) return;
  pagar.disabled = true;
  pagar.textContent = 'Abriendo Mercado Pago…';
  try {
    const respuesta = await fetch(${JSON.stringify(`/api/pedidos/${pedido.token}/pagar`)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !datos.destino) throw new Error(datos.error || 'No se pudo abrir Mercado Pago.');
    location.href = datos.destino;
  } catch (error) {
    document.getElementById('error').textContent = error.message;
    pagar.disabled = false;
    pagar.textContent = 'Pagar con Mercado Pago';
  }
});
</script>
</body>
</html>`;
}
