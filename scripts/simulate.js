// בדיקה מקומית ללא וואטסאפ: מריץ רצף הודעות דרך ה-handler ומדפיס תוצאות.
// שימוש:  node scripts/simulate.js              (תרחיש לדוגמה)
//         node scripts/simulate.js "צריך חלב"   (הודעה בודדת)
import { handleMessage, _resetState } from '../src/handler.js';
import { clearList } from '../src/list.js';

const single = process.argv.slice(2).join(' ').trim();

const scenario = [
  'נזכרתי שצריך חלב ולחם',
  'תוסיף 2 ביצים וקוטג',
  'חלב',                       // כפילות — אמור להתמזג
  'גם במבה וקולה',
  'צריך נוזל כלים ונייר טואלט',
  'תוריד קולה',
  'קניתי לחם',
  'רשימה',
  'לסופר',                     // הפיצ'ר המרכזי — סידור לפי קטגוריות
];

async function run(messages) {
  for (const m of messages) {
    const { reply, react } = await handleMessage(m);
    console.log('\n👤 ' + m);
    if (react) console.log('   🤖 [ריאקציה] ' + react);
    if (reply) console.log('   🤖 ' + reply.replace(/\n/g, '\n      '));
    if (!react && !reply) console.log('   🤖 (אין תגובה)');
  }
}

(async () => {
  _resetState();
  clearList(); // מתחילים מרשימה נקייה
  if (single) {
    await run([single]);
  } else {
    console.log('=== תרחיש סימולציה ===');
    await run(scenario);
  }
  console.log('\n=== סיום ===');
})();
