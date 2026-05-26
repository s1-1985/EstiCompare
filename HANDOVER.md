# EstiCompare — 引継ぎドキュメント

作成日: 2026-05-26（PR #42 マージ後更新）
ブランチ: `main`（全PR済み）

---

## プロジェクト概要

製造業向け「新旧見積比較システム」。サプライヤーからの価格改定要求に対し、旧単価と新単価を並べてコスト構造を分解・比較する。Google Gemini 2.0 Flash によるAI監査機能付き。

**本番URL**: `APP_URL` 環境変数で管理（Cloud Run）

---

## アプリの核心ビジネスロジック

客先に出す見積は**架空の内訳**。目的は以下2条件を同時に満たす辻褄合わせ：
- 社内規定: 実際の仕入原価に対して **外掛け25%以上** の利益を確保すること
- 客先基準: 客向け利益率は **内掛け15%以下** で提示すること（市場相場感）

ツールはその「ゲタ（上乗せ）」を各工程・材料費に分配する作業を支援する。

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
├── server.ts                        # Expressサーバー + APIエンドポイント
├── firestore.rules                  # Firestoreセキュリティルール（要デプロイ）
├── firebase.json                    # Firebase設定
├── .env                             # ローカル開発用（gitignore済み）
├── .env.example                     # 環境変数テンプレート
├── src/
│   ├── App.tsx                      # メインコンポーネント（認証・状態管理・固定ヘッダー）
│   ├── firebase.ts                  # Firebase初期化・認証関数
│   ├── types.ts                     # 型定義
│   ├── data/samples.ts              # サンプルシナリオ・空見積ファクトリ
│   ├── utils/
│   │   ├── apiClient.ts             # 認証付きfetchラッパー（Bearer token）
│   │   ├── calculations.ts          # 原価計算ロジック（calculateEstimate）
│   │   └── firestoreService.ts      # Firestore CRUD
│   └── components/
│       ├── ExcelGrid.tsx            # 入力ワークスペース（Sheet1）
│       ├── PrintSheet.tsx           # 印刷・Excel出力（Sheet3）
│       ├── CompareResults.tsx       # 差額分析・AI監査（Sheet2）
│       └── ScenarioLibrary.tsx      # 保存済みシナリオ一覧
```

---

## APIエンドポイント（server.ts）

全エンドポイントに **Firebase IDトークン認証（Bearer）+ IPレート制限（10req/min）** が必要。

| エンドポイント | 機能 |
|---------------|------|
| `POST /api/compare-estimates` | 新旧見積のAI監査レポート生成 |
| `POST /api/infer-process-params` | 工程名から出来高・賃率を推定 |
| `POST /api/calculate-shipping` | AIで送料試算（ヤマト/佐川目安） |
| `POST /api/get-scrap-price` | AIでスクラップ相場確認 |

---

## 重要な計算概念（calculations.ts）

```typescript
// 客提示用積み上げ（盛り後）
grandTotalUnitPrice = primeCost + sgaCost + shippingCostPerUnit + otherAdjustment

// 利管費（外掛け/内掛け切替: sgaCalcMode）
// 'markup':  sgaCost = primeCost * sgaRate
// 'margin':  sgaCost = primeCost * sgaRate / (1 - sgaRate)

// 社内実原価（actualPurchasePrice > 0 ならそちらを優先）
actualTotalCost = baseActualPrimeCost + actualShippingCost

// 架空仕入原価逆算（客先提出用）
sellingPrice = adjustments.targetUnitPrice || grandTotalUnitPrice
suggestedPurchasePriceForClient = sellingPrice * (1 - clientMarginPercentDecimal)
makeupGapAmount = max(0, suggestedPurchasePriceForClient - actualTotalCost)
// ↑ この額を材料費・加工費に分配してゲタを作る

// 辻褄チェック（0になれば完璧）
auditVariance = grandTotalUnitPrice - sellingPrice
```

---

## App.tsx の3値連動（㉘㉙㉚）

新単価パネルの「目標売値・外掛け率・内掛け率」は相互連動:
- `handleNew28Change(sell)` → 外掛け/内掛けを逆算
- `handleNew29Change(markup%)` → 売値/内掛けを逆算
- `handleNew30Change(margin%)` → 売値/外掛けを逆算

---

## 環境変数

`.env`（gitignore済み）に以下が必要：

```
GEMINI_API_KEY=...
FIREBASE_PROJECT_ID=esticompare
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

---

## マージ済みPR一覧

| PR | 内容 |
|---|---|
| #16〜#22 | デザイン刷新・セキュリティ強化・Firebase認証・Firestore CRUD |
| #39 | UI改善（文字サイズ・ラベル色・サイドバー幅・copyFullColumn） |
| #40 | 固定ヘッダー強化（計算仕入値常時表示・利益率リアルタイム） |
| #41 | 型費削除・差額/必要利益率表示・利管費外/内掛けモード切替（sgaCalcMode）・ヘッダー2列化 |
| #42 | 5提案一括実装（A〜E、下記参照） |

---

## PR #42 で実装した5機能

### A: スライド率一括転記（ExcelGrid.tsx）
- 新単価カラムのヘッダーに `%` 入力 + 「旧からスライド転記」ボタン
- 旧の全単価・賃率・送料に指定倍率をかけて新へコピー
- 賃率は100円単位に丸め
- `slideRate` state + `handleSlideFromOld()`

### B: 制約クリア状態バッジ（App.tsx）
- 固定ヘッダーの旧/新パネルに常時表示
- 「外✓25%」: 外掛け≥25% → 緑、未達 → 赤
- 「内✓15%」: 内掛け≤15% → 緑、超過 → 橙
- `oldMarkup` / `newMarkup` を元に判定（既存の変数を流用）

### C: 架空仕入原価逆算パネル（ExcelGrid.tsx）
- Section 1「仕入実費」直下に表示（`targetProfitMarginOff > 0` のとき）
- 「提出用仕入原価」= `suggestedPurchasePriceForClient`
- 「積み上げ不足（ゲタ）」= `makeupGapAmount`

### D: 変動要因メモ欄（ExcelGrid.tsx + types.ts）
- 各工程行の直下に琥珀色のテキスト入力（`proc.changeReason`）
- 材料セクションにも同フィールド（`est.material.changeReason`）
- `MaterialComputation.changeReason?: string` を types.ts に追加
- `ProcessRow.changeReason?: string` は以前から存在
- `updateProcessMeta` の既存ロジックで通る（numericKeysにないためそのまま代入）

### E: 客先提出前チェックリスト（PrintSheet.tsx）
- Sheet3 の印刷エリア末尾に表示
- チェック項目: 旧/新の外掛け≥25% / 旧/新の内掛け≤15% / 変動理由記載あり
- 全クリアで緑ヘッダー、未達で赤ヘッダー + ✅/❌ 表示
- 工程テーブルに `changeReason` を斜体サブ行で表示
- `buildChecklist()` ヘルパー関数を PrintSheet.tsx 内に追加

---

## 既知の課題・将来改善候補

- Excel出力（handleExcelDownload）で `changeReason` がまだ出力されていない
- スライド転記で調整（otherAdjustment）・sgaRatePercent はコピーしない（意図的）
- バンドルサイズが 1MB 超（XLSX.js が重い）→ 動的インポート検討余地あり

---

## ⚠️ まだ手動対応が必要なこと

1. **GCP Console → Firebase APIキーに制限を追加**
   - HTTPリファラー制限（本番ドメインのみ）
   - URL: `console.cloud.google.com/apis/credentials`

2. **旧APIキーの無効化**
   - 旧プロジェクト `gen-lang-client-0134924529` のキー `AIzaSyAN0NS3aROharFPAfOSqCBtBs0SFTtvcos` を無効化

3. **Firestoreルールのデプロイ**
   - `firebase deploy --only firestore:rules` で確認・適用

---

## 開発ルール（AGENTS.md準拠）

- 賃率は **100円単位** に丸める
- 出来高(yieldPerHour)・段取時間(totalHours) は直接変更不可
- SGA% が 5%未満 / 30%超 の場合は警告を表示
- Geminiの無料枠対応で4秒インターバル制御あり（promiseキュー）


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
