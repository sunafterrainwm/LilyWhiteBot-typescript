在 Docker 中運行
===

下面是一個基於 Docker Compose 的示例配置方法：

## 1. 配置機器人帳號
參見[README.md](README.md)。

## 2. 安裝必要的軟體
需要在伺服器上安裝Docker、Docker Compose、git，具體操作步驟略。

<!-- 如使用中國國內伺服器：
1. 需配置好Docker鏡像源，否則拉鏡像時網絡會非常卡。
2. Dockerfile中的網址需要翻牆。如果已配置代理，需要增加
```Dockerfile
ENV HTTP_PROXY http://192.168.1.100:1080
ENV HTTPS_PROXY http://192.168.1.100:1080
```

如果未配置代理，需要找個牆外網站（例如Docker Hub）把容器構建出來，再藉助國內鏡像源來pull容器。 -->

## 3. 下載必要的文件
下面命令在伺服器執行，會在家目錄建立一個子目錄bot，相關文件均會放到該目錄中。
```
cd
mkdir bot
cd bot

# 互聯機器人源碼
git clone https://github.com/sunafterrainwm/LilyWhiteBot-typescript
```

## 4. 修改配置文件
### LilyWhiteBot 配置檔案
執行
```
cd ~/bot/LilyWhiteBot
cp config/config.example.ts config.ts
```

舊版格式 js、json 及 yaml 依然可以使用，但需要改成 ConfigV2 ，具體方式請參考[遷移文檔](https://github.com/sunafterrainwm/LilyWhiteBot-typescript/wiki/Migrate)。就算如此，因typescript格式會順道檢測類型，減少配置錯誤，建議花點時間轉一下格式。

根據示例配置檔案中的注釋修改配置檔案。其中，config.ts 有幾處需要留意的地方：

1. 如需轉發圖片，建議使用圖床（`transport.options.servemedia.type`不設置為`self`），因容器取文件比較麻煩。

### docker-compose.yaml

#### 自己構建lilywhitebot的image
首次使用時需要先構建image（往後更新亦同）：
```
npm run buildimage && npm run build
```
而後在bot目錄創建 docker-compose.yaml 檔案，內容請參考 [docker-compose.example/lilywhitebot.yaml](docker-compose.example/lilywhitebot.yaml) 進行設置。

您也可以選用 [https://ghcr.io/sunafterrainwm/lilywhitebot](ghcr.io 上的image)，方法是把第五行的image改成`ghcr.io/sunafterrainwm/lilywhitebot:<目標標籤>`，但由於image內部包含大量的node_module而非常之大，僅適合不想自己構建的人使用。

#### 在每次重啟時重新構建
在bot目錄創建 docker-compose.yaml 檔案，內容請參考 [docker-compose.example/node.yaml](docker-compose.example/node.yaml) 。由於每次執行時 docker 都將重新構建，除非需要頻繁更新以做測試否則不建議使用此方法。

## 5. 啟動
執行
```
docker-compose up -d
```

配置完成後，檢查機器人是否正常運行。互聯機器人日誌可通過`docker logs bot_lilywhitebot_1`命令查看。

## 其他說明

### 文件伺服器

#### docker-compose.yaml：
請參照 [docker-compose.example/lilywhitebot-server.yaml](docker-compose.example/lilywhitebot-server.yaml) 或 [docker-compose.example/node-server.yaml](docker-compose.example/node-server.yaml) 進行設置。

#### config.yml：
* `transport.options.servemedia.type`設置為`self`
* `transport.options.servemedia.cachePath`設置為`/home/node/cache`
* `transport.options.servemedia.serveUrl`設置為你的（上面示例為nginx）伺服器網址
