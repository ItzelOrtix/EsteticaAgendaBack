require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const routes = require('./routes/index');
const appointmentsCtrl = require('./controllers/appointments');
const scheduler = require('./services/scheduler');
const bot = require('./services/bot');

const app = express();
const server = http.createServer(app);

// Socket.io para notificaciones en tiempo real al panel
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Inyectar io en los módulos que lo necesitan
appointmentsCtrl.setIo(io);
scheduler.setIo(io);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Twilio envía sus webhooks como application/x-www-form-urlencoded
app.use('/api/whatsapp', express.urlencoded({ extended: false }));
app.use(express.json());

// Rutas
app.use('/api', routes);

// Endpoint para que el frontend notifique al backend cuando se confirma una reserva
// (llamado desde la página del calendario después de guardar la cita)
app.post('/api/appointments/:id/notify-client', async (req, res) => {
  try {
    const { rows } = await require('./config/database').query(
      `SELECT a.*, c.name AS client_name, c.phone AS client_phone,
        s.name AS service_name, s.duration_minutes
       FROM appointments a
       JOIN clients c ON c.id = a.client_id
       JOIN services s ON s.id = a.service_id
       WHERE a.id = $1`,
      [req.params.id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Cita no encontrada' });

    await bot.sendBookingConfirmation(rows[0]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error notificando cliente:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Manejo de rutas no encontradas
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Socket.io: log de conexiones
io.on('connection', (socket) => {
  console.log(`Panel conectado: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Panel desconectado: ${socket.id}`));
});

// Iniciar scheduler de recordatorios
scheduler.startScheduler();

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📱 WhatsApp webhook: http://localhost:${PORT}/api/whatsapp/webhook`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}\n`);
});
