-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Usuarios del panel (trabajadores/estilistas)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'stylist',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catálogo de servicios
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price NUMERIC(10, 2),
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clientes (creados desde el bot de WhatsApp)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  whatsapp_number VARCHAR(50),
  conversation_state JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Citas
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id),
  stylist_id UUID REFERENCES users(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  -- pending | confirmed | cancelled | completed
  notes TEXT,
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bloqueos de horario (días libres, vacaciones, descansos)
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stylist_id UUID REFERENCES users(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas de disponibilidad
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_starts_at ON schedule_blocks(starts_at);

-- Horario de atención del negocio (días de la semana 0=Dom, 1=Lun ... 6=Sab)
CREATE TABLE IF NOT EXISTS business_hours (
  id SERIAL PRIMARY KEY,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at TIME NOT NULL DEFAULT '09:00',
  closes_at TIME NOT NULL DEFAULT '19:00',
  is_open BOOLEAN DEFAULT true
);

-- Datos por defecto de servicios
INSERT INTO services (name, description, duration_minutes, price, sort_order) VALUES
  ('Corte de cabello', 'Corte personalizado según tu estilo', 45, 350.00, 1),
  ('Tinte completo', 'Coloración completa con productos premium', 120, 900.00, 2),
  ('Mechas / Balayage', 'Iluminación artesanal con efecto natural', 150, 1200.00, 3),
  ('Tratamiento capilar', 'Hidratación profunda y reconstrucción', 60, 500.00, 4),
  ('Manicura', 'Manicura clásica o con esmalte semipermanente', 50, 250.00, 5),
  ('Pedicura', 'Pedicura con exfoliación y esmalte', 60, 300.00, 6),
  ('Diseño de cejas', 'Perfilado y diseño de cejas con hilo o cera', 30, 180.00, 7),
  ('Maquillaje', 'Maquillaje profesional para cualquier ocasión', 75, 700.00, 8),
  ('Alisado / Keratina', 'Tratamiento alisante de larga duración', 180, 1800.00, 9),
  ('Peinado de fiesta', 'Peinado elaborado para eventos especiales', 90, 600.00, 10)
ON CONFLICT DO NOTHING;

-- Horario de atención por defecto (Lunes a Sábado 9am-7pm)
INSERT INTO business_hours (day_of_week, opens_at, closes_at, is_open) VALUES
  (0, '10:00', '15:00', false), -- Domingo cerrado
  (1, '09:00', '19:00', true),  -- Lunes
  (2, '09:00', '19:00', true),  -- Martes
  (3, '09:00', '19:00', true),  -- Miércoles
  (4, '09:00', '19:00', true),  -- Jueves
  (5, '09:00', '19:00', true),  -- Viernes
  (6, '09:00', '17:00', true)   -- Sábado
ON CONFLICT DO NOTHING;
