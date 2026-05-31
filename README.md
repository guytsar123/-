# 🛒 WhatsApp Shopping Bot

בוט וואטסאפ לרשימת קניות חכמה בעברית. מוסיף פריטים מטקסט חופשי, ממזג כפילויות,
ובפקודה `לסופר` מסדר את הרשימה לפי מחלקות הסופר — מופעל ע"י Claude.

## איך זה עובד
- **WhatsApp Cloud API** (רשמי, חינמי לנפח אישי, 1:1) מקבל ושולח הודעות.
- **Claude Haiku** מפענח עברית חופשית ("נזכרתי שצריך חלב ו-2 ביצים") למבנה פריטים.
- **מסווג קטגוריות** מבוסס מילון עברי + נפילה ל-LLM שלומד ושומר.
- **אחסון** בקבצי JSON.

## הרצה מהירה
```bash
npm install
cp .env.example .env   # מלא ערכים — ראה SETUP.md
npm start
```

## בדיקה מקומית ללא וואטסאפ
```bash
node scripts/simulate.js                 # תרחיש לדוגמה
node scripts/simulate.js "צריך חלב ולחם" # הודעה בודדת
```
(עובד גם בלי מפתח API — במצב גיבוי regex.)

## מבנה
```
src/
  index.js       שרת webhook + אימות חתימה
  whatsapp.js    שליחה/ריאקציה ל-Cloud API
  claude.js      פענוח עברית + סיווג (עם גיבוי regex)
  handler.js     תזמור הכוונות → תשובות
  list.js        לוגיקת רשימה (הוספה/מיזוג/הסרה/סידור)
  categories.js  טקסונומיית סופר ישראלי + מילון
  hebrew.js      נירמול עברית (קידומות/רבים/אותיות סופיות)
  storage.js     אחסון JSON
  config.js      טעינת .env
scripts/simulate.js  בדיקה מקומית
```

הקמה מלאה: ראה **[SETUP.md](SETUP.md)**.
