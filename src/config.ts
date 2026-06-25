import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少環境變數 ${name}，請參考 .env.example 設定 .env`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  timezone: process.env.TIMEZONE ?? "Asia/Taipei",

  line: {
    channelAccessToken: required("LINE_CHANNEL_ACCESS_TOKEN"),
    channelSecret: required("LINE_CHANNEL_SECRET"),
  },

  gemini: {
    apiKey: required("GEMINI_API_KEY"),
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  },

  calendar: {
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "./google-credentials.json",
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "your_email@gmail.com",
    defaultDurationMin: Number(process.env.DEFAULT_DURATION_MIN ?? 60),
  },

  store: {
    name: process.env.STORE_NAME ?? "本店",
    hours: process.env.STORE_HOURS ?? "每天 10:00–20:00",
    openHour: Number(process.env.STORE_OPEN_HOUR ?? 10),
    closeHour: Number(process.env.STORE_CLOSE_HOUR ?? 20),
    address: process.env.STORE_ADDRESS ?? "",
    parking: process.env.STORE_PARKING ?? "",
    price: process.env.STORE_PRICE ?? "",
    services:
      process.env.STORE_SERVICES ??
      "聽力檢測、助聽器試戴選配、調音、保養、維修、電池更換",
    knowledge: (
      process.env.STORE_KNOWLEDGE ??
      `【助聽器類型】
- 耳內型（ITE/ITC/CIC）：較隱蔽，適合輕中度；需注意耳垢與潮濕。
- 耳掛型（BTE/RIC）：外接喇叭，功率較大、保養較易，適合各程度與長者。
- 充電式 vs 電池式：充電式每晚充飽即用，適合手指不便者；電池式（312/13 號等）體積小、需自行更換，約 3–10 天視機型與使用量。

【何時該檢查聽力 / 如何選配】
- 常聽不到別人說話、電視聲太大、電話一側聽不清、耳鳴等，建議預約聽力檢測。
- 選配需聽力圖 + 試戴 + 現場調音，依生活型態（室內/戶外/通話）選機型。
- 到店可試戴多品牌/等級，再決定是否購買。

【日常保養】
- 每日：睡前取下、擦乾、關機或開電池倉；勿戴助聽器淋浴/游泳。
- 防潮：使用乾燥盒；梅雨季勤換乾燥劑。
- 耳垢：定期清潔耳模/喇叭口，避免堵塞；耳垢多者定期回店保養。

【常見迷思 vs 事實】
- 迷思「助聽器會越戴越聾」→ 正確配戴不會加重聽損，未處理聽損反而影響溝通與認知。
- 迷思「買網路上便宜的就好」→ 需依聽力圖驗配與調音，否則效果差或太吵。
- 迷思「只有老人需要」→ 任何年齡聽損都可能受益，越早介入越好。

【台灣補助（一般資訊，勿捏造金額）】
- 健保通常不給助聽器補助或給付。
- 身心障礙、65 歲以上、原住民等另有社會福利或地方政府補助，條件與金額依當年度公文為準，請洽本店或區公所/身障資源中心。
- 本店可協助了解申請流程，實際資格以主管機關核定為準。

【轉介時機】
- 突發單耳聽力下降、劇烈耳鳴、眩暈、耳道流膿/疼痛 → 請先就醫 ENT（耳鼻喉科）。
- 聽力檢測、助聽器選配與調音 → 聽力所/本店 audiologist（聽力師）。
- 助聽器故障排除後仍異常 → 請回店檢查或預約維修。`
    ).replace(/\\n/g, "\n"),
  },
};

export type AppConfig = typeof config;
