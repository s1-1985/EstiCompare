import { DetailedEstimate } from '../types';

export interface SampleScenario {
  id: string;
  name: string;
  description: string;
  oldEstimate: DetailedEstimate;
  newEstimate: DetailedEstimate;
}

export const SAMPLE_SCENARIOS: SampleScenario[] = [
  {
    id: 'automotive-panel',
    name: '製品品番 66-13401-09100-02 (板金プレスブラケット)',
    description: 'コイル鋼板の地金インデックス高騰による材料費の上昇と、プレス油・熱処理外注費、物流運賃の改定が重なったケース。',
    oldEstimate: {
      partNumber: '66-13401-09100-02',
      baseLotSize: 300,
      lotUnit: '個/Lot',
      finishedWeightG: 480,
      date: '2025-04-10',
      material: {
        materialName: 'SPCC コイル鋼板 t2.0',
        inputWeightG: 620,
        basePricePerKg: 280,
        scrapWeightG: 140,
        scrapPricePerKg: 45
      },
      processes: [
        { index: 1, processName: 'プレス抜き・ブランク', workContent: '120tメカニカルプレスによる抜き一発', hourlyRate: 3600, totalHours: 2.5, yieldPerHour: 120, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 2, processName: 'ベンダー1次曲げ', workContent: '油圧式プレスブレーキによるL字多箇所曲げ', hourlyRate: 3000, totalHours: 4.0, yieldPerHour: 75, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 3, processName: 'ベンダー2次曲げ', workContent: '同上ワーク反転、コイニング処理', hourlyRate: 3000, totalHours: 4.0, yieldPerHour: 75, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 4, processName: 'タッピング M5x2穴', workContent: '半自動多軸タッピング盤によるめねじ切り', hourlyRate: 2400, totalHours: 1.5, yieldPerHour: 200, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 5, processName: 'スポット溶接', workContent: '補強ナット点溶接（2箇所）', hourlyRate: 3200, totalHours: 3.5, yieldPerHour: 85, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 6, processName: 'バレル脱脂、ブラスト', workContent: 'プレス油の完全除去洗浄と表面均一化処理', hourlyRate: 2800, totalHours: 1.2, yieldPerHour: 250, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 7, processName: 'カチオン電着塗装', workContent: '亜鉛めっき下地＋カチオン黒色塗装(外注)', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: true, directProcessingCost: 75 },
        { index: 8, processName: '製品機能・ネジ検査', workContent: '限界ゲージ・ねじ通り治具による100%全数手検品', hourlyRate: 1800, totalHours: 5.0, yieldPerHour: 60, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 9, processName: '自動箱詰・防湿梱包', workContent: 'クッションシート併用による格子状多段梱包', hourlyRate: 1800, totalHours: 1.0, yieldPerHour: 300, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 10, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 }
      ],
      logistics: {
        qtyPerBox: 30,
        freightPerBox: 1200
      },
      adjustments: {
        targetProfitRate: 8,
        targetUnitPrice: 1250,
        targetProfitMarginOff: 0,
        actualPurchasePrice: 1100,
        sgaRatePercent: 5,
        sgaFixedAdjustment: 0,
        otherAdjustment: 0,
        toolingCost: 150
      }
    },
    newEstimate: {
      partNumber: '66-13401-09100-02',
      baseLotSize: 300,
      lotUnit: '個/Lot',
      finishedWeightG: 480,
      date: '2026-05-20',
      material: {
        materialName: 'SPCC コイル鋼板 t2.0',
        inputWeightG: 620,
        basePricePerKg: 395, // +115 Yen/kg due to global iron metal surge
        scrapWeightG: 140,
        scrapPricePerKg: 55 // scrap recycle rate slight increase
      },
      processes: [
        { index: 1, processName: 'プレス抜き・ブランク', workContent: '120tメカニカルプレスによる抜き一発', hourlyRate: 4200, totalHours: 2.5, yieldPerHour: 120, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 }, // Labor rate & power rate rise
        { index: 2, processName: 'ベンダー1次曲げ', workContent: '油圧式プレスブレーキによるL字多箇所曲げ', hourlyRate: 3500, totalHours: 4.0, yieldPerHour: 75, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 3, processName: 'ベンダー2次曲げ', workContent: '同上ワーク反転、コイニング処理', hourlyRate: 3500, totalHours: 4.0, yieldPerHour: 75, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 4, processName: 'タッピング M5x2穴', workContent: '半自動多軸タッピング盤によるめねじ切り', hourlyRate: 2800, totalHours: 1.5, yieldPerHour: 200, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 5, processName: 'スポット溶接', workContent: '補強ナット点溶接（2箇所）', hourlyRate: 3700, totalHours: 3.5, yieldPerHour: 85, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 6, processName: 'バレル脱脂、ブラスト', workContent: 'プレス油の完全除去洗浄と表面均一化処理', hourlyRate: 3200, totalHours: 1.2, yieldPerHour: 250, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 7, processName: 'カチオン電着塗装', workContent: '亜鉛めっき下地＋カチオン黒色塗装(外注改定)', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: true, directProcessingCost: 95 }, // Outsource price index increased from 75 to 95
        { index: 8, processName: '製品機能・ネジ検査', workContent: '限界ゲージ・ねじ通り治具による100%全数手検品', hourlyRate: 2100, totalHours: 5.0, yieldPerHour: 60, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 9, processName: '自動箱詰・防湿梱包', workContent: 'クッションシート併用による格子状多段梱包', hourlyRate: 2100, totalHours: 1.0, yieldPerHour: 300, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 10, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 }
      ],
      logistics: {
        qtyPerBox: 30,
        freightPerBox: 1500 // cargo cost rose by 25% due to 2024 problem logistics hike
      },
      adjustments: {
        targetProfitRate: 8,
        targetUnitPrice: 1450,
        targetProfitMarginOff: 0,
        actualPurchasePrice: 1320,
        sgaRatePercent: 6, // SGA overhead rate increased to 6%
        sgaFixedAdjustment: 0,
        otherAdjustment: 0,
        toolingCost: 150
      }
    }
  },
  {
    id: 'precision-turn',
    name: '製品品番 55-092-2290A (切削精密ブッシュ 芯ブレ厳格品)',
    description: '真鍮材(C3604)の相場激変に対応した高付加価値CNC切削品の旧・新詳細見積。',
    oldEstimate: {
      partNumber: '55-092-2290A',
      baseLotSize: 1000,
      lotUnit: '個/Lot',
      finishedWeightG: 85,
      date: '2025-06-01',
      material: {
        materialName: '快削真鍮棒 C3604 φ25',
        inputWeightG: 180,
        basePricePerKg: 1050,
        scrapWeightG: 95,
        scrapPricePerKg: 620
      },
      processes: [
        { index: 1, processName: 'CNC自動旋盤（粗引・ねじ）', workContent: '自動棒材ローダー・連続無人化外径切削', hourlyRate: 4500, totalHours: 12.0, yieldPerHour: 80, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 2, processName: 'マシニング穴開・面取り', workContent: 'D12深穴・C1.0面取り', hourlyRate: 4200, totalHours: 10.0, yieldPerHour: 100, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 3, processName: '超仕上げ・研磨', workContent: '芯ブレ0.01mm以下維持用センタレス研削', hourlyRate: 4800, totalHours: 8.5, yieldPerHour: 120, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 4, processName: '超音波精密洗浄', workContent: '3槽式溶剤超音波洗浄（塩素フリー）', hourlyRate: 2500, totalHours: 2.0, yieldPerHour: 500, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 5, processName: '三次元座標測定・全数寸検', workContent: '抜き取り自動測定＆キー寸法デジタルノギス手測定', hourlyRate: 2200, totalHours: 10.0, yieldPerHour: 100, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 6, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 7, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 8, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 9, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 10, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 }
      ],
      logistics: {
        qtyPerBox: 200,
        freightPerBox: 1600
      },
      adjustments: {
        targetProfitRate: 10,
        targetUnitPrice: 350,
        targetProfitMarginOff: 0,
        actualPurchasePrice: 320,
        sgaRatePercent: 5,
        sgaFixedAdjustment: 0,
        otherAdjustment: 0,
        toolingCost: 0
      }
    },
    newEstimate: {
      partNumber: '55-092-2290A',
      baseLotSize: 1000,
      lotUnit: '個/Lot',
      finishedWeightG: 85,
      date: '2026-05-15',
      material: {
        materialName: '快削真鍮棒 C3604 φ25',
        inputWeightG: 180,
        basePricePerKg: 1350, // Significant copper surge in LME
        scrapWeightG: 95,
        scrapPricePerKg: 780
      },
      processes: [
        { index: 1, processName: 'CNC自動旋盤（粗引・ねじ）', workContent: '自動棒材ローダー・連続無人化外径切削', hourlyRate: 4800, totalHours: 12.0, yieldPerHour: 80, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 2, processName: 'マシニング穴開・面取り', workContent: 'D12深穴・C1.0面取り', hourlyRate: 4500, totalHours: 10.0, yieldPerHour: 100, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 3, processName: '超仕上げ・研磨', workContent: '芯ブレ0.01mm以下維持用センタレス研削', hourlyRate: 5200, totalHours: 8.5, yieldPerHour: 120, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 4, processName: '超音波精密洗浄', workContent: '3槽式溶剤超音波洗浄（塩素フリー）', hourlyRate: 2800, totalHours: 2.0, yieldPerHour: 500, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 5, processName: '三次元座標測定・全数寸検', workContent: '抜き取り自動測定＆キー寸法デジタルノギス手測定', hourlyRate: 2400, totalHours: 10.0, yieldPerHour: 100, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 6, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 7, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 8, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 9, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
        { index: 10, processName: '-', workContent: '-', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 }
      ],
      logistics: {
        qtyPerBox: 200,
        freightPerBox: 2000
      },
      adjustments: {
        targetProfitRate: 10,
        targetUnitPrice: 420,
        targetProfitMarginOff: 0,
        actualPurchasePrice: 395,
        sgaRatePercent: 5,
        sgaFixedAdjustment: 0,
        otherAdjustment: 0,
        toolingCost: 0
      }
    }
  }
];
