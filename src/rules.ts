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

  const dian = text.match(/(\d{1,2})\s*點\s*(\d{1,2})?\s*分?/);
  if (dian) return { h: Number(dian[1]), min: dian[2] ? Number(dian[2]) : 0 };

  const period = text.match(/(早上|上午|中午|下午|晚上|傍晚)\s*(\d{1,2})\s*[點:：]?/);
  if (period) {
    let h = Number(period[2]);
    const p = period[1];
    if ((p === "下午" || p === "晚上" || p === "傍晚") && h < 12) h += 12;
    if (p === "中午" && h < 11) h = 12;
    return { h, min: 0 };
  }

  // 「9點半」
  const half = text.match(/(\d{1,2})\s*點半/);
  if (half) return { h: Number(half[1]), min: 30 };

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
    const date = parseDate(t);
    const time = parseTime(t);
    const datetime = date && time ? toDatetime(date, time) : null;
    return {
      ...baseReply,
      intent: "reschedule",
      datetime,
      clarification: datetime ? null : "沒問題，您想改到哪一天、幾點呢？",
      reply: datetime
        ? `好的，我來幫您改約到新時段。`
        : "沒問題，您想改到哪一天、幾點呢？",
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

  if (/預約|預定|想約|我要約|約一下/.test(t)) {
    const date = parseDate(t) ?? addDays(todayInTaipei(), 1); // 只有時間時預設明天
    const time = parseTime(t);
    const hasDateKeyword = /今天|今日|明天|明日|後天|后天|大後天|\d{1,2}[\/\-月]/.test(t);
    const datetime = time ? toDatetime(hasDateKeyword ? (parseDate(t) ?? date) : date, time) : null;

    let service: string | null = null;
    if (/聽力|檢測/.test(t)) service = "聽力檢測";
    else if (/試戴|選配/.test(t)) service = "助聽器試戴";
    else if (/調音/.test(t)) service = "調音";
    else if (/保養/.test(t)) service = "保養";
    else if (/維修|修理/.test(t)) service = "維修";

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
      reply: `好的，很樂意幫您預約${service ? ` ${service}` : ""}！請問您方便的日期與時段？我們營業：${config.store.hours} 😊`,
    };
  }

  if (/^你好|^您好|^嗨|^哈囉/.test(t)) {
    return {
      ...baseReply,
      intent: "chitchat",
      datetime: null,
      reply: `您好！我是${config.store.name}的店員，很高興為您服務。請問想預約、了解營業時間，或有助聽器相關問題嗎？😊`,
    };
  }

  return null;
}
