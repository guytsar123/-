# הקמת בוט וואטסאפ לרשימת קניות 🛒

מדריך צעד-אחר-צעד מאפס עד בוט עובד. הבוט הוא 1:1 — רק אתה מדבר איתו במספר עסקי נפרד.

---

## שלב 0 — מה צריך מראש
- חשבון **Meta / Facebook** (יש לך ✅)
- חשבון **Anthropic** למפתח API → https://console.anthropic.com  (תפריט API Keys → Create Key)
- מספר טלפון לבדיקות: Meta נותנת **מספר בדיקה חינמי** אוטומטית, אז לא חייבים מספר אמיתי כדי להתחיל.

---

## שלב 1 — יצירת אפליקציה ב-Meta for Developers

1. היכנס ל-https://developers.facebook.com → **My Apps** → **Create App**.
2. בחר סוג אפליקציה: **Business**.
3. תן שם (למשל "Shopping Bot") והמשך.
4. במסך המוצרים, מצא **WhatsApp** → לחץ **Set up**.
5. ייווצר לך **WhatsApp Business Account** לבדיקות + **מספר בדיקה (test number)**.

---

## שלב 2 — איסוף הפרטים (Tokens)

במסך **WhatsApp → API Setup**:

| מה | איפה למצוא | שם המשתנה אצלנו |
|----|------------|------------------|
| **Temporary access token** | בראש מסך ה-API Setup (תקף 24 שעות) | `WHATSAPP_TOKEN` |
| **Phone number ID** | מתחת ל-"From", ליד מספר הבדיקה | `PHONE_NUMBER_ID` |
| **App Secret** | App Settings → Basic → App Secret (לחץ Show) | `APP_SECRET` |

> ⚠️ הטוקן הזמני מתפוגג כל 24 שעות. אחרי שהכל עובד, ניצור **טוקן קבוע** (שלב 7).

הוסף את **המספר שלך** כ-recipient בבדיקה: ב-API Setup → "To" → **Manage phone number list** → הוסף ואמת את מספר הוואטסאפ שלך (כך הבוט יוכל לשלוח אליך בזמן הבדיקות).

---

## שלב 3 — מילוי קובץ `.env`

1. העתק את `.env.example` ל-`.env`.
2. מלא את הערכים מהשלב הקודם, וגם:
   - `VERIFY_TOKEN` — **תמציא** מחרוזת סודית כלשהי (תצטרך אותה בשלב 5). למשל `my-secret-verify-123`.
   - `ANTHROPIC_API_KEY` — המפתח מ-console.anthropic.com.
   - `ALLOWED_NUMBER` — מספר הוואטסאפ שלך בפורמט בינלאומי בלי + ובלי רווחים (למשל `9725XXXXXXXX`). כך רק אתה תוכל להשתמש בבוט.

---

## שלב 4 — הרצה מקומית + חשיפה לאינטרנט

Meta צריכה כתובת **HTTPS ציבורית** כדי לשלוח אליה webhook. לבדיקה מקומית נשתמש ב-tunnel:

```powershell
# טרמינל 1 — הרצת הבוט
npm install
npm start
```

```powershell
# טרמינל 2 — חשיפת הפורט (אפשרות חינמית: ngrok / cloudflared)
ngrok http 3000
```

קבל מ-ngrok כתובת כמו `https://abc123.ngrok-free.app`. ה-webhook יהיה `https://abc123.ngrok-free.app/webhook`.

> בענן (Render) אין צורך ב-tunnel — הכתובת כבר ציבורית. ראה שלב 8.

---

## שלב 5 — חיבור ה-Webhook ב-Meta

במסך **WhatsApp → Configuration → Webhook**:

1. **Callback URL**: הדבק את כתובת ה-`/webhook` שלך (מ-ngrok או מ-Render).
2. **Verify token**: הדבק את אותו `VERIFY_TOKEN` שהמצאת ב-`.env`.
3. לחץ **Verify and save** — אם הבוט רץ, האימות יעבור (בלוג תראה "אומת בהצלחה מול Meta").
4. תחת **Webhook fields** → לחץ **Manage** → סמן **messages** (Subscribe).

---

## שלב 6 — בדיקה!

שלח הודעת וואטסאפ מהמספר שלך אל **מספר הבדיקה** של Meta. למשל:

- `נזכרתי שצריך חלב ולחם` → הבוט יסמן 👍
- `תוסיף 2 ביצים וקוטג'`
- `רשימה` → יציג את הרשימה
- `לסופר` → יחזיר רשימה מסודרת לפי מחלקות הסופר 🎉

---

## שלב 7 — טוקן קבוע (אחרי שהכל עובד)

הטוקן מהשלב 2 מתפוגג. ליצירת טוקן קבוע:

1. https://business.facebook.com → **Settings** → **Users** → **System Users** → צור System User (Admin).
2. הקצה לו את האפליקציה והרשאת `whatsapp_business_messaging`.
3. **Generate token** → בחר את האפליקציה → סמן `whatsapp_business_messaging` ו-`whatsapp_business_management` → צור.
4. החלף את `WHATSAPP_TOKEN` בטוקן הקבוע.

---

## שלב 8 — פריסה ל-Render

1. דחוף את הפרויקט ל-GitHub.
2. ב-Render → **New** → **Blueprint** → בחר את ה-repo (יזהה את `render.yaml`).
3. מלא את משתני הסביבה (אותם ערכים מ-`.env`).
4. אחרי הפריסה תקבל כתובת כמו `https://whatsapp-shopping-bot.onrender.com` — השתמש ב-`.../webhook` שלה בשלב 5.

> 💾 **חשוב לגבי שמירת נתונים:** ב-`render.yaml` מוגדר דיסק קבוע (`plan: starter`, בתשלום) כדי שהרשימה לא תימחק. אם תרצה להישאר ב-free — הרשימה תתאפס בכל deploy/השבתה. אפשר לעבור לאחסון חיצוני חינמי (Upstash Redis) בהמשך אם תרצה.

---

## פקודות הבוט (מה אפשר לכתוב לו)

| מה תכתוב | מה יקרה |
|----------|---------|
| `חלב, לחם ו-2 ביצים` | מוסיף פריטים (כמה בבת אחת) |
| `נזכרתי שנגמר הקפה` | מוסיף קפה |
| `תוריד חלב` | מסיר מהרשימה |
| `קניתי ביצים` | מסמן כנקנה |
| `רשימה` | מציג את הרשימה |
| `לסופר` | מסדר לפי מחלקות הסופר |
| `נקה` | מנקה את הרשימה (עם אישור) |
| `עזרה` | מציג את ההסבר |
