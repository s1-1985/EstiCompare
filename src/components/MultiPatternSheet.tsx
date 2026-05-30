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
import { Plus, Trash2, Zap, Layers, AlertTriangle, Info, Copy, ChevronDown, ChevronRight } from 'lucide-react';

interface MultiPatternSheetProps {
  base: DetailedEstimate;
  patterns: QuantityPattern[];
  onBaseChange: (updater: (prev: DetailedEstimate) => DetailedEstimate) => void;
  onPatternsChange: (patterns: QuantityPattern[]) => void;
}

const SGA_MIN = 5;
const SGA_MAX = 25;

const yenFmt = (v: number) =>
  `¥${v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pctFmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;

const rateLabel = (mode: string) =>
  mode === 'kg' ? 'kg単価' : mode === 'lump' ? '一式/lot' : mode === 'direct' ? '直接費' : '賃率(円/h)';

function reconcilePattern(
  base: DetailedEstimate,
  pattern: QuantityPattern,
): { pattern: QuantityPattern; residual: number } {
  const merged = applyPatternOverride(base, pattern);
  const calc = calculateEstimate(merged);
  const target = pattern.targetUnitPrice || 0;
  if (target <= 0) return { pattern, residual: 0 };

  const sgaMode = pattern.sgaCalcMode || base.adjustments.sgaCalcMode || 'markup';
  const shipping = calc.shippingCostPerUnit;
  const other = pattern.otherAdjustment || 0;
  const sgaFixed = pattern.sgaFixedAdjustment || 0;
  // Y = the portion of target that primeCost+sgaBase must cover
  // (calculateEstimate adds sgaFixed on top of sgaBase, so we subtract it here)
  const Y = target - shipping - other - sgaFixed;
  if (Y <= 0) return { pattern, residual: target - calc.grandTotalUnitPrice };

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

  const tentative: QuantityPattern = { ...pattern, processRates: newRates, sgaRatePercent: sgaPercent };
  const recalc = calculateEstimate(applyPatternOverride(base, tentative));
  if (recalc.primeCost > 0) {
    const rawSga = Math.round(rateFromCostSell(recalc.primeCost, Y, sgaMode) * 100) / 100;
    sgaPercent = Math.min(SGA_MAX, Math.max(SGA_MIN, rawSga));
  }
  const finalPattern: QuantityPattern = { ...pattern, processRates: newRates, sgaRatePercent: sgaPercent };
  const finalCalc = calculateEstimate(applyPatternOverride(base, finalPattern));
  return { pattern: finalPattern, residual: finalCalc.grandTotalUnitPrice - target };
}

export const MultiPatternSheet: React.FC<MultiPatternSheetProps> = ({
  base,
  patterns,
  onBaseChange,
  onPatternsChange,
}) => {
  const [warnings, setWarnings] = useState<Record<string, number>>({});
  const [showProcessDetail, setShowProcessDetail] = useState(true);
  const [baseEdited, setBaseEdited] = useState(false);

  const activeProcesses = base.processes.filter((p) => p.processName.trim() !== '');

  // Clear a pattern's warning when it's manually edited
  const clearWarn = (id: string) =>
    setWarnings((w) => { const n = { ...w }; delete n[id]; return n; });

  const updatePattern = (id: string, patch: Partial<QuantityPattern>) => {
    clearWarn(id);
    onPatternsChange(patterns.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const updatePatternRate = (id: string, procIndex: number, mode: string, value: number) => {
    clearWarn(id);
    onPatternsChange(
      patterns.map((p) => {
        if (p.id !== id) return p;
        const key =
          mode === 'kg' ? 'kgPrice'
          : mode === 'lump' ? 'lumpSumPrice'
          : mode === 'direct' ? 'directProcessingCost'
          : 'hourlyRate';
        return { ...p, processRates: { ...p.processRates, [procIndex]: { [key]: value } } };
      }),
    );
  };

  const updateSharedProcess = (procIndex: number, key: 'yieldPerHour' | 'totalHours', value: number) => {
    // shared edit → clear all warnings since all calcs change
    setWarnings({});
    setBaseEdited(true);
    onBaseChange((prev) => ({
      ...prev,
      processes: prev.processes.map((p) => (p.index === procIndex ? { ...p, [key]: value } : p)),
    }));
  };

  const MAX_PATTERNS = 20;

  const addPattern = () => {
    if (patterns.length >= MAX_PATTERNS) {
      alert(`数量パターンは最大${MAX_PATTERNS}件まで登録できます。`);
      return;
    }
    const n = patterns.length + 1;
    onPatternsChange([...patterns, createPatternFromEstimate(base, `数量${n}`, base.baseLotSize || 100)]);
  };

  const duplicatePattern = (id: string) => {
    const src = patterns.find((p) => p.id === id);
    if (!src) return;
    const clone: QuantityPattern = {
      ...JSON.parse(JSON.stringify(src)),
      id: `qp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: `${src.label}(複製)`,
    };
    const idx = patterns.findIndex((p) => p.id === id);
    const next = [...patterns];
    next.splice(idx + 1, 0, clone);
    onPatternsChange(next);
  };

  const initPatterns = () => {
    onPatternsChange([100, 300, 1000].map((lot) => createPatternFromEstimate(base, `${lot}個`, lot)));
    setWarnings({});
  };

  const deletePattern = (id: string) => {
    clearWarn(id);
    onPatternsChange(patterns.filter((p) => p.id !== id));
  };

  const reconcileOne = (id: string) => {
    const pat = patterns.find((p) => p.id === id);
    if (!pat) return;
    if ((pat.targetUnitPrice || 0) <= 0) {
      setWarnings((w) => ({ ...w, [id]: NaN }));
      return;
    }
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

  // ── Empty state ──
  if (patterns.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-8 bg-white rounded-xl border border-[#D6D0C8] p-8 text-center shadow-sm">
        <Layers className="w-10 h-10 mx-auto text-[#1E3A5F] mb-3" />
        <h2 className="text-lg font-black text-[#18130F] mb-2">複数数量パターン見積</h2>
        <p className="text-sm text-[#6B6057] leading-relaxed mb-2">
          1品番に対して見積数量が複数ある場合（例: ロット100/300/1000個）のシートです。
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center text-xs mb-5">
          <div className="px-3 py-2 bg-[#F0FAF4] border border-[#A8D4BC] rounded text-[#1A6B3A] font-bold">
            出来高・段取は全パターン共通（生産前提として固定）
          </div>
          <div className="px-3 py-2 bg-[#EFF4FD] border border-[#B8CCE8] rounded text-[#1E3A5F] font-bold">
            賃率・利管費・送料は数量ごとに調整可能
          </div>
        </div>
        <button
          onClick={initPatterns}
          className="bg-[#1E3A5F] hover:bg-[#2A4A7F] text-white px-5 py-2.5 rounded-lg font-black text-sm inline-flex items-center gap-2 cursor-pointer transition-all"
        >
          <Plus className="w-4 h-4" /> パターンを初期化（100/300/1000個）
        </button>
        <div className="mt-3">
          <button onClick={addPattern} className="text-xs text-[#1E3A5F] font-bold underline cursor-pointer">
            空のパターンを1つ追加
          </button>
        </div>
      </div>
    );
  }

  const calcs = patterns.map((p) => ({ pattern: p, calc: calculateEstimate(applyPatternOverride(base, p)) }));

  // ロット逓減率: 最小ロット（最高単価）を基準に各パターンの割引率を計算
  const refCalc = calcs.reduce(
    (ref, c) => (c.pattern.baseLotSize < ref.pattern.baseLotSize ? c : ref),
    calcs[0],
  );
  const refPrice = refCalc.calc.grandTotalUnitPrice;

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#1E3A5F]" />
          <div>
            <h2 className="text-sm font-black text-[#18130F]">複数数量パターン見積</h2>
            <p className="text-[10px] text-[#9C9490] font-mono">
              {base.partNumber || '(品番未設定)'}{base.partName ? ` / ${base.partName}` : ''} — {patterns.length}パターン
            </p>
          </div>
          {baseEdited && (
            <span className="text-[9px] font-bold bg-amber-100 border border-amber-400 text-amber-800 px-1.5 py-0.5 rounded">
              出来高・段取を編集中 — 保存すると基本見積にも反映されます
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={reconcileAll}
            className="bg-[#18130F] hover:bg-[#B5451B] text-white font-black text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 cursor-pointer transition-all"
          >
            <Zap className="w-3.5 h-3.5 text-[#F8C9BB]" /> 全パターン整合
          </button>
          <button
            onClick={addPattern}
            className="bg-white border border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#EFF4FD] font-black text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 cursor-pointer transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> パターン追加
          </button>
        </div>
      </div>

      {/* Pattern config cards */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {patterns.map((p) => {
          const pCalc = calcs.find((c) => c.pattern.id === p.id);
          const grandTotal = pCalc?.calc.grandTotalUnitPrice ?? 0;
          const discountPct = refPrice > 0 && grandTotal > 0 && p.id !== refCalc.pattern.id
            ? ((grandTotal - refPrice) / refPrice) * 100
            : null;
          return (
            <div key={p.id} className="flex-none w-48 bg-[#F0F5FF] border border-[#B8CCE8] rounded p-2 space-y-1.5">
              {/* Title row + actions */}
              <div className="flex items-center gap-1">
                <input
                  value={p.label}
                  onChange={(e) => updatePattern(p.id, { label: e.target.value })}
                  className="flex-1 min-w-0 text-xs font-black text-[#1E3A5F] bg-transparent outline-none border-b border-transparent focus:border-[#1E3A5F]"
                />
                <button
                  onClick={() => duplicatePattern(p.id)}
                  className="text-[#9C9490] hover:text-[#1E3A5F] cursor-pointer"
                  title="このパターンを複製"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={() => deletePattern(p.id)}
                  disabled={patterns.length <= 1}
                  className="text-[#9C9490] hover:text-rose-600 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  title="削除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              {/* Lot size */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-[#6B6057] font-bold shrink-0 w-10">基準数</span>
                <input
                  type="number"
                  value={p.baseLotSize || ''}
                  onChange={(e) => updatePattern(p.id, { baseLotSize: parseFloat(e.target.value) || 0 })}
                  className={inp}
                />
                <input
                  value={p.lotUnit}
                  onChange={(e) => updatePattern(p.id, { lotUnit: e.target.value })}
                  className="w-12 px-1 py-0.5 text-[10px] rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F]"
                />
              </div>
              {/* Freight per box override */}
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-[#6B6057] font-bold shrink-0 w-10">送料/箱</span>
                <input
                  type="number"
                  value={p.freightPerBox ?? ''}
                  placeholder={String(base.logistics.freightPerBox)}
                  onChange={(e) =>
                    updatePattern(p.id, {
                      freightPerBox: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                    })
                  }
                  className={inp}
                />
              </div>
              {/* ロット逓減率 badge */}
              {discountPct !== null && (
                <div className={`text-center text-[10px] font-black rounded px-1.5 py-0.5 ${discountPct < 0 ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'}`}>
                  最小ロット比 {pctFmt(discountPct)}
                </div>
              )}
              {p.id === refCalc.pattern.id && (
                <div className="text-center text-[9px] text-[#6B6057] font-bold">← 基準（最小ロット）</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Process table */}
      <div className="overflow-x-auto border border-[#D6D0C8] rounded bg-white">
        <table className="text-xs border-collapse min-w-full">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#18130F] text-white">
              <th className="px-2 py-1.5 text-left font-black border-r border-[#3A3028] sticky left-0 bg-[#18130F] z-20">#</th>
              <th className="px-2 py-1.5 text-left font-black border-r border-[#3A3028] sticky left-8 bg-[#18130F] z-20 min-w-[130px]">工程名</th>
              <th
                className="px-2 py-1.5 text-center font-black border-r border-[#3A3028] bg-[#1A6B3A] min-w-[68px] cursor-pointer select-none"
                title="クリックで詳細を折りたたみ"
                onClick={() => setShowProcessDetail((v) => !v)}
              >
                <span className="flex items-center justify-center gap-0.5">
                  {showProcessDetail ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  出来高<br /><span className="text-[8px] opacity-70">共通(個/h)</span>
                </span>
              </th>
              <th className="px-2 py-1.5 text-center font-black border-r border-[#5A4A3A] bg-[#1A6B3A] min-w-[68px]">
                段取<br /><span className="text-[8px] opacity-70">共通(h)</span>
              </th>
              {patterns.map((p) => (
                <th
                  key={p.id}
                  colSpan={2}
                  className="px-2 py-1.5 text-center font-black border-l-2 border-[#B5451B] bg-[#1E3A5F] min-w-[140px]"
                >
                  {p.label}
                  <br />
                  <span className="text-[8px] opacity-70 font-mono">
                    {p.baseLotSize.toLocaleString()}{p.lotUnit}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="bg-[#2A2018] text-[#C8C2B8] text-[9px]">
              <th className="border-r border-[#3A3028] sticky left-0 bg-[#2A2018] z-20" />
              <th className="border-r border-[#3A3028] sticky left-8 bg-[#2A2018] z-20" />
              <th className="border-r border-[#3A3028]" />
              <th className="border-r border-[#5A4A3A]" />
              {patterns.map((p) => (
                <React.Fragment key={p.id}>
                  <th className="px-1 py-1 text-center border-l-2 border-[#B5451B] font-bold">
                    {rateLabel(resolveProcessCalcMode(activeProcesses[0] || base.processes[0]))}
                  </th>
                  <th className="px-1 py-1 text-center font-bold">加工費/個</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeProcesses.length === 0 ? (
              <tr>
                <td
                  colSpan={4 + patterns.length * 2}
                  className="px-4 py-6 text-center text-[#9C9490] text-xs"
                >
                  工程が未入力です。Sheet1（新旧見開き調整ワークスペース）で工程を入力してから戻ってください。
                </td>
              </tr>
            ) : (
              activeProcesses.map((proc) => {
                const mode = resolveProcessCalcMode(proc);
                const isStd = mode === 'standard';
                return (
                  <tr key={proc.index} className="border-b border-[#EEEBE6] hover:bg-[#FAFAF8]">
                    <td className="px-2 py-1 text-[#9C9490] font-mono border-r border-[#EEEBE6] sticky left-0 bg-white">
                      {proc.index}
                    </td>
                    <td className="px-2 py-1 font-bold text-[#18130F] border-r border-[#EEEBE6] sticky left-8 bg-white">
                      {proc.processName}
                      <span className="ml-1 text-[8px] text-[#9C9490] font-mono">[{rateLabel(mode)}]</span>
                    </td>
                    {/* 共通: 出来高 */}
                    <td className="px-1 py-0.5 border-r border-[#EEEBE6] bg-[#F0FAF4]">
                      {isStd && showProcessDetail ? (
                        <input
                          type="number"
                          value={proc.yieldPerHour || ''}
                          onChange={(e) =>
                            updateSharedProcess(proc.index, 'yieldPerHour', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-1 py-0.5 text-xs font-mono rounded border border-[#A8D4BC] bg-white outline-none focus:ring-1 focus:border-[#1A6B3A] text-right"
                        />
                      ) : isStd ? (
                        <span className="block text-right text-xs font-mono pr-1 text-[#1A6B3A] font-bold">
                          {proc.yieldPerHour}
                        </span>
                      ) : (
                        <span className="block text-center text-[#C8C2B8]">—</span>
                      )}
                    </td>
                    {/* 共通: 段取 */}
                    <td className="px-1 py-0.5 border-r border-[#EEEBE6] bg-[#F0FAF4]">
                      {isStd && showProcessDetail ? (
                        <input
                          type="number"
                          value={proc.totalHours || ''}
                          onChange={(e) =>
                            updateSharedProcess(proc.index, 'totalHours', parseFloat(e.target.value) || 0)
                          }
                          className="w-full px-1 py-0.5 text-xs font-mono rounded border border-[#A8D4BC] bg-white outline-none focus:ring-1 focus:border-[#1A6B3A] text-right"
                        />
                      ) : isStd ? (
                        <span className="block text-right text-xs font-mono pr-1 text-[#1A6B3A] font-bold">
                          {proc.totalHours}
                        </span>
                      ) : (
                        <span className="block text-center text-[#C8C2B8]">—</span>
                      )}
                    </td>
                    {/* per-pattern */}
                    {calcs.map(({ pattern, calc }) => {
                      const r = pattern.processRates[proc.index] || {};
                      const rateVal =
                        mode === 'kg' ? r.kgPrice
                        : mode === 'lump' ? r.lumpSumPrice
                        : mode === 'direct' ? r.directProcessingCost
                        : r.hourlyRate;
                      const procCost =
                        calc.processCosts[base.processes.findIndex((bp) => bp.index === proc.index)] || 0;
                      // Show actual rate hint for standard processes
                      const actualRate =
                        mode === 'standard' ? (proc.actualHourlyRate ?? null) : null;
                      return (
                        <React.Fragment key={pattern.id}>
                          <td className="px-1 py-0.5 border-l-2 border-[#E8C8BC]">
                            <input
                              type="number"
                              value={rateVal ?? ''}
                              onChange={(e) =>
                                updatePatternRate(
                                  pattern.id,
                                  proc.index,
                                  mode,
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className={inp}
                            />
                            {actualRate !== null && (actualRate ?? 0) > 0 && (
                              <div className="text-[8px] text-[#9C9490] text-right font-mono mt-0.5">
                                実態: ¥{actualRate.toLocaleString()}
                              </div>
                            )}
                          </td>
                          <td className="px-1 py-1 text-right font-mono text-[#1E3A5F] font-bold">
                            {yenFmt(procCost)}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Summary footer */}
          <tfoot className="bg-[#FAFAF8] text-xs border-t-2 border-[#D6D0C8]">
            {(
              [
                ['材料費/個', (c: ReturnType<typeof calculateEstimate>) => yenFmt(c.netMaterialCost)],
                ['加工費合計', (c: ReturnType<typeof calculateEstimate>) => yenFmt(c.totalProcessCost)],
                ['直製造原価', (c: ReturnType<typeof calculateEstimate>) => yenFmt(c.primeCost)],
                ['送料/個', (c: ReturnType<typeof calculateEstimate>) => yenFmt(c.shippingCostPerUnit)],
              ] as const
            ).map(([label, fn]) => (
              <tr key={label} className="border-b border-[#EEEBE6]">
                <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">
                  {label}
                </td>
                {calcs.map(({ pattern, calc }) => (
                  <td
                    key={pattern.id}
                    colSpan={2}
                    className="px-2 py-1 text-right font-mono text-[#18130F] border-l-2 border-[#E8C8BC]"
                  >
                    {fn(calc)}
                  </td>
                ))}
              </tr>
            ))}

            {/* 利管費率 (editable) */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">
                利管費率 (%)
              </td>
              {patterns.map((p) => (
                <td key={p.id} colSpan={2} className="px-2 py-1 border-l-2 border-[#E8C8BC]">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() =>
                        updatePattern(p.id, {
                          sgaCalcMode: (p.sgaCalcMode || 'markup') === 'markup' ? 'margin' : 'markup',
                        })
                      }
                      className={`text-[8px] font-black px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                        (p.sgaCalcMode || 'markup') === 'markup'
                          ? 'bg-[#FEF0EB] text-[#B5451B] border-[#E8C8BC]'
                          : 'bg-[#EFF4FD] text-[#1E3A5F] border-[#B8CCE8]'
                      }`}
                    >
                      {(p.sgaCalcMode || 'markup') === 'markup' ? '外掛' : '内掛'}
                    </button>
                    <input
                      type="number"
                      value={p.sgaRatePercent || ''}
                      step="0.01"
                      onChange={(e) => updatePattern(p.id, { sgaRatePercent: parseFloat(e.target.value) || 0 })}
                      className="w-16 px-1 py-0.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F] text-right"
                    />
                  </div>
                </td>
              ))}
            </tr>

            {/* 積み上げ単価 — prominent */}
            <tr className="border-b-2 border-[#D6D0C8] bg-[#EEF3FB]">
              <td colSpan={4} className="px-2 py-2 text-right font-black text-[#1E3A5F] text-sm sticky left-0 bg-[#EEF3FB]">
                積み上げ単価
              </td>
              {calcs.map(({ pattern, calc }) => (
                <td
                  key={pattern.id}
                  colSpan={2}
                  className="px-2 py-2 text-right font-mono font-black text-[#1E3A5F] text-sm border-l-2 border-[#E8C8BC]"
                >
                  {yenFmt(calc.grandTotalUnitPrice)}
                </td>
              ))}
            </tr>

            {/* ロット逓減率 (vs 最小ロット) */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">
                最小ロット比
              </td>
              {calcs.map(({ pattern, calc }) => {
                if (pattern.id === refCalc.pattern.id || refPrice <= 0) {
                  return (
                    <td key={pattern.id} colSpan={2} className="px-2 py-1 text-right font-mono text-[#9C9490] border-l-2 border-[#E8C8BC]">
                      基準
                    </td>
                  );
                }
                const pct = calc.grandTotalUnitPrice > 0 ? ((calc.grandTotalUnitPrice - refPrice) / refPrice) * 100 : null;
                return (
                  <td
                    key={pattern.id}
                    colSpan={2}
                    className={`px-2 py-1 text-right font-mono font-black border-l-2 border-[#E8C8BC] ${
                      pct === null ? 'text-[#9C9490]' : pct < 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {pct === null ? '—' : pctFmt(pct)}
                  </td>
                );
              })}
            </tr>

            {/* 目標単価 (editable) */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">
                目標単価
              </td>
              {patterns.map((p) => (
                <td key={p.id} colSpan={2} className="px-2 py-1 border-l-2 border-[#E8C8BC]">
                  <input
                    type="number"
                    value={p.targetUnitPrice || ''}
                    onChange={(e) => updatePattern(p.id, { targetUnitPrice: parseFloat(e.target.value) || 0 })}
                    className={inp}
                  />
                </td>
              ))}
            </tr>

            {/* 差額(辻褄) */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-black text-[#18130F] sticky left-0 bg-[#FAFAF8]">
                差額(辻褄)
              </td>
              {calcs.map(({ pattern, calc }) => {
                const diff =
                  pattern.targetUnitPrice > 0 ? calc.grandTotalUnitPrice - pattern.targetUnitPrice : null;
                const cls =
                  diff === null
                    ? 'text-[#9C9490]'
                    : Math.abs(diff) < 0.5
                    ? 'text-emerald-700'
                    : diff > 0
                    ? 'text-rose-600'
                    : 'text-amber-700';
                return (
                  <td
                    key={pattern.id}
                    colSpan={2}
                    className={`px-2 py-1 text-right font-mono font-black border-l-2 border-[#E8C8BC] ${cls}`}
                  >
                    {diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                  </td>
                );
              })}
            </tr>

            {/* 整合ボタン + 残差警告 */}
            <tr>
              <td colSpan={4} className="px-2 py-1.5 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">
                辻褄合わせ
              </td>
              {patterns.map((p) => {
                const w = warnings[p.id];
                return (
                  <td key={p.id} colSpan={2} className="px-2 py-1.5 border-l-2 border-[#E8C8BC]">
                    <button
                      onClick={() => reconcileOne(p.id)}
                      className="w-full bg-[#18130F] hover:bg-[#B5451B] text-white font-black text-[10px] py-1 rounded inline-flex items-center justify-center gap-1 cursor-pointer transition-all"
                    >
                      <Zap className="w-3 h-3 text-[#F8C9BB]" /> 一発整合
                    </button>
                    {w !== undefined &&
                      (Number.isNaN(w) ? (
                        <div className="mt-0.5 text-[8px] text-rose-600 font-bold text-center">
                          目標単価を入力してください
                        </div>
                      ) : Math.abs(w) >= 1 ? (
                        <div className="mt-0.5 text-[8px] text-amber-700 font-bold text-center flex items-center justify-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          残差{w > 0 ? '+' : ''}
                          {w.toFixed(1)}円 — 前提見直しが必要
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[8px] text-emerald-700 font-bold text-center">✓ 整合済</div>
                      ))}
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
          <strong className="text-[#1A6B3A]">出来高・段取時間（緑列）は全パターン共通</strong> — 生産前提として固定。編集すると全パターンに即時反映。
          <strong className="text-[#1E3A5F]"> 賃率のみ数量により調整可能</strong>。
          残差が1円以上残る場合は賃率だけでは辻褄が合わないサインです — 出来高・段取の前提自体を見直してください。
        </span>
      </div>
    </div>
  );
};
