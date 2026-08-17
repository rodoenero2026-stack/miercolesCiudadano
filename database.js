const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// Sanitizar parámetros para convertir 'undefined' a null (evita errores con bind parameters de mysql2)
function sanitizeParams(params) {
  if (!params) return [];
  if (!Array.isArray(params)) return [params === undefined ? null : params];
  return params.map(p => (p === undefined ? null : p));
}

// Configuración del Pool de Conexiones a MariaDB / MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || '82.197.82.73',
  user: process.env.DB_USER || 'u586318893_citas_us',
  database: process.env.DB_NAME || 'u586318893_citas_db',
  password: process.env.DB_PASS || 'O&2W3Louqk',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Envoltorio de métodos para compatibilidad y facilidad de uso con promesas
const db = {
  pool,

  // Obtener un solo registro (primer resultado o null)
  async get(sql, params = []) {
    const [rows] = await pool.query(sql, sanitizeParams(params));
    return rows && rows.length > 0 ? rows[0] : null;
  },

  // Obtener todos los registros coincidentes como Array
  async all(sql, params = []) {
    const [rows] = await pool.query(sql, sanitizeParams(params));
    return rows;
  },

  // Ejecutar INSERT / UPDATE / DELETE y retornar lastID/insertId y changes/affectedRows
  async run(sql, params = []) {
    const [result] = await pool.query(sql, sanitizeParams(params));
    return {
      lastID: result.insertId,
      insertId: result.insertId,
      changes: result.affectedRows,
      affectedRows: result.affectedRows
    };
  },

  // Ejecutar DDL o scripts SQL
  async exec(sql) {
    const [result] = await pool.query(sql);
    return result;
  },

  // Consulta general
  async query(sql, params = []) {
    const [rows] = await pool.query(sql, sanitizeParams(params));
    return rows;
  }
};

// Función para inicializar las tablas en MariaDB
async function initDatabase() {
  // Verificar conectividad con la base de datos
  const connection = await pool.getConnection();
  connection.release();

  // 1. Crear tabla ciudadanos
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ciudadanos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      telefono VARCHAR(50) NOT NULL,
      correo VARCHAR(255) NOT NULL UNIQUE,
      colonia VARCHAR(255) NOT NULL,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. Crear tabla citas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS citas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ciudadano_id INT NOT NULL,
      fecha VARCHAR(20) NOT NULL,
      hora VARCHAR(50) NOT NULL,
      motivo TEXT NOT NULL,
      estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
      notas_admin TEXT,
      CONSTRAINT fk_citas_ciudadanos FOREIGN KEY (ciudadano_id) REFERENCES ciudadanos(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. Crear tabla fechas_bloqueadas
  await db.exec(`
    CREATE TABLE IF NOT EXISTS fechas_bloqueadas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fecha VARCHAR(20) NOT NULL UNIQUE,
      motivo VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. Crear tabla administradores
  await db.exec(`
    CREATE TABLE IF NOT EXISTS administradores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Insertar administrador por defecto sólo si la tabla está completamente vacía
  const adminCount = await db.get('SELECT COUNT(*) as total FROM administradores');
  if (adminCount && adminCount.total === 0) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(defaultPassword, 10);
    await db.run('INSERT INTO administradores (usuario, password_hash) VALUES (?, ?)', ['superadmin', hash]);
    console.log('Administrador inicial ("superadmin") registrado en la base de datos MariaDB.');
  }

  console.log('Base de datos MariaDB inicializada y tablas verificadas/creadas con éxito.');
  return db;
}

module.exports = {
  initDatabase,
  db,
  pool
};
