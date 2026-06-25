import { existsSync } from "fs";
import { google, calendar_v3 } from "googleapis";
import { config } from "./config.js";

function hasCredentials(): boolean {
  if (config.calendar.credentialsJson) return true;
  return existsSync(config.calendar.credentialsPath);
}

/** Google 日曆金鑰與日曆 ID 是否已設定（未設定時跳過寫入，仍可用 AI 回覆） */
export function isConfigured(): boolean {
  return hasCredentials() && !/^your_email@/i.test(config.calendar.calendarId);
}

// 台灣固定 UTC+8（無日光節約），用於組 RFC3339 時間字串
const TZ_OFFSET = "+08:00";

let calendarClient: calendar_v3.Calendar | null = null;

function getCalendar(): calendar_v3.Calendar {
  if (!calendarClient) {
    const scopes = ["https://www.googleapis.com/auth/calendar"];
    const auth = config.calendar.credentialsJson
      ? new google.auth.GoogleAuth({
          credentials: JSON.parse(config.calendar.credentialsJson) as Record<string, unknown>,
          scopes,
        })
      : new google.auth.GoogleAuth({
          keyFile: config.calendar.credentialsPath,
          scopes,
        });
    calendarClient = google.calendar({ version: "v3", auth });
  }
  return calendarClient;
}

const calendarId = config.calendar.calendarId;

/** 在不含時區的本地時間字串上加分鐘，回傳同樣不含時區的字串 */
function addMinutesLocal(local: string, minutes: number): string {
  const d = new Date(`${local}Z`); // 以 UTC 解析做純算術（時差對「加減分鐘」不影響）
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 19);
}

function toRFC3339(local: string): string {
  return `${local}${TZ_OFFSET}`;
}

export interface BookingInput {
  userId: string;
  startLocal: string; // YYYY-MM-DDTHH:mm:ss（Asia/Taipei）
  durationMin?: number;
  people: number;
  service: string | null;
}

/** 該時段是否已有預約（衝突） */
export async function hasConflict(startLocal: string, durationMin: number): Promise<boolean> {
  const endLocal = addMinutesLocal(startLocal, durationMin);
  const res = await getCalendar().events.list({
    calendarId,
    timeMin: toRFC3339(startLocal),
    timeMax: toRFC3339(endLocal),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 1,
  });
  return (res.data.items?.length ?? 0) > 0;
}

/** 建立預約，回傳事件連結 */
export async function createBooking(input: BookingInput): Promise<string | null> {
  const duration = input.durationMin ?? config.calendar.defaultDurationMin;
  const endLocal = addMinutesLocal(input.startLocal, duration);
  const summary = `LINE 預約 - ${input.people} 位${input.service ? ` ${input.service}` : ""}`;
  const res = await getCalendar().events.insert({
    calendarId,
    requestBody: {
      summary,
      description: `由 LINE 預約機器人建立\nLINE 使用者：${input.userId}`,
      start: { dateTime: toRFC3339(input.startLocal), timeZone: config.timezone },
      end: { dateTime: toRFC3339(endLocal), timeZone: config.timezone },
      extendedProperties: { private: { lineUserId: input.userId } },
    },
  });
  return res.data.htmlLink ?? null;
}

/** 找出該使用者「接下來最近」的一筆預約 */
async function findNextEvent(userId: string): Promise<calendar_v3.Schema$Event | null> {
  const res = await getCalendar().events.list({
    calendarId,
    privateExtendedProperty: [`lineUserId=${userId}`],
    timeMin: new Date().toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 1,
  });
  return res.data.items?.[0] ?? null;
}

/** 取消該使用者最近一筆預約，回傳被取消事件的開始時間（本地字串）或 null */
export async function cancelNext(userId: string): Promise<string | null> {
  const ev = await findNextEvent(userId);
  if (!ev?.id) return null;
  await getCalendar().events.delete({ calendarId, eventId: ev.id });
  return ev.start?.dateTime ?? ev.start?.date ?? null;
}

/** 將該使用者最近一筆預約改到新時間，回傳新事件連結或 null（找不到原預約） */
export async function rescheduleNext(
  userId: string,
  newStartLocal: string,
  durationMin: number,
): Promise<string | null> {
  const ev = await findNextEvent(userId);
  if (!ev?.id) return null;
  const endLocal = addMinutesLocal(newStartLocal, durationMin);
  const res = await getCalendar().events.patch({
    calendarId,
    eventId: ev.id,
    requestBody: {
      start: { dateTime: toRFC3339(newStartLocal), timeZone: config.timezone },
      end: { dateTime: toRFC3339(endLocal), timeZone: config.timezone },
    },
  });
  return res.data.htmlLink ?? null;
}
