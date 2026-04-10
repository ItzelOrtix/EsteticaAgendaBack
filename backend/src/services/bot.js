/**
 * Motor conversacional del bot de WhatsApp.
 * Maneja estados de conversación por número de teléfono.
 *
 * Estados: IDLE → GREETING → ASK_NAME → ASK_SERVICE → ASK_PHONE → SEND_LINK → AWAITING_BOOKING → REMINDER_CONFIRM
 */

const pool = require('../config/database');
const twilioService = require('./twilio');

const BUSINESS_NAME = process.env.BUSINESS_NAME || 'Studio Élégance';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Palabras que activan el bot
const TRIGGER_WORDS = ['hola', 'hello', 'hi', 'cita', 'agendar', 'reservar', 'quiero', 'buenas', 'buen día', 'buen dia'];

function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function getOrCreateConversation(whatsappNumber) {
  const { rows } = await pool.query(
    'SELECT * FROM clients WHERE whatsapp_number = $1',
    [whatsappNumber]
  );

  if (rows.length > 0) {
    const client = rows[0];
    const state = client.conversation_state || {};
    return { client, state };
  }

  // Crear registro temporal para este número
  const { rows: newRows } = await pool.query(
    `INSERT INTO clients (name, phone, whatsapp_number, conversation_state)
     VALUES ('', $1, $1, '{"step": "IDLE"}')
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [whatsappNumber]
  );

  const client = newRows[0] || (await pool.query('SELECT * FROM clients WHERE whatsapp_number = $1', [whatsappNumber])).rows[0];
  return { client, state: client.conversation_state || { step: 'IDLE' } };
}

async function updateState(clientId, newState) {
  await pool.query(
    'UPDATE clients SET conversation_state = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(newState), clientId]
  );
}

async function updateClientData(clientId, data) {
  const fields = Object.entries(data)
    .map(([k], i) => `${k} = $${i + 2}`)
    .join(', ');
  const values = Object.values(data);
  await pool.query(
    `UPDATE clients SET ${fields}, updated_at = NOW() WHERE id = $1`,
    [clientId, ...values]
  );
}

async function getServices() {
  const { rows } = await pool.query(
    'SELECT id, name, duration_minutes, price FROM services WHERE active = true ORDER BY sort_order'
  );
  return rows;
}

function buildServicesMenu(services) {
  const lines = services.map((s, i) => {
    const price = s.price ? ` — $${parseFloat(s.price).toFixed(0)}` : '';
    return `  *${i + 1}.* ${s.name}${price}`;
  });
  return lines.join('\n');
}

async function handleMessage(from, body, profileName) {
  const normalized = normalize(body);
  const { client, state } = await getOrCreateConversation(from);

  // Manejo de recordatorio: confirmar/cancelar cita
  if (state.step === 'REMINDER_CONFIRM') {
    return await handleReminderResponse(client, state, normalized);
  }

  // Activar conversación desde IDLE
  if (state.step === 'IDLE' && TRIGGER_WORDS.some(w => normalized.includes(w))) {
    const greeting = getTimeGreeting();
    await updateState(client.id, { step: 'ASK_NAME' });
    return `${greeting} ✨ Bienvenida a *${BUSINESS_NAME}*.\n\nEstoy aquí para ayudarte a reservar tu próxima cita. ¿Podrías decirme tu nombre completo, por favor?`;
  }

  // Si ya está en flujo activo
  switch (state.step) {
    case 'ASK_NAME':
      return await handleAskName(client, state, body.trim());

    case 'ASK_SERVICE':
      return await handleAskService(client, state, normalized, body.trim());

    case 'ASK_PHONE':
      return await handleAskPhone(client, state, body.trim());

    case 'AWAITING_BOOKING':
      // El cliente ya recibió el link, esperando que haga la reserva
      if (normalized.includes('link') || normalized.includes('envía') || normalized.includes('envia') || normalized.includes('manda')) {
        const link = `${FRONTEND_URL}/agenda/${client.id}`;
        return `Claro, aquí tienes tu enlace personalizado 📅\n\n${link}\n\nAhí podrás elegir el día y la hora que mejor te quede 😊`;
      }
      return `En cuanto selecciones tu horario en el enlace, recibirás la confirmación de tu cita aquí mismo. 💅\n\n¿Necesitas que te vuelva a enviar el link?`;

    default:
      // Si el usuario escribe algo cuando no hay conversación activa
      if (TRIGGER_WORDS.some(w => normalized.includes(w))) {
        await updateState(client.id, { step: 'ASK_NAME' });
        const greeting = getTimeGreeting();
        return `${greeting} ✨ Bienvenida de nuevo a *${BUSINESS_NAME}*.\n\n¿Podrías decirme tu nombre completo para empezar?`;
      }
      return `¡Hola! 👋 Escríbeme *"Hola"* o *"Quiero agendar"* y con gusto te ayudo a reservar tu cita en *${BUSINESS_NAME}* ✨`;
  }
}

async function handleAskName(client, state, name) {
  if (name.length < 3) {
    return 'Por favor, escribe tu nombre completo para poder atenderte mejor 😊';
  }

  await updateClientData(client.id, { name });
  await updateState(client.id, { ...state, step: 'ASK_SERVICE', name });

  const services = await getServices();
  const menu = buildServicesMenu(services);

  return `Encantada de conocerte, *${name}* 💕\n\nEstos son nuestros servicios disponibles:\n\n${menu}\n\n¿Cuál de estos te interesa? Puedes escribir el número o el nombre del servicio.`;
}

async function handleAskService(client, state, normalized, original) {
  const services = await getServices();

  // Buscar por número
  const num = parseInt(normalized.replace(/[^0-9]/g, ''), 10);
  let selectedService = null;

  if (num >= 1 && num <= services.length) {
    selectedService = services[num - 1];
  } else {
    // Buscar por nombre aproximado
    selectedService = services.find(s =>
      normalize(s.name).includes(normalized) || normalized.includes(normalize(s.name))
    );
  }

  if (!selectedService) {
    const menu = buildServicesMenu(services);
    return `No encontré ese servicio 😊 Por favor elige uno de la lista:\n\n${menu}\n\nEscribe el número o el nombre del servicio.`;
  }

  await updateState(client.id, { ...state, step: 'ASK_PHONE', service_id: selectedService.id, service_name: selectedService.name });

  // Verificar si el teléfono del WhatsApp es distinto del de contacto
  return `¡Excelente elección! 💅 *${selectedService.name}*\n\n¿El número de WhatsApp que usas es también tu número de contacto? Si es así, escribe *"sí"*. Si prefieres otro número, escríbelo aquí.`;
}

async function handleAskPhone(client, state, body) {
  const normalized = normalize(body);
  let phone = client.whatsapp_number;

  if (!normalized.includes('si') && !normalized.includes('sí')) {
    // Intentar extraer número de teléfono
    const phoneMatch = body.replace(/\s/g, '').match(/[\d\+\-\(\)]{8,15}/);
    if (phoneMatch) {
      phone = phoneMatch[0];
    } else {
      return 'Por favor, escribe un número de teléfono válido, o escribe *"Sí"* para usar el número actual.';
    }
  }

  await updateClientData(client.id, { phone });
  await updateState(client.id, { ...state, step: 'AWAITING_BOOKING', phone });

  const link = `${FRONTEND_URL}/agenda/${client.id}`;

  return `¡Perfecto! Todo listo 🌸\n\nHaz clic en el siguiente enlace para elegir el día y la hora de tu cita:\n\n📅 *${link}*\n\nEn cuanto confirmes, recibirás aquí tu resumen de cita. ¡Te esperamos en *${BUSINESS_NAME}*! ✨`;
}

async function handleReminderResponse(client, state, normalized) {
  const appointmentId = state.appointment_id;

  if (!appointmentId) {
    await updateState(client.id, { step: 'IDLE' });
    return '¡Gracias por tu respuesta! Si necesitas agendar una nueva cita, escríbeme "Hola" 😊';
  }

  if (normalized.includes('sí') || normalized.includes('si') || normalized === '1') {
    // Confirmar cita
    await pool.query(
      "UPDATE appointments SET status = 'confirmed', updated_at = NOW() WHERE id = $1",
      [appointmentId]
    );
    await updateState(client.id, { step: 'IDLE' });

    // Notificar al panel via socket (se emite desde el cron job)
    return `¡Genial! 🎉 Tu cita está confirmada. Te esperamos mañana. Recuerda llegar unos minutos antes. ¡Hasta pronto! 💕`;
  }

  if (normalized.includes('no') || normalized === '2') {
    // Cancelar cita
    await pool.query(
      "UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
      [appointmentId]
    );
    await updateState(client.id, { step: 'IDLE' });

    return `Entendido, hemos cancelado tu cita 💙 Si quieres reagendar en otro momento, escríbeme "Hola". ¡Que tengas un bonito día! 🌸`;
  }

  return 'Por favor responde *"Sí"* para confirmar tu cita o *"No"* para cancelarla.';
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '¡Buenos días!';
  if (hour < 18) return '¡Buenas tardes!';
  return '¡Buenas noches!';
}

// Mensaje de confirmación que se envía después de que el cliente agenda en el calendario web
async function sendBookingConfirmation(appointment) {
  const { client_name, service_name, starts_at, client_phone } = appointment;

  // Buscar whatsapp_number del cliente
  const { rows } = await pool.query(
    'SELECT whatsapp_number FROM clients WHERE id = $1',
    [appointment.client_id]
  );

  if (!rows[0]?.whatsapp_number) return;

  const date = new Date(starts_at);
  const formattedDate = date.toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: process.env.BUSINESS_TIMEZONE || 'America/Mexico_City',
  });
  const formattedTime = date.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
    timeZone: process.env.BUSINESS_TIMEZONE || 'America/Mexico_City',
  });

  const message = `¡Tu cita está confirmada! 🎉✨\n\n` +
    `📋 *Resumen de tu cita:*\n` +
    `👤 *Nombre:* ${client_name}\n` +
    `💅 *Servicio:* ${service_name}\n` +
    `📅 *Fecha:* ${formattedDate}\n` +
    `🕐 *Hora:* ${formattedTime}\n\n` +
    `¡Te esperamos con mucho cariño en *${BUSINESS_NAME}*! 🌸\n\n` +
    `_Si necesitas hacer algún cambio, escríbenos aquí._`;

  await twilioService.sendMessage(rows[0].whatsapp_number, message);

  // Actualizar estado del cliente
  await updateState(appointment.client_id, { step: 'IDLE' });
}

module.exports = { handleMessage, sendBookingConfirmation };
