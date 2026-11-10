CREATE TABLE `ajustes_inventario` (
	`id` text PRIMARY KEY NOT NULL,
	`clave_operacion` text NOT NULL,
	`sku` text NOT NULL,
	`stock_anterior` integer NOT NULL,
	`stock_nuevo` integer NOT NULL,
	`version_esperada` integer NOT NULL,
	`nota` text DEFAULT '' NOT NULL,
	`actor_id` text NOT NULL,
	`creada_en` text NOT NULL,
	FOREIGN KEY (`clave_operacion`) REFERENCES `operaciones_inventario`(`clave`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sku`) REFERENCES `existencias`(`sku`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ajuste_stock_no_negativo" CHECK("ajustes_inventario"."stock_nuevo" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ajuste_operacion_unica` ON `ajustes_inventario` (`clave_operacion`);--> statement-breakpoint
CREATE TABLE `existencias` (
	`sku` text PRIMARY KEY NOT NULL,
	`cantidad` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`actualizada_en` text NOT NULL,
	CONSTRAINT "existencias_no_negativas" CHECK("existencias"."cantidad" >= 0)
);
--> statement-breakpoint
CREATE TABLE `lineas_venta` (
	`id` text PRIMARY KEY NOT NULL,
	`venta_id` text NOT NULL,
	`sku` text NOT NULL,
	`producto_id` text NOT NULL,
	`nombre` text NOT NULL,
	`color` text NOT NULL,
	`talle` text NOT NULL,
	`cantidad` integer NOT NULL,
	FOREIGN KEY (`venta_id`) REFERENCES `ventas_inventario`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sku`) REFERENCES `existencias`(`sku`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cantidad_venta_positiva" CHECK("lineas_venta"."cantidad" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venta_sku_unico` ON `lineas_venta` (`venta_id`,`sku`);--> statement-breakpoint
CREATE TABLE `metadatos_inventario` (
	`clave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movimientos_inventario` (
	`id` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`tipo` text NOT NULL,
	`variacion` integer NOT NULL,
	`stock_resultante` integer NOT NULL,
	`venta_id` text,
	`ajuste_id` text,
	`actor_id` text NOT NULL,
	`creada_en` text NOT NULL,
	FOREIGN KEY (`sku`) REFERENCES `existencias`(`sku`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`venta_id`) REFERENCES `ventas_inventario`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ajuste_id`) REFERENCES `ajustes_inventario`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `operaciones_inventario` (
	`clave` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`hash` text NOT NULL,
	`resultado_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`creada_en` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ventas_inventario` (
	`id` text PRIMARY KEY NOT NULL,
	`clave_operacion` text NOT NULL,
	`canal` text NOT NULL,
	`estado` text DEFAULT 'confirmada' NOT NULL,
	`nota` text DEFAULT '' NOT NULL,
	`actor_id` text NOT NULL,
	`creada_en` text NOT NULL,
	`anulada_en` text,
	`anulada_por` text,
	FOREIGN KEY (`clave_operacion`) REFERENCES `operaciones_inventario`(`clave`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "estado_venta_valido" CHECK("ventas_inventario"."estado" IN ('confirmada', 'anulada')),
	CONSTRAINT "canal_venta_valido" CHECK("ventas_inventario"."canal" IN ('whatsapp', 'local', 'instagram', 'web'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venta_operacion_unica` ON `ventas_inventario` (`clave_operacion`);
--> statement-breakpoint
-- Una venta completa se confirma en un único batch. Si una línea no tiene
-- stock, ABORT hace que D1 revierta también todas las líneas anteriores.
CREATE TRIGGER `validar_linea_venta`
BEFORE INSERT ON `lineas_venta`
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `ventas_inventario` WHERE `id` = NEW.`venta_id` AND `estado` = 'confirmada'
  ) THEN RAISE(ABORT, 'venta_no_confirmada') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `existencias` WHERE `sku` = NEW.`sku` AND `cantidad` >= NEW.`cantidad`
  ) THEN RAISE(ABORT, 'stock_insuficiente') END;
END;
--> statement-breakpoint
CREATE TRIGGER `descontar_linea_venta`
AFTER INSERT ON `lineas_venta`
BEGIN
  UPDATE `existencias`
  SET `cantidad` = `cantidad` - NEW.`cantidad`,
      `version` = `version` + 1,
      `actualizada_en` = (SELECT `creada_en` FROM `ventas_inventario` WHERE `id` = NEW.`venta_id`)
  WHERE `sku` = NEW.`sku`;
  INSERT INTO `movimientos_inventario` (`id`, `sku`, `tipo`, `variacion`, `stock_resultante`, `venta_id`, `actor_id`, `creada_en`)
  SELECT 'venta:' || NEW.`id`, NEW.`sku`, 'venta', -NEW.`cantidad`, e.`cantidad`, NEW.`venta_id`, v.`actor_id`, v.`creada_en`
  FROM `existencias` e JOIN `ventas_inventario` v ON v.`id` = NEW.`venta_id`
  WHERE e.`sku` = NEW.`sku`;
END;
--> statement-breakpoint
-- La versión evita que una corrección desde una pantalla vieja pise una venta.
CREATE TRIGGER `validar_ajuste_stock`
BEFORE INSERT ON `ajustes_inventario`
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `existencias`
    WHERE `sku` = NEW.`sku` AND `version` = NEW.`version_esperada` AND `cantidad` = NEW.`stock_anterior`
  ) THEN RAISE(ABORT, 'version_stock_cambiada') END;
END;
--> statement-breakpoint
CREATE TRIGGER `aplicar_ajuste_stock`
AFTER INSERT ON `ajustes_inventario`
BEGIN
  UPDATE `existencias`
  SET `cantidad` = NEW.`stock_nuevo`, `version` = `version` + 1, `actualizada_en` = NEW.`creada_en`
  WHERE `sku` = NEW.`sku`;
  INSERT INTO `movimientos_inventario` (`id`, `sku`, `tipo`, `variacion`, `stock_resultante`, `ajuste_id`, `actor_id`, `creada_en`)
  VALUES ('ajuste:' || NEW.`id`, NEW.`sku`, 'ajuste', NEW.`stock_nuevo` - NEW.`stock_anterior`, NEW.`stock_nuevo`, NEW.`id`, NEW.`actor_id`, NEW.`creada_en`);
END;
--> statement-breakpoint
-- Sólo la transición confirmada -> anulada repone cantidades. Reintentar
-- anular una venta que ya está anulada no vuelve a sumar sus prendas.
CREATE TRIGGER `reponer_venta_anulada`
AFTER UPDATE OF `estado` ON `ventas_inventario`
WHEN OLD.`estado` = 'confirmada' AND NEW.`estado` = 'anulada'
BEGIN
  UPDATE `existencias`
  SET `cantidad` = `cantidad` + (
        SELECT l.`cantidad` FROM `lineas_venta` l WHERE l.`venta_id` = NEW.`id` AND l.`sku` = `existencias`.`sku`
      ),
      `version` = `version` + 1,
      `actualizada_en` = NEW.`anulada_en`
  WHERE `sku` IN (SELECT `sku` FROM `lineas_venta` WHERE `venta_id` = NEW.`id`);
  INSERT INTO `movimientos_inventario` (`id`, `sku`, `tipo`, `variacion`, `stock_resultante`, `venta_id`, `actor_id`, `creada_en`)
  SELECT 'anulacion:' || NEW.`id` || ':' || l.`sku`, l.`sku`, 'anulacion', l.`cantidad`, e.`cantidad`, NEW.`id`, NEW.`anulada_por`, NEW.`anulada_en`
  FROM `lineas_venta` l JOIN `existencias` e ON e.`sku` = l.`sku`
  WHERE l.`venta_id` = NEW.`id`;
END;
