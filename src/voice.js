// תמלול הודעות קוליות מוואטסאפ.
// WhatsApp שולח אודיו כ-media_id; מורידים את הקובץ ומתמללים.
// תמלול דרך Groq Whisper (חינמי, מהיר, תומך עברית) — דורש GROQ_API_KEY.
// אם אין מפתח — מחזיר null וההודעה תטופל כ"לא נתמך".
import { config } from './config.js';

const GRAPH = 'https://graph.facebook.com';
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// שלב 1: קבלת כתובת ההורדה של המדיה לפי media_id.
async function getMediaUrl(mediaId) {
  const res = await fetch(`${GRAPH}/${config.whatsapp.graphVersion}/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.whatsapp.token}` },
  });
  if (!res.ok) {
    console.error('[voice] getMediaUrl נכשל:', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data.url || null;
}

// שלב 2: הורדת בייטים של המדיה (דורש את אותו טוקן).
async function downloadMedia(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${config.whatsapp.token}` } });
  if (!res.ok) {
    console.error('[voice] downloadMedia נכשל:', res.status);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

// שלב 3: תמלול עברית דרך Groq Whisper.
async function transcribe(audioBuffer, mimeType) {
  if (!config.groq.apiKey) return null;
  const ext = (mimeType || 'audio/ogg').includes('ogg') ? 'ogg' : 'mp3';
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/ogg' }), `audio.${ext}`);
  form.append('model', config.groq.model);
  form.append('language', 'he'); // עברית
  form.append('response_format', 'text');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.groq.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    console.error('[voice] Groq transcribe נכשל:', res.status, await res.text());
    return null;
  }
  return (await res.text()).trim();
}

// נקודת כניסה: מקבל את אובייקט ההודעה של וואטסאפ (type=audio) ומחזיר טקסט מתומלל או null.
export async function transcribeIncomingAudio(msg) {
  try {
    const mediaId = msg.audio?.id;
    if (!mediaId) return null;
    if (!config.groq.apiKey) {
      console.log('[voice] התקבלה הודעה קולית אך GROQ_API_KEY לא מוגדר.');
      return null;
    }
    const url = await getMediaUrl(mediaId);
    if (!url) return null;
    const buf = await downloadMedia(url);
    if (!buf) return null;
    const text = await transcribe(buf, msg.audio?.mime_type);
    if (text) console.log('[voice] תומלל:', text);
    return text || null;
  } catch (err) {
    console.error('[voice] שגיאה בתמלול:', err.message);
    return null;
  }
}
