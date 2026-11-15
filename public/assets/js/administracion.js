/* ADMINISTRACIÓN
 * Panel de stock, ventas y pedidos.
 * Este panel usa el inventario compartido del servidor.
 * Ninguna cantidad del navegador se considera una venta hasta que la API la confirma.
 */
const $ = selector => document.querySelector(selector);
const escapar = valor => String(valor ?? '').replace(/[&<>"']/g, caracter => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[caracter]);
const normalizar = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nombresCanales = { whatsapp: 'WhatsApp', local: 'Local', instagram: 'Instagram', web: 'Web' };
const CLAVE_PENDIENTE = 'trama-admin-operacion-pendiente-v1';
const estado = {
  variantes: [],
  ventas: [],
  ventaSku: null,
  ajusteSku: null,
  ventaAnular: null,
  enviando: false,
  pendiente: null,
  consultaActual: 0,
};
let temporizadorMensaje;

function avisar(texto) {
  clearTimeout(temporizadorMensaje);
  $('#admin-mensaje').textContent = texto;
  $('#admin-mensaje').classList.add('visible');
  temporizadorMensaje = setTimeout(() => $('#admin-mensaje').classList.remove('visible'), 5500);
}

function fechaVenta(valor) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(fecha);
}

function buscarVariante(sku) {
  return estado.variantes.find(variante => variante.sku === sku);
}

function descripcionVariante(variante) {
  return `${variante.nombre} · ${variante.color} · talle ${variante.talle}`;
}

function productoElegido(variante) {
  return `<strong>${escapar(variante.nombre)}</strong>
    <p>${escapar(variante.color)} · talle ${escapar(variante.talle)}</p>
    <p>Stock actual: <b>${variante.stock}</b></p>
    <small>${escapar(variante.sku)}</small>`;
}

function mostrarAccesoDenegado() {
  $('#admin-cargando').hidden = true;
  $('#admin-panel').hidden = true;
  $('#acceso-denegado').hidden = false;
  document.querySelectorAll('dialog[open]').forEach(dialogo => dialogo.close());
  document.body.classList.remove('dialog-abierto');
}

async function consultar(url) {
  const respuesta = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
  let datos;
  try { datos = await respuesta.json(); }
  catch { datos = {}; }
  if (!respuesta.ok) {
    const error = new Error(datos.error || 'No pudimos consultar el inventario. Volvé a intentar.');
    error.estadoHttp = respuesta.status;
    throw error;
  }
  return datos;
}

function pintarInventario() {
  const termino = normalizar($('#buscar-inventario').value.trim());
  const filtro = $('#filtrar-inventario').value;
  const variantes = estado.variantes.filter(variante => {
    const coincide = normalizar(`${variante.nombre} ${variante.color} ${variante.talle} ${variante.sku}`).includes(termino);
    return coincide && (filtro === 'todos' || (filtro === 'disponibles' && variante.stock > 0) || (filtro === 'agotados' && variante.stock === 0));
  });
  $('#total-variantes').textContent = estado.variantes.length;
  $('#total-unidades').textContent = estado.variantes.reduce((suma, variante) => suma + variante.stock, 0).toLocaleString('es-AR');
  $('#total-agotadas').textContent = estado.variantes.filter(variante => variante.stock === 0).length;
  $('#conteo-inventario').textContent = `${variantes.length} de ${estado.variantes.length} variantes`;
  $('#inventario-sin-resultados').hidden = variantes.length !== 0;
  const bloqueado = estado.enviando || Boolean(estado.pendiente);
  $('#filas-inventario').innerHTML = variantes.map(variante => `<tr data-sku="${escapar(variante.sku)}">
    <td><strong>${escapar(variante.nombre)}</strong><code>${escapar(variante.sku)}</code></td>
    <td>${escapar(variante.color)}<span class="admin-variante-talle">Talle ${escapar(variante.talle)}</span></td>
    <td><span class="admin-stock ${variante.stock === 0 ? 'agotado' : ''}">${variante.stock === 0 ? 'Sin stock' : variante.stock}</span></td>
    <td><div class="admin-fila-acciones">
      <button type="button" data-vender="${escapar(variante.sku)}" aria-label="Registrar venta de ${escapar(descripcionVariante(variante))}" ${bloqueado || variante.stock === 0 ? 'disabled' : ''}>Registrar venta</button>
      <button type="button" data-ajustar="${escapar(variante.sku)}" aria-label="Ajustar stock de ${escapar(descripcionVariante(variante))}" ${bloqueado ? 'disabled' : ''}>Ajustar stock</button>
    </div></td></tr>`).join('');
}

function pintarVentas() {
  const bloqueado = estado.enviando || Boolean(estado.pendiente);
  $('#ventas-vacias').hidden = estado.ventas.length !== 0;
  $('#lista-ventas').innerHTML = estado.ventas.slice(0, 30).map(venta => {
    const anulada = venta.estado === 'anulada';
    const unidades = (venta.lineas || []).reduce((suma, linea) => suma + linea.cantidad, 0);
    return `<article class="admin-venta">
      <div class="admin-venta-cabecera"><div><h3>Venta por ${escapar(nombresCanales[venta.canal] || venta.canal)}</h3><p>${escapar(fechaVenta(venta.creadaEn))}</p></div><span class="admin-etiqueta ${anulada ? 'anulada' : ''}">${anulada ? 'Anulada · stock devuelto' : 'Confirmada'}</span></div>
      <ul>${(venta.lineas || []).map(linea => `<li>${linea.cantidad} × ${escapar(linea.nombre)} · ${escapar(linea.color)} · talle ${escapar(linea.talle)}</li>`).join('')}</ul>
      ${venta.nota ? `<p class="admin-venta-nota">${escapar(venta.nota)}</p>` : ''}
      <div class="admin-venta-pie"><span>${unidades} ${unidades === 1 ? 'unidad registrada' : 'unidades registradas'}</span>${!anulada ? `<button class="boton-texto" type="button" data-anular="${escapar(venta.id)}" aria-label="Anular venta del ${escapar(fechaVenta(venta.creadaEn))} por ${escapar(nombresCanales[venta.canal] || venta.canal)}" ${bloqueado ? 'disabled' : ''}>Anular y devolver stock</button>` : ''}</div>
    </article>`;
  }).join('');
}

function actualizarDialogos() {
  const venta = buscarVariante(estado.ventaSku);
  if (venta) {
    $('#venta-producto').innerHTML = productoElegido(venta);
    $('#venta-cantidad').max = Math.max(1, venta.stock);
    pintarPrevisionVenta();
  }
  const ajuste = buscarVariante(estado.ajusteSku);
  if (ajuste) $('#ajuste-producto').innerHTML = productoElegido(ajuste);
}

async function cargarInventario() {
  const consulta = ++estado.consultaActual;
  $('#actualizar-inventario').disabled = true;
  try {
    const datos = await consultar('/api/admin/inventario');
    if (consulta !== estado.consultaActual) return;
    if (!Array.isArray(datos.variantes) || !Array.isArray(datos.ventas)) throw new Error('La respuesta del inventario no se pudo leer.');
    estado.variantes = datos.variantes;
    estado.ventas = datos.ventas;
    pintarInventario();
    pintarVentas();
    actualizarDialogos();
    $('#ultima-consulta').textContent = `Consulta actualizada: ${new Intl.DateTimeFormat('es-AR', { timeStyle: 'short' }).format(new Date())}`;
    $('#admin-cargando').hidden = true;
    $('#admin-panel').hidden = false;
  } catch (error) {
    if (error.estadoHttp === 401 || error.estadoHttp === 403) mostrarAccesoDenegado();
    else {
      avisar(error.message);
      $('#admin-cargando').textContent = error.message;
    }
    throw error;
  } finally {
    if (consulta === estado.consultaActual) $('#actualizar-inventario').disabled = estado.enviando;
  }
}

function abrirDialogo(id) {
  document.querySelectorAll('dialog[open]').forEach(dialogo => dialogo.close());
  document.querySelectorAll('.admin-error').forEach(elemento => { elemento.hidden = true; });
  $(id).showModal();
  document.body.classList.add('dialog-abierto');
}

function abrirVenta(sku) {
  if (estado.pendiente || estado.enviando) return;
  const variante = buscarVariante(sku);
  if (!variante || variante.stock <= 0) return;
  estado.ventaSku = sku;
  $('#formulario-venta').reset();
  $('#venta-cantidad').value = '1';
  actualizarDialogos();
  abrirDialogo('#dialogo-venta');
}

function abrirAjuste(sku) {
  if (estado.pendiente || estado.enviando) return;
  const variante = buscarVariante(sku);
  if (!variante) return;
  estado.ajusteSku = sku;
  $('#formulario-ajuste').reset();
  $('#ajuste-cantidad').value = variante.stock;
  actualizarDialogos();
  abrirDialogo('#dialogo-ajuste');
}

function abrirAnulacion(id) {
  if (estado.pendiente || estado.enviando) return;
  const venta = estado.ventas.find(item => item.id === id && item.estado === 'confirmada');
  if (!venta) return;
  estado.ventaAnular = id;
  $('#anular-detalle').innerHTML = `<strong>Venta por ${escapar(nombresCanales[venta.canal] || venta.canal)}</strong><p>${escapar(fechaVenta(venta.creadaEn))}</p>${venta.lineas.map(linea => `<p>${linea.cantidad} × ${escapar(linea.nombre)} · ${escapar(linea.color)} · talle ${escapar(linea.talle)}</p>`).join('')}`;
  abrirDialogo('#dialogo-anular');
}

function pintarPrevisionVenta() {
  const variante = buscarVariante(estado.ventaSku);
  if (!variante) return;
  const cantidad = Number($('#venta-cantidad').value);
  const valida = Number.isInteger(cantidad) && cantidad > 0 && cantidad <= variante.stock;
  $('#venta-prevision').textContent = valida
    ? `${variante.stock} disponibles − ${cantidad} vendidas = ${variante.stock - cantidad} en stock.`
    : 'Elegí una cantidad dentro del stock disponible.';
  $('#venta-prevision').classList.toggle('invalida', !valida);
}

// Se conserva la misma clave al reintentar una respuesta perdida, incluso al recargar.
// Esta sesión guarda sólo datos de la operación del panel, nunca credenciales.
function guardarPendiente() {
  try {
    if (estado.pendiente) sessionStorage.setItem(CLAVE_PENDIENTE, JSON.stringify(estado.pendiente));
    else sessionStorage.removeItem(CLAVE_PENDIENTE);
  } catch { /* El panel sigue funcionando si el navegador bloquea el almacenamiento. */ }
}

function recuperarPendiente() {
  try {
    const pendiente = JSON.parse(sessionStorage.getItem(CLAVE_PENDIENTE) || 'null');
    if (!pendiente || !['venta', 'ajuste', 'anulacion'].includes(pendiente.tipo) || typeof pendiente.descripcion !== 'string') return null;
    if (!/^\/api\/admin\/(ventas|ajustes|ventas\/[^/?#]+\/anular)$/.test(pendiente.url)) return null;
    if (!pendiente.cuerpo || typeof pendiente.cuerpo.claveOperacion !== 'string') return null;
    return pendiente;
  } catch { return null; }
}

function actualizarBloqueos() {
  const bloqueado = estado.enviando || Boolean(estado.pendiente);
  document.querySelectorAll('[data-dato-operacion]').forEach(campo => { campo.disabled = bloqueado; });
  document.querySelectorAll('[data-cerrar-admin]').forEach(boton => { boton.disabled = estado.enviando; });
  const etiquetas = {
    venta: ['#confirmar-venta', 'Confirmar venta y descontar stock'],
    ajuste: ['#confirmar-ajuste', 'Guardar cantidad disponible'],
    anulacion: ['#confirmar-anulacion', 'Anular venta y devolver stock'],
  };
  for (const [tipo, [selector, etiqueta]] of Object.entries(etiquetas)) {
    $(selector).disabled = estado.enviando || Boolean(estado.pendiente && estado.pendiente.tipo !== tipo);
    $(selector).textContent = estado.enviando && estado.pendiente?.tipo === tipo
      ? 'Guardando…'
      : estado.pendiente?.tipo === tipo ? 'Reintentar la misma operación' : etiqueta;
  }
  $('#operacion-pendiente').hidden = !estado.pendiente;
  $('#pendiente-descripcion').textContent = estado.pendiente?.descripcion || '';
  $('#reintentar-operacion').disabled = estado.enviando;
  $('#actualizar-inventario').disabled = estado.enviando;
  pintarInventario();
  pintarVentas();
}

function mostrarErrorOperacion(tipo, mensaje) {
  const selector = { venta: '#venta-error', ajuste: '#ajuste-error', anulacion: '#anular-error' }[tipo];
  $(selector).textContent = mensaje;
  $(selector).hidden = false;
  avisar(mensaje);
}

async function enviarOperacion(operacion) {
  if (estado.enviando) return;
  estado.pendiente = estado.pendiente || operacion;
  guardarPendiente();
  estado.enviando = true;
  actualizarBloqueos();
  const pendiente = estado.pendiente;
  const controlador = new AbortController();
  const limiteEspera = setTimeout(() => controlador.abort(), 15000);
  try {
    const respuesta = await fetch(pendiente.url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendiente.cuerpo),
      signal: controlador.signal,
    });
    let datos;
    try { datos = await respuesta.json(); }
    catch { datos = {}; }
    if (!respuesta.ok) {
      // Un 5xx puede llegar después de un guardado: se conserva la clave para resolverlo.
      if (respuesta.status >= 500) throw new Error(datos.error || 'El servidor no pudo confirmar el resultado. Reintentá la misma operación.');
      estado.pendiente = null;
      guardarPendiente();
      const mensaje = datos.error || 'No se pudo guardar. Revisá los datos antes de volver a intentar.';
      mostrarErrorOperacion(pendiente.tipo, mensaje);
      if (respuesta.status === 401 || respuesta.status === 403) mostrarAccesoDenegado();
      else await cargarInventario().catch(() => {});
      return;
    }
    estado.pendiente = null;
    guardarPendiente();
    document.querySelectorAll('dialog[open]').forEach(dialogo => dialogo.close());
    document.body.classList.remove('dialog-abierto');
    const mensaje = {
      venta: 'Venta confirmada. Las unidades se descontaron del stock.',
      ajuste: 'Cantidad guardada. La tienda ya puede consultar el stock actualizado.',
      anulacion: 'Venta anulada. Las unidades volvieron al stock.',
    }[pendiente.tipo];
    await cargarInventario().catch(() => {});
    avisar(datos.repetida ? 'Esa operación ya estaba guardada. No se repitió el movimiento.' : mensaje);
  } catch (error) {
    const mensaje = error.name === 'AbortError'
      ? 'El servidor tardó en responder.'
      : error instanceof TypeError ? 'Se perdió la conexión antes de confirmar el resultado.' : error.message;
    mostrarErrorOperacion(pendiente.tipo, `${mensaje || 'No pudimos confirmar el resultado.'} Reintentá para resolver la misma operación.`);
  } finally {
    clearTimeout(limiteEspera);
    estado.enviando = false;
    actualizarBloqueos();
  }
}

function nuevaVenta(evento) {
  evento.preventDefault();
  if (estado.pendiente) { enviarOperacion(estado.pendiente); return; }
  const variante = buscarVariante(estado.ventaSku);
  const cantidad = Number($('#venta-cantidad').value);
  if (!variante || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > variante.stock) {
    mostrarErrorOperacion('venta', 'La cantidad debe estar dentro del stock disponible.');
    return;
  }
  enviarOperacion({
    tipo: 'venta',
    url: '/api/admin/ventas',
    descripcion: `Registrar ${cantidad} × ${descripcionVariante(variante)}.`,
    cuerpo: {
      claveOperacion: crypto.randomUUID(),
      canal: $('#venta-canal').value,
      lineas: [{ sku: variante.sku, cantidad }],
      nota: $('#venta-nota').value.trim(),
    },
  });
}

function nuevoAjuste(evento) {
  evento.preventDefault();
  if (estado.pendiente) { enviarOperacion(estado.pendiente); return; }
  const variante = buscarVariante(estado.ajusteSku);
  const nuevoStock = Number($('#ajuste-cantidad').value);
  if (!variante || !Number.isInteger(nuevoStock) || nuevoStock < 0 || nuevoStock > 1000000) {
    mostrarErrorOperacion('ajuste', 'Ingresá una cantidad entera entre 0 y 1.000.000.');
    return;
  }
  enviarOperacion({
    tipo: 'ajuste',
    url: '/api/admin/ajustes',
    descripcion: `Dejar ${nuevoStock} unidades de ${descripcionVariante(variante)}.`,
    cuerpo: {
      claveOperacion: crypto.randomUUID(),
      sku: variante.sku,
      nuevoStock,
      versionEsperada: variante.version,
      nota: $('#ajuste-nota').value.trim(),
    },
  });
}

function nuevaAnulacion() {
  if (estado.pendiente) { enviarOperacion(estado.pendiente); return; }
  const venta = estado.ventas.find(item => item.id === estado.ventaAnular && item.estado === 'confirmada');
  if (!venta) return;
  enviarOperacion({
    tipo: 'anulacion',
    url: `/api/admin/ventas/${encodeURIComponent(venta.id)}/anular`,
    descripcion: `Anular la venta por ${nombresCanales[venta.canal] || venta.canal} del ${fechaVenta(venta.creadaEn)}.`,
    cuerpo: { claveOperacion: crypto.randomUUID() },
  });
}

function conectarEventos() {
  $('#buscar-inventario').addEventListener('input', pintarInventario);
  $('#filtrar-inventario').addEventListener('change', pintarInventario);
  $('#actualizar-inventario').addEventListener('click', () => cargarInventario().catch(() => {}));
  $('#venta-cantidad').addEventListener('input', pintarPrevisionVenta);
  $('#formulario-venta').addEventListener('submit', nuevaVenta);
  $('#formulario-ajuste').addEventListener('submit', nuevoAjuste);
  $('#confirmar-anulacion').addEventListener('click', nuevaAnulacion);
  $('#reintentar-operacion').addEventListener('click', () => {
    if (estado.pendiente) enviarOperacion(estado.pendiente);
  });
  document.addEventListener('click', evento => {
    const boton = evento.target.closest('button');
    if (!boton) return;
    if (boton.matches('[data-vender]')) abrirVenta(boton.dataset.vender);
    if (boton.matches('[data-ajustar]')) abrirAjuste(boton.dataset.ajustar);
    if (boton.matches('[data-anular]')) abrirAnulacion(boton.dataset.anular);
    if (boton.matches('[data-cerrar-admin]') && !estado.enviando) boton.closest('dialog').close();
  });
  document.querySelectorAll('.admin-dialogo').forEach(dialogo => {
    dialogo.addEventListener('cancel', evento => { if (estado.enviando) evento.preventDefault(); });
    dialogo.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-abierto');
    });
  });
}

async function iniciarAdministracion() {
  conectarEventos();
  try {
    const sesion = await consultar('/api/sesion');
    if (!sesion.admin) { mostrarAccesoDenegado(); return; }
    estado.pendiente = recuperarPendiente();
    await cargarInventario();
    actualizarBloqueos();
    setInterval(() => {
      if (!document.hidden && !estado.enviando && !estado.pendiente && !document.querySelector('dialog[open]')) cargarInventario().catch(() => {});
    }, 30000);
  } catch (error) {
    if (error.estadoHttp === 401 || error.estadoHttp === 403) mostrarAccesoDenegado();
    else {
      $('#admin-cargando').textContent = error.message || 'No pudimos conectar. Recargá para volver a intentar.';
      avisar('No pudimos conectar con el panel. Recargá para volver a intentar.');
    }
  }
}

iniciarAdministracion();

// ---------- Pedidos de la web ----------
const plata = importe => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(importe);
const pedidosEstado = { lista: [], estados: {}, metodos: {}, ocupado: false };

function pintarPedidos() {
  const { lista, estados, metodos } = pedidosEstado;
  $('#pedidos-vacios').hidden = lista.length > 0;
  $('#lista-pedidos').innerHTML = lista.map(pedido => {
    const entrega = pedido.entrega.tipo === 'envio' ? `Envío a ${pedido.entrega.direccion}` : 'Retiro en showroom';
    const esperando = ['esperando_pago', 'esperando_transferencia', 'rechazado'].includes(pedido.estado);
    return `<article class="admin-venta admin-pedido estado-${escapar(pedido.estado)}">
      <div class="admin-venta-cabecera"><div><h3>Pedido #${pedido.id} · ${escapar(pedido.cliente.nombre)}</h3><p>${escapar(fechaVenta(pedido.creadoEn))} · ${escapar(metodos[pedido.metodo] || pedido.metodo)}</p></div><span class="admin-etiqueta etiqueta-${escapar(pedido.estado)}">${escapar(estados[pedido.estado] || pedido.estado)}</span></div>
      <ul>${pedido.lineas.map(linea => `<li>${linea.cantidad} × ${escapar(linea.nombre)} · ${escapar(linea.color)} · talle ${escapar(linea.talle)}</li>`).join('')}</ul>
      <p class="admin-venta-nota">${escapar(entrega)} · ${escapar(pedido.entrega.fecha)} ${escapar(pedido.entrega.horario)} · ${escapar(pedido.cliente.telefono)} · ${escapar(pedido.cliente.email)}</p>
      ${pedido.problemaStock ? `<p class="admin-error">Stock: ${escapar(pedido.problemaStock)}</p>` : ''}
      <div class="admin-venta-pie"><span><b>${plata(pedido.total)}</b>${pedido.descuento ? ` · incluye 10% OFF` : ''}${pedido.notaPago ? ` · ${escapar(pedido.notaPago)}` : ''}</span>
        ${esperando ? `<span class="admin-pedido-acciones"><button class="boton-texto" type="button" data-pedido-accion="pagado" data-pedido="${pedido.id}" ${pedidosEstado.ocupado ? 'disabled' : ''}>Confirmar pago</button><button class="boton-texto" type="button" data-pedido-accion="cancelado" data-pedido="${pedido.id}" ${pedidosEstado.ocupado ? 'disabled' : ''}>Cancelar</button></span>` : ''}
      </div></article>`;
  }).join('');
}

async function cargarPedidos() {
  try {
    const datos = await consultar('/api/admin/pedidos');
    Object.assign(pedidosEstado, { lista: datos.pedidos, estados: datos.estados, metodos: datos.metodos });
    pintarPedidos();
  } catch (error) {
    $('#lista-pedidos').innerHTML = `<p class="admin-error">${escapar(error.message)}</p>`;
  }
}

async function accionPedido(id, accion) {
  const pedido = pedidosEstado.lista.find(item => String(item.id) === String(id));
  if (!pedido) return;
  const pregunta = accion === 'pagado'
    ? `¿Confirmás que recibiste ${plata(pedido.total)} del pedido #${pedido.id}? Se descuenta el stock.`
    : `¿Cancelar el pedido #${pedido.id}? No se descuenta stock.`;
  if (!window.confirm(pregunta)) return;
  pedidosEstado.ocupado = true;
  pintarPedidos();
  try {
    const respuesta = await fetch(`/api/admin/pedidos/${pedido.id}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }) });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || 'No se pudo actualizar el pedido.');
    avisar(accion === 'pagado' ? `Pedido #${pedido.id} pagado. Se descontó el stock.` : `Pedido #${pedido.id} cancelado.`);
    await cargarInventario().catch(() => {});
  } catch (error) {
    avisar(error.message);
  } finally {
    pedidosEstado.ocupado = false;
    await cargarPedidos();
  }
}

$('#actualizar-pedidos').addEventListener('click', () => cargarPedidos());
document.addEventListener('click', evento => {
  const boton = evento.target.closest('[data-pedido-accion]');
  if (boton) accionPedido(boton.dataset.pedido, boton.dataset.pedidoAccion);
});
consultar('/api/sesion').then(sesion => {
  if (!sesion.admin) return;
  cargarPedidos();
  setInterval(() => { if (!document.hidden && !pedidosEstado.ocupado) cargarPedidos(); }, 30000);
}).catch(() => {});
