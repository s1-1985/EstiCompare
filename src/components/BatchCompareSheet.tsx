import React, { useState, useMemo } from 'react';
import { Scenario } from '../types';
import { calculateEstimate, resolveProcessCalcMode, rateFromCostSell } from '../utils/calculations';
import {
  ArrowLeft, Layers3, AlertTriangle, CheckCircle2, Users,
  Lock, Unlock, ChevronDown, ChevronRight,
} from 'lucide-react';

interface BatchCompareSheetProps {
  scenarios: Scenario[];
  onBack: () => void;
}

const MAX_SELECT = 8;

const GROUP_COLORS = [
  { dot: '#1E3A5F', bg: 'bg-[#EFF4FD]', border: 'border-[#B8CCE8]', text: 'text-[#1E3A5F]' },
  { dot: '#1A6B3A', bg: 'bg-[#F0FAF4]', border: 'border-[#A8D4BC]', text: 'text-[#1A6B3A]' },
  { dot: '#B5451B', bg: 'bg-[#FEF0EB]', border: 'border-[#E8C8BC]', text: 'text-[#B5451B]' },
  { dot: '#6B3FA0', bg: 'bg-[#F3EFFA]', border: 'border-[#CBB8E8]', text: 'text-[#6B3FA0]' },
];

const yen = (v: number) =>
  `¥${v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const BatchCompareSheet: React.FC<BatchCompareSheetProps> = ({ scenarios, onBack }) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [groupInput, setGroupInput] = useState('');
  const [internalMode, setInternalMode] = useState(true);
  const [showProcessDetail, setShowProcessDetail] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECT) return prev;
      return [...prev, id];
    });
  };

  const selectAll = () => setSelected(scenarios.slice(0, MAX_SELECT).map((s) => s.id));
  const clearAll = () => setSelected([]);

  const selectedScenarios = useMemo(
    () => selected.map((id) => scenarios.find((s) => s.id === id)).filter((s): s is Scenario => !!s),
    [selected, scenarios]
  );

  const groupNames = useMemo(
    () => Array.from(new Set(Object.values(groups).filter(Boolean))),
    [groups]
  );

  const colorFor = (id: string) => {
    const g = groups[id];
    if (!g) return null;
    return GROUP_COLORS[groupNames.indexOf(g) % GROUP_COLORS.length];
  };

  const assignGroup = () => {
    const name = groupInput.trim();
    if (!name || selected.length === 0) return;
    setGroups((prev) => {
      const next = { ...prev };
      selected.forEach((id) => { next[id] = name; });
      return next;
    });
    setGroupInput('');
  };

  const processNames = useMemo(() => {
    const names: string[] = [];
    selectedScenarios.forEach((s) => {
      s.newEstimate.processes.forEach((p) => {
        if (p.processName.trim() && !names.includes(p.processName.trim()))
          names.push(p.processName.trim());
      });
    });
    return names;
  }, [selectedScenarios]);

  const calcs = useMemo(
    () => selectedScenarios.map((s) => ({ scenario: s, calc: calculateEstimate(s.newEstimate) })),
    [selectedScenarios]
  );

  // ── Consistency detection (same-group members) ──────────────────────────────
  const warnings = useMemo(() => {
    const out: string[] = [];
    const byGroup: Record<string, Scenario[]> = {};
    selectedScenarios.forEach((s) => {
      const g = groups[s.id];
      if (!g) return;
      (byGroup[g] ||= []).push(s);
    });
    Object.entries(byGroup).forEach(([gname, members]) => {
      if (members.length < 2) return;

      // lot size
      const lotSizes = new Set(members.map((s) => s.newEstimate.baseLotSize));
      if (lotSizes.size > 1)
        out.push(`【${gname}】見積基準数が不一致 (${Array.from(lotSizes).join(' / ')}個)`);

      // material price per same material name
      const matMap: Record<string, Set<number>> = {};
      members.forEach((s) => {
        const m = s.newEstimate.material;
        if (m.materialName.trim())
          (matMap[m.materialName.trim()] ||= new Set()).add(Math.round(m.basePricePerKg));
      });
      Object.entries(matMap).forEach(([mat, prices]) => {
        if (prices.size > 1)
          out.push(`【${gname}】材料「${mat}」の建値が不一致 (${Array.from(prices).map((p) => `¥${p}`).join(' / ')})`);
      });

      // process yield / setup
      const procNames = new Set<string>();
      members.forEach((s) =>
        s.newEstimate.processes.forEach((p) => p.processName.trim() && procNames.add(p.processName.trim()))
      );
      procNames.forEach((pn) => {
        const yields = new Set<number>();
        const setups = new Set<number>();
        members.forEach((s) => {
          const p = s.newEstimate.processes.find((x) => x.processName.trim() === pn);
          if (p && resolveProcessCalcMode(p) === 'standard') {
            yields.add(p.yieldPerHour);
            setups.add(p.totalHours);
          }
        });
        if (yields.size > 1)
          out.push(`【${gname}】工程「${pn}」の出来高が不一致 (${Array.from(yields).join(' / ')}個/h)`);
        if (setups.size > 1)
          out.push(`【${gname}】工程「${pn}」の段取が不一致 (${Array.from(setups).join(' / ')}h)`);
      });
    });
    return out;
  }, [selectedScenarios, groups]);

  // numeric inconsistency within same group
  const groupValueInconsistent = (sid: string, getter: (s: Scenario) => number | null): boolean => {
    const g = groups[sid];
    if (!g) return false;
    const members = selectedScenarios.filter((s) => groups[s.id] === g);
    if (members.length < 2) return false;
    const vals = new Set<number>();
    members.forEach((s) => {
      const v = getter(s);
      if (v !== null) vals.add(Math.round(v * 100) / 100);
    });
    return vals.size > 1;
  };

  // string inconsistency within same group
  const groupStringInconsistent = (sid: string, getter: (s: Scenario) => string | null): boolean => {
    const g = groups[sid];
    if (!g) return false;
    const members = selectedScenarios.filter((s) => groups[s.id] === g);
    if (members.length < 2) return false;
    const vals = new Set<string>();
    members.forEach((s) => {
      const v = getter(s);
      if (v !== null && v.trim() !== '') vals.add(v.trim());
    });
    return vals.size > 1;
  };

  const warnCell = 'bg-amber-100 border border-amber-400';
  const hasGroups = Object.keys(groups).length > 0;

  return (
    <div className="flex gap-3 h-full">
      {/* ── LEFT sidebar ── */}
      <aside className="flex-none w-56 space-y-3">
        <button
          onClick={onBack}
          className="text-xs text-[#6B6057] hover:text-[#B5451B] font-bold inline-flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> ライブラリへ戻る
        </button>

        {/* part selection */}
        <div className="bg-white border border-[#D6D0C8] rounded p-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black text-[#18130F] uppercase tracking-wide">品番選択</span>
            <span className="text-[9px] text-[#9C9490] font-mono">
              {selected.length}/{Math.min(MAX_SELECT, scenarios.length)}
            </span>
          </div>
          <div className="flex gap-1 mb-1.5">
            <button
              onClick={selectAll}
              className="flex-1 text-[9px] font-bold py-0.5 rounded border border-[#D6D0C8] hover:bg-[#F0EDE8] cursor-pointer"
            >
              全選択
            </button>
            <button
              onClick={clearAll}
              className="flex-1 text-[9px] font-bold py-0.5 rounded border border-[#D6D0C8] hover:bg-[#F0EDE8] cursor-pointer"
            >
              全解除
            </button>
          </div>
          <div className="space-y-0.5 max-h-72 overflow-y-auto">
            {scenarios.length === 0 && (
              <div className="text-[10px] text-[#9C9490] p-2">保存済みシナリオがありません</div>
            )}
            {scenarios.map((s) => {
              const isSel = selected.includes(s.id);
              const c = colorFor(s.id);
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-[10px] ${isSel ? 'bg-[#FEF0EB]' : 'hover:bg-[#F7F6F2]'}`}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(s.id)}
                    className="shrink-0 accent-[#B5451B]"
                  />
                  {c && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[#18130F] truncate">
                      {s.newEstimate.partNumber || '(品番未設定)'}
                    </span>
                    <span className="block text-[#9C9490] truncate">{s.name}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* supplier group assignment */}
        <div className="bg-white border border-[#D6D0C8] rounded p-2">
          <div className="flex items-center gap-1 mb-1.5">
            <Users className="w-3 h-3 text-[#1E3A5F]" />
            <span className="text-[10px] font-black text-[#18130F] uppercase tracking-wide">
              サプライヤーグループ
            </span>
          </div>
          <p className="text-[9px] text-[#9C9490] mb-1.5 leading-tight">
            選択中の品番に同一仕入先グループ名を割当 → 整合性を自動チェック
          </p>
          <div className="flex gap-1 mb-1.5">
            <input
              value={groupInput}
              onChange={(e) => setGroupInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && assignGroup()}
              placeholder="例: ボルトメーカーA"
              className="flex-1 px-1.5 py-1 text-[10px] rounded border border-[#D6D0C8] outline-none focus:ring-1 focus:border-[#1E3A5F]"
            />
            <button
              onClick={assignGroup}
              disabled={!groupInput.trim() || selected.length === 0}
              className="text-[10px] font-bold px-2 rounded bg-[#1E3A5F] text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            >
              割当
            </button>
          </div>
          {groupNames.length > 0 && (
            <div className="space-y-0.5">
              {groupNames.map((g) => {
                const idx = groupNames.indexOf(g);
                const c = GROUP_COLORS[idx % GROUP_COLORS.length];
                const count = Object.values(groups).filter((x) => x === g).length;
                return (
                  <div
                    key={g}
                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[9px] ${c.bg} ${c.border}`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                    <span className={`font-bold ${c.text} truncate flex-1`}>{g}</span>
                    <span className="text-[#9C9490] font-mono">{count}品番</span>
                  </div>
                );
              })}
              <button
                onClick={() => setGroups({})}
                className="text-[9px] text-[#9C9490] hover:text-rose-600 underline cursor-pointer mt-0.5"
              >
                グループをクリア
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── RIGHT: comparison table ── */}
      <div className="flex-1 min-w-0 space-y-2">

        {/* toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Layers3 className="w-5 h-5 text-[#B5451B]" />
          <h2 className="text-sm font-black text-[#18130F]">複数品番同時比較</h2>
          <span className="text-[10px] text-[#9C9490] font-mono">{selectedScenarios.length}品番選択中</span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowProcessDetail((v) => !v)}
              className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded border cursor-pointer transition-colors ${
                showProcessDetail
                  ? 'bg-[#EFF4FD] border-[#B8CCE8] text-[#1E3A5F]'
                  : 'border-[#D6D0C8] text-[#6B6057] hover:bg-[#F0EDE8]'
              }`}
            >
              {showProcessDetail
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />}
              工程詳細
            </button>
            <button
              onClick={() => setInternalMode((v) => !v)}
              className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded border cursor-pointer transition-colors ${
                internalMode
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'border-[#D6D0C8] text-[#6B6057] hover:bg-[#F0EDE8]'
              }`}
            >
              {internalMode ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              {internalMode ? '社内モード' : '閲覧モード'}
            </button>
          </div>
        </div>

        {/* internal mode warning banner */}
        {internalMode && selectedScenarios.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded p-2 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
            <p className="text-[10px] text-rose-700 leading-tight">
              <span className="font-black">社内専用モード</span>{' '}
              — 実利益率・賃率など原価情報を表示中です。客先との画面共有時は右上の「閲覧モード」に切り替えてください。
            </p>
          </div>
        )}

        {/* consistency alerts */}
        {warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded p-2 space-y-1">
            <div className="flex items-center gap-1 text-[10px] font-black text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5" /> 整合性アラート（同一グループ内の不一致）
            </div>
            <div className="flex flex-wrap gap-1">
              {warnings.map((w, i) => (
                <span
                  key={i}
                  className="text-[9px] font-bold bg-amber-100 border border-amber-400 text-amber-800 px-1.5 py-0.5 rounded"
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}
        {selectedScenarios.length > 0 && warnings.length === 0 && hasGroups && (
          <div className="bg-emerald-50 border border-emerald-300 rounded p-2 flex items-center gap-1 text-[10px] font-black text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            同一グループ内の見積基準数・出来高・段取・材料建値はすべて整合しています
          </div>
        )}

        {selectedScenarios.length === 0 ? (
          <div className="bg-white border border-dashed border-[#D6D0C8] rounded p-12 text-center text-sm text-[#9C9490]">
            左のリストから品番を選択してください（最大{MAX_SELECT}品番）
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#D6D0C8] rounded bg-white">
            <table className="text-xs border-collapse min-w-full">
              <thead>
                <tr className="bg-[#18130F] text-white">
                  <th className="px-2 py-2 text-left font-black sticky left-0 bg-[#18130F] z-10 min-w-[130px]">
                    項目
                  </th>
                  {selectedScenarios.map((s) => {
                    const c = colorFor(s.id);
                    return (
                      <th
                        key={s.id}
                        className="px-2 py-2 text-center font-black border-l border-[#3A3028] min-w-[140px]"
                      >
                        <div className="flex items-center justify-center gap-1">
                          {c && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />}
                          <span className="truncate font-mono text-[11px]">
                            {s.newEstimate.partNumber || '(品番未設定)'}
                          </span>
                        </div>
                        {s.newEstimate.partName && (
                          <div className="text-[9px] opacity-80 font-normal truncate mt-0.5">
                            {s.newEstimate.partName}
                          </div>
                        )}
                        <div className="text-[9px] opacity-60 font-mono font-normal mt-0.5">
                          {s.newEstimate.baseLotSize.toLocaleString()}
                          {s.newEstimate.lotUnit || '個/Lot'}
                        </div>
                        {groups[s.id] && (
                          <div className="text-[8px] opacity-60 font-normal truncate">{groups[s.id]}</div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>

                {/* ── Material ─────────────────────────────────────────── */}
                <tr className="bg-[#FEF0EB] border-b border-[#EEEBE6]">
                  <td
                    colSpan={selectedScenarios.length + 1}
                    className="px-2 py-1 font-black text-[#B5451B] text-[10px] sticky left-0 bg-[#FEF0EB]"
                  >
                    ▸ 材料
                  </td>
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">材質</td>
                  {selectedScenarios.map((s) => {
                    const bad = groupStringInconsistent(
                      s.id, (x) => x.newEstimate.material.materialName
                    );
                    return (
                      <td
                        key={s.id}
                        className={`px-2 py-1 text-center text-[#18130F] border-l border-[#EEEBE6] ${bad ? warnCell : ''}`}
                      >
                        {s.newEstimate.material.materialName || '—'}
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">
                    材料建値 (¥/kg)
                  </td>
                  {selectedScenarios.map((s) => {
                    const bad = groupValueInconsistent(
                      s.id, (x) => x.newEstimate.material.basePricePerKg
                    );
                    return (
                      <td
                        key={s.id}
                        className={`px-2 py-1 text-right font-mono border-l border-[#EEEBE6] ${bad ? warnCell : ''}`}
                      >
                        ¥{s.newEstimate.material.basePricePerKg.toLocaleString()}
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-b border-[#EEEBE6] bg-[#FAFAF8]">
                  <td className="px-2 py-1 font-bold text-[#18130F] sticky left-0 bg-[#FAFAF8]">
                    材料費/個
                  </td>
                  {calcs.map(({ scenario, calc }) => (
                    <td
                      key={scenario.id}
                      className="px-2 py-1 text-right font-mono font-bold text-[#18130F] border-l border-[#EEEBE6]"
                    >
                      {yen(calc.netMaterialCost)}
                    </td>
                  ))}
                </tr>

                {/* ── Processes ────────────────────────────────────────── */}
                <tr className="bg-[#EFF4FD] border-b border-[#EEEBE6]">
                  <td
                    colSpan={selectedScenarios.length + 1}
                    className="px-2 py-1 font-black text-[#1E3A5F] text-[10px] sticky left-0 bg-[#EFF4FD]"
                  >
                    ▸ 工程別加工費
                    {!showProcessDetail && (
                      <span className="font-normal opacity-60 ml-1.5">
                        （加工費/個のみ表示 — 「工程詳細」で出来高・段取
                        {internalMode ? '・賃率' : ''}を展開）
                      </span>
                    )}
                  </td>
                </tr>
                {processNames.map((pn) => (
                  <React.Fragment key={pn}>
                    {/* always-visible: 加工費/個 */}
                    <tr className="border-b border-[#EEEBE6] hover:bg-[#FAFAF8]">
                      <td className="px-2 py-1.5 font-bold text-[#18130F] sticky left-0 bg-white">{pn}</td>
                      {calcs.map(({ scenario, calc }) => {
                        const p = scenario.newEstimate.processes.find(
                          (x) => x.processName.trim() === pn
                        );
                        if (!p)
                          return (
                            <td
                              key={scenario.id}
                              className="px-2 py-1.5 text-center text-[#C8C2B8] border-l border-[#EEEBE6]"
                            >
                              —
                            </td>
                          );
                        const idx = scenario.newEstimate.processes.findIndex((x) => x.index === p.index);
                        const cost = calc.processCosts[idx] ?? 0;
                        return (
                          <td
                            key={scenario.id}
                            className="px-2 py-1.5 text-right font-mono font-bold text-[#18130F] border-l border-[#EEEBE6]"
                          >
                            {yen(cost)}
                          </td>
                        );
                      })}
                    </tr>

                    {/* detail rows: 出来高/段取 */}
                    {showProcessDetail && (
                      <>
                        <tr className="border-b border-[#EEEBE6] bg-[#F7F8FD]">
                          <td className="px-2 py-0.5 pl-6 text-[9px] text-[#6B6057] sticky left-0 bg-[#F7F8FD]">
                            出来高 / 段取
                          </td>
                          {calcs.map(({ scenario }) => {
                            const p = scenario.newEstimate.processes.find(
                              (x) => x.processName.trim() === pn
                            );
                            if (!p)
                              return (
                                <td
                                  key={scenario.id}
                                  className="px-2 py-0.5 text-center text-[#C8C2B8] border-l border-[#EEEBE6] text-[9px]"
                                >
                                  —
                                </td>
                              );
                            const mode = resolveProcessCalcMode(p);
                            if (mode !== 'standard')
                              return (
                                <td
                                  key={scenario.id}
                                  className="px-2 py-0.5 text-center text-[9px] text-[#9C9490] border-l border-[#EEEBE6]"
                                >
                                  [{mode}]
                                </td>
                              );
                            const yBad = groupValueInconsistent(scenario.id, (s) => {
                              const q = s.newEstimate.processes.find((x) => x.processName.trim() === pn);
                              return q && resolveProcessCalcMode(q) === 'standard' ? q.yieldPerHour : null;
                            });
                            const sBad = groupValueInconsistent(scenario.id, (s) => {
                              const q = s.newEstimate.processes.find((x) => x.processName.trim() === pn);
                              return q && resolveProcessCalcMode(q) === 'standard' ? q.totalHours : null;
                            });
                            return (
                              <td
                                key={scenario.id}
                                className="px-2 py-0.5 border-l border-[#EEEBE6]"
                              >
                                <div className="flex justify-end gap-1.5 text-[9px] font-mono">
                                  <span
                                    className={`px-1 rounded ${yBad ? 'bg-amber-200 text-amber-900' : 'text-[#6B6057]'}`}
                                  >
                                    {p.yieldPerHour}個/h
                                  </span>
                                  <span
                                    className={`px-1 rounded ${sBad ? 'bg-amber-200 text-amber-900' : 'text-[#6B6057]'}`}
                                  >
                                    段{p.totalHours}h
                                  </span>
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* 🔒 賃率: internal mode only */}
                        {internalMode && (
                          <tr className="border-b border-[#EEEBE6] bg-rose-50">
                            <td className="px-2 py-0.5 pl-6 text-[9px] text-rose-600 font-bold sticky left-0 bg-rose-50">
                              賃率 🔒
                            </td>
                            {calcs.map(({ scenario }) => {
                              const p = scenario.newEstimate.processes.find(
                                (x) => x.processName.trim() === pn
                              );
                              if (!p)
                                return (
                                  <td
                                    key={scenario.id}
                                    className="px-2 py-0.5 text-center text-[#C8C2B8] border-l border-[#EEEBE6] text-[9px]"
                                  >
                                    —
                                  </td>
                                );
                              const mode = resolveProcessCalcMode(p);
                              if (mode !== 'standard')
                                return (
                                  <td
                                    key={scenario.id}
                                    className="px-2 py-0.5 text-center text-[9px] text-[#9C9490] border-l border-[#EEEBE6] bg-rose-50"
                                  >
                                    —
                                  </td>
                                );
                              return (
                                <td
                                  key={scenario.id}
                                  className="px-2 py-0.5 text-right font-mono text-[9px] text-rose-700 border-l border-[#EEEBE6] bg-rose-50"
                                >
                                  ¥{p.hourlyRate.toLocaleString()}/h
                                </td>
                              );
                            })}
                          </tr>
                        )}
                      </>
                    )}
                  </React.Fragment>
                ))}

                {/* ── Summary ──────────────────────────────────────────── */}
                <tr className="bg-[#F0EDE8] border-b border-[#EEEBE6]">
                  <td
                    colSpan={selectedScenarios.length + 1}
                    className="px-2 py-1 font-black text-[#6B6057] text-[10px] sticky left-0 bg-[#F0EDE8]"
                  >
                    ▸ 集計
                  </td>
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">加工費合計/個</td>
                  {calcs.map(({ scenario, calc }) => (
                    <td
                      key={scenario.id}
                      className="px-2 py-1 text-right font-mono text-[#18130F] border-l border-[#EEEBE6]"
                    >
                      {yen(calc.totalProcessCost)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">直製造原価/個</td>
                  {calcs.map(({ scenario, calc }) => (
                    <td
                      key={scenario.id}
                      className="px-2 py-1 text-right font-mono text-[#18130F] border-l border-[#EEEBE6]"
                    >
                      {yen(calc.primeCost)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">送料/個</td>
                  {calcs.map(({ scenario, calc }) => (
                    <td
                      key={scenario.id}
                      className="px-2 py-1 text-right font-mono text-[#18130F] border-l border-[#EEEBE6]"
                    >
                      {yen(calc.shippingCostPerUnit)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">利管費率</td>
                  {selectedScenarios.map((s) => {
                    const mode = s.newEstimate.adjustments.sgaCalcMode || 'markup';
                    const rate = s.newEstimate.adjustments.sgaRatePercent;
                    return (
                      <td
                        key={s.id}
                        className="px-2 py-1 text-right font-mono text-[#18130F] border-l border-[#EEEBE6]"
                      >
                        {rate}%
                        <span className="text-[9px] text-[#9C9490] ml-0.5">
                          {mode === 'markup' ? '外掛' : '内掛'}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* 積み上げ単価 — most prominent */}
                <tr className="border-b border-[#EEEBE6] bg-[#EEF3FB]">
                  <td className="px-2 py-2 font-black text-[#18130F] sticky left-0 bg-[#EEF3FB]">
                    積み上げ単価
                  </td>
                  {calcs.map(({ scenario, calc }) => (
                    <td
                      key={scenario.id}
                      className="px-2 py-2 text-right font-mono font-black text-lg text-[#1E3A5F] border-l border-[#EEEBE6]"
                    >
                      {yen(calc.grandTotalUnitPrice)}
                    </td>
                  ))}
                </tr>

                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1.5 font-bold text-[#6B6057] sticky left-0 bg-white">目標単価</td>
                  {selectedScenarios.map((s) => (
                    <td
                      key={s.id}
                      className="px-2 py-1.5 text-right font-mono font-bold text-[#B5451B] border-l border-[#EEEBE6]"
                    >
                      {s.newEstimate.adjustments.targetUnitPrice > 0
                        ? yen(s.newEstimate.adjustments.targetUnitPrice)
                        : '—'}
                    </td>
                  ))}
                </tr>

                <tr className={`border-b border-[#EEEBE6] ${internalMode ? '' : 'last'}`}>
                  <td className="px-2 py-1.5 font-bold text-[#6B6057] sticky left-0 bg-white">
                    積み上げ vs 目標
                  </td>
                  {calcs.map(({ scenario, calc }) => {
                    const t = scenario.newEstimate.adjustments.targetUnitPrice;
                    const diff = t > 0 ? calc.grandTotalUnitPrice - t : null;
                    const balanced = diff !== null && Math.abs(diff) < 0.5;
                    const cls =
                      diff === null
                        ? 'text-[#9C9490]'
                        : balanced
                        ? 'text-emerald-700 font-bold'
                        : diff > 0
                        ? 'text-rose-600 font-bold'
                        : 'text-amber-700 font-bold';
                    return (
                      <td
                        key={scenario.id}
                        className={`px-2 py-1.5 text-right font-mono border-l border-[#EEEBE6] ${cls}`}
                      >
                        {diff === null
                          ? '—'
                          : balanced
                          ? '✓ 整合'
                          : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                      </td>
                    );
                  })}
                </tr>

                {/* 🔒 実利益率: internal mode only */}
                {internalMode && (
                  <tr>
                    <td className="px-2 py-1.5 font-bold text-rose-600 sticky left-0 bg-rose-50">
                      実利益率 🔒
                    </td>
                    {calcs.map(({ scenario, calc }) => {
                      const cost =
                        scenario.newEstimate.adjustments.actualPurchasePrice > 0
                          ? scenario.newEstimate.adjustments.actualPurchasePrice
                          : calc.actualTotalCost;
                      const sell = scenario.newEstimate.adjustments.targetUnitPrice;
                      const rate =
                        cost > 0 && sell > 0 ? rateFromCostSell(cost, sell, 'margin') : null;
                      const cls =
                        rate === null
                          ? 'text-[#9C9490]'
                          : rate >= 15
                          ? 'text-emerald-700'
                          : rate >= 5
                          ? 'text-amber-700'
                          : 'text-rose-600';
                      return (
                        <td
                          key={scenario.id}
                          className={`px-2 py-1.5 text-right font-mono font-bold border-l border-[#EEEBE6] bg-rose-50 ${cls}`}
                        >
                          {rate === null ? '—' : `${rate.toFixed(2)}%`}
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
