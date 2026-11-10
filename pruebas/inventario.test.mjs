import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  asegurarCatalogoInicial,
  leerCatalogo,
  leerInventario,
  confirmarVenta,
  ajustarStock,
  anularVenta,
} from '../lib/inventario.ts';

const carpetaMigraciones = fileURLToPath(new URL('../drizzle/', import.meta.url));
const actor = 'administrador-de-prueba';
const sku = 'TRM-001-NEGRO-S';
const otroSku = 'TRM-001-NEGRO-M';

// Adaptador D1 para ejecutar el repositorio real con SQLite, sin red.
// batch() reproduce el contrato transaccional: todas las sentencias o ninguna.
class BasePrueba {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    const migraciones = readdirSync(carpetaMigraciones).filter(nombre => nombre.endsWith('.sql')).sort();
    assert.ok(migraciones.length, 'Debe existir una migración generada antes de probar');
    for (const nombre of migraciones) this.sqlite.exec(readFileSync(new URL(`../drizzle/${nombre}`, import.meta.url), 'utf8'));
  }
  prepare(sql) { return new SentenciaPrueba(this.sqlite, sql); }
  async batch(sentencias) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const resultados = sentencias.map(sentencia => sentencia.ejecutar());
      this.sqlite.exec('COMMIT');
      return resultados;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.sqlite.close(); }
}

class SentenciaPrueba {
  constructor(sqlite, sql, parametros = []) { this.sqlite = sqlite; this.sql = sql; this.parametros = parametros; }
  bind(...parametros) { return new SentenciaPrueba(this.sqlite, this.sql, parametros); }
  async first() { return this.sqlite.prepare(this.sql).get(...this.parametros) || null; }
  async all() { return { success: true, results: this.sqlite.prepare(this.sql).all(...this.parametros) }; }
  ejecutar() { const resultado = this.sqlite.prepare(this.sql).run(...this.parametros); return { success: true, meta: { changes: resultado.changes } }; }
}

function nuevaBase(t) { const db = new BasePrueba(); t.after(() => db.close()); return db; }
async function cantidad(db, codigo = sku) { return (await leerInventario(db)).variantes.find(variante => variante.sku === codigo); }
async function fijarStock(db, cantidadNueva, codigo = sku) {
  const variante = await cantidad(db, codigo);
  return ajustarStock(db, { claveOperacion: crypto.randomUUID(), sku: codigo, nuevoStock: cantidadNueva, versionEsperada: variante.version }, actor);
}
function venta(cantidad = 1, codigo = sku, clave = crypto.randomUUID()) {
  return { claveOperacion: clave, canal: 'whatsapp', lineas: [{ sku: codigo, cantidad }] };
}
const esConflicto = error => error.estado === 409;
const esInvalido = error => error.estado === 400;

test('la carga inicial crea 111 variantes una sola vez y no repone stock al releer', async t => {
  const db = nuevaBase(t);
  await Promise.all([asegurarCatalogoInicial(db), asegurarCatalogoInicial(db)]);
  assert.equal((await leerInventario(db)).variantes.length, 111);
  await fijarStock(db, 17);
  await asegurarCatalogoInicial(db);
  assert.equal((await cantidad(db)).stock, 17);
});

test('confirmar una venta lleva tres unidades a dos y el catálogo comparte ese resultado', async t => {
  const db = nuevaBase(t);
  await fijarStock(db, 3);
  const resultado = await confirmarVenta(db, venta(), actor);
  assert.equal(resultado.venta.estado, 'confirmada');
  assert.equal((await cantidad(db)).stock, 2);
  const catalogo = await leerCatalogo(db);
  assert.equal(catalogo.compartido, true);
  assert.equal(catalogo.productos.flatMap(producto => producto.variantes).find(variante => variante.sku === sku).stock, 2);
});

test('la venta descuenta únicamente la combinación de color y talle vendida', async t => {
  const db = nuevaBase(t);
  await fijarStock(db, 3);
  await fijarStock(db, 8, otroSku);
  await confirmarVenta(db, venta(), actor);
  assert.equal((await cantidad(db)).stock, 2);
  assert.equal((await cantidad(db, otroSku)).stock, 8);
});

test('agotar una variante devuelve cero y una venta adicional no crea cantidades negativas', async t => {
  const db = nuevaBase(t);
  await fijarStock(db, 3);
  await confirmarVenta(db, venta(3), actor);
  assert.equal((await cantidad(db)).stock, 0);
  await assert.rejects(confirmarVenta(db, venta(), actor), esConflicto);
  assert.equal((await cantidad(db)).stock, 0);
  assert.equal((await leerInventario(db)).ventas.length, 1);
});

test('una venta con varias prendas se revierte completa si falta stock en una línea', async t => {
  const db = nuevaBase(t);
  await fijarStock(db, 3);
  await fijarStock(db, 0, otroSku);
  const antes = await cantidad(db);
  await assert.rejects(confirmarVenta(db, {
    claveOperacion: crypto.randomUUID(), canal: 'local',
    lineas: [{ sku, cantidad: 1 }, { sku: otroSku, cantidad: 1 }],
  }, actor), esConflicto);
  assert.equal((await cantidad(db)).stock, 3);
  assert.equal((await cantidad(db)).version, antes.version);
  const inventario = await leerInventario(db);
  assert.equal(inventario.ventas.length, 0);
  assert.equal(inventario.movimientos.filter(movimiento => movimiento.tipo === 'venta').length, 0);
});

test('reintentar una venta con la misma clave devuelve la misma venta sin descontar otra vez', async t => {
  const db = nuevaBase(t);
  await fijarStock(db, 3);
  const solicitud = venta();
  const primera = await confirmarVenta(db, solicitud, actor);
  const segunda = await confirmarVenta(db, solicitud, actor);
  assert.equal(primera.venta.id, segunda.venta.id);
  assert.equal(segunda.repetida, true);
  assert.equal((await cantidad(db)).stock, 2);
});

test('dos reintentos simultáneos de la misma venta sólo descuentan una vez', async t => {
  const db = nuevaBase(t);
  await fijarStock(db, 3);
  const solicitud = venta();
  const respuestas = await Promise.all([confirmarVenta(db, solicitud, actor), confirmarVenta(db, solicitud, actor)]);
  assert.equal(respuestas[0].venta.id, respuestas[1].venta.id);
  assert.equal((await cantidad(db)).stock, 2);
  assert.equal((await leerInventario(db)).ventas.length, 1);
});

test('una clave reutilizada con otros datos o por otro actor se rechaza', async t => {
  const db = nuevaBase(t);
  await fijarStock(db, 5);
  const solicitud = venta();
  await confirmarVenta(db, solicitud, actor);
  await assert.rejects(confirmarVenta(db, { ...solicitud, lineas: [{ sku, cantidad: 2 }] }, actor), esConflicto);
  await assert.rejects(confirmarVenta(db, solicitud, 'otra-persona'), esConflicto);
  assert.equal((await cantidad(db)).stock, 4);
});

test('la última unidad no se vende dos veces ante confirmaciones concurrentes', async t => {
  const db = nuevaBase(t);
  await fijarStock(db, 1);
  const resultados = await Promise.allSettled([confirmarVenta(db, venta(), actor), confirmarVenta(db, venta(), actor)]);
  assert.equal(resultados.filter(resultado => resultado.status === 'fulfilled').length, 1);
  assert.equal(resultados.filter(resultado => resultado.status === 'rejected' && resultado.reason.estado === 409).length, 1);
  assert.equal((await cantidad(db)).stock, 0);
  assert.equal((await leerInventario(db)).ventas.length, 1);
});

test('anular una venta repone las prendas una sola vez aunque se repita la solicitud', async t => {
  const db = nuevaBase(t);
  await fijarStock(db, 3);
  const confirmada = await confirmarVenta(db, venta(), actor);
  const solicitud = { claveOperacion: crypto.randomUUID() };
  await anularVenta(db, confirmada.venta.id, solicitud, actor);
  await anularVenta(db, confirmada.venta.id, solicitud, actor);
  await anularVenta(db, confirmada.venta.id, { claveOperacion: crypto.randomUUID() }, actor);
  assert.equal((await cantidad(db)).stock, 3);
  const inventario = await leerInventario(db);
  assert.equal(inventario.ventas[0].estado, 'anulada');
  assert.equal(inventario.movimientos.filter(movimiento => movimiento.tipo === 'anulacion').length, 1);
});

test('un ajuste de una pantalla desactualizada no pisa una venta reciente', async t => {
  const db = nuevaBase(t);
  await fijarStock(db, 3);
  const anterior = await cantidad(db);
  await confirmarVenta(db, venta(), actor);
  await assert.rejects(ajustarStock(db, { claveOperacion: crypto.randomUUID(), sku, nuevoStock: 20, versionEsperada: anterior.version }, actor), esConflicto);
  assert.equal((await cantidad(db)).stock, 2);
});

test('reintentar un ajuste no vuelve a cambiar la versión ni crea otro movimiento', async t => {
  const db = nuevaBase(t);
  const anterior = await cantidad(db);
  const solicitud = { claveOperacion: crypto.randomUUID(), sku, nuevoStock: 12, versionEsperada: anterior.version };
  const primero = await ajustarStock(db, solicitud, actor);
  const segundo = await ajustarStock(db, solicitud, actor);
  assert.equal(primero.ajuste.id, segundo.ajuste.id);
  assert.equal(segundo.repetida, true);
  assert.equal((await cantidad(db)).version, anterior.version + 1);
});

test('las cantidades inválidas y los artículos desconocidos no crean ventas', async t => {
  const db = nuevaBase(t);
  for (const cantidad of [0, -1, 1.5, '1', 1000]) await assert.rejects(confirmarVenta(db, venta(cantidad), actor), esInvalido);
  await assert.rejects(confirmarVenta(db, venta(1, 'NO-EXISTE'), actor), esInvalido);
  await assert.rejects(confirmarVenta(db, { ...venta(), canal: 'pago-automatico' }, actor), esInvalido);
  assert.equal((await leerInventario(db)).ventas.length, 0);
});
