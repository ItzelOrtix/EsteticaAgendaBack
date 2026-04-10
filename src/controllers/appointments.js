const pool = require('../config/database');
const { addMinutes, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek } = require('date-fns');
const { fromZonedTime } = require('date-fns-tz');
const { sendBookingConfirmation } = require('../services/bot');

const TZ = process.env.BUSINESS_TIMEZONE || 'America/Mexico_City';

// Referencia a io (socket.io) — se inyecta desde index.js
let io;
function setIo(socketIo) { io = socketIo; }

async function create(req, res) {
  const { client_id, service_id, starts_at } = req.body;

  if (!client_id || !service_id || !starts_at) {
    return res.status(400).json({ error: 'client_id, service_id y starts_at son requeridos' });
  }

  try {
    const { rows: serviceRows } = await pool.query(
      'SELECT * FROM services WHERE id = $1 AND active = true',
      [service_id]
    );
    if (serviceRows.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const service = serviceRows[0];
    const start = new Date(starts_at);
    const end = addMinutes(start, service.duration_minutes);

    // Verificar disponibilidad (sin solapamientos)
    const { rows: conflicts } = await pool.query(
      `SELECT id FROM appointments
       WHERE status NOT IN ('cancelled')
       AND starts_at < $1 AND ends_at > $2`,
      [end.toISOString(), start.toISOString()]
    );

    if (conflicts.length > 0) {
      return res.status(409).json({ error: 'El horario ya no está disponible' });
    }

    const { rows } = await pool.query(
      `INSERT INTO appointments (client_id, service_id, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [client_id, service_id, start.toISOString(), end.toISOString()]
    );

    const appointment = rows[0];

    // Enriquecer con datos del cliente y servicio para la notificación
    const full = await getFullAppointment(appointment.id);

    // Notificar en tiempo real al panel
    if (io) io.emit('appointment:new', full);

    res.status(201).json(full);
  } catch (err) {
    console.error('Error creando cita:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

async function list(req, res) {
  const { view = 'day', date } = req.query;

  try {
    let startRange, endRange;
    const baseDate = date ? parseISO(date) : new Date();

    if (view === 'week') {
      startRange = startOfWeek(baseDate, { weekStartsOn: 1 });
      endRange = endOfWeek(baseDate, { weekStartsOn: 1 });
    } else {
      startRange = startOfDay(baseDate);
      endRange = endOfDay(baseDate);
    }

    const { rows } = await pool.query(
      `SELECT
        a.*,
        c.name AS client_name, c.phone AS client_phone,
        s.name AS service_name, s.duration_minutes,
        u.name AS stylist_name
       FROM appointments a
       JOIN clients c ON c.id = a.client_id
       JOIN services s ON s.id = a.service_id
       LEFT JOIN users u ON u.id = a.stylist_id
       WHERE a.starts_at >= $1 AND a.starts_at <= $2
       ORDER BY a.starts_at ASC`,
      [startRange.toISOString(), endRange.toISOString()]
    );

    res.json(rows);
  } catch (err) {
    console.error('Error listando citas:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

async function updateStatus(req, res) {
  const { id } = req.params;
  const { status, notes } = req.body;

  const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE appointments SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, notes, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Cita no encontrada' });

    const full = await getFullAppointment(id);

    if (io) io.emit('appointment:updated', full);

    res.json(full);
  } catch (err) {
    console.error('Error actualizando cita:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

async function getById(req, res) {
  try {
    const full = await getFullAppointment(req.params.id);
    if (!full) return res.status(404).json({ error: 'Cita no encontrada' });
    res.json(full);
  } catch (err) {
    console.error('Error obteniendo cita:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

// Obtener cita por client_id (para el flujo del bot)
async function getByClientToken(req, res) {
  const { client_id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT
        a.*,
        c.name AS client_name, c.phone AS client_phone,
        s.name AS service_name, s.duration_minutes
       FROM appointments a
       JOIN clients c ON c.id = a.client_id
       JOIN services s ON s.id = a.service_id
       WHERE a.client_id = $1 AND a.status = 'pending'
       ORDER BY a.created_at DESC LIMIT 1`,
      [client_id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error('Error obteniendo cita del cliente:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

async function getFullAppointment(id) {
  const { rows } = await pool.query(
    `SELECT
      a.*,
      c.name AS client_name, c.phone AS client_phone,
      s.name AS service_name, s.duration_minutes,
      u.name AS stylist_name
     FROM appointments a
     JOIN clients c ON c.id = a.client_id
     JOIN services s ON s.id = a.service_id
     LEFT JOIN users u ON u.id = a.stylist_id
     WHERE a.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function notifyClient(req, res) {
  const { id } = req.params;
  try {
    const full = await getFullAppointment(id);
    if (!full) return res.status(404).json({ error: 'Cita no encontrada' });

    await sendBookingConfirmation(full);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error enviando confirmación WhatsApp:', err);
    res.status(500).json({ error: 'No se pudo enviar la notificación' });
  }
}

module.exports = { create, list, updateStatus, getById, getByClientToken, notifyClient, setIo };
