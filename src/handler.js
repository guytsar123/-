// המוח של הבוט: מקבל טקסט נכנס, מפענח כוונה, מעדכן את הרשימה,
// ומחזיר { reply, react, buttons } — טקסט/ריאקציה/כפתורים לשליחה.
import { parseMessage } from './claude.js';
import {
  addItems, removeItems, markBought, clearList, clearBought,
  renderSimpleList, compileList, getActiveItems,
  addStaples, removeStaples, getStaples, applyStaples, renderStaples,
} from './list.js';

// ===== כפתורים (id קבועים שמזוהים בעת לחיצה) =====
const BTN = {
  show:    { id: 'cmd_show',    title: '📋 הצג רשימה' },
  compile: { id: 'cmd_compile', title: '🛒 לסופר' },
  finish:  { id: 'cmd_finish',  title: '✅ סיימתי קניות' },
  staples: { id: 'cmd_staples', title: '⭐ הוסף קבועים' },
  help:    { id: 'cmd_help',    title: '❓ עזרה' },
  clearYes:{ id: 'cmd_clear_yes', title: 'כן, אפס' },
  clearNo: { id: 'cmd_clear_no',  title: 'לא, בטל' },
};

const HELP_TEXT = `🛒 *הבוט לרשימת קניות* — מה אפשר לעשות:

• *להוסיף*: פשוט כתוב מה צריך — "חלב, לחם ו-2 ביצים" או "נזכרתי שנגמר הקפה"
• *להסיר*: "תוריד חלב"
• *סימון שנקנה*: "קניתי ביצים"
• *להציג רשימה*: "רשימה"
• *לסדר לסופר*: "לסופר" — מארגן הכל לפי מחלקות הסופר
• *פריטים קבועים*: "קבועים" — מוסיף את מה שתמיד צריך. להגדרה: "הוסף לקבועים חלב, לחם"
• *סיום קניה*: "סיימתי קניות" — מאפס את הרשימה לשבוע הבא

טיפ: אפשר לשלוח כמה פריטים בהודעה אחת.`;

// אישור מחיקה ממתין (בזיכרון; מספיק למשתמש יחיד). תקף ל-2 דקות.
let pendingClear = null; // { ts }
const CLEAR_TTL_MS = 2 * 60 * 1000;

function isYes(text) {
  // הערה: לא משתמשים ב-\b כי הוא לא עובד עם עברית. בודקים שההודעה מתחילה במילת אישור
  // ואחריה סוף-מחרוזת או תו שאינו אות (רווח/סימן פיסוק), כדי לא לתפוס "כנראה" וכד'.
  return /^(כן|אישור|בטוח|נקה|אפס|yes|y|ok)([^א-תa-z].*)?$/i.test(text.trim());
}

function joinList(arr) {
  return arr.join(', ');
}

// פיצול טקסט לפריטים (לפקודות קבועים — בלי קריאת LLM).
function splitItems(body) {
  return body
    .split(/,|\n|\bוגם\b|\bו-|\s+ו(?=[א-ת])/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(\d+)\s+(.*)$/);
      if (m) return { name: m[2].trim(), qty: Number(m[1]), unit: null };
      return { name: p, qty: null, unit: null };
    });
}

// זיהוי פקודות "קבועים" לפני פנייה ל-LLM (כדי שלא יתפרשו כהוספה רגילה).
// מחזיר אובייקט פעולה או null.
function detectStaplesCommand(t) {
  const low = t.toLowerCase();

  // הוספה/הסרה לקבועים
  let m = t.match(/^(?:הוסף|תוסיף|הוסיפי|תוסיפי)\s+(?:ל)?קבוע(?:ים)?:?\s+(.+)/);
  if (m) return { kind: 'staples_add', body: m[1] };
  m = t.match(/^(?:הסר|תוריד|הורד)\s+(?:מ(?:ה)?)?קבוע(?:ים)?:?\s+(.+)/);
  if (m) return { kind: 'staples_remove', body: m[1] };

  // הצגת הקבועים
  if (/^(?:מה ה?קבועים|ה?קבועים שלי|רשימת קבועים|הצג קבועים|תראה קבועים)\s*[?!.]*$/.test(t)) {
    return { kind: 'staples_show' };
  }
  // הפעלה: "קבועים" לבד → הוסף את כל הקבועים לרשימה
  if (/^\s*קבועים\s*[?!.]*$/.test(t)) return { kind: 'staples_apply' };

  return null;
}

// זיהוי ברכת פתיחה.
function isGreeting(t) {
  return /^(היי|הי|שלום|הלו|אהלן|בוקר טוב|ערב טוב|מה נשמע|מה קורה|hi|hello|hey)\s*[?!.]*$/i.test(t.trim());
}

// ===== טיפול בלחיצת כפתור (מגיע כ-"BTN:<id>") =====
async function handleButton(id) {
  switch (id) {
    case 'cmd_show':    return doShow();
    case 'cmd_compile': return doCompile();
    case 'cmd_finish':  return doClearPrompt();
    case 'cmd_staples': return doApplyStaples();
    case 'cmd_help':    return { reply: HELP_TEXT, buttons: [BTN.show, BTN.compile, BTN.staples] };
    case 'cmd_clear_yes': {
      const count = clearList();
      pendingClear = null;
      return { reply: `✨ הרשימה אופסה (${count} פריטים הוסרו). מתחילים שבוע חדש! 🛒`, buttons: [BTN.staples] };
    }
    case 'cmd_clear_no':
      pendingClear = null;
      return { reply: 'ביטלתי 👍 הרשימה נשארה כמו שהיא.' };
    default:
      return { reply: null };
  }
}

// ===== פעולות משותפות =====
function doShow() {
  const items = getActiveItems();
  if (!items.length) return { reply: '🛒 הרשימה ריקה כרגע.', buttons: [BTN.staples] };
  return { reply: renderSimpleList(), buttons: [BTN.compile, BTN.finish] };
}

async function doCompile() {
  let reply = await compileList();
  if (getActiveItems().length) {
    return { reply, buttons: [BTN.finish] };
  }
  return { reply };
}

function doClearPrompt() {
  const count = getActiveItems().length;
  if (!count) return { reply: '🛒 הרשימה כבר ריקה — אפשר להתחיל להוסיף לשבוע הבא. 🙂', buttons: [BTN.staples] };
  pendingClear = { ts: Date.now() };
  return { reply: `🛒 לאפס את כל הרשימה (${count} פריטים) ולהתחיל מחדש?`, buttons: [BTN.clearYes, BTN.clearNo] };
}

function doApplyStaples() {
  const { added, merged, empty } = applyStaples();
  if (empty) {
    return { reply: '⭐ אין לך עדיין פריטים קבועים.\nכדי להגדיר, כתוב למשל:\n"הוסף לקבועים חלב, לחם, ביצים, קפה"' };
  }
  let reply;
  if (added.length) reply = `⭐ הוספתי את הקבועים: ${joinList(added)}`;
  else reply = '⭐ כל הקבועים כבר נמצאים ברשימה.';
  if (merged.length) reply += `\n(כבר היו: ${joinList(merged)})`;
  return { reply, buttons: [BTN.show, BTN.compile] };
}

export async function handleMessage(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { reply: null, react: null };

  // לחיצת כפתור
  if (trimmed.startsWith('BTN:')) {
    return handleButton(trimmed.slice(4));
  }

  // טיפול באישור מחיקה ממתין (כשהמשתמש עונה בטקסט במקום בכפתור)
  if (pendingClear) {
    if (Date.now() - pendingClear.ts > CLEAR_TTL_MS) {
      pendingClear = null; // פג תוקף — ממשיכים כרגיל
    } else if (isYes(trimmed)) {
      const count = clearList();
      pendingClear = null;
      return { reply: `✨ הרשימה אופסה (${count} פריטים הוסרו). מתחילים שבוע חדש! 🛒`, buttons: [BTN.staples] };
    } else {
      pendingClear = null;
      return { reply: 'ביטלתי 👍 הרשימה נשארה כמו שהיא.' };
    }
  }

  // ברכת פתיחה → הודעת קבלת פנים עם כפתורים
  if (isGreeting(trimmed)) {
    const n = getActiveItems().length;
    const status = n ? `\n\nכרגע יש ${n} פריטים ברשימה.` : '';
    return {
      reply: `שלום! 👋 אני בוט רשימת הקניות שלך.\nפשוט כתוב לי מה צריך ואוסיף.${status}`,
      buttons: [BTN.show, BTN.compile, BTN.staples],
    };
  }

  // פקודות "קבועים" — לפני LLM
  const staplesCmd = detectStaplesCommand(trimmed);
  if (staplesCmd) {
    switch (staplesCmd.kind) {
      case 'staples_add': {
        const added = addStaples(splitItems(staplesCmd.body));
        return { reply: added.length ? `⭐ נוסף לקבועים: ${joinList(added)}` : 'כל אלה כבר בקבועים 🙂', buttons: [BTN.staples] };
      }
      case 'staples_remove': {
        const removed = removeStaples(splitItems(staplesCmd.body));
        return { reply: removed.length ? `🗑️ הוסר מהקבועים: ${joinList(removed)}` : 'לא נמצא בקבועים.' };
      }
      case 'staples_show':
        return { reply: renderStaples() };
      case 'staples_apply':
        return doApplyStaples();
    }
  }

  const intent = await parseMessage(trimmed);

  switch (intent.action) {
    case 'add': {
      if (!intent.items.length) return { reply: null, react: '🤔' };
      const { added, merged } = addItems(intent.items);
      if (added.length && merged.length) {
        return { reply: `✅ נוסף: ${joinList(added)}\n♻️ כבר היה ברשימה: ${joinList(merged)}` };
      }
      if (merged.length && !added.length) {
        return { reply: `♻️ כבר ברשימה: ${joinList(merged)}` };
      }
      return { reply: `✅ נוסף: ${joinList(added)}` };
    }

    case 'remove': {
      if (!intent.items.length) return { reply: 'מה להסיר?' };
      const { removed, notFound } = removeItems(intent.items);
      let reply = '';
      if (removed.length) reply += `🗑️ הסרתי: ${joinList(removed)}`;
      if (notFound.length) reply += (reply ? '\n' : '') + `🤷 לא נמצאו: ${joinList(notFound)}`;
      return { reply: reply || 'לא נמצא מה להסיר.' };
    }

    case 'bought': {
      if (!intent.items.length) return { reply: 'מה קנית?' };
      const { marked, notFound } = markBought(intent.items);
      let reply = '';
      if (marked.length) reply += `✅ סומן כנקנה: ${joinList(marked)}`;
      if (notFound.length) reply += (reply ? '\n' : '') + `🤷 לא ברשימה: ${joinList(notFound)}`;
      return { reply: reply || 'לא נמצא.' };
    }

    case 'show':
      return doShow();

    case 'compile':
      return doCompile();

    case 'clear':
      return doClearPrompt();

    case 'help':
      return { reply: HELP_TEXT, buttons: [BTN.show, BTN.compile, BTN.staples] };

    case 'none':
    default:
      return { reply: null, react: '🤔' };
  }
}

// ייצוא לעזר בבדיקות — איפוס מצב.
export function _resetState() {
  pendingClear = null;
}

export { clearBought };
