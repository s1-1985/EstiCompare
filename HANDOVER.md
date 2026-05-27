# EstiCompare — 引継ぎドキュメント

最終更新: 2026-05-27（第2セッション終了時点）
ブランチ: `main`（全PR済み）

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
