import { GoogleGenerativeAI } from "@google/generative-ai";

import { config } from "./config.js";

import type { ParsedMessage } from "./types.js";



const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

const model = genAI.getGenerativeModel({

  model: config.gemini.model,

  generationConfig: { responseMimeType: "application/json", temperature: 0.2 },

});



/** 取得「現在」的台北時間字串，餵給模型解析相對日期（明天 / 禮拜六…） */

function nowInTaipei(): { iso: string; weekday: string } {

  const now = new Date();

  const fmt = new Intl.DateTimeFormat("zh-TW", {

    timeZone: config.timezone,

    year: "numeric",

    month: "2-digit",

    day: "2-digit",

    hour: "2-digit",

    minute: "2-digit",

    weekday: "long",

    hour12: false,

  });

  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));

  const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00`;

  return { iso, weekday: parts.weekday ?? "" };

}



function buildPrompt(userText: string): string {

  const { iso, weekday } = nowInTaipei();

  const s = config.store;

  return `你是「${s.name}」的助聽器門市店員，透過 LINE 協助客人。請判斷訊息意圖並輸出 JSON。



【現在時間】${iso}（${weekday}，時區 ${config.timezone}）

【營業時間】${s.hours}（營業時段 ${s.openHour}:00–${s.closeHour}:00）

【地址】${s.address}

【停車】${s.parking}

【價位】${s.price}

【服務項目】${s.services}



【助聽器知識參考】（回答聽力/助聽器問題時可引用，勿捏造未列出的補助金額或醫療診斷）

${s.knowledge}



【你的角色與回答範圍】

- 聽力相關問題：聽力下降徵兆、助聽器類型、選配流程、日常保養、電池/充電、補助一般資訊等。

- 門市問題：預約、營業時間、地址、停車、價位、服務項目。

- 簡單故障排除：沒聲音、音量太小、雜音、電池、清潔、藍牙連線等——用步驟式引導（1→2→3），每步簡短清楚。

- 無法遠端解決或需拆機 → 邀請回店保養/維修/調音，或預約聽力師。

- 禁止：醫療診斷、開藥建議、捏造補助金額。耳痛、流膿、突發單耳聽力下降、劇烈耳鳴/眩暈 → 建議先就醫 ENT；聽力檢測與驗配 → 聽力師/回店。



【規則】

- 仔細閱讀客人訊息，reply 必須直接回答他們問的內容，不要答非所問。

- 把相對時間（今天/明天/後天/這禮拜X/晚上X點…）換算成上面現在時間對應的絕對時間。

- 沒講上下午時，依營業時段合理推斷（例如「三點」通常是 15:00）。

- 若客人要預約但時間不明確（如「這禮拜找個時間」），intent=book 且 datetime=null，並在 clarification 提出友善的回問，列出幾個可選時段。
- 本店週一、週三、週日公休；若客人預約落在公休日，reply 禮貌說明並建議改約週二、四、五、六的 09:00–18:00 時段。

- 查詢營業/價位/地址/停車/服務時 intent=query，並用上面的店家資訊回答（寫進 reply）。

- 聽力知識、保養、故障排除、補助一般說明 → intent=chitchat（或 query 若明確在問門市資訊），reply 用知識參考回答。

- reply 一律用台灣繁體中文、口氣親切專業（像門市店員），可用少量表情符號。

- 只輸出 JSON，不要 markdown 程式碼區塊，不要多餘文字。



【範例】

- 「營業到幾點」→ query, queryTopic=hours, reply 說明營業時間

- 「助聽器大概多少錢」→ query, queryTopic=price, reply 說明價位

- 「你們在哪」→ query, queryTopic=address, reply 說明地址

- 「助聽器沒聲音怎麼辦」→ chitchat, reply 逐步排查（開機/電池/音量/耳垢堵塞），仍無效則建議回店

- 「耳內型跟耳掛型差在哪」→ chitchat, reply 用知識參考簡述並邀請試戴

- 「想預約聽力檢測」→ book, service=聽力檢測, reply 確認並詢問方便時段

- 「想預約明天三點試戴助聽器」→ book, datetime=明天 15:00, service=助聽器試戴, reply 確認預約

- 「可以預約調音嗎」→ book, service=調音, reply 確認並詢問時間

- 「想預約保養」→ book, service=保養, reply 確認並詢問時間



【輸出 JSON 結構】

{

  "intent": "book" | "reschedule" | "cancel" | "query" | "chitchat" | "unknown",

  "datetime": "YYYY-MM-DDTHH:mm:ss" 或 null,

  "people": 數字（預設 1）,

  "service": 字串或 null（例如 "聽力檢測"、"助聽器試戴"、"調音"、"保養"、"維修"）,

  "queryTopic": "hours" | "price" | "address" | "parking" | null,

  "clarification": 字串或 null,

  "reply": 字串

}



【客人訊息】${userText}`;

}



function parseModelJson(raw: string): Partial<ParsedMessage> {

  const trimmed = raw.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);

  const jsonStr = (fenced ? fenced[1] : trimmed).trim();

  return JSON.parse(jsonStr) as Partial<ParsedMessage>;

}



const fallback: ParsedMessage = {

  intent: "unknown",

  datetime: null,

  people: 1,

  service: null,

  queryTopic: null,

  clarification: null,

  reply:

    "不好意思，我不太確定您的意思 😊 您可以問我聽力/助聽器問題、簡單故障排除，或預約聽力檢測、試戴、調音、保養。也可來電 04-705-5028 或到店（員林市莒光路265號），我們的聽力師很樂意協助您 🙏",

};



export async function analyze(userText: string): Promise<ParsedMessage> {

  try {

    const result = await model.generateContent(buildPrompt(userText));

    const raw = result.response.text().trim();

    const parsed = parseModelJson(raw);

    return {

      intent: parsed.intent ?? "unknown",

      datetime: parsed.datetime ?? null,

      people: typeof parsed.people === "number" && parsed.people > 0 ? parsed.people : 1,

      service: parsed.service ?? null,

      queryTopic: parsed.queryTopic ?? null,

      clarification: parsed.clarification ?? null,

      reply: parsed.reply?.trim() || fallback.reply,

    };

  } catch (err) {

    console.error("[ai] Gemini 解析失敗：", err);

    return fallback;

  }

}


