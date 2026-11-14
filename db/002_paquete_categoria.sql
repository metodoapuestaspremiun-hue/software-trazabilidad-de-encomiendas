-- 002_paquete_categoria.sql · Categorías estándar de paquetes y trazabilidad visual
CREATE TABLE IF NOT EXISTS paquete_categoria (
  id VARCHAR(30) NOT NULL,
  label VARCHAR(60) NOT NULL,
  precio_cent INT NOT NULL,
  max_peso_g INT NULL,
  activa TINYINT(1) NOT NULL DEFAULT 1,
  orden INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO paquete_categoria (id, label, precio_cent, max_peso_g, orden) VALUES
  ('sobre', 'Sobre / Documento', 250, 500, 1),
  ('cajon_pequeno', 'Cajón Pequeño', 400, 5000, 2),
  ('carton_mediano', 'Cartón Mediano', 750, 15000, 3),
  ('carton_grande', 'Cartón Grande', 1250, 40000, 4),
  ('personalizado', 'Personalizado', 0, NULL, 5)
ON DUPLICATE KEY UPDATE label=VALUES(label), precio_cent=VALUES(precio_cent);

-- Modificaciones a la tabla bulto para guardar categoría, evidencia fotográfica y análisis de IA
-- Si la columna ya existe en despliegues previos se ignora el error en scripts de migración.
ALTER TABLE bulto ADD COLUMN categoria_id VARCHAR(30) NULL;
ALTER TABLE bulto ADD COLUMN foto_url VARCHAR(500) NULL;
ALTER TABLE bulto ADD COLUMN ia_clasificacion JSON NULL;
