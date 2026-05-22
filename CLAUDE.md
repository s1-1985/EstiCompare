# EstiCompare — Claude Code 設定

## セッション開始時の必須手順

**最初に必ず `HANDOVER.md` を読むこと。** プロジェクトの概要・技術スタック・ビジネスルール・前回までの作業内容がすべてそこに記載されている。

```
Read: /home/user/EstiCompare/HANDOVER.md
```

---

## 開発ルール

### ブランチ
- 作業は `claude/amazing-rubin-c23Ac` ブランチで行う
- `main` への直接 push 禁止（PR 経由のみ）
- push 後は必ず PR を作成（draft でよい）

### コミット
- 日本語コミットメッセージ可
- 末尾にセッション URL を付与（慣例）

### コード方針
- コメントは「なぜ（WHY）」が非自明なときだけ書く
- `alert()` / `prompt()` は既存コードの踏襲のみ。新規では使わない
- 賃率は必ず 100円単位（`Math.round(x / 100) * 100`）
- 「お化粧」という用語は絶対に使わない → 「数値調整」「辻褄合わせ」を使う

### AI 機能
- AI は Gemini API のみ（`@google/genai`）。Claude API は使わない
- グラウンディングは `responseSchema` と排他のため 2ステップ方式（`HANDOVER.md` 参照）

---

## 重要ビジネスルール（数値調整の優先順位）

見積の辻褄合わせで数値を調整する際の優先順位：

1. **賃率** `hourlyRate` — 最優先。100円単位、下限1,000円
2. **利管費率** `sgaRatePercent` — 最優先。正常範囲 5〜30%
3. **材料建値** `basePricePerKg` — 微調整のみ。市場相場から大きく離れない
4. **材料投入量** `inputWeightG` — **絶対に変更しない**
5. **目標単価** `targetUnitPrice` — 上方修正のみ可。`minProfitRate` 下限を下回らない
6. **出来高** `yieldPerHour` — 最終手段。新旧両方に影響するため極力後回し

---

## よく使うコマンド

```bash
# 開発サーバー起動
npm run dev

# ビルド確認
npm run build

# 型チェック（src のみ）
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "src/"
```
