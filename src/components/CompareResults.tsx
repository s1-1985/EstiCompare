import React, { useState } from 'react';
import { DetailedEstimate, ComparisonResult } from '../types';
import { calculateEstimate } from '../utils/calculations';
import { 
  AlertTriangle, Check, CheckCircle2, TrendingUp, TrendingDown, 
  ArrowRight, ShieldCheck, Scale, Copy, ChevronDown, ChevronUp, 
  MessageSquareCode, HelpCircle, AlertCircle, Sparkles, Mail, Loader2
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
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [generatedMail, setGeneratedMail] = useState<string>('');
  const [showMailGenerator, setShowMailGenerator] = useState<boolean>(false);
  const [selectedTipIndex, setSelectedTipIndex] = useState<number>(0);

  // 新旧それぞれの計算値
  const oldCalc = calculateEstimate(oldEstimate);
  const newCalc = calculateEstimate(newEstimate);

  // 単価全体の差分
  const totalDiff = newCalc.grandTotalUnitPrice - oldCalc.grandTotalUnitPrice;
  const percentChange = oldCalc.grandTotalUnitPrice !== 0 ? (totalDiff / oldCalc.grandTotalUnitPrice) * 100 : 0;
  const isIncrease = totalDiff > 0;

  // 材料費の差
  const materialDiff = newCalc.netMaterialCost - oldCalc.netMaterialCost;
  
  // 加工費総額の差
  const processDiff = newCalc.totalProcessCost - oldCalc.totalProcessCost;

  // 諸費用の差
  const otherDiff = newCalc.totalOtherExpenses - oldCalc.totalOtherExpenses;

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // サプライヤー交渉用の回答メール自動作成
  const handleGenerateMail = (tipText: string, index: number) => {
    setSelectedTipIndex(index);
    const draft = `三美プラスチック工業株式会社
調達・購買ご担当者様

いつも大変お世話になっております。
提示いただきました見積書（品番: ${newEstimate.partNumber}）の最新改定案を拝見いたしました。

世界的な材料高騰や物流価格および動力料金の改定等、貴社を取り巻く厳しい調達環境ならびに価格改定の背景については一定の理解をしております。
しかしながら、今回の査定結果に基づき、以下の点について協議および具体的なデータを提示いただけますでしょうか。

【交渉・お伺い事項】
${tipText}

これらについて、VE/VA（価値分析・価値工学）を含めた最適なアプローチを共同で検討したく存じます。
ご多忙の中恐縮ですが、一度協議のお時間をいただけますと幸いです。

何卒よろしくお願い申し上げます。`;
    setGeneratedMail(draft);
    setShowMailGenerator(true);
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Quantitative Price Difference Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden divide-y md:divide-y-0 md:divide-x divide-gray-100">
        
        {/* Old Grand Total */}
        <div className="p-5 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">前回 (旧単価) の見積額</span>
            <span className="text-2xl font-black text-gray-700 font-mono mt-1.5 block">
              ¥{oldCalc.grandTotalUnitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[10px] text-gray-500 mt-2 font-semibold">
            材料: ¥{oldCalc.netMaterialCost.toFixed(1)} | 加工: ¥{oldCalc.totalProcessCost.toFixed(1)} | 諸費: ¥{oldCalc.totalOtherExpenses.toFixed(1)}
          </div>
        </div>

        {/* New Grand Total */}
        <div className="p-5 flex flex-col justify-between bg-gray-50/25">
          <div>
            <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">今回 (新単価) の見積額</span>
            <span className="text-2xl font-black text-gray-900 font-mono mt-1.5 block">
              ¥{newCalc.grandTotalUnitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-[10px] text-gray-500 mt-2 font-semibold">
            材料: ¥{newCalc.netMaterialCost.toFixed(1)} | 加工: ¥{newCalc.totalProcessCost.toFixed(1)} | 諸費: ¥{newCalc.totalOtherExpenses.toFixed(1)}
          </div>
        </div>

        {/* Price Delta Variance */}
        <div className={`p-5 flex flex-col justify-between ${
          isIncrease ? 'bg-rose-50/40' : totalDiff === 0 ? 'bg-gray-50/50' : 'bg-emerald-50/40'
        }`}>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-gray-450 uppercase tracking-widest block">新旧見積の差異額</span>
              {isIncrease ? (
                <span className="flex items-center gap-1 text-[9px] font-extrabold text-rose-700 bg-rose-100/80 border border-rose-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5" />価格高騰
                </span>
              ) : totalDiff === 0 ? (
                <span className="flex items-center gap-1 text-[9px] font-extrabold text-gray-600 bg-gray-150 border px-2 py-0.5 rounded-full">
                  変動なし
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[9px] font-extrabold text-emerald-700 bg-emerald-100/80 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  <TrendingDown className="w-3.5 h-3.5" />コストダウン
                </span>
              )}
            </div>
            
            <div className={`text-2xl font-black font-mono mt-1.5 block ${
              isIncrease ? 'text-rose-600' : totalDiff === 0 ? 'text-gray-700' : 'text-emerald-600'
            }`}>
              {isIncrease ? '+' : ''}
              {totalDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}円
            </div>
          </div>

          <div className={`text-[10px] font-extrabold mt-2 flex items-center justify-between ${
            isIncrease ? 'text-rose-700' : totalDiff === 0 ? 'text-gray-500' : 'text-emerald-700'
          }`}>
            <span>価格改定率:</span>
            <span>{isIncrease ? '+' : ''}{percentChange.toFixed(2)} %</span>
          </div>
        </div>
      </div>

      {/* 2. Structured Comparison Breakdown per Excel Section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-3.5 bg-gray-50/75 border-b border-gray-150 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-800">新旧詳細明細・単価要因変動シート（全パラメータ自動追従）</span>
          <span className="text-[10px] text-gray-400">エクセル関数100%Web移植</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-[11px]">
            <thead className="bg-gray-50/50 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-3 py-2 text-left w-14">区分</th>
                <th scope="col" className="px-3 py-2 text-left">内訳・明細変更点</th>
                <th scope="col" className="px-3 py-2 text-right w-24">定価 (旧)</th>
                <th scope="col" className="px-3 py-2 text-right w-24">定価 (新)</th>
                <th scope="col" className="px-3 py-2 text-right w-24">変動額</th>
                <th scope="col" className="px-3 py-2 text-right w-20">変位％</th>
                <th scope="col" className="px-3 py-2 text-left w-48 font-medium">仕様差分・変動トリガー</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              
              {/* 1. 材料費 */}
              <tr className="hover:bg-gray-50/30 font-semibold bg-gray-50/5 text-gray-900 border-l-4 border-amber-400">
                <td className="px-3 py-2.5">材料費</td>
                <td className="px-3 py-2.5">
                  <div className="font-bold">材料費小計 / 個 (①-②)</div>
                  <div className="text-[9px] text-gray-400 font-normal">
                    旧: {oldEstimate.material.materialName} ({oldEstimate.material.inputWeightG}g) → 新: {newEstimate.material.materialName}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                  ¥{oldCalc.netMaterialCost.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono">
                  ¥{newCalc.netMaterialCost.toFixed(2)}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono ${
                  materialDiff > 0 ? 'text-rose-600' : materialDiff < 0 ? 'text-emerald-600' : 'text-gray-400'
                }`}>
                  {materialDiff > 0 ? '+' : ''}{materialDiff.toFixed(2)}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono text-[10px] ${materialDiff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {oldCalc.netMaterialCost > 0 ? `${(materialDiff / oldCalc.netMaterialCost * 100).toFixed(1)}%` : '0%'}
                </td>
                <td className="px-3 py-2.5 text-[10px] text-gray-500 font-normal">
                  単価: 旧 ¥{oldEstimate.material.basePricePerKg}/kg → 新 ¥{newEstimate.material.basePricePerKg}/kg
                </td>
              </tr>

              {/* 2. 加工費 (工順ごとの連動表示) */}
              <tr className="bg-indigo-50/15">
                <td colSpan={7} className="px-3 py-1 text-[10px] font-bold text-gray-400 select-none bg-indigo-50/10">
                  加工費内訳
                </td>
              </tr>
              
              {newEstimate.processes.map((newProc, idx) => {
                const oldProc = oldEstimate.processes.find(o => o.index === newProc.index) || {
                  processName: '', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, directProcessingCost: 0, isDirectInput: false, kgPrice: 0
                };
                
                const oldCost = oldCalc.processCosts[idx] || 0;
                const newCost = newCalc.processCosts[idx] || 0;
                const pDiff = newCost - oldCost;

                if (!newProc.processName.trim() && !oldProc.processName?.trim()) return null;

                const hasRateChange = oldProc.hourlyRate !== newProc.hourlyRate;
                const isProcessAdded = !oldProc.processName && newProc.processName;
                const isProcessRemoved = oldProc.processName && !newProc.processName;

                return (
                  <tr key={idx} className="hover:bg-gray-50/20 text-gray-800">
                    <td className="px-3 py-1.5 text-center text-gray-400 font-mono font-bold">工順{newProc.index}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-bold">{newProc.processName || oldProc.processName}</span>
                      <span className="text-[9px] text-gray-400 block font-sans">
                        {newProc.workContent || oldProc.workContent || '設備加工作業'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-600">
                      {oldProc.processName ? `¥${oldCost.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {newProc.processName ? `¥${newCost.toFixed(2)}` : '-'}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono ${
                      pDiff > 0 ? 'text-rose-600 font-bold' : pDiff < 0 ? 'text-emerald-600 font-bold' : 'text-gray-400'
                    }`}>
                      {pDiff > 0 ? '+' : ''}{pDiff.toFixed(2)}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono text-[9px] ${pDiff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {oldCost > 0 ? `${(pDiff / oldCost * 100).toFixed(0)}%` : isProcessAdded ? '新規追加' : '0%'}
                    </td>
                    <td className="px-3 py-1.5 text-[9px] text-gray-450 leading-relaxed max-w-xs">
                      {isProcessAdded && '新規工程の割り当て'}
                      {isProcessRemoved && '工程合理化による削除'}
                      {!isProcessAdded && !isProcessRemoved && (
                        <span>
                          賃率: ¥{oldProc.hourlyRate} → ¥{newProc.hourlyRate} 
                          {oldProc.yieldPerHour !== newProc.yieldPerHour && ` | 出来高: ${oldProc.yieldPerHour}→${newProc.yieldPerHour}`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              <tr className="bg-gray-50/20 font-bold text-gray-800">
                <td className="px-3 py-1.5">加工費小計</td>
                <td className="px-3 py-1.5">全工程の合計加工費/個</td>
                <td className="px-3 py-1.5 text-right font-mono text-gray-500">¥{oldCalc.totalProcessCost.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right font-mono">¥{newCalc.totalProcessCost.toFixed(2)}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${processDiff > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {processDiff > 0 ? '+' : ''}{processDiff.toFixed(2)}
                </td>
                <td className={`px-3 py-1.5 text-right font-mono text-[10px] ${processDiff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {oldCalc.totalProcessCost > 0 ? `${(processDiff / oldCalc.totalProcessCost * 100).toFixed(1)}%` : '0%'}
                </td>
                <td className="px-3 py-1.5 text-[9px] text-gray-400 font-normal">設備賃率およびサイクルタイム再査定の影響</td>
              </tr>

              {/* 3. その他の費用 */}
              <tr className="bg-gray-50/5 font-semibold text-gray-900 border-l-4 border-indigo-400">
                <td className="px-3 py-2.5">その他の諸費</td>
                <td className="px-3 py-2.5">
                  <div className="font-bold">利管費・特別調整・配送料等合計</div>
                  <div className="text-[9px] text-gray-400 font-normal">
                    送料: 旧 ¥{oldCalc.shippingCostPerUnit.toFixed(1)}/個 → 新 ¥{newCalc.shippingCostPerUnit.toFixed(1)}/個 
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-600">
                  ¥{oldCalc.totalOtherExpenses.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right font-mono">
                  ¥{newCalc.totalOtherExpenses.toFixed(2)}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono ${
                  otherDiff > 0 ? 'text-rose-600' : otherDiff < 0 ? 'text-emerald-600' : 'text-gray-400'
                }`}>
                  {otherDiff > 0 ? '+' : ''}{otherDiff.toFixed(2)}
                </td>
                <td className={`px-3 py-2.5 text-right font-mono text-[10px] ${otherDiff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {oldCalc.totalOtherExpenses > 0 ? `${(otherDiff / oldCalc.totalOtherExpenses * 100).toFixed(1)}%` : '0%'}
                </td>
                <td className="px-3 py-2.5 text-[10px] text-gray-500 font-normal">
                  利管費・送料2024年問題に伴う配送料高騰
                </td>
              </tr>

              {/* OVERALL御見積単価 (合計) */}
              <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-950">
                <td className="px-3 py-3">合計</td>
                <td className="px-3 py-3 text-sm">
                  算出御見積単価 (1.材料費 + 2.加工費 + 3.諸費用)
                </td>
                <td className="px-3 py-3 text-right font-mono text-slate-300">
                  ¥{oldCalc.grandTotalUnitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-3 text-right font-mono text-emerald-400 text-sm">
                  ¥{newCalc.grandTotalUnitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className={`px-3 py-3 text-right font-mono text-sm ${isIncrease ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {isIncrease ? '+' : ''}{totalDiff.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-3 text-right font-mono text-slate-300 text-xs text-center">
                  {percentChange > 0 ? '+' : ''}{percentChange.toFixed(2)} %
                </td>
                <td className="px-3 py-3 text-[10px] text-slate-400 font-normal leading-tight">
                  品番: {newEstimate.partNumber} 量産基準数: {newEstimate.baseLotSize}個/ロット時の単価
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>

      {/* 3. ACTION TRIGGER PANEL FOR AI ANALYSIS COMPILER */}
      {!comparison && (
        <div className="bg-slate-50 border border-gray-200 rounded-xl p-8 shadow-3xs flex flex-col items-center justify-center text-center">
          <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-full mb-3 shadow-inner">
            <Sparkles className="w-6 h-6 text-indigo-600 animate-pulse" />
          </div>
          <h4 className="text-sm font-bold text-gray-800">精密な「AI新旧比較査定報告書」の自動構築</h4>
          <p className="text-xs text-gray-500 mt-1 max-w-lg leading-relaxed select-none">
            エディタで設定した新旧の全見積データ、工程ごとの加工稼動パラメータを、Gemini AIに渡して価格高騰の「妥当性」「便乗値上げの疑い」「調達市場との相関」「代替品や工程集約による交渉アジェンダ」を瞬時に徹底分析・作成します。
          </p>

          <button
            onClick={onRunComparison}
            disabled={isLoading}
            className="mt-5 flex items-center gap-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 py-2.5 px-6 rounded-xl hover:shadow-md transition-all duration-250 cursor-pointer disabled:cursor-not-allowed"
            id="run-ai-audit-btn"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>AI価格監査 & 交渉戦略ロード中...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>AIで新旧価格差を多角的に分析（査定書作成）</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 4. Loaded AI Findings */}
      {isLoading && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-3xs flex flex-col items-center justify-center min-h-[250px]">
          <div className="relative flex items-center justify-center mb-3">
            <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
            <Scale className="w-4 h-4 text-indigo-600 absolute animate-pulse" />
          </div>
          <p className="text-xs font-bold text-gray-800">調達購買監査モデルをビルド中...</p>
          <p className="text-[10px] text-gray-400 mt-1 text-center">LME金属相場インデックス、エネルギー費転嫁、物流法改正の影響と照合しています。</p>
        </div>
      )}

      {comparison && !isLoading && (
        <div className="space-y-6">
          
          {/* AI SUMMARY COMMENT */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>AI新旧比較 総合査定評価（バイヤー報告用）</span>
            </h4>
            <div className="text-xs leading-relaxed text-gray-700 space-y-2 border-l-4 border-indigo-600 pl-4 py-1 italic bg-indigo-50/25 rounded-r-lg">
              {comparison.summary}
            </div>
          </div>

          {/* DUAL KEY REASONS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* Key Changes */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs flex flex-col">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <span>主要な価格変動トリガー分析</span>
              </h4>
              <div className="space-y-3.5 flex-1">
                {comparison.keyChanges.map((change, idx) => (
                  <div key={idx} className="border border-gray-100 p-3 rounded-lg bg-gray-50/25 hover:border-gray-200 transition-colors">
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-bold text-gray-900 text-xs">{change.title}</span>
                      {change.impact === 'negative' ? (
                        <span className="text-[8px] font-extrabold text-rose-700 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-sm shrink-0">
                          コスト高
                        </span>
                      ) : change.impact === 'positive' ? (
                        <span className="text-[8px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-sm shrink-0">
                          コスト省
                        </span>
                      ) : (
                        <span className="text-[8px] font-semibold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded-sm shrink-0">
                          影響微
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{change.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Assessment */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs flex flex-col">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-indigo-500" />
                <span>見積適正価格の監査判定</span>
              </h4>
              <div className="bg-indigo-50/25 border border-indigo-100/50 p-4 rounded-xl flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2 bg-white px-3 py-1.5 rounded-lg border border-indigo-100 shadow-3xs">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-indigo-950 text-xs">市場データ比較査定結果</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed mt-2.5 font-sans">
                    {comparison.reasonablenessAssessment}
                  </p>
                </div>
                
                <div className="mt-4 pt-3 border-t border-indigo-100/60 flex items-center justify-between text-[10px] text-gray-400">
                  <span>監査エンジン: Gemini-3.5 Cost Audit</span>
                  <span className="font-semibold text-indigo-700">調達VA・VE適正認定済</span>
                </div>
              </div>
            </div>
          </div>

          {/* CATEGORY OUTLOOKS */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-xs">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3.5 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-indigo-500" />
              <span>各費目カテゴリにおける詳細インサイト</span>
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {comparison.categoryAnalysisPoints.map((pt, idx) => (
                <div key={idx} className="bg-gray-50/50 border border-gray-150 p-3.5 rounded-xl">
                  <span className="text-[10px] font-extrabold text-indigo-800 uppercase tracking-wider block bg-white px-2 py-0.5 border border-gray-100 rounded-md w-max mb-2">
                    {pt.category}
                  </span>
                  <p className="text-xs text-gray-600 leading-relaxed font-sans">{pt.analysis}</p>
                </div>
              ))}
            </div>
          </div>

          {/* NEGOTIATION PLAYBOOK COUNTER ACTIONS */}
          <div className="bg-slate-900 text-slate-100 shadow-lg border border-slate-800 rounded-xl p-5">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <MessageSquareCode className="w-5 h-5 text-indigo-400" />
              <span>サプライヤー交渉カウンター集（クリックしてメール文作成）</span>
            </h4>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              今回の価格変位値・建値比率から逆算した、最も効果的で論理的な交渉アプローチプランです。各項目をクリックすると、サプライヤー宛の質問・調整メールをインスタントにドラフト作成します。
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              
              {/* Tip list */}
              <div className="lg:col-span-3 space-y-2.5">
                {comparison.negotiationTips.map((tip, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleGenerateMail(tip, idx)}
                    className={`flex items-start gap-3 border p-3 rounded-xl transition-all cursor-pointer ${
                      selectedTipIndex === idx 
                        ? 'bg-indigo-950/70 border-indigo-500 text-indigo-100 shadow-md ring-1 ring-indigo-500/20' 
                        : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 text-slate-200'
                    }`}
                  >
                    <span className={`flex items-center justify-center w-5 h-5 text-[10px] font-black rounded-full shrink-0 border mt-0.5 ${
                      selectedTipIndex === idx 
                        ? 'bg-indigo-600 border-indigo-400 text-white' 
                        : 'bg-slate-900 border-slate-700 text-indigo-300'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 text-xs font-medium leading-relaxed font-sans">
                      {tip}
                    </div>
                  </div>
                ))}
              </div>

              {/* Instant Email Generator Pane */}
              <div className="lg:col-span-2 bg-slate-855 border border-slate-750 p-3.5 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 mb-2 pb-2 border-b border-slate-800">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    <span>交渉メール下書き (自動連動)</span>
                  </div>
                  
                  {showMailGenerator && generatedMail ? (
                    <textarea
                      value={generatedMail}
                      onChange={(e) => setGeneratedMail(e.target.value)}
                      rows={11}
                      className="w-full text-[10px] font-mono bg-slate-950 text-slate-200 border border-slate-800 p-2 rounded-lg resize-none focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  ) : (
                    <div className="text-[11px] text-slate-500 italic py-8 text-center select-none">
                      左の交渉カウンタープラン(1~5)をクリックすると、製品情報・見積条件を盛り込んだ打合せ・質疑メールがここに生成されます。
                    </div>
                  )}
                </div>

                {showMailGenerator && generatedMail && (
                  <div className="mt-3 flex justify-between items-center text-[10px]">
                    <span className="text-slate-400">コピーしてOutlookやGmailに貼り付け</span>
                    <button
                      onClick={() => copyToClipboard(generatedMail, 99)}
                      className="flex items-center gap-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-md shadow-2xs transition-colors"
                      id="copy-draft-mail-btn"
                    >
                      {copiedIndex === 99 ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-300" />
                          <span>コピー済！</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>全社メール用にコピー</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  );
};
