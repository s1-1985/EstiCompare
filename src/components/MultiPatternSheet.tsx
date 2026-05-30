import React, { useState } from 'react';
import { DetailedEstimate, QuantityPattern, PatternProcessRate } from '../types';
import {
  calculateEstimate,
  applyPatternOverride,
  createPatternFromEstimate,
  resolveProcessCalcMode,
  costFromSell,
  rateFromCostSell,
} from '../utils/calculations';
import { Plus, Trash2, Zap, Layers, AlertTriangle, Info } from 'lucide-react';

interface MultiPatternSheetProps {
  base: DetailedEstimate;
  patterns: QuantityPattern[];
  onBaseChange: (updater: (prev: DetailedEstimate) => DetailedEstimate) => void;
  onPatternsChange: (patterns: QuantityPattern[]) => void;
}

const SGA_MIN = 5;
const SGA_MAX = 15;

const yenCell = (v: number) => `¥${v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const rateLabel = (mode: string) =>
  mode === 'kg' ? 'kg単価' : mode === 'lump' ? '一式/lot' : mode === 'direct' ? '直接費' : '賃率';

/** 1パターンを目標単価に辻褄合わせ（standardは100円丸め、利管費でresidual吸収） */
function reconcilePattern(base: DetailedEstimate, pattern: QuantityPattern): { pattern: QuantityPattern; residual: number } {
  const merged = applyPatternOverride(base, pattern);
  const calc = calculateEstimate(merged);
  const target = pattern.targetUnitPrice || 0;
  if (target <= 0) return { pattern, residual: 0 };

  const sgaMode = pattern.sgaCalcMode || base.adjustments.sgaCalcMode || 'markup';
  const shipping = calc.shippingCostPerUnit;
  const other = pattern.otherAdjustment || 0;
  const Y = target - shipping - other;
  if (Y <= 0) return { pattern, residual: target - calc.grandTotalUnitPrice };

  const lot = pattern.baseLotSize || base.baseLotSize || 1;
  const materialCost = calc.netMaterialCost;
  let sgaPercent = Math.min(SGA_MAX, Math.max(SGA_MIN, pattern.sgaRatePercent ?? 15));
  const targetPrimeCost = costFromSell(Y, sgaPercent, sgaMode);
  const targetProcessCost = Math.max(0, targetPrimeCost - materialCost);
  const currentProcessCost = calc.totalProcessCost;

  const newRates: Record<number, PatternProcessRate> = { ...pattern.processRates };
  if (currentProcessCost > 0 && targetProcessCost > 0) {
    const mult = Math.max(0.1, targetProcessCost / currentProcessCost);
    base.processes.forEach((proc) => {
      if (!proc.processName.trim()) return;
      const mode = resolveProcessCalcMode(proc);
      const cur = pattern.processRates[proc.index] || {};
      if (mode === 'standard') {
        let r = Math.round(((cur.hourlyRate ?? proc.hourlyRate) * mult) / 100) * 100;
        if (r < 1000) r = 1000;
        newRates[proc.index] = { hourlyRate: r };
      } else if (mode === 'kg') {
        newRates[proc.index] = { kgPrice: parseFloat(((cur.kgPrice ?? proc.kgPrice) * mult).toFixed(2)) };
      } else if (mode === 'lump') {
        newRates[proc.index] = { lumpSumPrice: parseFloat(((cur.lumpSumPrice ?? proc.lumpSumPrice ?? 0) * mult).toFixed(2)) };
      } else if (mode === 'direct') {
        newRates[proc.index] = { directProcessingCost: parseFloat(((cur.directProcessingCost ?? proc.directProcessingCost) * mult).toFixed(2)) };
      }
    });
  }

  // 丸め後の実primeCostから利管費率を逆算（5〜15%にクランプ）
  const tentative: QuantityPattern = { ...pattern, processRates: newRates, sgaRatePercent: sgaPercent };
  const recalc = calculateEstimate(applyPatternOverride(base, tentative));
  const primeCost = recalc.primeCost;
  if (primeCost > 0) {
    const rawSga = Math.round(rateFromCostSell(primeCost, Y, sgaMode) * 100) / 100;
    sgaPercent = Math.min(SGA_MAX, Math.max(SGA_MIN, rawSga));
  }
  const finalPattern: QuantityPattern = { ...pattern, processRates: newRates, sgaRatePercent: sgaPercent };
  const finalCalc = calculateEstimate(applyPatternOverride(base, finalPattern));
  const residual = finalCalc.grandTotalUnitPrice - target;
  return { pattern: finalPattern, residual };
}

export const MultiPatternSheet: React.FC<MultiPatternSheetProps> = ({ base, patterns, onBaseChange, onPatternsChange }) => {
  const [warnings, setWarnings] = useState<Record<string, number>>({});

  const activeProcesses = base.processes.filter((p) => p.processName.trim() !== '');

  const updatePattern = (id: string, patch: Partial<QuantityPattern>) => {
    onPatternsChange(patterns.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const updatePatternRate = (id: string, procIndex: number, mode: string, value: number) => {
    onPatternsChange(
      patterns.map((p) => {
        if (p.id !== id) return p;
        const key = mode === 'kg' ? 'kgPrice' : mode === 'lump' ? 'lumpSumPrice' : mode === 'direct' ? 'directProcessingCost' : 'hourlyRate';
        return { ...p, processRates: { ...p.processRates, [procIndex]: { [key]: value } } };
      })
    );
  };

  // 出来高・段取はベース共通フィールド（全パターンに即時反映）
  const updateSharedProcess = (procIndex: number, key: 'yieldPerHour' | 'totalHours', value: number) => {
    onBaseChange((prev) => ({
      ...prev,
      processes: prev.processes.map((p) => (p.index === procIndex ? { ...p, [key]: value } : p)),
    }));
  };

  const addPattern = () => {
    const n = patterns.length + 1;
    onPatternsChange([...patterns, createPatternFromEstimate(base, `数量${n}`, base.baseLotSize || 100)]);
  };

  const initPatterns = () => {
    onPatternsChange([100, 300, 1000].map((lot) => createPatternFromEstimate(base, `${lot}個`, lot)));
  };

  const deletePattern = (id: string) => {
    onPatternsChange(patterns.filter((p) => p.id !== id));
  };

  const reconcileOne = (id: string) => {
    const pat = patterns.find((p) => p.id === id);
    if (!pat) return;
    if ((pat.targetUnitPrice || 0) <= 0) { setWarnings((w) => ({ ...w, [id]: NaN })); return; }
    const { pattern, residual } = reconcilePattern(base, pat);
    onPatternsChange(patterns.map((p) => (p.id === id ? pattern : p)));
    setWarnings((w) => ({ ...w, [id]: residual }));
  };

  const reconcileAll = () => {
    const nextWarn: Record<string, number> = {};
    const next = patterns.map((pat) => {
      if ((pat.targetUnitPrice || 0) <= 0) { nextWarn[pat.id] = NaN; return pat; }
      const { pattern, residual } = reconcilePattern(base, pat);
      nextWarn[pat.id] = residual;
      return pattern;
    });
    onPatternsChange(next);
    setWarnings(nextWarn);
  };

  const inp = 'w-full px-1 py-0.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F] text-right';

  if (patterns.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-8 bg-white rounded-xl border border-[#D6D0C8] p-8 text-center shadow-sm">
        <Layers className="w-10 h-10 mx-auto text-[#1E3A5F] mb-3" />
        <h2 className="text-lg font-black text-[#18130F] mb-2">複数数量パターン見積</h2>
        <p className="text-sm text-[#6B6057] leading-relaxed mb-5">
          1つの品番で見積数量が複数（例: ロット100/300/1000）ある場合のシートです。<br />
          <strong className="text-[#18130F]">出来高・段取時間は全パターン共通</strong>（生産前提として固定）、
          <strong className="text-[#18130F]">賃率・利管費・送料は数量により変動</strong>させて、各パターンの辻褄を同時に合わせます。
        </p>
        <button
          onClick={initPatterns}
          className="bg-[#1E3A5F] hover:bg-[#2A4A7F] text-white px-5 py-2.5 rounded-lg font-black text-sm inline-flex items-center gap-2 cursor-pointer transition-all"
        >
          <Plus className="w-4 h-4" /> パターンを初期化（100/300/1000個）
        </button>
        <div className="mt-3">
          <button onClick={addPattern} className="text-xs text-[#1E3A5F] font-bold underline cursor-pointer">空のパターンを1つ追加</button>
        </div>
      </div>
    );
  }

  // 各パターンの計算結果
  const calcs = patterns.map((p) => ({ pattern: p, calc: calculateEstimate(applyPatternOverride(base, p)) }));

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#1E3A5F]" />
          <div>
            <h2 className="text-sm font-black text-[#18130F]">複数数量パターン見積</h2>
            <p className="text-[10px] text-[#9C9490] font-mono">
              {base.partNumber || '(品番未設定)'}{base.partName ? ` / ${base.partName}` : ''} — {patterns.length}パターン
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={reconcileAll}
            className="bg-[#18130F] hover:bg-[#B5451B] text-white font-black text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 cursor-pointer transition-all">
            <Zap className="w-3.5 h-3.5 text-[#F8C9BB]" /> 全パターン整合
          </button>
          <button onClick={addPattern}
            className="bg-white border border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#EFF4FD] font-black text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 cursor-pointer transition-all">
            <Plus className="w-3.5 h-3.5" /> パターン追加
          </button>
        </div>
      </div>

      {/* Pattern config bar */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {patterns.map((p) => (
          <div key={p.id} className="flex-none w-44 bg-[#F0F5FF] border border-[#B8CCE8] rounded p-2 space-y-1">
            <div className="flex items-center justify-between">
              <input value={p.label} onChange={(e) => updatePattern(p.id, { label: e.target.value })}
                className="w-full text-xs font-black text-[#1E3A5F] bg-transparent outline-none border-b border-transparent focus:border-[#1E3A5F]" />
              <button onClick={() => deletePattern(p.id)} disabled={patterns.length <= 1}
                className="ml-1 text-[#9C9490] hover:text-rose-600 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-[#6B6057] font-bold shrink-0">基準数</span>
              <input type="number" value={p.baseLotSize || ''} onChange={(e) => updatePattern(p.id, { baseLotSize: parseFloat(e.target.value) || 0 })}
                className={inp} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-[#6B6057] font-bold shrink-0">単位</span>
              <input value={p.lotUnit} onChange={(e) => updatePattern(p.id, { lotUnit: e.target.value })}
                className="w-full px-1 py-0.5 text-xs rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F]" />
            </div>
          </div>
        ))}
      </div>

      {/* Main process table */}
      <div className="overflow-x-auto border border-[#D6D0C8] rounded bg-white">
        <table className="text-xs border-collapse min-w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#18130F] text-white">
              <th className="px-2 py-1.5 text-left font-black border-r border-[#3A3028] sticky left-0 bg-[#18130F] z-20">#</th>
              <th className="px-2 py-1.5 text-left font-black border-r border-[#3A3028] sticky left-8 bg-[#18130F] z-20 min-w-[120px]">工程名</th>
              <th className="px-2 py-1.5 text-center font-black border-r border-[#3A3028] bg-[#1A6B3A] min-w-[70px]" title="全パターン共通">出来高<br /><span className="text-[8px] opacity-70">共通(個/h)</span></th>
              <th className="px-2 py-1.5 text-center font-black border-r border-[#5A4A3A] bg-[#1A6B3A] min-w-[70px]" title="全パターン共通">段取<br /><span className="text-[8px] opacity-70">共通(h)</span></th>
              {patterns.map((p) => (
                <th key={p.id} colSpan={2} className="px-2 py-1.5 text-center font-black border-l-2 border-[#B5451B] bg-[#1E3A5F] min-w-[140px]">
                  {p.label}<br /><span className="text-[8px] opacity-70 font-mono">{p.baseLotSize.toLocaleString()}{p.lotUnit}</span>
                </th>
              ))}
            </tr>
            <tr className="bg-[#2A2018] text-[#C8C2B8] text-[9px]">
              <th className="border-r border-[#3A3028] sticky left-0 bg-[#2A2018] z-20"></th>
              <th className="border-r border-[#3A3028] sticky left-8 bg-[#2A2018] z-20"></th>
              <th className="border-r border-[#3A3028]"></th>
              <th className="border-r border-[#5A4A3A]"></th>
              {patterns.map((p) => {
                return (
                  <React.Fragment key={p.id}>
                    <th className="px-1 py-1 text-center border-l-2 border-[#B5451B] font-bold">単価</th>
                    <th className="px-1 py-1 text-center font-bold">加工費/個</th>
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {activeProcesses.map((proc) => {
              const mode = resolveProcessCalcMode(proc);
              const isStd = mode === 'standard';
              return (
                <tr key={proc.index} className="border-b border-[#EEEBE6] hover:bg-[#FAFAF8]">
                  <td className="px-2 py-1 text-[#9C9490] font-mono border-r border-[#EEEBE6] sticky left-0 bg-white">{proc.index}</td>
                  <td className="px-2 py-1 font-bold text-[#18130F] border-r border-[#EEEBE6] sticky left-8 bg-white">
                    {proc.processName}
                    <span className="ml-1 text-[8px] text-[#9C9490] font-mono">[{rateLabel(mode)}]</span>
                  </td>
                  {/* 共通: 出来高 */}
                  <td className="px-1 py-0.5 border-r border-[#EEEBE6] bg-[#F0FAF4]">
                    {isStd ? (
                      <input type="number" value={proc.yieldPerHour || ''} onChange={(e) => updateSharedProcess(proc.index, 'yieldPerHour', parseFloat(e.target.value) || 0)}
                        className="w-full px-1 py-0.5 text-xs font-mono rounded border border-[#A8D4BC] bg-white outline-none focus:ring-1 focus:border-[#1A6B3A] text-right" />
                    ) : <span className="block text-center text-[#C8C2B8]">—</span>}
                  </td>
                  {/* 共通: 段取 */}
                  <td className="px-1 py-0.5 border-r border-[#EEEBE6] bg-[#F0FAF4]">
                    {isStd ? (
                      <input type="number" value={proc.totalHours || ''} onChange={(e) => updateSharedProcess(proc.index, 'totalHours', parseFloat(e.target.value) || 0)}
                        className="w-full px-1 py-0.5 text-xs font-mono rounded border border-[#A8D4BC] bg-white outline-none focus:ring-1 focus:border-[#1A6B3A] text-right" />
                    ) : <span className="block text-center text-[#C8C2B8]">—</span>}
                  </td>
                  {/* per-pattern */}
                  {calcs.map(({ pattern, calc }) => {
                    const r = pattern.processRates[proc.index] || {};
                    const rateVal = mode === 'kg' ? r.kgPrice : mode === 'lump' ? r.lumpSumPrice : mode === 'direct' ? r.directProcessingCost : r.hourlyRate;
                    const procCost = calc.processCosts[base.processes.findIndex((bp) => bp.index === proc.index)] || 0;
                    return (
                      <React.Fragment key={pattern.id}>
                        <td className="px-1 py-0.5 border-l-2 border-[#E8C8BC]">
                          <input type="number" value={rateVal ?? ''} onChange={(e) => updatePatternRate(pattern.id, proc.index, mode, parseFloat(e.target.value) || 0)}
                            className={inp} />
                        </td>
                        <td className="px-1 py-1 text-right font-mono text-[#1E3A5F] font-bold">{procCost > 0 ? yenCell(procCost) : '—'}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {/* Summary footer */}
          <tfoot className="bg-[#FAFAF8] text-xs border-t-2 border-[#D6D0C8]">
            {([
              ['材料費/個', (c: ReturnType<typeof calculateEstimate>) => yenCell(c.netMaterialCost)],
              ['加工費合計', (c: ReturnType<typeof calculateEstimate>) => yenCell(c.totalProcessCost)],
              ['直製造原価', (c: ReturnType<typeof calculateEstimate>) => yenCell(c.primeCost)],
              ['送料/個', (c: ReturnType<typeof calculateEstimate>) => yenCell(c.shippingCostPerUnit)],
            ] as const).map(([label, fn]) => (
              <tr key={label} className="border-b border-[#EEEBE6]">
                <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">{label}</td>
                {calcs.map(({ pattern, calc }) => (
                  <td key={pattern.id} colSpan={2} className="px-2 py-1 text-right font-mono text-[#18130F] border-l-2 border-[#E8C8BC]">{fn(calc)}</td>
                ))}
              </tr>
            ))}
            {/* 利管費率 (editable) */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">利管費率 (%)</td>
              {patterns.map((p) => (
                <td key={p.id} colSpan={2} className="px-2 py-1 border-l-2 border-[#E8C8BC]">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => updatePattern(p.id, { sgaCalcMode: (p.sgaCalcMode || 'markup') === 'markup' ? 'margin' : 'markup' })}
                      className="text-[8px] font-black px-1 rounded border border-[#D6D0C8] cursor-pointer hover:bg-[#F0EDE8]">
                      {(p.sgaCalcMode || 'markup') === 'markup' ? '外' : '内'}
                    </button>
                    <input type="number" value={p.sgaRatePercent || ''} step="0.01" onChange={(e) => updatePattern(p.id, { sgaRatePercent: parseFloat(e.target.value) || 0 })}
                      className="w-16 px-1 py-0.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F] text-right" />
                  </div>
                </td>
              ))}
            </tr>
            {/* 積み上げ単価 */}
            <tr className="border-b border-[#EEEBE6] bg-[#EEF3FB]">
              <td colSpan={4} className="px-2 py-1.5 text-right font-black text-[#18130F] sticky left-0 bg-[#EEF3FB]">積み上げ単価</td>
              {calcs.map(({ pattern, calc }) => (
                <td key={pattern.id} colSpan={2} className="px-2 py-1.5 text-right font-mono font-black text-[#1E3A5F] border-l-2 border-[#E8C8BC]">{yenCell(calc.grandTotalUnitPrice)}</td>
              ))}
            </tr>
            {/* 目標単価 (editable) */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">目標単価</td>
              {patterns.map((p) => (
                <td key={p.id} colSpan={2} className="px-2 py-1 border-l-2 border-[#E8C8BC]">
                  <input type="number" value={p.targetUnitPrice || ''} onChange={(e) => updatePattern(p.id, { targetUnitPrice: parseFloat(e.target.value) || 0 })}
                    className={inp} />
                </td>
              ))}
            </tr>
            {/* 差額(辻褄) */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-black text-[#18130F] sticky left-0 bg-[#FAFAF8]">差額(辻褄)</td>
              {calcs.map(({ pattern, calc }) => {
                const diff = pattern.targetUnitPrice > 0 ? calc.grandTotalUnitPrice - pattern.targetUnitPrice : null;
                const cls = diff === null ? 'text-[#9C9490]' : Math.abs(diff) < 0.5 ? 'text-emerald-700' : diff > 0 ? 'text-rose-600' : 'text-amber-700';
                return (
                  <td key={pattern.id} colSpan={2} className={`px-2 py-1 text-right font-mono font-black border-l-2 border-[#E8C8BC] ${cls}`}>
                    {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                  </td>
                );
              })}
            </tr>
            {/* 整合ボタン + 残差警告 */}
            <tr>
              <td colSpan={4} className="px-2 py-1.5 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">辻褄合わせ</td>
              {patterns.map((p) => {
                const w = warnings[p.id];
                return (
                  <td key={p.id} colSpan={2} className="px-2 py-1.5 border-l-2 border-[#E8C8BC]">
                    <button onClick={() => reconcileOne(p.id)}
                      className="w-full bg-[#18130F] hover:bg-[#B5451B] text-white font-black text-[10px] py-1 rounded inline-flex items-center justify-center gap-1 cursor-pointer transition-all">
                      <Zap className="w-3 h-3 text-[#F8C9BB]" /> 一発整合
                    </button>
                    {w !== undefined && (
                      Number.isNaN(w) ? (
                        <div className="mt-0.5 text-[8px] text-rose-600 font-bold text-center">目標単価未設定</div>
                      ) : Math.abs(w) >= 1 ? (
                        <div className="mt-0.5 text-[8px] text-amber-700 font-bold text-center flex items-center justify-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> 残差{w > 0 ? '+' : ''}{w.toFixed(1)}円
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[8px] text-emerald-700 font-bold text-center">整合済</div>
                      )
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-start gap-1.5 text-[10px] text-[#6B6057] bg-[#F0FAF4] border border-[#A8D4BC] rounded p-2">
        <Info className="w-3.5 h-3.5 text-[#1A6B3A] shrink-0 mt-0.5" />
        <span>
          <strong className="text-[#1A6B3A]">出来高・段取時間は全パターン共通</strong>（生産前提として変更不可・緑列を編集すると全パターンへ即時反映）。
          賃率のみ数量により変更可能です。残差が出る場合は賃率だけでは辻褄が合わないサイン — 出来高・段取の前提自体を見直してください。
        </span>
      </div>
    </div>
  );
};
