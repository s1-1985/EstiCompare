import React, { useMemo, useState } from 'react';
import { BatchPart, ProcessRow, DetailedEstimate, ImportSource, ProcessCalcMode } from '../types';
import { createEmptyEstimate } from '../data/samples';
import { calculateEstimate, resolveProcessCalcMode, rateFromCostSell } from '../utils/calculations';
import {
  ArrowLeft, Layers3, Plus, Trash2, Download, Lock, Unlock,
  ChevronDown, ChevronRight, ArrowLeftRight, FilePlus,
} from 'lucide-react';

interface BatchCompareSheetProps {
  parts: BatchPart[];
  onPartsChange: (parts: BatchPart[]) => void;
  importSources?: ImportSource[];
  onBack: () => void;
  onNew?: () => void;
}

const MAX_PARTS = 10;
const MODES: ProcessCalcMode[] = ['standard', 'kg', 'lump', 'direct'];
const rand = () => Math.random().toString(36).slice(2, 7);
const yen = (v: number) => `¥${v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const modeBadge = (mode: string) =>
  mode === 'kg' ? 'kg単価' : mode === 'lump' ? '一式' : mode === 'direct' ? '直接費' : '賃率';

const blankProc = (index: number, name: string): ProcessRow =>
  ({ index, processName: name, workContent: '', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, isDirectInput: false, directProcessingCost: 0 });

export const BatchCompareSheet: React.FC<BatchCompareSheetProps> = ({ parts, onPartsChange, importSources = [], onBack, onNew }) => {
  const [internalMode, setInternalMode] = useState(true);
  const [showProcDetail, setShowProcDetail] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  // ── part mutation helpers ──────────────────────────────────────────────────
  const patchEstimate = (id: string, updater: (e: DetailedEstimate) => DetailedEstimate) =>
    onPartsChange(parts.map((pt) => (pt.id === id ? { ...pt, estimate: updater(pt.estimate) } : pt)));

  const setPartField = (id: string, patch: Partial<DetailedEstimate>) =>
    patchEstimate(id, (e) => ({ ...e, ...patch }));

  const setMaterial = (id: string, patch: Partial<DetailedEstimate['material']>) =>
    patchEstimate(id, (e) => ({ ...e, material: { ...e.material, ...patch } }));

  const setAdjust = (id: string, patch: Partial<DetailedEstimate['adjustments']>) =>
    patchEstimate(id, (e) => ({ ...e, adjustments: { ...e.adjustments, ...patch } }));

  const setLogistics = (id: string, patch: Partial<DetailedEstimate['logistics']>) =>
    patchEstimate(id, (e) => ({ ...e, logistics: { ...e.logistics, ...patch } }));

  const updateProc = (id: string, pn: string, patch: Partial<ProcessRow>) =>
    patchEstimate(id, (e) => ({
      ...e,
      processes: e.processes.map((p) => (p.processName.trim() === pn ? { ...p, ...patch } : p)),
    }));

  const cycleProcMode = (id: string, pn: string, current: ProcessCalcMode) =>
    updateProc(id, pn, { calcMode: MODES[(MODES.indexOf(current) + 1) % MODES.length] });

  // add a (named) process to a single part that doesn't yet have it
  const updateProcAdd = (partId: string, pn: string) =>
    patchEstimate(partId, (e) => {
      if (e.processes.some((p) => p.processName.trim() === pn)) return e;
      const slot = e.processes.findIndex((p) => !p.processName.trim());
      const processes = slot >= 0
        ? e.processes.map((p, i) => (i === slot ? { ...p, processName: pn } : p))
        : [...e.processes, blankProc(e.processes.length + 1, pn)];
      return { ...e, processes };
    });

  const setOldPrice = (id: string, v: number | undefined) =>
    onPartsChange(parts.map((pt) => (pt.id === id ? { ...pt, oldUnitPrice: v } : pt)));

  // ── add / remove parts ──────────────────────────────────────────────────────
  const addBlank = () => {
    if (parts.length >= MAX_PARTS) { alert(`品番は最大${MAX_PARTS}件までです。`); return; }
    onPartsChange([...parts, { id: `bp-${Date.now()}-${rand()}`, estimate: JSON.parse(JSON.stringify(createEmptyEstimate())) }]);
  };

  const addFromSource = (src: ImportSource) => {
    if (parts.length >= MAX_PARTS) { alert(`品番は最大${MAX_PARTS}件までです。`); return; }
    onPartsChange([
      ...parts,
      {
        id: `bp-${Date.now()}-${rand()}`,
        estimate: JSON.parse(JSON.stringify(src.estimate)),
        oldUnitPrice: src.oldUnitPrice && src.oldUnitPrice > 0 ? src.oldUnitPrice : undefined,
        sourceScenarioId: src.sourceScenarioId,
      },
    ]);
    setImportOpen(false);
  };

  const removePart = (id: string) => onPartsChange(parts.filter((pt) => pt.id !== id));

  // ── process union (read-only names; add via prompt, remove across all) ───────
  const processNames = useMemo(() => {
    const names: string[] = [];
    parts.forEach((pt) =>
      pt.estimate.processes.forEach((p) => {
        const n = p.processName.trim();
        if (n && !names.includes(n)) names.push(n);
      }),
    );
    return names;
  }, [parts]);

  const addProcessAll = () => {
    const name = (window.prompt('全品番に追加する工程名を入力') || '').trim();
    if (!name) return;
    onPartsChange(
      parts.map((pt) => {
        if (pt.estimate.processes.some((p) => p.processName.trim() === name)) return pt;
        const slot = pt.estimate.processes.findIndex((p) => !p.processName.trim());
        const processes = slot >= 0
          ? pt.estimate.processes.map((p, i) => (i === slot ? { ...p, processName: name } : p))
          : [...pt.estimate.processes, blankProc(pt.estimate.processes.length + 1, name)];
        return { ...pt, estimate: { ...pt.estimate, processes } };
      }),
    );
  };

  const removeProcessAll = (pn: string) => {
    onPartsChange(
      parts.map((pt) => ({
        ...pt,
        estimate: {
          ...pt.estimate,
          processes: pt.estimate.processes.map((p) =>
            p.processName.trim() === pn
              ? { ...p, processName: '', hourlyRate: 0, totalHours: 0, yieldPerHour: 0, kgPrice: 0, lumpSumPrice: 0, directProcessingCost: 0, calcMode: undefined }
              : p,
          ),
        },
      })),
    );
  };

  // ── cross-cutting alignment (揃える = copy leftmost part's value to all) ──────
  const alignMaterialPrice = () => {
    if (parts.length < 2) return;
    const ref = parts[0].estimate.material.basePricePerKg;
    onPartsChange(parts.map((pt, i) => (i === 0 ? pt : { ...pt, estimate: { ...pt.estimate, material: { ...pt.estimate.material, basePricePerKg: ref } } })));
  };
  const alignSga = () => {
    if (parts.length < 2) return;
    const rate = parts[0].estimate.adjustments.sgaRatePercent;
    const mode = parts[0].estimate.adjustments.sgaCalcMode || 'markup';
    onPartsChange(parts.map((pt, i) => (i === 0 ? pt : { ...pt, estimate: { ...pt.estimate, adjustments: { ...pt.estimate.adjustments, sgaRatePercent: rate, sgaCalcMode: mode } } })));
  };
  const alignProcRate = (pn: string) => {
    const present = parts.filter((pt) => pt.estimate.processes.some((p) => p.processName.trim() === pn));
    if (present.length < 2) return;
    const refProc = present[0].estimate.processes.find((p) => p.processName.trim() === pn)!;
    onPartsChange(
      parts.map((pt) => {
        if (pt.id === present[0].id) return pt;
        if (!pt.estimate.processes.some((p) => p.processName.trim() === pn)) return pt;
        return {
          ...pt,
          estimate: {
            ...pt.estimate,
            processes: pt.estimate.processes.map((p) =>
              p.processName.trim() === pn
                ? { ...p, calcMode: refProc.calcMode, hourlyRate: refProc.hourlyRate, yieldPerHour: refProc.yieldPerHour, totalHours: refProc.totalHours, kgPrice: refProc.kgPrice, lumpSumPrice: refProc.lumpSumPrice, directProcessingCost: refProc.directProcessingCost }
                : p,
            ),
          },
        };
      }),
    );
  };

  // ── computed per part (calc + process cost by name) ─────────────────────────
  const calcs = useMemo(
    () =>
      parts.map((pt) => {
        const calc = calculateEstimate(pt.estimate);
        const costByName: Record<string, number> = {};
        pt.estimate.processes.forEach((p, i) => {
          const n = p.processName.trim();
          if (n) costByName[n] = (costByName[n] || 0) + (calc.processCosts[i] || 0);
        });
        return { part: pt, calc, costByName };
      }),
    [parts],
  );

  // inconsistency detection across all parts (for alignable rows)
  const numDiffers = (getter: (pt: BatchPart) => number): boolean => {
    if (parts.length < 2) return false;
    const set = new Set(parts.map((pt) => Math.round(getter(pt) * 100) / 100));
    return set.size > 1;
  };
  const refNum = (getter: (pt: BatchPart) => number) => (parts.length ? getter(parts[0]) : 0);

  // Per-process rate consistency, considering ONLY parts that actually have the process
  const procRateInfo = (pn: string) => {
    const present = parts.filter((pt) => pt.estimate.processes.some((p) => p.processName.trim() === pn));
    const rateOf = (pt: BatchPart) => pt.estimate.processes.find((p) => p.processName.trim() === pn)?.hourlyRate ?? 0;
    const differs = present.length >= 2 && new Set(present.map((pt) => Math.round(rateOf(pt) * 100) / 100)).size > 1;
    return { differs };
  };

  const inp = 'w-full px-1 py-0.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F] text-right';
  const inpL = 'w-full px-1 py-0.5 text-xs rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F]';
  const miniInp = 'w-full px-1 py-0.5 text-[10px] font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F] text-right';
  const warnCell = 'bg-amber-50';
  const lbl = 'px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white z-10';

  const AlignBtn: React.FC<{ onClick: () => void; differs: boolean }> = ({ onClick, differs }) => (
    <button
      onClick={onClick}
      title="先頭品番の値に全列を揃える"
      className={`ml-1 inline-flex items-center cursor-pointer rounded px-1 py-0.5 text-[8px] font-black border transition-colors ${
        differs ? 'bg-amber-100 border-amber-400 text-amber-800 animate-pulse' : 'border-[#D6D0C8] text-[#9C9490] hover:bg-[#F0EDE8]'
      }`}
    >
      <ArrowLeftRight className="w-2.5 h-2.5 mr-0.5" />揃える
    </button>
  );

  const ImportMenu: React.FC<{ align: 'left' | 'right' }> = ({ align }) => (
    <>
      <div className="fixed inset-0 z-20" onClick={() => setImportOpen(false)} />
      <div className={`absolute z-30 mt-1 ${align === 'right' ? 'right-0' : 'left-0'} w-72 max-h-72 overflow-y-auto bg-white border border-[#D6D0C8] rounded shadow-lg text-left`}>
        {importSources.length === 0 ? (
          <div className="px-3 py-2 text-[10px] text-[#9C9490]">取込可能な品番データがありません。</div>
        ) : importSources.map((src) => (
          <button key={src.id} onClick={() => addFromSource(src)} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-[#FEF0EB] cursor-pointer border-b border-[#EEEBE6]">
            <span className="text-[8px] font-black text-[#1E3A5F] bg-[#EFF4FD] rounded px-1 mr-1">{src.group}</span>
            <span className="font-bold text-[#18130F]">{src.label || '(品番未設定)'}</span>
            {src.subLabel && <span className="block text-[#9C9490] truncate">{src.subLabel}</span>}
          </button>
        ))}
      </div>
    </>
  );

  // ── empty state ─────────────────────────────────────────────────────────────
  if (parts.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-8 bg-white rounded-xl border border-[#D6D0C8] p-8 text-center shadow-sm">
        <Layers3 className="w-10 h-10 mx-auto text-[#B5451B] mb-3" />
        <h2 className="text-lg font-black text-[#18130F] mb-2">複数品番同時比較</h2>
        <p className="text-sm text-[#6B6057] leading-relaxed mb-4">
          客先の一斉価格改定などで、複数品番を横並びに<strong className="text-[#B5451B]">編集しながら</strong>整合させるワークシートです。
          各品番は新旧比較と同じ工程・材料・利管費の詳細編集ができ、「揃える」ボタンで横断的に統一できます。
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
          <button onClick={addBlank} className="bg-[#B5451B] hover:bg-[#9A3A16] text-white px-5 py-2.5 rounded-lg font-black text-sm inline-flex items-center gap-2 cursor-pointer">
            <Plus className="w-4 h-4" /> 空の品番を追加（直接入力）
          </button>
          <div className="relative">
            <button onClick={() => setImportOpen((v) => !v)} className="bg-white border border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#EFF4FD] px-5 py-2.5 rounded-lg font-black text-sm inline-flex items-center gap-2 cursor-pointer">
              <Download className="w-4 h-4" /> 他機能・ライブラリから取込
            </button>
            {importOpen && <ImportMenu align="left" />}
          </div>
        </div>
        <div className="mt-4">
          <button onClick={onBack} className="text-xs text-[#6B6057] hover:text-[#B5451B] font-bold underline cursor-pointer">ワークスペースへ戻る</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onBack} className="text-xs text-[#6B6057] hover:text-[#B5451B] font-bold inline-flex items-center gap-1 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> 戻る
        </button>
        <Layers3 className="w-5 h-5 text-[#B5451B]" />
        <h2 className="text-sm font-black text-[#18130F]">複数品番同時比較</h2>
        <span className="text-[10px] text-[#9C9490] font-mono">{parts.length}品番</span>

        <div className="ml-auto flex items-center gap-1.5">
          {onNew && (
            <button onClick={onNew} className="text-[10px] font-bold px-2 py-1 rounded border border-[#D6D0C8] text-[#6B6057] hover:bg-[#F0EDE8] cursor-pointer inline-flex items-center gap-1" title="複数品番比較を白紙から新規作成">
              <FilePlus className="w-3 h-3" /> 新規作成
            </button>
          )}
          <button onClick={addBlank} className="text-[10px] font-bold px-2 py-1 rounded border border-[#B5451B] text-[#B5451B] hover:bg-[#FEF0EB] cursor-pointer inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> 品番追加
          </button>
          <div className="relative">
            <button onClick={() => setImportOpen((v) => !v)} className="text-[10px] font-bold px-2 py-1 rounded border border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#EFF4FD] cursor-pointer inline-flex items-center gap-1">
              <Download className="w-3 h-3" /> 取込
            </button>
            {importOpen && <ImportMenu align="right" />}
          </div>
          <button onClick={() => setShowProcDetail((v) => !v)} className={`text-[10px] font-bold px-2 py-1 rounded border cursor-pointer inline-flex items-center gap-1 ${showProcDetail ? 'bg-[#EFF4FD] border-[#B8CCE8] text-[#1E3A5F]' : 'border-[#D6D0C8] text-[#6B6057] hover:bg-[#F0EDE8]'}`}>
            {showProcDetail ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}工程詳細
          </button>
          <button onClick={() => setInternalMode((v) => !v)} className={`text-[10px] font-bold px-2 py-1 rounded border cursor-pointer inline-flex items-center gap-1 ${internalMode ? 'bg-rose-50 border-rose-200 text-rose-700' : 'border-[#D6D0C8] text-[#6B6057] hover:bg-[#F0EDE8]'}`}>
            {internalMode ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}{internalMode ? '社内モード' : '閲覧モード'}
          </button>
        </div>
      </div>

      {internalMode && (
        <div className="bg-rose-50 border border-rose-200 rounded p-2 flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-[10px] text-rose-700 leading-tight">
            <span className="font-black">社内専用モード</span> — 実利益率など原価情報を表示中。客先と画面共有する際は「閲覧モード」に切り替えてください。
            <span className="text-[#9C9490] ml-1">「揃える」は先頭（左端）品番の値を全列にコピーします。黄色＝列間で値が不一致。</span>
          </p>
        </div>
      )}

      <div className="overflow-x-auto border border-[#D6D0C8] rounded bg-white">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-[#18130F] text-white">
              <th className="px-2 py-1.5 text-left font-black sticky left-0 bg-[#18130F] z-20 min-w-[150px]">項目</th>
              {calcs.map(({ part }, i) => (
                <th key={part.id} className="px-2 py-1.5 text-center font-black border-l border-[#3A3028] min-w-[160px]">
                  <div className="flex items-center justify-center gap-1">
                    {i === 0 && <span className="text-[8px] bg-[#B5451B] px-1 rounded">基準</span>}
                    <input
                      value={part.estimate.partNumber}
                      onChange={(e) => setPartField(part.id, { partNumber: e.target.value })}
                      placeholder="品番"
                      className="w-full bg-transparent text-white text-center font-mono text-[11px] outline-none border-b border-[#3A3028] focus:border-white placeholder:text-[#6B6057]"
                    />
                    <button onClick={() => removePart(part.id)} className="text-[#9C9490] hover:text-rose-400 cursor-pointer shrink-0" title="この品番を削除">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <input
                    value={part.estimate.partName || ''}
                    onChange={(e) => setPartField(part.id, { partName: e.target.value })}
                    placeholder="品名"
                    className="w-full bg-transparent text-[#C8C2B8] text-center text-[9px] outline-none mt-0.5 placeholder:text-[#6B6057]"
                  />
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <input
                      type="number"
                      value={part.estimate.baseLotSize || ''}
                      onChange={(e) => setPartField(part.id, { baseLotSize: parseFloat(e.target.value) || 0 })}
                      className="w-14 bg-[#2A2018] text-white text-center font-mono text-[9px] rounded outline-none px-1"
                      title="見積基準数（ロット）"
                    />
                    <input
                      value={part.estimate.lotUnit}
                      onChange={(e) => setPartField(part.id, { lotUnit: e.target.value })}
                      className="w-10 bg-[#2A2018] text-[#C8C2B8] text-center text-[8px] rounded outline-none px-0.5"
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ── Material ── */}
            <tr className="bg-[#FEF0EB] border-b border-[#EEEBE6]">
              <td colSpan={parts.length + 1} className="px-2 py-1 font-black text-[#B5451B] text-[10px] sticky left-0 bg-[#FEF0EB]">▸ 材料</td>
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>材質</td>
              {calcs.map(({ part }) => (
                <td key={part.id} className="px-1 py-0.5 border-l border-[#EEEBE6]">
                  <input value={part.estimate.material.materialName} onChange={(e) => setMaterial(part.id, { materialName: e.target.value })} className={inpL} />
                </td>
              ))}
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>
                材料建値 ¥/kg
                {parts.length >= 2 && <AlignBtn onClick={alignMaterialPrice} differs={numDiffers((pt) => pt.estimate.material.basePricePerKg)} />}
              </td>
              {calcs.map(({ part }) => {
                const bad = parts.length >= 2 && numDiffers((pt) => pt.estimate.material.basePricePerKg) && Math.round(part.estimate.material.basePricePerKg * 100) / 100 !== Math.round(refNum((pt) => pt.estimate.material.basePricePerKg) * 100) / 100;
                return (
                  <td key={part.id} className={`px-1 py-0.5 border-l border-[#EEEBE6] ${bad ? warnCell : ''}`}>
                    <input type="number" value={part.estimate.material.basePricePerKg || ''} onChange={(e) => setMaterial(part.id, { basePricePerKg: parseFloat(e.target.value) || 0 })} className={inp} />
                  </td>
                );
              })}
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>投入量 g / 完成品 g</td>
              {calcs.map(({ part }) => (
                <td key={part.id} className="px-1 py-0.5 border-l border-[#EEEBE6]">
                  <div className="flex gap-0.5">
                    <input type="number" value={part.estimate.material.inputWeightG || ''} onChange={(e) => setMaterial(part.id, { inputWeightG: parseFloat(e.target.value) || 0 })} className={inp} title="材料投入量 g" />
                    <input type="number" value={part.estimate.finishedWeightG || ''} onChange={(e) => setPartField(part.id, { finishedWeightG: parseFloat(e.target.value) || 0 })} className={inp} title="完成品重量 g（kg単価工程で使用）" />
                  </div>
                </td>
              ))}
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>スクラップ g / ¥/kg</td>
              {calcs.map(({ part }) => (
                <td key={part.id} className="px-1 py-0.5 border-l border-[#EEEBE6]">
                  <div className="flex gap-0.5">
                    <input type="number" value={part.estimate.material.scrapWeightG || ''} onChange={(e) => setMaterial(part.id, { scrapWeightG: parseFloat(e.target.value) || 0 })} className={inp} title="スクラップ重量g" />
                    <input type="number" value={part.estimate.material.scrapPricePerKg || ''} onChange={(e) => setMaterial(part.id, { scrapPricePerKg: parseFloat(e.target.value) || 0 })} className={inp} title="スクラップ単価¥/kg" />
                  </div>
                </td>
              ))}
            </tr>
            <tr className="border-b border-[#EEEBE6] bg-[#FAFAF8]">
              <td className="px-2 py-1 font-bold text-[#18130F] sticky left-0 bg-[#FAFAF8] z-10">材料費/個</td>
              {calcs.map(({ part, calc }) => (
                <td key={part.id} className="px-2 py-1 text-right font-mono font-bold text-[#18130F] border-l border-[#EEEBE6]">{yen(calc.netMaterialCost)}</td>
              ))}
            </tr>

            {/* ── Processes ── */}
            <tr className="bg-[#EFF4FD] border-b border-[#EEEBE6]">
              <td colSpan={parts.length + 1} className="px-2 py-1 sticky left-0 bg-[#EFF4FD]">
                <div className="flex items-center justify-between">
                  <span className="font-black text-[#1E3A5F] text-[10px]">▸ 工程別加工費（新旧比較と同じ詳細編集）</span>
                  <button onClick={addProcessAll} className="text-[9px] font-bold text-[#1E3A5F] hover:underline cursor-pointer inline-flex items-center gap-0.5">
                    <Plus className="w-2.5 h-2.5" /> 工程を全品番に追加
                  </button>
                </div>
              </td>
            </tr>
            {processNames.length === 0 && (
              <tr className="border-b border-[#EEEBE6]">
                <td colSpan={parts.length + 1} className="px-2 py-3 text-center text-[#9C9490] text-[10px]">
                  工程がありません。「工程を全品番に追加」で作成するか、取込で他機能・ライブラリから読み込んでください。
                </td>
              </tr>
            )}
            {processNames.map((pn) => {
              const rateInfo = procRateInfo(pn);
              return (
                <React.Fragment key={pn}>
                  <tr className="border-b border-[#EEEBE6] hover:bg-[#FAFAF8]">
                    <td className="px-2 py-1 font-bold text-[#18130F] sticky left-0 bg-white z-10">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{pn}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {rateInfo.differs && <AlignBtn onClick={() => alignProcRate(pn)} differs={rateInfo.differs} />}
                          <button onClick={() => removeProcessAll(pn)} className="text-[#C8C2B8] hover:text-rose-500 cursor-pointer" title="全品番からこの工程を削除">
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    </td>
                    {calcs.map(({ part, costByName }) => {
                      const has = part.estimate.processes.some((p) => p.processName.trim() === pn);
                      if (!has) {
                        return (
                          <td key={part.id} className="px-1 py-1 text-center border-l border-[#EEEBE6]">
                            <button onClick={() => updateProcAdd(part.id, pn)} className="text-[9px] text-[#1E3A5F] hover:underline cursor-pointer">＋追加</button>
                          </td>
                        );
                      }
                      return (
                        <td key={part.id} className="px-2 py-1 text-right font-mono font-bold text-[#18130F] border-l border-[#EEEBE6]">{yen(costByName[pn] || 0)}</td>
                      );
                    })}
                  </tr>

                  {showProcDetail && (
                    <tr className="border-b border-[#EEEBE6] bg-[#F7F8FD]">
                      <td className="px-2 py-1 pl-5 text-[9px] text-[#6B6057] sticky left-0 bg-[#F7F8FD] z-10 align-top">内訳（モード別）</td>
                      {calcs.map(({ part }) => {
                        const p = part.estimate.processes.find((x) => x.processName.trim() === pn);
                        if (!p) return <td key={part.id} className="border-l border-[#EEEBE6] bg-[#F7F8FD]" />;
                        const mode = resolveProcessCalcMode(p);
                        return (
                          <td key={part.id} className="px-1 py-1 border-l border-[#EEEBE6] bg-[#F7F8FD] align-top">
                            <div className="space-y-0.5">
                              <button
                                onClick={() => cycleProcMode(part.id, pn, mode)}
                                className="w-full text-[8px] font-black px-1 py-0.5 rounded border border-[#B8CCE8] bg-[#EFF4FD] text-[#1E3A5F] hover:bg-[#E0EAF8] cursor-pointer"
                                title="計算モード切替（賃率/kg単価/一式/直接費）"
                              >
                                {modeBadge(mode)}モード ⇄
                              </button>
                              {mode === 'standard' && (
                                <>
                                  <label className="flex items-center gap-1"><span className="text-[8px] text-[#9C9490] w-8 shrink-0">賃率</span>
                                    <input type="number" value={p.hourlyRate || ''} onChange={(e) => updateProc(part.id, pn, { hourlyRate: parseFloat(e.target.value) || 0 })} className={miniInp} title="賃率 ¥/h" />
                                  </label>
                                  <label className="flex items-center gap-1"><span className="text-[8px] text-[#9C9490] w-8 shrink-0">出来高</span>
                                    <input type="number" value={p.yieldPerHour || ''} onChange={(e) => updateProc(part.id, pn, { yieldPerHour: parseFloat(e.target.value) || 0 })} className={miniInp} title="出来高 個/h" />
                                  </label>
                                  <label className="flex items-center gap-1"><span className="text-[8px] text-[#9C9490] w-8 shrink-0">段取h</span>
                                    <input type="number" value={p.totalHours || ''} onChange={(e) => updateProc(part.id, pn, { totalHours: parseFloat(e.target.value) || 0 })} className={miniInp} title="段取時間 h" />
                                  </label>
                                </>
                              )}
                              {mode === 'kg' && (
                                <label className="flex items-center gap-1"><span className="text-[8px] text-[#9C9490] w-8 shrink-0">kg単価</span>
                                  <input type="number" value={p.kgPrice || ''} onChange={(e) => updateProc(part.id, pn, { kgPrice: parseFloat(e.target.value) || 0 })} className={miniInp} title="kg単価 ¥/kg（完成品重量×単価）" />
                                </label>
                              )}
                              {mode === 'lump' && (
                                <label className="flex items-center gap-1"><span className="text-[8px] text-[#9C9490] w-8 shrink-0">一式</span>
                                  <input type="number" value={p.lumpSumPrice || ''} onChange={(e) => updateProc(part.id, pn, { lumpSumPrice: parseFloat(e.target.value) || 0 })} className={miniInp} title="一式金額 ¥/lot（ロットで按分）" />
                                </label>
                              )}
                              {mode === 'direct' && (
                                <label className="flex items-center gap-1"><span className="text-[8px] text-[#9C9490] w-8 shrink-0">直接費</span>
                                  <input type="number" value={p.directProcessingCost || ''} onChange={(e) => updateProc(part.id, pn, { directProcessingCost: parseFloat(e.target.value) || 0 })} className={miniInp} title="直接加工費 ¥/個" />
                                </label>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* ── Summary ── */}
            <tr className="bg-[#F0EDE8] border-b border-[#EEEBE6]">
              <td colSpan={parts.length + 1} className="px-2 py-1 font-black text-[#6B6057] text-[10px] sticky left-0 bg-[#F0EDE8]">▸ 集計</td>
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>加工費合計/個</td>
              {calcs.map(({ part, calc }) => (
                <td key={part.id} className="px-2 py-1 text-right font-mono text-[#18130F] border-l border-[#EEEBE6]">{yen(calc.totalProcessCost)}</td>
              ))}
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>
                利管費率 %
                {parts.length >= 2 && <AlignBtn onClick={alignSga} differs={numDiffers((pt) => pt.estimate.adjustments.sgaRatePercent)} />}
              </td>
              {calcs.map(({ part }) => {
                const a = part.estimate.adjustments;
                const bad = parts.length >= 2 && numDiffers((pt) => pt.estimate.adjustments.sgaRatePercent) && Math.round(a.sgaRatePercent * 100) / 100 !== Math.round(refNum((pt) => pt.estimate.adjustments.sgaRatePercent) * 100) / 100;
                return (
                  <td key={part.id} className={`px-1 py-0.5 border-l border-[#EEEBE6] ${bad ? warnCell : ''}`}>
                    <div className="flex items-center gap-0.5 justify-end">
                      <button onClick={() => setAdjust(part.id, { sgaCalcMode: (a.sgaCalcMode || 'markup') === 'markup' ? 'margin' : 'markup' })} className={`text-[8px] font-black px-1 py-0.5 rounded border cursor-pointer ${(a.sgaCalcMode || 'markup') === 'markup' ? 'bg-[#FEF0EB] text-[#B5451B] border-[#E8C8BC]' : 'bg-[#EFF4FD] text-[#1E3A5F] border-[#B8CCE8]'}`}>
                        {(a.sgaCalcMode || 'markup') === 'markup' ? '外' : '内'}
                      </button>
                      <input type="number" value={a.sgaRatePercent || ''} step="0.01" onChange={(e) => setAdjust(part.id, { sgaRatePercent: parseFloat(e.target.value) || 0 })} className="w-14 px-1 py-0.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F] text-right" />
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>送料/箱 ・ 入数</td>
              {calcs.map(({ part }) => (
                <td key={part.id} className="px-1 py-0.5 border-l border-[#EEEBE6]">
                  <div className="flex gap-0.5">
                    <input type="number" value={part.estimate.logistics.freightPerBox || ''} onChange={(e) => setLogistics(part.id, { freightPerBox: parseFloat(e.target.value) || 0 })} className={inp} title="送料/箱" />
                    <input type="number" value={part.estimate.logistics.qtyPerBox || ''} onChange={(e) => setLogistics(part.id, { qtyPerBox: parseFloat(e.target.value) || 0 })} className={inp} title="入数/箱" />
                  </div>
                </td>
              ))}
            </tr>
            <tr className="border-b-2 border-[#D6D0C8] bg-[#EEF3FB]">
              <td className="px-2 py-2 font-black text-[#1E3A5F] sticky left-0 bg-[#EEF3FB] z-10">積み上げ単価</td>
              {calcs.map(({ part, calc }) => (
                <td key={part.id} className="px-2 py-2 text-right font-mono font-black text-base text-[#1E3A5F] border-l border-[#EEEBE6]">{yen(calc.grandTotalUnitPrice)}</td>
              ))}
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>仕入実費/個</td>
              {calcs.map(({ part, calc }) => (
                <td key={part.id} className="px-1 py-0.5 border-l border-[#EEEBE6]">
                  <input type="number" value={part.estimate.adjustments.actualPurchasePrice || ''} placeholder={calc.actualTotalCost > 0 ? calc.actualTotalCost.toFixed(2) : '実態原価'} onChange={(e) => setAdjust(part.id, { actualPurchasePrice: parseFloat(e.target.value) || 0 })} className={inp} title="仕入実費（実態原価/個）" />
                </td>
              ))}
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>旧単価（参照）</td>
              {calcs.map(({ part }) => (
                <td key={part.id} className="px-1 py-0.5 border-l border-[#EEEBE6]">
                  <input type="number" value={part.oldUnitPrice ?? ''} placeholder="—" onChange={(e) => setOldPrice(part.id, e.target.value === '' ? undefined : parseFloat(e.target.value) || 0)} className={inp} />
                </td>
              ))}
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>改定率</td>
              {calcs.map(({ part, calc }) => {
                const old = part.oldUnitPrice;
                const pct = old && old > 0 ? ((calc.grandTotalUnitPrice - old) / old) * 100 : null;
                const cls = pct === null ? 'text-[#9C9490]' : pct > 0 ? 'text-rose-600' : 'text-emerald-700';
                return (
                  <td key={part.id} className={`px-2 py-1 text-right font-mono font-black border-l border-[#EEEBE6] ${cls}`}>
                    {pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                  </td>
                );
              })}
            </tr>
            <tr className="border-b border-[#EEEBE6]">
              <td className={lbl}>目標単価</td>
              {calcs.map(({ part }) => (
                <td key={part.id} className="px-1 py-0.5 border-l border-[#EEEBE6]">
                  <input type="number" value={part.estimate.adjustments.targetUnitPrice || ''} onChange={(e) => setAdjust(part.id, { targetUnitPrice: parseFloat(e.target.value) || 0 })} className={inp} />
                </td>
              ))}
            </tr>
            <tr className={internalMode ? 'border-b border-[#EEEBE6]' : ''}>
              <td className={lbl}>積み上げ vs 目標</td>
              {calcs.map(({ part, calc }) => {
                const t = part.estimate.adjustments.targetUnitPrice;
                const diff = t > 0 ? calc.grandTotalUnitPrice - t : null;
                const balanced = diff !== null && Math.abs(diff) < 0.5;
                const cls = diff === null ? 'text-[#9C9490]' : balanced ? 'text-emerald-700' : diff > 0 ? 'text-rose-600' : 'text-amber-700';
                return (
                  <td key={part.id} className={`px-2 py-1 text-right font-mono font-bold border-l border-[#EEEBE6] ${cls}`}>
                    {diff === null ? '—' : balanced ? '✓ 整合' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                  </td>
                );
              })}
            </tr>

            {/* 🔒 実利益率 internal only */}
            {internalMode && (
              <tr>
                <td className="px-2 py-1.5 font-bold text-rose-600 sticky left-0 bg-rose-50 z-10">実利益率 🔒</td>
                {calcs.map(({ part, calc }) => {
                  const cost = part.estimate.adjustments.actualPurchasePrice > 0 ? part.estimate.adjustments.actualPurchasePrice : calc.actualTotalCost;
                  const sell = calc.grandTotalUnitPrice;
                  const rate = cost > 0 && sell > 0 ? rateFromCostSell(cost, sell, 'margin') : null;
                  const cls = rate === null ? 'text-[#9C9490]' : rate >= 15 ? 'text-emerald-700' : rate >= 5 ? 'text-amber-700' : 'text-rose-600';
                  return (
                    <td key={part.id} className={`px-2 py-1.5 text-right font-mono font-bold border-l border-[#EEEBE6] bg-rose-50 ${cls}`}>
                      {rate === null ? '—' : `${rate.toFixed(1)}%`}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
