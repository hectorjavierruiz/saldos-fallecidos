// Necesario en redes corporativas con inspección SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { HttpsProxyAgent } = require('https-proxy-agent');
const MsgReader = require('@kenjiuno/msgreader').default;

const app = express();
const PORT = process.env.PORT || 3000;

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
const anthropicOptions = { apiKey: process.env.ANTHROPIC_API_KEY };
if (proxyUrl) {
  console.log('Usando proxy:', proxyUrl);
  anthropicOptions.httpAgent = new HttpsProxyAgent(proxyUrl);
}

app.use(express.json());
app.use(express.static('public'));

const EML_MIMES = new Set([
  'message/rfc822', 'application/octet-stream', 'text/plain',
  'application/vnd.ms-outlook'
]);

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 20 * 1024 * 1024, files: 20 },
  // Aceptar todo — validamos por extensión en el handler
  fileFilter: (req, file, cb) => cb(null, true)
});

const anthropic = new Anthropic(anthropicOptions);

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'skill-prompt.md'), 'utf8');

function fileToBase64(filePath) {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

function getMimeType(originalname, mimetype) {
  if (mimetype === 'application/pdf') return 'application/pdf';
  if (mimetype.startsWith('image/')) return mimetype;
  const ext = path.extname(originalname).toLowerCase();
  const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
  return map[ext] || mimetype;
}

function isEmailFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.eml' || ext === '.msg' || ext === '.txt';
}

function readEmailContent(filePath, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.msg') {
    try {
      const buf = fs.readFileSync(filePath);
      const reader = new MsgReader(buf);
      const info = reader.getFileData();
      let text = '';
      if (info.senderName)  text += `De: ${info.senderName}`;
      if (info.senderEmail) text += ` <${info.senderEmail}>`;
      if (info.senderName || info.senderEmail) text += '\n';
      if (info.recipients?.length) text += `Para: ${info.recipients.map(r => r.name || r.email).join(', ')}\n`;
      if (info.subject)     text += `Asunto: ${info.subject}\n`;
      if (info.creationTime) text += `Fecha: ${info.creationTime}\n`;
      text += '\n';
      text += info.body || info.bodyHTML || '(sin cuerpo)';
      return text;
    } catch (e) {
      // Fallback: leer como latin1 y extraer strings legibles
      const raw = fs.readFileSync(filePath, 'latin1');
      const readable = raw.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, ' ').replace(/ {3,}/g, ' ');
      return `[Archivo .msg — contenido extraído parcialmente]\n${readable.substring(0, 60000)}`;
    }
  }
  // .eml / .txt
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fs.readFileSync(filePath, 'latin1');
  }
}

app.post('/api/validar', (req, res, next) => {
  upload.array('archivos', 20)(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const uploadedFiles = req.files || [];

  try {
    if (!uploadedFiles.length) {
      return res.status(400).json({ error: 'Debe adjuntar al menos un archivo.' });
    }

    const { cuerpo_correo = '' } = req.body;

    const emailFiles = uploadedFiles.filter(f => isEmailFile(f.originalname));
    const docFiles   = uploadedFiles.filter(f => !isEmailFile(f.originalname));

    const contentBlocks = [];

    let textIntro = `Eres el asistente jurídico del Banco de Occidente. A continuación recibes un caso completo de reclamación de saldos de persona fallecida.\n\n`;
    textIntro += `Tu tarea es:\n`;
    textIntro += `1. Extraer toda la información del caso a partir del correo y los documentos adjuntos (NO uses datos pre-ingresados — extrae todo tú mismo).\n`;
    textIntro += `2. Ejecutar el análisis completo: checklist documental, validación de consistencia y decisión.\n`;
    textIntro += `3. Responder SOLO con el JSON especificado en las instrucciones del sistema.\n\n`;

    if (cuerpo_correo.trim()) {
      textIntro += `--- CORREO DE LA OFICINA (pegado por el usuario) ---\n${cuerpo_correo.trim()}\n--- FIN DEL CORREO ---\n\n`;
    }

    if (emailFiles.length) {
      textIntro += `Archivos de correo adjuntos (${emailFiles.length}): ${emailFiles.map(f => f.originalname).join(', ')}\n`;
    }
    textIntro += `Documentos PDF/imagen adjuntos (${docFiles.length}): ${docFiles.map(f => f.originalname).join(', ')}\n`;

    contentBlocks.push({ type: 'text', text: textIntro });

    // Incluir archivos de correo como texto
    for (const file of emailFiles) {
      let content = readEmailContent(file.path, file.originalname);
      if (content.length > 80000) content = content.substring(0, 80000) + '\n[... contenido truncado ...]';
      contentBlocks.push({
        type: 'text',
        text: `\n=== CORREO: ${file.originalname} ===\n${content}\n=== FIN CORREO ===`
      });
    }

    // Incluir PDFs e imágenes
    for (const file of docFiles) {
      const mime = getMimeType(file.originalname, file.mimetype);
      const b64 = fileToBase64(file.path);

      contentBlocks.push({
        type: 'text',
        text: `\n--- Documento: ${file.originalname} ---`
      });

      if (mime === 'application/pdf') {
        contentBlocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: b64 }
        });
      } else {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: mime, data: b64 }
        });
      }
    }

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contentBlocks }]
    });

    const rawText = message.content[0].text.trim();

    let resultado;
    // Intentar extraer JSON por varios métodos en orden de preferencia
    const candidates = [];

    // 1. Bloque de código ```json ... ```
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) candidates.push(fenceMatch[1].trim());

    // 2. Primer objeto JSON completo que empiece con {
    const braceMatch = rawText.match(/(\{[\s\S]*\})/);
    if (braceMatch) candidates.push(braceMatch[1].trim());

    // 3. Texto completo
    candidates.push(rawText);

    resultado = null;
    for (const candidate of candidates) {
      try {
        resultado = JSON.parse(candidate);
        break;
      } catch {}
    }
    if (!resultado) {
      resultado = { resultado: 'ERROR', raw: rawText, error: 'No se pudo parsear la respuesta como JSON.' };
    }

    res.json({ ok: true, data: resultado });
  } catch (err) {
    console.error('Error en /api/validar:', err.message);
    if (err.status) console.error('HTTP status de Anthropic:', err.status);
    if (err.error) console.error('Detalle Anthropic:', JSON.stringify(err.error));
    const msg = err.error?.error?.message || err.message || 'Error interno del servidor.';
    res.status(500).json({ error: msg });
  } finally {
    for (const file of uploadedFiles) {
      try { fs.unlinkSync(file.path); } catch {}
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Acceso en red local: http://192.168.80.209:${PORT}`);
});
