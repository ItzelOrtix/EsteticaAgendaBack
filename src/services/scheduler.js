/**
 * Cron job para recordatorios automáticos de citas.
 * Corre todos los días a las 10:00 AM (hora local del negocio).
 * Envía recordatorio a clientes con cita el día siguiente.
 */

const cron = require('node-cron');
const pool = require('../config/database');
const twilioService = require('./twilio');

const TZ = process.env.BUSINESS_TIMEZONE || 'America/Mexico_City';
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'Studio Élégance';

let io;
function setIo(socketIo) { io = socketIo; }

async function sendReminders() {
  console.log(`[${new Date().toISOString()}] Ejecutando job de recordatorios...`);

  try {
    // Citas de mañana que aún no han recibido recordatorio
    const { rows: appointments } = await pool.query(
      `SELECT
        a.id, a.starts_at,
        c.name AS client_name, c.whatsapp_number,
        s.name AS service_name
       FROM appointments a
       JOIN clients c ON c.id = a.client_id
       JOIN services s ON s.id = a.service_id
       WHERE a.status = 'pending'
       AND a.reminder_sent = false
       AND DATE(a.starts_at AT TIME ZONE $1) = (CURRENT_DATE AT TIME ZONE $1) + INTERVAL '1 day'`,
      [TZ]
    );

    console.log(`Recordatorios pendientes: ${appointments.length}`);

    for (const appt of appointments) {
      if (!appt.whatsapp_number) continue;

      const date = new Date(appt.starts_at);
      const formattedTime = date.toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', timeZone: TZ,
      });

      const message =
        `¡Hola ${appt.client_name}! 👋✨\n\n` +
        `Te recordamos que mañana tienes una cita en *${BUSINESS_NAME}*:\n\n` +
        `💅 *Servicio:* ${appt.service_name}\n` +
        `🕐 *Hora:* ${formattedTime}\n\n` +
        `¿Confirmas tu asistencia?\n` +
        `Responde *"Sí"* para confirmar o *"No"* para cancelar 🌸`;

      try {
        await twilioService.sendMessage(appt.whatsapp_number, message);

        // Marcar recordatorio como enviado y actualizar estado de conversación del cliente
        await pool.query(
          `UPDATE appointments SET reminder_sent = true, updated_at = NOW() WHERE id = $1`,
          [appt.id]
        );

        // Actualizar estado del bot para esperar respuesta de confirmación
        await pool.query(
          `UPDATE clients SET conversation_state = $1, updated_at = NOW()
           WHERE whatsapp_number = $2`,
          [JSON.stringify({ step: 'REMINDER_CONFIRM', appointment_id: appt.id }), appt.whatsapp_number]
        );

        console.log(`✅ Recordatorio enviado a ${appt.client_name} (${appt.whatsapp_number})`);
      } catch (err) {
        console.error(`❌ Error enviando recordatorio a ${appt.whatsapp_number}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error en job de recordatorios:', err);
  }
}

// También notificar al panel cuando una cita es cancelada por recordatorio
async function notifyCancellationToPanel(appointmentId) {
  if (!io) return;
  const { rows } = await pool.query(
    `SELECT a.*, c.name AS client_name, s.name AS service_name
     FROM appointments a
     JOIN clients c ON c.id = a.client_id
     JOIN services s ON s.id = a.service_id
     WHERE a.id = $1`,
    [appointmentId]
  );
  if (rows[0]) io.emit('appointment:cancelled', rows[0]);
}

function startScheduler() {
  // Cron: cada día a las 10:00 AM (en zona UTC, ajustar según TZ del servidor)
  // '0 10 * * *' = 10am UTC — si el servidor está en UTC y el negocio en CDMX (UTC-6),
  // usar '0 16 * * *' para que sea 10am CDMX
  cron.schedule('0 16 * * *', sendReminders, {
    timezone: 'UTC',
  });

  console.log('⏰ Scheduler de recordatorios iniciado (10:00 AM CDMX)');
}

module.exports = { startScheduler, sendReminders, notifyCancellationToPanel, setIo };
