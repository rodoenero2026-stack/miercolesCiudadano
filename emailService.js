require('dotenv').config();
const nodemailer = require('nodemailer');

// Configuración del transportador de correo
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_PORT === '465' || !process.env.SMTP_PORT, // true para 465, false para otros
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

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

// Envío general de correo con fallback
async function sendMail(to, subject, html) {
  // Verificar si las credenciales de correo electrónico están configuradas
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('\n==================================================');
    console.log('⚠️ AVISO: Las credenciales de correo (SMTP_USER / SMTP_PASS) no están configuradas.');
    console.log(`Simulación de Envío de Correo a: ${to}`);
    console.log(`Asunto: ${subject}`);
    console.log('==================================================\n');
    return { simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from: `"Miércoles Ciudadano San Fernando" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });
    console.log(`Correo enviado con éxito a: ${to}. ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('Error al enviar correo electrónico:', error);
    throw error;
  }
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
  const parts = dateString.split("-");
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  
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
