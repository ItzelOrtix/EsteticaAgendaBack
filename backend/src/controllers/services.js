const pool = require('../config/database');

async function list(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM services WHERE active = true ORDER BY sort_order, name'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error listando servicios:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

async function listAll(req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM services ORDER BY sort_order, name'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error listando servicios:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

async function remove(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'UPDATE services SET active = false WHERE id = $1 RETURNING id',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.status(204).send();
  } catch (err) {
    console.error('Error eliminando servicio:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

async function create(req, res) {
  const { name, description, duration_minutes, price, sort_order } = req.body;
  if (!name || !duration_minutes) {
    return res.status(400).json({ error: 'Nombre y duración requeridos' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO services (name, description, duration_minutes, price, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, description, duration_minutes, price || 0, sort_order || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error creando servicio:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

async function update(req, res) {
  const { id } = req.params;
  const { name, description, duration_minutes, price, sort_order, active } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE services SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        duration_minutes = COALESCE($3, duration_minutes),
        price = COALESCE($4, price),
        sort_order = COALESCE($5, sort_order),
        active = COALESCE($6, active)
       WHERE id = $7 RETURNING *`,
      [name, description, duration_minutes, price, sort_order, active, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error actualizando servicio:', err);
    res.status(500).json({ error: 'Error interno' });
  }
}

module.exports = { list, listAll, create, update, remove };
