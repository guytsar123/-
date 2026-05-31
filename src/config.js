// טוען משתני סביבה מקובץ .env (ללא תלות חיצונית) ומרכז את כל ההגדרות במקום אחד.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// פרסר .env מינימלי: קורא KEY=VALUE, מתעלם מהערות ושורות ריקות.
function loadDotEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // הסרת מרכאות עוטפות אם קיימות
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const dataDir = path.resolve(rootDir, process.env.DATA_DIR || './data');

export const config = {
  port: Number(process.env.PORT) || 3000,
  rootDir,
  dataDir,

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.PHONE_NUMBER_ID || '',
    verifyToken: process.env.VERIFY_TOKEN || '',
    appSecret: process.env.APP_SECRET || '',
    graphVersion: process.env.GRAPH_VERSION || 'v21.0',
  },

  // רק המספר הזה יורשה לדבר עם הבוט (1:1). ריק = כל אחד מורשה (לבדיקות בלבד).
  allowedNumber: (process.env.ALLOWED_NUMBER || '').replace(/[^0-9]/g, ''),

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
  },
};

// בדיקת הגדרות חיוניות — מחזיר רשימת אזהרות (לא קורס, כדי לאפשר סימולציה מקומית).
export function checkConfig() {
  const warnings = [];
  if (!config.whatsapp.token) warnings.push('WHATSAPP_TOKEN חסר — שליחת הודעות לוואטסאפ לא תעבוד.');
  if (!config.whatsapp.phoneNumberId) warnings.push('PHONE_NUMBER_ID חסר — שליחת הודעות לוואטסאפ לא תעבוד.');
  if (!config.whatsapp.verifyToken) warnings.push('VERIFY_TOKEN חסר — אימות ה-webhook מול Meta ייכשל.');
  if (!config.whatsapp.appSecret) warnings.push('APP_SECRET חסר — אימות חתימת ההודעות מבוטל (לא מאובטח).');
  if (!config.anthropic.apiKey) warnings.push('ANTHROPIC_API_KEY חסר — פענוח העברית יעבוד במצב גיבוי (regex) בלבד.');
  return warnings;
}
