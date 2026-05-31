// המוח של הבוט: מקבל טקסט נכנס, מפענח כוונה, מעדכן את הרשימה,
// ומחזיר { reply, react } — טקסט לשליחה ו/או אימוג'י לריאקציה על הודעת המשתמש.
import { parseMessage } from './claude.js';
import {
  addItems, removeItems, markBought, clearList, clearBought,
  renderSimpleList, compileList, getActiveItems,
} from './list.js';

const HELP_TEXT = `🛒 *הבוט לרשימת קניות* — מה אפשר לעשות:

• *להוסיף*: פשוט כתוב מה צריך — "חלב, לחם ו-2 ביצים" או "נזכרתי שנגמר הקפה"
• *להסיר*: "תוריד חלב"
• *סימון שנקנה*: "קניתי ביצים"
• *להציג רשימה*: "רשימה"
• *לסדר לסופר*: "לסופר" — מארגן הכל לפי מחלקות הסופר
• *לנקות*: "נקה" (יבקש אישור)

טיפ: אפשר לשלוח כמה פריטים בהודעה אחת.`;

// אישור מחיקה ממתין (בזיכרון; מספיק למשתמש יחיד). תקף ל-2 דקות.
let pendingClear = null; // { ts }

const CLEAR_TTL_MS = 2 * 60 * 1000;

function isYes(text) {
  return /^(כן|אישור|בטוח|נקה|yes|y)\b/i.test(text.trim());
}

function joinList(arr) {
  return arr.join(', ');
}

export async function handleMessage(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { reply: null, react: null };

  // טיפול באישור מחיקה ממתין
  if (pendingClear) {
    if (Date.now() - pendingClear.ts > CLEAR_TTL_MS) {
      pendingClear = null; // פג תוקף — ממשיכים כרגיל
    } else if (isYes(trimmed)) {
      const count = clearList();
      pendingClear = null;
      return { reply: `🗑️ נוקתה הרשימה (${count} פריטים הוסרו).`, react: null };
    } else {
      pendingClear = null;
      return { reply: 'ביטלתי את הניקוי. הרשימה נשארה כמו שהיא.', react: null };
    }
  }

  const intent = await parseMessage(trimmed);

  switch (intent.action) {
    case 'add': {
      if (!intent.items.length) return { reply: null, react: '🤔' };
      const { added, merged } = addItems(intent.items);
      if (added.length && merged.length) {
        return { reply: `✅ נוסף: ${joinList(added)}\n♻️ כבר היה ברשימה: ${joinList(merged)}`, react: null };
      }
      if (merged.length && !added.length) {
        return { reply: `♻️ כבר ברשימה: ${joinList(merged)}`, react: null };
      }
      // הוספה רגילה — אישור טקסט קצר (אמין יותר מריאקציה, שתלויה במזהה הודעה תקין).
      return { reply: `✅ נוסף: ${joinList(added)}`, react: null };
    }

    case 'remove': {
      if (!intent.items.length) return { reply: 'מה להסיר?', react: null };
      const { removed, notFound } = removeItems(intent.items);
      let reply = '';
      if (removed.length) reply += `🗑️ הסרתי: ${joinList(removed)}`;
      if (notFound.length) reply += (reply ? '\n' : '') + `🤷 לא נמצאו: ${joinList(notFound)}`;
      return { reply: reply || 'לא נמצא מה להסיר.', react: null };
    }

    case 'bought': {
      if (!intent.items.length) return { reply: 'מה קנית?', react: null };
      const { marked, notFound } = markBought(intent.items);
      if (marked.length && !notFound.length) return { reply: `✅ סומן כנקנה: ${joinList(marked)}`, react: null };
      let reply = '';
      if (marked.length) reply += `✅ סומן כנקנה: ${joinList(marked)}`;
      if (notFound.length) reply += (reply ? '\n' : '') + `🤷 לא ברשימה: ${joinList(notFound)}`;
      return { reply, react: null };
    }

    case 'show':
      return { reply: renderSimpleList(), react: null };

    case 'compile': {
      const reply = await compileList();
      return { reply, react: null };
    }

    case 'clear': {
      const count = getActiveItems().length;
      if (!count) return { reply: '🛒 הרשימה כבר ריקה.', react: null };
      pendingClear = { ts: Date.now() };
      return { reply: `למחוק את כל הרשימה (${count} פריטים)? כתוב "כן" לאישור.`, react: null };
    }

    case 'help':
      return { reply: HELP_TEXT, react: null };

    case 'none':
    default:
      // הודעה שלא זוהתה ככוונת קניות — רמז עדין בלבד.
      return { reply: null, react: '🤔' };
  }
}

// ייצוא לעזר בבדיקות — איפוס מצב.
export function _resetState() {
  pendingClear = null;
}

export { clearBought };
