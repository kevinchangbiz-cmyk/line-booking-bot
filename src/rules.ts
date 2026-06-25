import { config } from "./config.js";
import type { ParsedMessage } from "./types.js";

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function todayInTaipei(): { y: string; m: string; d: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-");
  return { y, m, d };
}

function addDays(base: { y: string; m: string; d: string }, days: number): string {
  const dt = new Date(`${base.y}-${base.m}-${base.d}T12:00:00+08:00`);
  dt.setDate(dt.getDate() + days);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(dt);
}

function parseChineseNumber(raw: string): number | null {
  const s = raw.trim();
  if (/^\d{1,2}$/.test(s)) return Number(s);

  const digit: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    兩: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (s === "十") return 10;
  if (s.startsWith("十") && s.length === 2) return 10 + (digit[s[1]] ?? 0);
  if (s.endsWith("十") && s.length === 2) return (digit[s[0]] ?? 0) * 10;
  if (s.length === 3 && s[1] === "十") return (digit[s[0]] ?? 0) * 10 + (digit[s[2]] ?? 0);
  return digit[s] ?? null;
}

function parseDate(text: string): string | null {
  const base = todayInTaipei();
  if (/今天|今日/.test(text)) return `${base.y}-${base.m}-${base.d}`;
  if (/明天|明日/.test(text)) return addDays(base, 1);
  if (/後天|后天/.test(text)) return addDays(base, 2);
  if (/大後天|大后天/.test(text)) return addDays(base, 3);
  const m = text.match(/(\d{1,2})\s*[\/\-月]\s*(\d{1,2})\s*[日號]?/);
  if (m) return `${base.y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  return null;
}

function parseTime(text: string): { h: number; min: number } | null {
  const colon = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (colon) return { h: Number(colon[1]), min: Number(colon[2]) };

  const half = text.match(/(\d{1,2}|[一二三四五六七八九十兩两]+)\s*點半/);
  if (half) {
    const h = parseChineseNumber(half[1]);
    if (h !== null) return { h, min: 30 };
  }

  const dian = text.match(/(\d{1,2}|[一二三四五六七八九十兩两]+)\s*點\s*(\d{1,2})?\s*分?/);
  if (dian) {
    const h = parseChineseNumber(dian[1]);
    if (h !== null) return { h, min: dian[2] ? Number(dian[2]) : 0 };
  }

  const period = text.match(
    /(早上|上午|中午|下午|晚上|傍晚)\s*(\d{1,2}|[一二三四五六七八九十兩两]+)\s*點/,
  );
  if (period) {
    const h0 = parseChineseNumber(period[2]);
    if (h0 === null) return null;
    let h = h0;
    const p = period[1];
    if ((p === "下午" || p === "晚上" || p === "傍晚") && h < 12) h += 12;
    if (p === "中午" && h < 11) h = 12;
    return { h, min: 0 };
  }

  return null;
}

function toDatetime(date: string, time: { h: number; min: number }): string {
  return `${date}T${pad(time.h)}:${pad(time.min)}:00`;
}

const baseReply = {
  people: 1,
  service: null as string | null,
  queryTopic: null as ParsedMessage["queryTopic"],
  clarification: null as string | null,
};

function parseBookingService(text: string): string | null {
  if (/聽力|檢測/.test(text)) return "聽力檢測";
  if (/試戴|選配/.test(text)) return "助聽器試戴";
  if (/調音/.test(text)) return "調音";
  if (/保養/.test(text)) return "保養";
  if (/維修|修理|故障/.test(text)) return "維修";
  return null;
}

function parseBookingDatetime(text: string): string | null {
  const time = parseTime(text);
  if (!time) return null;
  const date = parseDate(text) ?? addDays(todayInTaipei(), 1);
  return toDatetime(date, time);
}

/** 助聽器常見問題（Gemini 額度不足時仍可用） */
function tryTroubleshootingParse(text: string): ParsedMessage | null {
  const t = text.trim();

  if (/沒聲音|無聲|聽不到|不出聲|沒聲響/.test(t)) {
    return {
      ...baseReply,
      intent: "chitchat",
      datetime: null,
      reply:
        "助聽器沒聲音可先試這幾步：\n1️⃣ 確認有開機、電池有電或已充飽\n2️⃣ 檢查音量是否調太低\n3️⃣ 看喇叭口/耳模是否被耳垢堵住\n若仍無聲，歡迎預約回店檢查或保養 😊",
    };
  }

  if (/雜音|噪音|嘯叫|尖銳聲|吱吱/.test(t)) {
    return {
      ...baseReply,
      intent: "chitchat",
      datetime: null,
      reply:
        "有雜音或嘯叫可能與耳垢、配戴角度或需重新調音有關。可先清潔耳模/喇叭口，確認配戴是否密合。若仍困擾，建議預約回店由聽力師協助調音 🙏",
    };
  }

  if (/小聲|聲音太小|聽不清楚|變小聲/.test(t)) {
    return {
      ...baseReply,
      intent: "chitchat",
      datetime: null,
      reply:
        "音量變小可先檢查：電池電量、音量設定、耳垢是否堵塞。若排除後仍小聲，可能是聽力變化或需調音，歡迎預約回店檢測 😊",
    };
  }

  if (/故障|壞了|不能用|異常|當機/.test(t) && /助聽器|耳掛|耳內|機器/.test(t)) {
    return {
      ...baseReply,
      intent: "chitchat",
      datetime: null,
      reply:
        "了解，助聽器故障我們可以協助排查 🔧\n請先試：重開機、換電池/充電、檢查耳模與喇叭口是否堵塞。\n若仍異常，歡迎預約帶回店內檢測維修，或來電 04-705-5028 與我們聯絡。",
    };
  }

  if (/故障|壞了|維修/.test(t)) {
    return {
      ...baseReply,
      intent: "chitchat",
      datetime: null,
      reply:
        "若助聽器有故障，歡迎預約回店檢測維修，或告訴我症狀（沒聲音、雜音、小聲等），我先幫您簡單排查 😊",
    };
  }

  if (/電池|充電|沒電/.test(t)) {
    return {
      ...baseReply,
      intent: "chitchat",
      datetime: null,
      reply:
        "電池式：確認電池方向正確、倉蓋有關好，可換新電池試試。充電式：確認充電座接觸良好，充飽後再試。需要電池或充電配件，歡迎來店或預約 😊",
    };
  }

  if (/助聽器|聽力|耳鳴|聽不清/.test(t)) {
    return {
      ...baseReply,
      intent: "chitchat",
      datetime: null,
      reply: `我是${config.store.name}的店員，可以協助您：\n• 助聽器選配、試戴、調音、保養、維修\n• 聽力檢測預約\n• 簡單故障排查\n請告訴我您的狀況，或輸入「預約」安排來店 😊`,
    };
  }

  return null;
}

/**
 * 不依賴 Gemini 的規則解析（Gemini 503 / 金鑰錯誤時的備援，也加速常見預約句型）
 */
export function tryRuleBasedParse(userText: string): ParsedMessage | null {
  const t = userText.trim();
  if (!t) return null;

  if (/取消/.test(t) && /預約/.test(t)) {
    return {
      ...baseReply,
      intent: "cancel",
      datetime: null,
      reply: "好的，我來幫您取消預約。若系統查不到紀錄，我們會再與您確認 🙏",
    };
  }

  if (/改約|改時間|換時間|更改預約/.test(t)) {
    const datetime = parseBookingDatetime(t);
    return {
      ...baseReply,
      intent: "reschedule",
      datetime,
      clarification: datetime ? null : "沒問題，您想改到哪一天、幾點呢？",
      reply: datetime ? `好的，我來幫您改約到新時段。` : "沒問題，您想改到哪一天、幾點呢？",
    };
  }

  if (/營業|幾點開|開門|打烊|營業時間|開到幾點/.test(t)) {
    return {
      ...baseReply,
      intent: "query",
      datetime: null,
      queryTopic: "hours",
      reply: `我們的營業時間是：${config.store.hours} 😊`,
    };
  }

  if (/地址|在哪|怎麼去|位置/.test(t)) {
    return {
      ...baseReply,
      intent: "query",
      datetime: null,
      queryTopic: "address",
      reply: `我們在 ${config.store.address}。${config.store.parking ? config.store.parking : ""}`.trim(),
    };
  }

  if (/價格|價位|多少錢|費用|報價/.test(t)) {
    return {
      ...baseReply,
      intent: "query",
      datetime: null,
      queryTopic: "price",
      reply: config.store.price || "助聽器依品牌與等級報價，歡迎來店免費試戴與聽力檢測 😊",
    };
  }

  if (/^預約$|^預定$|^想約$|^我要約$/.test(t)) {
    return {
      ...baseReply,
      intent: "book",
      datetime: null,
      service: null,
      clarification: `請問您方便的日期與時段？我們營業：${config.store.hours}`,
      reply: `好的，很樂意幫您預約！請問您方便的日期與時段？例如「明天早上九點」。我們營業：${config.store.hours} 😊`,
    };
  }

  if (/預約|預定|想約|我要約|約一下/.test(t)) {
    const datetime = parseBookingDatetime(t);
    const service = parseBookingService(t);

    if (datetime) {
      return {
        ...baseReply,
        intent: "book",
        datetime,
        service,
        reply: `好的，已為您安排 ${datetime.replace("T", " ").slice(0, 16)} 的${service ? ` ${service}` : ""}預約，期待您的光臨！😊`,
      };
    }

    return {
      ...baseReply,
      intent: "book",
      datetime: null,
      service,
      clarification: `請問您方便的日期與時段？我們營業時間：${config.store.hours}`,
      reply: `好的，很樂意幫您預約${service ? ` ${service}` : ""}！請問您方便的日期與時段？例如「明天早上九點」。我們營業：${config.store.hours} 😊`,
    };
  }

  if (/^你好$|^您好$|^嗨$|^哈囉$/.test(t)) {
    return {
      ...baseReply,
      intent: "chitchat",
      datetime: null,
      reply: `您好！我是${config.store.name}的店員，很高興為您服務。請問想預約、了解營業時間，或有助聽器相關問題嗎？😊`,
    };
  }

  return tryTroubleshootingParse(t);
}
