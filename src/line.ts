import { messagingApi, type MiddlewareConfig } from "@line/bot-sdk";
import { config } from "./config.js";

export const lineMiddlewareConfig: MiddlewareConfig = {
  channelSecret: config.line.channelSecret,
  channelAccessToken: config.line.channelAccessToken,
};

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.line.channelAccessToken,
});

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
