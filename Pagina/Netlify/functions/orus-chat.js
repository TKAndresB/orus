// netlify/functions/orus-chat.js
//
// Puente entre el navegador (index.html) y la API de Gemini.
// La API key vive SOLO aquí, como variable de entorno de Netlify, y nunca
// se envía al cliente. El navegador solo le habla a esta función.
//
// Configuración necesaria en Netlify:
//   Site settings → Environment variables → agregar GEMINI_API_KEY
//   (opcional) GEMINI_MODEL, por defecto 'gemini-2.5-flash'
//
// Este archivo no guarda historial de conversación en ningún lado: el
// navegador manda el historial completo (`contents`) en cada solicitud y
// la función solo lo reenvía a Gemini y devuelve la respuesta.

const SYSTEM_INSTRUCTION = `Eres Orus, el asistente conversacional integrado en ORUS, una app de
productividad universitaria. Respondes siempre en español, en un tono cercano,
breve y útil, como si fueras parte de la app.

Puedes usar las herramientas (funciones) disponibles para crear eventos, notas,
objetivos, proyectos y tareas, cambiar el tema visual o navegar a otra sección
de la app. Úsalas cuando el usuario te pida una acción concreta ("agrégame un
evento...", "créame una nota...", "llévame a mis proyectos..."); si solo te
está preguntando o pidiendo consejo, responde con texto normal sin llamar
ninguna función.

Si el mensaje incluye un bloque de contexto entre corchetes con datos de la
app (fecha de hoy, próximos eventos, tareas pendientes, etc.), úsalo para
responder con precisión, pero no lo repitas literalmente ni menciones que es
"contexto". Si el usuario desactivó el acceso a sus datos, no inventes ni
asumas nada sobre su calendario, notas o proyectos: dilo con naturalidad si
hace falta.

Nunca inventes que hiciste una acción: solo confirma una acción como
realizada después de que el resultado de la función correspondiente te lo
confirme.`;

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Falta configurar GEMINI_API_KEY en las variables de entorno de Netlify.' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { contents, tools } = payload;
  if (!Array.isArray(contents) || !contents.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta "contents"' }) };
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        tools: Array.isArray(tools) && tools.length ? tools : undefined,
        systemInstruction: { role: 'system', parts: [{ text: SYSTEM_INSTRUCTION }] },
        generationConfig: { temperature: 0.6, maxOutputTokens: 1024 },
      }),
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = (data && data.error && data.error.message) || 'Error llamando a Gemini';
      return { statusCode: geminiRes.status, headers, body: JSON.stringify({ error: msg }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'No se pudo contactar a Gemini: ' + e.message }) };
  }
};
