# EstiCompare — 引継ぎドキュメント

最終更新: 2026-05-29（第8セッション終了時点）
ブランチ: `main`（全PR済み、PR #57マージ済み）

---

## プロジェクト概要

製造業向け「新旧見積比較システム」。サプライヤーからの価格改定要求に対し、旧単価と新単価を並べてコスト構造を分解・比較する。Google Gemini 2.5 Flash によるAI機能付き。

**本番URL**: `https://esticompare.web.app`（Firebase Hosting + Cloud Run）

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
| AI | Google Gemini **2.5 Flash**（`@google/genai`） |
| 認証 | Firebase Auth（Google Sign-In ポップアップ） |
| DB | Firestore |
| セキュリティ | firebase-admin, helmet, cors, express-rate-limit |
| インフラ | Cloud Run（asia-northeast1）+ Firebase Hosting |
| CI/CD | GitHub Actions（`.github/workflows/deploy.yml`） |

---

## ファイル構成（重要ファイル）

```
EstiCompare/
├── server.ts                        # Expressサーバー + APIエンドポイント
├── firebase.json                    # Firebase Hosting rewrite設定（/api/**→Cloud Run）
├── .github/workflows/deploy.yml    # CI/CDパイプライン
├── Dockerfile                       # Cloud Run用
├── firestore.rules                  # Firestoreセキュリティルール
├── .env.example                     # 環境変数テンプレート
└── src/
    ├── App.tsx                      # メインコンポーネント（認証・状態管理・固定ヘッダー）
    ├── firebase.ts                  # Firebase初期化（ハードコードフォールバックあり）
    ├── types.ts                     # 型定義
    ├── data/samples.ts              # サンプルシナリオ・空見積ファクトリ
    ├── utils/
    │   ├── apiClient.ts             # 認証付きfetchラッパー（Bearer token・429自動リトライ）
    │   ├── calculations.ts          # 原価計算ロジック（calculateEstimate）
    │   └── firestoreService.ts      # Firestore CRUD
    └── components/
        ├── ExcelGrid.tsx            # 入力ワークスペース（Sheet1）
        ├── PrintSheet.tsx           # 印刷・Excel出力（Sheet3）
        ├── CompareResults.tsx       # 差額分析・AI監査（Sheet2）
        └── ScenarioLibrary.tsx      # 保存済みシナリオ一覧
```

---

## APIエンドポイント（server.ts）

全エンドポイントに **Firebase IDトークン認証（Bearer）+ IPレート制限（10req/min）** が必要。

| エンドポイント | 機能 |
|---------------|------|
| `POST /api/ping-ai` | AI接続確認（デモボタン用） |
| `POST /api/parse-estimate` | テキストを見積JSONに変換 |
| `POST /api/compare-estimates` | 新旧見積のAI監査レポート生成 |
| `POST /api/generate-estimate` | 仕様から見積自動生成 |
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

// 辻褄チェック（0になれば完璧）
auditVariance = grandTotalUnitPrice - sellingPrice
```

---

## レイアウト構造（App.tsx）

固定ヘッダーに旧/新の2カラムパネルがあり、各パネルに以下を格納：
- 共通メタ情報（品番・品名・材質・重量など）
- 計算仕入値・目標売値
- **セクション5: 利益・利管費設定**（目標利益率・下限利益率・利管費率・自動整合ボタン）
- **ProfitGauge**（利益率ビジュアル）
- **セクション6: 計算結果**（材料費・加工費・利管費・御見積単価）

スクロール領域（ExcelGrid）には セクション1〜4（材料・工程・物流）のみ。

---

## CI/CDパイプライン（deploy.yml）

**mainへのpushで自動実行**。処理順：
1. checkout / setup-node / npm ci / npm run build
2. gcloud認証（`GCP_SA_KEY` SecretからJSONファイル生成、`GOOGLE_APPLICATION_CREDENTIALS`にセット）
3. Docker build & push（Artifact Registry）
4. Cloud Run deploy（`GEMINI_API_KEY` を `--set-env-vars` で注入）
5. Firebase Hosting deploy
6. Firestore Rules deploy
7. クレデンシャルファイル削除（`if: always()`）

**重要**: `google-github-actions/auth` と `google-github-actions/setup-gcloud` は削除済み（codeload.github.comからの断続的なダウンロード障害のため）。直接gcloudコマンドを使用。

---

## Gemini APIキー

- **現在使用中のプロジェクト**: EstiCompareプロジェクト（AI Studio、無料枠）
- **GitHub Secret名**: `GEMINI_API_KEY`
- **モデル**: `gemini-2.5-flash`（全エンドポイント共通）
- **注意**: `gemini-2.0-flash` は新規ユーザーには使用不可（404エラー）

キーが無効になった場合：AI Studio → Get API key → 削除して再作成 → GitHub Secrets更新 → mainにpush

---

## マージ済みPR一覧

| PR | 内容 |
|---|---|
| #16〜#22 | デザイン刷新・セキュリティ強化・Firebase認証・Firestore CRUD |
| #39 | UI改善（文字サイズ・ラベル色・サイドバー幅・copyFullColumn） |
| #40 | 固定ヘッダー強化（計算仕入値常時表示・利益率リアルタイム） |
| #41 | 型費削除・差額/必要利益率表示・利管費外/内掛けモード切替 |
| #42 | スライド転記・制約バッジ・架空仕入逆算・変動メモ・チェックリスト |
| #44 | セクション5・ProfitGauge・セクション6を固定ヘッダーへ移動 |
| mainへ直接 | CI/CDパイプライン修正・Geminiモデル更新・AIデモボタン追加 |
| #45 | 固定ヘッダー2列コンパクト化・帳尻利管費率表示・旧単価上限利益率追加 |
| #46 | 新旧整合チェック・賃率警告・売値フロア・調整ナビ・客向け内掛け表示 |
| #47 | リサイズ可能分割ペイン・マイシナリオ/Sheet2/Sheet3 全幅表示 |
| #48 | 新単価パネル：目標利益率入力時に対応する目標単価を直下表示 |
| #49 | ウォーターフォール削除・行アライン修正・grandTotalラベル変更・lot初期値修正 |
| #50 | 上部パネルに5指標ストリップ表示・サイドバー横幅リサイズ・工程行に分単価表示 |
| #51 | 指標ストリップ視認性強化・計算式修正・AIブロッキングモーダル・SGA下限1%保証 |

---

## 第1セッション（2026-05-27 前半）で解決した問題

### CI/CDパイプライン
- `google-github-actions/auth@v2` / `setup-gcloud@v2` のダウンロード障害 → 直接gcloudコマンドに置き換え
- Firebase認証エラー（`GOOGLE_APPLICATION_CREDENTIALS` の設定タイミング）→ クリーンアップステップを最後に移動

### Gemini API
- `API_KEY_INVALID` → AIStudioのEstiCompareプロジェクトのキーに更新
- `gemini-2.0-flash` は新規ユーザー不可（404）→ `gemini-2.5-flash` に全更新
- `User-Agent: aistudio-build` ヘッダー削除（Cloud Run環境では不要）
- エラーメッセージを実際のエラー内容が見えるよう改善

### AIデモボタン
- 画面右下に「⚡ AI疎通確認」フローティングボタン追加
- `/api/ping-ai` POST（認証あり）で接続確認
- ログイン未済の場合はエラーメッセージ表示

---

## 第2セッション（2026-05-27 後半）で実施した変更（PR #45）

### ビジネスロジックの再整理（ユーザーから詳細説明）
- **旧単価**: 売値は固定。材料費・加工費を積み上げて架空仕入れを膨らませ、客向け内掛け利益率≤15%に見せる
- **新単価**: 実仕入増加分を踏まえ、外掛け25%以上確保できる新売値を設定しつつ同様の架空内訳を作る
- **最終調整**: 「材料費+加工費（primeCost）に対して何%の内掛け利管費をかければ目標売値に帳尻が合うか」が重要指標

### 実装内容
1. **旧単価の下限利益率 → 上限利益率** (`maxProfitRate`)
   - 旧単価は売値固定なので下限より上限が意味を持つ
   - `types.ts` に `maxProfitRate?: number` 追加
   - サイドバーと固定ヘッダーSection 5 で置き換え

2. **固定ヘッダー Section 5 を2列コンパクト化**
   - 各フィールドをgridで2列に配置 → 縦スペース半減
   - 内部スクロール解消（`max-h-[calc(50vh)]` + `overflow-y-auto` 削除）

3. **帳尻利管費率（内掛け）を常時表示**
   - 計算式: `(1 - primeCost / (targetSell - shipping - other)) × 100`
   - Section 5 内にハイライトボックスで常時表示
   - 客向内掛け率の設定値と一致したとき緑色、不一致は琥珀色

4. **スピナー削除**: `index.css` で `input[type=number]` にグローバル適用

5. **0固定フォーム修正**: `?? ''` → `|| ''` で値が0のとき空欄表示
   - 対象: `sgaFixedAdjustment`, `targetProfitMarginOff`, `otherAdjustment`, `targetProfitRate`

---

## 第3セッション（2026-05-27 夜）で実施した変更（PR #46）

ユーザーから詳細な業務フロー説明を受け、作業の「詰まりポイント」に着目した5つのUX改善を実装。

### 実装内容

1. **新旧整合性チェック（提案1）** — `ExcelGrid.tsx`
   - 新単価の工程テーブルに旧単価の出来高・段取りを参照表示
   - 不一致があれば赤字「⚠ 不一致」警告
   - **制約**: 同一設備では出来高・段取りが新旧同一でなければならないため

2. **賃率妥当性警告（提案4）** — `ExcelGrid.tsx`
   - 賃率が旧比1.5倍以上で黄、2倍以上で橙、3倍超で赤バッジ
   - **制約**: 設備変更なしに賃率を大幅変更すると客先説明が困難なため

3. **外掛け25%フロア（最低売値）表示（提案2）** — `App.tsx`
   - 新単価KPIに `actualTotalCost × 1.25` を常時表示
   - 目標売値との余裕/不足を色分け

4. **調整優先順位ナビ（提案3）** — `App.tsx`
   - 帳尻ズレ時に「①工程確認→②材料/賃率調整→③利管費率設定」を表示
   - ③は帳尻利管費率の具体値を案内

5. **材工費ベース客向け内掛け率（提案5）** — `App.tsx`
   - `(売値 - primeCost) / 売値 × 100` を両パネルに常時表示
   - 15%以内なら緑（積み上げ充足）、超過で赤（まだ積み上げ不足）
   - 目標架空仕入げへの達成度プログレスバーも追加

---

## 第4セッション（2026-05-27 深夜）で実施した変更（PR #47）

上部固定ヘッダーがデータ入力で画面下まで伸びてしまう問題と、マイシナリオ/Sheet2/Sheet3の表示領域問題を修正。

### 実装内容

1. **リサイズ可能な分割ペイン** — `App.tsx`
   - 上部固定ヘッダーをデフォルト40%高さに制限（20〜75%の範囲でドラッグ調整可）
   - `headerHeightPct` state + `isDraggingRef` + `rightPaneRef` で実装
   - `mousemove`/`mouseup` ウィンドウイベントで高さ計算

2. **パネル内部スクロール**
   - 旧単価/新単価 各パネルの body に `overflow-y-auto` を追加
   - ヘッダー面積が固定されたまま、入力内容が増えても内部スクロールで対応

3. **マイシナリオ/Sheet2/Sheet3 で右半分全体を使用**
   - `showFixedHeader = activeView === 'workspace' && activeSheetTab === 'workspace'` で制御
   - ワークスペース以外のビューでは固定ヘッダー非表示 → 全高をコンテンツに割当

---

## 第5セッション（2026-05-28）で実施した変更（PR #50）

### 実装内容

1. **上部パネル（旧/新）に5指標ストリップ追加** — `App.tsx`
   - 各パネル上部に固定表示（スクロール非対象）
   - 表示項目: 見積単価（売値）・積み上げ単価・実態利管費率・架空利管費率・実態利益率（外掛け）
   - `架空利管費率`: `targetProfitMarginOff` 未設定時は「—」表示
   - `実態利管費率`: `actualTotalCost` ベースで計算（従来は `actualPrimeCost` ベースで誤値）
   - `見積単価`: `targetUnitPrice` 優先、未入力なら `grandTotalUnitPrice`

2. **サイドバー横幅リサイズ** — `App.tsx`
   - 初期幅230px（従来288pxの約80%）
   - サイドバーと右ペインの境界にドラッグハンドル追加
   - `sidebarWidthPx` state + `isSidebarDragging` ref + mousemove/mouseup イベントで制御
   - min: 150px, max: 380px

3. **工程行に分単価表示** — `ExcelGrid.tsx`
   - 各工程行の2行目（小さめ）に追加表示:
     - 段取(h) 下: `${Math.round(totalHours * 60)}分`
     - 客提示賃率 下: `${(hourlyRate / 60).toFixed(1)}円/分`
     - 実態賃率 下: `${(actualHourlyRate ?? hourlyRate / 60).toFixed(1)}円/分`

---

## 第6セッション（2026-05-29）で実施した変更（PR #51）

### 実装内容

1. **指標ストリップ視認性強化** — `App.tsx`
   - ラベル: 9px → より明瞭な色・サイズ
   - 値: `text-sm`（14px）で大きく表示
   - 各指標間に `border-r` 区切り線追加

2. **実態利管費率の計算式修正** — `App.tsx`
   - 旧: `sgaCost / actualPrimeCost`（誤）
   - 新: `sgaCost / actualTotalCost`（正）
   - `actualPurchasePrice` 入力時は `actualTotalCost` がそれを使うため、正確な実態ベースを反映

3. **架空利管費率の0%誤表示修正** — `App.tsx`
   - `targetProfitMarginOff = 0` の場合、`suggestedPurchasePriceForClient = sellingPrice` となり差額が0 → 0%が表示されていた
   - 修正: `hasOffset` フラグで `targetProfitMarginOff > 0` のときのみ計算・表示、未設定は「—」

4. **下部スクロール欄の重複「積み上げ単価」行を削除** — `App.tsx`
   - 旧/新両パネルのスクロール領域から `grandTotalUnitPrice` 行を削除（上部ストリップに移動済み）

5. **一発自動整合のSGA率 1〜15%強制** — `App.tsx` `handleAutoReconcile`
   - 工程賃率スケール後にSGA率を計算し、1%未満の場合は目標単価を引き上げ
   - 引き上げ後のSGA率が1〜15%に収まるよう再計算
   - 下限利益率（`minProfitRate`）との整合も維持

6. **AIブロッキングモーダル** — `ExcelGrid.tsx`
   - `aiModal` state追加: `{ label, status: 'loading'|'success'|'error', message? }`
   - AI処理中: fixed オーバーレイ（z-9999）+ スピナーで他操作ブロック
   - 成功: ✓アイコン + 2.5秒後に自動クローズ
   - 失敗: ✗アイコン + エラーメッセージ + 手動クローズボタン（4秒後自動解除も併用）
   - 対象ボタン: AI自動設定・送料試算・スクラップ単価

---

## 第7セッション（2026-05-29）で実施した変更（PR #53〜#57）

### PR #53: 実態管理費率の計算式修正
- 旧: SGAコストベース（誤）
- 新: `(売値 - 架空送料 - primeCost) / (売値 - 架空送料) × 100`（内掛け）
- 「実態利管費率」→「架空利管費率」にラベル名変更

### PR #54: 大規模UI再構成
- 警告メッセージをヘッダーバナーへ移動（警告アクティブ時に色変化）
- 積み上げ単価を `grandTotalUnitPrice` に修正
- 指標ストリップを4列化（重複列削除）
- 「見積単価(売値)」→ 旧=「現行単価」, 新=「目標単価」にリネーム
- 上部パネルから目標利益率/上限利益率入力欄を削除（サイドバーと重複）
- 直製造原価を計算結果から削除
- `handleAutoReconcile` のSGA下限を1%→5%に引き上げ

### PR #55: AlertTriangle import漏れ修正（ホットフィックス）
- App.tsx に AlertTriangle を lucide-react からインポートするのを忘れてページクラッシュ → 修正

### PR #56: 大規模修正・機能追加
- 実態利益率: `actualPurchasePrice` を直接使用（二重計上バグ修正）。仕入実費80, 売値104 → 30%が正しく表示
- 積み上げ達成バー: `grandTotalUnitPrice / 売値` の比率に修正
- 積み上げ-目標差の符号修正: `grandTotalUnitPrice - sell`（負 = 不足）
- 目標単価ロックボタン（🔒）を新単価パネルに追加（`targetPriceLocked` フィールドを `types.ts` に追加）
- `handleAutoReconcile` を旧/新で挙動分離:
  - 旧単価: 売値固定・賃率比例調整・SGA率範囲内クランプ
  - 新単価ロック: 目標単価固定
  - 新単価フリー: 下限利益率制約で目標単価調整
- 帳尻利管費率: 内掛け・外掛けを並列表示
- 内掛け/外掛けトグル → ピル型スイッチUIに変更
- 仕入実費を上部指標ストリップの1列目に追加（5列構成）
- 警告バナーを2行に拡大
- 左サイドバー: 旧単価 `bg-[#FFF5F2]`、新単価 `bg-[#F0F5FF]` で色分け
- 丸数字ラベル（㉑㉒㉓等）を全削除
- ExcelGrid のテキスト色を濃く変更（`#9C9490` → `#3A3028`）
- 各種数値を小数点第2位まで表示（`toFixed(2)`）

### PR #57: 旧単価の一発自動整合の挙動明確化
- 旧単価の `handleAutoReconcile`: 売値（targetUnitPrice）は絶対固定
- 架空の工程賃率を比例スケールして帳尻合わせ（元の挙動を明文化・保持）

---

## 既知の課題・次セッションの予定

- Excel出力で `changeReason` がまだ出力されていない
- バンドルサイズが 1MB 超（XLSX.js が重い）→ 動的インポート検討余地あり
- その他UIの改善（次回指示予定）

---

## ⚠️ まだ手動対応が必要なこと

1. **GCP Console → Firebase APIキーに制限を追加**
   - HTTPリファラー制限（本番ドメインのみ）
   - URL: `console.cloud.google.com/apis/credentials`

2. **旧APIキーの無効化**
   - Blueprint23Dプロジェクトなど不要になったキーを無効化

3. **Firestoreルールのデプロイ確認**
   - `firebase deploy --only firestore:rules`

---

## 開発ルール

- 賃率は **100円単位** に丸める
- SGA% が 5%未満 / 30%超 の場合は警告を表示
- Gemini呼び出しは4秒インターバル制御あり（promiseキュー）
- エラーは `sendApiError()` で統一処理（実エラー内容をログ出力、クライアントには適切なメッセージ）
