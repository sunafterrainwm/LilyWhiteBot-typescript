LilyWhiteBot-typescript
===
在多個群組間傳話的機器人。為「LilyWhiteBot」（原名為「qq-tg-irc」）的 typescript 版本。

## 遷移說明
此儲存庫與早期所有之「qq-tg-irc」及「LilyWhiteBot」配置文檔並不相容，請參考[文檔](https://github.com/sunafterrainwm/LilyWhiteBot-typescript/wiki/Migrate)。

## 功能
* Telegram、IRC、Discord 等多組聊天群之間互聯。
* 可根據需要組態單向互聯，或者將同一聊天軟體的多個分群互聯到一起。
* 支援圖片轉發。如不能傳送圖片（IRC），程式可將圖片上傳到圖床並提供圖片連結。
* 支援自訂轉發訊息樣式。
* 支援 Docker 部署。
* 可支援擴充（備註：目前介面尚不完善，請儘量避免自己寫外掛程式）。

## 部署操作指南
### 準備機器人帳號

#### Telegram
1. 與 @BotFather 私聊，輸入`/newbot`命令，按照螢幕指示進行操作，建立機器人帳號。
2. 記錄 BotFather 給出的 Token。
3. 輸入`/setprivacy`命令，根據螢幕提示選擇機器人帳號，然後選擇`Disable`，關閉隱私模式。

#### IRC
IRC 不需要註冊。為了提高安全性，您可以採取註冊 Nick、增加 Cloak 等措施，需要的話請自行搜尋教程。

#### Discord
1. 進入 [Discord Developer Portal](https://discordapp.com/developers/applications/)，建立 Application。建立完成後記錄 CLIENT ID。
2. 進入 Bot 頁面，點擊 Add Bot，建立機器人。建立成功後記錄 Token。
3. 在「Privileged Gateway Intents」一節找到「PRESENCE INTENT」及「MESSAGE CONTENT INTENT」並勾選。「SERVER MEMBERS INTENT」可依情況勾選。
4. 進入 OAuth2 頁面，往下翻到「OAuth2 URL Generator」，找到 SCOPES 並勾選 bot，然後再繼續勾選 BOT PERMISSIONS 中的權限（例如 Administrator），系統會生成一個連結。存取生成的連結，按照螢幕提示將機器人拉入到你的伺服器與頻道中。

### 組態互聯程式（Docker）
推薦在 Docker 中執行互連線器人程式。具體組態方法見 [Docker說明](README_Docker.md)。

### 組態互聯程式（手工操作）
#### 組態 LilyWhiteBot
1. 安裝 Node.js，最小版本 16。
2. 下載代碼
```
git clone https://github.com/sunafterrainwm/LilyWhiteBot-typescript
```
3. 修改設定檔：
    * 將 config/config.example.ts 改名為 config/config.ts，按照設定檔中的提示填入參數。預設情況下各機器人都是關閉的，您需要將需要的機器人的 `disabled` 改為 `false`。
4. 執行
```
npm install
node main.js
```
5. 檢查互連線器人是否正常執行。

如果已正常工作，建議使用 [forever](https://github.com/foreversd/forever) 啟動機器人，保證程式隨時執行。

如何取得群組ID？
* IRC：分別為頻道名稱（以 `#` 開頭）和 QQ 群號碼。在 LilyWhiteBot 設定檔中為 `irc/#頻道名稱`，例如 `irc/#test`。請注意頻道明請使用小寫否則無法正常轉發。
* Telegram：將本 bot 拉入到您的聊天群，然後輸入 `/thisgroupid`，機器人會返回聊天群的 ID。這個 ID 是一個負數，在 LilyWhiteBot 設定檔中需要寫成類似 `telegram/-1234567890` 的格式。
* Discord：進入 Discord 的使用者設定（User Settings），找到 Appearance，啟用「Enable Developer Mode」選項。然後右擊聊天頻道，在彈出選單中選擇「Copy ID」。在 LilyWhiteBot 設定檔中需要寫成類似 `discord/1234567890` 的格式。
