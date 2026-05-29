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
  retryCountdown?: number | null;
  onRunComparison: () => void;
}

export const CompareResults: React.FC<CompareResultsProps> = ({
  oldEstimate,
  newEstimate,
  comparison,
  isLoading,
  retryCountdown,
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
    <div className="space-y-6 pb-16">

      {/* 1. METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">

        {/* Old Contract Price */}
        <div className="bg-white border border-[#D6D0C8] rounded overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#B8B0A6]" />
          <div className="pl-4 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[#9C9490] text-[10px] font-black tracking-widest uppercase mb-2">
              <Scale className="w-3.5 h-3.5" />
              <span>現行合意基準単価 [前回査定]</span>
            </div>
            <div className="text-3xl font-black font-mono text-[#18130F] tracking-tight">
              ¥{oldPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-3 pt-3 border-t border-[#EEEBE6] flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-[#9C9490] font-mono">
              <span className="bg-[#F7F6F2] px-2 py-0.5 rounded border border-[#EEEBE6]">材料: ¥{oldCalc.netMaterialCost.toFixed(2)}</span>
              <span className="bg-[#F7F6F2] px-2 py-0.5 rounded border border-[#EEEBE6]">加工: ¥{oldCalc.totalProcessCost.toFixed(2)}</span>
              <span className="bg-[#F7F6F2] px-2 py-0.5 rounded border border-[#EEEBE6]">諸費: ¥{oldCalc.totalOtherExpenses.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* New Supplier Price */}
        <div className="bg-white border border-[#93B4D9] rounded overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#1E3A5F]" />
          <div className="pl-4 p-4 sm:p-5">
            <div className="flex items-center gap-2 text-[#1E3A5F] text-[10px] font-black tracking-widest uppercase mb-2">
              <Activity className="w-3.5 h-3.5" />
              <span>サプライヤー側新規提示単価 [新要求]</span>
            </div>
            <div className="text-3xl font-black font-mono tracking-tight text-[#1E3A5F]">
              ¥{newPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="mt-3 pt-3 border-t border-[#EEEBE6] flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-[#1E3A5F] font-bold font-mono">
              <span className="bg-[#EFF4FD] px-2 py-0.5 rounded border border-[#C5D8EE]">材料: ¥{newCalc.netMaterialCost.toFixed(2)}</span>
              <span className="bg-[#EFF4FD] px-2 py-0.5 rounded border border-[#C5D8EE]">加工: ¥{newCalc.totalProcessCost.toFixed(2)}</span>
              <span className="bg-[#EFF4FD] px-2 py-0.5 rounded border border-[#C5D8EE]">諸費: ¥{newCalc.totalOtherExpenses.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Variance */}
        <div className={`border rounded overflow-hidden relative ${
          direction === 'up'
            ? 'bg-rose-50/60 border-rose-200'
            : direction === 'down'
              ? 'bg-[#E8F4EE]/60 border-[#A8D5BE]'
              : 'bg-[#F7F6F2] border-[#D6D0C8]'
        }`}>
          <div className={`absolute top-0 left-0 w-1 h-full ${
            direction === 'up' ? 'bg-rose-500' : direction === 'down' ? 'bg-[#1D5C3A]' : 'bg-[#B8B0A6]'
          }`} />
          <div className="pl-4 p-4 sm:p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="uppercase font-black text-[10px] tracking-widest text-[#9C9490]">
                  新旧見積価格差額 (改定影響比)
                </span>
                {direction === 'up' && (
                  <span className="text-[9px] font-black px-2 py-0.5 bg-rose-100 border border-rose-200 text-rose-700 rounded flex items-center gap-0.5 uppercase">
                    <TrendingUp className="w-3 h-3" /> 要コスト査定
                  </span>
                )}
                {direction === 'down' && (
                  <span className="text-[9px] font-black px-2 py-0.5 bg-[#E8F4EE] border border-[#A8D5BE] text-[#1D5C3A] rounded flex items-center gap-0.5 uppercase">
                    <TrendingDown className="w-3 h-3" /> コスト低減
                  </span>
                )}
              </div>
              <div className="text-3xl font-black font-mono tracking-tight text-[#18130F]">
                {direction === 'up' ? '+' : ''}
                {priceDelta.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-sm font-bold ml-1">円</span>
              </div>
            </div>
            <div className="text-[10.5px] flex items-center justify-between mt-4 border-t border-[#D6D0C8]/60 pt-3 font-mono font-bold">
              <span className="text-[#9C9490] font-sans font-bold">価格変位比率:</span>
              <span className={`text-sm font-black ${direction === 'up' ? 'text-rose-600' : 'text-[#1D5C3A]'}`}>
                {direction === 'up' ? '+' : ''}{percentDelta.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* 2. DETAILED VARIANCE TABLE */}
      <div className="bg-white border border-[#D6D0C8] rounded overflow-hidden">

        <div className="bg-[#F0EDE8] px-4 sm:px-6 py-3 sm:py-4 border-b border-[#D6D0C8] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#FEF0EB] text-[#B5451B] rounded border border-[#F8C9BB]">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-black text-xs tracking-wider text-[#18130F] uppercase">
                2. 細分費工順・設計諸元監査比較シート
              </h4>
              <p className="text-[10px] text-[#9C9490] mt-0.5 leading-none">
                部品1個あたりの材料投入量、スクラップ換算、アワー賃率、生産出来高(サイクルタイム)の差異変位を一元図示
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-white border border-[#D6D0C8] px-2.5 py-1 text-[#9C9490] font-mono font-bold rounded uppercase tracking-widest self-start sm:self-center">
            Sheet3!Variance_Matrix
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-sans text-[#18130F] min-w-[700px]">
            <thead>
              <tr className="bg-[#F7F6F2] border-b border-[#D6D0C8] font-black text-[10px] text-[#9C9490] uppercase tracking-widest text-right select-none">
                <th className="px-3 sm:px-5 py-3 sm:py-4 text-left w-36">大分類</th>
                <th className="px-3 sm:px-5 py-3 sm:py-4 text-left w-72">要素・変動指標セル</th>
                <th className="px-4 py-4 text-right bg-[#F0EDE8] font-bold">前回合意(旧価格)</th>
                <th className="px-4 py-4 text-right bg-[#EFF4FD] text-[#1E3A5F] font-black">新規提示(新要求)</th>
                <th className="px-4 py-4 text-right font-bold text-[#9C9490]">変動絶対額(差額)</th>
                <th className="px-4 py-4 text-center font-bold text-[#9C9490]">騰落率 %</th>
                <th className="px-3 sm:px-5 py-3 sm:py-4 text-left w-64">査定整合・要点注記</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEBE6] bg-white">

              {/* Material */}
              <tr className="hover:bg-[#F7F6F2]/60 transition-colors">
                <td className="px-3 sm:px-5 py-3 sm:py-4 font-bold text-[#18130F] bg-[#F7F6F2]/40">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#B5451B]" />
                    <span>材料費</span>
                  </div>
                </td>
                <td className="px-3 sm:px-5 py-3 sm:py-4">
                  <div className="font-black text-[#18130F] text-xs">正味製品調達材料費 (製品単重当り)</div>
                  <div className="text-[10px] text-[#9C9490] mt-1 font-medium font-mono">
                    {oldEstimate.material.materialName} ({oldEstimate.material.inputWeightG}g) → {newEstimate.material.materialName} ({newEstimate.material.inputWeightG}g)
                  </div>
                </td>
                <td className="px-4 py-4 text-right font-mono font-bold text-[#6B6057] bg-[#F7F6F2]/40">
                  ¥{oldCalc.netMaterialCost.toFixed(2)}
                </td>
                <td className="px-4 py-4 text-right font-mono font-black text-[#1E3A5F] bg-[#EFF4FD]/40">
                  ¥{newCalc.netMaterialCost.toFixed(2)}
                </td>
                {(() => {
                  const diff = newCalc.netMaterialCost - oldCalc.netMaterialCost;
                  const pct = oldCalc.netMaterialCost !== 0 ? (diff / oldCalc.netMaterialCost) * 100 : 0;
                  return (
                    <>
                      <td className={`px-4 py-4 text-right font-mono font-black ${
                        diff > 0 ? 'text-rose-600 bg-rose-50/40' : diff < 0 ? 'text-[#1D5C3A] bg-[#E8F4EE]/40' : 'text-[#9C9490]'
                      }`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(2)}円
                      </td>
                      <td className={`px-4 py-4 text-center font-mono font-bold ${diff > 0 ? 'text-rose-600' : 'text-[#1D5C3A]'}`}>
                        {diff !== 0 ? `${pct.toFixed(2)}%` : '0%'}
                      </td>
                    </>
                  );
                })()}
                <td className="px-3 sm:px-5 py-3 sm:py-4 text-[10px] text-[#9C9490] font-bold">
                  建値差異: ¥{oldEstimate.material.basePricePerKg} → ¥{newEstimate.material.basePricePerKg}/kg
                </td>
              </tr>

              {/* Process divider */}
              <tr className="bg-[#F0EDE8] select-none">
                <td colSpan={7} className="px-3 sm:px-5 py-2 font-black text-[9.5px] text-[#9C9490] uppercase tracking-widest">
                  設備加工工賃工順対照 (旧合意 vs 新要求)
                </td>
              </tr>

              {newEstimate.processes.map((newProc) => {
                const oldProc = oldEstimate.processes.find(o => o.index === newProc.index) || {
                  processName: '', workContent: '', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, directProcessingCost: 0
                };

                // processCosts は 0始まり配列。工程は index(1始まり)で照合しているので index-1 でアクセス（idx混在を回避）。
                const oldCost = oldCalc.processCosts[newProc.index - 1] || 0;
                const newCost = newCalc.processCosts[newProc.index - 1] || 0;
                const pDiff = newCost - oldCost;

                if (!newProc.processName.trim() && !oldProc.processName?.trim()) return null;

                const hourlyRateDiff = newProc.hourlyRate - (oldProc.hourlyRate || 0);
                const yieldDiff = newProc.yieldPerHour - (oldProc.yieldPerHour || 0);

                return (
                  <tr key={newProc.index} className="hover:bg-[#F7F6F2]/60 transition-colors">
                    <td className="px-3 sm:px-5 py-3 sm:py-4 font-mono text-[#9C9490] font-bold text-center bg-[#F7F6F2]/30">
                      #0{newProc.index}
                    </td>
                    <td className="px-3 sm:px-5 py-3 sm:py-4">
                      <div className="font-black text-[#18130F] text-xs">{newProc.processName || oldProc.processName}</div>
                      <div className="text-[10px] text-[#9C9490] mt-1 truncate max-w-[220px]">
                        仕様: {newProc.workContent || oldProc.workContent || '一般設備加工'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-[#6B6057] bg-[#F7F6F2]/30">
                      {oldProc.processName ? `¥${oldCost.toFixed(2)}` : '未設定'}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-[#1E3A5F] bg-[#EFF4FD]/30 font-black">
                      {newProc.processName ? `¥${newCost.toFixed(2)}` : '削除/未反映'}
                    </td>
                    <td className={`px-4 py-4 text-right font-mono font-black ${
                      pDiff > 0 ? 'text-rose-600 bg-rose-50/40' : pDiff < 0 ? 'text-[#1D5C3A] bg-[#E8F4EE]/40' : 'text-[#9C9490]'
                    }`}>
                      {pDiff > 0 ? '+' : ''}{pDiff.toFixed(2)}円
                    </td>
                    <td className={`px-4 py-4 text-center font-mono font-bold ${pDiff > 0 ? 'text-rose-500' : pDiff < 0 ? 'text-[#1D5C3A]' : 'text-[#9C9490]'}`}>
                      {oldCost > 0 ? `${(pDiff / oldCost * 100).toFixed(2)}%` : newProc.processName ? '新規追加' : '通常'}
                    </td>
                    <td className="px-3 sm:px-5 py-3 sm:py-4 text-[10px] text-[#9C9490] leading-normal max-w-xs font-bold font-sans">
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

              {/* Process total */}
              {(() => {
                const totalProcessDiff = newCalc.totalProcessCost - oldCalc.totalProcessCost;
                const totalProcessPct = oldCalc.totalProcessCost > 0 ? (totalProcessDiff / oldCalc.totalProcessCost * 100) : 0;
                return (
                  <tr className="bg-[#F0EDE8] font-black border-t border-[#D6D0C8]">
                    <td className="px-3 sm:px-5 py-3 font-bold text-[#18130F]">加工工賃小計</td>
                    <td className="px-3 sm:px-5 py-3 text-[#6B6057] text-xs">加工費合算 [SUM_ROW(Processes)]</td>
                    <td className="px-4 py-3 text-right font-mono text-[#6B6057]">¥{oldCalc.totalProcessCost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[#1E3A5F] bg-[#EFF4FD]/30">¥{newCalc.totalProcessCost.toFixed(2)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-black ${
                      totalProcessDiff > 0 ? 'text-rose-600 bg-rose-50/40' : totalProcessDiff < 0 ? 'text-[#1D5C3A] bg-[#E8F4EE]/40' : 'text-[#9C9490]'
                    }`}>
                      {totalProcessDiff > 0 ? '+' : ''}{totalProcessDiff.toFixed(2)}円
                    </td>
                    <td className={`px-4 py-3 text-center font-mono ${totalProcessDiff > 0 ? 'text-rose-500' : 'text-[#1D5C3A]'}`}>
                      {oldCalc.totalProcessCost > 0 ? `${totalProcessPct.toFixed(2)}%` : '0%'}
                    </td>
                    <td className="px-3 sm:px-5 py-3 text-[10px] text-[#9C9490] font-normal">アワー賃率・出来高パラメータ補填連動値</td>
                  </tr>
                );
              })()}

              {/* SGA & logistics */}
              <tr className="hover:bg-[#F7F6F2]/60 transition-colors">
                <td className="px-3 sm:px-5 py-3 sm:py-4 font-bold text-[#18130F] bg-[#F7F6F2]/30">諸経費・他</td>
                <td className="px-3 sm:px-5 py-3 sm:py-4">
                  <div className="font-black text-[#18130F] text-xs">一般管理費販売利益 & 梱包物流費</div>
                  <div className="text-[10px] text-[#9C9490] mt-1 font-mono">
                    配送料: 旧 ¥{oldCalc.shippingCostPerUnit.toFixed(2)} ({oldEstimate.logistics.qtyPerBox}箱入) → 新 ¥{newCalc.shippingCostPerUnit.toFixed(2)} ({newEstimate.logistics.qtyPerBox}箱入)
                  </div>
                </td>
                <td className="px-4 py-4 text-right font-mono text-[#6B6057] bg-[#F7F6F2]/30">¥{oldCalc.totalOtherExpenses.toFixed(2)}</td>
                <td className="px-4 py-4 text-right font-mono text-[#1E3A5F] bg-[#EFF4FD]/30 font-black">¥{newCalc.totalOtherExpenses.toFixed(2)}</td>
                {(() => {
                  const otherDiff = newCalc.totalOtherExpenses - oldCalc.totalOtherExpenses;
                  const otherPct = oldCalc.totalOtherExpenses !== 0 ? (otherDiff / oldCalc.totalOtherExpenses) * 100 : 0;
                  return (
                    <>
                      <td className={`px-4 py-4 text-right font-mono font-black ${
                        otherDiff > 0 ? 'text-rose-600 bg-rose-50/40' : otherDiff < 0 ? 'text-[#1D5C3A] bg-[#E8F4EE]/40' : 'text-[#9C9490]'
                      }`}>
                        {otherDiff > 0 ? '+' : ''}{otherDiff.toFixed(2)}円
                      </td>
                      <td className={`px-4 py-4 text-center font-mono font-bold ${otherDiff > 0 ? 'text-rose-500' : 'text-[#1D5C3A]'}`}>
                        {otherDiff !== 0 ? `${otherPct.toFixed(2)}%` : '0%'}
                      </td>
                    </>
                  );
                })()}
                <td className="px-3 sm:px-5 py-3 sm:py-4 text-[10px] text-[#9C9490] font-bold leading-normal">
                  一般管理費率 (SGA%): 旧 {oldEstimate.adjustments.sgaRatePercent || 0}% → 新 {newEstimate.adjustments.sgaRatePercent || 0}%
                </td>
              </tr>

              {/* Grand Total */}
              <tr className="bg-[#18130F] text-white font-black text-xs border-t-2 border-[#B5451B] select-none">
                <td className="px-3 sm:px-5 py-4 sm:py-5">合計売価単価</td>
                <td className="px-3 sm:px-5 py-4 sm:py-5 font-black text-white text-xs">
                  御見積決定単価総計 [正味材料費 ＋ 加工小計 ＋ 管理梱包費用]
                </td>
                <td className="px-4 py-5 text-right font-mono text-[#9C9490] text-xs">
                  ¥{oldPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-5 text-right font-mono text-[#F8C9BB] text-sm bg-[#2A2018]/40">
                  ¥{newPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className={`px-4 py-5 text-right font-mono text-xs font-black ${
                  direction === 'up' ? 'text-rose-300' : direction === 'down' ? 'text-[#A8D5BE]' : 'text-[#9C9490]'
                }`}>
                  {direction === 'up' ? '+' : ''}{priceDelta.toLocaleString(undefined, { minimumFractionDigits: 2 })}円
                </td>
                <td className="px-4 py-5 text-center font-mono text-xs text-white">
                  {percentDelta > 0 ? '+' : ''}{percentDelta.toFixed(2)}%
                </td>
                <td className="px-3 sm:px-5 py-4 sm:py-5 text-[10px] text-[#9C9490] leading-normal font-bold">
                  品番: {newEstimate.partNumber} / 基準Lot: {newEstimate.baseLotSize}
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>

      {/* 3. TOOLS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Email Generator */}
        <div className="bg-white border border-[#D6D0C8] rounded flex flex-col justify-between overflow-hidden">
          <div className="bg-[#F0EDE8] border-b border-[#D6D0C8] p-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-[#FEF0EB] text-[#B5451B] rounded border border-[#F8C9BB]">
                <Mail className="w-4 h-4" />
              </span>
              <div>
                <h5 className="font-black text-xs text-[#18130F] tracking-wider">
                  サプライヤー様向け協議依頼メール自動生成案
                </h5>
                <p className="text-[10px] text-[#9C9490] mt-0.5 leading-none">
                  下請適正化法規基準に適した協議要請文案をワンクリックで
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5 flex-1 flex flex-col">
            {createdMailDraft ? (
              <div className="border border-[#D6D0C8] rounded overflow-hidden flex flex-col flex-1">
                <div className="bg-white border-b border-[#EEEBE6] p-3 space-y-2 text-[10.5px]">
                  <div className="flex items-center gap-2 text-[#9C9490] font-bold border-b border-[#EEEBE6] pb-1">
                    <span className="w-12 text-[#9C9490] font-bold">宛先 (To):</span>
                    <span className="text-[#18130F] bg-[#F7F6F2] px-2 py-0.5 rounded border border-[#EEEBE6] font-bold">お取引先サプライヤー企業 購買窓口御中</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#9C9490] font-bold">
                    <span className="w-12 text-[#9C9490] font-bold">件名 (Sub):</span>
                    <span className="text-[#18130F] font-black">【価格改定査定】品番: {newEstimate.partNumber} 新旧比率見積に関するご確認</span>
                  </div>
                </div>
                <textarea
                  value={createdMailDraft}
                  onChange={(e) => setCreatedMailDraft(e.target.value)}
                  rows={12}
                  className="w-full text-[10.5px] font-mono bg-[#18130F] text-[#D6D0C8] border-0 p-4 focus:ring-0 focus:outline-hidden leading-relaxed flex-1 select-text"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-6 bg-[#F7F6F2] border border-dashed border-[#D6D0C8] rounded">
                <div className="p-3 bg-white text-[#9C9490] rounded border border-[#D6D0C8] mb-3.5">
                  <Mail className="w-5 h-5 text-[#B8B0A6]" />
                </div>
                <h6 className="font-black text-[#18130F] text-xs mb-1">
                  メール下書きがまだ作成されていません
                </h6>
                <p className="text-[10px] text-[#9C9490] max-w-xs leading-normal">
                  下部のアジェンダメール自動生成ボタンをクリックすると、入力中の価格差査定に基づく協議事項メールがロードされます。
                </p>
              </div>
            )}
          </div>

          <div className="p-4 bg-[#F7F6F2] border-t border-[#D6D0C8] flex flex-col sm:flex-row gap-3 items-center justify-between">
            {createdMailDraft ? (
              <button
                onClick={() => copyToClipboard(createdMailDraft)}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 font-bold text-white bg-[#18130F] hover:bg-[#B5451B] active:bg-[#8A3215] py-2.5 px-5 rounded transition-all cursor-pointer"
              >
                {copiedMail ? (
                  <>
                    <Check className="w-4 h-4 text-[#F8C9BB]" />
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
                className="w-full sm:w-auto font-black text-white bg-[#18130F] hover:bg-[#B5451B] active:bg-[#8A3215] py-2.5 px-5 rounded transition-all cursor-pointer flex items-center justify-center gap-2 text-xs border border-[#2A2018] hover:border-[#8A3215]"
              >
                <Send className="w-3.5 h-3.5 text-[#F8C9BB]" />
                <span>アジェンダメール文案を生成する</span>
              </button>
            )}
            <span className="text-[10px] text-[#9C9490] font-bold">※ メーラーへコピペ可能です</span>
          </div>
        </div>

        {/* AI Audit Panel */}
        <div className="bg-[#18130F] text-[#D6D0C8] rounded flex flex-col justify-between overflow-hidden relative border border-[#2A2018]">

          <div className="bg-[#2A2018] p-4 border-b border-[#3D3228] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-[#3D3228] text-[#F8C9BB] rounded border border-[#4D4030]">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <h5 className="font-black text-xs text-white tracking-wider">
                  AI自動価格査定＆インデクス監査
                </h5>
                <p className="text-[10px] text-[#9C9490] mt-0.5 leading-none">
                  Gemini 2.5 Flashを駆動して、不自然な係数や調整をロジカル監査
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5 flex-1 flex flex-col">
            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-6">
                <div className="relative mb-4">
                  <div className="w-10 h-10 border-2 border-[#B5451B] border-t-transparent rounded-full animate-spin" />
                  <Sparkles className="w-4 h-4 text-[#F8C9BB] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <h6 className="font-black text-[#F8C9BB] text-xs mb-1 animate-pulse">
                  製造原価構造をAI監査分析中...
                </h6>
                <p className="text-[10px] text-[#9C9490] max-w-xs leading-normal">
                  下請適正化ルール、製造コストインデクス、および不自然な調整変動の基準に基づいてチェックシートを作製しています。
                </p>
              </div>
            ) : comparison ? (
              <div className="flex-1 space-y-4 max-h-[380px] overflow-y-auto pr-1">
                <div className="bg-[#2A2018] border border-[#3D3228] rounded p-4">
                  <strong className="text-[#F8C9BB] block mb-2 font-black text-xs flex items-center gap-1.5 uppercase">
                    <Activity className="w-4 h-4 text-[#B5451B]" />
                    <span>【AI監査評定総括】</span>
                  </strong>
                  <p className="text-[#D6D0C8] text-[11px] leading-relaxed pl-1 font-sans font-medium">
                    {comparison.summary}
                  </p>
                </div>

                <div className="bg-[#0F0C09] border border-[#2A2018] rounded p-4">
                  <strong className="text-[#F8C9BB] block mb-3 font-black text-xs flex items-center gap-1.5 uppercase border-b border-[#2A2018] pb-2">
                    <AlertTriangle className="w-4 h-4 text-[#B5451B]" />
                    <span>対サプライヤー協議上の逆確認アプローチ論点</span>
                  </strong>
                  <ul className="space-y-3 pl-1">
                    {comparison.negotiationTips.map((tip, i) => (
                      <li key={i} className="flex gap-2.5 items-start text-xs text-[#9C9490]">
                        <span className="bg-[#2A2018] text-[#F8C9BB] font-mono text-[10px] font-bold h-5 w-5 rounded flex items-center justify-center shrink-0 border border-[#3D3228]">
                          {i + 1}
                        </span>
                        <span className="text-[11px] leading-relaxed font-bold font-sans text-[#D6D0C8]">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-6 bg-[#0F0C09]/60 border border-[#2A2018] rounded">
                <div className="p-3 bg-[#2A2018] text-[#F8C9BB] rounded border border-[#3D3228] mb-3.5">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h6 className="font-black text-[#F8C9BB] text-xs mb-1">
                  AI査定レポートが未ロードです
                </h6>
                <p className="text-[10px] text-[#9C9490] max-w-xs leading-normal">
                  右下の「AI価格監査分析を実行」ボタンを押すと、現在の新旧パラメータ変位から高度な妥当性監査が直ちに生成されます。
                </p>
              </div>
            )}
          </div>

          <div className="p-4 bg-[#0F0C09] border-t border-[#2A2018] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-[10.5px]">
            <span className="text-[#6B6057] font-mono font-bold hidden sm:block">Model Engine: Google Gemini 2.5 Flash</span>
            <button
              onClick={onRunComparison}
              disabled={isLoading}
              className="w-full sm:w-auto font-black text-white bg-[#B5451B] hover:bg-[#8A3215] active:bg-[#6B260F] py-2.5 px-5 rounded transition-colors disabled:bg-[#2A2018] disabled:text-[#6B6057] disabled:cursor-not-allowed cursor-pointer border border-[#8A3215] hover:border-[#6B260F]"
            >
              {isLoading && retryCountdown != null ? `レート制限中 — ${retryCountdown}秒後に自動再試行...` : isLoading ? 'AI監査中...' : 'AI価格監査分析を実行'}
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};
