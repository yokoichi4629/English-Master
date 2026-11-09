# English Master — Claude向けメモ

再開時はまず `docs/PROGRESS.md`(開発記録)を読み、現状と次の候補を把握してから進めること。

## 進め方
- ユーザーとのやりとり・画面の文言はすべて日本語。ユーザーはプログラミングに詳しくないので、専門用語は避けて説明する。
- 公開は `main` への push で Cloudflare Workers Builds が自動で行う。push 後は Cloudflare の Workers 一覧/コードで反映を確認する。
- リリースごとに `public/app.js` の `APP_VERSION` と `public/sw.js` の `CACHE` を上げ、`docs/PROGRESS.md` の更新履歴も追記する。
- `public/data.js` の項目は各リストの末尾にだけ追加する(学習記録は「カテゴリー.シーン.並び順」で紐づいている)。

## 構成の要点
- フレームワークなしの素の HTML/CSS/JS(`public/`)+ Worker(`src/index.js`)。ビルド工程なし。
- 学習記録は端末の localStorage(キー `english-master.v1`)。
- AI: Whisper(文字起こし)、Gemma 4(英会話)、Aura(iPhone向け英語音声、KV `TTS_CACHE` に保存)。すべて Workers AI 無料枠内。
- `/api/*` は同じサイトからの POST のみ受け付ける。

## 確認のしかた
- 画面: `public/` を `python3 -m http.server` で配信し、Playwright でスマホ幅(390px)のスクリーンショットを撮って確認。`/api/*` は Playwright の route で模擬応答を返す。
- サーバー: `src/index.js` を Node から import し、`env.AI` / `env.TTS_CACHE` / `env.ASSETS` を模擬して呼ぶ。
- 設定: `npx wrangler deploy --dry-run` でバインディングを確認。
