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
  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text }],
  });
}
