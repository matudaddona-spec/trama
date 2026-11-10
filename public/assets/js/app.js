import { CONFIGURACION } from './configuracion.js';
import { buscarVariante, precioUnitario, normalizarCarrito, cambiarCantidad, calcularTotales, fechaLocal, calcularVentanaEnvio, validarEntrega, crearTextoPedido } from './pedidos.js';

const $ = selector => document.querySelector(selector);
const moneda = importe => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(importe);
const escapar = texto => String(texto).replace(/[&<>"']/g, caracter => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caracter]);
const categorias = { remeras: 'Remeras y camisas', buzos: 'Buzos', pantalones: 'Pantalones', camperas: 'Camperas', accesorios: 'Accesorios' };
let productos = [];
let imagenesPorColor = {};
let carrito = [];
let categoriaActiva = 'todos';
let terminoBusqueda = '';
let ordenActivo = 'destacados';
let seleccion = null;
let temporizadorAviso;
let firmaInventario = '';
let actualizacionInventario = null;

function avisar(mensaje) {
  clearTimeout(temporizadorAviso);
  $('#estado').textContent = mensaje;
  $('#estado').classList.add('visible');
  temporizadorAviso = setTimeout(() => $('#estado').classList.remove('visible'), 4200);
}

// Sólo se guardan SKU y cantidad. Nombre, dirección y notas no se persisten.
function guardarCarrito() {
  try { localStorage.setItem(CONFIGURACION.claveCarrito, JSON.stringify(carrito)); }
  catch { /* El carrito sigue funcionando si el navegador bloquea el almacenamiento. */ }
}

function leerCarrito() {
  try { return normalizarCarrito(JSON.parse(localStorage.getItem(CONFIGURACION.claveCarrito) || '[]'), productos); }
  catch { return []; }
}

function abrirDialogo(id) {
  document.querySelectorAll('dialog[open]').forEach(dialogo => dialogo.close());
  $(id).showModal();
  document.body.classList.add('dialog-abierto');
}

function cerrarDialogo(dialogo) {
  dialogo.close();
  if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-abierto');
}

// Cada producto tiene una foto por color (public/datos/imagenes-colores.json).
// Si un color nuevo todavía no tiene foto, se usa la del primer color del modelo.
function fotoProducto(producto, clase, color = producto.variantes[0].color) {
  const fotos = imagenesPorColor[producto.id] || {};
  const archivo = fotos[color] || Object.values(fotos)[0] || '';
  return `<div class="${clase}" data-color-foto="${escapar(color)}">
    ${archivo ? `<img src="${escapar(archivo)}" alt="${escapar(producto.nombre)}, color ${escapar(color)}" loading="lazy" decoding="async">` : ''}
  </div>`;
}

function normalizarTexto(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function pintarProductos() {
  let visibles = productos.filter(producto => {
    const coincideCategoria = categoriaActiva === 'todos' || producto.categoria === categoriaActiva || (categoriaActiva === 'promociones' && producto.descuento > 0);
    const coincideTexto = normalizarTexto(`${producto.nombre} ${categorias[producto.categoria]} ${producto.variantes.map(v => v.color).join(' ')}`).includes(normalizarTexto(terminoBusqueda));
    return coincideCategoria && coincideTexto;
  });
  if (ordenActivo === 'precio-menor') visibles.sort((a, b) => precioUnitario(a) - precioUnitario(b));
  if (ordenActivo === 'precio-mayor') visibles.sort((a, b) => precioUnitario(b) - precioUnitario(a));
  if (ordenActivo === 'nombre') visibles.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  $('#resultado-conteo').textContent = `${visibles.length} ${visibles.length === 1 ? 'prenda' : 'prendas'}`;
  $('#sin-resultados').hidden = visibles.length !== 0;
  $('#productos').innerHTML = visibles.map(producto => {
    const colores = [...new Set(producto.variantes.map(v => v.color))];
    const unidades = producto.variantes.reduce((suma, variante) => suma + variante.stock, 0);
    return `<article class="producto-card ${unidades === 0 ? 'sin-stock' : ''}">
      <button class="producto-imagen-boton" data-ver-producto="${producto.id}" aria-label="Ver ${escapar(producto.nombre)}">
        ${fotoProducto(producto, 'producto-foto')}
        ${producto.descuento ? `<span class="etiqueta-oferta">−${producto.descuento}%</span>` : ''}
        <span class="producto-ver">Elegir talle</span>
      </button>
      <div class="producto-info"><span class="producto-categoria">${categorias[producto.categoria]}</span>
        <h3 class="producto-nombre"><button data-ver-producto="${producto.id}">${escapar(producto.nombre)}</button></h3>
        <p class="producto-colores">${colores.length === 1 ? escapar(colores[0]) : `${colores.length} colores para elegir`}</p>
        <p class="producto-existencias">${unidades === 0 ? 'Agotado' : unidades <= 6 ? 'Últimas unidades' : 'En stock'}</p>
        <div class="producto-pie"><p class="producto-precio">${moneda(precioUnitario(producto))}${producto.descuento ? `<del class="precio-anterior">${moneda(producto.precio)}</del>` : ''}</p>
        <button class="producto-agregar" data-ver-producto="${producto.id}" aria-label="Elegir talle de ${escapar(producto.nombre)}" ${unidades === 0 ? 'disabled' : ''}>+</button></div>
      </div></article>`;
  }).join('');
}

function mostrarProducto(id) {
  const producto = productos.find(item => item.id === id);
  if (!producto) return;
  const variante = producto.variantes.find(item => item.stock > (carrito.find(linea => linea.sku === item.sku)?.cantidad || 0)) || producto.variantes[0];
  seleccion = { producto, color: variante.color, talle: variante.talle };
  pintarDetalle();
  abrirDialogo('#producto-dialog');
}

function pintarDetalle() {
  const { producto, color, talle } = seleccion;
  const colores = [...new Set(producto.variantes.map(item => item.color))];
  const talles = [...new Set(producto.variantes.map(item => item.talle))];
  const variante = producto.variantes.find(item => item.color === color && item.talle === talle);
  const enCarrito = carrito.find(item => item.sku === variante.sku)?.cantidad || 0;
  const disponibles = variante.stock - enCarrito;
  $('#producto-detalle').innerHTML = `<div class="detalle-grid">
    ${fotoProducto(producto, 'detalle-foto', color)}
    <div class="detalle-contenido"><p class="producto-categoria">${categorias[producto.categoria]}</p>
      <h2 id="detalle-titulo">${escapar(producto.nombre)}</h2>
      <p class="detalle-precio">${moneda(precioUnitario(producto))}${producto.descuento ? `<del class="precio-anterior">${moneda(producto.precio)}</del><span class="detalle-descuento">${producto.descuento}% OFF</span>` : ''}</p>
      <p class="detalle-descripcion">${escapar(producto.descripcion)}</p>
      <fieldset class="selector-campo"><legend>Color: <strong>${escapar(color)}</strong></legend><div class="opciones-selector">${colores.map(item => `<button class="selector-color ${item === color ? 'seleccionado' : ''}" data-color="${escapar(item)}" aria-pressed="${item === color}">${escapar(item)}</button>`).join('')}</div></fieldset>
      <fieldset class="selector-campo"><legend>Talle</legend><div class="opciones-selector">${talles.map(item => `<button class="selector-talle ${item === talle ? 'seleccionado' : ''}" data-talle="${escapar(item)}" aria-pressed="${item === talle}">${escapar(item)}</button>`).join('')}</div></fieldset>
      <p class="detalle-disponibilidad ${disponibles <= 0 ? 'sin-stock' : ''}" role="status">${disponibles > 0 ? `${disponibles} ${disponibles === 1 ? 'unidad disponible' : 'unidades disponibles'} de prueba${enCarrito ? ` · ${enCarrito} en tu carrito` : ''}` : 'Sin unidades disponibles de prueba en esta combinación'}</p>
      <div class="detalle-compra"><label class="cantidad-detalle">Cantidad<input id="cantidad-producto" type="number" min="1" max="${Math.max(1, disponibles)}" value="1" ${disponibles <= 0 ? 'disabled' : ''}></label><button class="boton-primario" id="agregar-producto" ${disponibles <= 0 ? 'disabled' : ''}>${disponibles > 0 ? 'Sumar a la bolsa' : 'Sin stock'} <span aria-hidden="true">↗</span></button></div>
      <p class="mensaje-ayuda">Precio y stock de prueba. Foto ilustrativa.</p>
    </div></div>`;
}

async function agregarSeleccion() {
  const intento = { productoId: seleccion.producto.id, color: seleccion.color, talle: seleccion.talle, cantidad: Number($('#cantidad-producto').value) };
  $('#agregar-producto').disabled = true;
  try {
    await actualizarInventario();
  } catch {
    avisar('No pudimos verificar el stock. Volvé a intentar en un momento.');
    pintarDetalle();
    return;
  }
  if (seleccion.producto.id !== intento.productoId || seleccion.color !== intento.color || seleccion.talle !== intento.talle) {
    pintarDetalle();
    return;
  }
  const { producto, color, talle } = seleccion;
  const variante = producto.variantes.find(item => item.color === color && item.talle === talle);
  const cantidad = intento.cantidad;
  const previa = carrito.find(item => item.sku === variante.sku)?.cantidad || 0;
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad + previa > variante.stock) {
    avisar('Elegí una cantidad dentro del stock de prueba disponible.');
    pintarDetalle();
    $('#cantidad-producto').focus();
    return;
  }
  carrito = cambiarCantidad(carrito, variante.sku, previa + cantidad, productos);
  guardarCarrito();
  pintarCarrito();
  cerrarDialogo($('#producto-dialog'));
  avisar(`${producto.nombre} se sumó a tu bolsa.`);
}

// El servidor es la fuente del stock: distintas computadoras leen las mismas cantidades.
// Consultarlo no reserva unidades ni registra ventas. Eso se hace al confirmar la venta.
function firmaDelCatalogo(catalogo) {
  return JSON.stringify(catalogo.flatMap(producto => producto.variantes.map(variante => [variante.sku, variante.stock])));
}

async function actualizarInventario() {
  if (actualizacionInventario) return actualizacionInventario;
  actualizacionInventario = (async () => {
    const respuesta = await fetch('/api/catalogo', { cache: 'no-store' });
    if (!respuesta.ok) throw new Error('Inventario no disponible');
    const catalogo = await respuesta.json();
    const nuevaFirma = firmaDelCatalogo(catalogo.productos);
    if (nuevaFirma !== firmaInventario) {
      productos = catalogo.productos;
      firmaInventario = nuevaFirma;
      const carritoAnterior = JSON.stringify(carrito);
      carrito = normalizarCarrito(carrito, productos);
      guardarCarrito();
      pintarProductos();
      pintarCarrito();
      if (seleccion) {
        const anterior = seleccion.producto.variantes.find(v => v.color === seleccion.color && v.talle === seleccion.talle)?.stock;
        seleccion.producto = productos.find(p => p.id === seleccion.producto.id);
        const actual = seleccion.producto?.variantes.find(v => v.color === seleccion.color && v.talle === seleccion.talle)?.stock;
        if ($('#producto-dialog').open && anterior !== actual) pintarDetalle();
      }
      if (carritoAnterior !== JSON.stringify(carrito)) avisar('Actualizamos tu bolsa según las unidades disponibles.');
    }
    $('#estado-inventario').textContent = 'Inventario compartido · actualizado';
  })();
  try { await actualizacionInventario; }
  finally { actualizacionInventario = null; }
}

function leerEntrega() {
  return {
    tipo: document.querySelector('input[name="entrega"]:checked')?.value || 'retiro',
    direccion: $('#direccion-entrega').value,
    fecha: $('#fecha-retiro').value,
    horario: $('#horario-retiro').value,
    fechaEnvio: $('#fecha-envio').value,
    horarioEnvio: $('#horario-envio').value,
    nombre: $('#nombre-cliente').value,
    notas: $('#notas-pedido').value,
  };
}

function totalesActuales() {
  return calcularTotales(carrito, productos, leerEntrega().tipo, CONFIGURACION.costoEnvio);
}

function pintarCarrito() {
  const totales = totalesActuales();
  document.querySelectorAll('[data-carrito-cantidad]').forEach(elemento => { elemento.textContent = totales.unidades; });
  $('#carrito-vacio').hidden = totales.lineas.length > 0;
  $('#vaciar-carrito').disabled = !totales.lineas.length;
  $('#carrito-items').innerHTML = totales.lineas.map(linea => `<article class="carrito-linea">
    ${fotoProducto(linea.producto, 'carrito-miniatura', linea.variante.color)}
    <div class="carrito-linea-info"><h3>${escapar(linea.producto.nombre)}</h3><p>${escapar(linea.variante.color)} · talle ${escapar(linea.variante.talle)}</p><p>${moneda(linea.precio)} c/u</p>
      <div class="cantidad-selector"><button data-cambiar-cantidad="${linea.sku}" data-paso="-1" aria-label="Quitar una unidad de ${escapar(linea.producto.nombre)}, ${escapar(linea.variante.color)}, talle ${escapar(linea.variante.talle)}">−</button><span aria-label="Cantidad">${linea.cantidad}</span><button data-cambiar-cantidad="${linea.sku}" data-paso="1" aria-label="Sumar una unidad de ${escapar(linea.producto.nombre)}, ${escapar(linea.variante.color)}, talle ${escapar(linea.variante.talle)}" ${linea.cantidad >= linea.variante.stock ? 'disabled' : ''}>+</button></div>
    </div><div class="carrito-linea-acciones"><strong>${moneda(linea.importe)}</strong><button class="boton-texto" data-quitar-producto="${linea.sku}" aria-label="Eliminar ${escapar(linea.producto.nombre)}, ${escapar(linea.variante.color)}, talle ${escapar(linea.variante.talle)}">Eliminar</button></div>
  </article>`).join('');
  pintarTotales();
}

function pintarTotales() {
  const entrega = leerEntrega();
  const totales = totalesActuales();
  $('#datos-envio').hidden = entrega.tipo !== 'envio';
  $('#datos-retiro').hidden = entrega.tipo !== 'retiro';
  $('#direccion-entrega').disabled = entrega.tipo !== 'envio';
  $('#carrito-subtotal').textContent = moneda(totales.subtotal);
  $('#carrito-envio').textContent = entrega.tipo === 'envio' ? moneda(totales.envio) : 'Sin cargo';
  $('#carrito-total').textContent = moneda(totales.total);
  $('#copiar-pedido').disabled = !totales.lineas.length;
  $('#continuar-compra').disabled = !totales.lineas.length;
  $('#whatsapp-pedido').setAttribute('aria-disabled', String(!totales.lineas.length));
  $('#whatsapp-pedido').tabIndex = totales.lineas.length ? 0 : -1;
  const texto = crearTextoPedido(totales, entrega, CONFIGURACION, moneda);
  $('#whatsapp-pedido').href = `https://wa.me/${CONFIGURACION.telefonoWhatsapp}?text=${encodeURIComponent(texto)}`;
  $('#pedido-texto').value = texto;
}

function validarPedido() {
  if (!totalesActuales().lineas.length) { avisar('Primero sumá una prenda al carrito.'); return false; }
  const datos = leerEntrega();
  const error = validarEntrega(datos, CONFIGURACION);
  if (error) {
    avisar(error);
    let campo;
    if (datos.tipo === 'envio') {
      if (datos.direccion.trim().length < 8) campo = $('#direccion-entrega');
      else if (!calcularVentanaEnvio(CONFIGURACION).fechas.includes(datos.fechaEnvio)) campo = $('#fecha-envio');
      else campo = $('#horario-envio');
    } else {
      campo = error.includes('franjas') ? $('#horario-retiro') : $('#fecha-retiro');
    }
    campo.focus();
    campo.setAttribute('aria-invalid', 'true');
    return false;
  }
  ['#direccion-entrega', '#fecha-retiro', '#horario-retiro', '#fecha-envio', '#horario-envio'].forEach(id => $(id).removeAttribute('aria-invalid'));
  $('#estado').textContent = '';
  $('#estado').classList.remove('visible');
  pintarTotales();
  return true;
}

async function copiarPedido(validar = true) {
  if (validar && !validarPedido()) return false;
  const texto = $('#pedido-texto').value;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Portapapeles no disponible');
    await navigator.clipboard.writeText(texto);
    $('#copiar-pedido').textContent = 'Pedido copiado ✓';
    $('#copia-manual').hidden = true;
    avisar('Pedido copiado. Podés pegarlo en WhatsApp.');
    setTimeout(() => { $('#copiar-pedido').textContent = 'Solo copiar el pedido'; }, 3500);
    return true;
  } catch {
    $('#copia-manual').hidden = false;
    $('#pedido-texto').focus();
    $('#pedido-texto').select();
    avisar('El navegador no habilitó el portapapeles. Seleccioná y copiá el texto del pedido.');
    return false;
  }
}

function mostrarResumenCompra() {
  if (!validarPedido()) return;
  const datos = leerEntrega();
  const totales = totalesActuales();
  $('#checkout-resumen').innerHTML = `<div class="checkout-lista">${totales.lineas.map(linea => `<div class="checkout-linea"><div><strong>${escapar(linea.producto.nombre)}</strong><p>${escapar(linea.variante.color)} · talle ${escapar(linea.variante.talle)} · ${linea.cantidad} ${linea.cantidad === 1 ? 'unidad' : 'unidades'}</p></div><span>${moneda(linea.importe)}</span></div>`).join('')}</div>
    <div class="checkout-entrega"><h3>${datos.tipo === 'envio' ? 'Envío en moto' : 'Retiro en showroom'}</h3><p>${datos.tipo === 'envio' ? escapar(datos.direccion) : `${escapar(datos.fecha)} · ${escapar(datos.horario)}`}</p>${datos.tipo === 'envio' ? `<p>Entrega solicitada: ${escapar(datos.fechaEnvio)} · ${escapar(datos.horarioEnvio)}</p><p>Plazo de prueba: ${CONFIGURACION.plazoEnvioDiasHabiles.minimo} a ${CONFIGURACION.plazoEnvioDiasHabiles.maximo} días hábiles.</p>` : ''}${datos.nombre.trim() ? `<p>A nombre de ${escapar(datos.nombre.trim())}</p>` : ''}${datos.notas.trim() ? `<p>Notas: ${escapar(datos.notas.trim())}</p>` : ''}</div>
    <div class="resumen-fila"><span>Productos</span><span>${moneda(totales.subtotal)}</span></div><div class="resumen-fila" id="pago-fila-descuento" hidden><span>10% OFF por transferencia</span><span id="pago-descuento"></span></div><div class="resumen-fila"><span>${datos.tipo === 'envio' ? 'Envío en moto' : 'Retiro'}</span><span>${datos.tipo === 'envio' ? moneda(totales.envio) : 'Sin cargo'}</span></div>`;
  if (!$('#pago-nombre').value && datos.nombre.trim()) $('#pago-nombre').value = datos.nombre.trim();
  $('#pago-error').hidden = true;
  pintarTotalPago();
  abrirDialogo('#checkout-dialog');
}

// El navegador sólo muestra el total; el servidor lo vuelve a calcular con sus precios.
function pintarTotalPago() {
  const metodo = document.querySelector('input[name="metodo-pago"]:checked')?.value;
  const totales = totalesActuales();
  const descuento = metodo === 'transferencia' ? Math.round(totales.subtotal * 0.1) : 0;
  $('#pago-fila-descuento') && ($('#pago-fila-descuento').hidden = !descuento);
  if ($('#pago-descuento')) $('#pago-descuento').textContent = `−${moneda(descuento)}`;
  $('#pago-total').textContent = moneda(totales.total - descuento);
  $('#confirmar-pago').textContent = metodo === 'transferencia' ? 'Confirmar pedido' : 'Ir a pagar';
}

async function enviarPago(evento) {
  evento.preventDefault();
  const error = $('#pago-error');
  const mostrarError = mensaje => { error.textContent = mensaje; error.hidden = false; };
  error.hidden = true;
  const cliente = { nombre: $('#pago-nombre').value.trim(), email: $('#pago-email').value.trim(), telefono: $('#pago-telefono').value.trim() };
  if (cliente.nombre.length < 3) { mostrarError('Completá tu nombre y apellido.'); $('#pago-nombre').focus(); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cliente.email)) { mostrarError('Revisá tu correo.'); $('#pago-email').focus(); return; }
  if (cliente.telefono.replace(/\D/g, '').length < 8) { mostrarError('Revisá tu número de WhatsApp.'); $('#pago-telefono').focus(); return; }
  if (!validarPedido()) { mostrarError('Revisá los datos de entrega en tu bolsa.'); return; }
  const entrega = leerEntrega();
  const boton = $('#confirmar-pago');
  const textoBoton = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Procesando…';
  try {
    const respuesta = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metodo: document.querySelector('input[name="metodo-pago"]:checked')?.value,
        cliente,
        entrega: { tipo: entrega.tipo, direccion: entrega.direccion, fecha: entrega.fecha, horario: entrega.horario, fechaEnvio: entrega.fechaEnvio, horarioEnvio: entrega.horarioEnvio },
        lineas: carrito.map(linea => ({ sku: linea.sku, cantidad: linea.cantidad })),
      }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok || !datos.destino) throw new Error(datos.error || 'No pudimos crear el pedido. Probá de nuevo.');
    boton.textContent = 'Redirigiendo…';
    location.href = datos.destino;
  } catch (falla) {
    mostrarError(falla.message);
    boton.disabled = false;
    boton.textContent = textoBoton;
    actualizarInventario().catch(() => {});
  }
}

function vincularEventos() {
  document.addEventListener('click', evento => {
    const objetivo = evento.target.closest('button, a');
    if (!objetivo) return;
    if (objetivo.matches('[data-ver-producto]')) mostrarProducto(objetivo.dataset.verProducto);
    if (objetivo.matches('[data-categoria]')) {
      categoriaActiva = objetivo.dataset.categoria;
      if (objetivo.closest('#sin-resultados')) { terminoBusqueda = ''; $('#busqueda').value = ''; }
      document.querySelectorAll('[data-categoria]').forEach(boton => {
        const activo = boton.dataset.categoria === categoriaActiva;
        boton.classList.toggle('activo', activo);
        if (boton.tagName === 'BUTTON') boton.setAttribute('aria-pressed', String(activo));
      });
      pintarProductos();
    }
    if (objetivo.matches('[data-abrir-carrito]')) { pintarCarrito(); abrirDialogo('#carrito-dialog'); }
    if (objetivo.matches('[data-cerrar-dialog]')) cerrarDialogo(objetivo.closest('dialog'));
    if (objetivo.matches('[data-color]')) { seleccion.color = objetivo.dataset.color; pintarDetalle(); $('#producto-detalle').querySelector(`[data-color="${CSS.escape(seleccion.color)}"]`)?.focus(); }
    if (objetivo.matches('[data-talle]')) { seleccion.talle = objetivo.dataset.talle; pintarDetalle(); $('#producto-detalle').querySelector(`[data-talle="${CSS.escape(seleccion.talle)}"]`)?.focus(); }
    if (objetivo.id === 'agregar-producto') agregarSeleccion();
    if (objetivo.matches('[data-cambiar-cantidad]')) {
      const sku = objetivo.dataset.cambiarCantidad;
      const actual = carrito.find(linea => linea.sku === sku)?.cantidad || 0;
      carrito = cambiarCantidad(carrito, sku, actual + Number(objetivo.dataset.paso), productos);
      guardarCarrito(); pintarCarrito();
      $('#carrito-items').querySelector(`[data-cambiar-cantidad="${CSS.escape(sku)}"][data-paso="${objetivo.dataset.paso}"]`)?.focus();
    }
    if (objetivo.matches('[data-quitar-producto]')) { carrito = carrito.filter(linea => linea.sku !== objetivo.dataset.quitarProducto); guardarCarrito(); pintarCarrito(); avisar('Prenda eliminada del carrito.'); }
    if (objetivo.id === 'vaciar-carrito') { carrito = []; guardarCarrito(); pintarCarrito(); avisar('Vaciaste el carrito.'); }
    if (objetivo.id === 'copiar-pedido') copiarPedido();
    if (objetivo.id === 'whatsapp-pedido') {
      if (!validarPedido()) { evento.preventDefault(); return; }
      // El enlace abre WhatsApp con un borrador; nunca envía el mensaje por sí solo.
      // Se intenta copiar además, sin impedir la apertura si el navegador lo rechaza.
      copiarPedido(false);
    }
    if (objetivo.id === 'continuar-compra') mostrarResumenCompra();
    if (objetivo.id === 'volver-carrito') { pintarCarrito(); abrirDialogo('#carrito-dialog'); }
  });
  $('#busqueda').addEventListener('input', evento => { terminoBusqueda = evento.target.value.trim(); pintarProductos(); });
  $('#ordenar').addEventListener('change', evento => { ordenActivo = evento.target.value; pintarProductos(); });
  document.querySelectorAll('input[name="entrega"]').forEach(input => input.addEventListener('change', pintarTotales));
  document.querySelectorAll('input[name="metodo-pago"]').forEach(input => input.addEventListener('change', pintarTotalPago));
  $('#formulario-pago').addEventListener('submit', enviarPago);
  ['#direccion-entrega', '#nombre-cliente', '#notas-pedido', '#fecha-retiro', '#horario-retiro', '#fecha-envio', '#horario-envio'].forEach(id => $(id).addEventListener('input', pintarTotales));
  document.querySelectorAll('dialog').forEach(dialogo => {
    dialogo.addEventListener('close', () => { if (!document.querySelector('dialog[open]')) document.body.classList.remove('dialog-abierto'); });
    dialogo.addEventListener('click', evento => {
      if (evento.target !== dialogo) return;
      const rect = dialogo.getBoundingClientRect();
      if (evento.clientX < rect.left || evento.clientX > rect.right || evento.clientY < rect.top || evento.clientY > rect.bottom) cerrarDialogo(dialogo);
    });
  });
  // Otra pestaña puede actualizar el carrito. Se vuelve a validar antes de mostrarlo.
  window.addEventListener('storage', evento => { if (evento.key === CONFIGURACION.claveCarrito) { carrito = leerCarrito(); pintarCarrito(); } });
  const refrescar = () => actualizarInventario().catch(() => { $('#estado-inventario').textContent = 'No pudimos actualizar el stock. Volvé a intentar.'; });
  window.addEventListener('focus', refrescar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
  setInterval(() => { if (!document.hidden) refrescar(); }, 10000);
}

async function iniciarTienda() {
  // La consulta general funciona aun si el catálogo no puede cargarse.
  document.querySelectorAll('[data-contacto-whatsapp]').forEach(enlace => {
    enlace.href = `https://wa.me/${CONFIGURACION.telefonoWhatsapp}`;
  });
  try {
    const [respuesta, respuestaImagenes] = await Promise.all([
      fetch('/api/catalogo', { cache: 'no-store' }),
      fetch('./datos/imagenes-colores.json'),
    ]);
    if (!respuesta.ok || !respuestaImagenes.ok) throw new Error('No se pudo leer el catálogo o sus imágenes');
    const [catalogo, mapaImagenes] = await Promise.all([respuesta.json(), respuestaImagenes.json()]);
    productos = catalogo.productos;
    firmaInventario = firmaDelCatalogo(productos);
    imagenesPorColor = mapaImagenes.productos;
    carrito = leerCarrito();
    document.querySelectorAll('[data-horarios-retiro]').forEach(elemento => { elemento.textContent = CONFIGURACION.horariosRetiro; });
    document.querySelectorAll('[data-costo-envio]').forEach(elemento => { elemento.textContent = moneda(CONFIGURACION.costoEnvio); });
    const proximoRetiro = new Date();
    while (!CONFIGURACION.diasRetiro.includes(proximoRetiro.getDay())) proximoRetiro.setDate(proximoRetiro.getDate() + 1);
    $('#fecha-retiro').min = fechaLocal();
    $('#fecha-retiro').value = fechaLocal(proximoRetiro);
    $('#horario-retiro').innerHTML = CONFIGURACION.franjasRetiro.map(hora => `<option value="${hora}">${hora}</option>`).join('');
    const ventanaEnvio = calcularVentanaEnvio(CONFIGURACION);
    const formatoDia = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
    $('#fecha-envio').innerHTML = ventanaEnvio.fechas.map(fecha => `<option value="${fecha}">${escapar(formatoDia.format(new Date(`${fecha}T12:00:00`)))}</option>`).join('');
    $('#horario-envio').innerHTML = CONFIGURACION.franjasEnvio.map(hora => `<option value="${hora}">${hora}</option>`).join('');
    $('#plazo-envio').textContent = `Entrega de prueba entre ${CONFIGURACION.plazoEnvioDiasHabiles.minimo} y ${CONFIGURACION.plazoEnvioDiasHabiles.maximo} días hábiles. Elegí el día y la franja que preferís.`;
    $('[data-horarios-envio]').textContent = CONFIGURACION.horariosEnvio;
    vincularEventos();
    pintarProductos();
    pintarCarrito();
    document.documentElement.classList.add('tienda-lista');
    $('#estado-inventario').textContent = 'Inventario compartido · actualizado';
    fetch('/api/sesion', { cache: 'no-store' }).then(respuesta => respuesta.json()).then(sesion => {
      $('#administrar-stock').hidden = !sesion.admin;
    }).catch(() => {});
  } catch (error) {
    $('#resultado-conteo').textContent = 'No pudimos cargar la colección.';
    $('#productos').innerHTML = '<p class="error-campo">Hubo un problema al cargar los productos. Recargá la página para volver a intentar.</p>';
    console.error(error);
  }
}

iniciarTienda();
