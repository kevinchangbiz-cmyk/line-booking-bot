# LINE 預約客服機器人

客人在 LINE 官方帳號傳訊息（例如「想預約明天三點」），由 **Gemini** 解析意圖與時間，
自動回覆並把預約寫進 **Google 日曆**。回覆走 LINE **Reply API（免費，不消耗推播額度）**。

支援情境：新預約、改約、取消、查詢（營業時間／價位／地址／停車）、模糊時間回問、時段衝突提供替代。

---

## 0. 先修正檔案編碼（重要，只需做一次）

這些檔案是由工具產生、可能是 UTF-16 編碼，Node / TypeScript 需要 UTF-8。
在專案資料夾打開 **PowerShell**，貼上這行把所有文字檔轉成 UTF-8：

```powershell
Get-ChildItem -Recurse -File -Include *.ts,*.json,*.md,.gitignore,.env.example |
  ForEach-Object {
    $t = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::Unicode)
    [System.IO.File]::WriteAllText($_.FullName, $t, (New-Object System.Text.UTF8Encoding($false)))
  }
```

> 如果開檔發現中文是亂碼或編譯報「File appears to be binary」，就是還沒跑這步。

---

## 1. 需求

- Node.js 18 以上
- 一個 LINE 官方帳號（Messaging API）
- Google AI Studio 的 Gemini API key
- Google Cloud 服務帳戶（寫入日曆用）

## 2. 安裝

```powershell
npm install
```

## 3. 設定環境變數

複製範本後填入金鑰（金鑰可晚點再補，填好才能實際跑）：

```powershell
Copy-Item .env.example .env
```

`.env` 各欄位說明見下方第 5 節。`.env` 已被 `.gitignore` 排除，不會進版控。

## 4. 啟動

```powershell
npm run dev      # 開發模式（存檔自動重啟）
# 或
npm start        # 直接執行
```

看到 `✅ 伺服器啟動：http://localhost:3000` 就成功了。

---

## 5. 金鑰怎麼拿

### LINE（`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_CHANNEL_SECRET`）
1. 到 [LINE Developers Console](https://developers.line.biz/) 建立 Provider → 建立 **Messaging API** channel
2. **Basic settings** 取得 `Channel secret`
3. **Messaging API** 分頁 issue 一組 `Channel access token`
4. 同分頁把 **Auto-reply messages（自動回應訊息）關閉**、**Webhook 開啟**

### Gemini（`GEMINI_API_KEY`）
- 你已有的 Google AI Studio key 直接填入即可。模型預設 `gemini-1.5-flash`（免費額度友善）。

### Google Calendar（`GOOGLE_APPLICATION_CREDENTIALS`、`GOOGLE_CALENDAR_ID`）
1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建專案 → 啟用 **Google Calendar API**
2. 建立 **服務帳戶（Service Account）** → 建立 JSON 金鑰 → 下載，放到專案根目錄命名為 `google-credentials.json`
3. 打開你的 Google 日曆 → 設定 → **與特定使用者共用** → 加入服務帳戶的 email（`xxx@xxx.iam.gserviceaccount.com`），權限設為「變更活動」
4. 日曆設定頁底部的 **日曆 ID** 填入 `GOOGLE_CALENDAR_ID`（個人日曆通常就是你的 Gmail）

---

## 6. 接上 LINE（本機測試）

LINE 的 Webhook 需要公開 HTTPS 網址。本機測試可用 [ngrok](https://ngrok.com/)：

```powershell
ngrok http 3000
```

把 ngrok 給的網址設成 LINE channel 的 Webhook URL：

```
https://你的ngrok網址/webhook
```

在 LINE Developers 後台按 **Verify** 確認連線成功，然後用手機加官方帳號為好友，傳「想預約明天三點」測試。

> 正式上線時，把伺服器部署到 Render / Railway / Cloud Run 等平台，Webhook 改成正式網址即可。

---

## 7. 費用

- **LINE Reply API（本機器人的回覆）**：免費，不計入每月推播額度。
- **Gemini**：小店用量基本落在免費額度內。
- **Google Calendar API**：免費。

只有「主動推播」（例如預約前一天提醒）才會用到 LINE 推播額度，本專案預設沒有開啟。

---

## 8. 專案結構

```
src/
├─ index.ts      Express 伺服器 + LINE Webhook，串接 AI 與日曆
├─ line.ts       LINE 用戶端 + Reply 封裝
├─ ai.ts         Gemini 意圖解析（輸出結構化 JSON）
├─ calendar.ts   Google 日曆：建立 / 查衝突 / 改約 / 取消
├─ config.ts     讀取 .env
└─ types.ts      型別定義
```

## 9. 想擴充？

- 主動提醒：用 Push API + 排程（會消耗推播額度，建議做成可開關）
- 真人接手：偵測客訴／情緒關鍵字時轉給專人
- 多分店 / 多設計師：在日曆事件加上資源欄位、衝突檢查依資源區分
