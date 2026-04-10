-- ================================================================
--  SEED DE PRUEBA — Studio Élégance
--  Inserta clientes, servicios y citas distribuidas en el tiempo
--  para probar las vistas de día, semana y estadísticas.
--
--  Ejecutar:
--    psql -U <usuario> -d <base_de_datos> -f seed_test.sql
--  O dentro de psql:
--    \i seed_test.sql
-- ================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────
-- 1. CLIENTES DE PRUEBA
-- ────────────────────────────────────────────────────────────────
INSERT INTO clients (name, phone)
SELECT name, phone FROM (VALUES
  ('Sofía García',      '5215510000001'),
  ('Valentina López',   '5215510000002'),
  ('Isabella Martín',   '5215510000003'),
  ('Camila Rodríguez',  '5215510000004'),
  ('Lucía Hernández',   '5215510000005'),
  ('Daniela Torres',    '5215510000006'),
  ('Fernanda Flores',   '5215510000007'),
  ('Mariana Díaz',      '5215510000008'),
  ('Gabriela Moreno',   '5215510000009'),
  ('Alejandra Ruiz',    '5215510000010')
) AS t(name, phone)
WHERE NOT EXISTS (
  SELECT 1 FROM clients WHERE clients.phone = t.phone
);

-- ────────────────────────────────────────────────────────────────
-- 2. SERVICIOS DE PRUEBA (solo si no existen)
-- ────────────────────────────────────────────────────────────────
INSERT INTO services (name, description, duration_minutes, price, active, sort_order)
SELECT name, description, duration_minutes, price, active, sort_order FROM (VALUES
  ('Manicura Clásica',        'Limado, cutículas y esmalte.',             45,   250, true, 1),
  ('Manicura Semipermanente', 'Esmalte semipermanente, dura 3 semanas.',  60,   380, true, 2),
  ('Pedicura Completa',       'Exfoliación, corte y esmalte de pies.',    60,   320, true, 3),
  ('Limpieza Facial',         'Limpieza profunda + hidratación.',         75,   550, true, 4),
  ('Maquillaje de Evento',    'Maquillaje profesional para ocasiones.',   90,   800, true, 5),
  ('Corte de Cabello',        'Corte + lavado + secado.',                 60,   350, true, 6),
  ('Tinte y Mechas',          'Coloración completa o mechas.',           120,  1200, true, 7),
  ('Cejas Laminadas',         'Laminado + diseño de cejas.',              50,   450, true, 8)
) AS t(name, description, duration_minutes, price, active, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM services WHERE services.name = t.name
);

-- ────────────────────────────────────────────────────────────────
-- 3. CITAS — HOY (varios horarios, estados mixtos)
-- ────────────────────────────────────────────────────────────────
INSERT INTO appointments (client_id, service_id, starts_at, ends_at, status)
SELECT
  (SELECT id FROM clients WHERE phone = c_phone),
  (SELECT id FROM services WHERE name  = s_name  LIMIT 1),
  DATE_TRUNC('day', NOW()) + hora::interval,
  DATE_TRUNC('day', NOW()) + hora::interval + (dur || ' minutes')::interval,
  estado
FROM (VALUES
  ('5215510000001', 'Manicura Clásica',        '9 hours',  '45',  'confirmed'),
  ('5215510000002', 'Limpieza Facial',         '10 hours', '75',  'confirmed'),
  ('5215510000003', 'Manicura Semipermanente', '11 hours', '60',  'pending'),
  ('5215510000004', 'Maquillaje de Evento',    '12 hours', '90',  'completed'),
  ('5215510000005', 'Pedicura Completa',       '13 hours', '60',  'confirmed'),
  ('5215510000006', 'Corte de Cabello',        '14 hours', '60',  'pending'),
  ('5215510000007', 'Cejas Laminadas',         '15 hours', '50',  'cancelled'),
  ('5215510000008', 'Tinte y Mechas',          '16 hours', '120', 'confirmed')
) AS t(c_phone, s_name, hora, dur, estado)
WHERE EXISTS (SELECT 1 FROM clients WHERE phone = t.c_phone)
  AND EXISTS (SELECT 1 FROM services WHERE name  = t.s_name);

-- ────────────────────────────────────────────────────────────────
-- 4. CITAS — ESTA SEMANA (días distintos al de hoy)
-- ────────────────────────────────────────────────────────────────
INSERT INTO appointments (client_id, service_id, starts_at, ends_at, status)
SELECT
  (SELECT id FROM clients WHERE phone = c_phone),
  (SELECT id FROM services WHERE name  = s_name  LIMIT 1),
  DATE_TRUNC('day', NOW()) + (dias || ' days')::interval + hora::interval,
  DATE_TRUNC('day', NOW()) + (dias || ' days')::interval + hora::interval + (dur || ' minutes')::interval,
  estado
FROM (VALUES
  ('5215510000009', 'Manicura Clásica',        '-1', '10 hours', '45',  'completed'),
  ('5215510000010', 'Pedicura Completa',       '-1', '14 hours', '60',  'completed'),
  ('5215510000001', 'Cejas Laminadas',         '-2', '11 hours', '50',  'completed'),
  ('5215510000002', 'Corte de Cabello',        '-2', '13 hours', '60',  'cancelled'),
  ('5215510000003', 'Limpieza Facial',         '-3', '9 hours',  '75',  'completed'),
  ('5215510000004', 'Manicura Semipermanente', '-3', '16 hours', '60',  'completed'),
  ('5215510000005', 'Maquillaje de Evento',    '1',  '10 hours', '90',  'pending'),
  ('5215510000006', 'Tinte y Mechas',          '1',  '12 hours', '120', 'pending'),
  ('5215510000007', 'Manicura Clásica',        '2',  '9 hours',  '45',  'pending'),
  ('5215510000008', 'Limpieza Facial',         '2',  '11 hours', '75',  'pending')
) AS t(c_phone, s_name, dias, hora, dur, estado)
WHERE EXISTS (SELECT 1 FROM clients WHERE phone = t.c_phone)
  AND EXISTS (SELECT 1 FROM services WHERE name  = t.s_name);

-- ────────────────────────────────────────────────────────────────
-- 5. CITAS — ESTE MES (distribuidas en semanas anteriores)
-- ────────────────────────────────────────────────────────────────
INSERT INTO appointments (client_id, service_id, starts_at, ends_at, status)
SELECT
  (SELECT id FROM clients WHERE phone = c_phone),
  (SELECT id FROM services WHERE name  = s_name  LIMIT 1),
  DATE_TRUNC('month', NOW()) + (dias || ' days')::interval + hora::interval,
  DATE_TRUNC('month', NOW()) + (dias || ' days')::interval + hora::interval + (dur || ' minutes')::interval,
  estado
FROM (VALUES
  ('5215510000001', 'Manicura Clásica',        '0',  '10 hours', '45',  'completed'),
  ('5215510000002', 'Tinte y Mechas',          '1',  '11 hours', '120', 'completed'),
  ('5215510000003', 'Cejas Laminadas',         '2',  '9 hours',  '50',  'completed'),
  ('5215510000004', 'Pedicura Completa',       '3',  '14 hours', '60',  'completed'),
  ('5215510000005', 'Limpieza Facial',         '4',  '10 hours', '75',  'cancelled'),
  ('5215510000006', 'Manicura Semipermanente', '5',  '12 hours', '60',  'completed'),
  ('5215510000007', 'Maquillaje de Evento',    '6',  '16 hours', '90',  'completed'),
  ('5215510000008', 'Corte de Cabello',        '7',  '13 hours', '60',  'completed'),
  ('5215510000009', 'Manicura Clásica',        '8',  '9 hours',  '45',  'completed'),
  ('5215510000010', 'Cejas Laminadas',         '9',  '11 hours', '50',  'cancelled'),
  ('5215510000001', 'Limpieza Facial',         '10', '10 hours', '75',  'completed'),
  ('5215510000002', 'Pedicura Completa',       '11', '14 hours', '60',  'completed'),
  ('5215510000003', 'Tinte y Mechas',          '12', '15 hours', '120', 'completed'),
  ('5215510000004', 'Manicura Clásica',        '13', '9 hours',  '45',  'completed'),
  ('5215510000005', 'Corte de Cabello',        '14', '12 hours', '60',  'completed')
) AS t(c_phone, s_name, dias, hora, dur, estado)
WHERE DATE_TRUNC('month', NOW()) + (dias || ' days')::interval < DATE_TRUNC('day', NOW())
  AND EXISTS (SELECT 1 FROM clients WHERE phone = t.c_phone)
  AND EXISTS (SELECT 1 FROM services WHERE name  = t.s_name);

-- ────────────────────────────────────────────────────────────────
-- 6. CITAS — MESES ANTERIORES DEL AÑO (para gráfica anual)
-- ────────────────────────────────────────────────────────────────
INSERT INTO appointments (client_id, service_id, starts_at, ends_at, status)
SELECT
  (SELECT id FROM clients WHERE phone = c_phone),
  (SELECT id FROM services WHERE name  = s_name  LIMIT 1),
  DATE_TRUNC('year', NOW()) + (meses || ' months')::interval + (dias || ' days')::interval + hora::interval,
  DATE_TRUNC('year', NOW()) + (meses || ' months')::interval + (dias || ' days')::interval + hora::interval + (dur || ' minutes')::interval,
  'completed'
FROM (VALUES
  -- Enero
  ('5215510000001','Manicura Clásica',        '0','3', '10 hours','45'),
  ('5215510000002','Tinte y Mechas',          '0','8', '11 hours','120'),
  ('5215510000003','Limpieza Facial',         '0','15','9 hours', '75'),
  -- Febrero
  ('5215510000004','Cejas Laminadas',         '1','2', '10 hours','50'),
  ('5215510000005','Pedicura Completa',       '1','10','14 hours','60'),
  ('5215510000006','Manicura Semipermanente', '1','18','12 hours','60'),
  ('5215510000007','Maquillaje de Evento',    '1','25','16 hours','90'),
  -- Marzo
  ('5215510000008','Corte de Cabello',        '2','5', '13 hours','60'),
  ('5215510000009','Manicura Clásica',        '2','12','9 hours', '45'),
  ('5215510000010','Tinte y Mechas',          '2','19','11 hours','120'),
  ('5215510000001','Limpieza Facial',         '2','26','10 hours','75'),
  ('5215510000002','Cejas Laminadas',         '2','28','15 hours','50'),
  -- Abril (si ya pasó) - se omite si es el mes actual por la condición
  ('5215510000003','Pedicura Completa',       '3','4', '14 hours','60'),
  ('5215510000004','Manicura Clásica',        '3','11','9 hours', '45'),
  -- Mayo
  ('5215510000005','Maquillaje de Evento',    '4','2', '16 hours','90'),
  ('5215510000006','Corte de Cabello',        '4','9', '12 hours','60'),
  ('5215510000007','Manicura Semipermanente', '4','16','10 hours','60'),
  ('5215510000008','Tinte y Mechas',          '4','22','11 hours','120'),
  -- Junio
  ('5215510000009','Limpieza Facial',         '5','5', '10 hours','75'),
  ('5215510000010','Cejas Laminadas',         '5','13','15 hours','50'),
  ('5215510000001','Manicura Clásica',        '5','20','9 hours', '45'),
  ('5215510000002','Pedicura Completa',       '5','27','14 hours','60'),
  -- Julio
  ('5215510000003','Maquillaje de Evento',    '6','3', '16 hours','90'),
  ('5215510000004','Corte de Cabello',        '6','10','12 hours','60'),
  ('5215510000005','Tinte y Mechas',          '6','17','11 hours','120'),
  -- Agosto
  ('5215510000006','Manicura Clásica',        '7','1', '10 hours','45'),
  ('5215510000007','Limpieza Facial',         '7','8', '9 hours', '75'),
  ('5215510000008','Cejas Laminadas',         '7','15','15 hours','50'),
  ('5215510000009','Manicura Semipermanente', '7','22','12 hours','60'),
  -- Septiembre
  ('5215510000010','Pedicura Completa',       '8','4', '14 hours','60'),
  ('5215510000001','Corte de Cabello',        '8','11','13 hours','60'),
  ('5215510000002','Maquillaje de Evento',    '8','18','16 hours','90'),
  ('5215510000003','Tinte y Mechas',          '8','25','11 hours','120'),
  -- Octubre
  ('5215510000004','Manicura Clásica',        '9','2', '9 hours', '45'),
  ('5215510000005','Limpieza Facial',         '9','9', '10 hours','75'),
  ('5215510000006','Cejas Laminadas',         '9','16','15 hours','50'),
  -- Noviembre
  ('5215510000007','Pedicura Completa',       '10','3','14 hours','60'),
  ('5215510000008','Manicura Semipermanente', '10','10','12 hours','60'),
  ('5215510000009','Corte de Cabello',        '10','17','13 hours','60'),
  ('5215510000010','Tinte y Mechas',          '10','24','11 hours','120'),
  -- Diciembre
  ('5215510000001','Maquillaje de Evento',    '11','1','16 hours','90'),
  ('5215510000002','Manicura Clásica',        '11','8','9 hours', '45'),
  ('5215510000003','Limpieza Facial',         '11','15','10 hours','75')
) AS t(c_phone, s_name, meses, dias, hora, dur)
-- Solo insertar si la fecha calculada es anterior a hoy
WHERE DATE_TRUNC('year', NOW())
        + (t.meses || ' months')::interval
        + (t.dias  || ' days' )::interval
        < DATE_TRUNC('day', NOW())
  AND EXISTS (SELECT 1 FROM clients WHERE phone = t.c_phone)
  AND EXISTS (SELECT 1 FROM services WHERE name  = t.s_name);

COMMIT;

-- ────────────────────────────────────────────────────────────────
-- RESUMEN
-- ────────────────────────────────────────────────────────────────
SELECT
  status,
  COUNT(*) AS cantidad
FROM appointments
GROUP BY status
ORDER BY cantidad DESC;

SELECT COUNT(*) AS total_citas FROM appointments;
SELECT COUNT(*) AS total_clientes FROM clients WHERE phone LIKE '521551000%';
