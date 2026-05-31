// כלי עזר לנירמול עברית — חיוני לזיהוי כפילויות ולהתאמה בעת הסרת פריט.
// המטרה: ש-"החלב", "חלב", "לחלב" ו-"חלבים" יזוהו כאותו פריט.

// המרת אותיות סופיות לאותיות רגילות (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ).
const FINAL_LETTERS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

function unifyFinals(s) {
  return s.replace(/[ךםןףץ]/g, (ch) => FINAL_LETTERS[ch] || ch);
}

// הסרת ניקוד וגרשיים/מרכאות (כמו ב"ק\"ג" או "ג'בטה").
function stripMarks(s) {
  return s
    .replace(/[֑-ׇ]/g, '') // טעמים וניקוד
    .replace(/["'`]/g, '');
}

// קידומות נפוצות שמודבקות למילה (ו, ה, ב, ל, כ, מ, ש). מסירים שכבה אחת בזהירות.
const PREFIXES = ['ו', 'ה', 'ב', 'ל', 'כ', 'מ', 'ש'];

function stripPrefix(word) {
  // לא מסירים אם המילה קצרה מדי (כדי לא להרוס מילים בנות אות-שתיים)
  if (word.length <= 3) return word;
  if (PREFIXES.includes(word[0])) {
    return word.slice(1);
  }
  return word;
}

// הסרת סיומת רבים נפוצה (ים / ות) לצורך התאמה גסה.
function stripPlural(word) {
  if (word.length > 4 && word.endsWith('ים')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('ות')) return word.slice(0, -2);
  return word;
}

// מפתח נירמול אגרסיבי לצורך *התאמה* בלבד (לא לתצוגה).
// מחזיר צורה קנונית להשוואה בין פריטים.
export function normalizeKey(text) {
  if (!text) return '';
  let s = String(text).trim().toLowerCase();
  s = stripMarks(s);
  s = unifyFinals(s);
  // מסירים תווים שאינם עברית/לטינית/ספרה לרווח
  s = s.replace(/[^א-ת0-9a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = s.split(' ').map((w) => stripPlural(stripPrefix(w)));
  return words.join(' ').trim();
}

// ניקוי קל לתצוגה — שומר על הצורה המקורית אבל מסדר רווחים.
export function cleanDisplay(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

// בדיקה אם שני שמות פריטים מתייחסים לאותו דבר.
export function sameItem(a, b) {
  const ka = normalizeKey(a);
  const kb = normalizeKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}
