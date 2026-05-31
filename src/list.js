// לוגיקת רשימת הקניות: הוספה/מיזוג/הסרה/סימון/תצוגה/סידור לפי קטגוריות.
import { loadList, saveList, loadStaples, saveStaples } from './storage.js';
import { cleanDisplay, sameItem } from './hebrew.js';
import { classifyLocal, rememberCategory, categoryMeta, CATEGORY_ORDER } from './categories.js';
import { classifyItems } from './claude.js';

// פורמט תצוגה של כמות/יחידה ליד שם הפריט.
function formatQty(item) {
  if (item.unit && item.qty) return `${item.name} – ${item.qty} ${item.unit}`;
  if (item.qty && item.qty > 1) return `${item.name} (${item.qty})`;
  return item.name;
}

// ===== הוספה עם מיזוג כפילויות =====
export function addItems(newItems, addedBy = null) {
  const list = loadList();
  const added = [];
  const merged = [];

  for (const raw of newItems) {
    const name = cleanDisplay(raw.name);
    if (!name) continue;

    // מחפשים פריט קיים (שעוד לא נקנה) עם אותו שם מנורמל.
    const existing = list.items.find((it) => !it.bought && sameItem(it.name, name));
    if (existing) {
      // מיזוג: אם הכמות החדשה מפורשת, מעדכנים למקסימום (לא מנפחים בכפילויות סתם).
      if (raw.qty != null) {
        existing.qty = Math.max(existing.qty || 1, raw.qty);
      }
      if (raw.unit && !existing.unit) existing.unit = raw.unit;
      merged.push(existing.name);
    } else {
      list.items.push({
        name,
        qty: raw.qty != null ? raw.qty : null,
        unit: raw.unit || null,
        addedBy: addedBy || null,
        bought: false,
        ts: Date.now(),
      });
      added.push(name);
    }
  }

  saveList(list);
  return { added, merged };
}

// ===== הסרה =====
export function removeItems(targets) {
  const list = loadList();
  const removed = [];
  const notFound = [];

  for (const raw of targets) {
    const name = cleanDisplay(raw.name);
    const idx = list.items.findIndex((it) => sameItem(it.name, name));
    if (idx !== -1) {
      removed.push(list.items[idx].name);
      list.items.splice(idx, 1);
    } else {
      notFound.push(name);
    }
  }

  saveList(list);
  return { removed, notFound };
}

// ===== סימון "נקנה" =====
export function markBought(targets) {
  const list = loadList();
  const marked = [];
  const notFound = [];

  for (const raw of targets) {
    const name = cleanDisplay(raw.name);
    const item = list.items.find((it) => !it.bought && sameItem(it.name, name));
    if (item) {
      item.bought = true;
      marked.push(item.name);
    } else {
      notFound.push(name);
    }
  }

  saveList(list);
  return { marked, notFound };
}

// ===== ניקוי =====
export function clearList() {
  const list = loadList();
  const count = list.items.length;
  saveList({ items: [] });
  return count;
}

// ===== ניקוי פריטים שנקנו בלבד (אחרי קניה) =====
export function clearBought() {
  const list = loadList();
  const before = list.items.length;
  list.items = list.items.filter((it) => !it.bought);
  saveList(list);
  return before - list.items.length;
}

export function getActiveItems() {
  return loadList().items.filter((it) => !it.bought);
}

// ===== תצוגה פשוטה של הרשימה (לא מסודרת לפי קטגוריות) =====
export function renderSimpleList() {
  const items = getActiveItems();
  if (!items.length) return '🛒 הרשימה ריקה כרגע.';
  const lines = items.map((it) => `• ${formatQty(it)}`);
  return `🛒 רשימת קניות (${items.length} פריטים):\n` + lines.join('\n');
}

// ===== סידור לפי קטגוריות (הפיצ'ר המרכזי) =====
// מסווג מקומית, נופל ל-LLM לפריטים לא מוכרים, שומר את התוצאות, ומחזיר טקסט מסודר.
export async function compileList() {
  const items = getActiveItems();
  if (!items.length) return '🛒 הרשימה ריקה — אין מה לסדר.';

  // שלב 1: סיווג מקומי
  const assignment = new Map(); // name -> categoryKey
  const unknown = [];
  for (const it of items) {
    const cat = classifyLocal(it.name);
    if (cat) assignment.set(it.name, cat);
    else unknown.push(it.name);
  }

  // שלב 2: סיווג הלא-מוכרים ב-LLM (קריאה אחת מרוכזת), ושמירה למילון.
  if (unknown.length) {
    const llmMap = await classifyItems(unknown);
    for (const name of unknown) {
      const cat = llmMap[name] || 'other';
      assignment.set(name, cat);
      rememberCategory(name, cat);
    }
  }

  // שלב 3: קיבוץ לפי קטגוריה בסדר ההליכה בסופר.
  const buckets = new Map();
  for (const it of items) {
    const cat = assignment.get(it.name) || 'other';
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat).push(it);
  }

  const sections = [];
  for (const cat of CATEGORY_ORDER) {
    const bucket = buckets.get(cat.key);
    if (!bucket || !bucket.length) continue;
    const lines = bucket.map((it) => `• ${formatQty(it)}`).join('\n');
    sections.push(`${cat.emoji} *${cat.label}*\n${lines}`);
  }

  return `🛒 *רשימת קניות מסודרת* (${items.length} פריטים)\n\n` + sections.join('\n\n');
}

// ===== פריטים קבועים (staples) =====

// הוספת פריטים לרשימת הקבועים (ללא כפילויות).
export function addStaples(newItems) {
  const staples = loadStaples();
  const added = [];
  for (const raw of newItems) {
    const name = cleanDisplay(raw.name);
    if (!name) continue;
    if (staples.items.some((it) => sameItem(it.name, name))) continue;
    staples.items.push({ name, qty: raw.qty != null ? raw.qty : null, unit: raw.unit || null });
    added.push(name);
  }
  saveStaples(staples);
  return added;
}

// הסרת פריטים מרשימת הקבועים.
export function removeStaples(targets) {
  const staples = loadStaples();
  const removed = [];
  for (const raw of targets) {
    const name = cleanDisplay(raw.name);
    const idx = staples.items.findIndex((it) => sameItem(it.name, name));
    if (idx !== -1) {
      removed.push(staples.items[idx].name);
      staples.items.splice(idx, 1);
    }
  }
  saveStaples(staples);
  return removed;
}

export function getStaples() {
  return loadStaples().items;
}

// הזרקת כל הקבועים לרשימה הפעילה (עם מיזוג כפילויות).
export function applyStaples() {
  const staples = loadStaples().items;
  if (!staples.length) return { added: [], merged: [], empty: true };
  const { added, merged } = addItems(staples);
  return { added, merged, empty: false };
}

export function renderStaples() {
  const items = getStaples();
  if (!items.length) {
    return '⭐ אין לך עדיין פריטים קבועים.\nכדי להגדיר, כתוב למשל:\n"הוסף לקבועים חלב, לחם, ביצים, קפה"';
  }
  const lines = items.map((it) => `• ${formatQty(it)}`);
  return `⭐ *הפריטים הקבועים שלך* (${items.length}):\n` + lines.join('\n');
}
