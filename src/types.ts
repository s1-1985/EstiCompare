export type ProcessCalcMode = 'standard' | 'kg' | 'lump' | 'direct';

export interface ProcessRow {
  index: number;
  processName: string;      // 工程
  workContent: string;      // 作業内容
  hourlyRate: number;       // 【客提示用】賃率 (円/h) - (例: 実際2000円のところ3000円に盛る)
  totalHours: number;       // 【客提示用】総取扱時間・段取 (h)
  yieldPerHour: number;     // 【客提示用】出来高 (個/h)
  kgPrice: number;          // kg単価 (円/kg) — calcMode='kg' で使用
  isDirectInput: boolean;   // 後方互換フラグ (calcMode未設定時に参照)
  directProcessingCost: number; // 直接入力・加工費 (円/個) — calcMode='direct' で使用
  calcMode?: ProcessCalcMode;   // 計算モード
  lumpSumPrice?: number;        // 一式金額 (円/lot) — calcMode='lump' で使用

  // 【実態値】（内々のコスト。客提出用調整のベースになる実数値）
  actualHourlyRate?: number;    // 実際の賃率 (円/h)
  actualTotalHours?: number;    // 実際の総取扱時間・段取 (h)
  actualYieldPerHour?: number;  // 実際の出来高 (個/h)
  actualDirectProcessingCost?: number; // 実際の直接加工費 (円)
  actualLumpSumPrice?: number;  // 実際の一式金額 (円/lot)
  actualKgPrice?: number;       // 実際のkg単価 (円/kg)
  changeReason?: string;        // 変動理由メモ（客先説明用）
}

export interface MaterialComputation {
  materialName: string;    // 材質・寸法
  inputWeightG: number;    // 材料投入量 (g) - 基本的には客提出・社内共通
  basePricePerKg: number;  // 【客提示用】建値 (円/kg) - (例: 実際より少し盛る)
  scrapWeightG: number;    // スクラップ重量 (g)
  scrapPricePerKg: number; // スクラップ単価 (円/kg)

  // 【実態値】
  actualBasePricePerKg?: number; // 実際の仕入れ材料建値 (円/kg)
  changeReason?: string;         // 変動理由メモ（客先説明用）
}

export interface LogisticsComputation {
  qtyPerBox: number;               // 1箱の入数
  freightPerBox: number;           // 【客提示用】1箱の運賃
  actualFreightPerBox?: number;    // 実際の1箱の運賃
  originPrefecture?: string;       // 発送元都道府県
  destinationPrefecture?: string;  // 送付先都道府県
}

export interface AdvancedAdjustment {
  targetProfitRate: number;      // 【社内ルール】目標の利益率・外掛け (%) - 例: 25%
  minProfitRate?: number;        // 【社内ルール】下限の利益率・外掛け (%) - 例: 15%
  maxProfitRate?: number;        // 【旧単価専用】上限の利益率・外掛け (%) - 旧単価でのみ使用
  targetProfitMarginOff: number; // 【客先ルール】客提示用利益率・内掛け (%) - 例: 15%
  targetUnitPrice: number;       // 目標単価・決定売価 (円)
  targetPriceLocked?: boolean;   // 新単価目標単価ロック（一発自動整合で変えない）
  
  actualPurchasePrice: number;    // 実際の仕入単価（サプライヤー仕入れ単価） (円)
  sgaRatePercent: number;        // 利管費率 (%) - 例: 15%
  sgaCalcMode?: 'markup' | 'margin'; // 利管費計算方式: 外掛け(markup) / 内掛け(margin)
  sgaFixedAdjustment: number;    // 利管費固定調整 (円)
  otherAdjustment: number;       // 調整 (円)
  toolingCost: number;           // 略図・型費・その他 (円、非表示だが後方互換のため残す)
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

// ─── 複数数量パターン見積（Goal 1） ──────────────────────────────────────────
// 1つの品番に対して見積数量が複数（例: ロット100/300/1000）ある場合、
// 出来高(yieldPerHour)・段取(totalHours)は全パターン共通（生産前提）。
// 賃率(hourlyRate)・kg単価・一式・直接費・利管費・送料は数量により変動可。

export interface PatternProcessRate {
  hourlyRate?: number;          // 客提示用賃率 (円/h) — standard
  kgPrice?: number;             // kg単価 — kg
  lumpSumPrice?: number;        // 一式金額 — lump
  directProcessingCost?: number; // 直接加工費 — direct
}

export interface QuantityPattern {
  id: string;
  label: string;                // 表示名（例: "100個", "量産1000"）
  baseLotSize: number;          // このパターンの見積基準数
  lotUnit: string;              // 基準数単位
  targetUnitPrice: number;      // このパターンの目標単価
  targetPriceLocked?: boolean;
  sgaRatePercent: number;       // このパターンの利管費率
  sgaCalcMode?: 'markup' | 'margin';
  sgaFixedAdjustment: number;
  otherAdjustment: number;
  processRates: Record<number, PatternProcessRate>; // 工程index(1始まり) → 賃率
  freightPerBox?: number;       // このパターンの1箱運賃（未設定はbase流用）
  notes?: string;
}

export interface Scenario {
  id: string;
  userId: string;
  name: string;
  notes?: string;
  newEstimate: DetailedEstimate;
  oldEstimate: DetailedEstimate;
  comparisonResult: ComparisonResult | null;
  aiAnalysis?: string | null;
  quantityPatterns?: QuantityPattern[]; // Goal 1: 複数数量パターン（任意）
  supplierGroup?: string;               // Goal 2: 複数品番同時比較のサプライヤーグループ名（任意）
  createdAt?: any;
  updatedAt?: any;
}

// ─── 複数品番同時比較（Goal 2） ──────────────────────────────────────────────
// 客先の一斉価格改定で、複数品番を横並びに「編集しながら」整合させるためのワーク。
// 各品番は1つの（新／改定）見積を持ち、旧単価を参照に改定率を表示する。
// ライブラリ取込でも直接入力でも作成でき、材料建値・賃率・SGA率などを
// 横断的に揃える作業を支援する。
export interface BatchPart {
  id: string;
  estimate: DetailedEstimate;   // 改定後（新）見積。フル編集可
  oldUnitPrice?: number;         // 旧単価（改定率の基準。任意）
  sourceScenarioId?: string;     // ライブラリ取込元（任意）
}

