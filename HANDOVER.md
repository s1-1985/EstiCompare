# EstiCompare — 引継ぎドキュメント

作成日: 2026-05-25  
ブランチ: `main`（全PR済み）

---

## プロジェクト概要

製造業向け「新旧見積比較システム」。サプライヤーからの価格改定要求に対し、旧単価と新単価を並べてコスト構造を分解・比較する。Google Gemini 2.0 Flash によるAI監査機能付き。

**本番URL**: `APP_URL` 環境変数で管理（Cloud Run）

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | React 19 + TypeScript + Vite + TailwindCSS v4 |
| バックエンド | Express + `server.ts`（Node.js） |
| AI | Google Gemini 2.0 Flash（`@google/genai`） |
| 認証 | Firebase Auth（Google Sign-In ポップアップ） |
| DB | Firestore |
| セキュリティ | firebase-admin, helmet, cors, express-rate-limit |

---

## ファイル構成（重要ファイル）

```
EstiCompare/
├── server.ts                        # Expressサーバー + 4つのAPIエンドポイント
├── firestore.rules                  # Firestoreセキュリティルール（要デプロイ）
├── firebase.json                    # Firebase設定
├── .env                             # ローカル開発用（gitignore済み）
├── .env.example                     # 環境変数テンプレート
├── src/
│   ├── App.tsx                      # メインコンポーネント（認証・状態管理）
│   ├── firebase.ts                  # Firebase初期化・認証関数
│   ├── types.ts                     # 型定義
│   ├── data/samples.ts              # サンプルシナリオ・空見積ファクトリ
│   ├── utils/
│   │   ├── apiClient.ts             # 認証付きfetchラッパー（Bearer token）
│   │   ├── calculations.ts          # 原価計算ロジック
│   │   └── firestoreService.ts      # Firestore CRUD
│   └── components/
│       ├── ExcelGrid.tsx            # 入力ワークスペース（Sheet1）
│       └── CompareResults.tsx       # 差額分析・AI監査（Sheet2）
```

---

## APIエンドポイント（server.ts）

全エンドポイントに **Firebase IDトークン認証（Bearer）+ IPレート制限（10req/min）** が必要。

| エンドポイント | 機能 |
|---------------|------|
| `POST /api/parse-estimate` | テキストを見積JSONに変換 |
| `POST /api/compare-estimates` | 新旧見積のAI監査レポート生成 |
| `POST /api/generate-estimate` | 仕様から見積自動生成 |
| `POST /api/infer-process-params` | 工程名から出来高・賃率を推定 |

---

## 環境変数

`.env`（gitignore済み）に以下が必要：

```
GEMINI_API_KEY=...           # Gemini API
FIREBASE_PROJECT_ID=esticompare   # サーバーサイド（firebase-admin用）
VITE_FIREBASE_API_KEY=...    # 以下フロント用（Vite経由でバンドルに含まれる）
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

現在 `src/firebase.ts` は `import.meta.env.VITE_*` を優先し、未設定の場合はハードコード値にフォールバックする実装になっている（Firebase Web設定は公開前提の値のため問題なし）。

---

## 開発サーバー起動

```bash
npm run dev   # http://localhost:3000
```

---

## このセッションで実施したこと

### デザイン刷新（PR #16）
- AIっぽい（indigo/emerald/rounded-2xl）から「日本の精密台帳」スタイルに変更
- カラー: テラコッタ `#B5451B`、ダーク `#18130F`、ネイビー `#1E3A5F`
- フォント: Noto Sans JP + JetBrains Mono
- ボーダーのみのカード（shadow-sm廃止）、角丸4px

### ページタイトル修正（PR #17）
- `My Google AI Studio App` → `EstiCompare — 新旧見積比較システム`

### モバイルレイアウト修正（PR #18）
- ③工程マスタ テーブルヘッダーに `whitespace-nowrap` 追加
- AI監査フッターのモバイル対応（ボタン全幅、モデル名非表示）
- ツールバーの余分な`▼`span削除

### セキュリティ全面強化（PR #19〜#22）

**server.ts の変更:**
- `firebase-admin` による全APIエンドポイントへのIDトークン検証
- `express-rate-limit`（10req/min/IP）
- `helmet`（CSP・各種セキュリティヘッダー）← 本番のみCSP有効
- `cors`（APP_URLに限定）
- ボディサイズ制限: 15MB → 512KB
- フィールドごとのサイズ上限
- プロンプトインジェクション対策（XMLタグでユーザー入力を分離）
- Gemini SDKの生エラーをクライアントに返さない
- `--sourcemap` をビルドから削除
- Geminiレートリミッターのレース条件修正（promiseキュー化）
- 本番で `.map` ファイルを404でブロック

**Firebase / フロントエンド:**
- `firebase-applet-config.json` をgit管理から削除 → 環境変数へ移行
- `handleFirestoreError`: スロー内容をPII含まない汎用メッセージのみに
- `testConnection()` 削除（毎回Firestoreリードを無駄に発生させていた）
- `firestoreService.ts`: 新規はsetDoc/更新はupdateDoc（createdAt保持）
- `src/utils/apiClient.ts` 新設（Bearer token付きfetchラッパー）

**Firestore Rules（firestore.rules）:**
- `allow list` に `isEmailVerified()` 追加
- `newEstimate`/`oldEstimate` に `size() <= 50` 制限追加

**helmet起因のバグ修正（PR #20, #22）:**
- `contentSecurityPolicy: false`（開発環境）← ViteのHMRがブロックされていた
- `crossOriginOpenerPolicy: false` ← Google Sign-Inポップアップがブロックされていた

---

## ⚠️ まだ手動対応が必要なこと

1. **GCP Console → Firebase APIキーに制限を追加**
   - HTTPリファラー制限（本番ドメインのみ）
   - 使用APIをFirebase系のみに絞る
   - URL: `console.cloud.google.com/apis/credentials`

2. **旧APIキーの無効化**
   - 旧プロジェクト `gen-lang-client-0134924529` のキー `AIzaSyAN0NS3aROharFPAfOSqCBtBs0SFTtvcos` を無効化
   - git履歴に永久に残るため、キー自体を失効させる

3. **Cloud Run環境への環境変数設定**
   - `VITE_FIREBASE_*` をCloud Runの環境変数に追加（現在はハードコードフォールバックで動作）
   - `FIREBASE_PROJECT_ID=esticompare` も追加

4. **Firestoreルールのデプロイ**
   - `firestore.rules` はローカルで変更済みだが、まだFirebaseに反映されていない可能性がある
   - `firebase deploy --only firestore:rules` で確認・適用

---

## 既知の制限・AGENTS.md ルール

- 賃率は **100円単位** に丸める（hourlyRate, sgaRatePercent のみ調整可）
- 出来高(yieldPerHour)・段取時間(totalHours) は直接変更不可
- SGA% が 5%未満 / 30%超 の場合は警告を表示
- Geminiの無料枠対応で4秒インターバル制御あり（promiseキュー）
