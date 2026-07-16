const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

// Ruta del archivo de base de datos
const dbPath = path.resolve(__dirname, 'database.db');

// Función para inicializar la base de datos
async function initDatabase() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Habilitar claves foráneas
  await db.get('PRAGMA foreign_keys = ON');

  // Crear tabla ciudadanos
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ciudadanos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      correo TEXT NOT NULL UNIQUE,
      colonia TEXT NOT NULL,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Crear tabla citas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS citas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ciudadano_id INTEGER NOT NULL,
      fecha TEXT NOT NULL, -- Formato YYYY-MM-DD
      hora TEXT NOT NULL,  -- Ejemplo: "09:00 - 09:20"
      motivo TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente, confirmada, cancelada
      notas_admin TEXT,
      FOREIGN KEY (ciudadano_id) REFERENCES ciudadanos(id) ON DELETE CASCADE
    )
  `);

  // Crear tabla fechas_bloqueadas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS fechas_bloqueadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL UNIQUE,
      motivo TEXT NOT NULL
    )
  `);

  // Crear tabla administradores
  await db.exec(`
    CREATE TABLE IF NOT EXISTS administradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL
    )
  `);

  // Insertar administrador por defecto si no hay ninguno
  const adminExists = await db.get('SELECT * FROM administradores WHERE usuario = ?', ['admin']);
  if (!adminExists) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(defaultPassword, 10);
    await db.run('INSERT INTO administradores (usuario, password_hash) VALUES (?, ?)', ['admin', hash]);
    console.log('Administrador por defecto registrado en base de datos.');
  }

  console.log('Base de datos SQLite inicializada y tablas creadas.');
  return db;
}

module.exports = {
  initDatabase,
  dbPath
};
