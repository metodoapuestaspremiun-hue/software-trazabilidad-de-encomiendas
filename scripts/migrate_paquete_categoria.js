const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME
  });
  console.log('Conectado a MySQL exitosamente');
  
  await conn.query(`
    CREATE TABLE IF NOT EXISTS paquete_categoria (
      id VARCHAR(30) NOT NULL,
      label VARCHAR(60) NOT NULL,
      precio_cent INT NOT NULL,
      max_peso_g INT NULL,
      activa TINYINT(1) NOT NULL DEFAULT 1,
      orden INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  
  await conn.query(`
    INSERT INTO paquete_categoria (id, label, precio_cent, max_peso_g, orden) VALUES
      ('sobre', 'Sobre / Documento', 250, 500, 1),
      ('cajon_pequeno', 'Cajón Pequeño', 400, 5000, 2),
      ('carton_mediano', 'Cartón Mediano', 750, 15000, 3),
      ('carton_grande', 'Cartón Grande', 1250, 40000, 4),
      ('personalizado', 'Personalizado', 0, NULL, 5)
    ON DUPLICATE KEY UPDATE label=VALUES(label), precio_cent=VALUES(precio_cent);
  `);
  
  try {
    await conn.query('ALTER TABLE bulto ADD COLUMN categoria_id VARCHAR(30) NULL');
    console.log('Agregada columna categoria_id');
  } catch(e) { if (!e.message.includes('Duplicate column')) console.log('col categoria_id:', e.message); }
  
  try {
    await conn.query('ALTER TABLE bulto ADD COLUMN foto_url VARCHAR(500) NULL');
    console.log('Agregada columna foto_url');
  } catch(e) { if (!e.message.includes('Duplicate column')) console.log('col foto_url:', e.message); }
  
  try {
    await conn.query('ALTER TABLE bulto ADD COLUMN ia_clasificacion JSON NULL');
    console.log('Agregada columna ia_clasificacion');
  } catch(e) { if (!e.message.includes('Duplicate column')) console.log('col ia_clasificacion:', e.message); }

  console.log('Migración completada con éxito');
  await conn.end();
}

run().catch(err => { console.error('Error migración:', err); process.exit(1); });