import { DetailedEstimate, ProcessRow, ProcessCalcMode, QuantityPattern, PatternProcessRate } from '../types';

// ─── 外掛け / 内掛け の正準定義（bizmemo準拠） ────────────────────────────────
// 外掛け(markup): 率は「売価」基準。 率 = (売価−原価)/売価、 売価 = 原価 ÷ (1 − 率)
// 内掛け(margin): 率は「原価」基準。 率 = (売価−原価)/原価、 売価 = 原価 × (1 + 率)
export type MarginMode = 'markup' | 'margin';

/** 原価と率から売価を求める */
export function sellFromCost(cost: number, ratePercent: number, mode: MarginMode): number {
  const r = ratePercent / 100;
  if (mode === 'markup') return r < 1 ? cost / (1 - r) : 0; // 外掛け
  return cost * (1 + r);                                     // 内掛け
}

/** 原価と売価から率(%)を求める */
export function rateFromCostSell(cost: number, sell: number, mode: MarginMode): number {
  if (cost <= 0 || sell <= 0) return 0;
  return mode === 'markup'
    ? (1 - cost / sell) * 100   // 外掛け = (売価−原価)/売価
    : (sell / cost - 1) * 100;  // 内掛け = (売価−原価)/原価
}

/** 売価と率から原価を逆算する */
export function costFromSell(sell: number, ratePercent: number, mode: MarginMode): number {
  const r = ratePercent / 100;
  if (mode === 'markup') return r < 1 ? sell * (1 - r) : 0; // 外掛け: 率≥100%は逆算不能→0
  return r > -1 ? sell / (1 + r) : 0;                       // 内掛け: 率≤-100%はゼロ除算/発散→0
}

/** 率を別方式へ換算する（外→内 / 内→外）。fromは元の方式。 */
export function convertRate(ratePercent: number, from: MarginMode): number {
  const r = ratePercent / 100;
  // 外掛けe=(s-c)/s, 内掛けi=(s-c)/c ⇒ i = e/(1-e), e = i/(1+i)
  if (from === 'markup') return r < 1 ? (r / (1 - r)) * 100 : 0; // 外→内
  return (r / (1 + r)) * 100;                                    // 内→外
}

export function resolveProcessCalcMode(proc: ProcessRow): ProcessCalcMode {
  if (proc.calcMode) return proc.calcMode;
  if (proc.isDirectInput) return 'direct';
  if (proc.kgPrice > 0) return 'kg';
  return 'standard';
}

/**
 * ベース見積に数量パターンの値（基準数・賃率・利管費・送料）を上書きした
 * 派生 DetailedEstimate を返す。出来高(yieldPerHour)・段取(totalHours)・
 * 材料・完成品重量はベース共通のまま（生産前提として固定）。
 * calculateEstimate にそのまま渡せる。
 */
export function applyPatternOverride(base: DetailedEstimate, pattern: QuantityPattern): DetailedEstimate {
  const processes = base.processes.map((proc) => {
    const r: PatternProcessRate | undefined = pattern.processRates[proc.index];
    if (!r) return proc;
    const mode = resolveProcessCalcMode(proc);
    const next = { ...proc };
    if (mode === 'standard' && typeof r.hourlyRate === 'number') next.hourlyRate = r.hourlyRate;
    else if (mode === 'kg' && typeof r.kgPrice === 'number') next.kgPrice = r.kgPrice;
    else if (mode === 'lump' && typeof r.lumpSumPrice === 'number') next.lumpSumPrice = r.lumpSumPrice;
    else if (mode === 'direct' && typeof r.directProcessingCost === 'number') next.directProcessingCost = r.directProcessingCost;
    return next;
  });
  return {
    ...base,
    baseLotSize: pattern.baseLotSize > 0 ? pattern.baseLotSize : base.baseLotSize,
    lotUnit: pattern.lotUnit || base.lotUnit,
    processes,
    logistics: {
      ...base.logistics,
      freightPerBox: typeof pattern.freightPerBox === 'number' ? pattern.freightPerBox : base.logistics.freightPerBox,
    },
    adjustments: {
      ...base.adjustments,
      targetUnitPrice: pattern.targetUnitPrice,
      targetPriceLocked: pattern.targetPriceLocked,
      sgaRatePercent: pattern.sgaRatePercent,
      sgaCalcMode: pattern.sgaCalcMode || base.adjustments.sgaCalcMode,
      sgaFixedAdjustment: pattern.sgaFixedAdjustment,
      otherAdjustment: pattern.otherAdjustment,
      // 仕入実費はLotごとに上書き可（未設定はbase流用）。実態利益率の算出に使う。
      actualPurchasePrice: typeof pattern.actualPurchasePrice === 'number'
        ? pattern.actualPurchasePrice
        : base.adjustments.actualPurchasePrice,
    },
  };
}

/** 空欄の数量パターンを1つ生成する（ロット未設定・賃率未入力の白紙Lot） */
export function createBlankPattern(label: string, lotUnit = '個', seed = 0): QuantityPattern {
  return {
    id: `qp-${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    baseLotSize: 0,
    lotUnit,
    targetUnitPrice: 0,
    sgaRatePercent: 15,
    sgaCalcMode: 'markup',
    sgaFixedAdjustment: 0,
    otherAdjustment: 0,
    processRates: {},
  };
}

/**
 * 1工程あたりの加工費/個を「サイクル費」と「段取費」に分解する。
 *  - standard: サイクル費 = 賃率 ÷ 出来高（ロット非依存）
 *              段取費   = 賃率 × 段取時間 ÷ ロット数（ロットで逓減 ＝ 数量で変動する本体）
 *  - kg/lump/direct: 段取の概念がないため全額をサイクル費として扱う
 * 複数数量パターンで「なぜ小ロットが高いか」を可視化するために使用する。
 */
export interface ProcessCostBreakdown {
  cycle: number;  // サイクル費/個
  setup: number;  // 段取費/個（ロットで逓減する変動要因）
  total: number;  // 加工費/個
}

export function calcProcessBreakdown(proc: ProcessRow, baseLotSize: number): ProcessCostBreakdown {
  if (!proc.processName.trim()) return { cycle: 0, setup: 0, total: 0 };
  const mode = resolveProcessCalcMode(proc);
  if (mode === 'direct') {
    const t = proc.directProcessingCost || 0;
    return { cycle: t, setup: 0, total: t };
  }
  if (mode === 'kg') {
    // finishedWeight は呼び出し側で別途扱うため、ここでは kg単価ベースの近似は行わず
    // calcClientCost と整合させるべく cycle 全額にはしない（kg は重量依存のため total を別途算出）
    return { cycle: 0, setup: 0, total: 0 };
  }
  if (mode === 'lump') {
    const t = baseLotSize > 0 ? ((proc.lumpSumPrice || 0) / baseLotSize) : 0;
    return { cycle: 0, setup: t, total: t }; // 一式はロットで割る＝段取的な逓減
  }
  // standard
  const cycle = proc.yieldPerHour > 0 ? (proc.hourlyRate || 0) / proc.yieldPerHour : 0;
  const setup = baseLotSize > 0 ? ((proc.totalHours || 0) * (proc.hourlyRate || 0)) / baseLotSize : 0;
  return { cycle, setup, total: cycle + setup };
}

/** ベース見積から数量パターンを1つ生成する（現在の賃率をスナップショット） */
export function createPatternFromEstimate(base: DetailedEstimate, label: string, lotSize: number): QuantityPattern {
  const processRates: Record<number, PatternProcessRate> = {};
  base.processes.forEach((proc) => {
    if (!proc.processName.trim()) return;
    const mode = resolveProcessCalcMode(proc);
    if (mode === 'standard') processRates[proc.index] = { hourlyRate: proc.hourlyRate };
    else if (mode === 'kg') processRates[proc.index] = { kgPrice: proc.kgPrice };
    else if (mode === 'lump') processRates[proc.index] = { lumpSumPrice: proc.lumpSumPrice || 0 };
    else if (mode === 'direct') processRates[proc.index] = { directProcessingCost: proc.directProcessingCost };
  });
  return {
    id: `qp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    baseLotSize: lotSize,
    lotUnit: base.lotUnit || '個/Lot',
    targetUnitPrice: base.adjustments.targetUnitPrice || 0,
    sgaRatePercent: base.adjustments.sgaRatePercent ?? 15,
    sgaCalcMode: base.adjustments.sgaCalcMode || 'markup',
    sgaFixedAdjustment: base.adjustments.sgaFixedAdjustment || 0,
    otherAdjustment: base.adjustments.otherAdjustment || 0,
    processRates,
    freightPerBox: base.logistics.freightPerBox,
  };
}

function calcClientCost(proc: ProcessRow, finishedWeightG: number, baseLotSize: number): number {
  if (!proc.processName.trim()) return 0;
  const mode = resolveProcessCalcMode(proc);
  switch (mode) {
    case 'direct':
      return proc.directProcessingCost || 0;
    case 'kg':
      return (finishedWeightG / 1000) * (proc.kgPrice || 0);
    case 'lump':
      return baseLotSize > 0 ? ((proc.lumpSumPrice || 0) / baseLotSize) : 0;
    default: {
      const perUnit = proc.yieldPerHour > 0 ? 1 / proc.yieldPerHour : 0;
      const setup = baseLotSize > 0 ? (proc.totalHours || 0) / baseLotSize : 0;
      return (perUnit + setup) * (proc.hourlyRate || 0);
    }
  }
}

function calcActualCost(proc: ProcessRow, finishedWeightG: number, baseLotSize: number): number {
  if (!proc.processName.trim()) return 0;
  // 実態加工費/個（調達先提示の内訳不明な加工費）が入っていれば、それを実態原価として直接使う。
  if (typeof proc.actualProcessingCostPerUnit === 'number' && proc.actualProcessingCostPerUnit > 0) {
    return proc.actualProcessingCostPerUnit;
  }
  const mode = resolveProcessCalcMode(proc);
  switch (mode) {
    case 'direct':
      return (proc.actualDirectProcessingCost ?? proc.directProcessingCost) || 0;
    case 'kg':
      return (finishedWeightG / 1000) * ((proc.actualKgPrice ?? proc.kgPrice) || 0);
    case 'lump': {
      const actual = proc.actualLumpSumPrice ?? proc.lumpSumPrice;
      return baseLotSize > 0 ? ((actual || 0) / baseLotSize) : 0;
    }
    default: {
      const rate = proc.actualHourlyRate ?? proc.hourlyRate;
      const hours = proc.actualTotalHours ?? proc.totalHours;
      const yield_ = proc.actualYieldPerHour ?? proc.yieldPerHour;
      const perUnit = yield_ > 0 ? 1 / yield_ : 0;
      const setup = baseLotSize > 0 ? (hours || 0) / baseLotSize : 0;
      return (perUnit + setup) * (rate || 0);
    }
  }
}

export interface CalculatedSection {
  // --- A. 客提示用（調整後のエクセル積算） ---
  rawMaterialCost: number;       // 素材料金額 (円)
  scrapValue: number;            // スクラップ金額 (円)
  netMaterialCost: number;       // 材料費/個 (①-②)
  
  processCosts: number[];        // 各工程の加工費 (円)
  totalProcessCost: number;      // 加工費合計 (円)
  
  primeCost: number;             // 直製造原価小計 (材料 + 加工)

  sgaCost: number;               // 利管費 (客提示用 = 直製造 * 客向利管率%)
  shippingCostPerUnit: number;   // 送料/個 (円)
  totalOtherExpenses: number;    // その他費用小計 (円)

  grandTotalUnitPrice: number;   // 御見積単価 (円) (客提出合計額、エクセルの合計)

  // --- B. 社内の本質（実態コスト・マージンなど） ---
  actualNetMaterialCost: number;    // 実際の実質材料費
  actualProcessCosts: number[];     // 実際の加工費
  actualTotalProcessCost: number;   // 実際の加工費合計
  actualPrimeCost: number;          // 実際の実製造直原価小計
  actualShippingCost: number;       // 実際の配送費
  actualTotalCost: number;          // 実際の社内実質仕入原価合計（調整なし。実取引仕入れ値＋配送など）

  // --- C. つじつま合わせシミュレーション結果 ---
  requiredSellingPrice: number;     // 社内規定マージン（外掛け）を満たす「目標売価」
  minRequiredSellingPrice: number;  // 下限利益率（外掛け）を満たす「下限売価」
  suggestedPurchasePriceForClient: number; // 客先用「架空仕入れ原価」(売価から内掛けで逆算したもの)
  makeupGapAmount: number;          // 架空原価と調整前実原価の差（ゲタの総額。この分を各項目に盛る必要がある）
  actualMarkupTotalAllocated: number; // ユーザーが実際に各項目に盛った上乗せ額 of 加工賃＋材料
  auditVariance: number;            // 最終見積額（客提出額）と「決定売価(売値)」のズレ（＝これが0になれば辻褄が完璧に合った）

  // 旧互換用
  adjustedSellingPrice: number;  // 調整後売価 (円)
  actualProfitRate: number;      // 実際利益率 (%)
  priceVarianceFromTarget: number; // 目標単価との差額 (円)
  actualProfitAmount: number;    // 実際の利益額 (円)
}

export function calculateEstimate(est: DetailedEstimate): CalculatedSection {
  const { material, processes, logistics, adjustments, baseLotSize, finishedWeightG } = est;

  // ==========================================
  // 1. 【客提示用原価（調整後）】の算出
  // ==========================================
  const rawMaterialCost = (material.inputWeightG / 1000) * material.basePricePerKg;
  const scrapValue = (material.scrapWeightG / 1000) * material.scrapPricePerKg;
  const netMaterialCost = Math.max(0, rawMaterialCost - scrapValue);

  const processCosts = processes.map((proc) => calcClientCost(proc, finishedWeightG, baseLotSize));

  const totalProcessCost = processCosts.reduce((a, b) => a + b, 0);
  const primeCost = netMaterialCost + totalProcessCost;

  // 利管費（bizmemo準拠）:
  //   外掛け(markup): 売価 = 原価/(1−率) ⇒ 利管費 = 原価 × 率/(1−率)
  //   内掛け(margin): 売価 = 原価×(1+率) ⇒ 利管費 = 原価 × 率
  const sgaRate = (adjustments.sgaRatePercent || 0) / 100;
  const sgaMode: MarginMode = adjustments.sgaCalcMode || 'markup';
  const sgaBase = sgaMode === 'markup'
    ? (sgaRate < 1 ? primeCost * sgaRate / (1 - sgaRate) : 0)
    : primeCost * sgaRate;
  const sgaCost = sgaBase + (adjustments.sgaFixedAdjustment || 0);
  // 送料/個: 直接入力(directShippingPerUnit>0)があれば優先。なければ 運賃/箱 ÷ 入数。
  const useDirectShip = typeof logistics.directShippingPerUnit === 'number' && logistics.directShippingPerUnit > 0;
  const shippingCostPerUnit = useDirectShip
    ? (logistics.directShippingPerUnit as number)
    : (logistics.qtyPerBox > 0 ? (logistics.freightPerBox / logistics.qtyPerBox) : 0);
  
  // 提示用総見積額 ＝ 材料費 ＋ 加工費 ＋ 利管費 ＋ 送料 ＋ 調整（型費は別途）
  const grandTotalUnitPrice = primeCost + sgaCost + shippingCostPerUnit + (adjustments.otherAdjustment || 0);

  // ==========================================
  // 2. 【社内実原価（実態コスト・調整前）】の算出
  // ==========================================
  const actualRawMaterialPrice = material.actualBasePricePerKg ?? material.basePricePerKg;
  const actualRawMaterialCost = (material.inputWeightG / 1000) * actualRawMaterialPrice;
  const actualNetMaterialCost = Math.max(0, actualRawMaterialCost - scrapValue);

  const actualProcessCosts = processes.map((proc) => calcActualCost(proc, finishedWeightG, baseLotSize));

  const actualTotalProcessCost = actualProcessCosts.reduce((a, b) => a + b, 0);
  const actualPrimeCost = actualNetMaterialCost + actualTotalProcessCost;
  
  const actFreight = logistics.actualFreightPerBox ?? logistics.freightPerBox;
  // 直接入力の送料/個がある場合は実態側もそれを使う（箱データが無くても送料を反映）
  const actualShippingCost = useDirectShip
    ? (logistics.directShippingPerUnit as number)
    : (logistics.qtyPerBox > 0 ? (actFreight / logistics.qtyPerBox) : 0);

  // 手動で入力した「実際の仕入単価」がある場合は、それを仕入原価(actualPrimeCost)の代わりに実質製造コストのベースにします。
  // これにより、電卓を使わずに「実際の仕入単価」から利益率・目標値・さらに架空仕入単価を逆算できます。
  const baseActualPrimeCost = (adjustments.actualPurchasePrice > 0)
    ? adjustments.actualPurchasePrice
    : actualPrimeCost;

  // 実原価総額（＝調整なしの本質原価、材料＋加工＋物流、型費は別途）
  const actualTotalCost = baseActualPrimeCost + actualShippingCost;

  // ==========================================
  // 3. 【つじつま合わせ（マージン）】シミュレーション
  // ==========================================
  const targetProfitDecimal = (adjustments.targetProfitRate || 0) / 100; // 例: 外掛け目標 25%
  const minProfitDecimal = (adjustments.minProfitRate || 0) / 100;       // 例: 外掛け下限 15%
  const clientMarginPercentDecimal = (adjustments.targetProfitMarginOff || 0) / 100; // 例: 15% (内掛け)
  
  // 社内マージン（外掛け 目標%/下限%）を満たす必要売価 ＝ 実原価 ÷ (1 − X%)
  const requiredSellingPrice = targetProfitDecimal < 1 ? actualTotalCost / (1 - targetProfitDecimal) : 0;
  const minRequiredSellingPrice = minProfitDecimal < 1 ? actualTotalCost / (1 - minProfitDecimal) : 0;

  // 決定売価（目標単価/売値。通常はユーザーが決めた or 調整の targetUnitPrice）
  const rawSellingPrice = adjustments.targetUnitPrice || grandTotalUnitPrice;

  // 重要：下限利益率の売価を下回らないように決定単価を引き上げる保護ルール
  const sellingPrice = (rawSellingPrice < minRequiredSellingPrice) ? minRequiredSellingPrice : rawSellingPrice;

  // 客提出見積において「内掛け X%」の利益と見せるために逆算される「提出用架空仕入れ原価（仕入単価）」
  // 内掛け: 売価 = 原価×(1+X%) ⇒ 提出用客向架空原価 ＝ 決定売価 ÷ (1 + X%)
  const suggestedPurchasePriceForClient = sellingPrice / (1 + clientMarginPercentDecimal);

  // 調整に必要な「ゲタ（上乗せ・調整）総額」 ＝ 架空原価 - 実情原価
  const makeupGapAmount = Math.max(0, suggestedPurchasePriceForClient - actualTotalCost);

  // 実際に各明細に盛った金額
  const actualMarkupTotalAllocated = (primeCost + shippingCostPerUnit) - (actualPrimeCost + actualShippingCost);

  // 辻褄監査差異 ＝ 見積書積み上げ合計 - 決定売価
  // これが「0.00」になれば、エクセル上完璧に客提出のつじつまが合ったことになる！
  const auditVariance = grandTotalUnitPrice - sellingPrice;

  // 旧仕様互換
  const adjustedSellingPrice = sellingPrice;
  const actualProfitRate = actualTotalCost > 0 ? ((sellingPrice - actualTotalCost) / sellingPrice) * 100 : 0;
  // Same as auditVariance; retained for backward compat with CompareResults
  const priceVarianceFromTarget = auditVariance;
  const actualProfitAmount = sellingPrice - actualTotalCost;

  // 裏での計算値は小数点第3位で四捨五入（浮動小数点の誤差をカット）
  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  return {
    rawMaterialCost:             r3(rawMaterialCost),
    scrapValue:                  r3(scrapValue),
    netMaterialCost:             r3(netMaterialCost),
    processCosts:                processCosts.map(r3),
    totalProcessCost:            r3(totalProcessCost),
    primeCost:                   r3(primeCost),
    sgaCost:                     r3(sgaCost),
    shippingCostPerUnit:         r3(shippingCostPerUnit),
    totalOtherExpenses:          r3(sgaCost + shippingCostPerUnit + (adjustments.otherAdjustment || 0)),
    grandTotalUnitPrice:         r3(grandTotalUnitPrice),

    actualNetMaterialCost:       r3(actualNetMaterialCost),
    actualProcessCosts:          actualProcessCosts.map(r3),
    actualTotalProcessCost:      r3(actualTotalProcessCost),
    actualPrimeCost:             r3(actualPrimeCost),
    actualShippingCost:          r3(actualShippingCost),
    actualTotalCost:             r3(actualTotalCost),

    requiredSellingPrice:        r3(requiredSellingPrice),
    minRequiredSellingPrice:     r3(minRequiredSellingPrice),
    suggestedPurchasePriceForClient: r3(suggestedPurchasePriceForClient),
    makeupGapAmount:             r3(makeupGapAmount),
    actualMarkupTotalAllocated:  r3(actualMarkupTotalAllocated),
    auditVariance:               r3(auditVariance),

    adjustedSellingPrice:        r3(adjustedSellingPrice),
    actualProfitRate:            r3(actualProfitRate),
    priceVarianceFromTarget:     r3(priceVarianceFromTarget),
    actualProfitAmount:          r3(actualProfitAmount),
  };
}
