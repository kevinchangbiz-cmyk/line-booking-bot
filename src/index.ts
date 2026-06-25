import express from "express";
import { middleware, type WebhookEvent } from "@line/bot-sdk";

console.log("[boot] 啟動中… PORT=", process.env.PORT ?? "(未設，預設3000)");
import { config } from "./config.js";
import { lineMiddlewareConfig, reply, getDisplayName } from "./line.js";
import { analyze } from "./ai.js";
import * as cal from "./calendar.js";

const TZ_OFFSET = "+08:00"; // 台灣固定 UTC+8

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** 把本地時間字串格式化成「6/19（週五）15:00」 */
function formatLocal(local: string): string {
  const d = new Date(`${local}${TZ_OFFSET}`);
  const f = new Intl.DateTimeFormat("zh-TW", {
    timeZone: config.timezone,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.month}/${p.day}（${p.weekday}）${p.hour}:${p.minute}`;
}

function isClosedDay(local: string): boolean {
  const day = new Date(`${local}${TZ_OFFSET}`).getDay(); // 0=日 1=一 … 6=六
  return day === 0 || day === 1 || day === 3; // 週日、週一、週三公休
}

function isWithinBusinessHours(local: string, durationMin: number): boolean {
  const time = local.split("T")[1] ?? "";
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  const startMin = hour * 60 + minute;
  const openMin = config.store.openHour * 60;
  const closeMin = config.store.closeHour * 60;
  return startMin >= openMin && startMin + durationMin <= closeMin;
}

function isPast(local: string): boolean {
  return new Date(`${local}${TZ_OFFSET}`).getTime() < Date.now();
}

/** 衝突時，依營業時段算出兩個鄰近替代時段字串 */
function altSlots(local: string): string[] {
  const hour = Number(local.split("T")[1].slice(0, 2));
  const candidates = [hour - 1, hour + 1, hour + 2].filter(
    (h) => h >= config.store.openHour && h <= config.store.closeHour - 1,
  );
  return candidates.slice(0, 2).map((h) => `${pad(h)}:00`);
}

async function handleEvent(event: WebhookEvent): Promise<void> {
  if (event.type !== "message" || event.message.type !== "text") return;
  const userId = event.source.userId ?? "unknown";
  const text = event.message.text;
  const replyToken = event.replyToken;

  const parsed = await analyze(text);
  console.log(`[webhook] "${text}" -> ${parsed.intent} ${parsed.datetime ?? ""}`);

  try {
    switch (parsed.intent) {
      case "book": {
        if (!parsed.datetime) {
          await reply(replyToken, parsed.clarification ?? parsed.reply);
          return;
        }
        if (isPast(parsed.datetime)) {
          await reply(replyToken, "這個時間已經過囉，方便給我一個之後的時間嗎？😊");
          return;
        }
        if (isClosedDay(parsed.datetime)) {
          await reply(
            replyToken,
            `抱歉，${formatLocal(parsed.datetime).split("（")[1]?.replace("）", "") ?? "那天"}我們公休 😊\n本店營業：${config.store.hours}\n要不要改約週二、四、五、六的時段？`,
          );
          return;
        }
        const duration = config.calendar.defaultDurationMin;
        if (!isWithinBusinessHours(parsed.datetime, duration)) {
          await reply(
            replyToken,
            `這個時段不在營業時間內哦～我們是 ${config.store.hours}，您方便改約 ${config.store.openHour}:00–${config.store.closeHour - 1}:00 之間嗎？😊`,
          );
          return;
        }
        if (!cal.isConfigured()) {
          await reply(
            replyToken,
            `${parsed.reply}\n\n（日曆尚未連結，已記下您的預約需求，我們會人工確認 ✅）`,
          );
          return;
        }
        if (await cal.hasConflict(parsed.datetime, duration)) {
          const alts = altSlots(parsed.datetime);
          const altText = alts.length ? `鄰近的 ${alts.join(" 或 ")} 可以嗎？` : "要不要換個時段呢？";
          await reply(replyToken, `抱歉，${formatLocal(parsed.datetime)} 已經有人預約了😣 ${altText}`);
          return;
        }
        const displayName = await getDisplayName(userId);
        await cal.createBooking({
          userId,
          displayName,
          startLocal: parsed.datetime,
          durationMin: duration,
          people: parsed.people,
          service: parsed.service,
        });
        await reply(
          replyToken,
          `${parsed.reply}\n\n✅ 已為您登記 ${formatLocal(parsed.datetime)} 的預約，期待見到您！`,
        );
        return;
      }

      case "reschedule": {
        if (!parsed.datetime) {
          await reply(replyToken, parsed.clarification ?? "沒問題，您想改到哪一天、幾點呢？");
          return;
        }
        if (!cal.isConfigured()) {
          await reply(replyToken, parsed.reply);
          return;
        }
        const link = await cal.rescheduleNext(userId, parsed.datetime, config.calendar.defaultDurationMin);
        if (!link) {
          await reply(replyToken, "我這邊沒有找到您原本的預約，要直接幫您預約這個新時段嗎？");
          return;
        }
        await reply(replyToken, parsed.reply);
        return;
      }

      case "cancel": {
        if (!cal.isConfigured()) {
          await reply(replyToken, parsed.reply);
          return;
        }
        const cancelled = await cal.cancelNext(userId);
        if (!cancelled) {
          await reply(replyToken, "目前查不到您的預約紀錄，需要幫您安排嗎？😊");
          return;
        }
        await reply(replyToken, parsed.reply);
        return;
      }

      // query / chitchat / unknown 都直接用 AI 擬好的回覆
      default:
        await reply(replyToken, parsed.reply);
    }
  } catch (err) {
    console.error("[webhook] 處理失敗：", err);
    await reply(
      replyToken,
      parsed.reply ||
        "不好意思，系統忙碌中，請稍後再試，或我幫您轉接真人客服 🙏",
    );
  }
}

const app = express();

app.get("/", (_req, res) => {
  res.send("LINE 預約機器人運作中 ✅");
});

app.post("/webhook", middleware(lineMiddlewareConfig), (req, res) => {
  const events: WebhookEvent[] = req.body?.events ?? [];
  // 先回 200，避免 Gemini 處理過久或冷啟動時 LINE 逾時
  res.sendStatus(200);
  void Promise.all(events.map(handleEvent)).catch((err) => {
    console.error("[webhook] 批次處理失敗：", err);
  });
});

// LINE 簽章驗證失敗（通常是 Render 的 LINE_CHANNEL_SECRET 與 Console 不一致）
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("signature") || msg.includes("Signature")) {
    console.error("[webhook] 簽章驗證失敗 — 請確認 Render 的 LINE_CHANNEL_SECRET 與 LINE Console 一致");
    res.sendStatus(401);
    return;
  }
  console.error("[webhook] 未預期錯誤：", err);
  res.sendStatus(500);
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`✅ 伺服器啟動：0.0.0.0:${config.port}`);
  console.log(`   Webhook 路徑：POST /webhook`);
  console.log(
    cal.isConfigured()
      ? "   Google 日曆：已連結 ✅"
      : "   Google 日曆：未連結（預約僅 AI 回覆，不寫入日曆）",
  );
});
