# セッション引継ぎ資料
**作成日**: 2026-05-26  
**対象ブランチ**: `claude/cool-clarke-jz2pa`（PR #37 mainにマージ済み → 次作業は新ブランチで）  
**本番URL**: https://esticompare.web.app/  
**リポジトリ**: s1-1985/EstiCompare

---

## このセッションで完了した作業

### 1. Gemini 429エラー改善（PR #37 に含む）

| ファイル | 変更内容 |
|---------|---------|
| `server.ts` | `isDailyQuotaError()` 関数追加。エラーメッセージに `per_day` / `daily` / `resource_exhausted` が含まれる場合を1日上限（RPD）として検出し、`retryAfter: 0` を返す。`console.error` に `status` と `message` を追加（Cloud Runログで診断しやすく） |
| `src/utils/apiClient.ts` | `retryAfter === 0` = 1日上限シグナルとして扱い、62秒カウントダウンリトライをスキップ。即座に「翌朝9時JSTまで待機」メッセージを表示 |

### 2. UI大改修：左サイドバー＋スティッキー計算ヘッダー（PR #37 に含む）

**App.tsx**: ツールバーリボン廃止 → 左サイドバー化  
**ExcelGrid.tsx**: Section1（見積ロット・売値フィールド）廃止、共通諸元バンド廃止、minProfitRate削除

**新レイアウト構成:**
```
[App Header (sticky top)]
[左サイドバー(w-48, fixed) | 右エリア(flex-1)             ]
[  シナリオ操作ボタン       | スティッキー計算ヘッダー       ]
[  共通諸元入力             | メインスクロール領域            ]
[  旧単価KPI(㉑〜㉖)       |   ExcelGrid / CompareResults  ]
[  新単価KPI(㉗〜㉜)       |   / PrintSheet                ]
[Bottom Tab Bar (flex-none)]
```

**左サイドバーの現在の構成:**
- シナリオ操作ボタン
- 共通諸元: 品番、品名、材質・規格、材料投入量(g)、完成品重量(g)
  ※ **見積ロットは削除予定**（次のセッションで対応）
- 旧単価 KPI（橙 #B5451B ボーダー）:
  - ㉑ 仕入実費 → `oldCalc.grandTotalUnitPrice`（計算値・表示のみ）
  - ㉒ 現行売価 → `old.adjustments.targetUnitPrice`（入力）
  - ㉓ 利益率（外掛け）→ 計算値
  - ㉔ 利益率（内掛け）→ 計算値
  - ㉕ 粗利益/個 → 計算値
  - ㉖ 設定時期(yyyymm) → `old.date`（入力）
- 新単価 KPI（青 #1E3A5F ボーダー）:
  - ㉗ 仕入実費 → `newCalc.grandTotalUnitPrice`（計算値・表示のみ）
  - ㉘ 目標売値 → `new.adjustments.targetUnitPrice`（入力）
  - ㉙ 利益率（外掛け）→ 計算値
  - ㉚ 利益率（内掛け）→ 計算値
  - ㉛ 粗利益/個 → 計算値
  - ㉜ 下限利益率 → `new.adjustments.minProfitRate`（入力）

---

## 次のセッションでやること（ユーザー指示）

> ユーザーが指示途中で中断したため、要件を以下に記録。次セッションでそのまま実装に着手すること。

### 優先度高：サイドバー修正・機能追加

#### (1) 見積ロットをサイドバーから削除
- 旧/新それぞれ別々に設定するため、各列（ExcelGrid の Section1）に戻す
- ExcelGrid の Section1 に `baseLotSize` 入力フィールドを再追加

#### (2) 旧単価の仕入れ実費（㉑）を入力フィールド化
- 現在は `oldCalc.grandTotalUnitPrice`（計算値）として表示のみ
- **変更後**: ユーザーが実際の仕入れ単価を手入力できる入力フィールドに変更
- マッピング先: `old.adjustments.actualPurchasePrice`
- ㉑の計算表示は別行で残す（計算上の仕入実費として）、または入力値を優先する

**設計メモ**: 現在の `calculations.ts` に `actualPurchasePrice` がある:
```
const baseActualPrimeCost = (adjustments.actualPurchasePrice > 0)
  ? adjustments.actualPurchasePrice
  : actualPrimeCost;
```
つまり `actualPurchasePrice > 0` なら実入力値を実原価ベースとして使う設計になっている。
㉑をこの `actualPurchasePrice` の入力フィールドとして使う。

#### (3) 旧単価の設定時期（㉖）の活用
- 入力された yyyymm をもとに、旧単価の材料建値（`old.material.basePricePerKg`）の当時の相場水準をAIで調べる
- AIボタンを㉖に追加し、`/api/get-material-price-history` 的なエンドポイントを新設（または既存のGemini呼び出しを流用）
- 調べた結果を旧側の建値フィールドに自動入力（or 参考表示）する

#### (4) 新単価の仕入れ実費も入力フィールド化
- 現在は `newCalc.grandTotalUnitPrice`（計算値）表示のみ
- **変更後**: `new.adjustments.actualPurchasePrice` の入力フィールドとして追加
- ㉗ 仕入実費（計算上）とは別に、実際の仕入れ単価を入力できるようにする
- これにより実態の利益率（actualProfitRate）が正確に計算される

#### (5) ㉙㉚を目標利益率（外掛け/内掛け）に変更し、入力フィールド化

**変更後の㉗〜㉜:**
- ㉗ 仕入実費（計算上）→ `newCalc.grandTotalUnitPrice`（表示）
- ㉘ 目標売値 → `new.adjustments.targetUnitPrice`（入力）
- ㉙ **目標利益率（外掛け）** → `new.adjustments.targetProfitRate`（入力・連動）
- ㉚ **目標利益率（内掛け）** → 計算または `new.adjustments.targetProfitMarginOff`（入力・連動）
- ㉛ 粗利益/個 → 計算値
- ㉜ 下限利益率 → `new.adjustments.minProfitRate`（入力）

#### (6) ㉘㉙㉚の三連動ロジック（最重要機能）

**要件**: ㉘・㉙・㉚のいずれかを手入力すると、他の二つが自動計算で更新される。

**連動計算式:**
```
㉙外掛け = (㉘売値 - ㉗仕入実費) / ㉗仕入実費 × 100
㉚内掛け = (㉘売値 - ㉗仕入実費) / ㉘売値 × 100

逆算:
㉘売値 from ㉙外掛け: 売値 = ㉗仕入実費 × (1 + ㉙/100)
㉘売値 from ㉚内掛け: 売値 = ㉗仕入実費 / (1 - ㉚/100)
```

**実装方針（案）:**
- App.tsx の state から `focusedField: '㉘' | '㉙' | '㉚' | null` を持つ
- または入力時に「どのフィールドが最後に変更されたか」を追跡し、他フィールドを計算更新
- `targetUnitPrice`（㉘）と `targetProfitRate`（㉙）は既存フィールドに書き込む
- `targetProfitMarginOff`（㉚）は内掛け率として既存フィールドを流用（但し現在は「客向架空仕入計算用」として使われているので用途の整理が必要）

**注意**: `targetProfitMarginOff` は現在 ExcelGrid Section5 の「客向内掛け率（架空仕入原価算出用）」として使われている。サイドバーで「目標内掛け率」として使う場合、同じフィールドを流用するか、別フィールドを追加するかの設計判断が必要。

---

## アーキテクチャ概要

```
フロントエンド: React 19 + TypeScript + Vite + TailwindCSS v4
バックエンド:   Express + TypeScript (server.ts) → Cloud Run (60s timeout)
AI:            Google Gemini 2.0 Flash (@google/genai)
認証:          Firebase Auth (Google Sign-In)
DB:            Firestore
ホスティング:   Firebase Hosting
CI/CD:         GitHub Actions → mainブランチへのpush時のみ発火
```

**主要ファイル:**
```
src/
  App.tsx                    # メインアプリ、左サイドバー、KPI計算、ルーティング
  components/
    ExcelGrid.tsx            # Sheet1: 旧/新2カラム入力UI（最大のファイル）
    CompareResults.tsx       # Sheet2: AI監査結果表示
    PrintSheet.tsx           # Sheet3: A4印刷・Excel出力
    ScenarioLibrary.tsx      # シナリオ保存・検索・読込
  utils/
    calculations.ts          # calculateEstimate() — 全計算ロジック
    apiClient.ts             # apiPost() — Firebase Auth付きfetch + 429リトライ
    firestoreService.ts      # Firestore CRUD
  types.ts                   # 型定義
server.ts                    # Express API (Gemini呼び出し、認証ミドルウェア)
```

**計算の重要な仕様:**
- `grandTotalUnitPrice = primeCost + sgaCost + shippingCostPerUnit + otherAdjustment`
- 型費（`toolingCost`）は **単価に含めない**（別途請求）
- `actualProfitRate` = 内掛け: `(sellingPrice - actualTotalCost) / sellingPrice * 100`
- `targetProfitRate` / `minProfitRate` = 外掛け: `cost × (1 + rate%)`
- `actualPurchasePrice > 0` の場合、それを `baseActualPrimeCost` として実原価計算に使用

**proc.index に関する重要注意:**
- `proc.index` は **1始まり（1〜10）**
- `calc.processCosts[]` は **0始まり配列** → アクセスは `proc.index - 1`

---

## 最新コミット

```bash
# 現在のmainの最新
git log --oneline -5
```

- `a03740c` feat: 左サイドバー＋スティッキー計算ヘッダー UI大改修 + Gemini RPM/RPD エラー改善 (PR #37 merged)

## 次セッションの作業開始手順

```bash
# 新しいブランチで作業開始
git checkout main
git pull origin main
git checkout -b claude/[新ブランチ名]

# ローカル開発起動
npm run dev   # http://localhost:5173
```
