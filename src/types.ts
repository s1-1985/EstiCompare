export interface ProcessRow {
  index: number;
  processName: string;      // 工程
  workContent: string;      // 作業内容
  hourlyRate: number;       // 賃率 (円/h)
  totalHours: number;       // 総取扱時間 (h)
  yieldPerHour: number;     // 出来高 (個/h)
  kgPrice: number;          // Kg単価
  isDirectInput: boolean;   // 直接入力フラグ
  directProcessingCost: number; // 直接入力・加工費
}

export interface MaterialComputation {
  materialName: string;    // 材質・寸法
  inputWeightG: number;    // 材料投入量 (g)
  basePricePerKg: number;  // 建値 (円/kg)
  scrapWeightG: number;    // スクラップ重量 (g)
  scrapPricePerKg: number; // スクラップ単価 (円/kg)
}

export interface LogisticsComputation {
  qtyPerBox: number;       // 1箱の入数
  freightPerBox: number;   // 1箱の運賃
}

export interface AdvancedAdjustment {
  targetProfitRate: number;      // 調整利益率 (%)
  targetUnitPrice: number;       // 目標単価 (円)
  targetProfitMarginOff: number;  // 目標利益率 (%)
  actualPurchasePrice: number;    // 実際の仕入単価 (円)
  sgaRatePercent: number;        // 利管費率 (%) - 例: 5% など
  sgaFixedAdjustment: number;    // 利管費固定調整 (円)
  otherAdjustment: number;       // 調整 (円)
  toolingCost: number;           // 略図・型費・その他 (円)
}

export interface DetailedEstimate {
  partNumber: string;         // 品番 (e.g., 66-13401-09100-02)
  baseLotSize: number;        // 見積基準数 (300)
  lotUnit: string;            // 基準数単位 (個/Lot)
  finishedWeightG: number;    // 完成品重量 (g)
  material: MaterialComputation;
  processes: ProcessRow[];
  logistics: LogisticsComputation;
  adjustments: AdvancedAdjustment;
  date: string;
}

export interface KeyChange {
  title: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface CategoryAnalysisPoint {
  category: string;
  analysis: string;
}

export interface ComparisonResult {
  summary: string;
  keyChanges: KeyChange[];
  reasonablenessAssessment: string;
  negotiationTips: string[];
  categoryAnalysisPoints: CategoryAnalysisPoint[];
}
