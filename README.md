# KTV 點歌整理

去 KTV 前，大家先把預計要唱的歌放上來。每個人都看得到彼此的歌單，**點歌前就知道有沒有人點過**，避免重複。

- 網站放在 **GitHub Pages**（免費），登入和資料放在 **Firebase**（免費方案就夠用）
- 沒有自己的伺服器，**電腦不用開著**

## 功能

- **登入**：輸入暱稱就能進入；也可以用 Google 登入，第一次登入時設定暱稱。
  暱稱登入沒有密碼，只能在目前這台裝置使用；要換裝置請用 Google 登入。
- **加歌**
  - **YouTube 歌單**：連結 YouTube 帳號後，從自己的播放清單或「喜歡的影片」勾選；也可以貼播放清單網址。
  - **貼上連結**：貼 YouTube 影片網址會自動抓歌名和縮圖；bilibili 可貼網址或內嵌代碼（顯示播放器，歌名要自己輸入，同一支影片仍會標重複）；其他網站的歌名也要自己輸入。
- **顯示**：依人分組，每首歌都有縮圖、可以點的連結和歌名。
- **防重複**：同一支影片或同樣的歌名標紅色「重複」，歌名互相包含標黃色「可能重複」；挑歌時就會標出「某某 已點」。
- **編輯自己的歌**：改歌名、改連結、更換成另一首、調整順序、刪除、清空。別人的歌只能看，不能改（由 `firestore.rules` 擋住）。
- **即時同步**：有人加歌，其他人的畫面不用重新整理就會更新。
- 固定暗色主題，手機和電腦都能用。

---

## 設定步驟

目前 `docs/config.js` 是空的，網站會顯示「網站還沒設定好」。照下面步驟接上 Firebase 即可。

### 1. 建立 Firebase 專案

1. 到 https://console.firebase.google.com ，按「建立專案」，名稱填 `ktv-songlist`，Google Analytics 可以關掉。
2. 左邊選「建構 → **Authentication**」→「開始使用」→「**登入方式**」分頁，啟用：
   - **匿名**
   - **Google**：選一個「專案支援電子郵件」→ 儲存。再按一次 Google，展開「**網路 SDK 設定**」，把「**網路用戶端 ID**」複製下來，第 3 步用得到。
3. 同一頁的「**設定**」分頁 →「**已授權網域**」→「新增網域」，加入 `你的GitHub帳號.github.io`。
4. 左邊選「建構 → **Firestore Database**」→「建立資料庫」：位置選 `asia-east1`，選「**以正式版模式啟動**」。建好後到「**規則**」分頁，把內容換成本專案的 `firestore.rules`，按「發布」。
5. 左上角齒輪「專案設定」→「一般」→ 最下面「你的應用程式」，按 `</>`（網頁），暱稱填 `ktv`（**不要**勾 Firebase Hosting）→「註冊應用程式」。把畫面上的 `apiKey`、`authDomain`、`projectId`、`appId` 記下來。

### 2. 開啟 YouTube 播放清單讀取

Firebase 專案本身就是一個 Google Cloud 專案。

1. 到 https://console.cloud.google.com ，上方切換到 `ktv-songlist` 專案。
2. 「API 和服務 → 程式庫」→ 搜尋「**YouTube Data API v3**」→「啟用」。
3. 「API 和服務 → **憑證**」→ 在「OAuth 2.0 用戶端 ID」裡點「**Web client (auto created by Google Service)**」→「已授權的 JavaScript 來源」→「新增 URI」，填 `https://你的GitHub帳號.github.io`（不要加結尾的 `/` 或路徑）→ 儲存，最多等 5 分鐘生效。
4. 「**Google Auth Platform**」（舊介面叫「OAuth 同意畫面」）→「資料存取」→「新增或移除範圍」，勾選 `.../auth/youtube.readonly` → 儲存。

> `youtube.readonly` 是 Google 歸類的「敏感權限」。Google 審核之前，連結 YouTube 時會看到「Google 尚未驗證這個應用程式」，按「進階 → 前往（不安全）」就能繼續。私人使用不需要送審，最多 100 人。

### 3. 填設定檔

編輯 `docs/config.js`：

```js
export const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'ktv-songlist-xxxxx.firebaseapp.com',
  projectId: 'ktv-songlist-xxxxx',
  appId: '1:1234567890:web:abcdef',
};
export const googleClientId = '1234567890-xxxx.apps.googleusercontent.com'; // 第 1 步複製的「網路用戶端 ID」
```

這些值本來就會出現在網頁原始碼裡，不是機密。資料的保護靠 `firestore.rules`，所以放在公開的 GitHub 上沒關係。

改完 commit 並 push，GitHub Pages 約 1 分鐘後更新。

---

## 檔案說明

```
docs/                 GitHub Pages 發布的網站
  index.html, style.css, app.js   畫面
  store.js            Firebase 登入與資料讀寫
  youtube.js          YouTube 授權、讀播放清單、解析網址
  shared.js           網址解析、重複判斷
  config.js           ← 要填的設定
firestore.rules       資料權限規則（貼到 Firebase 主控台）
test/shared.test.js   重複判斷等共用函式的測試（npm test）
```
