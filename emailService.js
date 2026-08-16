require('dotenv').config();
const nodemailer = require('nodemailer');

/**
 * Obtener un transportador SMTP configurado dinámicamente
 * @param {number} port Puerto SMTP (587 o 465)
 * @param {boolean} secure True para SSL (465), False para STARTTLS (587)
 */
function getTransporter(port = 587, secure = false) {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  
  // Limpiar credenciales y eliminar espacios en blanco de las contraseñas de aplicación de Google
  const user = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : '';
  const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 30000, // 30 segundos de timeout de conexión
    greetingTimeout: 30000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: false // Evitar bloqueos por inspección SSL o proxies de red gubernamentales
    }
  });
}

// Estilos de diseño (Verde y Dorado de Chiapas)
const primaryColor = '#0F4C3A';
const secondaryColor = '#B99326';

// Plantilla base HTML para el correo
function getHtmlTemplate(title, content) {
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          background-color: #f7fafc;
          margin: 0;
          padding: 0;
          color: #2d3748;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
          border: 1px solid #e2e8f0;
        }
        .header {
          background-color: ${primaryColor};
          border-bottom: 4px solid ${secondaryColor};
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .header p {
          color: ${secondaryColor};
          margin: 5px 0 0 0;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 600;
        }
        .content {
          padding: 30px 25px;
          line-height: 1.6;
        }
        .content h2 {
          color: ${primaryColor};
          font-size: 20px;
          margin-top: 0;
          margin-bottom: 15px;
        }
        .ticket {
          background-color: #fdf9ee;
          border: 1.5px dashed ${secondaryColor};
          border-radius: 8px;
          padding: 20px;
          margin: 20px 0;
        }
        .ticket-item {
          margin-bottom: 10px;
          font-size: 15px;
        }
        .ticket-item strong {
          color: ${primaryColor};
        }
        .badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: bold;
          text-transform: uppercase;
        }
        .badge-pendiente {
          background-color: #feebc8;
          color: #c05621;
        }
        .badge-confirmada {
          background-color: #c6f6d5;
          color: #22543d;
        }
        .badge-cancelada {
          background-color: #fed7d7;
          color: #742a2a;
        }
        .list-title {
          font-weight: bold;
          color: ${primaryColor};
          margin-top: 15px;
          margin-bottom: 5px;
        }
        ul {
          margin-top: 5px;
          padding-left: 20px;
        }
        li {
          margin-bottom: 6px;
        }
        .footer {
          background-color: #f7fafc;
          border-top: 1px solid #e2e8f0;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #718096;
        }
        .footer p {
          margin: 5px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Miércoles Ciudadano</h1>
          <p>San Fernando, Chiapas</p>
        </div>
        <div class="content">
          <h2>${title}</h2>
          ${content}
        </div>
        <div class="footer">
          <p><strong>H. Ayuntamiento Constitucional de San Fernando, Chiapas</strong></p>
          <p>Ayuntamiento Municipal: Calle Central Oriente #1, Col. Centro, San Fernando, Chiapas</p>
          <p>Este es un correo automático. Por favor no responda a este mensaje.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Envío general de correo con fallback de puerto y reintentos (587 -> 465)
async function sendMail(to, subject, html) {
  if (!to || typeof to !== 'string' || !to.trim()) {
    console.error('⚠️ ERROR: La dirección de correo destinatario no es válida.');
    throw new Error('La dirección de correo electrónico del destinatario es obligatoria.');
  }

  const smtpUser = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : '';
  const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';

  // Verificar si las credenciales de correo electrónico están configuradas
  if (!smtpUser || !smtpPass) {
    console.log('\n==================================================');
    console.log('⚠️ AVISO: Las credenciales de correo (SMTP_USER / SMTP_PASS) no están configuradas.');
    console.log(`Simulación de Envío de Correo a: ${to}`);
    console.log(`Asunto: ${subject}`);
    console.log('==================================================\n');
    return { simulated: true };
  }

  const fromAddress = process.env.SMTP_FROM || `"Miércoles Ciudadano San Fernando" <${smtpUser}>`;

  // Determinar orden de prueba de puertos (587 TLS primero, luego 465 SSL o viceversa según configuración)
  const preferredPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const portsToTry = preferredPort === 465 
    ? [{ port: 465, secure: true }, { port: 587, secure: false }]
    : [{ port: 587, secure: false }, { port: 465, secure: true }];

  let lastError = null;

  for (const config of portsToTry) {
    try {
      console.log(`Intentando enviar correo a ${to.trim()} mediante puerto ${config.port} (secure: ${config.secure})...`);
      const transporter = getTransporter(config.port, config.secure);
      const info = await transporter.sendMail({
        from: fromAddress,
        to: to.trim(),
        subject,
        html
      });
      console.log(`Correo enviado con éxito a: ${to.trim()} por puerto ${config.port}. ID: ${info.messageId}`);
      return info;
    } catch (error) {
      console.warn(`⚠️ Fallo de envío por puerto ${config.port} (${error.code || error.message}). Intentando siguiente alternativa...`);
      lastError = error;
    }
  }

  console.error('Error al enviar correo en todos los puertos intentados (587 y 465):', lastError);
  throw lastError;
}

// 1. Correo de Confirmación de Cita
async function sendConfirmationEmail(citizen, appointment) {
  const title = '¡Tu cita ha sido agendada con éxito!';
  const content = `
    <p>Estimado/a <strong>${citizen.nombre}</strong>,</p>
    <p>Le confirmamos que su solicitud para participar en el programa <strong>Miércoles Ciudadano</strong> ha sido registrada en el sistema de manera exitosa. A continuación, se detallan los datos de su cita:</p>
    
    <div class="ticket">
      <div class="ticket-item"><strong>Folio de Cita:</strong> ${appointment.folio}</div>
      <div class="ticket-item"><strong>Fecha:</strong> ${formatDateText(appointment.fecha)}</div>
      <div class="ticket-item"><strong>Horario:</strong> ${appointment.hora}</div>
      <div class="ticket-item"><strong>Motivo/Tema:</strong> ${appointment.motivo}</div>
      <div class="ticket-item"><strong>Estado:</strong> <span class="badge badge-pendiente">Pendiente de Revisión</span></div>
    </div>

    <div class="list-title">📍 Lugar de la Audiencia:</div>
    <p>Ayuntamiento Municipal de San Fernando, Planta Alta (Módulos de Atención Ciudadana), Dirección: Calle Central Oriente #1, Col. Centro, San Fernando, Chiapas.</p>

    <div class="list-title">📄 Requisitos:</div>
    <p>Para agilizar su atención con el Presidente Municipal y los directores de área, por favor presente los siguientes documentos el día de su cita:</p>
    <ul>
      <li>Petición redactada por escrito detallando su solicitud, dirigida al H. Ayuntamiento (opcional, pero altamente recomendado).</li>
      <li>Cualquier evidencia física o fotográfica que sirva de sustento para su trámite o reporte.</li>
    </ul>

    <p>Por favor, le solicitamos presentarse <strong>10 minutos antes</strong> de su horario asignado. En caso de no poder asistir, le pedimos ponerse en contacto con atención ciudadana para poder liberar el espacio a otro ciudadano.</p>
  `;

  const html = getHtmlTemplate(title, content);
  const subject = `Confirmación de Cita - Miércoles Ciudadano (Folio: ${appointment.folio})`;
  return await sendMail(citizen.correo, subject, html);
}

// 2. Correo de Recordatorio (24 horas antes)
async function sendReminderEmail(citizen, appointment) {
  const title = 'Recordatorio de tu cita de mañana';
  const content = `
    <p>Estimado/a <strong>${citizen.nombre}</strong>,</p>
    <p>Este es un recordatorio de que tiene programada una audiencia el día de <strong>mañana</strong> dentro del programa <strong>Miércoles Ciudadano</strong>. Por favor revise los detalles de su cita:</p>
    
    <div class="ticket">
      <div class="ticket-item"><strong>Folio de Cita:</strong> ${appointment.folio}</div>
      <div class="ticket-item"><strong>Fecha:</strong> ${formatDateText(appointment.fecha)} (Mañana)</div>
      <div class="ticket-item"><strong>Horario:</strong> ${appointment.hora}</div>
      <div class="ticket-item"><strong>Motivo/Tema:</strong> ${appointment.motivo}</div>
      <div class="ticket-item"><strong>Estado:</strong> <span class="badge badge-${appointment.estado.toLowerCase()}">${appointment.estado}</span></div>
    </div>

    <div class="list-title">📍 Ubicación:</div>
    <p>Ayuntamiento Municipal de San Fernando, Dirección: Calle Central Oriente #1, Col. Centro, San Fernando, Chiapas.</p>

    <div class="list-title">📄 Recuerde llevar:</div>
    <ul>
      <li>Toda la documentación o evidencias relacionadas con su petición.</li>
    </ul>

    <p>¡Le esperamos! Su puntualidad nos ayuda a brindar un servicio ágil para todos.</p>
  `;

  const html = getHtmlTemplate(title, content);
  const subject = `Recordatorio de Cita Mañana - Miércoles Ciudadano (Folio: ${appointment.folio})`;
  return await sendMail(citizen.correo, subject, html);
}

// 3. Correo de Cambio de Estado o Cancelación
async function sendStatusUpdateEmail(citizen, appointment) {
  const title = 'Actualización en el estado de tu cita';
  const badgeClass = `badge-${appointment.estado.toLowerCase()}`;
  
  let dynamicText = '';
  if (appointment.estado.toLowerCase() === 'confirmada') {
    dynamicText = `<p>Nos complace informarle que su cita para el Miércoles Ciudadano ha sido <strong>CONFIRMADA</strong> por el personal de atención ciudadana.</p>`;
  } else if (appointment.estado.toLowerCase() === 'cancelada') {
    dynamicText = `<p>Le informamos que su cita ha sido <strong>CANCELADA</strong>. Si considera que esto es un error o desea reprogramar, por favor póngase en contacto con el palacio municipal o agende una nueva cita en el portal.</p>`;
  } else {
    dynamicText = `<p>El estado de su cita ha sido cambiado a: <strong>PENDIENTE</strong>.</p>`;
  }

  let adminNotesSection = '';
  if (appointment.notas_admin && appointment.notas_admin !== 'Folio asignado al agendar.') {
    adminNotesSection = `
      <div class="list-title">💬 Observaciones de Administración:</div>
      <blockquote style="background-color: #f7fafc; border-left: 4px solid ${secondaryColor}; padding: 10px 15px; margin: 10px 0; font-style: italic;">
        "${appointment.notas_admin}"
      </blockquote>
    `;
  }

  const content = `
    <p>Estimado/a <strong>${citizen.nombre}</strong>,</p>
    ${dynamicText}
    
    <div class="ticket">
      <div class="ticket-item"><strong>Folio de Cita:</strong> ${appointment.folio}</div>
      <div class="ticket-item"><strong>Fecha:</strong> ${formatDateText(appointment.fecha)}</div>
      <div class="ticket-item"><strong>Horario:</strong> ${appointment.hora}</div>
      <div class="ticket-item"><strong>Motivo/Tema:</strong> ${appointment.motivo}</div>
      <div class="ticket-item"><strong>Nuevo Estado:</strong> <span class="badge ${badgeClass}">${appointment.estado}</span></div>
    </div>

    ${adminNotesSection}

    <p>Para cualquier duda o aclaración sobre este cambio, recuerde hacer referencia a su folio: <strong>${appointment.folio}</strong>.</p>
  `;

  const html = getHtmlTemplate(title, content);
  const subject = `Actualización de Cita - Miércoles Ciudadano (Folio: ${appointment.folio})`;
  return await sendMail(citizen.correo, subject, html);
}

// 4. Correo de Reagendamiento
async function sendRescheduleEmail(citizen, appointment) {
  const title = 'Tu cita ha sido reagendada';
  const content = `
    <p>Estimado/a <strong>${citizen.nombre}</strong>,</p>
    <p>Le informamos que su cita para el programa <strong>Miércoles Ciudadano</strong> ha sido <strong>REAGENDADA</strong> por el personal de administración. A continuación, se detallan los nuevos datos de su cita:</p>
    
    <div class="ticket">
      <div class="ticket-item"><strong>Folio de Cita:</strong> ${appointment.folio}</div>
      <div class="ticket-item"><strong>Nueva Fecha:</strong> ${formatDateText(appointment.fecha)}</div>
      <div class="ticket-item"><strong>Nuevo Horario:</strong> ${appointment.hora}</div>
      <div class="ticket-item"><strong>Motivo/Tema:</strong> ${appointment.motivo}</div>
      <div class="ticket-item"><strong>Estado:</strong> <span class="badge badge-${appointment.estado.toLowerCase()}">${appointment.estado}</span></div>
    </div>

    ${appointment.notas_admin && appointment.notas_admin !== 'Folio asignado al agendar.' ? `
      <div class="list-title">💬 Observaciones de Administración:</div>
      <blockquote style="background-color: #f7fafc; border-left: 4px solid ${secondaryColor}; padding: 10px 15px; margin: 10px 0; font-style: italic;">
        "${appointment.notas_admin}"
      </blockquote>
    ` : ''}

    <div class="list-title">📍 Lugar de la Audiencia:</div>
    <p>Ayuntamiento Municipal de San Fernando, Planta alta (Módulos de Atención Ciudadana), Dirección: Calle Central Oriente #1, Col. Centro, San Fernando, Chiapas.</p>

    <p>Por favor, le solicitamos presentarse <strong>10 minutos antes</strong> de su nuevo horario asignado.</p>
  `;

  const html = getHtmlTemplate(title, content);
  const subject = `Cita Reagendada - Miércoles Ciudadano (Folio: ${appointment.folio})`;
  return await sendMail(citizen.correo, subject, html);
}

// Función auxiliar para formatear la fecha en texto legible en el correo
function formatDateText(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return 'Fecha no especificada';
  }
  const parts = dateString.split("-");
  if (parts.length !== 3) {
    return dateString;
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return dateString;
  }

  const d = new Date(year, month, day);
  
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  
  return `Miércoles, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

module.exports = {
  sendConfirmationEmail,
  sendReminderEmail,
  sendStatusUpdateEmail,
  sendRescheduleEmail
};
