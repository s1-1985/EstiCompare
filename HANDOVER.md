# EstiCompare 引き継ぎドキュメント

> **次セッション開始時は必ずこのファイルを最初に読むこと。**

---

## プロジェクト概要

製造業向け見積原価積算アプリ。旧見積と新見積を並べて比較・調整する。
元々ユーザーが Excel で手作業でやっていた「新旧単価の辻褄合わせ」を Web アプリ＋AI で自動化する。

- **本番 URL**: https://esticompare.web.app
- **リポジトリ**: https://github.com/s1-1985/EstiCompare
- **開発ブランチ**: `claude/amazing-rubin-c23Ac`（作業はここへ push → PR → main へマージ）

---

## 技術スタック

| レイヤー | 構成 |
|---|---|
| フロントエンド | React + TypeScript + Vite + Tailwind CSS |
| バックエンド | Express.js (`server.ts`) |
| AI | Gemini 2.0 Flash (`@google/genai` SDK) |
| 認証 | Firebase Auth（Google ログイン） |
| DB | Firestore（シナリオ保存） |
| ホスティング | Firebase Hosting（静的）+ Cloud Run（API） |
| CI/CD | GitHub Actions (`main` push → 自動デプロイ） |
| コンテナ | Docker → Artifact Registry `asia-northeast1-docker.pkg.dev/esticompare/esticompare/api` |

### GitHub Secrets（登録済み）
- `GCP_SA_KEY` — `github-deploy` サービスアカウント JSON
- `GEMINI_API_KEY` — Gemini API キー

---

## ドメイン知識（重要）

### データモデルの二重構造
各フィールドに「客提示用」と「実態値（社内）」の2系統がある。

| 項目 | 客提示用 | 実態値（社内） |
|---|---|---|
| 材料建値 | `basePricePerKg` | `actualBasePricePerKg?` |
| 賃率 | `hourlyRate` | `actualHourlyRate?` |
| 出来高 | `yieldPerHour` | `actualYieldPerHour?` |
| 段取時間 | `totalHours` | `actualTotalHours?` |
| 直接加工費 | `directProcessingCost` | `actualDirectProcessingCost?` |

### 利益計算方式
- **内掛け（gross margin）**: `margin = 1 - cost/price` → `price = cost / (1 - margin)` — 客先提示用
- **外掛け（markup）**: `margin = price/cost - 1` → `price = cost * (1 + margin)` — 社内目標利益率
- `targetProfitRate` は外掛け
- `targetProfitMarginOff` は内掛け（客先提示の利管費率）

### 賃率ルール
- 賃率は必ず **100円単位**（下二桁 00）
- 最低 1,000円/h 保証

### SGA（利管費率）正常範囲
- 5% 〜 30% が正常範囲
- この範囲を外れると警告表示

### auditVariance
- `grandTotalUnitPrice - sellingPrice` = 0.00 が目標
- これが 0 になれば辻褄が完全に合った状態

---

## 数値調整の優先順位（重要ビジネスルール）

旧→新見積の辻褄を合わせる際の調整レバーの優先順位：

| 優先度 | 調整対象 | 制約 |
|---|---|---|
| 1（最優先） | 賃率 `hourlyRate` | 100円単位、1,000円下限 |
| 1（最優先） | 利管費率 `sgaRatePercent` | 5〜30% 正常範囲内 |
| 2 | 材料建値 `basePricePerKg` | 市場相場から大きく離れない微調整のみ |
| 禁止 | 材料投入量 `inputWeightG` | **絶対に変更しない** |
| 3 | 目標単価 `targetUnitPrice` | 上方修正のみ可。`minProfitRate` による下限を下回らないこと |
| 最終手段 | 出来高 `yieldPerHour` | 新旧両方に影響するため極力後回し |

**用語注意**: 「お化粧」という表現は使わないこと。「数値調整」「辻褄合わせ」を使う。

---

## ファイル構成（主要）

```
EstiCompare/
├── src/
│   ├── App.tsx                    # ルートコンポーネント（認証・シナリオ管理）
│   ├── types.ts                   # 型定義（DetailedEstimate, ProcessRow 等）
│   ├── firebase.ts                # Firebase 初期化
│   ├── components/
│   │   ├── ExcelGrid.tsx          # メインUI（1000行超）
│   │   └── CompareResults.tsx     # 比較レポート表示
│   ├── utils/
│   │   ├── calculations.ts        # 全計算ロジック（純粋関数）
│   │   └── firestoreService.ts    # Firestore CRUD
│   └── data/
│       └── samples.ts             # サンプルシナリオ2件
├── server.ts                      # Express API + Gemini エンドポイント
├── firebase.json                  # Firebase Hosting 設定
├── firebase-applet-config.json    # Firebase クライアント設定
├── Dockerfile                     # Cloud Run 用
├── .github/workflows/deploy.yml   # CI/CD パイプライン
└── HANDOVER.md                    # このファイル
```

---

## API エンドポイント（server.ts）

| エンドポイント | 機能 | グラウンディング |
|---|---|---|
| `POST /api/infer-process-params` | 工程名→出来高・賃率・段取時間を AI 推定 | ✅ 市況リアルタイム検索 |
| `POST /api/compare-estimates` | 新旧見積の差異を AI 監査・交渉アジェンダ生成 | ✅ 材料相場・運賃リアルタイム検索 |
| `POST /api/generate-estimate` | 要件テキストから見積ゼロ生成 | ❌ |
| `POST /api/parse-estimate` | テキスト/Excel からパース | ❌ |

### グラウンディング実装方式
Gemini の Google Search グラウンディングは `responseSchema`（構造化出力）と同時使用不可のため、2ステップで実装：
1. `fetchMarketData()` — グラウンディング有効で市況テキスト取得
2. そのテキストをプロンプトにコンテキストとして注入 → 構造化出力呼び出し

---

## このセッションで行った作業

### バグ修正（PR #6 → main マージ済み）
1. **AI 工程インデックスマッピングバグ** (`ExcelGrid.tsx`): `isDirectInput` 工程がフィルタされると `res.index` がズレる問題 → 配列位置ベースのマッピングに修正
2. **netMaterialCost バグ** (`ExcelGrid.tsx`): `handleAutoReconcile` の材料費計算が `rawMaterialCost - scrapValue` になっていた → `calc.netMaterialCost` に修正（`Math.max(0, ...)` 保護付き）
3. **actHourlyRate undefined バグ** (`calculations.ts`): `actualProcessCosts` の計算で `actHourlyRate` が `undefined` の場合 NaN になっていた → `|| 0` ガード追加
4. **残置スクリプト削除**: `replace.ts`, `replace_keshou.ts`, `replace_ts.ts` を削除

### 機能追加
5. **Google Search グラウンディング** (`server.ts`): `infer-process-params` と `compare-estimates` に市況リアルタイム検索を追加
6. **materialName を API リクエストに追加** (`ExcelGrid.tsx`): 材料名をグラウンディングクエリに使用

### デザインリファクタリング（`claude/amazing-rubin-c23Ac` ブランチ、PR未作成）
- `App.tsx` + `ExcelGrid.tsx` のデザインを「いかにも AI 製」から「クリーンなビジネスツール」へ一新
- エメラルド系 → ブルー系 (`blue-600`) に統一
- `bg-slate-900` のダークパネルヘッダー撤廃 → 白背景
- `blur-3xl` 装飾光輪、絵文字ラベル、`animate-pulse` ステータスドット等を削除
- `rounded-2xl`、`shadow-2xl` 等の過剰装飾を削減

---

## 現在のブランチ状態

```
main
 └── claude/amazing-rubin-c23Ac  ← 現在の作業ブランチ（PR #6 マージ後も継続）
```

`claude/amazing-rubin-c23Ac` に未マージのコミットあり（デザイン改修・グラウンディング追加）。  
次セッションで PR を作成して main にマージする。

---

## 未着手・今後の課題

### 高優先度
- [ ] 新旧辻褄合わせの AI 自動化（現在の `handleAutoReconcile` はただの数学的逆算）
  - 上記「数値調整の優先順位」に従い、賃率 → SGA → 材料建値 → 目標単価 → 出来高の順で調整
  - Gemini の知識 + グラウンディング市況データで「現実的な数値」を提案する機能
- [ ] デザイン改修の PR 作成・main マージ・本番反映

### 中優先度
- [ ] `calculations.ts` に対するユニットテスト追加（純粋関数のみで書きやすい）
- [ ] `alert()` / `prompt()` をモーダル・トースト UI に置き換え
- [ ] `useMemo` を `calculateEstimate()` に適用（毎レンダー再計算を防ぐ）

### 低優先度
- [ ] `user: any` → `User | null` に型修正（App.tsx:26）
- [ ] サンプルシナリオ全 4 件の `adjustments.minProfitRate` を明示的に追加

---

## 開発メモ

- ユーザーは自分一人だけが使う（Blaze プラン、無料枠超えない想定）
- AI は Gemini API のみ使用（Claude API は高コストのため不使用）
- `handleAutoReconcile` は ExcelGrid.tsx 内に定義（`isNew: boolean` で旧/新を切り替え）
- サンプルデータ: `automotive-panel`（板金ブラケット）と `precision-turn`（切削ブッシュ）
- 工程 index=7 は `isDirectInput: true`（カチオン電着塗装、外注費の直接入力）← インデックスバグの原因だった箇所
