import { DetailedEstimate, ProcessRow } from '../types';

export interface CalculatedSection {
  rawMaterialCost: number;       // 素材料金額 (円)
  scrapValue: number;            // スクラップ金額 (円)
  netMaterialCost: number;       // 材料費/個 (①-②)
  
  processCosts: number[];        // 各工程の加工費 (円)
  totalProcessCost: number;      // 加工費合計 (円)
  
  primeCost: number;             // 小計 (材料費 + 加工費)

  sgaCost: number;               // 利管費 (円)
  shippingCostPerUnit: number;   // 送料/個 (円)
  totalOtherExpenses: number;    // その他費用小計 (円)

  grandTotalUnitPrice: number;   // 御見積単価 (円)

  // 調整シミュレーション
  adjustedSellingPrice: number;  // 調整後売価 (円)
  actualProfitRate: number;      // 実際利益率 (%)
  priceVarianceFromTarget: number; // 目標単価との差額 (円)
  actualProfitAmount: number;    // 実際の利益額 (円)
}

export function calculateEstimate(est: DetailedEstimate): CalculatedSection {
  const { material, processes, logistics, adjustments, baseLotSize, finishedWeightG } = est;

  // 1. 材料費
  const rawMaterialCost = (material.inputWeightG / 1000) * material.basePricePerKg;
  const scrapValue = (material.scrapWeightG / 1000) * material.scrapPricePerKg;
  const netMaterialCost = Math.max(0, rawMaterialCost - scrapValue);

  // 2. 加工費
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

  // 小計 (材料費 + 加工費)
  const primeCost = netMaterialCost + totalProcessCost;

  // 3. その他費用
  const sgaCost = primeCost * ((adjustments.sgaRatePercent || 0) / 100) + (adjustments.sgaFixedAdjustment || 0);
  const shippingCostPerUnit = logistics.qtyPerBox > 0 ? (logistics.freightPerBox / logistics.qtyPerBox) : 0;
  
  const totalOtherExpenses = (adjustments.toolingCost || 0) + sgaCost + shippingCostPerUnit + (adjustments.otherAdjustment || 0);

  // 4. 御見積単価
  const grandTotalUnitPrice = primeCost + totalOtherExpenses;

  // 5. 調整シミュレーション
  // 調整利益率(%)を指定したときの「調整後売価」 
  // 式：売価 = 原価 / (1 - 利益率)
  const targetProfitRateDecimal = (adjustments.targetProfitRate || 0) / 100;
  const adjustedSellingPrice = targetProfitRateDecimal < 1 
    ? (primeCost + (adjustments.toolingCost || 0) + shippingCostPerUnit) / (1 - targetProfitRateDecimal)
    : 0;

  // 実際利益率 (仕入単価 / 売価からの計算、あるいは御見積単価に対する実際仕入単価ベースでの利益率)
  // ここではExcel下部の「目標利益率」「実際の仕入単価」等に基づく
  // 実際利益率 = (実際の仕入単価 - 製造原価) / 実際の仕入単価 * 100
  // 製造原価を primeCost (材料+加工) + 送料 + 型費 と仮定
  const mfgCost = primeCost + shippingCostPerUnit + (adjustments.toolingCost || 0);
  const actualProfitRate = adjustments.actualPurchasePrice > 0
    ? ((adjustments.actualPurchasePrice - mfgCost) / adjustments.actualPurchasePrice) * 100
    : 0;

  const actualProfitAmount = adjustments.actualPurchasePrice - mfgCost;

  const priceVarianceFromTarget = grandTotalUnitPrice - (adjustments.targetUnitPrice || 0);

  return {
    rawMaterialCost,
    scrapValue,
    netMaterialCost,
    processCosts,
    totalProcessCost,
    primeCost,
    sgaCost,
    shippingCostPerUnit,
    totalOtherExpenses,
    grandTotalUnitPrice,
    adjustedSellingPrice,
    actualProfitRate,
    priceVarianceFromTarget,
    actualProfitAmount
  };
}
