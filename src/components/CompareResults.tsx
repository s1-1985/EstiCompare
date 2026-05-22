import React, { useState } from 'react';
import { DetailedEstimate, ComparisonResult } from '../types';
import { calculateEstimate } from '../utils/calculations';
import { 
  TrendingUp, TrendingDown, Scale, Clipboard, AlertCircle, Sparkles, Mail, Check, 
  HelpCircle, ChevronRight, FileSpreadsheet, Activity, Coins, Percent, AlertTriangle, Send, User, ChevronDown
} from 'lucide-react';

interface CompareResultsProps {
  oldEstimate: DetailedEstimate;
  newEstimate: DetailedEstimate;
  comparison: ComparisonResult | null;
  isLoading: boolean;
  onRunComparison: () => void;
}

export const CompareResults: React.FC<CompareResultsProps> = ({
  oldEstimate,
  newEstimate,
  comparison,
  isLoading,
  onRunComparison,
}) => {
  const [copiedMail, setCopiedMail] = useState(false);
  const [createdMailDraft, setCreatedMailDraft] = useState('');

  const oldCalc = calculateEstimate(oldEstimate);
  const newCalc = calculateEstimate(newEstimate);

  const oldPrice = oldCalc.grandTotalUnitPrice;
  const newPrice = newCalc.grandTotalUnitPrice;
  const priceDelta = newPrice - oldPrice;
  const percentDelta = oldPrice !== 0 ? (priceDelta / oldPrice) * 100 : 0;
  const direction = priceDelta > 0 ? 'up' : priceDelta < 0 ? 'down' : 'none';

  // Quick email draft generator
  const handleGenerateDraftMail = () => {
    const draft = `【価格交渉用アジェンダ確認メール（下書き）】

【お取引先サプライヤー企業名】 御中
調達・営業総括部 ご担当者様

平素より大変お世話になっております。
提示いただきました見積書（品番: ${newEstimate.partNumber}）の新旧査定内容を確認いたしました。

つきましては、今回の価格改定要求（現行合意 ¥${oldPrice.toFixed(2)} → 今回提示 ¥${newPrice.toFixed(2)}、改定差額 ${priceDelta >= 0 ? '+' : ''}¥${priceDelta.toFixed(2)}）について、VE利益確保に関係する下記項目的の査定要因につきまして、一度お打合せをさせていただきたく存じます。

【主な確認項目】
・素材料価格（旧 ¥${oldEstimate.material.basePricePerKg}/kg → 新 ¥${newEstimate.material.basePricePerKg}/kg）の上昇に伴う、スクラップ回収補填率の変動妥当性
・加工費工順における設備稼働賃率、および生産出来高（サイクルタイム）の諸元
・配送料、一般管理費の配賦基準

お忙しいところ恐縮ではございますが、改めて相互理解を深めるため、協議のお時間をいただけますと幸いです。
何卒よろしくお願い申し上げます。
`;
    setCreatedMailDraft(draft);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMail(true);
    setTimeout(() => setCopiedMail(false), 2000);
  };

  return (
    <div className="space-y-8 pb-16 animate-fade-in">
      
      {/* 🚀 1. HIGH-CONTRAST METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        
        {/* Old Contract Price Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-full bg-slate-300 group-hover:bg-slate-400 transition-colors" />
          <div className="pl-2">
            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold tracking-widest uppercase mb-2">
              <Scale className="w-3.5 h-3.5" />
              <span>現行合意基準単価 [前回査定]</span>
            </div>
            <div className="text-3xl font-black font-mono text-slate-800 tracking-tight">
              ¥{oldPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 font-mono">
              <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">材料: ¥{oldCalc.netMaterialCost.toFixed(1)}</span>
              <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">加工: ¥{oldCalc.totalProcessCost.toFixed(1)}</span>
              <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">諸費: ¥{oldCalc.totalOtherExpenses.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* New Supplier Proposed Price Card */}
        <div className="bg-white border border-emerald-200 rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500 group-hover:bg-emerald-600 transition-colors" />
          <div className="pl-2">
            <div className="flex items-center gap-2 text-emerald-600 text-[10px] font-bold tracking-widest uppercase mb-2">
              <Activity className="w-3.5 h-3.5" />
              <span>サプライヤー側新規提示単価 [新要求]</span>
            </div>
            <div className="text-3xl font-black font-mono tracking-tight text-emerald-900">
              ¥{newPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-emerald-800 font-bold font-mono">
              <span className="bg-emerald-50/50 px-2 py-0.5 rounded border border-emerald-100">材料: ¥{newCalc.netMaterialCost.toFixed(1)}</span>
              <span className="bg-emerald-50/50 px-2 py-0.5 rounded border border-emerald-100">加工: ¥{newCalc.totalProcessCost.toFixed(1)}</span>
              <span className="bg-emerald-50/50 px-2 py-0.5 rounded border border-emerald-100">諸費: ¥{newCalc.totalOtherExpenses.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Variance Diff Card */}
        <div className={`border rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group ${
          direction === 'up' 
            ? 'bg-rose-50/40 border-rose-200 text-rose-950' 
            : direction === 'down' 
              ? 'bg-emerald-50/40 border-emerald-200 text-emerald-950' 
              : 'bg-slate-50 border-slate-200 text-slate-800'
        }`}>
          <div className={`absolute top-0 left-0 w-2 h-full ${
            direction === 'up' ? 'bg-rose-500' : direction === 'down' ? 'bg-emerald-500' : 'bg-slate-400'
          }`} />
          <div className="pl-2 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="uppercase font-bold text-[10px] tracking-widest text-slate-400">
                  新旧見積価格差額 (改定影響比)
                </span>
                {direction === 'up' && (
                  <span className="text-[9px] font-black px-2 py-0.5 bg-rose-100 border border-rose-200 text-rose-700 rounded-full flex items-center gap-0.5 shadow-3xs uppercase">
                    <TrendingUp className="w-3 h-3" /> 要コスト査定
                  </span>
                )}
                {direction === 'down' && (
                  <span className="text-[9px] font-black px-2 py-0.5 bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-full flex items-center gap-0.5 shadow-3xs uppercase">
                    <TrendingDown className="w-3 h-3" /> コスト低減
                  </span>
                )}
              </div>
              <div className="text-3xl font-black font-mono tracking-tight">
                {direction === 'up' ? '+' : ''}
                {priceDelta.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-sm font-bold ml-1">円</span>
              </div>
            </div>
            <div className="text-[10.5px] flex items-center justify-between mt-4 border-t border-slate-200/60 pt-3 font-mono font-bold">
              <span className="text-slate-500 font-sans font-medium">価格変位比率:</span>
              <span className={`text-sm font-black ${direction === 'up' ? 'text-rose-600' : 'text-emerald-600'}`}>
                {direction === 'up' ? '+' : ''}
                {percentDelta.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* 📊 2. HIGHLY POLISHED DETAILED VARIANCE TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        
        {/* Table header menu bar */}
        <div className="bg-slate-50/80 px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-extrabold text-xs tracking-wider text-slate-800 uppercase">
                2. 細分費工順・設計諸元監査比較シート
              </h4>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-none">
                部品1個あたりの材料投入量、スクラップ換算、アワー賃率、生産出来高(サイクルタイム)の差異変位を一元図示
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-slate-200/50 border border-slate-200/60 px-2.5 py-1 text-slate-500 font-mono font-bold rounded-lg uppercase tracking-widest self-start sm:self-center">
            Sheet3!Variance_Matrix
          </span>
        </div>

        {/* Responsive Table Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-sans text-slate-700 min-w-[700px]">
            <thead>
              <tr className="bg-slate-50/40 border-b border-slate-200 font-extrabold text-[10px] text-slate-400 uppercase tracking-widest text-right select-none">
                <th className="px-3 sm:px-6 py-3 sm:py-4 text-left w-36">大分類</th>
                <th className="px-3 sm:px-6 py-3 sm:py-4 text-left w-72">要素・変動指標セル</th>
                <th className="px-4 py-4 text-right bg-slate-50/20 font-bold">前回合意(旧価格)</th>
                <th className="px-4 py-4 text-right bg-emerald-500/5 text-emerald-900 font-black">新規提示(新要求)</th>
                <th className="px-4 py-4 text-right font-bold text-slate-500">変動絶対額(差額)</th>
                <th className="px-4 py-4 text-center font-bold text-slate-500">騰落率 %</th>
                <th className="px-3 sm:px-6 py-3 sm:py-4 text-left w-64">査定整合・要点注記</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              
              {/* Material Fee Comparison Row */}
              <tr className="hover:bg-slate-50/30 transition-colors group">
                <td className="px-3 sm:px-6 py-3 sm:py-4 font-bold text-slate-900 bg-slate-50/10">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>材料費</span>
                  </div>
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4">
                  <div className="font-extrabold text-slate-800 text-xs">正味製品調達材料費 (製品単重当り)</div>
                  <div className="text-[10px] text-slate-400 mt-1 font-medium font-mono">
                    {oldEstimate.material.materialName} ({oldEstimate.material.inputWeightG}g) → {newEstimate.material.materialName} ({newEstimate.material.inputWeightG}g)
                  </div>
                </td>
                <td className="px-4 py-4 text-right font-mono font-bold text-slate-500 bg-slate-50/10">
                  ¥{oldCalc.netMaterialCost.toFixed(2)}
                </td>
                <td className="px-4 py-4 text-right font-mono font-black text-emerald-950 bg-emerald-500/5">
                  ¥{newCalc.netMaterialCost.toFixed(2)}
                </td>
                {(() => {
                  const diff = newCalc.netMaterialCost - oldCalc.netMaterialCost;
                  const pct = oldCalc.netMaterialCost !== 0 ? (diff / oldCalc.netMaterialCost) * 100 : 0;
                  return (
                    <>
                      <td className={`px-4 py-4 text-right font-mono font-black ${
                        diff > 0 ? 'text-rose-600 bg-rose-50/50' : diff < 0 ? 'text-emerald-600 bg-emerald-50/50' : 'text-slate-400'
                      }`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(2)}円
                      </td>
                      <td className={`px-4 py-4 text-center font-mono font-semibold ${diff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {diff !== 0 ? `${pct.toFixed(2)}%` : '0%'}
                      </td>
                    </>
                  );
                })()}
                <td className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] text-slate-500 font-bold bg-slate-50/5">
                  建値差異: ¥{oldEstimate.material.basePricePerKg} → ¥{newEstimate.material.basePricePerKg}/kg
                </td>
              </tr>

              {/* Processes comparison divider */}
              <tr className="bg-slate-100/50 select-none">
                <td colSpan={7} className="px-3 sm:px-6 py-2.5 font-bold text-[9.5px] text-slate-500 uppercase tracking-widest">
                  ⛓️ 設備加工工賃工順対照 (旧合意 vs 新要求)
                </td>
              </tr>

              {newEstimate.processes.map((newProc, idx) => {
                const oldProc = oldEstimate.processes.find(o => o.index === newProc.index) || {
                  processName: '', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, directProcessingCost: 0
                };

                const oldCost = oldCalc.processCosts[idx] || 0;
                const newCost = newCalc.processCosts[idx] || 0;
                const pDiff = newCost - oldCost;
                
                if (!newProc.processName.trim() && !oldProc.processName?.trim()) return null;

                const hourlyRateDiff = newProc.hourlyRate - (oldProc.hourlyRate || 0);
                const yieldDiff = newProc.yieldPerHour - (oldProc.yieldPerHour || 0);

                return (
                  <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 font-mono text-slate-400 font-bold text-center bg-slate-50/5">
                      #0{newProc.index}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="font-extrabold text-slate-800 text-xs">{newProc.processName || oldProc.processName}</div>
                      <div className="text-[10px] text-slate-400 mt-1 truncate max-w-[220px]">
                        仕様: {newProc.workContent || oldProc.workContent || '一般設備加工'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-slate-500 bg-slate-50/10">
                      {oldProc.processName ? `¥${oldCost.toFixed(2)}` : '未設定'}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-emerald-950 bg-emerald-500/5 font-extrabold">
                      {newProc.processName ? `¥${newCost.toFixed(2)}` : '削除/未反映'}
                    </td>
                    <td className={`px-4 py-4 text-right font-mono font-black ${
                      pDiff > 0 ? 'text-rose-600 bg-rose-50/50' : pDiff < 0 ? 'text-emerald-600 bg-emerald-50/50' : 'text-slate-400'
                    }`}>
                      {pDiff > 0 ? '+' : ''}{pDiff.toFixed(2)}円
                    </td>
                    <td className={`px-4 py-4 text-center font-mono font-bold ${pDiff > 0 ? 'text-rose-500' : pDiff < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {oldCost > 0 ? `${(pDiff / oldCost * 100).toFixed(1)}%` : newProc.processName ? '新規追加' : '通常'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] text-slate-500 leading-normal max-w-xs font-bold font-sans">
                      {newProc.isDirectInput
                        ? (oldProc.directProcessingCost !== newProc.directProcessingCost
                            ? `外注費: ¥${oldProc.directProcessingCost?.toLocaleString()} → ¥${newProc.directProcessingCost?.toLocaleString()}/個`
                            : '')
                        : <>
                            {hourlyRateDiff !== 0 && `設定賃率: ¥${oldProc.hourlyRate?.toLocaleString()} → ¥${newProc.hourlyRate?.toLocaleString()}/h`}
                            {yieldDiff !== 0 && ` (出来高: ${oldProc.yieldPerHour} → ${newProc.yieldPerHour}個/h)`}
                          </>
                      }
                    </td>
                  </tr>
                );
              })}

              {/* Total Processes Row */}
              {(() => {
                const totalProcessDiff = newCalc.totalProcessCost - oldCalc.totalProcessCost;
                const totalProcessPct = oldCalc.totalProcessCost > 0 ? (totalProcessDiff / oldCalc.totalProcessCost * 100) : 0;
                return (
                  <tr className="bg-slate-500/5 font-extrabold border-t border-slate-200">
                    <td className="px-3 sm:px-6 py-3 sm:py-3.5 font-bold text-slate-900 bg-slate-50/10">加工工賃小計</td>
                    <td className="px-3 sm:px-6 py-3 sm:py-3.5 text-slate-800 text-xs">加工費合算 [SUM_ROW(Processes)]</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-600 bg-slate-50/10">¥{oldCalc.totalProcessCost.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-emerald-950 bg-emerald-500/5">¥{newCalc.totalProcessCost.toFixed(2)}</td>
                    <td className={`px-4 py-3.5 text-right font-mono font-black ${
                      totalProcessDiff > 0 ? 'text-rose-600 bg-rose-50/50' : totalProcessDiff < 0 ? 'text-emerald-600 bg-emerald-50/50' : 'text-slate-400'
                    }`}>
                      {totalProcessDiff > 0 ? '+' : ''}{totalProcessDiff.toFixed(2)}円
                    </td>
                    <td className={`px-4 py-3.5 text-center font-mono ${totalProcessDiff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {oldCalc.totalProcessCost > 0 ? `${totalProcessPct.toFixed(2)}%` : '0%'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-3.5 text-[10px] text-slate-500 font-normal">アワー賃率・出来高パラメータ補填連動値</td>
                  </tr>
                );
              })()}

              {/* SGA and logistic fees */}
              <tr className="hover:bg-slate-50/30 transition-colors">
                <td className="px-3 sm:px-6 py-3 sm:py-4 font-bold text-slate-900 bg-slate-50/10">諸経費・他</td>
                <td className="px-3 sm:px-6 py-3 sm:py-4">
                  <div className="font-extrabold text-slate-800 text-xs">一般管理費販売利益 & 梱包物流費</div>
                  <div className="text-[10px] text-slate-500 mt-1 font-mono">
                    配送料: 旧 ¥{oldCalc.shippingCostPerUnit.toFixed(2)} ({oldEstimate.logistics.qtyPerBox}箱入) → 新 ¥{newCalc.shippingCostPerUnit.toFixed(2)} ({newEstimate.logistics.qtyPerBox}箱入)
                  </div>
                </td>
                <td className="px-4 py-4 text-right font-mono text-slate-500 bg-slate-50/10">¥{oldCalc.totalOtherExpenses.toFixed(2)}</td>
                <td className="px-4 py-4 text-right font-mono text-emerald-950 bg-emerald-500/5 font-extrabold">¥{newCalc.totalOtherExpenses.toFixed(2)}</td>
                {(() => {
                  const otherDiff = newCalc.totalOtherExpenses - oldCalc.totalOtherExpenses;
                  const otherPct = oldCalc.totalOtherExpenses !== 0 ? (otherDiff / oldCalc.totalOtherExpenses) * 100 : 0;
                  return (
                    <>
                      <td className={`px-4 py-4 text-right font-mono font-black ${
                        otherDiff > 0 ? 'text-rose-600 bg-rose-50/50' : otherDiff < 0 ? 'text-emerald-600 bg-emerald-50/50' : 'text-slate-400'
                      }`}>
                        {otherDiff > 0 ? '+' : ''}{otherDiff.toFixed(2)}円
                      </td>
                      <td className={`px-4 py-4 text-center font-mono font-bold ${otherDiff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {otherDiff !== 0 ? `${otherPct.toFixed(2)}%` : '0%'}
                      </td>
                    </>
                  );
                })()}
                <td className="px-3 sm:px-6 py-3 sm:py-4 text-[10px] text-slate-500 font-bold bg-slate-50/5 leading-normal">
                  一般管理費率 (SGA%): 旧 {oldEstimate.adjustments.sgaRatePercent || 0}% → 新 {newEstimate.adjustments.sgaRatePercent || 0}%
                </td>
              </tr>

              {/* GRAND TOTAL HEADER */}
              <tr className="bg-slate-900 text-slate-200 font-black text-xs border-t-2 border-slate-950 select-none">
                <td className="px-3 sm:px-3 sm:px-6 py-3 sm:py-3.5 sm:py-5">合計売価単価</td>
                <td className="px-3 sm:px-3 sm:px-6 py-3 sm:py-3.5 sm:py-5 font-black text-white text-xs">
                  御見積決定単価総計 [正味材料費 ＋ 加工小計 ＋ 管理梱包費用]
                </td>
                <td className="px-4 py-5 text-right font-mono text-slate-300 bg-slate-950/20 text-xs">
                  ¥{oldPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-5 text-right font-mono text-yellow-300 text-sm bg-slate-950/40">
                  ¥{newPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className={`px-4 py-5 text-right font-mono text-xs bg-slate-950/20 font-black ${
                  direction === 'up' ? 'text-rose-300' : direction === 'down' ? 'text-emerald-300' : 'text-slate-400'
                }`}>
                  {direction === 'up' ? '+' : ''}{priceDelta.toLocaleString(undefined, { minimumFractionDigits: 2 })}円
                </td>
                <td className="px-4 py-5 text-center font-mono text-xs text-white">
                  {percentDelta > 0 ? '+' : ''}{percentDelta.toFixed(2)}%
                </td>
                <td className="px-3 sm:px-3 sm:px-6 py-3 sm:py-3.5 sm:py-5 text-[10px] text-slate-400 leading-normal font-bold">
                  品番: {newEstimate.partNumber} / 基準Lot: {newEstimate.baseLotSize}
                </td>
              </tr>

            </tbody>
          </table>
        </div>

      </div>

      {/* 🔮 3. COOPERATIVE COMMERCE & AI ASSURANCE SUITE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Email generator: Mock Email client interface */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-md overflow-hidden">
          
          <div className="bg-slate-50 border-b border-slate-200/80 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
                <Mail className="w-4 h-4" />
              </span>
              <div>
                <h5 className="font-extrabold text-xs text-slate-800 tracking-wider">
                  サプライヤー様向け協議依頼メール自動生成案
                </h5>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                  下請適正化法規基準に適した、丁寧かつ確実なVE協議を要請する文案をワンクリックで
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 flex-1 flex flex-col">
            {createdMailDraft ? (
              <div className="border border-slate-200/80 rounded-xl overflow-hidden shadow-inner flex flex-col flex-1 bg-slate-50">
                
                {/* Mock envelope headers */}
                <div className="bg-white border-b border-slate-200 p-3.5 space-y-2 text-[10.5px] font-sans border-b border-slate-100">
                  <div className="flex items-center gap-2 text-slate-400 font-bold border-b border-slate-100/40 pb-1">
                    <span className="w-12 text-slate-400 font-bold">宛先 (To):</span>
                    <span className="text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60 font-medium">お取引先サプライヤー企業 購買窓口御中</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 font-bold">
                    <span className="w-12 text-slate-400 font-bold">件名 (Sub):</span>
                    <span className="text-slate-800 font-extrabold">【価格改定査定】品番: {newEstimate.partNumber} 新旧比率見積に関するご確認</span>
                  </div>
                </div>

                <textarea
                  value={createdMailDraft}
                  onChange={(e) => setCreatedMailDraft(e.target.value)}
                  rows={12}
                  className="w-full text-[10.5px] font-mono bg-slate-950 text-slate-100 border-0 p-4 focus:ring-0 focus:outline-hidden leading-relaxed flex-1 select-text"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-6 bg-slate-50 border border-dashed rounded-xl border-slate-200">
                <div className="p-3 bg-white text-slate-400 rounded-full border border-slate-100 shadow-3xs mb-3.5">
                  <Mail className="w-5 h-5 text-slate-400" />
                </div>
                <h6 className="font-extrabold text-slate-700 text-xs mb-1">
                  メール下書きがまだ作成されていません
                </h6>
                <p className="text-[10px] text-slate-400 max-w-xs leading-normal">
                  下部のアジェンダメール自動生成ボタンをクリックすると、入力中の価格差査定に基づく協議事項メールがロードされます。
                </p>
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200/20 flex flex-col sm:flex-row gap-3 items-center justify-between">
            {createdMailDraft ? (
              <button
                onClick={() => copyToClipboard(createdMailDraft)}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-700 py-2.5 px-5 rounded-xl shadow-md transition-all cursor-pointer"
              >
                {copiedMail ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300 animate-bounce" />
                    <span>クリップボードにコピーしました！</span>
                  </>
                ) : (
                  <>
                    <Clipboard className="w-4 h-4" />
                    <span>メール文をコピー</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleGenerateDraftMail}
                className="w-full sm:w-auto font-black text-white bg-slate-900 hover:bg-slate-800 py-2.5 px-5 rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 text-xs"
              >
                <Send className="w-3.5 h-3.5 text-indigo-400" />
                <span>アジェンダメール文案を生成する</span>
              </button>
            )}
            <span className="text-[10px] text-slate-400 font-bold">※ メーラー（OutlookやGmail）へコピペ可能です</span>
          </div>

        </div>

        {/* AI price assurance client */}
        <div className="bg-slate-900 text-slate-100 rounded-2xl shadow-sm flex flex-col justify-between transition-all duration-300 hover:shadow-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping" />
            <span className="h-2 w-2 bg-indigo-500 rounded-full" />
          </div>

          <div className="bg-slate-800/80 p-4 border-b border-indigo-950/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-indigo-950/80 text-indigo-400 rounded-xl">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <h5 className="font-extrabold text-xs text-white tracking-wider">
                  AI自動価格査定＆インデクス監査
                </h5>
                <p className="text-[10px] text-indigo-300 mt-0.5 leading-none">
                  Gemini 2.0 Flashを駆動して、不自然な係数や調整をロジカル監査
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 flex-1 flex flex-col">
            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-6">
                <div className="relative mb-4">
                  <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin border-indigo-400" />
                  <Sparkles className="w-4 h-4 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <h6 className="font-extrabold text-indigo-300 text-xs mb-1 animate-pulse">
                  製造原価構造をAI監査分析中...
                </h6>
                <p className="text-[10px] text-slate-400 max-w-xs leading-normal">
                  下請適正化ルール、製造コストインデクス、および不自然な調整変動の基準に基づいてチェックシートを作製しています。しばらくお待ちください。
                </p>
              </div>
            ) : comparison ? (
              <div className="flex-1 space-y-4 max-h-[380px] overflow-y-auto pr-1">
                
                {/* AI Summary Banner */}
                <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-4 shadow-inner">
                  <strong className="text-amber-400 block mb-2 font-black text-xs flex items-center gap-1.5 uppercase">
                    <Activity className="w-4 h-4 text-amber-500 animate-pulse" />
                    <span>【AI監査評定総括】</span>
                  </strong>
                  <p className="text-indigo-200 text-[11px] leading-relaxed pl-1 font-sans font-medium text-indigo-200">
                    {comparison.summary}
                  </p>
                </div>

                {/* Specific points lists */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                  <strong className="text-indigo-300 block mb-3 font-black text-xs flex items-center gap-1.5 uppercase border-b border-indigo-950/40 pb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>対サプライヤー協議上の逆確認アプローチ論点</span>
                  </strong>
                  <ul className="space-y-3 pl-1">
                    {comparison.negotiationTips.map((tip, i) => (
                      <li key={i} className="flex gap-2.5 items-start text-xs text-slate-400">
                        <span className="bg-indigo-900/60 text-indigo-300 font-mono text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center shrink-0 border border-indigo-700">
                          {i + 1}
                        </span>
                        <span className="text-[11px] leading-relaxed font-bold font-sans text-slate-300">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-6 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                <div className="p-3 bg-slate-900 text-indigo-400 rounded-full border border-slate-800 shadow-3xs mb-3.5">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h6 className="font-extrabold text-indigo-300 text-xs mb-1">
                  AI査定レポートが未ロードです
                </h6>
                <p className="text-[10px] text-slate-400 max-w-xs leading-normal">
                  右下の「AI価格監査分析を実行」ボタンを押すと、現在の新旧パラメータ変位から高度な妥当性監査が直ちに生成されます。
                </p>
              </div>
            )}
          </div>

          <div className="p-4 bg-slate-950/80 border-t border-slate-800/60 flex items-center justify-between text-[10.5px]">
            <span className="text-slate-500 font-mono font-bold">Model Engine: Google Gemini 2.0 Flash</span>
            <button
              onClick={onRunComparison}
              disabled={isLoading}
              className="font-black text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 py-2.5 px-5 rounded-xl shadow-md transition-colors disabled:bg-slate-800 disabled:text-slate-600 disabled:border-slate-800 disabled:cursor-not-allowed cursor-pointer"
            >
              AI価格監査分析を実行
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
