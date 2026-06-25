export type Intent =
  | "book"        // 新預約
  | "reschedule"  // 改約
  | "cancel"      // 取消
  | "query"       // 查詢（營業時間 / 價位 / 地址 / 停車）
  | "chitchat"    // 招呼閒聊
  | "unknown";    // 看不懂

export type QueryTopic = "hours" | "price" | "address" | "parking" | null;

/** Gemini 解析客人訊息後回傳的結構化結果 */
export interface ParsedMessage {
  intent: Intent;
  /** 本地時間（Asia/Taipei），格式 YYYY-MM-DDTHH:mm:ss；無法判斷則為 null */
  datetime: string | null;
  people: number;
  service: string | null;
  queryTopic: QueryTopic;
  /** 資訊不足需要回問時，這裡放要問客人的話；否則為 null */
  clarification: string | null;
  /** AI 建議的自然語言回覆（zh-TW） */
  reply: string;
}
