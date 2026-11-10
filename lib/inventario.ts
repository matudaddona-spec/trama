import catalogoInicial from '../public/datos/productos.json' with { type: 'json' };

type BaseDatos = D1Database;
type Registro = Record<string, any>;
const CLAVE_INICIAL = 'catalogo-demo-inicial-v1';
const MAXIMO_STOCK = 1_000_000;
const canales = new Set(['whatsapp', 'local', 'instagram', 'web']);
const variantesIniciales = catalogoInicial.productos.flatMap(producto =>
  producto.variantes.map(variante => ({ ...variante, productoId: producto.id, nombre: producto.nombre })),
);
const datosPorSku = new Map(variantesIniciales.map(variante => [variante.sku, variante]));

export class ErrorInventario extends Error {
  estado: number;
  constructor(mensaje: string, estado = 400) {
    super(mensaje);
    this.name = 'ErrorInventario';
    this.estado = estado;
  }
}

function objeto(valor: unknown): Registro {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new ErrorInventario('Los datos enviados no son válidos.');
  return valor as Registro;
}

function claveOperacion(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(valor)) throw new ErrorInventario('La clave de la operación no es válida.');
  return valor;
}

function notaOperacion(valor: unknown): string {
  if (valor === undefined) return '';
  if (typeof valor !== 'string' || valor.trim().length > 400) throw new ErrorInventario('La referencia debe tener hasta 400 caracteres.');
  return valor.trim();
}

function numeroEntero(valor: unknown, minimo: number, maximo: number, mensaje: string): number {
  if (!Number.isInteger(valor) || Number(valor) < minimo || Number(valor) > maximo) throw new ErrorInventario(mensaje);
  return Number(valor);
}

async function hashContenido(tipo: string, actorId: string, contenido: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ tipo, actorId, contenido }));
  const resultado = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(resultado)].map(valor => valor.toString(16).padStart(2, '0')).join('');
}

async function operacionAnterior(db: BaseDatos, clave: string, tipo: string, hash: string): Promise<Registro | null> {
  const anterior = await db.prepare('SELECT tipo, hash, resultado_id AS resultadoId FROM operaciones_inventario WHERE clave = ?').bind(clave).first<Registro>();
  if (anterior && (anterior.tipo !== tipo || anterior.hash !== hash)) throw new ErrorInventario('Esa clave ya se usó para otra operación. Actualizá el panel antes de continuar.', 409);
  return anterior;
}

function insertarOperacion(db: BaseDatos, clave: string, tipo: string, hash: string, resultadoId: string, actorId: string, fecha: string) {
  return db.prepare('INSERT INTO operaciones_inventario (clave, tipo, hash, resultado_id, actor_id, creada_en) VALUES (?, ?, ?, ?, ?, ?)').bind(clave, tipo, hash, resultadoId, actorId, fecha);
}

function traducirError(error: unknown): never {
  if (error instanceof ErrorInventario) throw error;
  const mensaje = error instanceof Error ? error.message : '';
  if (mensaje.includes('stock_insuficiente')) throw new ErrorInventario('No queda stock suficiente para todas las variantes. No se descontó ninguna prenda de esta venta.', 409);
  if (mensaje.includes('version_stock_cambiada')) throw new ErrorInventario('El stock cambió desde que abriste el panel. Actualizá y revisá la cantidad antes de corregirla.', 409);
  if (mensaje.includes('venta_no_confirmada')) throw new ErrorInventario('La venta ya no está confirmada. Actualizá el panel.', 409);
  throw error;
}

// La carga inicial es una inserción idempotente, separada de las migraciones.
// Nunca actualiza cantidades existentes ni se repite al publicar otra versión.
export async function asegurarCatalogoInicial(db: BaseDatos): Promise<void> {
  const existe = await db.prepare('SELECT valor FROM metadatos_inventario WHERE clave = ?').bind(CLAVE_INICIAL).first();
  if (existe) return;
  const fecha = new Date().toISOString();
  const sentencias: D1PreparedStatement[] = [];
  for (let indice = 0; indice < variantesIniciales.length; indice += 20) {
    const grupo = variantesIniciales.slice(indice, indice + 20);
    const valores = grupo.flatMap(variante => [variante.sku, variante.stock, 0, fecha]);
    const lugares = grupo.map(() => '(?, ?, ?, ?)').join(', ');
    sentencias.push(db.prepare(`INSERT OR IGNORE INTO existencias (sku, cantidad, version, actualizada_en) VALUES ${lugares}`).bind(...valores));
  }
  sentencias.push(db.prepare('INSERT OR IGNORE INTO metadatos_inventario (clave, valor) VALUES (?, ?)').bind(CLAVE_INICIAL, fecha));
  await db.batch(sentencias);
}

export async function leerCatalogo(db: BaseDatos) {
  await asegurarCatalogoInicial(db);
  const resultado = await db.prepare('SELECT sku, cantidad FROM existencias').all<Registro>();
  const cantidades = new Map(resultado.results.map(fila => [fila.sku, fila.cantidad]));
  return {
    modo: 'simulacion',
    compartido: true,
    actualizadoEn: new Date().toISOString(),
    productos: catalogoInicial.productos.map(producto => ({
      ...producto,
      variantes: producto.variantes.map(variante => ({ ...variante, stock: cantidades.get(variante.sku) ?? 0 })),
    })),
  };
}

export async function obtenerVenta(db: BaseDatos, id: string) {
  const venta = await db.prepare('SELECT id, canal, estado, nota, creada_en AS creadaEn, anulada_en AS anuladaEn FROM ventas_inventario WHERE id = ?').bind(id).first<Registro>();
  if (!venta) throw new ErrorInventario('No encontramos esa venta.', 404);
  const lineas = await db.prepare('SELECT sku, nombre, color, talle, cantidad FROM lineas_venta WHERE venta_id = ? ORDER BY nombre, color, talle').bind(id).all();
  return { ...venta, lineas: lineas.results };
}

export async function leerInventario(db: BaseDatos) {
  await asegurarCatalogoInicial(db);
  const [stock, ventas, lineas, movimientos] = await Promise.all([
    db.prepare('SELECT sku, cantidad AS stock, version, actualizada_en AS actualizadaEn FROM existencias ORDER BY sku').all<Registro>(),
    db.prepare('SELECT id, canal, estado, nota, creada_en AS creadaEn, anulada_en AS anuladaEn FROM ventas_inventario ORDER BY creada_en DESC, id DESC LIMIT 30').all<Registro>(),
    db.prepare('SELECT venta_id AS ventaId, sku, nombre, color, talle, cantidad FROM lineas_venta WHERE venta_id IN (SELECT id FROM ventas_inventario ORDER BY creada_en DESC, id DESC LIMIT 30) ORDER BY nombre, color, talle').all<Registro>(),
    db.prepare('SELECT id, sku, tipo, variacion, stock_resultante AS stockResultante, venta_id AS ventaId, ajuste_id AS ajusteId, creada_en AS creadaEn FROM movimientos_inventario ORDER BY creada_en DESC, id DESC LIMIT 50').all<Registro>(),
  ]);
  return {
    modo: 'simulacion',
    variantes: stock.results.map(fila => {
      const referencia = datosPorSku.get(fila.sku);
      return { ...fila, productoId: referencia?.productoId ?? '', nombre: referencia?.nombre ?? fila.sku, color: referencia?.color ?? '', talle: referencia?.talle ?? '' };
    }),
    ventas: ventas.results.map(venta => ({ ...venta, lineas: lineas.results.filter(linea => linea.ventaId === venta.id) })),
    movimientos: movimientos.results.map(movimiento => {
      const referencia = datosPorSku.get(movimiento.sku);
      return { ...movimiento, nombre: referencia?.nombre ?? movimiento.sku, color: referencia?.color ?? '', talle: referencia?.talle ?? '' };
    }),
  };
}

export async function confirmarVenta(db: BaseDatos, entrada: unknown, actorId: string) {
  const datos = objeto(entrada);
  const clave = claveOperacion(datos.claveOperacion);
  if (!canales.has(datos.canal)) throw new ErrorInventario('Elegí el origen de la venta.');
  if (!Array.isArray(datos.lineas) || datos.lineas.length < 1 || datos.lineas.length > 50) throw new ErrorInventario('La venta debe tener entre 1 y 50 variantes.');
  const cantidades = new Map<string, number>();
  for (const valor of datos.lineas) {
    const linea = objeto(valor);
    if (typeof linea.sku !== 'string' || !datosPorSku.has(linea.sku)) throw new ErrorInventario('La venta contiene una variante que no existe.');
    const cantidad = numeroEntero(linea.cantidad, 1, 999, 'La cantidad de venta debe ser un entero entre 1 y 999.');
    const acumulada = (cantidades.get(linea.sku) ?? 0) + cantidad;
    if (acumulada > 999) throw new ErrorInventario('La cantidad de una variante supera el máximo permitido.');
    cantidades.set(linea.sku, acumulada);
  }
  const lineas = [...cantidades].sort(([a], [b]) => a.localeCompare(b)).map(([sku, cantidad]) => ({ sku, cantidad }));
  const nota = notaOperacion(datos.nota);
  const hash = await hashContenido('venta', actorId, { canal: datos.canal, lineas, nota });
  await asegurarCatalogoInicial(db);
  const anterior = await operacionAnterior(db, clave, 'venta', hash);
  if (anterior) return { venta: await obtenerVenta(db, anterior.resultadoId), repetida: true };
  const id = crypto.randomUUID();
  const fecha = new Date().toISOString();
  const sentencias = [
    insertarOperacion(db, clave, 'venta', hash, id, actorId, fecha),
    db.prepare('INSERT INTO ventas_inventario (id, clave_operacion, canal, estado, nota, actor_id, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, clave, datos.canal, 'confirmada', nota, actorId, fecha),
    ...lineas.map(linea => {
      const referencia = datosPorSku.get(linea.sku)!;
      return db.prepare('INSERT INTO lineas_venta (id, venta_id, sku, producto_id, nombre, color, talle, cantidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, linea.sku, referencia.productoId, referencia.nombre, referencia.color, referencia.talle, linea.cantidad);
    }),
  ];
  try { await db.batch(sentencias); }
  catch (error) {
    const repetida = await operacionAnterior(db, clave, 'venta', hash);
    if (repetida) return { venta: await obtenerVenta(db, repetida.resultadoId), repetida: true };
    traducirError(error);
  }
  return { venta: await obtenerVenta(db, id), repetida: false };
}

export async function ajustarStock(db: BaseDatos, entrada: unknown, actorId: string) {
  const datos = objeto(entrada);
  const clave = claveOperacion(datos.claveOperacion);
  if (typeof datos.sku !== 'string' || !datosPorSku.has(datos.sku)) throw new ErrorInventario('Elegí una variante existente.');
  const nuevoStock = numeroEntero(datos.nuevoStock, 0, MAXIMO_STOCK, 'El stock debe ser un entero entre 0 y 1.000.000.');
  const version = numeroEntero(datos.versionEsperada, 0, Number.MAX_SAFE_INTEGER, 'La versión de la variante no es válida.');
  const nota = notaOperacion(datos.nota);
  const hash = await hashContenido('ajuste', actorId, { sku: datos.sku, nuevoStock, version, nota });
  await asegurarCatalogoInicial(db);
  const anterior = await operacionAnterior(db, clave, 'ajuste', hash);
  if (anterior) return { ajuste: await db.prepare('SELECT id, sku, stock_nuevo AS stockNuevo FROM ajustes_inventario WHERE id = ?').bind(anterior.resultadoId).first(), repetida: true };
  const stock = await db.prepare('SELECT cantidad, version FROM existencias WHERE sku = ?').bind(datos.sku).first<Registro>();
  if (!stock) throw new ErrorInventario('No encontramos esa variante en el inventario.', 404);
  if (stock.version !== version) throw new ErrorInventario('El stock cambió. Actualizá el panel antes de corregirlo.', 409);
  const id = crypto.randomUUID();
  const fecha = new Date().toISOString();
  try {
    await db.batch([
      insertarOperacion(db, clave, 'ajuste', hash, id, actorId, fecha),
      db.prepare('INSERT INTO ajustes_inventario (id, clave_operacion, sku, stock_anterior, stock_nuevo, version_esperada, nota, actor_id, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, clave, datos.sku, stock.cantidad, nuevoStock, version, nota, actorId, fecha),
    ]);
  } catch (error) {
    const repetida = await operacionAnterior(db, clave, 'ajuste', hash);
    if (repetida) return { ajuste: await db.prepare('SELECT id, sku, stock_nuevo AS stockNuevo FROM ajustes_inventario WHERE id = ?').bind(repetida.resultadoId).first(), repetida: true };
    traducirError(error);
  }
  return { ajuste: { id, sku: datos.sku, stockNuevo: nuevoStock }, repetida: false };
}

export async function anularVenta(db: BaseDatos, id: string, entrada: unknown, actorId: string) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new ErrorInventario('La referencia de venta no es válida.');
  const datos = objeto(entrada);
  const clave = claveOperacion(datos.claveOperacion);
  const hash = await hashContenido('anulacion', actorId, { ventaId: id });
  const anterior = await operacionAnterior(db, clave, 'anulacion', hash);
  if (anterior) return { venta: await obtenerVenta(db, id), repetida: true };
  const venta = await obtenerVenta(db, id);
  const fecha = new Date().toISOString();
  try {
    await db.batch([
      insertarOperacion(db, clave, 'anulacion', hash, id, actorId, fecha),
      db.prepare("UPDATE ventas_inventario SET estado = 'anulada', anulada_en = ?, anulada_por = ? WHERE id = ? AND estado = 'confirmada'").bind(fecha, actorId, id),
    ]);
  } catch (error) {
    const repetida = await operacionAnterior(db, clave, 'anulacion', hash);
    if (repetida) return { venta: await obtenerVenta(db, id), repetida: true };
    traducirError(error);
  }
  return { venta: await obtenerVenta(db, id), repetida: venta.estado === 'anulada' };
}
