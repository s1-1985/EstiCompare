import React, { useState } from 'react';
import { DetailedEstimate, QuantityPattern, PatternProcessRate, ImportSource, ProcessCalcMode } from '../types';
import {
  calculateEstimate,
  applyPatternOverride,
  createBlankPattern,
  resolveProcessCalcMode,
  calcProcessBreakdown,
  costFromSell,
  rateFromCostSell,
} from '../utils/calculations';
import { Plus, Trash2, Zap, Layers, AlertTriangle, Info, Copy, Download, FilePlus } from 'lucide-react';

interface MultiPatternSheetProps {
  base: DetailedEstimate;
  patterns: QuantityPattern[];
  onBaseChange: (updater: (prev: DetailedEstimate) => DetailedEstimate) => void;
  onPatternsChange: (patterns: QuantityPattern[]) => void;
  onNew?: () => void;                              // 複数Lot見積を新規作成（白紙化）
  importSources?: ImportSource[];                  // 他機能・ライブラリからの品番取込ソース
  onImport?: (estimate: DetailedEstimate) => void; // ベース品番を差し替える
}

const SGA_MIN = 5;
const SGA_MAX = 25;
const MAX_PATTERNS = 20;
const MODES: ProcessCalcMode[] = ['standard', 'kg', 'lump', 'direct'];

const yenFmt = (v: number) =>
  `¥${v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pctFmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;

const rateLabel = (mode: string) =>
  mode === 'kg' ? 'kg単価' : mode === 'lump' ? '一式/lot' : mode === 'direct' ? '直接費' : '賃率(円/h)';

const modeBadge = (mode: string) =>
  mode === 'kg' ? 'kg' : mode === 'lump' ? '一式' : mode === 'direct' ? '直接' : '賃率';

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
  // (calculateEstimate adds sgaFixed on top of sgaBase, so subtract it here)
  const Y = target - shipping - other - sgaFixed;
  if (Y <= 0) return { pattern, residual: target - calc.grandTotalUnitPrice };

  const materialCost = calc.netMaterialCost;
  // 未設定(0)のときは下限5%に張り付かせず中庸値15%を起点にする（新旧比較の一発整合と同じ）
  let sgaPercent = Math.min(SGA_MAX, Math.max(SGA_MIN, pattern.sgaRatePercent || 15));
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
  let finalPattern: QuantityPattern = { ...pattern, processRates: newRates, sgaRatePercent: sgaPercent };
  let finalCalc = calculateEstimate(applyPatternOverride(base, finalPattern));
  let residual = finalCalc.grandTotalUnitPrice - target;
  // 1円未満の端数（賃率100円丸め・SGA率2桁丸めの累積）は利管費固定調整で消し込み、
  // 積算合計＝目標単価を厳密一致させる（新旧比較の一発整合と同じ挙動）。
  if (Math.abs(residual) > 0 && Math.abs(residual) < 1) {
    finalPattern = {
      ...finalPattern,
      sgaFixedAdjustment: Math.round((sgaFixed - residual) * 100) / 100,
    };
    finalCalc = calculateEstimate(applyPatternOverride(base, finalPattern));
    residual = finalCalc.grandTotalUnitPrice - target;
  }
  return { pattern: finalPattern, residual };
}

export const MultiPatternSheet: React.FC<MultiPatternSheetProps> = ({
  base,
  patterns,
  onBaseChange,
  onPatternsChange,
  onNew,
  importSources = [],
  onImport,
}) => {
  const [warnings, setWarnings] = useState<Record<string, number>>({});
  const [importOpen, setImportOpen] = useState(false);

  const namedProcesses = base.processes.filter((p) => p.processName.trim() !== '');
  const firstBlank = base.processes.find((p) => p.processName.trim() === '');
  // spreadsheet風: 入力済み工程 + 末尾に1行の空入力行（独立した工程入力フォーム）
  const inputRows = firstBlank ? [...namedProcesses, firstBlank] : namedProcesses;
  const minProfitRate = base.adjustments.minProfitRate || 0;

  const clearWarn = (id: string) =>
    setWarnings((w) => { const n = { ...w }; delete n[id]; return n; });

  // 品番・材料・下限利益率はサイドバー側（共通諸元の置換）で編集する。
  // 工程（出来高・段取・賃率・モード）はこのシート内で直接編集する。

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

  const updateSharedProcess = (
    procIndex: number,
    key: 'yieldPerHour' | 'totalHours' | 'processName' | 'calcMode',
    value: number | string,
  ) => {
    setWarnings({});
    onBaseChange((prev) => ({
      ...prev,
      processes: prev.processes.map((p) => (p.index === procIndex ? { ...p, [key]: value } : p)),
    }));
  };

  const cycleMode = (proc: { index: number }, current: ProcessCalcMode) =>
    updateSharedProcess(proc.index, 'calcMode', MODES[(MODES.indexOf(current) + 1) % MODES.length]);

  const addProcessRow = () =>
    onBaseChange((prev) => ({
      ...prev,
      processes: [
        ...prev.processes,
        { index: prev.processes.length + 1, processName: '', workContent: '', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 },
      ],
    }));

  const deleteProcessRow = (procIndex: number) => {
    setWarnings({});
    onBaseChange((prev) => ({
      ...prev,
      processes: prev.processes.map((p) =>
        p.index === procIndex
          ? { ...p, processName: '', workContent: '', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, lumpSumPrice: 0, directProcessingCost: 0, calcMode: undefined }
          : p,
      ),
    }));
    // remove this index from every pattern's overrides
    onPatternsChange(patterns.map((p) => {
      if (!(procIndex in p.processRates)) return p;
      const next = { ...p.processRates };
      delete next[procIndex];
      return { ...p, processRates: next };
    }));
  };

  const addPattern = () => {
    if (patterns.length >= MAX_PATTERNS) {
      alert(`Lotパターンは最大${MAX_PATTERNS}件まで登録できます。`);
      return;
    }
    onPatternsChange([...patterns, createBlankPattern(`パターン${patterns.length + 1}`, base.lotUnit || '個', patterns.length)]);
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

  // merged estimate per pattern (gives per-pattern overridden rates) + full calc
  const calcs = patterns.map((p) => {
    const merged = applyPatternOverride(base, p);
    return { pattern: p, merged, calc: calculateEstimate(merged) };
  });

  // ロット逓減率: 最小ロット（最高単価）を基準に各パターンの差を計算
  const refCalc = calcs.length
    ? calcs.reduce((ref, c) => (c.pattern.baseLotSize < ref.pattern.baseLotSize ? c : ref), calcs[0])
    : null;
  const refPrice = refCalc ? refCalc.calc.grandTotalUnitPrice : 0;

  // per-process breakdown lookup
  const breakdownFor = (procIndex: number, c: typeof calcs[number]) => {
    const mp = c.merged.processes.find((x) => x.index === procIndex);
    return mp ? calcProcessBreakdown(mp, c.merged.baseLotSize) : { cycle: 0, setup: 0, total: 0 };
  };

  // 実態利益率（内掛け）: 仕入実費が入っていれば直接、無ければ実態原価から
  const actualMarginFor = (c: typeof calcs[number]): number | null => {
    const cost = (c.pattern.actualPurchasePrice && c.pattern.actualPurchasePrice > 0)
      ? c.pattern.actualPurchasePrice
      : c.calc.actualTotalCost;
    const sell = c.calc.grandTotalUnitPrice;
    return cost > 0 && sell > 0 ? rateFromCostSell(cost, sell, 'margin') : null;
  };

  // 帳尻利管費率: primeCost を原価、(目標−送料−調整) を売価として現方式で算出
  const reconcileRateFor = (c: typeof calcs[number]): number | null => {
    const sell = c.pattern.targetUnitPrice || 0;
    const primeCost = c.calc.primeCost;
    if (sell <= 0 || primeCost <= 0) return null;
    const baseSell = sell - c.calc.shippingCostPerUnit - (c.pattern.otherAdjustment || 0) - (c.pattern.sgaFixedAdjustment || 0);
    if (baseSell <= 0) return null;
    const mode = c.pattern.sgaCalcMode || base.adjustments.sgaCalcMode || 'markup';
    return rateFromCostSell(primeCost, baseSell, mode);
  };

  const SUB = 3; // sub-columns per pattern: 賃率 | 段取費/個 | 計/個
  const colCount = 4 + patterns.length * SUB;

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#1E3A5F]" />
          <div>
            <h2 className="text-sm font-black text-[#18130F]">複数Lot見積</h2>
            <p className="text-[10px] text-[#9C9490] font-mono">
              {base.partNumber || '(品番未設定)'}{base.partName ? ` / ${base.partName}` : ''} — {patterns.length}Lot
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {onNew && (
            <button
              onClick={onNew}
              className="bg-white border border-[#D6D0C8] text-[#6B6057] hover:bg-[#F0EDE8] font-black text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 cursor-pointer transition-all"
              title="複数Lot見積を白紙から新規作成"
            >
              <FilePlus className="w-3.5 h-3.5" /> 新規作成
            </button>
          )}
          {onImport && importSources.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setImportOpen((v) => !v)}
                className="bg-white border border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#EFF4FD] font-black text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 cursor-pointer transition-all"
                title="他機能・ライブラリの品番データをベースに取り込む"
              >
                <Download className="w-3.5 h-3.5" /> 品番取込
              </button>
              {importOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setImportOpen(false)} />
                  <div className="absolute z-30 mt-1 right-0 w-72 max-h-72 overflow-y-auto bg-white border border-[#D6D0C8] rounded shadow-lg text-left">
                    {importSources.map((src) => (
                      <button
                        key={src.id}
                        onClick={() => { onImport(JSON.parse(JSON.stringify(src.estimate))); setImportOpen(false); }}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[#EFF4FD] cursor-pointer border-b border-[#EEEBE6]"
                      >
                        <span className="text-[8px] font-black text-[#1E3A5F] bg-[#EFF4FD] rounded px-1 mr-1">{src.group}</span>
                        <span className="font-bold text-[#18130F]">{src.label || '(品番未設定)'}</span>
                        {src.subLabel && <span className="block text-[#9C9490] truncate">{src.subLabel}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={reconcileAll}
            className="bg-[#18130F] hover:bg-[#B5451B] text-white font-black text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 cursor-pointer transition-all"
          >
            <Zap className="w-3.5 h-3.5 text-[#F8C9BB]" /> 全Lot整合
          </button>
          <button
            onClick={addPattern}
            className="bg-white border border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#EFF4FD] font-black text-xs px-3 py-1.5 rounded inline-flex items-center gap-1 cursor-pointer transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Lot追加
          </button>
        </div>
      </div>

      {/* 基本諸元（品番・材料・下限利益率）は左サイドバー（共通諸元の置換）で入力する */}

      {patterns.length === 0 ? (
        <div className="bg-white border border-dashed border-[#D6D0C8] rounded p-6 text-center">
          <p className="text-xs text-[#6B6057] mb-3">Lotパターンがありません。「Lot追加」で見積数量パターンを作成してください。</p>
          <button onClick={addPattern} className="bg-[#1E3A5F] hover:bg-[#2A4A7F] text-white px-4 py-2 rounded font-black text-xs inline-flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Lotを追加
          </button>
        </div>
      ) : (
      <>
      {/* Pattern config cards */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {calcs.map((c) => {
          const p = c.pattern;
          const calc = c.calc;
          const grandTotal = calc.grandTotalUnitPrice;
          const discountPct = refCalc && refPrice > 0 && grandTotal > 0 && p.id !== refCalc.pattern.id
            ? ((grandTotal - refPrice) / refPrice) * 100
            : null;
          const setupTotal = namedProcesses.reduce((s, proc) => s + breakdownFor(proc.index, c).setup, 0);
          return (
            <div key={p.id} className="flex-none w-48 bg-[#F0F5FF] border border-[#B8CCE8] rounded p-2 space-y-1.5">
              <div className="flex items-center gap-1">
                <input
                  value={p.label}
                  onChange={(e) => updatePattern(p.id, { label: e.target.value })}
                  className="flex-1 min-w-0 text-xs font-black text-[#1E3A5F] bg-transparent outline-none border-b border-transparent focus:border-[#1E3A5F]"
                />
                <button onClick={() => duplicatePattern(p.id)} className="text-[#9C9490] hover:text-[#1E3A5F] cursor-pointer" title="このLotを複製">
                  <Copy className="w-3 h-3" />
                </button>
                <button onClick={() => deletePattern(p.id)} className="text-[#9C9490] hover:text-rose-600 cursor-pointer" title="削除">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-[#6B6057] font-bold shrink-0 w-10">基準数</span>
                <input
                  type="number"
                  value={p.baseLotSize || ''}
                  placeholder="数量"
                  onChange={(e) => updatePattern(p.id, { baseLotSize: parseFloat(e.target.value) || 0 })}
                  className={inp}
                />
                <input
                  value={p.lotUnit}
                  onChange={(e) => updatePattern(p.id, { lotUnit: e.target.value })}
                  className="w-12 px-1 py-0.5 text-[10px] rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F]"
                />
              </div>
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
              <div className="flex items-center justify-between text-[9px] bg-white/70 rounded px-1.5 py-0.5 border border-[#E8C8BC]">
                <span className="text-[#B5451B] font-bold">段取費/個</span>
                <span className="font-mono font-black text-[#B5451B]">{yenFmt(setupTotal)}</span>
              </div>
              {discountPct !== null && (
                <div className={`text-center text-[10px] font-black rounded px-1.5 py-0.5 ${discountPct < 0 ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-rose-100 text-rose-700 border border-rose-300'}`}>
                  最小ロット比 {pctFmt(discountPct)}
                </div>
              )}
              {refCalc && p.id === refCalc.pattern.id && (
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
              <th className="px-2 py-1.5 text-left font-black border-r border-[#3A3028] sticky left-8 bg-[#18130F] z-20 min-w-[150px]">工程名</th>
              <th className="px-2 py-1.5 text-center font-black border-r border-[#3A3028] bg-[#1A6B3A] min-w-[64px]">
                出来高<br /><span className="text-[8px] opacity-70">共通(個/h)</span>
              </th>
              <th className="px-2 py-1.5 text-center font-black border-r border-[#5A4A3A] bg-[#1A6B3A] min-w-[64px]">
                段取<br /><span className="text-[8px] opacity-70">共通(h)</span>
              </th>
              {patterns.map((p) => (
                <th key={p.id} colSpan={SUB} className="px-2 py-1.5 text-center font-black border-l-2 border-[#B5451B] bg-[#1E3A5F] min-w-[180px]">
                  {p.label}
                  <br />
                  <span className="text-[8px] opacity-70 font-mono">
                    {(p.baseLotSize || 0).toLocaleString()}{p.lotUnit}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="bg-[#2A2018] text-[#C8C2B8] text-[9px]">
              <th className="border-r border-[#3A3028] sticky left-0 bg-[#2A2018] z-20" />
              <th className="border-r border-[#3A3028] sticky left-8 bg-[#2A2018] z-20" />
              <th className="border-r border-[#3A3028]" />
              <th className="border-r border-[#5A4A3A]" />
              {patterns.map((p) => {
                const modes = new Set(namedProcesses.map((pr) => resolveProcessCalcMode(pr)));
                const headerLabel = modes.size === 1 ? rateLabel([...modes][0] as string) : '賃率/単価';
                return (
                  <React.Fragment key={p.id}>
                    <th className="px-1 py-1 text-center border-l-2 border-[#B5451B] font-bold">{headerLabel}</th>
                    <th className="px-1 py-1 text-center font-bold text-[#F8C9BB]">段取費/個</th>
                    <th className="px-1 py-1 text-center font-bold">加工費/個</th>
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {inputRows.map((proc) => {
              const isBlank = proc.processName.trim() === '';
              const mode = resolveProcessCalcMode(proc);
              const isStd = mode === 'standard';
              return (
                <tr key={proc.index} className={`border-b border-[#EEEBE6] hover:bg-[#FAFAF8] ${isBlank ? 'bg-[#FCFCFA]' : ''}`}>
                  <td className="px-2 py-1 text-[#9C9490] font-mono border-r border-[#EEEBE6] sticky left-0 bg-white">
                    {isBlank ? '+' : proc.index}
                  </td>
                  <td className="px-2 py-1 font-bold text-[#18130F] border-r border-[#EEEBE6] sticky left-8 bg-white">
                    <div className="flex items-center gap-1">
                      <input
                        value={proc.processName}
                        onChange={(e) => updateSharedProcess(proc.index, 'processName', e.target.value)}
                        placeholder={isBlank ? '＋ 工程名を入力' : ''}
                        className="flex-1 min-w-0 bg-transparent outline-none border-b border-transparent focus:border-[#1E3A5F] font-bold"
                      />
                      <button
                        onClick={() => cycleMode(proc, mode)}
                        className="text-[8px] font-black px-1 py-0.5 rounded border border-[#D6D0C8] bg-[#F0EDE8] text-[#6B6057] hover:bg-[#E5E0D8] cursor-pointer shrink-0"
                        title="計算モード切替（賃率/kg単価/一式/直接費）"
                      >
                        {modeBadge(mode)}
                      </button>
                      {!isBlank && (
                        <button onClick={() => deleteProcessRow(proc.index)} className="text-[#C8C2B8] hover:text-rose-500 cursor-pointer shrink-0" title="この工程を削除">
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-1 py-0.5 border-r border-[#EEEBE6] bg-[#F0FAF4]">
                    {isStd ? (
                      <input type="number" value={proc.yieldPerHour || ''} onChange={(e) => updateSharedProcess(proc.index, 'yieldPerHour', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 text-xs font-mono rounded border border-[#A8D4BC] bg-white outline-none focus:ring-1 focus:border-[#1A6B3A] text-right" />
                    ) : (
                      <span className="block text-center text-[#C8C2B8]">—</span>
                    )}
                  </td>
                  <td className="px-1 py-0.5 border-r border-[#EEEBE6] bg-[#F0FAF4]">
                    {isStd ? (
                      <input type="number" value={proc.totalHours || ''} onChange={(e) => updateSharedProcess(proc.index, 'totalHours', parseFloat(e.target.value) || 0)} className="w-full px-1 py-0.5 text-xs font-mono rounded border border-[#A8D4BC] bg-white outline-none focus:ring-1 focus:border-[#1A6B3A] text-right" />
                    ) : (
                      <span className="block text-center text-[#C8C2B8]">—</span>
                    )}
                  </td>
                  {calcs.map((c) => {
                    const { pattern } = c;
                    const r = pattern.processRates[proc.index] || {};
                    const rateVal =
                      mode === 'kg' ? r.kgPrice
                      : mode === 'lump' ? r.lumpSumPrice
                      : mode === 'direct' ? r.directProcessingCost
                      : r.hourlyRate;
                    const bd = breakdownFor(proc.index, c);
                    const realCost = c.calc.processCosts[c.merged.processes.findIndex((bp) => bp.index === proc.index)] || 0;
                    const showSetup = mode === 'standard' || mode === 'lump';
                    return (
                      <React.Fragment key={pattern.id}>
                        <td className="px-1 py-0.5 border-l-2 border-[#E8C8BC]">
                          <input
                            type="number"
                            value={rateVal ?? ''}
                            disabled={isBlank}
                            onChange={(e) => updatePatternRate(pattern.id, proc.index, mode, parseFloat(e.target.value) || 0)}
                            className={`${inp} ${isBlank ? 'opacity-40' : ''} ${mode === 'standard' && typeof rateVal === 'number' && rateVal > 0 && rateVal % 100 !== 0 ? 'border-amber-400 bg-amber-50' : ''}`}
                            title={mode === 'standard' && typeof rateVal === 'number' && rateVal > 0 && rateVal % 100 !== 0 ? '賃率は100円単位が自然です（端数は逆算で盛った証拠として客に疑われます）' : undefined}
                          />
                        </td>
                        <td className="px-1 py-1 text-right font-mono text-[#B5451B] bg-[#FFF8F0] font-bold">
                          {isBlank ? '—' : showSetup ? yenFmt(bd.setup) : '—'}
                        </td>
                        <td className="px-1 py-1 text-right font-mono text-[#1E3A5F] font-bold">
                          {isBlank ? '—' : yenFmt(realCost)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
            {!firstBlank && (
              <tr>
                <td colSpan={colCount} className="px-2 py-1.5 text-center">
                  <button onClick={addProcessRow} className="text-[10px] text-[#1E3A5F] font-bold hover:underline cursor-pointer inline-flex items-center gap-0.5">
                    <Plus className="w-3 h-3" /> 工程行を追加
                  </button>
                </td>
              </tr>
            )}
          </tbody>

          {/* Summary footer */}
          <tfoot className="bg-[#FAFAF8] text-xs border-t-2 border-[#D6D0C8]">
            <tr className="border-b border-[#EEEBE6] bg-[#FFF3EA]">
              <td colSpan={4} className="px-2 py-1 text-right font-black text-[#B5451B] sticky left-0 bg-[#FFF3EA]">段取費合計/個</td>
              {calcs.map((c) => {
                const setupTotal = namedProcesses.reduce((s, proc) => s + breakdownFor(proc.index, c).setup, 0);
                return (
                  <td key={c.pattern.id} colSpan={SUB} className="px-2 py-1 text-right font-mono font-black text-[#B5451B] border-l-2 border-[#E8C8BC]">{yenFmt(setupTotal)}</td>
                );
              })}
            </tr>

            {(
              [
                ['材料費/個', (c: ReturnType<typeof calculateEstimate>) => yenFmt(c.netMaterialCost)],
                ['加工費合計/個', (c: ReturnType<typeof calculateEstimate>) => yenFmt(c.totalProcessCost)],
                ['直製造原価/個', (c: ReturnType<typeof calculateEstimate>) => yenFmt(c.primeCost)],
                ['送料/個', (c: ReturnType<typeof calculateEstimate>) => yenFmt(c.shippingCostPerUnit)],
              ] as const
            ).map(([label, fn]) => (
              <tr key={label} className="border-b border-[#EEEBE6]">
                <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">{label}</td>
                {calcs.map(({ pattern, calc }) => (
                  <td key={pattern.id} colSpan={SUB} className="px-2 py-1 text-right font-mono text-[#18130F] border-l-2 border-[#E8C8BC]">{fn(calc)}</td>
                ))}
              </tr>
            ))}

            {/* 利管費率 (editable) */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">利管費率 (%)</td>
              {patterns.map((p) => (
                <td key={p.id} colSpan={SUB} className="px-2 py-1 border-l-2 border-[#E8C8BC]">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => updatePattern(p.id, { sgaCalcMode: (p.sgaCalcMode || 'markup') === 'markup' ? 'margin' : 'markup' })}
                      className={`text-[8px] font-black px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${(p.sgaCalcMode || 'markup') === 'markup' ? 'bg-[#FEF0EB] text-[#B5451B] border-[#E8C8BC]' : 'bg-[#EFF4FD] text-[#1E3A5F] border-[#B8CCE8]'}`}
                    >
                      {(p.sgaCalcMode || 'markup') === 'markup' ? '外掛' : '内掛'}
                    </button>
                    <input type="number" value={p.sgaRatePercent || ''} step="0.01" onChange={(e) => updatePattern(p.id, { sgaRatePercent: parseFloat(e.target.value) || 0 })} className="w-16 px-1 py-0.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F] text-right" />
                  </div>
                </td>
              ))}
            </tr>

            {/* 積み上げ単価 — prominent */}
            <tr className="border-b-2 border-[#D6D0C8] bg-[#EEF3FB]">
              <td colSpan={4} className="px-2 py-2 text-right font-black text-[#1E3A5F] text-sm sticky left-0 bg-[#EEF3FB]">積み上げ単価</td>
              {calcs.map(({ pattern, calc }) => (
                <td key={pattern.id} colSpan={SUB} className="px-2 py-2 text-right font-mono font-black text-[#1E3A5F] text-sm border-l-2 border-[#E8C8BC]">{yenFmt(calc.grandTotalUnitPrice)}</td>
              ))}
            </tr>

            {/* 仕入実費 (editable) */}
            <tr className="border-b border-[#EEEBE6] bg-[#FCFBF9]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FCFBF9]">仕入実費/個</td>
              {calcs.map((c) => (
                <td key={c.pattern.id} colSpan={SUB} className="px-2 py-1 border-l-2 border-[#E8C8BC]">
                  <input
                    type="number"
                    value={c.pattern.actualPurchasePrice ?? ''}
                    placeholder={c.calc.actualTotalCost > 0 ? c.calc.actualTotalCost.toFixed(2) : '実態原価'}
                    onChange={(e) => updatePattern(c.pattern.id, { actualPurchasePrice: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 })}
                    className={inp}
                  />
                </td>
              ))}
            </tr>

            {/* 実態利益率（内掛け） */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">実態利益率（内掛け）</td>
              {calcs.map((c) => {
                const rate = actualMarginFor(c);
                const below = rate !== null && minProfitRate > 0 && rate < minProfitRate;
                const cls = rate === null ? 'text-[#9C9490]' : below ? 'text-rose-600' : 'text-emerald-700';
                return (
                  <td key={c.pattern.id} colSpan={SUB} className={`px-2 py-1 text-right font-mono font-black border-l-2 border-[#E8C8BC] ${cls}`}>
                    {rate === null ? '—' : `${rate.toFixed(1)}%`}
                    {below && <AlertTriangle className="w-2.5 h-2.5 inline ml-0.5 -mt-0.5" />}
                  </td>
                );
              })}
            </tr>

            {/* 最小ロット比 */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">最小ロット比</td>
              {calcs.map(({ pattern, calc }) => {
                if (!refCalc || pattern.id === refCalc.pattern.id || refPrice <= 0) {
                  return <td key={pattern.id} colSpan={SUB} className="px-2 py-1 text-right font-mono text-[#9C9490] border-l-2 border-[#E8C8BC]">基準</td>;
                }
                const pct = calc.grandTotalUnitPrice > 0 ? ((calc.grandTotalUnitPrice - refPrice) / refPrice) * 100 : null;
                return (
                  <td key={pattern.id} colSpan={SUB} className={`px-2 py-1 text-right font-mono font-black border-l-2 border-[#E8C8BC] ${pct === null ? 'text-[#9C9490]' : pct < 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {pct === null ? '—' : pctFmt(pct)}
                  </td>
                );
              })}
            </tr>

            {/* 目標単価 (editable) */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">目標単価（現行単価）</td>
              {patterns.map((p) => (
                <td key={p.id} colSpan={SUB} className="px-2 py-1 border-l-2 border-[#E8C8BC]">
                  <input type="number" value={p.targetUnitPrice || ''} onChange={(e) => updatePattern(p.id, { targetUnitPrice: parseFloat(e.target.value) || 0 })} className={inp} />
                </td>
              ))}
            </tr>

            {/* 帳尻利管費率 */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">帳尻利管費率</td>
              {calcs.map((c) => {
                const rate = reconcileRateFor(c);
                const mode = c.pattern.sgaCalcMode || base.adjustments.sgaCalcMode || 'markup';
                const bad = rate !== null && (rate < SGA_MIN || rate > SGA_MAX);
                const cls = rate === null ? 'text-[#9C9490]' : bad ? 'text-rose-600' : 'text-[#1E3A5F]';
                return (
                  <td key={c.pattern.id} colSpan={SUB} className={`px-2 py-1 text-right font-mono font-bold border-l-2 border-[#E8C8BC] ${cls}`}>
                    {rate === null ? '—' : `${rate.toFixed(2)}% ${mode === 'markup' ? '外' : '内'}`}
                  </td>
                );
              })}
            </tr>

            {/* 積み上げ vs 目標 */}
            <tr className="border-b border-[#EEEBE6]">
              <td colSpan={4} className="px-2 py-1 text-right font-black text-[#18130F] sticky left-0 bg-[#FAFAF8]">積み上げ vs 目標</td>
              {calcs.map(({ pattern, calc }) => {
                const diff = pattern.targetUnitPrice > 0 ? calc.grandTotalUnitPrice - pattern.targetUnitPrice : null;
                const balanced = diff !== null && Math.abs(diff) < 0.5;
                const cls = diff === null ? 'text-[#9C9490]' : balanced ? 'text-emerald-700' : diff > 0 ? 'text-rose-600' : 'text-amber-700';
                return (
                  <td key={pattern.id} colSpan={SUB} className={`px-2 py-1 text-right font-mono font-black border-l-2 border-[#E8C8BC] ${cls}`}>
                    {diff === null ? '—' : balanced ? '✓ 整合' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                  </td>
                );
              })}
            </tr>

            {/* 一発整合 + 残差 */}
            <tr>
              <td colSpan={4} className="px-2 py-1.5 text-right font-bold text-[#6B6057] sticky left-0 bg-[#FAFAF8]">辻褄合わせ</td>
              {patterns.map((p) => {
                const w = warnings[p.id];
                return (
                  <td key={p.id} colSpan={SUB} className="px-2 py-1.5 border-l-2 border-[#E8C8BC]">
                    <button onClick={() => reconcileOne(p.id)} className="w-full bg-[#18130F] hover:bg-[#B5451B] text-white font-black text-[10px] py-1 rounded inline-flex items-center justify-center gap-1 cursor-pointer transition-all">
                      <Zap className="w-3 h-3 text-[#F8C9BB]" /> 一発整合
                    </button>
                    {w !== undefined &&
                      (Number.isNaN(w) ? (
                        <div className="mt-0.5 text-[8px] text-rose-600 font-bold text-center">目標単価を入力してください</div>
                      ) : Math.abs(w) >= 1 ? (
                        <div className="mt-0.5 text-[8px] text-amber-700 font-bold text-center flex items-center justify-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          残差{w > 0 ? '+' : ''}{w.toFixed(1)}円 — 前提見直しが必要
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
      </>
      )}

      <div className="flex items-start gap-1.5 text-[10px] text-[#6B6057] bg-[#FFF8F0] border border-[#E8C8BC] rounded p-2">
        <Info className="w-3.5 h-3.5 text-[#B5451B] shrink-0 mt-0.5" />
        <span>
          <strong className="text-[#B5451B]">段取費/個（橙列）＝ 賃率 × 段取時間 ÷ ロット数</strong> がロットで逓減 ＝ これが数量で単価が変わる本体です。
          出来高・段取時間（緑列）は全Lot共通の生産前提。賃率は数量により調整可だが<strong className="text-[#B5451B]">100円単位</strong>が自然（端数は琥珀色で警告）。
          仕入実費を入力すると<strong className="text-[#B5451B]">実態利益率</strong>が表示され、下限利益率を下回ると赤く警告します。
          残差が1円以上残る場合は賃率だけでは辻褄が合わないサイン — 出来高・段取の前提自体を見直してください。
        </span>
      </div>
    </div>
  );
};
