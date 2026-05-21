import React, { useState } from 'react';
import { DetailedEstimate, ProcessRow } from '../types';
import { calculateEstimate } from '../utils/calculations';
import { 
  Settings2, Lock, Zap, CheckCircle2, AlertTriangle, 
  HelpCircle, Sparkles, Database, PlusCircle, Trash2
} from 'lucide-react';

interface ExcelGridProps {
  oldEstimate: DetailedEstimate;
  onChangeOld: (updated: DetailedEstimate) => void;
  newEstimate: DetailedEstimate;
  onChangeNew: (updated: DetailedEstimate) => void;
  title: string;
}

export const ExcelGrid: React.FC<ExcelGridProps> = ({
  oldEstimate,
  onChangeOld,
  newEstimate,
  onChangeNew,
  title,
}) => {
  // Calculations
  const oldCalc = calculateEstimate(oldEstimate);
  const newCalc = calculateEstimate(newEstimate);

  // -------------------------------------------------------------
  // 共通マスタ情報の同期ヘルパー
  // -------------------------------------------------------------
  const updateCommonMeta = (key: 'partNumber' | 'baseLotSize' | 'finishedWeightG', value: any) => {
    onChangeOld({ ...oldEstimate, [key]: value });
    onChangeNew({ ...newEstimate, [key]: value });
  };

  const updateCommonMaterialMeta = (key: 'materialName' | 'inputWeightG' | 'scrapWeightG', value: any) => {
    const rawVal = typeof value === 'string' ? parseFloat(value) : value;
    const finalVal = isNaN(rawVal) && typeof value === 'string' ? value : rawVal;

    onChangeOld({
      ...oldEstimate,
      material: { ...oldEstimate.material, [key]: finalVal }
    });
    onChangeNew({
      ...newEstimate,
      material: { ...newEstimate.material, [key]: finalVal }
    });
  };

  const updateCommonProcessMeta = (index: number, key: 'processName' | 'workContent' | 'totalHours' | 'yieldPerHour' | 'directProcessingCost' | 'isDirectInput', value: any) => {
    const updateProcesses = (est: DetailedEstimate) => {
      return est.processes.map((proc) => {
        if (proc.index === index) {
          if (key === 'isDirectInput') return { ...proc, [key]: value };
          if (typeof value === 'string' && (key === 'totalHours' || key === 'yieldPerHour' || key === 'directProcessingCost')) {
            const parsed = parseFloat(value);
            return { ...proc, [key]: isNaN(parsed) ? 0 : parsed };
          }
          return { ...proc, [key]: value };
        }
        return proc;
      });
    };

    onChangeOld({ ...oldEstimate, processes: updateProcesses(oldEstimate) });
    onChangeNew({ ...newEstimate, processes: updateProcesses(newEstimate) });
  };

  // -------------------------------------------------------------
  // 個別お化粧入力アップデート項目
  // -------------------------------------------------------------
  const updateMaterialPrice = (isNew: boolean, key: 'basePricePerKg' | 'actualBasePricePerKg' | 'scrapPricePerKg', value: any) => {
    const parsed = parseFloat(value);
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;

    setter({
      ...target,
      material: {
        ...target.material,
        [key]: isNaN(parsed) ? 0 : parsed
      }
    });
  };

  const updateProcessRates = (isNew: boolean, index: number, key: 'hourlyRate' | 'actualHourlyRate', value: any) => {
    const parsed = parseFloat(value);
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;

    setter({
      ...target,
      processes: target.processes.map((proc) => {
        if (proc.index === index) {
          return { ...proc, [key]: isNaN(parsed) ? 0 : parsed };
        }
        return proc;
      })
    });
  };

  const updateLogisticsRates = (isNew: boolean, key: 'qtyPerBox' | 'freightPerBox' | 'actualFreightPerBox', value: any) => {
    const parsed = parseFloat(value);
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;

    setter({
      ...target,
      logistics: {
        ...target.logistics,
        [key]: isNaN(parsed) ? 0 : parsed
      }
    });
  };

  const updateAdjustments = (isNew: boolean, key: 'targetProfitRate' | 'targetProfitMarginOff' | 'targetUnitPrice' | 'actualPurchasePrice' | 'sgaRatePercent' | 'toolingCost' | 'otherAdjustment', value: any) => {
    const parsed = parseFloat(value);
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;

    setter({
      ...target,
      adjustments: {
        ...target.adjustments,
        [key]: isNaN(parsed) ? 0 : parsed
      }
    });
  };

  // -------------------------------------------------------------
  // 🧙‍♂️ 魔法の一撃！1円単位お化粧自動辻褄合わせロジック
  // -------------------------------------------------------------
  const handleAutoReconcile = (isNew: boolean) => {
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const calc = isNew ? newCalc : oldCalc;

    const sellingPrice = target.adjustments.targetUnitPrice || calc.grandTotalUnitPrice;
    const tooling = target.adjustments.toolingCost || 0;
    const sgaRate = target.adjustments.sgaRatePercent || 0;
    const shipping = calc.shippingCostPerUnit;

    const targetPrimeCost = (sellingPrice - shipping - tooling) / (1 + sgaRate / 100);

    if (targetPrimeCost <= 0) {
      alert("目標単価（決定売値）が低すぎるか、無効です。数値を入力してから実行してください。");
      return;
    }

    const basePrimeCost = calc.actualPrimeCost; 
    const validProcesses = target.processes.filter(p => p.processName.trim() !== '' && !p.isDirectInput);
    
    if (validProcesses.length === 0) {
      alert("自動辻褄合わせを行う対象の工程が見つかりません。");
      return;
    }

    const multiplier = targetPrimeCost / basePrimeCost;

    const draftProcesses = target.processes.map((proc) => {
      if (!proc.processName.trim() || proc.isDirectInput) return proc;
      const actRate = proc.actualHourlyRate ?? proc.hourlyRate;
      const newRate = Math.round(actRate * multiplier);
      return {
        ...proc,
        hourlyRate: Math.max(100, newRate)
      };
    });

    const actMaterialPrice = target.material.actualBasePricePerKg ?? target.material.basePricePerKg;
    const rawNewMaterialPrice = Math.round(actMaterialPrice * multiplier);

    const testEstimate: DetailedEstimate = {
      ...target,
      material: {
        ...target.material,
        basePricePerKg: rawNewMaterialPrice
      },
      processes: draftProcesses
    };

    const testCalc = calculateEstimate(testEstimate);
    const gap = sellingPrice - testCalc.grandTotalUnitPrice;

    if (Math.abs(gap) > 0.001) {
      const lastProcIdx = draftProcesses.reduce((last, p, idx) => p.processName.trim() !== '' && !p.isDirectInput ? idx : last, -1);
      if (lastProcIdx !== -1) {
        const proc = draftProcesses[lastProcIdx];
        const lot = target.baseLotSize || 1;
        const totalWorkHours = ((proc.totalHours * 60 / lot) + (60 / proc.yieldPerHour)) / 60;
        
        const sgaAdjuster = 1 + (target.adjustments.sgaRatePercent / 100);
        const rateCorrection = (gap / sgaAdjuster) / totalWorkHours;
        
        draftProcesses[lastProcIdx] = {
          ...proc,
          hourlyRate: Math.max(100, Math.round(proc.hourlyRate + rateCorrection))
        };
      }
    }

    setter({
      ...target,
      material: {
        ...target.material,
        basePricePerKg: rawNewMaterialPrice
      },
      processes: draftProcesses
    });
  };

  return (
    <div className="space-y-6">
      
      {/* 📊 A. DUAL VIEW SYSTEM COMMON META MASTER */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-3xs overflow-hidden">
        
        {/* Header Tab */}
        <div className="bg-[#107C41] text-white p-3.5 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-emerald-300 animate-spin-slow" />
            <div>
              <h2 className="text-sm font-black tracking-tight leading-none flex items-center gap-1.5">
                <span>{title}</span>
                <span className="text-[10px] bg-emerald-700/80 text-emerald-200 px-1.5 py-0.5 rounded font-mono">新旧見開き対照マスタ</span>
              </h2>
              <p className="text-[10px] text-emerald-200 mt-1.5 leading-none font-medium">
                「加工タクト・投入量は新旧で同一でなければならない」の原則に準拠し、工程構造や重量を一元ロック管理。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] bg-emerald-900/60 px-3 py-1.5 rounded-sm border border-emerald-700/50 font-bold select-none text-emerald-100">
            <Lock className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>新旧工程構造・重さ・ロット自動連動中</span>
          </div>
        </div>

        {/* Form Inputs Grid */}
        <div className="p-4 bg-slate-50/50 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          
          {/* Box 1: Product Specifications */}
          <div className="bg-white border p-4 rounded-lg shadow-3xs space-y-3">
            <div className="font-bold text-slate-705 text-[#107C41] border-b pb-1.5 flex items-center gap-1.5 text-xs">
              <Database className="w-4 h-4" />
              <span>① 製品仕様情報（新旧共通）</span>
            </div>
            
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">品目コード（品番）</label>
              <input
                type="text"
                value={newEstimate.partNumber}
                onChange={(e) => updateCommonMeta('partNumber', e.target.value)}
                className="w-full bg-slate-50 border border-slate-250 rounded-md p-2 font-mono font-bold text-slate-800 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">完成品質量 (g/個)</label>
                <input
                  type="number"
                  value={newEstimate.finishedWeightG || ''}
                  onChange={(e) => updateCommonMeta('finishedWeightG', parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-250 rounded-md p-2 font-mono text-right font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">基準ロット数 (個)</label>
                <input
                  type="number"
                  value={newEstimate.baseLotSize || ''}
                  onChange={(e) => updateCommonMeta('baseLotSize', Math.max(1, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-50 border border-slate-250 rounded-md p-2 font-mono text-right font-bold text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Box 2: Materials General Spec */}
          <div className="bg-white border p-4 rounded-lg shadow-3xs space-y-3">
            <div className="font-bold text-slate-705 text-[#107C41] border-b pb-1.5 flex items-center gap-1.5 text-xs">
              <Database className="w-4 h-4" />
              <span>② 共通材料元情報</span>
            </div>
            
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">材質・寸法規格</label>
              <input
                type="text"
                value={newEstimate.material.materialName}
                onChange={(e) => updateCommonMaterialMeta('materialName', e.target.value)}
                placeholder="SPCC コイル鋼板 t2.0"
                className="w-full bg-slate-50 border border-slate-250 rounded-md p-2 font-bold text-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">材料投入量 (g/個)</label>
                <input
                  type="number"
                  value={newEstimate.material.inputWeightG || ''}
                  onChange={(e) => updateCommonMaterialMeta('inputWeightG', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-250 rounded-md p-2 font-mono text-right font-semibold text-slate-800"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">回収端材量 (g/個)</label>
                <input
                  type="number"
                  value={newEstimate.material.scrapWeightG || ''}
                  onChange={(e) => updateCommonMaterialMeta('scrapWeightG', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-250 rounded-md p-2 font-mono text-right text-slate-800"
                />
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* 🛠️ ③ 新旧連動工程・タクト一元定義テーブル（左右比較の上に配置して画面幅一杯まで広げる） */}
      <div className="bg-white rounded-xl border border-emerald-300 shadow-md overflow-hidden">
        <div className="bg-emerald-50 border-b border-emerald-200 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-emerald-600 rounded-full animate-pulse shrink-0" />
            <div>
              <h3 className="font-black text-xs text-emerald-900 flex items-center gap-2">
                <span>③ 新旧共通・製造工程・加工タクト一元管理マスタ（左右連動）</span>
                <span className="text-[9px] bg-emerald-600 text-white px-2 py-0.5 rounded font-bold font-mono">10段階プロセス設計</span>
              </h3>
              <p className="text-[10px] text-emerald-700/90 mt-1 leading-none font-medium">
                「加工タクトや工程構成は、新単価見積でも旧単価見積でも不変である」という公正取引委員会の査定指針に基づき、左右の工程数が完全に同期します。
              </p>
            </div>
          </div>
          <span className="text-[10px] text-emerald-800 font-bold bg-white border border-emerald-300 px-2.5 py-1 rounded-sm select-none">
            ※ ここで定義された生産速度をベースに、左右別々のお化粧単価（加工賃・賃率）が掛け合わされます。
          </span>
        </div>

        <div className="p-4 overflow-x-auto bg-slate-50/20">
          <table className="w-full text-xs text-slate-700 border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-bold text-right select-none bg-slate-150/40">
                <th className="py-2.5 px-3 uppercase text-center w-16 bg-slate-100/50">工順</th>
                <th className="py-2.5 px-3 text-left w-64 bg-slate-100/50">工程名称（例：お化粧用プレス・組立・検査 など）</th>
                <th className="py-2.5 px-3 text-left w-64 bg-slate-100/50">作業内容 / 設備・金型仕様詳細</th>
                <th className="py-2.5 px-3 text-right w-36 bg-emerald-50/30 text-emerald-900 font-black">生産出来高 (個 / 時間)</th>
                <th className="py-2.5 px-3 text-right w-32 bg-slate-100/50">段取時間 (時間 / ロット)</th>
                <th className="py-2.5 px-3 text-right w-36 bg-slate-100/50 text-rose-700">直接設定費 (単価決定時)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150">
              {newEstimate.processes.map((proc, i) => {
                return (
                  <tr key={proc.index} className="hover:bg-emerald-50/20 transition-all">
                    {/* 工順番号 */}
                    <td className="py-2.5 px-3 font-mono text-center font-black text-slate-400 bg-slate-50/50">
                      工{proc.index}
                    </td>

                    {/* 工程名称 */}
                    <td className="py-1 px-3">
                      <input
                        type="text"
                        value={proc.processName}
                        onChange={(e) => updateCommonProcessMeta(proc.index, 'processName', e.target.value)}
                        placeholder="(工程未設定)"
                        className="bg-white border border-slate-250 rounded-md w-full px-2.5 py-1.5 text-xs font-bold text-slate-800 shadow-3xs focus:border-emerald-500 focus:outline-hidden"
                      />
                    </td>

                    {/* 作業内容 */}
                    <td className="py-1 px-3">
                      <input
                        type="text"
                        value={proc.workContent}
                        onChange={(e) => updateCommonProcessMeta(proc.index, 'workContent', e.target.value)}
                        placeholder="設備：300ton順送プレス、金型No.A-2 等"
                        className="bg-white border border-slate-200 rounded-md w-full px-2.5 py-1.5 text-xs text-slate-550 shadow-3xs focus:border-emerald-500 focus:outline-hidden"
                      />
                    </td>

                    {/* 出来高 */}
                    <td className="py-1 px-3 bg-emerald-50/10">
                      <div className="relative">
                        <input
                          type="number"
                          value={proc.yieldPerHour || ''}
                          onChange={(e) => updateCommonProcessMeta(proc.index, 'yieldPerHour', e.target.value)}
                          placeholder="自動"
                          className="bg-white border border-emerald-300 font-bold rounded-md w-full pl-2.5 pr-8 py-1.5 text-right font-mono text-xs text-emerald-950 shadow-3xs focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
                        />
                        <span className="absolute right-2 px-1 top-2 text-[9px] text-emerald-600/75 select-none font-bold">
                          個/h
                        </span>
                      </div>
                    </td>

                    {/* 段取時間 */}
                    <td className="py-1 px-3">
                      <div className="relative">
                        <input
                          type="number"
                          value={proc.totalHours || ''}
                          onChange={(e) => updateCommonProcessMeta(proc.index, 'totalHours', e.target.value)}
                          placeholder="0"
                          className="bg-white border border-slate-250 rounded-md w-full pl-2.5 pr-8 py-1.5 text-right font-mono text-xs text-slate-700 shadow-3xs focus:border-emerald-500 focus:outline-hidden"
                          step="any"
                        />
                        <span className="absolute right-2 top-2 text-[9px] text-slate-400 select-none">
                          h
                        </span>
                      </div>
                    </td>

                    {/* 直接設定費 */}
                    <td className="py-1 px-3">
                      <div className="relative">
                        <input
                          type="number"
                          value={proc.directProcessingCost || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateCommonProcessMeta(proc.index, 'directProcessingCost', val);
                            updateCommonProcessMeta(proc.index, 'isDirectInput', parseFloat(val) > 0);
                          }}
                          placeholder="通常積み上げ"
                          className="bg-white border border-rose-250 rounded-md w-full pl-2.5 pr-5 py-1.5 text-right font-mono text-xs text-rose-800 font-bold shadow-3xs focus:border-rose-500 focus:ring-1 focus:ring-rose-500 focus:outline-hidden"
                        />
                        <span className="absolute right-2 top-2 text-[9px] text-rose-600 select-none font-bold">
                          円
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ⚖️ B. SIDE-BY-SIDE DUPLEX CALCULATION & ACCOUNT RECONCILIATION SHEET */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* ==================== LEFT COLUMN: OLD ADAPTATION (旧価格) ==================== */}
        <div className="bg-white rounded-xl border border-slate-300 shadow-md overflow-hidden">
          
          {/* Header */}
          <div className="bg-slate-700 text-white p-3 border-b flex justify-between items-center select-none">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <h3 className="font-extrabold text-xs tracking-wider uppercase">
                1. 旧合意価格シート [現在適応中・前回査定]
              </h3>
            </div>
            <span className="text-[10px] text-slate-300 font-bold bg-slate-800 px-2 py-0.5 rounded-xs">
              前回査定基準
            </span>
          </div>

          <div className="p-4 space-y-4 text-xs">
            
            {/* 1. Margin & Cost Back-calculation Panel */}
            <div className="bg-slate-50 border p-3 rounded-lg shadow-3xs space-y-3">
              <div className="font-extrabold text-slate-700 text-[11px] pb-1 border-b flex justify-between items-center">
                <span>📊 マージン逆算＆価格決定 (売単価と架空仕入)</span>
                <span className="text-[9px] text-slate-400 font-normal">旧シミュレーション</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* Genuine purchase price from supplier */}
                <div className="space-y-1 bg-yellow-50/50 border border-yellow-200/60 p-2 rounded">
                  <label className="text-[10px] text-yellow-850 font-black block leading-none mb-1">
                    🟢 実際の旧仕入単価 (サプライヤー価格)
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono text-[10px]">¥</span>
                    <input
                      type="number"
                      value={oldEstimate.adjustments.actualPurchasePrice || ''}
                      onChange={(e) => updateAdjustments(false, 'actualPurchasePrice', e.target.value)}
                      placeholder="0 (明細積み上げ)"
                      className="w-full bg-white border rounded p-1 text-right font-mono font-bold text-yellow-850 focus:ring-1 focus:ring-yellow-450"
                    />
                  </div>
                  <p className="text-[9px] text-slate-450 leading-tight">
                    ※ 輸入・調達元からの実仕入単価を入力。ここを基準にします。
                  </p>
                </div>

                {/* Internal markup */}
                <div className="space-y-1 bg-slate-100/50 p-2 rounded">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">
                    社内マージン率 (外掛け)
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={oldEstimate.adjustments.targetProfitRate || 0}
                      onChange={(e) => updateAdjustments(false, 'targetProfitRate', e.target.value)}
                      className="w-16 bg-white border rounded p-1 text-right font-mono font-bold"
                    />
                    <span className="font-bold text-slate-500">%</span>
                  </div>
                  <p className="text-[9px] text-slate-450">
                    必要売単価: <strong className="font-mono text-slate-600">¥{oldCalc.requiredSellingPrice.toFixed(2)}</strong>
                  </p>
                </div>

                {/* Client margin */}
                <div className="space-y-1 bg-slate-100/50 p-2 rounded">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">
                    得意先提示利管率 (内掛け)
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={oldEstimate.adjustments.targetProfitMarginOff || 0}
                      onChange={(e) => updateAdjustments(false, 'targetProfitMarginOff', e.target.value)}
                      className="w-16 bg-white border rounded p-1 text-right font-mono font-bold text-rose-700"
                    />
                    <span className="font-bold text-slate-500">%以下</span>
                  </div>
                  <p className="text-[9px] text-slate-450">
                    客宛て架空仕入: <strong className="font-mono text-rose-700">¥{oldCalc.suggestedPurchasePriceForClient.toFixed(1)}</strong>
                  </p>
                </div>

                {/* Target selling profit */}
                <div className="space-y-1 bg-slate-100/50 p-2 rounded">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">
                    客先提出用 利管費率 (%)
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={oldEstimate.adjustments.sgaRatePercent || 0}
                      onChange={(e) => updateAdjustments(false, 'sgaRatePercent', e.target.value)}
                      className="w-16 bg-white border rounded p-1 text-right font-mono font-semibold"
                    />
                    <span className="text-slate-400">%</span>
                  </div>
                </div>

              </div>

              {/* Central TargetUnitPrice */}
              <div className="bg-slate-200/75 border border-slate-300 p-2.5 rounded flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-slate-650 block leading-none">
                    旧・決定売値（合意販売価格単価）
                  </span>
                  <span className="text-slate-500 text-[9px] block mt-1">※ 客先提出見積のグランド計</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-black text-slate-500">¥</span>
                  <input
                    type="number"
                    value={oldEstimate.adjustments.targetUnitPrice || ''}
                    onChange={(e) => updateAdjustments(false, 'targetUnitPrice', e.target.value)}
                    placeholder={oldCalc.grandTotalUnitPrice.toFixed(0)}
                    className="w-24 bg-white border border-slate-350 rounded p-1 font-mono text-right text-xs font-black text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* 2. Breakdown table list */}
            <div className="space-y-1.5">
              <div className="font-bold text-slate-700 text-[11px] flex justify-between items-center bg-slate-100 p-1 rounded-sm">
                <span>🔍 旧・お化粧原価・内訳積算項目</span>
                <span className="text-[9px] text-slate-400">客提示資料用積み上げ</span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
                <table className="w-full text-[10px] font-sans">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b font-bold text-right select-none">
                      <th className="py-1 px-2 text-left">費目区分</th>
                      <th className="py-1 px-1.5 text-right w-16">内々実際</th>
                      <th className="py-1 px-1.5 text-right w-20 text-rose-700 bg-rose-50/20">提示お化粧値</th>
                      <th className="py-1 px-2 text-right w-20 bg-slate-50/80">見積書記載 (円)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    
                    {/* Material */}
                    <tr>
                      <td className="py-1.5 px-2">
                        <span className="font-bold text-slate-700 block">材料建値 (円/kg)</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">重量 {oldEstimate.material.inputWeightG}g</span>
                      </td>
                      <td className="py-1.5 px-1.5 text-right font-mono text-slate-400">
                        ¥{oldEstimate.material.actualBasePricePerKg ?? oldEstimate.material.basePricePerKg}
                      </td>
                      <td className="py-1.5 px-1.5 text-right bg-rose-50/10">
                        <input
                          type="number"
                          value={oldEstimate.material.basePricePerKg}
                          onChange={(e) => updateMaterialPrice(false, 'basePricePerKg', e.target.value)}
                          className="w-full bg-white border border-rose-200 rounded p-0.5 font-mono text-right text-[10px] font-bold text-rose-700"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-700">
                        ¥{oldCalc.netMaterialCost.toFixed(2)}
                      </td>
                    </tr>

                    {/* Processes */}
                    {oldEstimate.processes.map((proc, i) => {
                      if (!proc.processName.trim() || proc.isDirectInput) return null;
                      return (
                        <tr key={proc.index}>
                          <td className="py-1 px-2">
                            <span className="font-bold text-slate-700 block truncate max-w-[110px]">{proc.processName}</span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">出来高 {proc.yieldPerHour}個/h</span>
                          </td>
                          <td className="py-1 px-1.5 text-right font-mono text-slate-400">
                            ¥{proc.actualHourlyRate ?? proc.hourlyRate}
                          </td>
                          <td className="py-1 px-1.5 text-right bg-rose-50/10">
                            <input
                              type="number"
                              value={proc.hourlyRate || ''}
                              onChange={(e) => updateProcessRates(false, proc.index, 'hourlyRate', e.target.value)}
                              className="w-full bg-white border border-rose-200 rounded p-0.5 font-mono text-right text-[10px] font-bold text-rose-700"
                            />
                          </td>
                          <td className="py-1 px-2 text-right font-mono font-bold text-slate-700">
                            ¥{oldCalc.processCosts[i].toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Logistics */}
                    <tr>
                      <td className="py-1.5 px-2">
                        <span className="font-bold text-slate-700 block">運賃/箱数 (1個辺り)</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">入数 {oldEstimate.logistics.qtyPerBox}個</span>
                      </td>
                      <td className="py-1.5 px-1.5 text-right font-mono text-slate-400">
                        ¥{oldEstimate.logistics.actualFreightPerBox ? (oldEstimate.logistics.actualFreightPerBox / oldEstimate.logistics.qtyPerBox).toFixed(1) : (oldEstimate.logistics.freightPerBox / oldEstimate.logistics.qtyPerBox).toFixed(1)}
                      </td>
                      <td className="py-1.5 px-1.5 text-right bg-rose-50/10">
                        <input
                          type="number"
                          value={oldEstimate.logistics.freightPerBox}
                          onChange={(e) => updateLogisticsRates(false, 'freightPerBox', e.target.value)}
                          className="w-full bg-white border border-rose-200 rounded p-0.5 font-mono text-right text-[10px] font-bold text-rose-700"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-700">
                        ¥{oldCalc.shippingCostPerUnit.toFixed(2)}
                      </td>
                    </tr>

                    {/* Tooling and manual adjust */}
                    <tr>
                      <td className="py-1 px-2 text-slate-500 font-medium">型費・特記償却費等</td>
                      <td className="py-1 px-1.5 text-right font-mono text-slate-350">¥0.00</td>
                      <td className="py-1 px-1.5 bg-slate-50">
                        <input
                          type="number"
                          value={oldEstimate.adjustments.toolingCost || ''}
                          onChange={(e) => updateAdjustments(false, 'toolingCost', e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent border-0 p-0 text-right font-mono text-[10px]"
                        />
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-slate-650">
                        ¥{(oldEstimate.adjustments.toolingCost || 0).toFixed(2)}
                      </td>
                    </tr>

                    {/* SGA 利管費 */}
                    <tr className="bg-slate-50/80 font-bold border-t">
                      <td className="py-1.5 px-2 text-slate-705">
                        客向利管費 (提出用)
                      </td>
                      <td colSpan={2} className="py-1.5 text-right font-normal text-[9px] text-slate-400 italic">
                        (直原価小計 ¥{oldCalc.primeCost.toFixed(0)} × {oldEstimate.adjustments.sgaRatePercent}%)
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-extrabold text-slate-800">
                        ¥{oldCalc.sgaCost.toFixed(2)}
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Account reconciliation metrics */}
            <div className={`p-3 rounded-lg border flex flex-col justify-between gap-2.5 transition-all outline-hidden ${
              Math.abs(oldCalc.auditVariance) < 0.1
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}>
              
              <div className="flex items-center justify-between leading-none">
                <span className="font-black text-[11px] uppercase tracking-wider">
                  📈 旧価格エクセルお化粧整合性監査
                </span>
                {Math.abs(oldCalc.auditVariance) < 0.1 ? (
                  <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-600 text-white rounded-full flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> 一致
                  </span>
                ) : (
                  <span className="text-[10px] font-black px-2 py-0.5 bg-amber-600 text-white rounded-full flex items-center gap-0.5">
                    <AlertTriangle className="w-3 h-3" /> 不一致
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 border-t pt-2 border-slate-200/50 text-center font-mono">
                <div>
                  <span className="text-[9px] text-slate-450 block">積み上げ見積計</span>
                  <strong className="text-xs font-black">¥{oldCalc.grandTotalUnitPrice.toFixed(1)}</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-450 block">目標決定売価</span>
                  <strong className="text-xs font-black">¥{(oldEstimate.adjustments.targetUnitPrice || oldCalc.grandTotalUnitPrice).toFixed(1)}</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-450 block">ズレ(仕上差異)</span>
                  <strong className={`text-xs font-black ${Math.abs(oldCalc.auditVariance) < 0.1 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {oldCalc.auditVariance > 0 ? '+' : ''}{oldCalc.auditVariance.toFixed(1)}円
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-250/20">
                <span className="text-slate-400 font-medium">※ 目標売価に見積額をピッタリ一致させます。</span>
                <button
                  onClick={() => handleAutoReconcile(false)}
                  className="flex items-center gap-1 font-bold bg-[#107C41] hover:bg-[#073a1e] text-white px-2 py-1 rounded shadow-2xs text-[10px] cursor-pointer"
                  title="材料や賃率を逆算補正してピタッと辻褄を合わせます"
                >
                  <Zap className="w-3 h-3 animate-pulse" />
                  <span>自動辻褄お化粧</span>
                </button>
              </div>

            </div>

          </div>

        </div>

        {/* ==================== RIGHT COLUMN: NEW QUOTATION (新・値上げ価格) ==================== */}
        <div className="bg-white rounded-xl border border-emerald-300 shadow-md overflow-hidden animate-fade-in">
          
          {/* Header */}
          <div className="bg-[#107C41] text-white p-3 border-b flex justify-between items-center select-none">
            <div className="flex items-center gap-1.5 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping" />
              <h3 className="font-extrabold text-xs tracking-wider uppercase">
                2. 新要求価格シート [今回改定提示・最新詳細]
              </h3>
            </div>
            <span className="text-[10px] text-emerald-100 font-bold bg-emerald-800 px-2 py-0.5 rounded-xs">
              最新改定要求
            </span>
          </div>

          <div className="p-4 space-y-4 text-xs">
            
            {/* 1. Margin & Cost Back-calculation Panel */}
            <div className="bg-emerald-50/25 border border-emerald-200 p-3 rounded-lg shadow-3xs space-y-3">
              <div className="font-extrabold text-[#107C41] text-[11px] pb-1 border-b flex justify-between items-center">
                <span>📊 マージン逆算＆価格決定 (売単価と架空仕入)</span>
                <span className="text-[9px] text-emerald-600 font-normal">新シミュレーション</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* Genuine purchase price from supplier */}
                <div className="space-y-1 bg-amber-50 border border-amber-300 p-2 rounded relative">
                  <span className="absolute top-1 right-1 px-1 bg-amber-200 rounded text-[8px] font-black text-amber-850 animate-pulse">仕入値</span>
                  <label className="text-[10px] text-amber-900 font-black flex items-center gap-0.5 block leading-none mb-1">
                    🎯 実際の新仕入単価 (サプライヤー価格)
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-450 font-mono text-[10px]">¥</span>
                    <input
                      type="number"
                      value={newEstimate.adjustments.actualPurchasePrice || ''}
                      onChange={(e) => updateAdjustments(true, 'actualPurchasePrice', e.target.value)}
                      placeholder="0 (明細積み上げ)"
                      className="w-full bg-white border border-amber-300 rounded p-1 text-right font-mono font-black text-amber-905 focus:ring-2 focus:ring-amber-550 focus:border-amber-550"
                    />
                  </div>
                  <p className="text-[9px] text-slate-500 leading-tight">
                    ★仕入の根本根拠です。外掛けマージンや客用架空仕入がここから逆算されます。
                  </p>
                </div>

                {/* Internal markup */}
                <div className="space-y-1 bg-emerald-55/10 p-2 rounded">
                  <label className="text-[10px] text-[#107C41] font-bold block mb-1">
                    社内規定マージン率 (外掛け値)
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newEstimate.adjustments.targetProfitRate || 0}
                      onChange={(e) => updateAdjustments(true, 'targetProfitRate', e.target.value)}
                      className="w-16 bg-white border border-emerald-250 rounded p-1 text-right font-mono font-black text-[#107C41]"
                    />
                    <span className="font-bold text-slate-550">%以上</span>
                  </div>
                  <p className="text-[9px] text-emerald-700">
                    推奨必要売単価: <strong className="font-mono text-[#107C41] font-extrabold">¥{newCalc.requiredSellingPrice.toFixed(2)}</strong>
                  </p>
                </div>

                {/* Client margin */}
                <div className="space-y-1 bg-rose-50/30 p-2 rounded">
                  <label className="text-[10px] text-rose-800 font-bold block mb-1">
                    得意先提示利管率 (内掛け)
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newEstimate.adjustments.targetProfitMarginOff || 0}
                      onChange={(e) => updateAdjustments(true, 'targetProfitMarginOff', e.target.value)}
                      className="w-16 bg-white border border-rose-250 rounded p-1 text-right font-mono font-bold text-rose-700"
                    />
                    <span className="font-bold text-slate-550">%以下</span>
                  </div>
                  <p className="text-[9px] text-slate-500">
                    客宛て推奨架空仕入: <strong className="font-mono text-rose-700 font-extrabold">¥{newCalc.suggestedPurchasePriceForClient.toFixed(1)}</strong>
                  </p>
                </div>

                {/* Target selling profit */}
                <div className="space-y-1 bg-slate-50 p-2 rounded">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">
                    客先提出用 利管費率 (%)
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newEstimate.adjustments.sgaRatePercent || 0}
                      onChange={(e) => updateAdjustments(true, 'sgaRatePercent', e.target.value)}
                      className="w-16 bg-white border rounded p-1 text-right font-mono font-semibold"
                    />
                    <span className="text-slate-400">%</span>
                  </div>
                </div>

              </div>

              {/* Central TargetUnitPrice */}
              <div className="bg-[#107C41]/10 border border-emerald-300 p-2.5 rounded flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-[#107C41] block leading-none">
                    新・決定売値（交渉時要求販売単価）
                  </span>
                  <span className="text-emerald-700/80 text-[9px] block mt-1">※ 決定すべき客向け最終販売価格</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-black text-[#107C41]">¥</span>
                  <input
                    type="number"
                    value={newEstimate.adjustments.targetUnitPrice || ''}
                    onChange={(e) => updateAdjustments(true, 'targetUnitPrice', e.target.value)}
                    placeholder={newCalc.grandTotalUnitPrice.toFixed(0)}
                    className="w-24 bg-white border border-emerald-350 rounded p-1 font-mono text-right text-xs font-black text-slate-800"
                  />
                </div>
              </div>
            </div>

            {/* 2. Breakdown table list */}
            <div className="space-y-1.5">
              <div className="font-bold text-[#107C41] text-[11px] flex justify-between items-center bg-emerald-50/50 p-1 rounded-sm border-b border-emerald-100">
                <span>🔍 新・お化粧原価・内訳積算項目</span>
                <span className="text-[9px] text-[#107C41]/70">見積記述に仕立てるゲタ項目</span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
                <table className="w-full text-[10px] font-sans">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b font-bold text-right select-none">
                      <th className="py-1 px-2 text-left">費目区分</th>
                      <th className="py-1 px-1.5 text-right w-16">内々実際</th>
                      <th className="py-1 px-1.5 text-right w-20 text-rose-700 bg-rose-50/20">提示お化粧値</th>
                      <th className="py-1 px-2 text-right w-20 bg-slate-50/85">見積書記載 (円)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    
                    {/* Material */}
                    <tr>
                      <td className="py-1.5 px-2">
                        <span className="font-bold text-slate-700 block">材料建値 (円/kg)</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">重量 {newEstimate.material.inputWeightG}g</span>
                      </td>
                      <td className="py-1.5 px-1.5 text-right font-mono text-slate-455 text-slate-400">
                        ¥{newEstimate.material.actualBasePricePerKg ?? newEstimate.material.basePricePerKg}
                      </td>
                      <td className="py-1.5 px-1.5 text-right bg-rose-50/10">
                        <input
                          type="number"
                          value={newEstimate.material.basePricePerKg}
                          onChange={(e) => updateMaterialPrice(true, 'basePricePerKg', e.target.value)}
                          className="w-full bg-white border border-rose-200 rounded p-0.5 font-mono text-right text-[10px] font-bold text-rose-700"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-705">
                        ¥{newCalc.netMaterialCost.toFixed(2)}
                      </td>
                    </tr>

                    {/* Processes */}
                    {newEstimate.processes.map((proc, i) => {
                      if (!proc.processName.trim() || proc.isDirectInput) return null;
                      return (
                        <tr key={proc.index}>
                          <td className="py-1 px-2">
                            <span className="font-bold text-slate-700 block truncate max-w-[110px]">{proc.processName}</span>
                            <span className="text-[9px] text-slate-400 block mt-0.5">出来高 {proc.yieldPerHour}個/h</span>
                          </td>
                          <td className="py-1 px-1.5 text-right font-mono text-slate-400">
                            ¥{proc.actualHourlyRate ?? proc.hourlyRate}
                          </td>
                          <td className="py-1 px-1.5 text-right bg-rose-50/10">
                            <input
                              type="number"
                              value={proc.hourlyRate || ''}
                              onChange={(e) => updateProcessRates(true, proc.index, 'hourlyRate', e.target.value)}
                              className="w-full bg-white border border-rose-200 rounded p-0.5 font-mono text-right text-[10px] font-bold text-rose-700 animate-pulse-slow"
                            />
                          </td>
                          <td className="py-1 px-2 text-right font-mono font-bold text-slate-705">
                            ¥{newCalc.processCosts[i].toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Logistics */}
                    <tr>
                      <td className="py-1.5 px-2">
                        <span className="font-bold text-slate-700 block">運賃/箱数 (1個辺り)</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">入数 {newEstimate.logistics.qtyPerBox}個</span>
                      </td>
                      <td className="py-1.5 px-1.5 text-right font-mono text-slate-400">
                        ¥{newEstimate.logistics.actualFreightPerBox ? (newEstimate.logistics.actualFreightPerBox / newEstimate.logistics.qtyPerBox).toFixed(1) : (newEstimate.logistics.freightPerBox / newEstimate.logistics.qtyPerBox).toFixed(1)}
                      </td>
                      <td className="py-1.5 px-1.5 text-right bg-rose-50/10">
                        <input
                          type="number"
                          value={newEstimate.logistics.freightPerBox}
                          onChange={(e) => updateLogisticsRates(true, 'freightPerBox', e.target.value)}
                          className="w-full bg-white border border-rose-200 rounded p-0.5 font-mono text-right text-[10px] font-bold text-rose-700"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-705">
                        ¥{newCalc.shippingCostPerUnit.toFixed(2)}
                      </td>
                    </tr>

                    {/* Tooling and manual adjust */}
                    <tr>
                      <td className="py-1 px-2 text-slate-500 font-medium">型費・特記償却費等</td>
                      <td className="py-1 px-1.5 text-right font-mono text-slate-350">¥0.00</td>
                      <td className="py-1 px-1.5 bg-slate-50">
                        <input
                          type="number"
                          value={newEstimate.adjustments.toolingCost || ''}
                          onChange={(e) => updateAdjustments(true, 'toolingCost', e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent border-0 p-0 text-right font-mono text-[10px]"
                        />
                      </td>
                      <td className="py-1 px-2 text-right font-mono text-slate-655">
                        ¥{(newEstimate.adjustments.toolingCost || 0).toFixed(2)}
                      </td>
                    </tr>

                    {/* SGA 利管費 */}
                    <tr className="bg-emerald-50/30 font-bold border-t border-emerald-100">
                      <td className="py-1.5 px-2 text-emerald-800">
                        客向利管費 (提出用)
                      </td>
                      <td colSpan={2} className="py-1.5 text-right font-normal text-[9px] text-[#107C41] italic">
                        (直原価小計 ¥{newCalc.primeCost.toFixed(0)} × {newEstimate.adjustments.sgaRatePercent}%)
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-extrabold text-[#107C41]">
                        ¥{newCalc.sgaCost.toFixed(2)}
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Account reconciliation metrics */}
            <div className={`p-3 rounded-lg border flex flex-col justify-between gap-2.5 transition-all outline-hidden ${
              Math.abs(newCalc.auditVariance) < 0.1
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}>
              
              <div className="flex items-center justify-between leading-none">
                <span className="font-black text-[11px] uppercase tracking-wider">
                  📈 新価格エクセルお化粧整合性監査
                </span>
                {Math.abs(newCalc.auditVariance) < 0.1 ? (
                  <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-600 text-white rounded-full flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3" /> 一致 (客に矛盾なく提示可)
                  </span>
                ) : (
                  <span className="text-[10px] font-black px-2 py-0.5 bg-amber-600 text-white rounded-full flex items-center gap-0.5 animate-pulse">
                    <AlertTriangle className="w-3 h-3" /> 不一致 (お化粧が必要です)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 border-t pt-2 border-slate-200/50 text-center font-mono font-bold">
                <div>
                  <span className="text-[9px] text-[#107C41]/80 block">積み上げ見積計</span>
                  <strong className="text-xs font-black">¥{newCalc.grandTotalUnitPrice.toFixed(1)}</strong>
                </div>
                <div>
                  <span className="text-[9px] text-[#107C41]/80 block">目標交渉売価</span>
                  <strong className="text-xs font-black">¥{(newEstimate.adjustments.targetUnitPrice || newCalc.grandTotalUnitPrice).toFixed(1)}</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-450 block">ズレ(仕上差異)</span>
                  <strong className={`text-xs font-black ${Math.abs(newCalc.auditVariance) < 0.1 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {newCalc.auditVariance > 0 ? '+' : ''}{newCalc.auditVariance.toFixed(1)}円
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-250/20">
                <span className="text-slate-500 font-medium font-bold">※ 目標交渉価格になるよう、自動で各項目の単価・賃率にゲタを盛りつけます。</span>
                <button
                  onClick={() => handleAutoReconcile(true)}
                  className="flex items-center gap-1 font-bold bg-[#107C41] hover:bg-[#073a1e] text-white px-2.5 py-1.5 rounded-md shadow-sm text-[10.5px] cursor-pointer"
                  title="材料や賃率を自動調整し決定売価にピッタリ辻褄を合わせる"
                >
                  <Zap className="w-3.5 h-3.5 text-yellow-300 animate-bounce" />
                  <span>自動辻褄お化粧</span>
                </button>
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
