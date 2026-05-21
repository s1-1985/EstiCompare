import React, { useState } from 'react';
import { DetailedEstimate, ComparisonResult } from '../types';
import { calculateEstimate } from '../utils/calculations';
import { 
  TrendingUp, TrendingDown, Scale, Clipboard, AlertCircle, Sparkles, Mail, Check, 
  HelpCircle, ChevronRight, FileSpreadsheet
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

  // Totals
  const oldPrice = oldCalc.grandTotalUnitPrice;
  const newPrice = newCalc.grandTotalUnitPrice;
  const priceDelta = newPrice - oldPrice;
  const percentDelta = oldPrice !== 0 ? (priceDelta / oldPrice) * 100 : 0;
  const direction = priceDelta > 0 ? 'up' : priceDelta < 0 ? 'down' : 'none';

  // Generate a draft email to supplier politely requesting a breakdown or VE discussion
  const handleGenerateDraftMail = () => {
    const draft = `【価格交渉用アジェンダ確認メール（下書き）】

【お取引先サプライヤー企業名】 御中
調達・営業総括部 ご担当者様

平素より大変お世話になっております。
提示いただきました見積書（品番: ${newEstimate.partNumber}）の新旧査定内容を確認いたしました。

つきましては、今回の価格改定要求（現行合意 ¥${oldPrice.toFixed(2)} → 今回提示 ¥${newPrice.toFixed(2)}、改定差額 +¥${priceDelta.toFixed(2)}）について、VE利益確保に関係する下記項目の査定要因につきまして、一度お打合せをさせていただきたく存じます。

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
    <div className="space-y-6">
      
      {/* 1. EXCEL-STYLE OVERVIEW CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Old cost overview card */}
        <div className="bg-slate-50 border border-slate-300 rounded-xl p-4 shadow-3xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-slate-450 uppercase font-extrabold text-[10px] tracking-wider mb-2">
              <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
              <span>前回合意単価 [旧価格シート]</span>
            </div>
            <span className="text-2xl font-black font-mono text-slate-700">
              ¥{oldPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[10px] text-slate-450 mt-3 border-t pt-2 border-slate-200">
            材料比: ¥{oldCalc.netMaterialCost.toFixed(1)} / 加工比: ¥{oldCalc.totalProcessCost.toFixed(1)} / 諸費分: ¥{oldCalc.totalOtherExpenses.toFixed(1)}
          </p>
        </div>

        {/* New cost overview card */}
        <div className="bg-indigo-50/40 border border-indigo-250 rounded-xl p-4 shadow-3xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-indigo-700 uppercase font-extrabold text-[10px] tracking-wider mb-2">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-505 bg-indigo-500 animate-pulse" />
              <span>最新提示単価 [新価格シート]</span>
            </div>
            <span className="text-2xl font-black font-mono text-indigo-900">
              ¥{newPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[10px] text-indigo-700 mt-3 border-t pt-2 border-indigo-200/55">
            材料比: ¥{newCalc.netMaterialCost.toFixed(1)} / 加工比: ¥{newCalc.totalProcessCost.toFixed(1)} / 諸費分: ¥{newCalc.totalOtherExpenses.toFixed(1)}
          </p>
        </div>

        {/* Delta Card */}
        <div className={`border rounded-xl p-4 shadow-3xs flex flex-col justify-between ${
          direction === 'up' 
            ? 'bg-rose-50/60 border-rose-250 text-rose-900' 
            : direction === 'down' 
              ? 'bg-emerald-50/50 border-emerald-250 text-emerald-900' 
              : 'bg-slate-50 border-slate-250 text-slate-700'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="uppercase font-extrabold text-[10px] tracking-wider text-slate-500">
                新旧見積価格差額（デルタ）
              </span>
              {direction === 'up' && (
                <span className="text-[9px] font-extrabold px-2 py-0.5 bg-rose-100 border border-rose-200 text-rose-700 rounded-full flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> 要交渉
                </span>
              )}
              {direction === 'down' && (
                <span className="text-[9px] font-extrabold px-2 py-0.5 bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-full flex items-center gap-0.5">
                  <TrendingDown className="w-3 h-3" /> 合理化成功
                </span>
              )}
            </div>
            <span className="text-2xl font-black font-mono">
              {direction === 'up' ? '+' : ''}
              {priceDelta.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}円
            </span>
          </div>
          <div className="text-[10px] flex items-center justify-between mt-3 border-t pt-2 border-slate-200/60">
            <span className="font-semibold text-slate-500">改定要求率:</span>
            <span className="font-mono font-black text-xs">
              {direction === 'up' ? '+' : ''}{percentDelta.toFixed(2)}%
            </span>
          </div>
        </div>

      </div>

      {/* 2. RECONCILIATION SHEET GRID */}
      <div className="overflow-hidden border border-slate-300 rounded-xl shadow-3xs bg-white">
        
        {/* Tab top */}
        <div className="bg-slate-50 p-3 border-b border-slate-250 flex items-center justify-between text-xs select-none">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>新旧詳細比較・変位分析表（明細対比パラメータ）</span>
          </div>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">
            Sheet3!デルタ監査計算
          </span>
        </div>

        {/* Comparison grid body */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs font-sans divide-y divide-slate-150">
            <thead>
              <tr className="bg-slate-100 text-[10px] text-slate-500 font-bold tracking-wider text-left border-b border-slate-250 select-none">
                <th className="px-3 py-2">大項目区分</th>
                <th className="px-3 py-2">細分費目パラメータ [Excel cell]</th>
                <th className="px-3 py-2 text-right w-24 bg-slate-50">旧通常値</th>
                <th className="px-3 py-2 text-right w-24 bg-indigo-50/20">新要求値</th>
                <th className="px-3 py-2 text-right w-24 bg-slate-100">変動差異額 (円)</th>
                <th className="px-3 py-2 text-center w-20">騰落率 %</th>
                <th className="px-3 py-2 text-left w-52">相関・要因チェック</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 bg-white">
              
              {/* Material Fee Comparison */}
              <tr className="hover:bg-slate-50/40">
                <td className="px-3 py-2.5 font-black text-slate-800 bg-slate-50/10">1. 材料費</td>
                <td className="px-3 py-2.5">
                  <div className="font-bold text-slate-700">正味材料費 / 個 [Sheet2!E8 - Sheet1!E8]</div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                    材質: {oldEstimate.material.materialName} ({oldEstimate.material.inputWeightG}g) → {newEstimate.material.materialName} ({newEstimate.material.inputWeightG}g)
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-500 bg-slate-50/10">
                  ¥{oldCalc.netMaterialCost.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-indigo-900 bg-indigo-50/10">
                  ¥{newCalc.netMaterialCost.toFixed(2)}
                </td>
                {(() => {
                  const diff = newCalc.netMaterialCost - oldCalc.netMaterialCost;
                  const pct = oldCalc.netMaterialCost !== 0 ? (diff / oldCalc.netMaterialCost) * 100 : 0;
                  return (
                    <>
                      <td className={`px-3 py-2.5 text-right font-mono font-extrabold ${
                        diff > 0 ? 'text-rose-600 bg-rose-50/20' : diff < 0 ? 'text-emerald-600 bg-emerald-50/20' : 'text-slate-400'
                      }`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2.5 text-center font-mono font-bold ${diff > 0 ? 'text-rose-550' : 'text-emerald-550'}`}>
                        {diff !== 0 ? `${pct.toFixed(1)}%` : '0%'}
                      </td>
                    </>
                  );
                })()}
                <td className="px-3 py-2.5 text-[10px] text-slate-500">
                  建値価格差: ¥{oldEstimate.material.basePricePerKg} → ¥{newEstimate.material.basePricePerKg}/kg
                </td>
              </tr>

              {/* Processes comparison */}
              <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 select-none">
                <td colSpan={7} className="px-3 py-1 bg-slate-100/50">
                  2. 設備加工工賃個別対比：旧工順 vs 新工順
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
                  <tr key={idx} className="hover:bg-slate-50/25">
                    <td className="px-3 py-2 font-mono text-slate-400 text-center font-bold">工順{newProc.index}</td>
                    <td className="px-3 py-2">
                      <div className="font-black text-slate-700">{newProc.processName || oldProc.processName}</div>
                      <div className="text-[10px] text-slate-400 font-normal truncate mt-0.5 max-w-[200px]">
                        仕様: {newProc.workContent || oldProc.workContent || '設備内製加工'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-550 bg-slate-50/10">
                      {oldProc.processName ? `¥${oldCost.toFixed(2)}` : '未計上'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-indigo-950 bg-indigo-50/10">
                      {newProc.processName ? `¥${newCost.toFixed(2)}` : '削除/未計上'}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono font-extrabold ${
                      pDiff > 0 ? 'text-rose-600 bg-rose-50/15' : pDiff < 0 ? 'text-emerald-600 bg-emerald-50/15' : 'text-slate-400'
                    }`}>
                      {pDiff > 0 ? '+' : ''}{pDiff.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2 text-center font-mono ${pDiff > 0 ? 'text-rose-500' : pDiff < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {oldCost > 0 ? `${(pDiff / oldCost * 100).toFixed(0)}%` : newProc.processName ? '追加' : '通常'}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-450 leading-normal max-w-xs unicode-bidi">
                      {hourlyRateDiff !== 0 && `賃率差異: ¥${oldProc.hourlyRate}→¥${newProc.hourlyRate}`}
                      {yieldDiff !== 0 && ` | 出来高変化: ${oldProc.yieldPerHour}→${newProc.yieldPerHour}/個`}
                    </td>
                  </tr>
                );
              })}

              {/* Total Processes Row */}
              {(() => {
                const totalProcessDiff = newCalc.totalProcessCost - oldCalc.totalProcessCost;
                const totalProcessPct = oldCalc.totalProcessCost > 0 ? (totalProcessDiff / oldCalc.totalProcessCost * 100) : 0;
                return (
                  <tr className="hover:bg-slate-50/40 font-bold bg-slate-50/30">
                    <td className="px-3 py-2 font-black text-slate-800">加工小計</td>
                    <td className="px-3 py-2 text-slate-700">加工工賃合計 [SUM(Row12:Row21)]</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500 bg-slate-50/10">¥{oldCalc.totalProcessCost.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-indigo-900 bg-indigo-50/10">¥{newCalc.totalProcessCost.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-extrabold ${
                      totalProcessDiff > 0 ? 'text-rose-600 bg-rose-50/20' : totalProcessDiff < 0 ? 'text-emerald-600 bg-emerald-50/20' : 'text-slate-400'
                    }`}>
                      {totalProcessDiff > 0 ? '+' : ''}{totalProcessDiff.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2 text-center font-mono ${totalProcessDiff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {oldCalc.totalProcessCost > 0 ? `${totalProcessPct.toFixed(1)}%` : '0%'}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-450 font-normal">稼動サイクル・設備単価再設定合計変位</td>
                  </tr>
                );
              })()}

              {/* SGA and adjust fees */}
              <tr className="hover:bg-slate-50/40">
                <td className="px-3 py-2.5 font-black text-slate-800">3. 諸経費等</td>
                <td className="px-3 py-2.5">
                  <div className="font-bold text-slate-700">管理利管費 ＆ 送料配賦 ＆ 調整累計 [Row26:Row29]</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    旧送料比: ¥{oldCalc.shippingCostPerUnit.toFixed(1)} (入数 {oldEstimate.logistics.qtyPerBox}) → 新送料比: ¥{newCalc.shippingCostPerUnit.toFixed(1)} (入数 {newEstimate.logistics.qtyPerBox})
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-500 bg-slate-50/10">¥{oldCalc.totalOtherExpenses.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-indigo-900 bg-indigo-50/10">¥{newCalc.totalOtherExpenses.toFixed(2)}</td>
                {(() => {
                  const otherDiff = newCalc.totalOtherExpenses - oldCalc.totalOtherExpenses;
                  const otherPct = oldCalc.totalOtherExpenses !== 0 ? (otherDiff / oldCalc.totalOtherExpenses) * 100 : 0;
                  return (
                    <>
                      <td className={`px-3 py-2.5 text-right font-mono font-extrabold ${
                        otherDiff > 0 ? 'text-rose-600 bg-rose-50/20' : otherDiff < 0 ? 'text-emerald-600 bg-emerald-50/20' : 'text-slate-400'
                      }`}>
                        {otherDiff > 0 ? '+' : ''}{otherDiff.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2.5 text-center font-mono ${otherDiff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {otherDiff !== 0 ? `${otherPct.toFixed(1)}%` : '0%'}
                      </td>
                    </>
                  );
                })()}
                <td className="px-3 py-2.5 text-[10px] text-slate-500 leading-normal">
                  利管率比: 旧 {oldEstimate.adjustments.sgaRatePercent || 0}% → 新 {newEstimate.adjustments.sgaRatePercent || 0}% + 型費・手動調整
                </td>
              </tr>

              {/* GRAND SUM */}
              <tr className="bg-slate-900 text-white font-extrabold text-[12px] border-t-2 border-slate-950">
                <td className="px-3 py-3">合計見積単価</td>
                <td className="px-3 py-3 text-sm font-black">
                  御見積決定単価総計（正味材料費 ＋ 加工費合計 ＋ 管理諸費）
                </td>
                <td className="px-3 py-3 text-right font-mono text-slate-350 bg-slate-950/20">
                  ¥{oldPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-3 text-right font-mono text-yellow-350 text-sm bg-slate-950/30">
                  ¥{newPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className={`px-3 py-3 text-right font-mono text-sm bg-slate-950/25 ${direction === 'up' ? 'text-rose-400' : direction === 'down' ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {direction === 'up' ? '+' : ''}{priceDelta.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-3 text-center font-mono text-xs">
                  {percentDelta > 0 ? '+' : ''}{percentDelta.toFixed(2)} %
                </td>
                <td className="px-3 py-3 text-[10px] text-slate-350 font-normal whitespace-normal w-52 leading-tight">
                  品番: {newEstimate.partNumber} / 基準ロット: {newEstimate.baseLotSize}個 時
                </td>
              </tr>

            </tbody>
          </table>
        </div>

      </div>

      {/* 3. LIGHTWEIGHT COLLABORATIVE TOOLS: EXCEL DRAFT EMAIL & OPTIONAL AI ANALYSIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Negotiation Email Planner */}
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-3xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs mb-2">
              <Mail className="w-4 h-4 text-indigo-600" />
              <span>サプライヤー宛て交渉アジェンダ・確認依頼メール</span>
            </div>
            <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
              今回の新旧価格差分値（¥{priceDelta.toFixed(1)}円）に基づいた、理性的で下請法に準拠した打合せ調整メール下書きを一発で生成します。
            </p>
            
            {createdMailDraft ? (
              <textarea
                value={createdMailDraft}
                onChange={(e) => setCreatedMailDraft(e.target.value)}
                rows={8}
                className="w-full text-[10px] font-mono bg-slate-950 text-slate-200 border border-slate-800 p-2.5 rounded-lg focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              />
            ) : (
              <div className="text-[11px] text-slate-400 italic py-6 text-center select-none bg-slate-50 border border-dashed rounded-lg">
                「交渉メール文を生成する」ボタンをクリックすると作成されます。
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-between items-center text-[10px]">
            {createdMailDraft ? (
              <button
                onClick={() => copyToClipboard(createdMailDraft)}
                className="flex items-center gap-1.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 py-1.5 px-3 rounded-md shadow-2xs transition-all cursor-pointer"
              >
                {copiedMail ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>コピー完了！</span>
                  </>
                ) : (
                  <>
                    <Clipboard className="w-3.5 h-3.5" />
                    <span>メール文をコピー</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleGenerateDraftMail}
                className="font-bold text-white bg-slate-800 hover:bg-slate-700 py-1.5 px-3 rounded-md cursor-pointer"
              >
                交渉メール文を生成する
              </button>
            )}
            <span className="text-slate-400">※ Outlook等にそのままコピー可能</span>
          </div>
        </div>

        {/* Optional AI Auditor */}
        <div className="bg-slate-900 text-slate-100 rounded-xl p-4 shadow-3xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-1.5 font-bold text-indigo-400 text-xs mb-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>AI価格監査・交渉アプローチ報告書（任意）</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              エディタの入力値をGemini APIに引き渡し、下請法や製造インデックス（労務費・電力費・材料相場。LME連動等）から便乗値上げ、あるいは不自然な加工賃水準が生じていないかをプロのバイヤー目線でAI査定します。
            </p>

            {isLoading ? (
              <div className="text-[11px] text-slate-400 py-6 text-center animate-pulse">
                ⏳ 調達市場・下請適正化基準に照らし合わせて自動査定中...
              </div>
            ) : comparison ? (
              <div className="bg-slate-950 p-2.5 rounded-lg border border-indigo-900 max-h-[140px] overflow-y-auto text-[10px] leading-relaxed text-indigo-150 font-mono">
                <strong className="text-amber-300 block mb-1">【AI査定報告要约】</strong>
                {comparison.summary}
                <strong className="text-amber-300 block mt-2 mb-1">【対サプライヤー逆アプローチ質問事項】</strong>
                {comparison.negotiationTips.map((tip, i) => (
                  <div key={i} className="mb-1 border-b border-indigo-950 pb-1">
                    {i + 1}. {tip}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 italic py-6 text-center select-none bg-slate-950 border border-slate-800 rounded-lg">
                右下の「AI価格監査分析を実行」をクリックして実行します。
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-between items-center text-[10px] text-slate-400">
            <span>分析エンジン: Gemini-3.5</span>
            <button
              onClick={onRunComparison}
              disabled={isLoading}
              className="font-bold text-white bg-indigo-600 hover:bg-indigo-500 py-1.5 px-4 rounded-md shadow-2xs transition-all cursor-pointer disabled:bg-slate-700 disabled:cursor-not-allowed"
            >
              AI価格監査分析を実行する
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
