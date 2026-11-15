/* PEDIDOS
 * Reglas del carrito, sin depender de la pantalla ni de servicios externos.
 * Cada línea se identifica por SKU: el stock corresponde a color + talle.
 */
export function buscarVariante(productos, sku) {
  for (const producto of productos) {
    const variante = producto.variantes.find(item => item.sku === sku);
    if (variante) return { producto, variante };
  }
  return null;
}

export function precioUnitario(producto) {
  return Math.round(producto.precio * (1 - producto.descuento / 100));
}

export function normalizarCarrito(valor, productos) {
  if (!Array.isArray(valor)) return [];
  const cantidades = new Map();
  for (const linea of valor) {
    if (!linea || typeof linea.sku !== 'string' || !Number.isInteger(linea.cantidad) || linea.cantidad <= 0) continue;
    const encontrado = buscarVariante(productos, linea.sku);
    if (!encontrado || encontrado.variante.stock <= 0) continue;
    const cantidad = Math.min((cantidades.get(linea.sku) || 0) + linea.cantidad, encontrado.variante.stock);
    cantidades.set(linea.sku, cantidad);
  }
  return [...cantidades].map(([sku, cantidad]) => ({ sku, cantidad }));
}

export function cambiarCantidad(carrito, sku, cantidad, productos) {
  const encontrado = buscarVariante(productos, sku);
  if (!encontrado || !Number.isInteger(cantidad)) return carrito;
  const otrasLineas = carrito.filter(linea => linea.sku !== sku);
  if (cantidad <= 0 || encontrado.variante.stock <= 0) return otrasLineas;
  return normalizarCarrito([...otrasLineas, { sku, cantidad }], productos);
}

export function calcularTotales(carrito, productos, entrega, costoEnvio) {
  const lineas = normalizarCarrito(carrito, productos).map(linea => {
    const { producto, variante } = buscarVariante(productos, linea.sku);
    const precio = precioUnitario(producto);
    return { ...linea, producto, variante, precio, importe: precio * linea.cantidad };
  });
  const subtotal = lineas.reduce((suma, linea) => suma + linea.importe, 0);
  const envio = lineas.length && entrega === 'envio' ? costoEnvio : 0;
  return { lineas, unidades: lineas.reduce((suma, linea) => suma + linea.cantidad, 0), subtotal, envio, total: subtotal + envio };
}

export function fechaLocal(fecha = new Date()) {
  return [fecha.getFullYear(), String(fecha.getMonth() + 1).padStart(2, '0'), String(fecha.getDate()).padStart(2, '0')].join('-');
}

function leerFechaLocal(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor || '')) return null;
  // El mediodía evita interpretar una fecha sin hora como UTC y cambiar de día.
  const fecha = new Date(`${valor}T12:00:00`);
  return Number.isNaN(fecha.getTime()) || fechaLocal(fecha) !== valor ? null : fecha;
}

export function calcularVentanaEnvio(configuracion, hoy = fechaLocal()) {
  const fecha = leerFechaLocal(hoy);
  const { minimo, maximo } = configuracion.plazoEnvioDiasHabiles;
  const diasPermitidos = configuracion.diasEnvio;
  if (!fecha || !Number.isInteger(minimo) || !Number.isInteger(maximo) || minimo < 1 || maximo < minimo || !diasPermitidos.some(dia => Number.isInteger(dia) && dia >= 0 && dia <= 6)) {
    throw new RangeError('La configuración del plazo de envío no es válida.');
  }

  const fechas = [];
  let diasHabiles = 0;
  // El día del pedido no se cuenta: el primer envío es el próximo día habilitado.
  // Esta simulación contempla días de la semana, sin feriados ni cupos reales.
  while (diasHabiles < maximo) {
    fecha.setDate(fecha.getDate() + 1);
    if (!diasPermitidos.includes(fecha.getDay())) continue;
    diasHabiles += 1;
    if (diasHabiles >= minimo) fechas.push(fechaLocal(fecha));
  }
  return { desde: fechas[0], hasta: fechas.at(-1), fechas };
}

export function validarEntrega(datos, configuracion, hoy = fechaLocal()) {
  if (!['retiro', 'envio'].includes(datos.tipo)) return 'Elegí cómo querés recibir el pedido.';
  if (datos.tipo === 'envio') {
    if (typeof datos.direccion !== 'string' || datos.direccion.trim().length < 8) return 'Completá calle, número y localidad para el envío.';
    if (!datos.fechaEnvio) return 'Elegí una fecha de envío.';
    const fecha = leerFechaLocal(datos.fechaEnvio);
    if (!fecha) return 'La fecha de envío no es válida.';
    if (datos.fechaEnvio < hoy) return 'Elegí una fecha de envío a partir de hoy.';
    if (!configuracion.diasEnvio.includes(fecha.getDay())) return 'Los envíos son de lunes a sábados. Elegí otro día.';
    const ventana = calcularVentanaEnvio(configuracion, hoy);
    if (!ventana.fechas.includes(datos.fechaEnvio)) return `Elegí una fecha de envío entre ${ventana.desde} y ${ventana.hasta}.`;
    if (!configuracion.franjasEnvio.includes(datos.horarioEnvio)) return 'Elegí una de las franjas de envío disponibles.';
    return '';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha || '')) return 'Elegí una fecha de retiro.';
  const fecha = leerFechaLocal(datos.fecha);
  if (!fecha) return 'La fecha de retiro no es válida.';
  if (datos.fecha < hoy) return 'Elegí una fecha de retiro a partir de hoy.';
  if (!configuracion.diasRetiro.includes(fecha.getDay())) return 'Los retiros son de lunes a sábados. Elegí otro día.';
  if (!configuracion.franjasRetiro.includes(datos.horario)) return 'Elegí una de las franjas de retiro disponibles.';
  return '';
}

export function crearTextoPedido(totales, datos, configuracion, formatoMoneda) {
  const texto = [
    `Hola ${configuracion.nombreTienda}, armé este pedido en la web:`,
    '',
    'DEMO · Pedido de prueba, con precios y stock simulados. No es una compra confirmada.',
    '',
  ];
  for (const linea of totales.lineas) {
    texto.push(`• ${linea.producto.nombre} · ${linea.variante.color} · talle ${linea.variante.talle}`);
    texto.push(`  ${linea.cantidad} × ${formatoMoneda(linea.precio)} = ${formatoMoneda(linea.importe)}`);
  }
  texto.push('', `Subtotal: ${formatoMoneda(totales.subtotal)}`);
  if (datos.tipo === 'envio') {
    texto.push(
      `${configuracion.nombreEnvio} (de prueba): ${formatoMoneda(totales.envio)}`,
      `Dirección: ${datos.direccion.trim()}`,
      `Entrega solicitada: ${datos.fechaEnvio} · ${datos.horarioEnvio}`,
      `Plazo de muestra: ${configuracion.plazoEnvioDiasHabiles.minimo} a ${configuracion.plazoEnvioDiasHabiles.maximo} días hábiles. Fecha y horario a confirmar por WhatsApp.`,
    );
  } else {
    texto.push('Retiro sin cargo', `Fecha solicitada: ${datos.fecha} · ${datos.horario}`);
  }
  texto.push(`TOTAL DE PRUEBA: ${formatoMoneda(totales.total)}`);
  if (datos.nombre.trim()) texto.push('', `Nombre: ${datos.nombre.trim()}`);
  if (datos.notas.trim()) texto.push('', `Notas: ${datos.notas.trim()}`);
  texto.push('', '¿Me confirmás disponibilidad, precio final y entrega?');
  return texto.join('\n');
}
