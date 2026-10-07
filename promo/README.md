# MakoSing 示範影片（直式 1080×1920，約 52 秒）

用網站**真實的程式**（`docs/app.js`）搭配假資料層錄成，不是另外畫的示意圖。
音效用程式合成（`music.py`）；配樂目前用 Mixkit 的《Summer's Here》（免費授權，放在 `promo/out/mixkit-summers-here-91.mp3`，不進版控），也可以不指定音樂檔，改用程式合成的原創配樂。

## 重新製作

```bash
python promo/render.py cues      # 輸出音效提示 promo/out/cues.json
python promo/music.py --music-file promo/out/mixkit-summers-here-91.mp3   # 音效 + 指定的配樂 → promo/out/music.wav
#（不加 --music-file 就用程式合成的配樂）
python promo/render.py video     # 渲染無聲影片 promo/out/video_silent.mp4（約 1.5 分鐘）
```

合成聲音並轉成標準色彩範圍（限制範圍 BT.709）：

```bash
ffmpeg -y -i promo/out/video_silent.mp4 -i promo/out/music.wav -map 0:v -map 1:a \
  -vf "scale=in_range=full:out_range=limited:out_color_matrix=bt709,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 192k -ar 44100 -t 52.28 -movflags +faststart "promo/out/MakoSing-示範影片.mp4"
```

檢查畫面：`python promo/render.py frames 12.5 31.9 45` 會把這幾個時間點的畫面存到 `promo/out/frame_*.jpg`。

## 檔案

| 檔案 | 用途 |
|---|---|
| `stage.js` | 整支影片的時間軸（點擊、輸入、攝影機、字幕、音效提示）。想改內容或節奏改這裡 |
| `stage.html` / `stage.css` | 舞台：手機框、標題、片頭片尾 |
| `stub/store.js`, `stub/youtube.js` | 假資料層：示範用的人、活動、歌，以及貼上連結後解析出的影片 |
| `render.py` | 建置示範版網站、逐格截圖、輸出影片 |
| `music.py` | 配樂（C 大調、BPM 140 的快節奏 city-pop 風格）與音效合成 |

`promo/build/`、`promo/out/` 是產物，不進版控。
示範用的 YouTube／B 站影片連結寫在 `render.py`（`YT_IDS`、`build()` 裡的 BV 號）與 `stage.js` 最上面。
