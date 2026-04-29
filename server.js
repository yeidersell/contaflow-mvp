require('dotenv').config();
const express  = require('express');
const twilio   = require('twilio');
const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');

const app    = express();
const client = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const DB_PATH   = path.join(__dirname, 'transactions.json');
const HTML_PATH = path.join(__dirname, 'dashboard-facturacion.html');

// ── Datos iniciales (los 9 comprobantes ya procesados) ────────
const SEED_DATA = [
  { archivo:'facturas/ingresos/WhatsApp Image 2026-04-28 at 4.26.26 PM.jpeg',   tipo:'ingreso', fecha:'2025-08-16', monto:490000,  remitente:'Yonner Jose Saavedra Rico',     destinatario:'Yeider Jose Freites Velasquez', entidad_origen:'Bold CF',          referencia:'ID: 0Y1UFG1RCH' },
  { archivo:'facturas/ingresos/WhatsApp Image 2026-04-28 at 4.26.27 PM.jpeg',   tipo:'ingreso', fecha:'2025-08-23', monto:890000,  remitente:'Yonner Jose Saavedra Rico',     destinatario:'Yeider Jose Freites Velasquez', entidad_origen:'Bold CF',          referencia:'ID: TL0YHHGQAF' },
  { archivo:'facturas/ingresos/WhatsApp Image 2026-04-28 at 4.26.27 PM (1).jpeg',tipo:'ingreso',fecha:'2025-08-30', monto:1300000, remitente:'Yonner Jose Saavedra Rico',     destinatario:'Yeider Jose Freites Velasquez', entidad_origen:'Bold CF',          referencia:'ID: VN5ZNKAAH5' },
  { archivo:'facturas/ingresos/WhatsApp Image 2026-04-28 at 4.26.27 PM (2).jpeg',tipo:'ingreso',fecha:'2025-09-06', monto:590000,  remitente:'Yonner Jose Saavedra Rico',     destinatario:'Yeider Jose Freites Velasquez', entidad_origen:'Bold CF',          referencia:'ID: LR7JXJPOS6' },
  { archivo:'facturas/ingresos/WhatsApp Image 2026-04-28 at 4.26.27 PM (3).jpeg',tipo:'ingreso',fecha:'2025-10-11', monto:1290000, remitente:'Yonner Jose Saavedra Rico',     destinatario:'Yeider Jose Freites Velasquez', entidad_origen:'Bold CF / Bancamia',referencia:'ID: H8DZLTJH5Y' },
  { archivo:'facturas/ingresos/WhatsApp Image 2026-04-28 at 4.26.27 PM (4).jpeg',tipo:'ingreso',fecha:'2025-10-18', monto:1190000, remitente:'Yonner Jose Saavedra Rico',     destinatario:'Yeider Jose Freites Velasquez', entidad_origen:'Bold CF / Bancamia',referencia:'ID: QT5SRU3NME' },
  { archivo:'facturas/gastos/WhatsApp Image 2026-04-28 at 4.25.04 PM.jpeg',     tipo:'gasto',   fecha:'2026-03-19', monto:500000,  remitente:'Yeider Jose Freites Velasquez', destinatario:'Sergio Saavedra',              entidad_origen:'Bancolombia',       referencia:'Comp. 803 · anticipo' },
  { archivo:'facturas/gastos/WhatsApp Image 2026-04-28 at 4.25.04 PM2.jpeg',    tipo:'gasto',   fecha:'2026-03-26', monto:500000,  remitente:'Yeider Jose Freites Velasquez', destinatario:'Sergio Saavedra',              entidad_origen:'Bancolombia',       referencia:'Comp. 2404 · saldo anticipo' },
  { archivo:'facturas/gastos/WhatsApp Image 2026-04-28 at 4.25.05 PM3.jpeg',    tipo:'gasto',   fecha:'2026-04-01', monto:1000000, remitente:'Yeider Jose Freites Velasquez', destinatario:'Sergio Saavedra',              entidad_origen:'Bancolombia',       referencia:'Comp. 2222 · saldo pag web' },
];

// ── DB helpers ────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const seeded = SEED_DATA.map((t, i) => ({ _id: `seed_${i}`, ...t }));
    fs.writeFileSync(DB_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  return data.map((t, i) => t._id ? t : { _id: `seed_${i}`, ...t });
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function addTransaction(tx) {
  const data = loadDB();
  tx._id = Date.now().toString();
  data.push(tx);
  saveDB(data);
}

// ── Formatters ────────────────────────────────────────────────
const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function fmtMonto(n) {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

function fmtFecha(iso) {
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

function buildWhatsAppReply(tx) {
  const isIng = tx.tipo === 'ingreso';
  const contra = isIng ? tx.remitente : tx.destinatario;
  const shortName = (n) => (n || 'Desconocido').split(' ').slice(0, 2).join(' ');
  return (
    `✅ *Comprobante registrado*\n\n` +
    `${isIng ? '💰' : '💸'} ${fmtMonto(tx.monto)} · ${isIng ? 'Ingreso' : 'Gasto'}\n` +
    `👤 ${isIng ? 'De' : 'Para'}: ${shortName(contra)}\n` +
    `🏦 ${tx.entidad_origen || '-'}\n` +
    `📅 ${fmtFecha(tx.fecha)}\n` +
    (tx.referencia ? `🔖 ${tx.referencia}\n` : '') +
    `\n_Ya está visible en tu dashboard._`
  );
}

// ── Gemini: analizar imagen (REST directo, sin SDK) ──────────
const PROMPT_COMPROBANTE = `Analiza este comprobante de pago y extrae los datos en JSON con exactamente estos campos:
- tipo: "ingreso" si recibes dinero, "gasto" si pagas
- fecha: formato YYYY-MM-DD
- monto: número sin símbolos ni puntos (ej: 490000)
- remitente: nombre completo de quien envía
- destinatario: nombre completo de quien recibe
- entidad_origen: banco o plataforma (Bancolombia, Bold CF, Nequi, etc.)
- referencia: concepto, descripción o número de comprobante
- id_comprobante: código único de la transacción si aparece, o null

Responde SOLO con el JSON, sin texto adicional, sin markdown.`;

async function geminiPost(model, apiVer, base64Image, mediaType) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/${apiVer}/models/${model}:generateContent?key=${apiKey}`;
  const { data } = await axios.post(url, {
    contents: [{ parts: [
      { inline_data: { mime_type: mediaType, data: base64Image } },
      { text: PROMPT_COMPROBANTE }
    ]}],
    generationConfig: { temperature: 0, maxOutputTokens: 2048 }
  });
  return data.candidates[0].content.parts[0].text.trim();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function analyzeReceipt(base64Image, mediaType) {
  const attempts = [
    { model: 'gemini-2.5-flash',      ver: 'v1beta' },
    { model: 'gemini-2.0-flash',      ver: 'v1beta' },
    { model: 'gemini-2.0-flash-lite', ver: 'v1beta' },
  ];
  let lastErr;

  for (const { model, ver } of attempts) {
    for (let retry = 0; retry < 2; retry++) {
      try {
        console.log(`[gemini] Intentando ${ver}/${model}${retry ? ' (reintento)' : ''}`);
        const text = await geminiPost(model, ver, base64Image, mediaType);
        console.log(`[gemini] OK con ${ver}/${model}:`, text.slice(0, 200));

        let clean = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
        try { return JSON.parse(clean); } catch {}
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('JSON inválido');
      } catch (err) {
        const status = err.response?.status;
        const msg    = JSON.stringify(err.response?.data?.error?.message || err.message);
        console.error(`[gemini] ${ver}/${model} → ${status}: ${msg.slice(0, 200)}`);
        lastErr = err;
        if ((status === 429 || status === 503) && retry === 0) {
          console.log('[gemini] Esperando 4s antes de reintentar...');
          await sleep(4000);
        } else {
          break;
        }
      }
    }
  }
  throw lastErr;
}

// ── Descargar imagen de Twilio ────────────────────────────────
async function downloadTwilioMedia(mediaUrl) {
  const response = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    auth: {
      username: process.env.TWILIO_ACCOUNT_SID,
      password: process.env.TWILIO_AUTH_TOKEN
    }
  });

  let buffer = Buffer.from(response.data);

  // Reducir tamaño si supera 800KB para no exceder cuota gratuita de Gemini
  if (buffer.length > 800 * 1024) {
    try {
      const sharp = require('sharp');
      buffer = await sharp(buffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
      console.log(`[media] Imagen comprimida: ${(buffer.length/1024).toFixed(0)}KB`);
    } catch {
      // sharp no instalado — continuar con imagen original
    }
  }

  const base64 = buffer.toString('base64');
  const mediaType = 'image/jpeg';
  return { base64, mediaType };
}

// ── Responder por WhatsApp ────────────────────────────────────
async function replyWhatsApp(to, body) {
  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to,
    body
  });
}

// ── Middleware ────────────────────────────────────────────────
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ── Servir archivos estáticos ─────────────────────────────────
app.use('/facturas', express.static(path.join(__dirname, 'facturas')));
app.use('/whatsapp', express.static(path.join(__dirname, 'whatsapp')));

// ── GET / — dashboard ─────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(HTML_PATH);
});

// ── GET /api/transactions ─────────────────────────────────────
app.get('/api/transactions', (req, res) => {
  res.json(loadDB());
});

// ── DELETE /api/transactions/:id ──────────────────────────────
app.delete('/api/transactions/:id', (req, res) => {
  const data = loadDB();
  const filtered = data.filter(t => t._id !== req.params.id);
  if (filtered.length === data.length) return res.status(404).json({ error: 'Not found' });
  saveDB(filtered);
  res.json({ ok: true });
});

// ── GET /api/models — diagnóstico ────────────────────────────
app.get('/api/models', async (req, res) => {
  try {
    const { data } = await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    const names = (data.models || []).map(m => m.name);
    res.json({ total: names.length, models: names });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ── POST /webhook — Twilio WhatsApp ──────────────────────────
app.post('/webhook', async (req, res) => {
  const from      = req.body.From;
  const numMedia  = parseInt(req.body.NumMedia || '0');
  const mediaUrl  = req.body.MediaUrl0;
  const mediaType = req.body.MediaContentType0 || 'image/jpeg';

  // Responder a Twilio inmediatamente (evita timeout)
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');

  if (numMedia === 0) {
    await replyWhatsApp(from,
      '👋 Hola! Envíame una foto de tu comprobante o factura y lo registro automáticamente en tu dashboard.'
    );
    return;
  }

  try {
    await replyWhatsApp(from, '⏳ Analizando tu comprobante...');

    const { base64, mediaType: detectedType } = await downloadTwilioMedia(mediaUrl);
    const tx = await analyzeReceipt(base64, detectedType || mediaType);

    // Guardar imagen en disco
    const imgDir  = path.join(__dirname, 'whatsapp');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir);
    const imgName = `${Date.now()}.jpg`;
    fs.writeFileSync(path.join(imgDir, imgName), Buffer.from(base64, 'base64'));
    tx.archivo    = `whatsapp/${imgName}`;
    tx.monto      = Number(tx.monto) || 0;
    tx.iva        = null;
    tx.retencion  = null;
    tx.notas      = `Recibido por WhatsApp desde ${from}`;

    addTransaction(tx);
    await replyWhatsApp(from, buildWhatsAppReply(tx));

    console.log(`[webhook] ✅ Transacción guardada: ${tx.tipo} ${tx.monto} — ${tx.fecha}`);
  } catch (err) {
    console.error('[webhook] Error:', err.message);
    await replyWhatsApp(from,
      '❌ No pude procesar el comprobante. Asegúrate de enviar una imagen clara del comprobante o factura.'
    );
  }
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 ContaFlow MVP corriendo en http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 Webhook:   http://localhost:${PORT}/webhook`);
  console.log(`\n💡 Para exponer al internet: npx ngrok http ${PORT}\n`);
});
