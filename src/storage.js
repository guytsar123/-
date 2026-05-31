// שכבת אחסון פשוטה מבוססת קבצי JSON. עובד מקומית ועל דיסק קבוע ב-Render.
// שני מאגרים: הרשימה הנוכחית (list.json) ומילון הקטגוריות הנלמד (dictionary.json).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

function ensureDir() {
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
}

function readJson(file, fallback) {
  try {
    const full = path.join(config.dataDir, file);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    console.error(`שגיאה בקריאת ${file}:`, err.message);
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  const full = path.join(config.dataDir, file);
  const json = JSON.stringify(data, null, 2);
  // ניסיון כתיבה אטומית (tmp → rename). בטוח מפני השחתה, אך עלול להיכשל ב-EPERM
  // בתיקיות מסונכרנות (OneDrive/Dropbox) שנועלות את קובץ היעד. במקרה כזה נופלים
  // לכתיבה ישירה עם מספר ניסיונות.
  const tmp = full + '.tmp';
  try {
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, full);
    return;
  } catch (err) {
    try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch { /* התעלם */ }
    if (err.code !== 'EPERM' && err.code !== 'EACCES' && err.code !== 'EBUSY') throw err;
  }
  // גיבוי: כתיבה ישירה עם ניסיונות חוזרים (OneDrive עשוי לנעול לרגע).
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      fs.writeFileSync(full, json, 'utf8');
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// ===== הרשימה =====
// מבנה פריט: { name, qty, unit, addedBy, bought, ts }
export function loadList() {
  return readJson('list.json', { items: [] });
}

export function saveList(list) {
  writeJson('list.json', list);
}

// ===== מילון הקטגוריות הנלמד =====
// מבנה: { "מפתח-מנורמל": "שם קטגוריה" }
export function loadLearnedDict() {
  return readJson('dictionary.json', {});
}

export function saveLearnedDict(dict) {
  writeJson('dictionary.json', dict);
}

// ===== פריטים קבועים (staples) =====
// רשימת פריטים שחוזרים כל שבוע. מבנה: { items: [{name, qty, unit}] }
export function loadStaples() {
  return readJson('staples.json', { items: [] });
}

export function saveStaples(staples) {
  writeJson('staples.json', staples);
}
