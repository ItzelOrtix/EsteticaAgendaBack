const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const bot = require('../services/bot');

// Middleware para validar que el request viene de Twilio
function twilioValidate(req, res, next) {
  if (process.env.NODE_ENV === 'development') return next(); // Saltar validación en desarrollo

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers['x-twilio-signature'];
  const url = `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/whatsapp/webhook`;

  const valid = twilio.validateRequest(authToken, signature, url, req.body);
  if (!valid) {
    console.warn('Webhook de WhatsApp con firma inválida');
    return res.status(403).send('Forbidden');
  }
  next();
}

// Webhook principal de Twilio WhatsApp
router.post('/webhook', twilioValidate, async (req, res) => {
  const { From, Body, ProfileName } = req.body;

  if (!From || !Body) {
    return res.status(400).end();
  }

  try {
    const reply = await bot.handleMessage(From, Body, ProfileName);

    // Responder con TwiML
    const twiml = new twilio.twiml.MessagingResponse();
    if (reply) twiml.message(reply);

    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('Error en webhook de WhatsApp:', err);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('Hubo un pequeño error. Por favor intenta de nuevo en un momento 😊');
    res.type('text/xml').send(twiml.toString());
  }
});

module.exports = router;
