const pool = require('../config/database');
const { parseISO, format, addMinutes, isWithinInterval, startOfDay, endOfDay } = require('date-fns');
const { toZonedTime, fromZonedTime } = require('date-fns-tz');

const TZ = process.env.BUSINESS_TIMEZONE || 'America/Mexico_City';
const SLOT_INTERVAL = 15; // minutos entre slots disponibles

async function getAvailability(req, res) {
  const { date, service_id } = req.query;

  if (!date || !service_id) {
    return res.status(400).json({ error: 'Parámetros date y service_id requeridos' });
  }

  try {
    // Obtener duración del servicio
    const { rows: serviceRows } = await pool.query(
      'SELECT duration_minutes FROM services WHERE id = $1 AND active = true',
      [service_id]
    );
    if (serviceRows.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    const duration = serviceRows[0].duration_minutes;

    // Parsear fecha en zona horaria del negocio
    const dateInTz = parseISO(date);
    const dayOfWeek = dateInTz.getDay();

    // Verificar si el negocio está abierto ese día
    const { rows: hoursRows } = await pool.query(
      'SELECT * FROM business_hours WHERE day_of_week = $1',
      [dayOfWeek]
    );
    if (hoursRows.length === 0 || !hoursRows[0].is_open) {
      return res.json({ slots: [], closed: true });
    }

    const { opens_at, closes_at } = hoursRows[0];
    const [openH, openM] = opens_at.split(':').map(Number);
    const [closeH, closeM] = closes_at.split(':').map(Number);

    // Construir inicio y fin del día en zona local
    const dayStart = fromZonedTime(
      new Date(dateInTz.getFullYear(), dateInTz.getMonth(), dateInTz.getDate(), openH, openM, 0),
      TZ
    );
    const dayEnd = fromZonedTime(
      new Date(dateInTz.getFullYear(), dateInTz.getMonth(), dateInTz.getDate(), closeH, closeM, 0),
      TZ
    );

    // Obtener citas existentes para ese día
    const { rows: appointments } = await pool.query(
      `SELECT starts_at, ends_at FROM appointments
       WHERE status NOT IN ('cancelled')
       AND starts_at >= $1 AND ends_at <= $2`,
      [dayStart, dayEnd]
    );

    // Obtener bloqueos para ese día
    const { rows: blocks } = await pool.query(
      `SELECT starts_at, ends_at FROM schedule_blocks
       WHERE starts_at >= $1 AND ends_at <= $2`,
      [dayStart, dayEnd]
    );

    // Generar todos los slots posibles
    const slots = [];
    let cursor = new Date(dayStart);

    while (addMinutes(cursor, duration) <= dayEnd) {
      const slotEnd = addMinutes(cursor, duration);

      // Verificar si el slot se superpone con una cita o bloqueo
      const occupied = [...appointments, ...blocks].some(({ starts_at, ends_at }) => {
        const apptStart = new Date(starts_at);
        const apptEnd = new Date(ends_at);
        return cursor < apptEnd && slotEnd > apptStart;
      });

      if (!occupied) {
        const localTime = toZonedTime(cursor, TZ);
        slots.push({
          time: format(localTime, 'HH:mm'),
          datetime: cursor.toISOString(),
          available: true,
        });
      }

      cursor = addMinutes(cursor, SLOT_INTERVAL);
    }

    res.json({ slots, duration });
  } catch (err) {
    console.error('Error calculando disponibilidad:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

module.exports = { getAvailability };
