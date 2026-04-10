require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Migración completada exitosamente');

    // Crear usuario admin por defecto si no existe
    const { rows } = await pool.query("SELECT id FROM users WHERE email = 'admin@estetica.com'");
    if (rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 12);
      await pool.query(
        "INSERT INTO users (email, password_hash, name, role) VALUES ('admin@estetica.com', $1, 'Admin', 'admin')",
        [hash]
      );
      console.log('✅ Usuario admin creado — email: admin@estetica.com / pass: admin123');
    } else {
      console.log('ℹ️  Usuario admin ya existe, omitiendo');
    }
  } catch (err) {
    console.error('❌ Error en migración:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
