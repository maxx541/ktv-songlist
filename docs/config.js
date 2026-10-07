// 網站設定：建立 Firebase 專案後，把下面的值換成你自己的（步驟見 README）。
// 這些值本來就會出現在網頁原始碼裡，不是機密；真正的保護靠 firestore.rules。

// Firebase 主控台 → 專案設定 → 一般 → 你的應用程式 → SDK 設定和配置（選「設定」）
export const firebaseConfig = {
  apiKey: 'AIzaSyDZuABkLUb20aZCgYZ43Ro5XRfR4l8M8ho',
  authDomain: 'ktv-songlist-541-665a0.firebaseapp.com',
  projectId: 'ktv-songlist-541-665a0',
  appId: '1:348753630362:web:a7359bf2e6e9e3fa7ffb23',
};

// 讀取 YouTube 播放清單用的 OAuth 用戶端 ID。
// Firebase 主控台 → Authentication → 登入方式 → Google → 「網路 SDK 設定」裡的「網路用戶端 ID」
export const googleClientId = '348753630362-gopbritfhj0slf66jjn5mv03shutmskc.apps.googleusercontent.com';

// 選填：bilibili 中繼服務網址（server/bili-relay.mjs 加 Tailscale Funnel 的對外網址，結尾不要加 /）。
// 沒填、或中繼電腦沒開時，bilibili 會改成顯示播放器，歌名自己輸入。
export const biliRelayUrl = 'https://laptop-86bfjusl.taildaa888.ts.net';

// 選填：YouTube Data API 金鑰（限制只能從你的網址使用）。
// 有填的話，沒連結 YouTube 的人也能用「播放清單網址」匯入公開清單。
export const youtubeApiKey = 'AIzaSyC708N4FRwAO692r2j7kJtMCfBmtKhmFCQ';
