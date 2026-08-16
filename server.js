require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { initDatabase } = require('./database');
const { sendConfirmationEmail, sendReminderEmail, sendStatusUpdateEmail, sendRescheduleEmail } = require('./emailService');

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!JWT_SECRET) {
  console.error('FATAL: La variable de entorno JWT_SECRET no está definida.');
  process.exit(1);
}

// Configuración de Rate Limit público (10 peticiones por IP cada 15 minutos)
const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Límite de 10 peticiones por IP
  message: {
    error: 'Has superado el límite de intentos permitidos (máximo 10 peticiones cada 15 minutos). Por favor, inténtalo de nuevo más tarde.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Configuración de Rate Limit estricto para Login (Prevención de ataques de fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Límite de 5 intentos por IP
  message: {
    error: 'Has superado el límite de intentos de inicio de sesión (máximo 5 intentos cada 15 minutos). Por seguridad, inténtalo más tarde.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middlewares
app.use(cors());
app.use(express.json());

// Cabeceras de Seguridad HTTP (Security Headers)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Servir favicon.ico
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'img', 'logo.webp'));
});

// Servir los archivos estáticos requeridos de forma individual
app.use('/img', express.static(path.join(__dirname, 'img')));
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'styles.css')));
app.get('/admin.css', (req, res) => res.sendFile(path.join(__dirname, 'admin.css')));
app.get('/index.js', (req, res) => res.sendFile(path.join(__dirname, 'index.js')));
app.get('/admin.js', (req, res) => res.sendFile(path.join(__dirname, 'admin.js')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Variable de base de datos global
let db;

// Inicialización de la base de datos y arranque del servidor
initDatabase()
  .then((database) => {
    db = database;
    app.listen(PORT, () => {
      console.log(`Servidor de Miércoles Ciudadano ejecutándose en http://localhost:${PORT}`);
    });

    // Programar recordatorios por correo todos los días a las 08:00 AM (Zona Horaria CDMX)
    cron.schedule('0 8 * * *', async () => {
      console.log('Ejecutando cron de recordatorios de citas...');
      try {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0]; // Formato: YYYY-MM-DD

        const appointmentsTomorrow = await db.all(`
          SELECT c.id, c.fecha, c.hora, c.motivo, c.estado, c.notas_admin,
                 ci.nombre, ci.correo
          FROM citas c
          JOIN ciudadanos ci ON c.ciudadano_id = ci.id
          WHERE c.fecha = ? AND c.estado != 'cancelada'
        `, [tomorrowStr]);

        console.log(`Se encontraron ${appointmentsTomorrow.length} citas activas para mañana (${tomorrowStr}).`);

        for (const app of appointmentsTomorrow) {
          const citizen = { nombre: app.nombre, correo: app.correo };
          const appointment = {
            folio: `SF-${0 + app.id}`,
            fecha: app.fecha,
            hora: app.hora,
            motivo: app.motivo,
            estado: app.estado
          };
          
          await sendReminderEmail(citizen, appointment).catch(err => 
            console.error(`Error al enviar recordatorio para folio ${appointment.folio}:`, err)
          );
        }
      } catch (error) {
        console.error('Error al ejecutar cron de recordatorios:', error);
      }
    }, {
      scheduled: true,
      timezone: "America/Mexico_City"
    });
    console.log('Cron de recordatorios programado (Diario 08:00 AM - America/Mexico_City)');
  })
  .catch((err) => {
    console.error('Error al iniciar la base de datos:', err);
    process.exit(1);
  });

// --- MIDDLEWARE DE AUTENTICACIÓN POR TOKEN ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
    req.admin = decoded;
    next();
  });
}

// --- ENDPOINTS DE AUTENTICACIÓN ---

// Login para obtener Token Admin (Con Limite de Fuerza Bruta)
app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'La contraseña es requerida.' });
  }

  const targetUsername = (username && username.trim()) ? username.trim() : '';

  if (!targetUsername) {
    return res.status(400).json({ error: 'El nombre de usuario es requerido.' });
  }

  try {
    const adminUser = await db.get('SELECT * FROM administradores WHERE LOWER(usuario) = LOWER(?)', [targetUsername]);
    if (!adminUser) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const match = await bcrypt.compare(password, adminUser.password_hash);
    if (match) {
      const token = jwt.sign({ id: adminUser.id, usuario: adminUser.usuario, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
      return res.json({ success: true, token });
    } else {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    return res.status(500).json({ error: 'Error interno del servidor al iniciar sesión.' });
  }
});

// Cambiar Contraseña del Administrador (Protegido con JWT)
app.put('/api/admin/cambiar-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'La contraseña actual y la nueva contraseña son requeridas.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe constar de al menos 6 caracteres por seguridad.' });
  }

  try {
    const userId = req.admin?.id;
    const adminUser = userId 
      ? await db.get('SELECT * FROM administradores WHERE id = ?', [userId])
      : await db.get('SELECT * FROM administradores WHERE usuario = ?', ['admin']);

    if (!adminUser) {
      return res.status(404).json({ error: 'Cuenta de administrador no encontrada.' });
    }

    const match = await bcrypt.compare(currentPassword, adminUser.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'La contraseña actual ingresada es incorrecta.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE administradores SET password_hash = ? WHERE id = ?', [newHash, adminUser.id]);

    return res.json({ success: true, message: 'La contraseña de administración ha sido actualizada correctamente.' });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    return res.status(500).json({ error: 'Error interno del servidor al cambiar la contraseña.' });
  }
});

// --- ENDPOINTS REST ---

// 1. POST /api/registro: Registrar a un Ciudadano (Con Rate Limiting y Validación Estricta)
app.post('/api/registro', publicApiLimiter, async (req, res) => {
  const { nombre, telefono, correo, colonia } = req.body;

  // Validaciones básicas
  if (!nombre || !telefono || !correo || !colonia) {
    return res.status(400).json({ error: 'Todos los campos del ciudadano son obligatorios.' });
  }

  // Validar formato de correo electrónico
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(correo.trim())) {
    return res.status(400).json({ error: 'El correo electrónico ingresado no tiene un formato válido.' });
  }

  // Validar teléfono (10 dígitos)
  const phoneDigits = telefono.replace(/\D/g, '');
  if (phoneDigits.length !== 10) {
    return res.status(400).json({ error: 'El número de teléfono debe constar exactamente de 10 dígitos.' });
  }

  try {
    // Comprobar si el ciudadano ya existe por correo
    const existingCitizen = await db.get('SELECT * FROM ciudadanos WHERE correo = ?', [correo.trim().toLowerCase()]);
    if (existingCitizen) {
      // Si ya existe, actualizamos su información por si cambió de colonia, teléfono o nombre
      await db.run(
        `UPDATE ciudadanos 
         SET nombre = ?, telefono = ?, colonia = ? 
         WHERE id = ?`,
        [nombre.trim(), phoneDigits, colonia.trim(), existingCitizen.id]
      );
      
      const updatedCitizen = await db.get('SELECT * FROM ciudadanos WHERE id = ?', [existingCitizen.id]);
      return res.status(200).json({
        message: 'Ciudadano ya registrado anteriormente (datos actualizados).',
        citizen: updatedCitizen
      });
    }

    // Insertar nuevo ciudadano
    const result = await db.run(
      `INSERT INTO ciudadanos (nombre, telefono, correo, colonia) 
       VALUES (?, ?, ?, ?)`,
      [nombre.trim(), phoneDigits, correo.trim().toLowerCase(), colonia.trim()]
    );

    const newCitizen = await db.get('SELECT * FROM ciudadanos WHERE id = ?', [result.lastID]);
    return res.status(201).json({
      message: 'Ciudadano registrado con éxito.',
      citizen: newCitizen
    });
  } catch (error) {
    console.error('Error al registrar ciudadano:', error);
    return res.status(500).json({ error: 'Error interno del servidor al registrar el ciudadano.' });
  }
});

// Endpoint público para obtener los horarios ya ocupados en una fecha (sin datos personales)
app.get('/api/citas-ocupadas', async (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ error: 'La fecha es requerida.' });
  }

  try {
    const appointments = await db.all(
      "SELECT hora FROM citas WHERE fecha = ? AND estado != 'cancelada'",
      [fecha]
    );
    const occupiedSlots = appointments.map(app => app.hora);
    return res.json(occupiedSlots);
  } catch (error) {
    console.error('Error al obtener horarios ocupados:', error);
    return res.status(500).json({ error: 'Error al consultar horarios ocupados.' });
  }
});

// GET /api/citas/consultar: Consulta pública de cita por folio y dato de contacto
app.get('/api/citas/consultar', async (req, res) => {
  const { folio, contacto } = req.query;

  if (!folio || !contacto) {
    return res.status(400).json({ error: 'El folio y el dato de contacto (correo o teléfono) son obligatorios.' });
  }

  // Extraer el ID del folio (ej: SF-05 -> 5)
  const match = folio.trim().match(/^SF-(\d+)$/i);
  if (!match) {
    return res.status(400).json({ error: 'Formato de folio inválido. Debe ser similar a SF-01.' });
  }
  const appointmentId = parseInt(match[1], 10);

  // Limpiar el contacto
  const contactoClean = contacto.trim().toLowerCase();
  const telefonoClean = contacto.replace(/\D/g, '');

  try {
    const appointment = await db.get(`
      SELECT c.id, c.fecha, c.hora, c.motivo, c.estado, c.notas_admin,
             ci.nombre, ci.colonia
      FROM citas c
      JOIN ciudadanos ci ON c.ciudadano_id = ci.id
      WHERE c.id = ? AND (LOWER(ci.correo) = ? OR ci.telefono = ?)
    `, [appointmentId, contactoClean, telefonoClean]);

    if (!appointment) {
      return res.status(404).json({ error: 'No se encontró ninguna cita con el folio y datos de contacto proporcionados. Verifique sus datos.' });
    }

    return res.json({
      folio: 'SF-' + String(appointment.id).padStart(2, '0'),
      nombre: appointment.nombre,
      colonia: appointment.colonia,
      fecha: appointment.fecha,
      hora: appointment.hora,
      motivo: appointment.motivo,
      estado: appointment.estado,
      notas_admin: appointment.notas_admin || 'Sin observaciones.'
    });
  } catch (error) {
    console.error('Error al consultar cita:', error);
    return res.status(500).json({ error: 'Error interno del servidor al consultar la cita.' });
  }
});

// 2. POST /api/agendar-cita: Crear una cita para un ciudadano (Con Rate Limiting)
app.post('/api/agendar-cita', publicApiLimiter, async (req, res) => {
  const { ciudadano_id, fecha, hora, motivo } = req.body;

  if (!ciudadano_id || !fecha || !hora || !motivo) {
    return res.status(400).json({ error: 'Todos los campos son requeridos para agendar la cita.' });
  }

  // Validar formato de fecha (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(fecha)) {
    return res.status(400).json({ error: 'Formato de fecha inválido. Debe ser YYYY-MM-DD.' });
  }

  // Validar que la fecha seleccionada sea un día miércoles
  const [year, month, day] = fecha.split('-').map(Number);
  // Usamos Date.UTC para evitar cualquier desfase de zona horaria al verificar el día de la semana
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDay() !== 3) {
    return res.status(400).json({ error: 'Las audiencias de Miércoles Ciudadano solo pueden programarse en días miércoles.' });
  }

  // Validar que la fecha seleccionada sea hoy o una fecha futura en la zona horaria local (CDMX)
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  if (fecha < todayStr) {
    return res.status(400).json({ error: 'Las audiencias solo pueden programarse para el día de hoy o fechas futuras.' });
  }

  try {
    // Verificar que el ciudadano exista
    const citizen = await db.get('SELECT * FROM ciudadanos WHERE id = ?', [ciudadano_id]);
    if (!citizen) {
      return res.status(404).json({ error: 'El ciudadano especificado no existe.' });
    }

    // Verificar si la fecha está bloqueada
    const blockedDate = await db.get('SELECT * FROM fechas_bloqueadas WHERE fecha = ?', [fecha]);
    if (blockedDate) {
      return res.status(400).json({ error: `La fecha seleccionada (${fecha}) no está disponible: ${blockedDate.motivo}` });
    }

    // 1. Límite de 15 citas por miércoles
    const activeAppointmentsOnDate = await db.get(
      "SELECT count(*) as total FROM citas WHERE fecha = ? AND estado != 'cancelada'",
      [fecha]
    );

    if (activeAppointmentsOnDate.total >= 15) {
      return res.status(400).json({
        error: 'Límite alcanzado. Ya existen 15 citas agendadas y activas para este miércoles.'
      });
    }

    // 2. Validación de que no se dupliquen horarios el mismo miércoles (excluyendo canceladas)
    const duplicateSlot = await db.get(
      "SELECT * FROM citas WHERE fecha = ? AND hora = ? AND estado != 'cancelada'",
      [fecha, hora]
    );

    if (duplicateSlot) {
      return res.status(400).json({
        error: 'El horario seleccionado ya se encuentra ocupado para este miércoles.'
      });
    }

    // Opcional: Validar que el mismo ciudadano no tenga otra cita activa en la misma fecha
    const duplicateCitizenDate = await db.get(
      "SELECT * FROM citas WHERE ciudadano_id = ? AND fecha = ? AND estado != 'cancelada'",
      [ciudadano_id, fecha]
    );

    if (duplicateCitizenDate) {
      return res.status(400).json({
        error: 'El ciudadano ya cuenta con una cita activa programada para este mismo miércoles.'
      });
    }

    // Generar un Folio aleatorio (ej. SF-48921) para identificar la cita
    // Nota: Aunque el id numérico es la clave primaria, guardaremos el folio en notas_admin o como parte de la respuesta.
    // Para conservar consistencia con el front, agregaremos el folio en una columna o lo generamos dinámicamente.
    // Como la tabla citas del usuario no especificó columna 'folio', la guardaremos en 'notas_admin' si es preciso,
    // o simplemente crearemos el registro. Vamos a agregar la columna folio de forma dinámica o retornarla.
    // Para simplificar, la columna folio se puede autogenerar o guardar en notas_admin. Guardémosla como prefijo en notas_admin
    // o simplemente devolvamos el folio en la respuesta calculando "SF-" + (10000 + id).
    
    // Crear el registro de la cita
    const result = await db.run(
      `INSERT INTO citas (ciudadano_id, fecha, hora, motivo, estado, notas_admin) 
       VALUES (?, ?, ?, ?, 'pendiente', ?)`,
      [ciudadano_id, fecha, hora.trim(), motivo.trim(), 'Folio asignado al agendar.']
    );

    // Obtener la cita recién creada junto con los datos del ciudadano
    const newAppointment = await db.get(
      `SELECT c.id, c.fecha, c.hora, c.motivo, c.estado, c.notas_admin,
              ci.nombre, ci.telefono, ci.correo, ci.colonia
       FROM citas c
       JOIN ciudadanos ci ON c.ciudadano_id = ci.id
       WHERE c.id = ?`,
      [result.lastID]
    );

    // Generamos el Folio virtualmente basado en el ID para mantener compatibilidad
    const virtualFolio = 'SF-' + String(newAppointment.id).padStart(2, '0');

    // Enviar correo de confirmación de cita (asíncrono)
    sendConfirmationEmail(
      { nombre: newAppointment.nombre, correo: newAppointment.correo },
      { folio: virtualFolio, fecha: newAppointment.fecha, hora: newAppointment.hora, motivo: newAppointment.motivo }
    ).catch(err => console.error('Error al enviar correo de confirmación:', err));

    return res.status(201).json({
      message: 'Cita programada con éxito.',
      appointment: {
        ...newAppointment,
        folio: virtualFolio
      }
    });
  } catch (error) {
    console.error('Error al agendar cita:', error);
    return res.status(500).json({ error: 'Error interno del servidor al programar la cita.' });
  }
});

// 3. GET /api/citas: Listado de citas (Protegido con Token JWT)
app.get('/api/citas', authenticateToken, async (req, res) => {
  try {
    const appointments = await db.all(`
      SELECT c.id, c.fecha, c.hora, c.motivo, c.estado, c.notas_admin,
             ci.id as ciudadano_id, ci.nombre, ci.telefono, ci.correo, ci.colonia
      FROM citas c
      JOIN ciudadanos ci ON c.ciudadano_id = ci.id
      ORDER BY c.fecha ASC, c.hora ASC
    `);

    // Añadir folio virtual a cada cita para compatibilidad
    const mappedAppointments = appointments.map(app => ({
      ...app,
      folio: 'SF-' + String(app.id).padStart(2, '0')
    }));

    return res.json(mappedAppointments);
  } catch (error) {
    console.error('Error al obtener citas:', error);
    return res.status(500).json({ error: 'Error interno del servidor al consultar las citas.' });
  }
});

// 4. PUT /api/citas/:id/estado: Actualizar estado de una cita y notas_admin (Protegido con Token JWT)
app.put('/api/citas/:id/estado', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { estado, notas_admin } = req.body;

  if (!estado) {
    return res.status(400).json({ error: 'El estado es obligatorio.' });
  }

  const validStatuses = ['pendiente', 'confirmada', 'cancelada'];
  if (!validStatuses.includes(estado.toLowerCase())) {
    return res.status(400).json({ error: 'Estado inválido. Debe ser: pendiente, confirmada o cancelada.' });
  }

  try {
    // Verificar si la cita existe
    const existingAppointment = await db.get('SELECT * FROM citas WHERE id = ?', [id]);
    if (!existingAppointment) {
      return res.status(404).json({ error: 'La cita especificada no existe.' });
    }

    // Si se está cambiando el estado de cancelada a activa (pendiente/confirmada), debemos re-validar los límites y bloqueos
    if (existingAppointment.estado === 'cancelada' && estado.toLowerCase() !== 'cancelada') {
      const fecha = existingAppointment.fecha;
      const hora = existingAppointment.hora;

      // Verificar si la fecha está bloqueada
      const blockedDate = await db.get('SELECT * FROM fechas_bloqueadas WHERE fecha = ?', [fecha]);
      if (blockedDate) {
        return res.status(400).json({ error: `No se puede reactivar la cita. La fecha (${fecha}) está bloqueada: ${blockedDate.motivo}` });
      }

      // 1. Límite de 15 por miércoles
      const activeAppointmentsOnDate = await db.get(
        "SELECT count(*) as total FROM citas WHERE fecha = ? AND estado != 'cancelada'",
        [fecha]
      );
      if (activeAppointmentsOnDate.total >= 15) {
        return res.status(400).json({
          error: 'No se puede reactivar la cita. Límite de 15 citas alcanzado para este miércoles.'
        });
      }

      // 2. Conflicto de horario
      const duplicateSlot = await db.get(
        "SELECT * FROM citas WHERE fecha = ? AND hora = ? AND estado != 'cancelada' AND id != ?",
        [fecha, hora, id]
      );
      if (duplicateSlot) {
        return res.status(400).json({
          error: 'No se puede reactivar la cita. El horario seleccionado ya se encuentra ocupado por otra cita activa.'
        });
      }
    }

    // Actualizar registro
    await db.run(
      `UPDATE citas 
       SET estado = ?, notas_admin = COALESCE(?, notas_admin) 
       WHERE id = ?`,
      [estado.toLowerCase(), notas_admin, id]
    );

    // Obtener la cita actualizada
    const updatedAppointment = await db.get(
      `SELECT c.id, c.fecha, c.hora, c.motivo, c.estado, c.notas_admin,
              ci.nombre, ci.telefono, ci.correo, ci.colonia
       FROM citas c
       JOIN ciudadanos ci ON c.ciudadano_id = ci.id
       WHERE c.id = ?`,
      [id]
    );

    // Enviar correo de notificación de actualización de estado (asíncrono)
    sendStatusUpdateEmail(
      { nombre: updatedAppointment.nombre, correo: updatedAppointment.correo },
      { 
        folio: 'SF-' + String(updatedAppointment.id).padStart(2, '0'), 
        fecha: updatedAppointment.fecha, 
        hora: updatedAppointment.hora, 
        motivo: updatedAppointment.motivo, 
        estado: updatedAppointment.estado, 
        notas_admin: updatedAppointment.notas_admin 
      }
    ).catch(err => console.error('Error al enviar correo de actualización de estado:', err));

    return res.json({
      message: 'Cita actualizada con éxito.',
      appointment: {
        ...updatedAppointment,
        folio: 'SF-' + String(updatedAppointment.id).padStart(2, '0')
      }
    });
  } catch (error) {
    console.error('Error al actualizar cita:', error);
    return res.status(500).json({ error: 'Error interno del servidor al actualizar la cita.' });
  }
});

// 5. PUT /api/citas/:id/reagendar: Reagendar una cita (Protegido con Token JWT)
app.put('/api/citas/:id/reagendar', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { fecha, hora, notas_admin } = req.body;

  if (!fecha || !hora) {
    return res.status(400).json({ error: 'La fecha y la hora son obligatorias para reagendar.' });
  }

  // Validar formato de fecha (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(fecha)) {
    return res.status(400).json({ error: 'Formato de fecha inválido. Debe ser YYYY-MM-DD.' });
  }

  // Validar que la fecha seleccionada sea un día miércoles
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDay() !== 3) {
    return res.status(400).json({ error: 'Las audiencias de Miércoles Ciudadano solo pueden programarse en días miércoles.' });
  }

  // Validar que la fecha seleccionada sea hoy o una fecha futura en la zona horaria local (CDMX)
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  if (fecha < todayStr) {
    return res.status(400).json({ error: 'Las audiencias solo pueden reprogramarse para el día de hoy o fechas futuras.' });
  }

  try {
    // Verificar si la cita existe
    const existingAppointment = await db.get('SELECT * FROM citas WHERE id = ?', [id]);
    if (!existingAppointment) {
      return res.status(404).json({ error: 'La cita especificada no existe.' });
    }

    // Verificar si la fecha de destino está bloqueada
    const blockedDate = await db.get('SELECT * FROM fechas_bloqueadas WHERE fecha = ?', [fecha]);
    if (blockedDate) {
      return res.status(400).json({ error: `La fecha seleccionada (${fecha}) está bloqueada: ${blockedDate.motivo}` });
    }

    // Si la fecha o la hora cambian, verificar duplicados y límites
    if (existingAppointment.fecha !== fecha || existingAppointment.hora !== hora) {
      // 1. Límite de 15 citas por miércoles en la nueva fecha (si cambió la fecha)
      if (existingAppointment.fecha !== fecha) {
        const activeAppointmentsOnDate = await db.get(
          "SELECT count(*) as total FROM citas WHERE fecha = ? AND estado != 'cancelada'",
          [fecha]
        );
        if (activeAppointmentsOnDate.total >= 15) {
          return res.status(400).json({
            error: 'Límite alcanzado. Ya existen 15 citas activas para este miércoles de destino.'
          });
        }
      }

      // 2. Validación de que no se dupliquen horarios en el mismo miércoles (excluyendo la propia cita y canceladas)
      const duplicateSlot = await db.get(
        "SELECT * FROM citas WHERE fecha = ? AND hora = ? AND estado != 'cancelada' AND id != ?",
        [fecha, hora, id]
      );
      if (duplicateSlot) {
        return res.status(400).json({
          error: 'El horario seleccionado ya se encuentra ocupado para este miércoles por otra cita activa.'
        });
      }
    }

    // Actualizar registro con la nueva fecha, hora y notas de administración
    await db.run(
      `UPDATE citas 
       SET fecha = ?, hora = ?, notas_admin = COALESCE(?, notas_admin)
       WHERE id = ?`,
      [fecha, hora.trim(), notas_admin, id]
    );

    // Obtener la cita actualizada
    const updatedAppointment = await db.get(
      `SELECT c.id, c.fecha, c.hora, c.motivo, c.estado, c.notas_admin,
              ci.nombre, ci.telefono, ci.correo, ci.colonia
       FROM citas c
       JOIN ciudadanos ci ON c.ciudadano_id = ci.id
       WHERE c.id = ?`,
      [id]
    );

    const virtualFolio = 'SF-' + String(updatedAppointment.id).padStart(2, '0');

    // Enviar correo de notificación de reprogramación (asíncrono)
    sendRescheduleEmail(
      { nombre: updatedAppointment.nombre, correo: updatedAppointment.correo },
      { 
        folio: virtualFolio, 
        fecha: updatedAppointment.fecha, 
        hora: updatedAppointment.hora, 
        motivo: updatedAppointment.motivo,
        estado: updatedAppointment.estado,
        notas_admin: updatedAppointment.notas_admin
      }
    ).catch(err => console.error('Error al enviar correo de reprogramación:', err));

    return res.json({
      message: 'Cita reprogramada con éxito.',
      appointment: {
        ...updatedAppointment,
        folio: virtualFolio
      }
    });
  } catch (error) {
    console.error('Error al reagendar cita:', error);
    return res.status(500).json({ error: 'Error interno del servidor al reagendar la cita.' });
  }
});

// POST /api/citas/:id/reenviar-correo: Reenviar correo de confirmación de cita (Protegido con Token JWT)
app.post('/api/citas/:id/reenviar-correo', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Obtener la cita junto con los datos del ciudadano
    const appointment = await db.get(`
      SELECT c.id, c.fecha, c.hora, c.motivo, c.estado, c.notas_admin,
             ci.nombre, ci.telefono, ci.correo, ci.colonia
      FROM citas c
      JOIN ciudadanos ci ON c.ciudadano_id = ci.id
      WHERE c.id = ?
    `, [id]);

    if (!appointment) {
      return res.status(404).json({ error: 'La cita especificada no existe.' });
    }

    if (!appointment.correo || !appointment.correo.trim()) {
      return res.status(400).json({ error: 'El ciudadano no tiene una dirección de correo electrónico registrada.' });
    }

    // Generar el Folio virtual
    const virtualFolio = 'SF-' + String(appointment.id).padStart(2, '0');

    // Enviar correo de confirmación de cita (síncrono aquí para responder con éxito/error)
    const emailResult = await sendConfirmationEmail(
      { nombre: appointment.nombre, correo: appointment.correo },
      { folio: virtualFolio, fecha: appointment.fecha, hora: appointment.hora, motivo: appointment.motivo }
    );

    if (emailResult && emailResult.simulated) {
      return res.status(400).json({
        error: 'No se pudo enviar el correo: Las credenciales SMTP (SMTP_USER y SMTP_PASS) no están configuradas en las variables de entorno del servidor de producción.'
      });
    }

    return res.json({
      success: true,
      message: `Correo de confirmación reenviado con éxito a: ${appointment.correo}`
    });
  } catch (error) {
    console.error('Error al reenviar correo de confirmación:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor al reenviar el correo.' });
  }
});

// --- ENDPOINTS PARA FECHAS BLOQUEADAS ---

// 1. GET /api/fechas-bloqueadas: Obtener lista de fechas bloqueadas
app.get('/api/fechas-bloqueadas', async (req, res) => {
  try {
    const dates = await db.all('SELECT * FROM fechas_bloqueadas ORDER BY fecha ASC');
    return res.json(dates);
  } catch (error) {
    console.error('Error al obtener fechas bloqueadas:', error);
    return res.status(500).json({ error: 'Error al consultar fechas bloqueadas.' });
  }
});

// 2. POST /api/fechas-bloqueadas: Bloquear una fecha (Protegido con Token JWT)
app.post('/api/fechas-bloqueadas', authenticateToken, async (req, res) => {
  const { fecha, motivo } = req.body;

  if (!fecha || !motivo) {
    return res.status(400).json({ error: 'La fecha y el motivo son obligatorios.' });
  }

  // Validar formato de fecha (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(fecha)) {
    return res.status(400).json({ error: 'Formato de fecha inválido. Debe ser YYYY-MM-DD.' });
  }

  // Validar que sea miércoles
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDay() !== 3) {
    return res.status(400).json({ error: 'Las fechas bloqueadas solo pueden ser días miércoles.' });
  }

  try {
    // Comprobar si ya está bloqueada
    const existing = await db.get('SELECT * FROM fechas_bloqueadas WHERE fecha = ?', [fecha]);
    if (existing) {
      return res.status(400).json({ error: 'Esta fecha ya se encuentra bloqueada.' });
    }

    await db.run(
      'INSERT INTO fechas_bloqueadas (fecha, motivo) VALUES (?, ?)',
      [fecha, motivo.trim()]
    );

    const newBlocked = await db.get('SELECT * FROM fechas_bloqueadas WHERE fecha = ?', [fecha]);
    return res.status(201).json({
      message: 'Fecha bloqueada con éxito.',
      data: newBlocked
    });
  } catch (error) {
    console.error('Error al bloquear fecha:', error);
    return res.status(500).json({ error: 'Error interno del servidor al bloquear la fecha.' });
  }
});

// 3. DELETE /api/fechas-bloqueadas/:id: Desbloquear una fecha (Protegido con Token JWT)
app.delete('/api/fechas-bloqueadas/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await db.get('SELECT * FROM fechas_bloqueadas WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'La fecha bloqueada especificada no existe.' });
    }

    await db.run('DELETE FROM fechas_bloqueadas WHERE id = ?', [id]);
    return res.json({ message: 'Fecha desbloqueada con éxito.' });
  } catch (error) {
    console.error('Error al desbloquear fecha:', error);
    return res.status(500).json({ error: 'Error interno del servidor al desbloquear la fecha.' });
  }
});

// --- ENDPOINTS PARA GESTIÓN DE ADMINISTRADORES ---

// 1. GET /api/admins: Obtener lista de administradores (Protegido con Token JWT)
app.get('/api/admins', authenticateToken, async (req, res) => {
  try {
    const admins = await db.all('SELECT id, usuario FROM administradores ORDER BY id ASC');
    return res.json(admins);
  } catch (error) {
    console.error('Error al obtener lista de administradores:', error);
    return res.status(500).json({ error: 'Error al consultar administradores.' });
  }
});

// 2. POST /api/admins: Crear un nuevo administrador (Solo permitido para Superadmin)
app.post('/api/admins', authenticateToken, async (req, res) => {
  const callerUser = req.admin && req.admin.usuario ? req.admin.usuario.toLowerCase() : '';
  const callerId = req.admin ? req.admin.id : 0;
  const isSuperadmin = (callerUser === 'superadmin' || callerUser === 'admin' || callerId === 1);

  if (!isSuperadmin) {
    return res.status(403).json({ error: 'Acceso denegado. Solo el Superadministrador puede crear nuevos administradores.' });
  }

  const { usuario, password } = req.body;

  if (!usuario || !password) {
    return res.status(400).json({ error: 'El nombre de usuario y la contraseña son obligatorios.' });
  }

  const cleanUsuario = usuario.trim();
  if (cleanUsuario.length < 3) {
    return res.status(400).json({ error: 'El nombre de usuario debe tener al menos 3 caracteres.' });
  }

  if (password.length < 5) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 5 caracteres.' });
  }

  try {
    const existing = await db.get('SELECT * FROM administradores WHERE LOWER(usuario) = LOWER(?)', [cleanUsuario]);
    if (existing) {
      return res.status(400).json({ error: `El usuario "${cleanUsuario}" ya existe.` });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO administradores (usuario, password_hash) VALUES (?, ?)',
      [cleanUsuario, hash]
    );

    return res.status(201).json({
      message: `Administrador "${cleanUsuario}" creado con éxito.`,
      data: { id: result.lastID, usuario: cleanUsuario }
    });
  } catch (error) {
    console.error('Error al crear administrador:', error);
    return res.status(500).json({ error: 'Error interno del servidor al crear administrador.' });
  }
});

// 3. DELETE /api/admins/:id: Eliminar un administrador (Solo permitido para Superadmin)
app.delete('/api/admins/:id', authenticateToken, async (req, res) => {
  const callerUser = req.admin && req.admin.usuario ? req.admin.usuario.toLowerCase() : '';
  const callerId = req.admin ? req.admin.id : 0;
  const isSuperadmin = (callerUser === 'superadmin' || callerUser === 'admin' || callerId === 1);

  if (!isSuperadmin) {
    return res.status(403).json({ error: 'Acceso denegado. Solo el Superadministrador puede eliminar administradores.' });
  }

  const { id } = req.params;

  try {
    const count = await db.get('SELECT COUNT(*) as total FROM administradores');
    if (count.total <= 1) {
      return res.status(400).json({ error: 'No se puede eliminar el único administrador existente.' });
    }

    const target = await db.get('SELECT * FROM administradores WHERE id = ?', [id]);
    if (!target) {
      return res.status(404).json({ error: 'El administrador especificado no existe.' });
    }

    if (target.id === 1 || target.usuario.toLowerCase() === 'superadmin' || target.usuario.toLowerCase() === 'admin') {
      return res.status(403).json({ error: 'Protección de Seguridad: La cuenta principal de Superadministrador está protegida y no puede ser eliminada.' });
    }

    if (req.admin && req.admin.id === parseInt(id)) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta activa de usuario.' });
    }

    await db.run('DELETE FROM administradores WHERE id = ?', [id]);
    return res.json({ message: `Administrador "${target.usuario}" eliminado con éxito.` });
  } catch (error) {
    console.error('Error al eliminar administrador:', error);
    return res.status(500).json({ error: 'Error interno del servidor al eliminar administrador.' });
  }
});
