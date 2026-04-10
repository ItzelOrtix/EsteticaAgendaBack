const twilio = require('twilio');

let client;

function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

async function sendMessage(to, body) {
  try {
    const from = process.env.TWILIO_WHATSAPP_NUMBER;
    // Normalizar número destino
    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

    const message = await getClient().messages.create({
      from,
      to: toFormatted,
      body,
    });

    return message.sid;
  } catch (err) {
    console.error('Error enviando mensaje de WhatsApp:', err.message);
    throw err;
  }
}

module.exports = { sendMessage };
