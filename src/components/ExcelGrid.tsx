import React, { useState } from 'react';
import { DetailedEstimate, ProcessRow } from '../types';
import { calculateEstimate } from '../utils/calculations';
import {
  Settings2, Lock, Zap, CheckCircle2, AlertTriangle,
  HelpCircle, Sparkles, Database,
  TrendingUp, BarChart3, Info, Coins, FileText, ArrowRight
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
  const updateCommonMeta = (key: 'partNumber' | 'finishedWeightG', value: any) => {
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

  return (
    <div className="space-y-6 pb-12">
      
      {/* 🔬 リアルタイム新旧査定サマリー & 常時整合監査 コックピット */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-950 shadow-2xl p-6 relative overflow-hidden">
        {/* Subtle decorative background pattern / border glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row items-stretch gap-6">
          {/* Column A: Pricing Overview */}
          <div className="flex-1 space-y-4 lg:border-r lg:border-slate-800 lg:pr-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] bg-slate-800 text-slate-300 font-extrabold px-2.5 py-1 rounded-md tracking-wider">
                  🔬 リアルタイム査定サマリー / 新旧比較
                </span>
                <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono text-[10px]">自動計算連動中</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 block font-normal leading-none mb-1">旧・提出決定単価</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-slate-500 text-xs font-mono">¥</span>
                    <span className="text-2xl font-black font-mono text-slate-200">
                      {(oldEstimate.adjustments.targetUnitPrice || oldCalc.grandTotalUnitPrice).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 block font-mono mt-1">（積上原価: ¥{oldCalc.grandTotalUnitPrice.toFixed(1)}）</span>
                </div>

                <div>
                  <span className="text-[10px] text-emerald-400 block font-bold leading-none mb-1">新・要求目標単価</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-emerald-550 text-xs font-mono text-[#107C41]">¥</span>
                    <span className="text-2xl font-black font-mono text-emerald-400">
                      {(newEstimate.adjustments.targetUnitPrice || newCalc.grandTotalUnitPrice).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                  </div>
                  <span className="text-[9px] text-emerald-600 block font-mono mt-1">（積上原価: ¥{newCalc.grandTotalUnitPrice.toFixed(1)}）</span>
                </div>
              </div>
            </div>

            {/* Price Change visual bar */}
            {(() => {
              const oldT = oldEstimate.adjustments.targetUnitPrice || oldCalc.grandTotalUnitPrice;
              const newT = newEstimate.adjustments.targetUnitPrice || newCalc.grandTotalUnitPrice;
              const diff = newT - oldT;
              const ratio = oldT > 0 ? (diff / oldT) * 100 : 0;
              return (
                <div className="mt-4 bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-slate-400 block leading-none">新旧要求の純差額</span>
                    <span className="text-sm font-black font-mono mt-1 block text-slate-200">
                      {diff > 0 ? '+' : ''}{diff.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} 円
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] text-slate-400 block leading-none">価格改定率</span>
                    <span className={`text-md font-black font-mono mt-1 block ${ratio > 0 ? 'text-rose-400' : ratio < 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {ratio > 0 ? '▲' : ratio < 0 ? '▼' : ''}{Math.abs(ratio).toFixed(2)} %
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Column B: Real-time Reconciler & SGA Audit Status */}
          <div className="flex-1 space-y-4 lg:pl-2 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-slate-400 block font-extrabold uppercase tracking-wide mb-2.5">
                ⚖️ 提出整合性監査 (下二桁 00 丸め & SGA% 調整)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Old check */}
                {(() => {
                  const isValid = Math.abs(oldCalc.auditVariance) < 0.1;
                  return (
                    <div className={`p-3 rounded-xl border ${isValid ? 'bg-emerald-950/20 border-emerald-900/60 text-emerald-200' : 'bg-amber-950/25 border-amber-900/60 text-amber-200'} flex flex-col justify-between gap-1.5`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-300">① 旧見積整合</span>
                        <span className={`text-[9.5px] font-mono font-black px-1.5 py-0.5 rounded ${isValid ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/40' : 'bg-amber-900/50 text-amber-300 border border-amber-805'}`}>
                          {isValid ? '合致済' : '端数ズレ'}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-[9px] text-slate-400 leading-none">提示利管率 (SGA):</div>
                        <div className="text-xs font-black font-mono text-slate-50">{(oldEstimate.adjustments.sgaRatePercent || 0).toFixed(2)}%</div>
                      </div>
                      
                      {!isValid && (
                        <button
                          onClick={() => handleAutoReconcile(false)}
                          className="w-full mt-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 text-[10px] font-extrabold py-1 rounded border border-amber-400 transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-sm font-sans"
                        >
                          <Zap className="w-3 h-3 text-slate-950 shrink-0" />
                          <span>辻褄を解消</span>
                        </button>
                      )}
                    </div>
                  );
                })()}

                {/* New check */}
                {(() => {
                  const isValid = Math.abs(newCalc.auditVariance) < 0.1;
                  return (
                    <div className={`p-3 rounded-xl border ${isValid ? 'bg-emerald-950/20 border-emerald-900/60 text-emerald-200' : 'bg-amber-950/25 border-amber-900/40 text-amber-200'} flex flex-col justify-between gap-1.5`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-300">② 新見積整合</span>
                        <span className={`text-[9.5px] font-mono font-black px-1.5 py-0.5 rounded ${isValid ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/40' : 'bg-amber-900/50 text-amber-300 border border-amber-805'}`}>
                          {isValid ? '合致済' : '端数ズレ'}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-[9px] text-slate-400 leading-none">提示利管率 (SGA):</div>
                        <div className="text-xs font-black font-mono text-slate-50">{(newEstimate.adjustments.sgaRatePercent || 0).toFixed(2)}%</div>
                      </div>

                      {!isValid && (
                        <button
                          onClick={() => handleAutoReconcile(true)}
                          className="w-full mt-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-950 text-[10px] font-black py-1 rounded border border-emerald-500 transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md animate-pulse font-sans"
                        >
                          <Zap className="w-3 h-3 text-slate-950 shrink-0" />
                          <span>一発自動逆算</span>
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            
            <div className="text-[9px] text-slate-400 leading-normal font-sans border-t border-slate-800/50 pt-2 flex justify-between items-center">
              <span>※下請法対応に基づく、100円丸め賃率適用後の自動整合</span>
              <span>(プロ仕様監査)</span>
            </div>
          </div>
        </div>

        {/* Advisory Warning nested inside Cockpit if SGA is invalid on either side */}
        {(oldCalc.grandTotalUnitPrice > 0 || newCalc.grandTotalUnitPrice > 0) &&
          ((oldEstimate.adjustments.sgaRatePercent !== undefined && (oldEstimate.adjustments.sgaRatePercent < 5 || oldEstimate.adjustments.sgaRatePercent > 30)) ||
          (newEstimate.adjustments.sgaRatePercent !== undefined && (newEstimate.adjustments.sgaRatePercent < 5 || newEstimate.adjustments.sgaRatePercent > 30))) && (
          <div className="mt-4 p-3.5 bg-rose-950/70 border border-rose-900/80 text-rose-200 rounded-xl text-[10.5px] font-semibold leading-relaxed shadow-inner">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 animate-bounce" />
              <div>
                <strong className="text-rose-300 block font-bold text-xs uppercase tracking-tight mb-1">
                  🚨【審議警告：不自然な係数（つじつま盛りの限界値）アラート】
                </strong>
                賃率の下二桁を綺麗に「.00」に整えて計算・調整した結果、販売価格に合致させるための <span className="font-extrabold text-white underline text-xs">客先提示利管費率 (SGA%)</span> が、
                監査時に不自然とされる極端範囲 ({oldEstimate.adjustments.sgaRatePercent && (oldEstimate.adjustments.sgaRatePercent < 5 || oldEstimate.adjustments.sgaRatePercent > 30) ? `${oldEstimate.adjustments.sgaRatePercent.toFixed(2)}% (旧仕様)` : ''} {newEstimate.adjustments.sgaRatePercent && (newEstimate.adjustments.sgaRatePercent < 5 || newEstimate.adjustments.sgaRatePercent > 30) ? `${newEstimate.adjustments.sgaRatePercent.toFixed(2)}% (新仕様)` : ''}) になっています。
                <div className="mt-1.5 text-slate-400">
                  <span className="font-extrabold text-white block mb-0.5">💡 プロ査定アドバイス：</span>
                  数値の逆算こじつけのみでは不信感を持たれます！新旧シート共通の生産物理基礎である<strong className="text-emerald-400">「③ 生産出来高（時間あたり収穫量）」</strong>や、小規模生産を圧迫する<strong className="text-emerald-400">「段取準備時間（時間/ロット）」</strong>の設計前提それ自体を「同時再調整」して根拠を整えることを強く推奨します。
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* 📊 A. MASTER PANEL: COMMON SPECIFICATIONS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden transition-all">
        
        {/* Banner header with real-time status */}
        <div className="bg-slate-900 text-white p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-inner flex items-center justify-center">
              <Settings2 className="w-4 h-4 text-emerald-100" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] bg-emerald-700 text-emerald-100 px-2 py-0.5 rounded-md font-bold font-mono">
                  MASTER SPEC
                </span>
                <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-mono font-medium">
                  一元同期設定
                </span>
              </div>
              <h2 className="text-sm font-black tracking-tight mt-0.5 text-slate-100 flex items-center gap-2">
                {title}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] bg-emerald-950/80 px-3 py-1.5 rounded-lg border border-emerald-500/20 font-bold text-emerald-300 shadow-sm">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>新旧工程・質量自動同期設定（基準ロットのみ個別可）</span>
          </div>
        </div>

        {/* Spec board Inputs layout */}
        <div className="p-5 bg-slate-50/30 grid grid-cols-1 md:grid-cols-2 gap-5">
          
          {/* Card 1: Product Specs */}
          <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-xs space-y-3">
            <div className="font-extrabold text-slate-700 border-b border-slate-100 pb-2 flex items-center gap-2 text-xs">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>① 製品基本仕様（左右共通）</span>
            </div>
            
            <div className="space-y-1">
              <label className="text-[9.5px] text-slate-400 font-extrabold tracking-wider block">品目コード / 品番</label>
              <input
                type="text"
                value={newEstimate.partNumber}
                onChange={(e) => updateCommonMeta('partNumber', e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-lg py-1.5 px-3 font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 focus:border-[#107C41] transition-all outline-hidden text-xs self-stretch"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="space-y-1 col-span-1">
                <label className="text-[9.5px] text-slate-400 font-bold block">完成質量 (g/個)</label>
                <input
                  type="number"
                  value={newEstimate.finishedWeightG || ''}
                  onChange={(e) => updateCommonMeta('finishedWeightG', parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-lg py-1.5 px-2 font-mono text-right font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 focus:border-[#107C41] transition-all outline-hidden text-xs"
                />
              </div>
              <div className="space-y-1 col-span-1">
                <label className="text-[9.5px] text-slate-500 font-bold block">旧仕様ロット</label>
                <input
                  type="number"
                  value={oldEstimate.baseLotSize || ''}
                  onChange={(e) => onChangeOld({ ...oldEstimate, baseLotSize: Math.max(1, parseInt(e.target.value) || 0) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 font-mono text-right font-bold text-slate-700 focus:bg-white focus:ring-2 focus:ring-slate-500/15 focus:border-slate-500 transition-all outline-hidden text-xs"
                />
              </div>
              <div className="space-y-1 col-span-1">
                <label className="text-[9.5px] text-emerald-700 font-extrabold block">新仕様ロット</label>
                <input
                  type="number"
                  value={newEstimate.baseLotSize || ''}
                  onChange={(e) => onChangeNew({ ...newEstimate, baseLotSize: Math.max(1, parseInt(e.target.value) || 0) })}
                  className="w-full bg-emerald-50/40 border border-emerald-300 rounded-lg py-1.5 px-2 font-mono text-right font-black text-emerald-950 focus:ring-2 focus:ring-[#107C41]/20 focus:border-[#107C41] transition-all outline-hidden text-xs"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Material general specs */}
          <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-xs space-y-3">
            <div className="font-extrabold text-slate-700 border-b border-slate-100 pb-2 flex items-center gap-2 text-xs">
              <Coins className="w-4 h-4 text-amber-500" />
              <span>② 共通材料基本元情報（左右共通）</span>
            </div>
            
            <div className="space-y-1">
              <label className="text-[9.5px] text-slate-400 font-extrabold tracking-wider block">材質・鋼板・寸法規格</label>
              <input
                type="text"
                value={newEstimate.material.materialName}
                onChange={(e) => updateCommonMaterialMeta('materialName', e.target.value)}
                placeholder="SPCC コイル鋼板"
                className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-lg py-1.5 px-3 font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 focus:border-[#107C41] transition-all outline-hidden text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[9.5px] text-slate-400 font-bold block">投入重量 (g/個)</label>
                <input
                  type="number"
                  value={newEstimate.material.inputWeightG || ''}
                  onChange={(e) => updateCommonMaterialMeta('inputWeightG', e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-lg py-1.5 px-2 font-mono text-right font-extrabold text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 focus:border-[#107C41] transition-all outline-hidden text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9.5px] text-slate-400 font-bold block">スクラップ回収量 (g/個)</label>
                <input
                  type="number"
                  value={newEstimate.material.scrapWeightG || ''}
                  onChange={(e) => updateCommonMaterialMeta('scrapWeightG', e.target.value)}
                  className="w-full bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-lg py-1.5 px-2 font-mono text-right text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 focus:border-[#107C41] transition-all outline-hidden text-xs"
                />
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* 🛠️ ③ PROCESS TIMEOUTS & TACTS TABLE MASTER */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md overflow-hidden transition-all">
        
        {/* Table header */}
        <div className="bg-slate-50 border-b border-slate-200/65 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
            <div>
              <h3 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5 flex-wrap">
                <span>③ 生産出来高（実作業タクト）・段取時間の一元マスタ</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-black tracking-normal">
                  🟢 左右同期
                </span>
                <span className="text-[9px] bg-[#107C41]/10 text-[#107C41] px-2 py-0.5 rounded font-bold">
                  下請法適正指針厳守
                </span>
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">
                ※ 工程の出来高タクト、工程数は不合理な書き換えを防ぐため左右同期。これらを変更すると、新旧見積に同時適用されます。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 hidden lg:flex">
             <button
               onClick={handleInferProcessParams}
               disabled={isInferring}
               className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-[10px] px-3 py-1.5 rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
             >
               <Sparkles className={`w-3 h-3 ${isInferring ? 'animate-spin' : ''}`} />
               {isInferring ? 'AI推定中...' : 'AI出来高・賃率・段取を自動設定'}
             </button>
             <span className="text-[9px] text-slate-500 font-bold bg-white border border-slate-200 p-2 rounded-xl max-w-xs">
               工程名から出来高・設備賃率・段取時間を一括AI推定（Gemini）
             </span>
          </div>
        </div>

        {/* Dense Excel Edit Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-slate-700 min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] text-slate-400 font-extrabold tracking-wider text-right select-none bg-slate-50/50 uppercase">
                <th className="py-2.5 px-3 text-center w-14 bg-slate-100/20">工順</th>
                <th className="py-2.5 px-3 text-left w-56">工程名称 (プレス・洗浄・熱処理・検査等)</th>
                <th className="py-2.5 px-3 text-left w-64">作業内容 / 仕様マスタ [左右共通設定]</th>
                <th className="py-2.5 px-3 text-right w-36 bg-emerald-500/5 text-emerald-950 font-black">
                  <span>設定出来高 </span>
                  <span className="text-[9px] font-mono font-medium text-emerald-600 block">(個 / 1時間あたり)</span>
                </th>
                <th className="py-2.5 px-3 text-right w-32">
                  <span>段取工数 </span>
                  <span className="text-[9px] font-mono font-medium text-slate-400 block">(時間)</span>
                </th>
                <th className="py-2.5 px-3 text-right w-36 text-indigo-700">
                  <span>社内実態賃率 </span>
                  <span className="text-[9px] font-mono font-medium text-indigo-500 block">(参考稼動コスト/h)</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {newEstimate.processes.map((proc, i) => {
                return (
                  <tr key={proc.index} className={`hover:bg-slate-50/50 transition-colors ${proc.isDirectInput ? 'bg-amber-50/30' : ''}`}>

                    {/* 工順番号 */}
                    <td className="py-2.5 px-4 font-mono text-center font-bold text-slate-400 bg-slate-50/20 select-none">
                      #{proc.index}
                    </td>

                    {/* 工程名称 + 外注切替トグル */}
                    <td className="py-1.5 px-3">
                      <input
                        type="text"
                        value={proc.processName}
                        onChange={(e) => updateCommonProcessMeta(proc.index, 'processName', e.target.value)}
                        placeholder="(工程未設定)"
                        className="bg-white border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 rounded-lg w-full px-3 py-2 text-xs font-bold text-slate-800 transition-all outline-hidden"
                      />
                      <button
                        onClick={() => updateCommonProcessMeta(proc.index, 'isDirectInput', !proc.isDirectInput)}
                        className={`mt-1 text-[9px] px-2 py-0.5 rounded font-bold border transition-all cursor-pointer ${
                          proc.isDirectInput
                            ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {proc.isDirectInput ? '▣ 外注/直接費モード' : '▢ 外注に切替'}
                      </button>
                    </td>

                    {/* 作業内容 */}
                    <td className="py-1.5 px-3">
                      <input
                        type="text"
                        value={proc.workContent}
                        onChange={(e) => updateCommonProcessMeta(proc.index, 'workContent', e.target.value)}
                        placeholder="例: 300tプレス、金型No.P-12"
                        className="bg-white border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 rounded-lg w-full px-3 py-2 text-xs text-slate-600 transition-all outline-hidden"
                      />
                    </td>

                    {/* 出来高 / 外注単価 */}
                    <td className="py-1.5 px-3 bg-emerald-500/5 font-bold">
                      {proc.isDirectInput ? (
                        <div className="relative">
                          <input
                            type="number"
                            value={proc.directProcessingCost || ''}
                            onChange={(e) => updateCommonProcessMeta(proc.index, 'directProcessingCost', e.target.value)}
                            placeholder="0"
                            className="bg-white border border-amber-300 font-extrabold rounded-lg w-full pl-3 pr-12 py-2 text-right font-mono text-xs text-amber-800 shadow-inner focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 transition-all outline-hidden"
                          />
                          <span className="absolute right-3 top-2.5 text-[9px] text-amber-600 pointer-events-none font-bold">
                            円/個
                          </span>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="number"
                            value={proc.yieldPerHour || ''}
                            onChange={(e) => updateCommonProcessMeta(proc.index, 'yieldPerHour', e.target.value)}
                            placeholder="0"
                            className="bg-white border border-emerald-300 font-extrabold rounded-lg w-full pl-3 pr-10 py-2 text-right font-mono text-xs text-emerald-950 shadow-inner focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 transition-all outline-hidden"
                          />
                          <span className="absolute right-3 top-2.5 text-[9px] text-emerald-600 pointer-events-none font-bold">
                            個/h
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 段取時間 */}
                    <td className="py-1.5 px-3">
                      {proc.isDirectInput ? (
                        <div className="flex items-center justify-center h-9 text-[10px] text-slate-400 bg-slate-50 rounded-lg border border-slate-200">
                          非適用
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="number"
                            value={proc.totalHours || ''}
                            onChange={(e) => updateCommonProcessMeta(proc.index, 'totalHours', e.target.value)}
                            placeholder="0"
                            className="bg-white border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 rounded-lg w-full pl-3 pr-8 py-2 text-right font-mono text-xs text-slate-700 transition-all outline-hidden"
                            step="any"
                          />
                          <span className="absolute right-3 top-2.5 text-[9px] text-slate-400 pointer-events-none">
                            h
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 実賃率 */}
                    <td className="py-1.5 px-3">
                      {proc.isDirectInput ? (
                        <div className="flex items-center justify-center h-9 text-[10px] text-slate-400 bg-slate-50 rounded-lg border border-slate-200">
                          非適用
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="number"
                            value={proc.actualHourlyRate || ''}
                            onChange={(e) => updateCommonProcessMeta(proc.index, 'actualHourlyRate', e.target.value)}
                            placeholder="実際賃率"
                            className="bg-white border border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 rounded-lg w-full pl-3 pr-12 py-2 text-right font-mono text-xs text-indigo-950 font-bold transition-all outline-hidden"
                          />
                          <span className="absolute right-3 top-2.5 text-[9px] text-indigo-500 pointer-events-none font-bold">
                            円/h
                          </span>
                        </div>
                      )}
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ⚖️ B. SIDE-BY-SIDE DUPLEX CALCULATION & ACCOUNT RECONCILIATION SHEET */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* ==================== LEFT COLUMN: OLD ADAPTATION (旧価格) ==================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden transition-all">
          
          {/* Section banner */}
          <div className="bg-slate-700 text-white p-4 border-b border-slate-800 flex justify-between items-center select-none">
            <div className="flex items-center gap-2">
              <span className="w-2 rounded-full h-4 bg-slate-300 block" />
              <h3 className="font-extrabold text-xs tracking-wider uppercase">
                1. 旧合意価格シート [現在適応中・前回査定]
              </h3>
            </div>
            <span className="text-[9px] tracking-wider text-slate-300 font-bold bg-slate-800 px-2.5 py-1 rounded-full uppercase">
              前回合意
            </span>
          </div>

          <div className="p-6 space-y-6">
            
            {/* Margins controller metrics board */}
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl shadow-inner space-y-4">
              <div className="font-extrabold text-slate-800 text-xs tracking-tight border-b border-slate-200/60 pb-2.5 flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-slate-500" />
                  <span>逆計算マージン諸元 (旧)</span>
                </span>
                <span className="text-[9px] text-slate-400 font-bold font-mono">Row25-30 Control</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3.5">
                
                {/* Supplier base purchase price */}
                <div className="col-span-2 space-y-1 bg-white border border-slate-200 p-2.5 rounded-lg shadow-2xs">
                  <label className="text-[10px] text-slate-500 font-extrabold block leading-none mb-1.5">
                    ⚙️ 実際の旧仕入単価 (サプライヤー合意値)
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono text-xs">¥</span>
                    <input
                      type="number"
                      value={oldEstimate.adjustments.actualPurchasePrice || ''}
                      onChange={(e) => updateAdjustments(false, 'actualPurchasePrice', e.target.value)}
                      placeholder="0 (積み上げ実費適用)"
                      className="w-full bg-slate-50 border-0 border-b border-transparent focus:border-slate-400 rounded p-1 text-right font-mono font-bold text-slate-800 text-sm focus:outline-hidden focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* Target markup */}
                <div className="space-y-1 bg-white/70 border border-slate-200 p-2.5 rounded-lg shadow-3xs">
                  <label className="text-[10px] text-slate-500 font-extrabold block mb-1">社内目標利益率 (外掛)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={oldEstimate.adjustments.targetProfitRate ?? ''}
                      onChange={(e) => updateAdjustments(false, 'targetProfitRate', e.target.value)}
                      className="w-16 bg-slate-50 border border-slate-200 p-1 text-right font-mono font-normal rounded-md font-bold focus:bg-white focus:outline-hidden transition-all"
                    />
                    <span className="font-bold text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    目標必要売価: <strong className="font-mono text-slate-600 font-bold">¥{oldCalc.requiredSellingPrice.toFixed(0)}</strong>
                  </p>
                </div>

                {/* Min markup */}
                <div className="space-y-1 bg-white/70 border border-slate-200 p-2.5 rounded-lg shadow-3xs">
                  <label className="text-[10px] text-slate-500 font-extrabold block mb-1">社内下限利益率 (外掛)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={oldEstimate.adjustments.minProfitRate ?? ''}
                      onChange={(e) => updateAdjustments(false, 'minProfitRate', e.target.value)}
                      className="w-16 bg-slate-50 border border-slate-200 p-1 text-right font-mono font-normal rounded-md font-bold focus:bg-white focus:outline-hidden transition-all"
                    />
                    <span className="font-bold text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    最低限界価格: <strong className="font-mono text-slate-600 font-bold">¥{oldCalc.minRequiredSellingPrice.toFixed(0)}</strong>
                  </p>
                </div>

                {/* Client apparent margin */}
                <div className="space-y-1 bg-white/70 border border-slate-200 p-2.5 rounded-lg shadow-3xs">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">客先提示利管率 (内掛)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={oldEstimate.adjustments.targetProfitMarginOff ?? ''}
                      onChange={(e) => updateAdjustments(false, 'targetProfitMarginOff', e.target.value)}
                      className="w-16 bg-slate-50 border border-slate-200 p-1 text-right font-mono font-extrabold rounded-md text-rose-700 focus:bg-white focus:outline-hidden transition-all"
                    />
                    <span className="font-extrabold text-rose-600">%以下</span>
                  </div>
                  <p className="text-[10px] text-rose-700/80 mt-1 font-medium">
                    客宛仮想原価: <strong className="font-mono">¥{oldCalc.suggestedPurchasePriceForClient.toFixed(1)}</strong>
                  </p>
                </div>

                {/* SGA rate percent */}
                <div className="space-y-1 bg-white/70 border border-slate-200 p-2.5 rounded-lg shadow-3xs">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">客向提示利管費率 (SGA)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={oldEstimate.adjustments.sgaRatePercent ?? ''}
                      onChange={(e) => updateAdjustments(false, 'sgaRatePercent', e.target.value)}
                      className="w-16 bg-slate-50 border border-slate-200 p-1 text-right font-mono font-bold rounded-md text-slate-700 focus:bg-white focus:outline-hidden transition-all"
                    />
                    <span className="text-slate-400">%</span>
                  </div>
                </div>

              </div>

              {/* Central Selling target price */}
              <div className="bg-slate-200/60 border border-slate-250 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-slate-700 block leading-none">
                    旧・決定売値 (御見積提出販売価格)
                  </span>
                  <span className="text-slate-400 text-[9px] block mt-1">※ エクセル上の最終つじつま目標額</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-black text-slate-400 text-xs">¥</span>
                  <input
                    type="number"
                    value={oldEstimate.adjustments.targetUnitPrice || ''}
                    onChange={(e) => updateAdjustments(false, 'targetUnitPrice', e.target.value)}
                    placeholder={oldCalc.grandTotalUnitPrice.toFixed(0)}
                    className="w-24 bg-white border border-slate-300 rounded-lg p-1.5 font-mono text-right text-xs font-black text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-500 shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* 2. Breakdown table list */}
            <div className="space-y-2">
              <div className="font-extrabold text-slate-800 text-xs flex justify-between items-center bg-slate-50 p-2 border-b border-slate-200 rounded-t-lg">
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span>🔍 前回合意見積の構成明細明細 (顧客提示値)</span>
                </span>
                <span className="text-[10px] text-slate-500 font-normal">お取引先との合意済み単価の内訳</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-3xs">
                <table className="w-full text-xs font-sans">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold text-right select-none">
                      <th className="py-2.5 px-3 text-left">費目・工程区分</th>
                      <th className="py-2.5 px-2 text-right w-24">社内原価実費(非公開)</th>
                      <th className="py-2.5 px-2 text-right w-24 text-teal-800 bg-teal-500/5">顧客提示レート(整合値)</th>
                      <th className="py-2.5 px-3 text-right w-24 bg-slate-50/50">算出見積単価(円)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    
                    {/* Material */}
                    <tr className="hover:bg-slate-50/40">
                      <td className="py-2 px-3">
                        <span className="font-bold text-slate-800 block">材料費 (建値建)</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">投入重: {oldEstimate.material.inputWeightG}g</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-400">
                        ¥{oldEstimate.material.actualBasePricePerKg ?? oldEstimate.material.basePricePerKg}
                      </td>
                      <td className="py-1 px-2 text-right bg-rose-500/5">
                        <input
                           type="number"
                          value={oldEstimate.material.basePricePerKg}
                          onChange={(e) => updateMaterialPrice(false, 'basePricePerKg', e.target.value)}
                          className="w-full bg-white border border-rose-200 rounded-md p-1 font-mono text-right text-xs font-bold text-rose-700"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-extrabold text-slate-800">
                        ¥{oldCalc.netMaterialCost.toFixed(2)}
                      </td>
                    </tr>

                    {/* Processes */}
                    {oldEstimate.processes.map((proc, i) => {
                      if (!proc.processName.trim()) return null;
                      if (proc.isDirectInput) {
                        return (
                          <tr key={proc.index} className="hover:bg-amber-50/40">
                            <td className="py-3 px-3">
                              <span className="font-extrabold text-slate-950 block text-xs leading-none mb-1">{proc.processName}</span>
                              <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded font-bold">外注/直接費</span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-400">
                              ¥{proc.actualDirectProcessingCost ?? proc.directProcessingCost}
                            </td>
                            <td className="py-1 px-2 text-right bg-amber-500/5">
                              <input
                                type="number"
                                value={proc.directProcessingCost || ''}
                                onChange={(e) => updateProcessRates(false, proc.index, 'directProcessingCost', e.target.value)}
                                className="w-full bg-white border border-amber-200 rounded-md p-1 font-mono text-right text-xs font-bold text-amber-700"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-800">
                              ¥{oldCalc.processCosts[i].toFixed(2)}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={proc.index} className="hover:bg-slate-50/40">
                          <td className="py-3 px-3">
                            <span className="font-extrabold text-slate-950 block text-xs leading-none mb-2">{proc.processName}</span>
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-200/60 rounded-md font-bold tracking-tight inline-flex items-center">
                                生産出来高: {proc.yieldPerHour.toLocaleString()}<span className="text-[10px] text-slate-500 ml-0.5 font-normal">個/時</span>
                              </span>
                              {proc.totalHours !== undefined && proc.totalHours > 0 && (
                                <span className="text-[10.5px] px-2 py-0.5 bg-slate-100/50 text-slate-500 border border-slate-200 rounded-md font-medium">
                                  段取: {proc.totalHours} h
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-slate-400">
                            ¥{proc.actualHourlyRate ?? proc.hourlyRate}
                          </td>
                          <td className="py-1 px-2 text-right bg-rose-500/5">
                            <input
                              type="number"
                              value={proc.hourlyRate || ''}
                              onChange={(e) => updateProcessRates(false, proc.index, 'hourlyRate', e.target.value)}
                              className="w-full bg-white border border-rose-200 rounded-md p-1 font-mono text-right text-xs font-bold text-rose-700"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-800">
                            ¥{oldCalc.processCosts[i].toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Logistics */}
                    <tr className="hover:bg-slate-50/40">
                      <td className="py-2 px-3">
                        <span className="font-bold text-slate-800 block">梱包資材・配送費</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">箱入数: {oldEstimate.logistics.qtyPerBox}個</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-400">
                        ¥{oldEstimate.logistics.actualFreightPerBox ? (oldEstimate.logistics.actualFreightPerBox / oldEstimate.logistics.qtyPerBox).toFixed(1) : (oldEstimate.logistics.freightPerBox / oldEstimate.logistics.qtyPerBox).toFixed(1)}
                      </td>
                      <td className="py-1 px-2 text-right bg-rose-500/5">
                        <input
                          type="number"
                          value={oldEstimate.logistics.freightPerBox}
                          onChange={(e) => updateLogisticsRates(false, 'freightPerBox', e.target.value)}
                          className="w-full bg-white border border-rose-200 rounded-md p-1 font-mono text-right text-xs font-bold text-rose-700"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-extrabold text-slate-800">
                        ¥{oldCalc.shippingCostPerUnit.toFixed(2)}
                      </td>
                    </tr>

                    {/* Tooling amort */}
                    <tr className="hover:bg-slate-50/40 text-[11px]">
                      <td className="py-1.5 px-3 text-slate-500">型費・特記償却費 (円)</td>
                      <td className="py-1.5 px-2 text-right font-mono text-slate-400">¥0.00</td>
                      <td className="py-1 px-2 bg-slate-50">
                        <input
                          type="number"
                          value={oldEstimate.adjustments.toolingCost || ''}
                          onChange={(e) => updateAdjustments(false, 'toolingCost', e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent border-0 p-1 text-right font-mono text-xs focus:ring-1 focus:ring-slate-300 rounded"
                        />
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-slate-600">
                        ¥{(oldEstimate.adjustments.toolingCost || 0).toFixed(2)}
                      </td>
                    </tr>

                    {/* SGA cost */}
                    <tr className="bg-slate-50 text-xs font-black border-t border-slate-200">
                      <td className="py-2.5 px-3 text-slate-700">
                        一般管理販売利潤 (SGA%)
                      </td>
                      <td colSpan={2} className="py-2.5 text-right font-normal text-[10px] text-slate-400 italic">
                        (直原計 ¥{oldCalc.primeCost.toFixed(0)} × {oldEstimate.adjustments.sgaRatePercent}%)
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 border-l border-slate-100">
                        ¥{oldCalc.sgaCost.toFixed(2)}
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Account reconciliation metrics */}
            <div className={`p-4 rounded-xl border-2 flex flex-col justify-between gap-3 transition-all ${
              Math.abs(oldCalc.auditVariance) < 0.1
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-sm'
                : 'bg-amber-50 border-amber-300 text-amber-950 shadow-sm'
            }`}>
              
              <div className="flex items-center justify-between leading-none">
                <span className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>旧・提出整合性監査</span>
                </span>
                {Math.abs(oldCalc.auditVariance) < 0.1 ? (
                  <span className="text-[10px] font-black px-2.5 py-1 bg-emerald-600 text-white rounded-full flex items-center gap-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 合致
                  </span>
                ) : (
                  <span className="text-[10px] font-black px-2.5 py-1 bg-amber-600 text-white rounded-full flex items-center gap-0.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-100" /> 未消込
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-slate-250/30 pt-3 text-center font-mono font-bold">
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">積み上げ見積額</span>
                  <strong className="text-sm font-black text-slate-800">¥{oldCalc.grandTotalUnitPrice.toFixed(1)}</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">目標決定単価</span>
                  <strong className="text-sm font-black text-slate-800">¥{(oldEstimate.adjustments.targetUnitPrice || oldCalc.grandTotalUnitPrice).toFixed(1)}</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">端数差異ズレ</span>
                  <strong className={`text-sm font-black ${Math.abs(oldCalc.auditVariance) < 0.1 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {oldCalc.auditVariance > 0 ? '+' : ''}{oldCalc.auditVariance.toFixed(1)}円
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200/50">
                <span className="text-slate-400 font-medium">※ 賃率を下二桁00にしつつ辻褄を合致。</span>
                <button
                  onClick={() => handleAutoReconcile(false)}
                  className="flex items-center gap-1.5 font-bold bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs cursor-pointer shadow-sm hover:shadow-md transition-all shrink-0"
                  title="賃率を自動的に丸めつつ、整合・消込します"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span>AI辻褄合わせ</span>
                </button>
              </div>

              {/* SGA Alert for professional assessment */}
              {(oldEstimate.adjustments.sgaRatePercent !== undefined && 
                (oldEstimate.adjustments.sgaRatePercent < 5 || oldEstimate.adjustments.sgaRatePercent > 30)) && (
                <div className="mt-2 text-left p-3 bg-rose-50 border border-rose-200 rounded-lg text-[10px] leading-relaxed text-rose-950 font-bold shadow-3xs animate-fade-in animate-pulse">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-rose-950 block">🚨【出来高・段取り前提見直し推奨（プロ査定）】</span>
                      賃率を 100円単位（下二桁 00）に丸めつつ辻褄を合わせた結果、売価整合用の客先提示利管費率（SGA）が {' '}
                      <span className="font-black underline text-rose-700 text-xs">{oldEstimate.adjustments.sgaRatePercent.toFixed(2)}%</span>{' '}
                      という不自然な極端値になっています（客先から不信感を持たれます）。
                      <div className="font-extrabold mt-1 text-slate-800">💡 改善対策の手順：</div>
                      <ul className="list-disc list-inside space-y-0.5 ml-0.5 col-span-2 text-rose-800 font-bold">
                        <li>③の<span className="font-black text-rose-950">「生産出来高(タクト)」</span>や<span className="font-black text-rose-950">「段取時間」</span>を見直してください。</li>
                        <li>前提を変更することで新旧の価格が自然に調和・整合します。</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>

        {/* ==================== RIGHT COLUMN: NEW QUOTATION (新価格・改定要求) ==================== */}
        <div className="bg-white rounded-2xl border border-emerald-300 shadow-xl overflow-hidden transition-all">
          
          {/* Section banner */}
          <div className="bg-[#107C41] text-white p-4 border-b border-emerald-800 flex justify-between items-center select-none">
            <div className="flex items-center gap-2">
              <span className="w-2 rounded-full h-4 bg-emerald-300 block animate-ping" />
              <h3 className="font-extrabold text-xs tracking-wider uppercase">
                2. 新要求価格シート [今回改定提示・最新詳細]
              </h3>
            </div>
            <span className="text-[9px] tracking-wider text-emerald-100 font-bold bg-[#0b542c] px-2.5 py-1 rounded-full uppercase">
              最新査定
            </span>
          </div>

          <div className="p-6 space-y-6">
            
            {/* Margins controller metrics board */}
            <div className="bg-emerald-500/5 border border-emerald-150 p-5 rounded-xl shadow-inner space-y-4">
              <div className="font-extrabold text-[#107C41] text-xs tracking-tight border-b border-emerald-200/60 pb-2.5 flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-[#107C41]" />
                  <span>逆計算マージン諸元 (新)</span>
                </span>
                <span className="text-[9px] text-emerald-600 font-bold font-mono">Row25-30 Control</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3.5">
                
                {/* Supplier base purchase price */}
                <div className="col-span-2 space-y-1 bg-white border border-emerald-200 p-2.5 rounded-lg shadow-2xs relative overflow-hidden">
                  <span className="absolute top-0 right-0 bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-bl uppercase">
                    仕入値
                  </span>
                  <label className="text-[10px] text-emerald-800 font-extrabold block leading-none mb-1.5">
                    ⚙️ 実際の新仕入単価 (サプライヤー合意値)
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-emerald-500 font-mono text-xs">¥</span>
                    <input
                      type="number"
                      value={newEstimate.adjustments.actualPurchasePrice || ''}
                      onChange={(e) => updateAdjustments(true, 'actualPurchasePrice', e.target.value)}
                      placeholder="0 (積み上げ実費適用)"
                      className="w-full bg-emerald-50 hover:bg-emerald-100/50 focus:bg-white rounded-lg p-1.5 text-right font-mono font-black text-emerald-950 text-sm focus:outline-hidden border-0 ring-1 ring-emerald-200 focus:ring-2 focus:ring-[#107C41] transition-all"
                    />
                  </div>
                </div>

                {/* Target markup */}
                <div className="space-y-1 bg-white/70 border border-slate-200 p-2.5 rounded-lg shadow-3xs">
                  <label className="text-[10px] text-slate-500 font-extrabold block mb-1">社内目標利益率 (外掛)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newEstimate.adjustments.targetProfitRate ?? ''}
                      onChange={(e) => updateAdjustments(true, 'targetProfitRate', e.target.value)}
                      className="w-16 bg-slate-50 border border-slate-200 p-1 text-right font-mono rounded-md font-bold text-[#107C41] focus:bg-white focus:outline-hidden transition-all"
                    />
                    <span className="font-bold text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    目標必要売価: <strong className="font-mono text-emerald-700 font-extrabold">¥{newCalc.requiredSellingPrice.toFixed(0)}</strong>
                  </p>
                </div>

                {/* Min markup */}
                <div className="space-y-1 bg-white/70 border border-slate-200 p-2.5 rounded-lg shadow-3xs">
                  <label className="text-[10px] text-slate-500 font-extrabold block mb-1">社内下限利益率 (外掛)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newEstimate.adjustments.minProfitRate ?? ''}
                      onChange={(e) => updateAdjustments(true, 'minProfitRate', e.target.value)}
                      className="w-16 bg-slate-50 border border-slate-200 p-1 text-right font-mono rounded-md font-bold text-amber-750 focus:bg-white focus:outline-hidden transition-all"
                    />
                    <span className="font-bold text-slate-400">%</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    最低限界価格: <strong className="font-mono text-amber-700 font-bold">¥{newCalc.minRequiredSellingPrice.toFixed(0)}</strong>
                  </p>
                </div>

                {/* Client apparent margin */}
                <div className="space-y-1 bg-white/70 border border-slate-200 p-2.5 rounded-lg shadow-3xs">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">客先提示利管率 (内掛)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newEstimate.adjustments.targetProfitMarginOff ?? ''}
                      onChange={(e) => updateAdjustments(true, 'targetProfitMarginOff', e.target.value)}
                      className="w-16 bg-slate-50 border border-slate-200 p-1 text-right font-mono font-extrabold rounded-md text-rose-700 focus:bg-white focus:outline-hidden transition-all"
                    />
                    <span className="font-extrabold text-rose-600">%以下</span>
                  </div>
                  <p className="text-[10px] text-rose-700/80 mt-1 font-medium">
                    客宛仮想原価: <strong className="font-mono">¥{newCalc.suggestedPurchasePriceForClient.toFixed(1)}</strong>
                  </p>
                </div>

                {/* SGA rate percent */}
                <div className="space-y-1 bg-white/70 border border-slate-200 p-2.5 rounded-lg shadow-3xs">
                  <label className="text-[10px] text-slate-500 font-bold block mb-1">客向提示利管費率 (SGA)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={newEstimate.adjustments.sgaRatePercent ?? ''}
                      onChange={(e) => updateAdjustments(true, 'sgaRatePercent', e.target.value)}
                      className="w-16 bg-slate-50 border border-slate-200 p-1 text-right font-mono font-bold rounded-md text-[#107C41] focus:bg-white focus:outline-hidden transition-all"
                    />
                    <span className="text-slate-400">%</span>
                  </div>
                </div>

              </div>

              {/* Central Selling target price */}
              <div className="bg-[#107C41]/10 border border-emerald-300 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black text-emerald-900 block leading-none">
                    新・決定売値 (御見積提出販売価格)
                  </span>
                  <span className="text-emerald-700/80 text-[9px] block mt-1">※ エクセル上の最終つじつま目標額</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-black text-[#107C41] text-xs">¥</span>
                  <input
                    type="number"
                    value={newEstimate.adjustments.targetUnitPrice || ''}
                    onChange={(e) => updateAdjustments(true, 'targetUnitPrice', e.target.value)}
                    placeholder={newCalc.grandTotalUnitPrice.toFixed(0)}
                    className="w-24 bg-white border border-[#107C41]/35 rounded-lg p-1.5 font-mono text-right text-xs font-black text-[#107C41] focus:outline-hidden focus:ring-1 focus:ring-[#107C41] shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* 2. Breakdown table list */}
            <div className="space-y-2">
              <div className="font-extrabold text-[#107C41] text-xs flex justify-between items-center bg-emerald-500/5 p-2 border-b border-emerald-200 rounded-t-lg">
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4 text-emerald-700" />
                  <span>🔍 今回提示見積の構成明細 (顧客提示値)</span>
                </span>
                <span className="text-[10px] text-emerald-600 font-normal">ターゲット要求価格に整えた内訳</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-3xs">
                <table className="w-full text-xs font-sans">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold text-right select-none">
                      <th className="py-2.5 px-3 text-left">費目・工程区分</th>
                      <th className="py-2.5 px-2 text-right w-24">社内原価実費(非公開)</th>
                      <th className="py-2.5 px-2 text-right w-24 text-teal-800 bg-teal-500/5">顧客提示レート(整合値)</th>
                      <th className="py-2.5 px-3 text-right w-24 bg-slate-50/50">算出見積単価(円)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    
                    {/* Material */}
                    <tr className="hover:bg-slate-50/40">
                      <td className="py-2 px-3">
                        <span className="font-bold text-slate-800 block">材料費 (建値建)</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">投入重: {newEstimate.material.inputWeightG}g</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-400">
                        ¥{newEstimate.material.actualBasePricePerKg ?? newEstimate.material.basePricePerKg}
                      </td>
                      <td className="py-1 px-2 text-right bg-rose-500/5">
                        <input
                          type="number"
                          value={newEstimate.material.basePricePerKg}
                          onChange={(e) => updateMaterialPrice(true, 'basePricePerKg', e.target.value)}
                          className="w-full bg-white border border-rose-200 rounded-md p-1 font-mono text-right text-xs font-bold text-rose-700"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-extrabold text-slate-800">
                        ¥{newCalc.netMaterialCost.toFixed(2)}
                      </td>
                    </tr>

                    {/* Processes */}
                    {newEstimate.processes.map((proc, i) => {
                      if (!proc.processName.trim()) return null;
                      if (proc.isDirectInput) {
                        return (
                          <tr key={proc.index} className="hover:bg-amber-50/40">
                            <td className="py-3 px-3">
                              <span className="font-extrabold text-slate-950 block text-xs leading-none mb-1">{proc.processName}</span>
                              <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded font-bold">外注/直接費</span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-400">
                              ¥{proc.actualDirectProcessingCost ?? proc.directProcessingCost}
                            </td>
                            <td className="py-1 px-2 text-right bg-amber-500/5">
                              <input
                                type="number"
                                value={proc.directProcessingCost || ''}
                                onChange={(e) => updateProcessRates(true, proc.index, 'directProcessingCost', e.target.value)}
                                className="w-full bg-white border border-amber-200 rounded-md p-1 font-mono text-right text-xs font-bold text-amber-700"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-extrabold text-[#107C41]">
                              ¥{newCalc.processCosts[i].toFixed(2)}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={proc.index} className="hover:bg-slate-50/40">
                          <td className="py-3 px-3">
                            <span className="font-extrabold text-slate-950 block text-xs leading-none mb-2">{proc.processName}</span>
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-950 border border-emerald-300 rounded-md font-extrabold tracking-tight inline-flex items-center">
                                生産出来高: {proc.yieldPerHour.toLocaleString()}<span className="text-[10px] text-emerald-600 ml-0.5 font-normal">個/時</span>
                              </span>
                              {proc.totalHours !== undefined && proc.totalHours > 0 && (
                                <span className="text-[10.5px] px-2 py-0.5 bg-slate-100/50 text-slate-500 border border-slate-200 rounded-md font-medium">
                                  段取: {proc.totalHours} h
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right font-mono text-slate-400">
                            ¥{proc.actualHourlyRate ?? proc.hourlyRate}
                          </td>
                          <td className="py-1 px-2 text-right bg-rose-500/5">
                            <input
                              type="number"
                              value={proc.hourlyRate || ''}
                              onChange={(e) => updateProcessRates(true, proc.index, 'hourlyRate', e.target.value)}
                              className="w-full bg-white border border-rose-200 rounded-md p-1 font-mono text-right text-xs font-bold text-rose-700"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-[#107C41]">
                            ¥{newCalc.processCosts[i].toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Logistics */}
                    <tr className="hover:bg-slate-50/40">
                      <td className="py-2 px-3">
                        <span className="font-bold text-slate-800 block">梱包資材・配送費</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">箱入数: {newEstimate.logistics.qtyPerBox}個</span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-400">
                        ¥{newEstimate.logistics.actualFreightPerBox ? (newEstimate.logistics.actualFreightPerBox / newEstimate.logistics.qtyPerBox).toFixed(1) : (newEstimate.logistics.freightPerBox / newEstimate.logistics.qtyPerBox).toFixed(1)}
                      </td>
                      <td className="py-1 px-2 text-right bg-rose-500/5">
                        <input
                          type="number"
                          value={newEstimate.logistics.freightPerBox}
                          onChange={(e) => updateLogisticsRates(true, 'freightPerBox', e.target.value)}
                          className="w-full bg-white border border-rose-200 rounded-md p-1 font-mono text-right text-xs font-bold text-rose-700"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-extrabold text-[#107C41]">
                        ¥{newCalc.shippingCostPerUnit.toFixed(2)}
                      </td>
                    </tr>

                    {/* Tooling amort */}
                    <tr className="hover:bg-slate-50/40 text-[11px]">
                      <td className="py-1.5 px-3 text-slate-500">型費・特記償却費 (円)</td>
                      <td className="py-1.5 px-2 text-right font-mono text-slate-400">¥0.00</td>
                      <td className="py-1 px-2 bg-slate-50">
                        <input
                          type="number"
                          value={newEstimate.adjustments.toolingCost || ''}
                          onChange={(e) => updateAdjustments(true, 'toolingCost', e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent border-0 p-1 text-right font-mono text-xs focus:ring-1 focus:ring-slate-300 rounded"
                        />
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-slate-600">
                        ¥{(newEstimate.adjustments.toolingCost || 0).toFixed(2)}
                      </td>
                    </tr>

                    {/* SGA cost */}
                    <tr className="bg-emerald-500/5 text-xs font-black border-t border-slate-200">
                      <td className="py-2.5 px-3 text-[#107C41]">
                        一般管理販売利潤 (SGA%)
                      </td>
                      <td colSpan={2} className="py-2.5 text-right font-normal text-[10px] text-slate-400 italic">
                        (直原計 ¥{newCalc.primeCost.toFixed(0)} × {newEstimate.adjustments.sgaRatePercent}%)
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-extrabold text-[#107C41] border-l border-emerald-100">
                        ¥{newCalc.sgaCost.toFixed(2)}
                      </td>
                    </tr>

                  </tbody>
                </table>
              </div>
            </div>

            {/* 3. Account reconciliation metrics */}
            <div className={`p-4 rounded-xl border-2 flex flex-col justify-between gap-3 transition-all ${
              Math.abs(newCalc.auditVariance) < 0.1
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-sm'
                : 'bg-amber-50 border-amber-300 text-amber-950 shadow-sm'
            }`}>
              
              <div className="flex items-center justify-between leading-none">
                <span className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>新・交渉整合性監査</span>
                </span>
                {Math.abs(newCalc.auditVariance) < 0.1 ? (
                  <span className="text-[10px] font-black px-2.5 py-1 bg-[#107C41] text-white rounded-full flex items-center gap-0.5 shadow-xs">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 整合性クリア
                  </span>
                ) : (
                  <span className="text-[10px] font-black px-2.5 py-1 bg-amber-600 text-white rounded-full flex items-center gap-0.5 animate-pulse">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-100" /> 要調整
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 border-t border-slate-250/30 pt-3 text-center font-mono font-bold">
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">積み上げ見積額</span>
                  <strong className="text-sm font-black text-slate-800">¥{newCalc.grandTotalUnitPrice.toFixed(1)}</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">交渉目標売価</span>
                  <strong className="text-sm font-black text-slate-800">¥{(newEstimate.adjustments.targetUnitPrice || newCalc.grandTotalUnitPrice).toFixed(1)}</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 block font-sans">端数差異ズレ</span>
                  <strong className={`text-sm font-black ${Math.abs(newCalc.auditVariance) < 0.1 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {newCalc.auditVariance > 0 ? '+' : ''}{newCalc.auditVariance.toFixed(1)}円
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200/50">
                <span className="text-slate-400 font-medium">※ 目標売価への一発逆算調整。</span>
                <button
                  onClick={() => handleAutoReconcile(true)}
                  className="flex items-center gap-1.5 font-bold bg-[#107C41] hover:bg-emerald-900 text-white px-3.5 py-2 rounded-lg text-xs cursor-pointer shadow-md hover:shadow-lg transition-all shrink-0 animate-bounce"
                  title="賃率を下二桁00の綺麗さに丸めつつ、余剰誤差をSGAに自動逃がして決定単価に一致させます"
                >
                  <Zap className="w-3.5 h-3.5 text-yellow-300" />
                  <span>AI辻褄合わせ</span>
                </button>
              </div>

              {/* SGA Alert for professional assessment */}
              {(newEstimate.adjustments.sgaRatePercent !== undefined && 
                (newEstimate.adjustments.sgaRatePercent < 5 || newEstimate.adjustments.sgaRatePercent > 30)) && (
                <div className="mt-2 text-left p-3 bg-rose-50 border border-rose-200 rounded-lg text-[10px] leading-relaxed text-rose-950 font-bold shadow-3xs animate-fade-in animate-pulse">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-rose-950 block">🚨【出来高・段取り前提見直し推奨（プロ査定）】</span>
                      賃率を 100円単位（下二桁 00）に丸めつつ辻褄を合わせた結果、売価整合用の客先提示利管費率（SGA）が {' '}
                      <span className="font-black underline text-rose-700 text-xs">{newEstimate.adjustments.sgaRatePercent.toFixed(2)}%</span>{' '}
                      という不自然な極端値になっています（客先から不信感を持たれます）。
                      <span className="block mt-1 font-extrabold text-slate-800">💡 改善対策の手順：</span>
                      <ul className="list-disc list-inside space-y-0.5 ml-0.5 col-span-2 text-rose-800 font-bold">
                        <li>③の<span className="font-black text-rose-950">「生産出来高(タクト)」</span>や<span className="font-black text-rose-950">「段取時間」</span>を見直してください。</li>
                        <li>前提を変更することで新旧の価格が自然に調和・整合します。</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
