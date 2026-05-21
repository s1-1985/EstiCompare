import { DetailedEstimate, ProcessRow } from '../types';

export interface CalculatedSection {
  // --- A. 客提示用（お化粧後のエクセル積算） ---
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
  actualTotalCost: number;          // 実際の社内実質仕入原価合計（お化粧なし。実取引仕入れ値＋配送など）

  // --- C. つじつま合わせシミュレーション結果 ---
  requiredSellingPrice: number;     // 社内規定マージン（外掛け）を満たす「必要売価」
  suggestedPurchasePriceForClient: number; // 客先用「架空仕入れ原価」(売価から内掛けで逆算したもの)
  makeupGapAmount: number;          // 架空原価とお化粧前実原価の差（ゲタの総額。この分を各項目に盛る必要がある）
  actualMarkupTotalAllocated: number; // ユーザーが実際に各項目に盛った上乗せ額の合計
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
  // 1. 【客提示用原価（お化粧後）】の算出
  // ==========================================
  const rawMaterialCost = (material.inputWeightG / 1000) * material.basePricePerKg;
  const scrapValue = (material.scrapWeightG / 1000) * material.scrapPricePerKg;
  const netMaterialCost = Math.max(0, rawMaterialCost - scrapValue);

  const processCosts = processes.map((proc) => {
    if (!proc.processName.trim()) return 0;

    if (proc.isDirectInput) {
      return proc.directProcessingCost || 0;
    }

    if (proc.kgPrice > 0) {
      return (finishedWeightG / 1000) * proc.kgPrice;
    }

    const minuteRate = (proc.hourlyRate || 0) / 60;
    const setupTimeMin = (proc.totalHours || 0) * 60;
    const workTimeMin = proc.yieldPerHour > 0 ? (60 / proc.yieldPerHour) : 0;

    const setupShare = baseLotSize > 0 ? (setupTimeMin / baseLotSize) : 0;
    return (setupShare + workTimeMin) * minuteRate;
  });

  const totalProcessCost = processCosts.reduce((a, b) => a + b, 0);
  const primeCost = netMaterialCost + totalProcessCost;

  // 利管費 (お化粧後の直製造原価に対して、客提出用マージン率（内掛け）を乗せて積み上げる)
  // エクセル再現：(材料費 + 加工費) * sgaRatePercent
  const sgaCost = primeCost * ((adjustments.sgaRatePercent || 0) / 100) + (adjustments.sgaFixedAdjustment || 0);
  const shippingCostPerUnit = logistics.qtyPerBox > 0 ? (logistics.freightPerBox / logistics.qtyPerBox) : 0;
  
  // 提示用総見積額 ＝ お化粧原価 ＋ その他 ＋ 型費 ＋ SGA利管費 ＋ 調整
  const grandTotalUnitPrice = primeCost + sgaCost + shippingCostPerUnit + (adjustments.toolingCost || 0) + (adjustments.otherAdjustment || 0);

  // ==========================================
  // 2. 【社内実原価（実態コスト・お化粧前）】の算出
  // ==========================================
  const actualRawMaterialPrice = material.actualBasePricePerKg ?? material.basePricePerKg;
  const actualRawMaterialCost = (material.inputWeightG / 1000) * actualRawMaterialPrice;
  const actualNetMaterialCost = Math.max(0, actualRawMaterialCost - scrapValue);

  const actualProcessCosts = processes.map((proc) => {
    if (!proc.processName.trim()) return 0;

    const actualDirect = proc.actualDirectProcessingCost ?? proc.directProcessingCost;
    if (proc.isDirectInput) {
      return actualDirect || 0;
    }

    if (proc.kgPrice > 0) {
      return (finishedWeightG / 1000) * proc.kgPrice;
    }

    const actHourlyRate = proc.actualHourlyRate ?? proc.hourlyRate;
    const actTotalHours = proc.actualTotalHours ?? proc.totalHours;
    const actYield = proc.actualYieldPerHour ?? proc.yieldPerHour;

    const minuteRate = (actHourlyRate || 0) / 60;
    const setupTimeMin = (actTotalHours || 0) * 60;
    const workTimeMin = actYield > 0 ? (60 / actYield) : 0;

    const setupShare = baseLotSize > 0 ? (setupTimeMin / baseLotSize) : 0;
    return (setupShare + workTimeMin) * minuteRate;
  });

  const actualTotalProcessCost = actualProcessCosts.reduce((a, b) => a + b, 0);
  const actualPrimeCost = actualNetMaterialCost + actualTotalProcessCost;
  
  const actFreight = logistics.actualFreightPerBox ?? logistics.freightPerBox;
  const actualShippingCost = logistics.qtyPerBox > 0 ? (actFreight / logistics.qtyPerBox) : 0;

  // 手動で入力した「実際の仕入単価」がある場合は、それを仕入原価(actualPrimeCost)の代わりに実質製造コストのベースにします。
  // これにより、電卓を使わずに「実際の仕入単価」から利益率・目標値・さらに架空仕入単価を逆算できます。
  const baseActualPrimeCost = (adjustments.actualPurchasePrice > 0)
    ? adjustments.actualPurchasePrice
    : actualPrimeCost;

  // 実原価総額（＝お化粧なしの本質原価、材料＋加工＋物流＋型費）
  const actualTotalCost = baseActualPrimeCost + actualShippingCost + (adjustments.toolingCost || 0);

  // ==========================================
  // 3. 【つじつま合わせ（マージン）】シミュレーション
  // ==========================================
  const internalMarkupPercentDecimal = (adjustments.targetProfitRate || 0) / 100; // 例: 25% (外掛け)
  const clientMarginPercentDecimal = (adjustments.targetProfitMarginOff || 0) / 100; // 例: 15% (内掛け)
  
  // 社内マージン（外掛け Z%）を満たす必要売価 ＝ 実原価 * (1 + Z%)
  const requiredSellingPrice = actualTotalCost * (1 + internalMarkupPercentDecimal);

  // 決定売価（目標単価/売値。通常はユーザーが決めた or 目標の targetUnitPrice）
  const sellingPrice = adjustments.targetUnitPrice || grandTotalUnitPrice;

  // 客提出見積において「内掛け X%」の利管費と見せるために逆算される「提出用架空仕入れ原価（仕入単価）」
  // 提出用客向架空原価 ＝ 決定売価 * (1 - X%)
  const suggestedPurchasePriceForClient = sellingPrice * (1 - clientMarginPercentDecimal);

  // お化粧に必要な「ゲタ（上乗せ・調整）総額」 ＝ 架空原価 - 実情原価
  const makeupGapAmount = Math.max(0, suggestedPurchasePriceForClient - actualTotalCost);

  // 実際に各明細に盛った金額（お化粧後の提示用直原価 - 実際直原価 + 送料差異）
  const actualMarkupTotalAllocated = (primeCost + shippingCostPerUnit) - (actualPrimeCost + actualShippingCost);

  // 辻褄監査差異 ＝ 見積書積み上げ合計 - 決定売価
  // これが「0.00」になれば、エクセル上完璧に客提出のつじつまが合ったことになる！
  const auditVariance = grandTotalUnitPrice - sellingPrice;

  // 旧仕様互換
  const adjustedSellingPrice = sellingPrice;
  const actualProfitRate = actualTotalCost > 0 ? ((sellingPrice - actualTotalCost) / sellingPrice) * 100 : 0;
  const priceVarianceFromTarget = grandTotalUnitPrice - sellingPrice;
  const actualProfitAmount = sellingPrice - actualTotalCost;

  return {
    rawMaterialCost,
    scrapValue,
    netMaterialCost,
    processCosts,
    totalProcessCost,
    primeCost,
    sgaCost,
    shippingCostPerUnit,
    totalOtherExpenses: sgaCost + shippingCostPerUnit + (adjustments.toolingCost || 0) + (adjustments.otherAdjustment || 0),
    grandTotalUnitPrice,

    actualNetMaterialCost,
    actualProcessCosts,
    actualTotalProcessCost,
    actualPrimeCost,
    actualShippingCost,
    actualTotalCost,

    requiredSellingPrice,
    suggestedPurchasePriceForClient,
    makeupGapAmount,
    actualMarkupTotalAllocated,
    auditVariance,

    adjustedSellingPrice,
    actualProfitRate,
    priceVarianceFromTarget,
    actualProfitAmount
  };
}
