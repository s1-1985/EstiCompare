export interface ProcessRow {
  index: number;
  processName: string;      // 工程
  workContent: string;      // 作業内容
  hourlyRate: number;       // 【客提示用】賃率 (円/h) - (例: 実際2000円のところ3000円に盛る)
  totalHours: number;       // 【客提示用】総取扱時間・段取 (h)
  yieldPerHour: number;     // 【客提示用】出来高 (個/h)
  kgPrice: number;          // Kg単価
  isDirectInput: boolean;   // 直接入力フラグ
  directProcessingCost: number; // 直接入力・加工費

  // 【実態値】（内々のコスト。客提出用調整のベースになる実数値）
  actualHourlyRate?: number;    // 実際の賃率 (円/h)
  actualTotalHours?: number;    // 実際の総取扱時間・段取 (h)
  actualYieldPerHour?: number;  // 実際の出来高 (個/h)
  actualDirectProcessingCost?: number; // 実際の直接加工費 (円)
}

export interface MaterialComputation {
  materialName: string;    // 材質・寸法
  inputWeightG: number;    // 材料投入量 (g) - 基本的には客提出・社内共通
  basePricePerKg: number;  // 【客提示用】建値 (円/kg) - (例: 実際より少し盛る)
  scrapWeightG: number;    // スクラップ重量 (g)
  scrapPricePerKg: number; // スクラップ単価 (円/kg)

  // 【実態値】
  actualBasePricePerKg?: number; // 実際の仕入れ材料建値 (円/kg)
}

export interface LogisticsComputation {
  qtyPerBox: number;       // 1箱の入数
  freightPerBox: number;   // 【客提示用】1箱の運賃
  
  // 【実態値】
  actualFreightPerBox?: number; // 実際の1箱の運賃
}

export interface AdvancedAdjustment {
  targetProfitRate: number;      // 【社内ルール】目標の利益率・外掛け (%) - 例: 25%
  minProfitRate?: number;        // 【社内ルール】下限の利益率・外掛け (%) - 例: 15%
  targetProfitMarginOff: number; // 【客先ルール】客提示用利益率・内掛け (%) - 例: 15%
  targetUnitPrice: number;       // 目標単価・決定売価 (円)
  
  actualPurchasePrice: number;    // 実際の仕入単価（サプライヤー仕入れ単価） (円)
  sgaRatePercent: number;        // 利管費率 (%) - 例: 15% (客提示用エクセルの利管費)
  sgaFixedAdjustment: number;    // 利管費固定調整 (円)
  otherAdjustment: number;       // 調整 (円)
  toolingCost: number;           // 略図・型費・その他 (円)
}

export interface DetailedEstimate {
  partNumber: string;         // 品番 (e.g., 66-13401-09100-02)
  partName?: string;          // 品名
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

export interface Scenario {
  id: string;
  userId: string;
  name: string;
  newEstimate: DetailedEstimate;
  oldEstimate: DetailedEstimate;
  comparisonResult: ComparisonResult | null;
  createdAt?: any;
  updatedAt?: any;
}

