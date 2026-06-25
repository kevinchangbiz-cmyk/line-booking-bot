import { messagingApi, type MiddlewareConfig } from "@line/bot-sdk";
import { config } from "./config.js";

export const lineMiddlewareConfig: MiddlewareConfig = {
  channelSecret: config.line.channelSecret,
  channelAccessToken: config.line.channelAccessToken,
};

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.line.channelAccessToken,
});

const profileCache = new Map<string, { name: string; at: number }>();
const PROFILE_CACHE_MS = 10 * 60 * 1000;

/**
 * 取得 LINE 使用者 profile 的 displayName（本人設定的暱稱）。
 * 注意：官方帳號在聊天室「改備註名」（如王曉明→王曉明B40）API 讀不到，只有本人改 LINE 個人名稱才會反映。
 */
export async function getDisplayName(userId: string): Promise<string | null> {
  if (!userId || userId === "unknown") return null;

  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.at < PROFILE_CACHE_MS) return cached.name;

  try {
    const profile = await client.getProfile(userId);
    const name = profile.displayName?.trim() || null;
    if (name) profileCache.set(userId, { name, at: Date.now() });
    return name;
  } catch (err) {
    console.warn("[line] 無法取得使用者名稱：", userId, err);
    return null;
  }
}

/** 用 replyToken 回覆（Reply API，免費、不消耗推播額度） */
export async function reply(replyToken: string, text: string): Promise<void> {
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: "text", text }],
    });
  } catch (err) {
    console.error("[line] Reply 失敗（常見原因：LINE_CHANNEL_ACCESS_TOKEN 過期或與 Channel 不符）：", err);
    throw err;
  }
}
