// שכבת תקשורת עם WhatsApp Cloud API (Graph API של Meta).
import { config } from './config.js';

function graphUrl() {
  const { graphVersion, phoneNumberId } = config.whatsapp;
  return `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
}

async function postToGraph(payload) {
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) {
    console.warn('[whatsapp] חסר token/phoneNumberId — מדלג על שליחה:', JSON.stringify(payload));
    return { skipped: true };
  }
  const res = await fetch(graphUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[whatsapp] שליחה נכשלה ${res.status}: ${body}`);
    return { error: true, status: res.status };
  }
  return res.json();
}

// שליחת הודעת טקסט.
export async function sendText(to, text) {
  return postToGraph({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
}

// שליחת הודעה עם כפתורי בחירה (עד 3). buttons = [{ id, title }].
// כותרת כפתור מוגבלת ל-20 תווים; גוף ההודעה עד 1024 תווים.
export async function sendButtons(to, bodyText, buttons) {
  const trimmed = (bodyText || ' ').slice(0, 1024) || ' ';
  return postToGraph({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: trimmed },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

// ריאקציית אימוג'י על הודעה קיימת (אישור שקט).
export async function sendReaction(to, messageId, emoji) {
  return postToGraph({
    messaging_product: 'whatsapp',
    to,
    type: 'reaction',
    reaction: { message_id: messageId, emoji },
  });
}

// סימון הודעה כ"נקראה" (וי כחול) — נחמד אך לא חובה.
export async function markAsRead(messageId) {
  if (!config.whatsapp.token || !config.whatsapp.phoneNumberId) return { skipped: true };
  const res = await fetch(graphUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });
  if (!res.ok) {
    console.error('[whatsapp] markAsRead נכשל:', res.status);
  }
  return res.ok;
}
