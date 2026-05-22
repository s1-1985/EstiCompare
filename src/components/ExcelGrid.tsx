import React, { useState } from 'react';
import { DetailedEstimate, ProcessRow, Scenario } from '../types';
import { calculateEstimate } from '../utils/calculations';
import {
  Settings2, Lock, Zap, CheckCircle2, AlertTriangle,
  HelpCircle, Sparkles, Database,
  TrendingUp, BarChart3, Info, Coins, FileText, ArrowRight, History
} from 'lucide-react';

interface ExcelGridProps {
  oldEstimate: DetailedEstimate;
  onChangeOld: (updated: DetailedEstimate) => void;
  newEstimate: DetailedEstimate;
  onChangeNew: (updated: DetailedEstimate) => void;
  title: string;
  historyScenarios?: Scenario[];
  onLoadHistory?: (id: string) => void;
}

export const ExcelGrid: React.FC<ExcelGridProps> = ({
  oldEstimate,
  onChangeOld,
  newEstimate,
  onChangeNew,
  title,
  historyScenarios = [],
  onLoadHistory,
}) => {
  const oldCalc = calculateEstimate(oldEstimate);
  const newCalc = calculateEstimate(newEstimate);

  const [isInferring, setIsInferring] = useState(false);

  const handleInferProcessParams = async () => {
    try {
      setIsInferring(true);
      const response = await fetch('/api/infer-process-params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processes: newEstimate.processes.filter(p => !p.isDirectInput && p.processName),
          partNumber: newEstimate.partNumber
        })
      });
      if (!response.ok) throw new Error('AI生成エラー');
      
      const { results } = await response.json();
      if (!results || !Array.isArray(results)) return;

      const updateProcs = (est: DetailedEstimate) => {
        const newProcs = [...est.processes];
        const filtered = est.processes.filter(p => !p.isDirectInput && p.processName.trim());
        results.forEach((res: any, i: number) => {
          if (i >= filtered.length) return;
          const pIdx = newProcs.findIndex(p => p.index === filtered[i].index);
          if (pIdx > -1) {
            const suggestedRate = res.suggestedHourlyRate
              ? Math.round(res.suggestedHourlyRate / 100) * 100
              : newProcs[pIdx].hourlyRate;
            newProcs[pIdx] = {
              ...newProcs[pIdx],
              totalHours: res.suggestedTotalHours || 0,
              yieldPerHour: res.suggestedYieldPerHour || 0,
              hourlyRate: suggestedRate,
              actualHourlyRate: suggestedRate,
            };
          }
        });
        return newProcs;
      };

      onChangeOld({ ...oldEstimate, processes: updateProcs(oldEstimate) });
      onChangeNew({ ...newEstimate, processes: updateProcs(newEstimate) });

    } catch (err) {
      console.error(err);
      alert('通信エラーまたはAPIキー未設定のため出来高の自動セットに失敗しました。');
    } finally {
      setIsInferring(false);
    }
  };

  // -------------------------------------------------------------
  // 同期ヘルパー (Common Meta Master synchronizers)
  // -------------------------------------------------------------
  const updateCommonMeta = (key: 'partNumber' | 'partName' | 'baseLotSize' | 'finishedWeightG', value: any) => {
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

  const updateCommonProcessMeta = (
    index: number, 
    key: 'processName' | 'workContent' | 'totalHours' | 'yieldPerHour' | 'actualHourlyRate' | 'directProcessingCost' | 'isDirectInput', 
    value: any
  ) => {
    const updateProcesses = (est: DetailedEstimate) => {
      return est.processes.map((proc) => {
        if (proc.index === index) {
          if (key === 'isDirectInput') return { ...proc, [key]: value };
          if (typeof value === 'string' && (key === 'totalHours' || key === 'yieldPerHour' || key === 'actualHourlyRate' || key === 'directProcessingCost')) {
            const parsed = parseFloat(value);
            return { ...proc, [key]: isNaN(parsed) ? (key === 'actualHourlyRate' ? undefined : 0) : parsed };
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
  // 個別調整入力アップデート項目
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

  const updateProcessRates = (isNew: boolean, index: number, key: 'hourlyRate' | 'actualHourlyRate' | 'directProcessingCost', value: any) => {
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

  const updateCommonLogistics = (value: any) => {
    const parsed = parseFloat(value);
    const val = isNaN(parsed) ? 0 : parsed;
    onChangeOld({ ...oldEstimate, logistics: { ...oldEstimate.logistics, qtyPerBox: val } });
    onChangeNew({ ...newEstimate, logistics: { ...newEstimate.logistics, qtyPerBox: val } });
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

  const updateAdjustments = (
    isNew: boolean, 
    key: 'targetProfitRate' | 'minProfitRate' | 'targetProfitMarginOff' | 'targetUnitPrice' | 'actualPurchasePrice' | 'sgaRatePercent' | 'toolingCost' | 'otherAdjustment', 
    value: any
  ) => {
    const parsed = parseFloat(value);
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const val = value === '' ? '' : (isNaN(parsed) ? 0 : parsed);

    if (key === 'targetProfitRate' || key === 'minProfitRate') {
      onChangeOld({
        ...oldEstimate,
        adjustments: { ...oldEstimate.adjustments, [key]: val as any }
      });
      onChangeNew({
        ...newEstimate,
        adjustments: { ...newEstimate.adjustments, [key]: val as any }
      });
    } else {
      setter({
        ...target,
        adjustments: {
          ...target.adjustments,
          [key]: val as any
        }
      });
    }
  };

  // -------------------------------------------------------------
  // AI自動調整（つじつま合わせプロ調整）
  // -------------------------------------------------------------
  const handleAutoReconcile = (isNew: boolean) => {
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const calc = isNew ? newCalc : oldCalc;

    const minProfitPercent = target.adjustments.minProfitRate || 0;
    const targetProfitPercent = target.adjustments.targetProfitRate || 0;
    
    const actualTotalCost = calc.actualTotalCost;
    const minRequiredSellingPrice = actualTotalCost * (1 + minProfitPercent / 100);
    const targetRequiredSellingPrice = actualTotalCost * (1 + targetProfitPercent / 100);

    let targetUnitPrice = target.adjustments.targetUnitPrice || 0;
    let reconciledUnitPrice = targetUnitPrice;

    if (targetUnitPrice <= 0) {
      reconciledUnitPrice = Math.round(targetRequiredSellingPrice);
    } else {
      if (targetUnitPrice < minRequiredSellingPrice) {
        reconciledUnitPrice = Math.ceil(minRequiredSellingPrice);
        alert(`【利益率下限アラート】\n決定単価が下限利益率(${minProfitPercent}%)を維持できる最低単価 (¥${minRequiredSellingPrice.toFixed(0)}) を下回っているため、下限を下回らないように決定単価を ¥${reconciledUnitPrice} に自動引き上げ（修正）して計算を行います。`);
      }
    }

    const updatedAdjustments = {
      ...target.adjustments,
      targetUnitPrice: reconciledUnitPrice
    };

    const shipping = calc.shippingCostPerUnit;
    const tooling = target.adjustments.toolingCost || 0;
    const otherAdj = target.adjustments.otherAdjustment || 0;

    const Y = reconciledUnitPrice - shipping - tooling - otherAdj;

    if (Y <= 0) {
      alert("目標単価が低すぎるため、加工費の自動調整ができません。目標単価を上げてください。");
      return;
    }

    const validProcesses = target.processes.filter(p => p.processName.trim() !== '' && !p.isDirectInput);
    if (validProcesses.length === 0) {
      alert("加工費の自動調整対象となる工程が見つかりません。");
      return;
    }

    const lotSize = target.baseLotSize || 1;
    const processHoursList = target.processes.map(proc => {
      if (!proc.processName.trim() || proc.isDirectInput) return 0;
      const processHour = proc.yieldPerHour > 0 ? (1 / proc.yieldPerHour) : 0;
      const setupHour = lotSize > 0 ? ((proc.totalHours || 0) / lotSize) : 0;
      return processHour + setupHour;
    });

    const currentTotalProcessCostTemp = target.processes.reduce((sum, proc, i) => {
      if (!proc.processName.trim() || proc.isDirectInput) return sum;
      const actRate = proc.actualHourlyRate ?? proc.hourlyRate ?? 3000;
      return sum + (processHoursList[i] * actRate);
    }, 0);

    let draftProcesses = [...target.processes];
    let finalSgaPercent = target.adjustments.sgaRatePercent || 15;

    const materialCost = calc.netMaterialCost;

    const directInputTotal = target.processes.reduce((sum, proc) => {
      if (!proc.processName.trim() || !proc.isDirectInput) return sum;
      return sum + (proc.directProcessingCost || 0);
    }, 0);

    if (currentTotalProcessCostTemp > 0) {
      const targetPrimeCost = Y / (1 + finalSgaPercent / 100);
      const targetNonDirectProcessCost = Math.max(0, targetPrimeCost - materialCost - directInputTotal);
      const multiplier = Math.max(0.1, targetNonDirectProcessCost / currentTotalProcessCostTemp);

      // 賃率を100円単位（下二桁 00）に丸め（端数処理）
      draftProcesses = target.processes.map((proc, i) => {
        if (!proc.processName.trim() || proc.isDirectInput) return proc;
        const actRate = proc.actualHourlyRate ?? proc.hourlyRate ?? 3000;
        const rawRate = actRate * multiplier;
        let roundedRate = Math.round(rawRate / 100) * 100;
        if (roundedRate < 1000) roundedRate = 1000; // 下限1,000円保証
        return {
          ...proc,
          hourlyRate: roundedRate
        };
      });
    }

    const tempPrimeCost = materialCost + draftProcesses.reduce((sum, proc, i) => {
      if (!proc.processName.trim()) return sum;
      if (proc.isDirectInput) return sum + (proc.directProcessingCost || 0);
      return sum + (processHoursList[i] * (proc.hourlyRate || 0));
    }, 0);

    if (tempPrimeCost > 0) {
      const neededSgaTrue = ((Y / tempPrimeCost) - 1) * 100;
      finalSgaPercent = Math.max(0, Math.round(neededSgaTrue * 100) / 100);
    }
    updatedAdjustments.sgaRatePercent = finalSgaPercent;

    setter({
      ...target,
      processes: draftProcesses,
      adjustments: updatedAdjustments
    });
  };

  // Empty-field highlight utility
  const isEmptyStr = (v: string | undefined) => !v || v.trim() === '';
  const isEmptyNum = (v: number | undefined | null) => !v || v === 0;
  const fld = (empty: boolean) =>
    empty
      ? 'bg-yellow-50 border-yellow-300 focus:border-yellow-400 focus:ring-yellow-200'
      : 'bg-white border-slate-200 focus:border-emerald-500 focus:ring-emerald-500/15';

  return (
    <div className="space-y-5 pb-16">

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ① 基本情報 ━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <h2 className="text-xs font-extrabold tracking-wide">① 基本情報</h2>
          <span className="text-[9px] text-slate-400 ml-auto">品番・品名・ロット・重量</span>
        </div>
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">品番 <span className="text-rose-500">*</span></label>
            <input
              type="text"
              value={newEstimate.partNumber}
              onChange={(e) => updateCommonMeta('partNumber', e.target.value)}
              placeholder="例: 66-13401-09100-02"
              className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-lg border outline-none focus:ring-2 transition-all ${fld(isEmptyStr(newEstimate.partNumber))}`}
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">品名</label>
            <input
              type="text"
              value={newEstimate.partName ?? ''}
              onChange={(e) => updateCommonMeta('partName', e.target.value)}
              placeholder="例: 板金プレスブラケット"
              className={`w-full px-3 py-2 text-xs font-bold rounded-lg border outline-none focus:ring-2 transition-all ${fld(isEmptyStr(newEstimate.partName))}`}
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">完成品重量 <span className="text-rose-500">*</span></label>
            <div className="relative">
              <input
                type="number"
                value={newEstimate.finishedWeightG || ''}
                onChange={(e) => updateCommonMeta('finishedWeightG', parseFloat(e.target.value) || 0)}
                placeholder="180"
                className={`w-full pl-3 pr-8 py-2 text-xs font-mono font-bold rounded-lg border outline-none focus:ring-2 transition-all ${fld(isEmptyNum(newEstimate.finishedWeightG))}`}
              />
              <span className="absolute right-2.5 top-2 text-[9px] text-slate-400 pointer-events-none">g</span>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold text-emerald-600 mb-1 uppercase tracking-wider">🔗 新旧共通</label>
            <div className="text-[10px] text-slate-400 py-2 px-3 border border-slate-100 rounded-lg bg-slate-50">
              品番・品名・完成品重量は新旧で同期されます
            </div>
          </div>

          {/* 品番履歴パネル */}
          {historyScenarios.length > 0 && (
            <div className="col-span-full mt-1 p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="text-[10px] font-extrabold text-blue-800">
                  この品番の保存済み見積が {historyScenarios.length} 件あります — 読み込むと現在の入力が上書きされます
                </span>
              </div>
              <div className="space-y-1.5">
                {historyScenarios.map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-blue-100 gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-800 truncate block">{s.name}</span>
                      <span className="text-[10px] text-slate-400">
                        旧: ¥{s.oldEstimate.adjustments.targetUnitPrice.toLocaleString()} → 新: ¥{s.newEstimate.adjustments.targetUnitPrice.toLocaleString()}
                        {s.updatedAt?.seconds && (
                          <span className="ml-2">
                            {new Date(s.updatedAt.seconds * 1000).toLocaleDateString('ja-JP')}
                          </span>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={() => onLoadHistory?.(s.id)}
                      className="shrink-0 text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md px-2.5 py-1 transition-all cursor-pointer"
                    >
                      読み込む
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ② 共通諸元 ━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
        <div className="bg-emerald-900 text-white px-5 py-3 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          <h2 className="text-xs font-extrabold tracking-wide">② 共通諸元</h2>
          <span className="ml-2 text-[9px] bg-emerald-700 px-2 py-0.5 rounded font-bold">🔁 新旧同期 — 変更すると両側に即反映</span>
        </div>
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="col-span-full sm:col-span-2">
            <label className="block text-[10px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">材質・規格</label>
            <input
              type="text"
              value={newEstimate.material.materialName}
              onChange={(e) => updateCommonMaterialMeta('materialName', e.target.value)}
              placeholder="例: SPCC コイル鋼板 t2.0"
              className={`w-full px-3 py-2 text-xs font-bold rounded-lg border outline-none focus:ring-2 transition-all ${fld(isEmptyStr(newEstimate.material.materialName))}`}
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">材料投入量 <span className="text-rose-500">*</span></label>
            <div className="relative">
              <input
                type="number"
                value={newEstimate.material.inputWeightG || ''}
                onChange={(e) => updateCommonMaterialMeta('inputWeightG', e.target.value)}
                placeholder="220"
                className={`w-full pl-3 pr-8 py-2 text-xs font-mono rounded-lg border outline-none focus:ring-2 transition-all ${fld(isEmptyNum(newEstimate.material.inputWeightG))}`}
              />
              <span className="absolute right-2.5 top-2 text-[9px] text-slate-400 pointer-events-none">g</span>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">スクラップ重量</label>
            <div className="relative">
              <input
                type="number"
                value={newEstimate.material.scrapWeightG || ''}
                onChange={(e) => updateCommonMaterialMeta('scrapWeightG', e.target.value)}
                placeholder="40"
                className="w-full pl-3 pr-8 py-2 text-xs font-mono rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-500/15 transition-all"
              />
              <span className="absolute right-2.5 top-2 text-[9px] text-slate-400 pointer-events-none">g</span>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">箱入り数 <span className="text-rose-500">*</span></label>
            <div className="relative">
              <input
                type="number"
                value={newEstimate.logistics.qtyPerBox || ''}
                onChange={(e) => updateCommonLogistics(e.target.value)}
                placeholder="10"
                className={`w-full pl-3 pr-8 py-2 text-xs font-mono rounded-lg border outline-none focus:ring-2 transition-all ${fld(isEmptyNum(newEstimate.logistics.qtyPerBox))}`}
              />
              <span className="absolute right-2.5 top-2 text-[9px] text-slate-400 pointer-events-none">個/箱</span>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">製造ロット</label>
            <p className="text-[10px] text-slate-400 py-2 px-3 border border-slate-100 rounded-lg bg-slate-50">
              ロットは旧・新それぞれ④で設定
            </p>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ③ 工程マスタ ━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-indigo-950 text-white px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
            <div>
              <h2 className="text-xs font-extrabold tracking-wide">③ 工程マスタ</h2>
              <p className="text-[9px] text-indigo-400">出来高・段取・実賃率は新旧同期 / 賃率は④で各側ごとに設定</p>
            </div>
          </div>
          <button
            onClick={handleInferProcessParams}
            disabled={isInferring}
            className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-[10px] font-bold px-2.5 sm:px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1.5 shrink-0 transition-all cursor-pointer min-h-[36px]"
          >
            <Sparkles className={`w-3 h-3 shrink-0 ${isInferring ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isInferring ? 'AI推定中...' : 'AI出来高・賃率を自動設定'}</span>
            <span className="sm:hidden">{isInferring ? '推定中...' : 'AI自動設定'}</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">
                <th className="py-2.5 px-3 text-center w-10">No</th>
                <th className="py-2.5 px-3 text-left w-40">工程名</th>
                <th className="py-2.5 px-3 text-left">作業内容</th>
                <th className="py-2.5 px-3 text-right w-32 text-emerald-700 bg-emerald-500/5">出来高 / 外注単価</th>
                <th className="py-2.5 px-3 text-right w-28">段取 (h)</th>
                <th className="py-2.5 px-3 text-right w-32 text-indigo-600">実態賃率 (/h)</th>
                <th className="py-2.5 px-3 text-center w-20">種別</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {newEstimate.processes.map((proc) => (
                <tr key={proc.index} className={`transition-colors ${proc.isDirectInput ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50/60'}`}>
                  <td className="py-2 px-3 text-center font-mono text-slate-400 text-[10px] select-none">#{proc.index}</td>
                  <td className="py-1.5 px-2">
                    <input
                      type="text"
                      value={proc.processName}
                      onChange={(e) => updateCommonProcessMeta(proc.index, 'processName', e.target.value)}
                      placeholder="工程名"
                      className={`w-full px-2.5 py-1.5 text-xs font-bold rounded-md border outline-none transition-all focus:ring-1 ${proc.processName ? 'border-slate-200 bg-white focus:border-emerald-400' : 'border-slate-200 bg-white focus:border-emerald-400'}`}
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="text"
                      value={proc.workContent}
                      onChange={(e) => updateCommonProcessMeta(proc.index, 'workContent', e.target.value)}
                      placeholder="例: 300tプレス、金型No.P-12"
                      className="w-full px-2.5 py-1.5 text-xs text-slate-600 rounded-md border border-slate-200 bg-white outline-none transition-all focus:ring-1 focus:border-emerald-400"
                    />
                  </td>
                  <td className="py-1.5 px-2 bg-emerald-500/5">
                    {proc.isDirectInput ? (
                      <div className="relative">
                        <input
                          type="number"
                          value={proc.directProcessingCost || ''}
                          onChange={(e) => updateCommonProcessMeta(proc.index, 'directProcessingCost', e.target.value)}
                          placeholder="0"
                          className="w-full pl-2 pr-14 py-1.5 text-xs font-mono text-amber-800 font-bold rounded-md border border-amber-300 bg-white outline-none focus:ring-1 focus:border-amber-400"
                        />
                        <span className="absolute right-2 top-1.5 text-[9px] text-amber-600 pointer-events-none font-bold">円/個</span>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="number"
                          value={proc.yieldPerHour || ''}
                          onChange={(e) => updateCommonProcessMeta(proc.index, 'yieldPerHour', e.target.value)}
                          placeholder="0"
                          className={`w-full pl-2 pr-10 py-1.5 text-xs font-mono rounded-md border outline-none focus:ring-1 ${proc.processName && !proc.yieldPerHour ? 'border-amber-300 bg-amber-50 focus:border-amber-400' : 'border-emerald-300 bg-white focus:border-emerald-500'}`}
                        />
                        <span className="absolute right-2 top-1.5 text-[9px] text-emerald-600 pointer-events-none font-bold">個/h</span>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    {proc.isDirectInput ? (
                      <div className="flex items-center justify-center h-8 text-[10px] text-slate-300 bg-slate-50 rounded-md border border-slate-100 select-none">非適用</div>
                    ) : (
                      <div className="relative">
                        <input
                          type="number"
                          value={proc.totalHours || ''}
                          onChange={(e) => updateCommonProcessMeta(proc.index, 'totalHours', e.target.value)}
                          placeholder="0"
                          className="w-full pl-2 pr-6 py-1.5 text-xs font-mono rounded-md border border-slate-200 bg-white outline-none focus:ring-1 focus:border-emerald-400"
                          step="any"
                        />
                        <span className="absolute right-2 top-1.5 text-[9px] text-slate-400 pointer-events-none">h</span>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    {proc.isDirectInput ? (
                      <div className="flex items-center justify-center h-8 text-[10px] text-slate-300 bg-slate-50 rounded-md border border-slate-100 select-none">非適用</div>
                    ) : (
                      <div className="relative">
                        <input
                          type="number"
                          value={proc.actualHourlyRate || ''}
                          onChange={(e) => updateCommonProcessMeta(proc.index, 'actualHourlyRate', e.target.value)}
                          placeholder="実際賃率"
                          className="w-full pl-2 pr-12 py-1.5 text-xs font-mono font-bold text-indigo-900 rounded-md border border-indigo-200 bg-white outline-none focus:ring-1 focus:border-indigo-400"
                        />
                        <span className="absolute right-2 top-1.5 text-[9px] text-indigo-500 pointer-events-none font-bold">円/h</span>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <button
                      onClick={() => updateCommonProcessMeta(proc.index, 'isDirectInput', !proc.isDirectInput)}
                      className={`text-[9px] px-2 py-1 rounded-full font-bold border transition-all cursor-pointer w-full ${
                        proc.isDirectInput
                          ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {proc.isDirectInput ? '外注費' : '加工費'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ④ 新旧対比 ━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {([false, true] as const).map((isNew) => {
          const est = isNew ? newEstimate : oldEstimate;
          const calc = isNew ? newCalc : oldCalc;
          const headerBg = isNew ? 'bg-[#107C41]' : 'bg-slate-700';
          const borderCls = isNew ? 'border-emerald-300' : 'border-slate-300';
          const label = isNew ? '🆕 新単価' : '📋 旧単価';
          const labelSub = isNew ? '新仕入れ単価をもとに新売値を設定' : '現行仕入れ・現行売値の確認';
          const totalColor = isNew ? 'text-[#107C41]' : 'text-slate-800';

          return (
            <div key={String(isNew)} className={`bg-white rounded-2xl border-2 ${borderCls} shadow-sm overflow-hidden`}>

              {/* Panel header with live total */}
              <div className={`${headerBg} text-white px-4 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between`}>
                <div>
                  <h3 className="text-sm font-extrabold">{label}</h3>
                  <p className="text-[10px] opacity-70">{labelSub}</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] opacity-60">現在の見積単価</div>
                  <div className="text-xl font-black font-mono">¥{calc.grandTotalUnitPrice.toFixed(0)}</div>
                </div>
              </div>

              <div className="divide-y divide-slate-100">

                {/* ─── 価格目標 ─── */}
                <div className="p-4 sm:p-5 space-y-3">
                  <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5" /> 価格目標
                  </h4>

                  {/* 製造ロット (side-specific) */}
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-slate-600 w-24 sm:w-28 shrink-0">製造ロット</label>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={est.baseLotSize || ''}
                        onChange={(e) => {
                          const v = Math.max(1, parseInt(e.target.value) || 1);
                          isNew ? onChangeNew({ ...est, baseLotSize: v }) : onChangeOld({ ...est, baseLotSize: v });
                        }}
                        className="w-full pl-3 pr-14 py-1.5 text-xs font-mono rounded-lg border border-slate-200 bg-white outline-none focus:ring-1 focus:border-emerald-400 transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-slate-400 pointer-events-none">個/Lot</span>
                    </div>
                  </div>

                  {/* 仕入れ実費 */}
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-indigo-700 w-24 sm:w-28 shrink-0">
                      {isNew ? '新' : ''}仕入れ実費
                      <span className="text-[8px] text-indigo-400 block font-normal">社内のみ</span>
                    </label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400">¥</span>
                      <input
                        type="number"
                        value={est.adjustments.actualPurchasePrice || ''}
                        onChange={(e) => updateAdjustments(isNew, 'actualPurchasePrice', e.target.value)}
                        placeholder="実際の仕入れ単価"
                        className="w-full pl-6 pr-3 py-1.5 text-xs font-mono text-indigo-900 rounded-lg border border-indigo-200 bg-indigo-50/30 outline-none focus:ring-1 focus:border-indigo-400 transition-all"
                      />
                    </div>
                  </div>

                  {/* 売値 */}
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-extrabold text-slate-800 w-24 sm:w-28 shrink-0">
                      {isNew ? '目標' : '現行'}売値 <span className="text-rose-500">*</span>
                      <span className="text-[8px] text-slate-400 block font-normal">客提示価格</span>
                    </label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400">¥</span>
                      <input
                        type="number"
                        value={est.adjustments.targetUnitPrice || ''}
                        onChange={(e) => updateAdjustments(isNew, 'targetUnitPrice', e.target.value)}
                        placeholder={isNew ? "新しい売値を入力" : "現行売値"}
                        className={`w-full pl-6 pr-3 py-2 text-sm font-mono font-extrabold rounded-lg border outline-none focus:ring-2 transition-all ${fld(isEmptyNum(est.adjustments.targetUnitPrice))}`}
                      />
                    </div>
                  </div>

                  {/* 最低利益率 */}
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-slate-600 w-24 sm:w-28 shrink-0">
                      最低利益率
                      <span className="text-[8px] text-slate-400 block font-normal">外掛け下限</span>
                    </label>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={est.adjustments.minProfitRate ?? ''}
                        onChange={(e) => updateAdjustments(isNew, 'minProfitRate', e.target.value)}
                        placeholder="例: 25"
                        className="w-full pl-3 pr-8 py-1.5 text-xs font-mono rounded-lg border border-slate-200 bg-white outline-none focus:ring-1 focus:border-rose-400 transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-slate-400 pointer-events-none">%</span>
                    </div>
                    {/* 実効外掛け率 */}
                    {est.adjustments.actualPurchasePrice > 0 && calc.grandTotalUnitPrice > 0 && (
                      <span className={`text-[10px] font-extrabold shrink-0 ${
                        ((calc.grandTotalUnitPrice / est.adjustments.actualPurchasePrice - 1) * 100) >= (est.adjustments.minProfitRate || 25)
                          ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        実: {((calc.grandTotalUnitPrice / est.adjustments.actualPurchasePrice - 1) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* ─── 材料単価 ─── */}
                <div className="p-4 sm:p-5 space-y-3">
                  <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> 材料単価
                  </h4>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-extrabold text-slate-800 w-24 sm:w-28 shrink-0">
                      建値 (客提示) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400">¥</span>
                      <input
                        type="number"
                        value={est.material.basePricePerKg || ''}
                        onChange={(e) => updateMaterialPrice(isNew, 'basePricePerKg', e.target.value)}
                        placeholder="建値/kg"
                        className={`w-full pl-6 pr-14 py-1.5 text-xs font-mono font-bold rounded-lg border outline-none focus:ring-1 transition-all ${fld(isEmptyNum(est.material.basePricePerKg))}`}
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-slate-400 pointer-events-none">円/kg</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-slate-500 w-24 sm:w-28 shrink-0">実際建値</label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400">¥</span>
                      <input
                        type="number"
                        value={est.material.actualBasePricePerKg ?? ''}
                        onChange={(e) => updateMaterialPrice(isNew, 'actualBasePricePerKg', e.target.value)}
                        placeholder="仕入れ建値/kg"
                        className="w-full pl-6 pr-14 py-1.5 text-xs font-mono text-indigo-800 rounded-lg border border-indigo-200 bg-indigo-50/30 outline-none focus:ring-1 focus:border-indigo-400 transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-slate-400 pointer-events-none">円/kg</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-slate-500 w-24 sm:w-28 shrink-0">スクラップ単価</label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400">¥</span>
                      <input
                        type="number"
                        value={est.material.scrapPricePerKg || ''}
                        onChange={(e) => updateMaterialPrice(isNew, 'scrapPricePerKg', e.target.value)}
                        placeholder="0"
                        className="w-full pl-6 pr-14 py-1.5 text-xs font-mono rounded-lg border border-slate-200 bg-white outline-none focus:ring-1 focus:border-emerald-400 transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-slate-400 pointer-events-none">円/kg</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 text-right">
                    ▶ 材料費計: <strong className="font-mono text-slate-700">¥{calc.netMaterialCost.toFixed(2)}</strong>
                  </div>
                </div>

                {/* ─── 工程賃率 ─── */}
                {est.processes.some(p => p.processName.trim()) && (
                  <div className="p-4 sm:p-5 space-y-3">
                    <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5" /> 工程賃率
                      <span className="text-[9px] font-normal text-slate-400 normal-case ml-1">※ここだけ新旧独立</span>
                    </h4>
                    {est.processes.map((proc, i) => {
                      if (!proc.processName.trim()) return null;
                      const rateVal = proc.isDirectInput ? proc.directProcessingCost : proc.hourlyRate;
                      const isEmpty = isEmptyNum(rateVal);
                      return (
                        <div key={proc.index} className="flex items-center gap-3">
                          <label className="text-[10px] font-bold w-24 sm:w-28 shrink-0 text-slate-700 truncate" title={proc.processName}>
                            {proc.isDirectInput && <span className="text-amber-600 mr-0.5 text-[9px]">外</span>}
                            {proc.processName}
                          </label>
                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400">¥</span>
                            <input
                              type="number"
                              value={rateVal || ''}
                              onChange={(e) => updateProcessRates(isNew, proc.index, proc.isDirectInput ? 'directProcessingCost' : 'hourlyRate', e.target.value)}
                              placeholder={proc.isDirectInput ? '外注単価' : '客提示賃率'}
                              className={`w-full pl-6 pr-16 py-1.5 text-xs font-mono font-bold rounded-lg border outline-none focus:ring-1 transition-all ${fld(isEmpty)}`}
                            />
                            <span className="absolute right-2.5 top-1.5 text-[9px] text-slate-400 pointer-events-none">
                              {proc.isDirectInput ? '円/個' : '円/h'}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 w-20 text-right shrink-0">
                            ¥{calc.processCosts[i].toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                    <div className="text-[10px] text-slate-400 text-right pt-1 border-t border-slate-100">
                      ▶ 加工費計: <strong className="font-mono text-slate-700">¥{calc.totalProcessCost.toFixed(2)}</strong>
                    </div>
                  </div>
                )}

                {/* ─── 物流費 ─── */}
                <div className="p-4 sm:p-5 space-y-3">
                  <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" /> 物流費
                  </h4>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-extrabold text-slate-800 w-24 sm:w-28 shrink-0">
                      送料 (客提示) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400">¥</span>
                      <input
                        type="number"
                        value={est.logistics.freightPerBox || ''}
                        onChange={(e) => updateLogisticsRates(isNew, 'freightPerBox', e.target.value)}
                        placeholder="送料/箱"
                        className={`w-full pl-6 pr-8 py-1.5 text-xs font-mono font-bold rounded-lg border outline-none focus:ring-1 transition-all ${fld(isEmptyNum(est.logistics.freightPerBox))}`}
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-slate-400 pointer-events-none">/箱</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-slate-500 w-24 sm:w-28 shrink-0">実際送料</label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400">¥</span>
                      <input
                        type="number"
                        value={est.logistics.actualFreightPerBox ?? ''}
                        onChange={(e) => updateLogisticsRates(isNew, 'actualFreightPerBox', e.target.value)}
                        placeholder="実際送料/箱"
                        className="w-full pl-6 pr-8 py-1.5 text-xs font-mono text-indigo-800 rounded-lg border border-indigo-200 bg-indigo-50/30 outline-none focus:ring-1 focus:border-indigo-400 transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-slate-400 pointer-events-none">/箱</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 text-right">
                    ▶ 送料/個: <strong className="font-mono text-slate-700">¥{calc.shippingCostPerUnit.toFixed(2)}</strong>
                  </div>
                </div>

                {/* ─── SGA & 自動整合 ─── */}
                <div className="p-4 sm:p-5 space-y-3">
                  <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" /> 利管費率 (SGA%)
                  </h4>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-extrabold text-slate-800 w-24 sm:w-28 shrink-0">
                      客提示 SGA%
                      <span className="text-[8px] text-slate-400 block font-normal">内掛け表示率</span>
                    </label>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={est.adjustments.sgaRatePercent ?? ''}
                        onChange={(e) => updateAdjustments(isNew, 'sgaRatePercent', e.target.value)}
                        placeholder="15"
                        step="0.01"
                        className="w-full pl-3 pr-8 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 bg-white outline-none focus:ring-1 focus:border-teal-400 transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-slate-400 pointer-events-none">%</span>
                    </div>
                    {est.adjustments.sgaRatePercent !== undefined && (est.adjustments.sgaRatePercent < 5 || est.adjustments.sgaRatePercent > 30) && calc.grandTotalUnitPrice > 0 && (
                      <span className="text-rose-500 text-[9px] font-bold shrink-0 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> 要注意
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-slate-500 w-24 sm:w-28 shrink-0">型費・特記</label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-slate-400">¥</span>
                      <input
                        type="number"
                        value={est.adjustments.toolingCost || ''}
                        onChange={(e) => updateAdjustments(isNew, 'toolingCost', e.target.value)}
                        placeholder="0"
                        className="w-full pl-6 pr-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 bg-white outline-none focus:ring-1 focus:border-slate-400 transition-all"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => handleAutoReconcile(isNew)}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-[11px] py-2.5 rounded-xl border border-emerald-500 flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer mt-1"
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-300" />
                    一発自動整合 — 賃率→SGA%を目標売値に合わせて逆算
                  </button>
                </div>

                {/* ─── 計算結果サマリー ─── */}
                <div className={`p-4 sm:p-5 ${Math.abs(calc.auditVariance) < 0.1 ? 'bg-emerald-50/60' : 'bg-amber-50/60'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">計算結果</h4>
                    {Math.abs(calc.auditVariance) < 0.1
                      ? <span className="text-[10px] font-black text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> 整合済み</span>
                      : <span className="text-[10px] font-black text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> 乖離: {calc.auditVariance > 0 ? '+' : ''}{calc.auditVariance.toFixed(2)}円</span>
                    }
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: '材料費', val: calc.netMaterialCost },
                      { label: '加工費計', val: calc.totalProcessCost },
                      { label: '送料', val: calc.shippingCostPerUnit },
                      { label: '型費', val: est.adjustments.toolingCost || 0 },
                      { label: `利益 (SGA ${est.adjustments.sgaRatePercent?.toFixed(1) ?? 0}%)`, val: calc.sgaCost },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex justify-between text-xs">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-mono font-bold text-slate-700">¥{val.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="border-t border-slate-300 pt-2 mt-2 flex justify-between items-baseline">
                      <span className="font-extrabold text-slate-900 text-xs">見積単価</span>
                      <span className={`text-xl font-black font-mono ${totalColor}`}>¥{calc.grandTotalUnitPrice.toFixed(2)}</span>
                    </div>
                    {est.adjustments.targetUnitPrice > 0 && (
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>目標売値</span>
                        <span className="font-mono">¥{est.adjustments.targetUnitPrice.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ⑤ SGA警告 ━━━━━━━━━━━━━━━━━━━━━━ */}
      {(oldCalc.grandTotalUnitPrice > 0 || newCalc.grandTotalUnitPrice > 0) &&
        ((oldEstimate.adjustments.sgaRatePercent !== undefined && (oldEstimate.adjustments.sgaRatePercent < 5 || oldEstimate.adjustments.sgaRatePercent > 30)) ||
         (newEstimate.adjustments.sgaRatePercent !== undefined && (newEstimate.adjustments.sgaRatePercent < 5 || newEstimate.adjustments.sgaRatePercent > 30))) && (
        <div className="p-4 bg-rose-950/80 border border-rose-800 text-rose-200 rounded-2xl text-[10.5px] leading-relaxed shadow-inner">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 animate-bounce" />
            <div>
              <strong className="text-rose-300 block font-bold text-xs mb-1">
                ⚠️【審議警告】SGA%が不自然な範囲 (5%未満 / 30%超) です
              </strong>
              賃率調整だけで辻褄を合わせようとしている場合、
              <strong className="text-white">③工程マスタの「出来高」と「段取時間」の前提見直し</strong>を合わせて行うと自然な数値に収まります。
              <span className="block mt-1 text-rose-300">
                現在値: 旧={oldEstimate.adjustments.sgaRatePercent?.toFixed(1)}% / 新={newEstimate.adjustments.sgaRatePercent?.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
