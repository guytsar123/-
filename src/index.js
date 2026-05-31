// שרת ה-webhook של הבוט: מקבל הודעות מ-WhatsApp Cloud API, מאמת חתימה,
// מעביר לטיפול, ושולח תשובה/ריאקציה חזרה.
import express from 'express';
import crypto from 'node:crypto';
import { config, checkConfig } from './config.js';
import { handleMessage } from './handler.js';
import { sendText, sendReaction, sendButtons, markAsRead } from './whatsapp.js';
import { transcribeIncomingAudio } from './voice.js';

const app = express();

// שומרים את גוף הבקשה הגולמי כדי לאמת את חתימת Meta (HMAC על ה-raw body).
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// ===== אימות חתימת X-Hub-Signature-256 =====
function verifySignature(req) {
  if (!config.whatsapp.appSecret) return true; // אם לא הוגדר secret — מדלגים (לא מאובטח)
  const signature = req.get('x-hub-signature-256');
  if (!signature || !req.rawBody) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', config.whatsapp.appSecret)
    .update(req.rawBody)
    .digest('hex');
  // השוואה בזמן קבוע למניעת timing attacks
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ===== מניעת טיפול כפול באותה הודעה (Meta שולחת שוב לפעמים) =====
const processedIds = new Set();
function alreadyProcessed(id) {
  if (!id) return false;
  if (processedIds.has(id)) return true;
  processedIds.add(id);
  // שמירה על גודל סביר
  if (processedIds.size > 500) {
    const first = processedIds.values().next().value;
    processedIds.delete(first);
  }
  return false;
}

// ===== אימות ה-webhook מול Meta (בעת ההגדרה) =====
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('[webhook] אומת בהצלחה מול Meta');
    return res.status(200).send(challenge);
  }
  console.warn('[webhook] אימות נכשל (token לא תואם)');
  return res.sendStatus(403);
});

// ===== קבלת הודעות נכנסות =====
app.post('/webhook', async (req, res) => {
  if (!verifySignature(req)) {
    console.warn('[webhook] חתימה לא תקינה — נדחה');
    return res.sendStatus(403);
  }

  // עונים מיד ל-Meta (200) כדי למנוע שליחה חוזרת, וממשיכים לעבד.
  res.sendStatus(200);

  try {
    const entries = req.body.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const messages = value.messages || [];
        for (const msg of messages) {
          await handleIncoming(msg, value);
        }
      }
    }
  } catch (err) {
    console.error('[webhook] שגיאה בעיבוד:', err);
  }
});

async function handleIncoming(msg, value) {
  const from = msg.from; // מספר הטלפון של השולח
  const messageId = msg.id;

  if (alreadyProcessed(messageId)) return;

  // הגבלה: רק המספר המורשה (אם הוגדר) יכול לדבר עם הבוט.
  if (config.allowedNumber && from !== config.allowedNumber) {
    console.log(`[webhook] התעלמות מהודעה ממספר לא מורשה: ${from}`);
    return;
  }

  // מחלצים טקסט / מזהה כפתור.
  let text = null;
  if (msg.type === 'text') {
    text = msg.text?.body;
  } else if (msg.type === 'interactive' && msg.interactive?.button_reply) {
    // לחיצת כפתור — מעבירים את ה-id עם קידומת כדי שה-handler ינתב לפי פעולה.
    text = 'BTN:' + msg.interactive.button_reply.id;
  } else if (msg.type === 'interactive') {
    text = msg.interactive?.list_reply?.title;
  } else if (msg.type === 'button') {
    text = msg.button?.text;
  } else if (msg.type === 'audio') {
    // הודעה קולית — תמלול (אם מוגדר).
    text = await transcribeIncomingAudio(msg);
    if (text) await sendText(from, `🎤 _שמעתי:_ "${text}"`);
  }

  if (!text) {
    if (msg.type === 'audio') {
      await sendText(from, '🎤 קיבלתי הודעה קולית אבל תמלול עדיין לא מוגדר. כתוב לי בטקסט בינתיים 🙂');
    } else {
      await sendText(from, 'כרגע אני מבין הודעות טקסט והקלטות קוליות 🙂 כתוב לי מה להוסיף לרשימה.');
    }
    return;
  }

  console.log(`[הודעה] מ-${from}: ${text}`);
  markAsRead(messageId).catch(() => {});

  const { reply, react, buttons } = await handleMessage(text);

  if (react) {
    await sendReaction(from, messageId, react);
  }
  if (buttons && buttons.length) {
    await sendButtons(from, reply || ' ', buttons);
  } else if (reply) {
    await sendText(from, reply);
  }
}

// ===== בדיקת בריאות =====
app.get('/', (_req, res) => res.send('WhatsApp Shopping Bot פועל ✅'));
app.get('/health', (_req, res) => res.json({ ok: true }));

const warnings = checkConfig();
if (warnings.length) {
  console.log('\n⚠️  אזהרות הגדרה:');
  for (const w of warnings) console.log('   - ' + w);
  console.log('');
}

app.listen(config.port, () => {
  console.log(`🛒 הבוט מאזין על פורט ${config.port}`);
});
