import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// El SKU representa una combinación de prenda, color y talle.
// Los precios siguen en el catálogo; estas tablas registran existencias y ventas.
export const existencias = sqliteTable('existencias', {
  sku: text('sku').primaryKey(),
  cantidad: integer('cantidad').notNull(),
  version: integer('version').notNull().default(0),
  actualizadaEn: text('actualizada_en').notNull(),
}, tabla => [check('existencias_no_negativas', sql`${tabla.cantidad} >= 0`)]);

export const metadatosInventario = sqliteTable('metadatos_inventario', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
});

// Cada intento conserva una clave y el hash del contenido. Reintentar una
// operación idéntica devuelve su resultado, sin volver a descontar stock.
export const operaciones = sqliteTable('operaciones_inventario', {
  clave: text('clave').primaryKey(),
  tipo: text('tipo').notNull(),
  hash: text('hash').notNull(),
  resultadoId: text('resultado_id').notNull(),
  actorId: text('actor_id').notNull(),
  creadaEn: text('creada_en').notNull(),
});

export const ventas = sqliteTable('ventas_inventario', {
  id: text('id').primaryKey(),
  claveOperacion: text('clave_operacion').notNull().references(() => operaciones.clave),
  canal: text('canal').notNull(),
  estado: text('estado').notNull().default('confirmada'),
  nota: text('nota').notNull().default(''),
  actorId: text('actor_id').notNull(),
  creadaEn: text('creada_en').notNull(),
  anuladaEn: text('anulada_en'),
  anuladaPor: text('anulada_por'),
}, tabla => [
  uniqueIndex('venta_operacion_unica').on(tabla.claveOperacion),
  check('estado_venta_valido', sql`${tabla.estado} IN ('confirmada', 'anulada')`),
  check('canal_venta_valido', sql`${tabla.canal} IN ('whatsapp', 'local', 'instagram', 'web')`),
]);

export const lineasVenta = sqliteTable('lineas_venta', {
  id: text('id').primaryKey(),
  ventaId: text('venta_id').notNull().references(() => ventas.id),
  sku: text('sku').notNull().references(() => existencias.sku),
  productoId: text('producto_id').notNull(),
  nombre: text('nombre').notNull(),
  color: text('color').notNull(),
  talle: text('talle').notNull(),
  cantidad: integer('cantidad').notNull(),
}, tabla => [
  uniqueIndex('venta_sku_unico').on(tabla.ventaId, tabla.sku),
  check('cantidad_venta_positiva', sql`${tabla.cantidad} > 0`),
]);

export const ajustes = sqliteTable('ajustes_inventario', {
  id: text('id').primaryKey(),
  claveOperacion: text('clave_operacion').notNull().references(() => operaciones.clave),
  sku: text('sku').notNull().references(() => existencias.sku),
  stockAnterior: integer('stock_anterior').notNull(),
  stockNuevo: integer('stock_nuevo').notNull(),
  versionEsperada: integer('version_esperada').notNull(),
  nota: text('nota').notNull().default(''),
  actorId: text('actor_id').notNull(),
  creadaEn: text('creada_en').notNull(),
}, tabla => [
  uniqueIndex('ajuste_operacion_unica').on(tabla.claveOperacion),
  check('ajuste_stock_no_negativo', sql`${tabla.stockNuevo} >= 0`),
]);

export const movimientos = sqliteTable('movimientos_inventario', {
  id: text('id').primaryKey(),
  sku: text('sku').notNull().references(() => existencias.sku),
  tipo: text('tipo').notNull(),
  variacion: integer('variacion').notNull(),
  stockResultante: integer('stock_resultante').notNull(),
  ventaId: text('venta_id').references(() => ventas.id),
  ajusteId: text('ajuste_id').references(() => ajustes.id),
  actorId: text('actor_id').notNull(),
  creadaEn: text('creada_en').notNull(),
});
