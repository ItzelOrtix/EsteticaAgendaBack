const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const authCtrl = require('../controllers/auth');
const servicesCtrl = require('../controllers/services');
const availabilityCtrl = require('../controllers/availability');
const appointmentsCtrl = require('../controllers/appointments');
const blocksCtrl = require('../controllers/blocks');
const whatsappRoutes = require('./whatsapp');

// Auth
router.post('/auth/login', authCtrl.login);
router.post('/auth/register', authCtrl.register); // Solo para setup inicial
router.get('/auth/me', auth, authCtrl.me);

// Servicios (públicos para el calendario)
router.get('/services', servicesCtrl.list);
router.get('/services/all', auth, servicesCtrl.listAll);
router.post('/services', auth, servicesCtrl.create);
router.patch('/services/:id', auth, servicesCtrl.update);
router.delete('/services/:id', auth, servicesCtrl.remove);

// Disponibilidad (pública para el calendario)
router.get('/availability', availabilityCtrl.getAvailability);

// Citas
router.post('/appointments', appointmentsCtrl.create); // Llamado desde el frontend del cliente
router.get('/appointments', auth, appointmentsCtrl.list);
router.get('/appointments/client/:client_id', appointmentsCtrl.getByClientToken);
router.get('/appointments/:id', auth, appointmentsCtrl.getById);
router.patch('/appointments/:id/status', auth, appointmentsCtrl.updateStatus);
router.post('/appointments/:id/notify-client', appointmentsCtrl.notifyClient);

// Bloqueos de horario
router.get('/blocks', blocksCtrl.list);
router.post('/blocks', auth, blocksCtrl.create);
router.delete('/blocks/:id', auth, blocksCtrl.remove);

// WhatsApp webhook
router.use('/whatsapp', whatsappRoutes);

module.exports = router;
