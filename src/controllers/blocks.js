const pool = require('../config/database');

async function list(req, res) {
  const { from, to } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT b.*, u.name AS stylist_name
       FROM schedule_blocks b
       LEFT JOIN users u ON u.id = b.stylist_id
       WHERE b.starts_at >= COALESCE($1::timestamptz, NOW())
       AND ($2::timestamptz IS NULL OR b.ends_at <= $2::timestamptz)
       ORDER BY b.starts_at ASC`,
      [from || null, to || null]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error listando bloqueos:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

async function create(req, res) {
  const { starts_at, ends_at, reason } = req.body;
  const stylist_id = req.user?.id;

  if (!starts_at || !ends_at) {
    return res.status(400).json({ error: 'starts_at y ends_at requeridos' });
  }

  if (new Date(starts_at) >= new Date(ends_at)) {
    return res.status(400).json({ error: 'La hora de inicio debe ser antes del fin' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO schedule_blocks (stylist_id, starts_at, ends_at, reason)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [stylist_id || null, starts_at, ends_at, reason || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creando bloqueo:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

async function remove(req, res) {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM schedule_blocks WHERE id = $1',
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Bloqueo no encontrado' });
    res.status(204).end();
  } catch (err) {
    console.error('Error eliminando bloqueo:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

module.exports = { list, create, remove };
