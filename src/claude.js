// פענוח הודעות עברית חופשיות באמצעות Claude, וסיווג פריטים לקטגוריות.
// אם אין מפתח API — נופלים לפרסר regex פשוט כדי לאפשר בדיקות מקומיות.
import { config } from './config.js';
import { CATEGORY_ORDER } from './categories.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

// קריאה גנרית ל-Claude. system יכול להיות מטמון (prompt caching) לחיסכון.
async function callClaude({ system, userText, maxTokens = 400 }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.anthropic.model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body}`);
  }
  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

// חילוץ אובייקט JSON ראשון מתוך טקסט (גם אם יש טקסט עוטף).
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ===== פענוח הודעה לכוונה מובנית =====
const PARSE_SYSTEM = `אתה מנתח הודעות בעברית עבור בוט רשימת קניות בוואטסאפ.
המשתמש כותב הודעות חופשיות. החזר JSON בלבד, ללא טקסט נוסף, במבנה:
{
  "action": "add" | "remove" | "bought" | "show" | "compile" | "clear" | "help" | "none",
  "items": [ { "name": "שם הפריט בצורת יחיד ונקייה", "qty": מספר או null, "unit": "יחידה או null" } ]
}

כללים:
- "add": המשתמש רוצה להוסיף מוצרים (למשל "צריך חלב", "נגמר הקפה", "תוסיף 2 לחמים", "נזכרתי שאין סוכר"). חלץ את כל המוצרים.
- "remove": המשתמש רוצה להסיר מהרשימה ("תוריד חלב", "לא צריך יותר עגבניות").
- "bought": המשתמש קנה פריט ("קניתי חלב", "כבר לקחתי ביצים").
- "show": בקשה לראות את הרשימה ("מה ברשימה", "תראה לי את הרשימה").
- "compile": בקשה לסדר/לתכלל את הרשימה לפי קטגוריות לקראת קניה ("לסופר", "סדר את הרשימה", "אני הולך לסופר").
- "clear": בקשה לנקות/לאפס את כל הרשימה, בדרך כלל בסיום קניה כדי להתחיל שבוע חדש ("נקה את הרשימה", "סיימנו קניות", "סיימתי קניות", "סיימתי לקנות", "התחל מחדש", "רשימה חדשה", "אפס").
- "help": בקשת עזרה/הסבר.
- "none": ההודעה אינה קשורה לקניות.
- שם הפריט: צורת יחיד נקייה ללא קידומות מיותרות (למשל "ביצים"→"ביצים" זה תקין, אבל "החלב"→"חלב"). שמור מותגים אם צוינו.
- qty: אם צוינה כמות מספרית. unit: יחידת מידה אם צוינה (קילו, ק"ג, חבילה, בקבוק, ליטר וכו').
- אם יש כמה פריטים בהודעה אחת — החזר את כולם במערך items.`;

export async function parseMessage(text) {
  if (!config.anthropic.apiKey) return fallbackParse(text);
  try {
    const out = await callClaude({ system: PARSE_SYSTEM, userText: text, maxTokens: 500 });
    const json = extractJson(out);
    if (!json || !json.action) return fallbackParse(text);
    if (!Array.isArray(json.items)) json.items = [];
    // ניקוי בסיסי
    json.items = json.items
      .filter((it) => it && it.name && String(it.name).trim())
      .map((it) => ({
        name: String(it.name).trim(),
        qty: it.qty != null && !Number.isNaN(Number(it.qty)) ? Number(it.qty) : null,
        unit: it.unit ? String(it.unit).trim() : null,
      }));
    return json;
  } catch (err) {
    console.error('parseMessage נכשל, עובר ל-fallback:', err.message);
    return fallbackParse(text);
  }
}

// ===== סיווג פריטים לא-מוכרים לקטגוריות =====
const CATEGORY_LIST = CATEGORY_ORDER.map((c) => `${c.key} (${c.label})`).join(', ');
const CLASSIFY_SYSTEM = `אתה מסווג מוצרי מכולת לקטגוריות של סופר ישראלי.
הקטגוריות האפשריות (החזר את ה-key באנגלית בלבד): ${CATEGORY_LIST}.
תקבל רשימת מוצרים בעברית. החזר JSON בלבד במבנה: { "שם המוצר": "category_key", ... }.
אם אינך בטוח, החזר "other".`;

// מקבל מערך שמות → מחזיר אובייקט { name: categoryKey }.
export async function classifyItems(names) {
  if (!names.length) return {};
  if (!config.anthropic.apiKey) {
    const map = {};
    for (const n of names) map[n] = 'other';
    return map;
  }
  try {
    const out = await callClaude({
      system: CLASSIFY_SYSTEM,
      userText: 'מוצרים לסיווג:\n' + names.map((n) => `- ${n}`).join('\n'),
      maxTokens: 600,
    });
    const json = extractJson(out) || {};
    const map = {};
    for (const n of names) map[n] = json[n] || 'other';
    return map;
  } catch (err) {
    console.error('classifyItems נכשל:', err.message);
    const map = {};
    for (const n of names) map[n] = 'other';
    return map;
  }
}

// ===== פרסר גיבוי (ללא LLM) =====
// מזהה פקודות לפי מילות מפתch, אחרת מתייחס להודעה כהוספת פריטים.
function fallbackParse(text) {
  const t = (text || '').trim();
  const low = t.toLowerCase();

  const has = (...words) => words.some((w) => low.includes(w));

  // הערה: לא משתמשים ב-\b כי הוא לא עובד עם עברית; בודקים התאמה מלאה למילה "רשימה".
  if (/^\s*רשימה\s*[?!.]*$/.test(t) || has('מה ברשימה', 'מה יש ברשימה', 'תראה לי', 'הצג את הרשימה', 'הרשימה שלי')) return { action: 'show', items: [] };
  if (has('לסופר', 'סדר את', 'תסדר', 'הולך לסופר', 'תכלל', 'לקניות')) return { action: 'compile', items: [] };
  if (has('נקה', 'מחק הכל', 'סיימנו קניות', 'סיימתי קניות', 'סיימתי לקנות', 'התחל מחדש', 'רשימה חדשה', 'אפס')) return { action: 'clear', items: [] };
  if (/^\s*סיימתי\s*[?!.]*$/.test(t)) return { action: 'clear', items: [] };
  if (has('עזרה', 'help', 'מה אתה יודע', 'פקודות')) return { action: 'help', items: [] };

  let action = 'add';
  let body = t;
  if (has('תוריד', 'הסר', 'מחק ', 'לא צריך')) {
    action = 'remove';
    body = t.replace(/^(תוריד|הסר|מחק|לא צריך( יותר)?)\s*/i, '');
  } else if (has('קניתי', 'לקחתי', 'כבר יש')) {
    action = 'bought';
    body = t.replace(/^(קניתי|לקחתי|כבר יש)\s*/i, '');
  } else {
    // הסרת פתיחים נפוצים בלולאה: "נזכרתי שצריך..." → מסיר גם "נזכרתי ש" וגם "צריך".
    // הערה: \s* (ולא \s+) כי "נזכרתי שצריך" אין בו רווח בין "ש" ל-"צריך".
    const fillers = /^(בא לי|אני צריך|צריך|תוסיפי|תוסיף|הוסף|נגמרו|נגמר|נזכרתי ש?|אין לנו|אין|חסרים|חסר|וגם|גם|עוד)\s*/i;
    let prev;
    do { prev = body; body = body.replace(fillers, ''); } while (body !== prev && body);
  }

  // פיצול לפי פסיק / שורה חדשה / "וגם" / "ו-" / רווח+ו' חיבור לפני מילה (היוריסטיקה לגיבוי).
  const parts = body
    .split(/,|\n|\bוגם\b|\bו-|\s+ו(?=[א-ת])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items = parts.map((p) => {
    // חילוץ כמות בתחילת המחרוזת (למשל "2 לחמים")
    const m = p.match(/^(\d+)\s+(.*)$/);
    if (m) return { name: m[2].trim(), qty: Number(m[1]), unit: null };
    return { name: p, qty: null, unit: null };
  });

  return { action, items };
}
