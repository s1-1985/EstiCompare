import React, { useState, useMemo } from 'react';
import { Scenario } from '../types';
import { calculateEstimate, resolveProcessCalcMode, rateFromCostSell } from '../utils/calculations';
import { ArrowLeft, Layers3, AlertTriangle, CheckCircle2, Users } from 'lucide-react';

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

const yen = (v: number) => `¥${v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const BatchCompareSheet: React.FC<BatchCompareSheetProps> = ({ scenarios, onBack }) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({}); // scenarioId -> group name
  const [groupInput, setGroupInput] = useState('');

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

  // group name → unique color index
  const groupNames = useMemo(() => Array.from(new Set(Object.values(groups).filter(Boolean))), [groups]);
  const colorFor = (id: string) => {
    const g = groups[id];
    if (!g) return null;
    const idx = groupNames.indexOf(g);
    return GROUP_COLORS[idx % GROUP_COLORS.length];
  };

  const assignGroup = () => {
    const name = groupInput.trim();
    if (!name) return;
    setGroups((prev) => {
      const next = { ...prev };
      selected.forEach((id) => { next[id] = name; });
      return next;
    });
    setGroupInput('');
  };

  // union of process names across selected scenarios (新見積ベース)
  const processNames = useMemo(() => {
    const names: string[] = [];
    selectedScenarios.forEach((s) => {
      s.newEstimate.processes.forEach((p) => {
        if (p.processName.trim() && !names.includes(p.processName.trim())) names.push(p.processName.trim());
      });
    });
    return names;
  }, [selectedScenarios]);

  // per-scenario計算
  const calcs = useMemo(
    () => selectedScenarios.map((s) => ({ scenario: s, calc: calculateEstimate(s.newEstimate) })),
    [selectedScenarios]
  );

  // ── Consistency detection: 同一サプライヤーグループ内の不一致を検出 ──
  const warnings = useMemo(() => {
    const out: string[] = [];
    // group scenarios by supplier group name
    const byGroup: Record<string, Scenario[]> = {};
    selectedScenarios.forEach((s) => {
      const g = groups[s.id];
      if (!g) return;
      (byGroup[g] ||= []).push(s);
    });
    Object.entries(byGroup).forEach(([gname, members]) => {
      if (members.length < 2) return;
      // material price consistency
      const matMap: Record<string, Set<number>> = {};
      members.forEach((s) => {
        const m = s.newEstimate.material;
        if (m.materialName.trim()) (matMap[m.materialName.trim()] ||= new Set()).add(Math.round(m.basePricePerKg));
      });
      Object.entries(matMap).forEach(([mat, prices]) => {
        if (prices.size > 1) out.push(`【${gname}】材料「${mat}」の建値が不一致 (${Array.from(prices).map((p) => `¥${p}`).join(' / ')})`);
      });
      // per process name: yield & setup consistency
      const procNames = new Set<string>();
      members.forEach((s) => s.newEstimate.processes.forEach((p) => p.processName.trim() && procNames.add(p.processName.trim())));
      procNames.forEach((pn) => {
        const yields = new Set<number>();
        const setups = new Set<number>();
        members.forEach((s) => {
          const p = s.newEstimate.processes.find((x) => x.processName.trim() === pn);
          if (p && resolveProcessCalcMode(p) === 'standard') { yields.add(p.yieldPerHour); setups.add(p.totalHours); }
        });
        if (yields.size > 1) out.push(`【${gname}】工程「${pn}」の出来高が不一致 (${Array.from(yields).join(' / ')}個/h)`);
        if (setups.size > 1) out.push(`【${gname}】工程「${pn}」の段取が不一致 (${Array.from(setups).join(' / ')}h)`);
      });
    });
    return out;
  }, [selectedScenarios, groups]);

  // helper: within same group, is a value inconsistent across members?
  const groupValueInconsistent = (sid: string, getter: (s: Scenario) => number | null): boolean => {
    const g = groups[sid];
    if (!g) return false;
    const members = selectedScenarios.filter((s) => groups[s.id] === g);
    if (members.length < 2) return false;
    const vals = new Set<number>();
    members.forEach((s) => { const v = getter(s); if (v !== null) vals.add(Math.round(v * 100) / 100); });
    return vals.size > 1;
  };

  const warnCell = 'bg-amber-100 border border-amber-400';

  return (
    <div className="flex gap-3 h-full">
      {/* LEFT: selection */}
      <aside className="flex-none w-56 space-y-3">
        <button onClick={onBack} className="text-xs text-[#6B6057] hover:text-[#B5451B] font-bold inline-flex items-center gap-1 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> ライブラリへ戻る
        </button>

        <div className="bg-white border border-[#D6D0C8] rounded p-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black text-[#18130F] uppercase tracking-wide">品番選択</span>
            <span className="text-[9px] text-[#9C9490] font-mono">{selected.length}/{Math.min(MAX_SELECT, scenarios.length)}</span>
          </div>
          <div className="flex gap-1 mb-1.5">
            <button onClick={selectAll} className="flex-1 text-[9px] font-bold py-0.5 rounded border border-[#D6D0C8] hover:bg-[#F0EDE8] cursor-pointer">全選択</button>
            <button onClick={clearAll} className="flex-1 text-[9px] font-bold py-0.5 rounded border border-[#D6D0C8] hover:bg-[#F0EDE8] cursor-pointer">全解除</button>
          </div>
          <div className="space-y-0.5 max-h-72 overflow-y-auto">
            {scenarios.length === 0 && <div className="text-[10px] text-[#9C9490] p-2">保存済みシナリオがありません</div>}
            {scenarios.map((s) => {
              const isSel = selected.includes(s.id);
              const c = colorFor(s.id);
              return (
                <label key={s.id} className={`flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer text-[10px] ${isSel ? 'bg-[#FEF0EB]' : 'hover:bg-[#F7F6F2]'}`}>
                  <input type="checkbox" checked={isSel} onChange={() => toggle(s.id)} className="shrink-0 accent-[#B5451B]" />
                  {c && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[#18130F] truncate">{s.newEstimate.partNumber || '(品番未設定)'}</span>
                    <span className="block text-[#9C9490] truncate">{s.name}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* supplier groups */}
        <div className="bg-white border border-[#D6D0C8] rounded p-2">
          <div className="flex items-center gap-1 mb-1.5">
            <Users className="w-3 h-3 text-[#1E3A5F]" />
            <span className="text-[10px] font-black text-[#18130F] uppercase tracking-wide">サプライヤーグループ</span>
          </div>
          <p className="text-[9px] text-[#9C9490] mb-1.5 leading-tight">選択中の品番に同一仕入先グループ名を割当 → 整合性を自動チェック</p>
          <div className="flex gap-1 mb-1.5">
            <input value={groupInput} onChange={(e) => setGroupInput(e.target.value)} placeholder="例: ボルトメーカーA"
              className="flex-1 px-1.5 py-1 text-[10px] rounded border border-[#D6D0C8] outline-none focus:ring-1 focus:border-[#1E3A5F]" />
            <button onClick={assignGroup} disabled={!groupInput.trim() || selected.length === 0}
              className="text-[10px] font-bold px-2 rounded bg-[#1E3A5F] text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed">割当</button>
          </div>
          {groupNames.length > 0 && (
            <div className="space-y-0.5">
              {groupNames.map((g) => {
                const idx = groupNames.indexOf(g);
                const c = GROUP_COLORS[idx % GROUP_COLORS.length];
                const count = Object.values(groups).filter((x) => x === g).length;
                return (
                  <div key={g} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[9px] ${c.bg} ${c.border}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
                    <span className={`font-bold ${c.text} truncate flex-1`}>{g}</span>
                    <span className="text-[#9C9490] font-mono">{count}品番</span>
                  </div>
                );
              })}
              <button onClick={() => setGroups({})} className="text-[9px] text-[#9C9490] hover:text-rose-600 underline cursor-pointer mt-0.5">グループをクリア</button>
            </div>
          )}
        </div>
      </aside>

      {/* RIGHT: table */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Layers3 className="w-5 h-5 text-[#B5451B]" />
          <h2 className="text-sm font-black text-[#18130F]">複数品番同時比較</h2>
          <span className="text-[10px] text-[#9C9490] font-mono">{selectedScenarios.length}品番選択中</span>
        </div>

        {/* warnings */}
        {warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded p-2 space-y-1">
            <div className="flex items-center gap-1 text-[10px] font-black text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5" /> 整合性アラート（同一グループ内の不一致）
            </div>
            <div className="flex flex-wrap gap-1">
              {warnings.map((w, i) => (
                <span key={i} className="text-[9px] font-bold bg-amber-100 border border-amber-400 text-amber-800 px-1.5 py-0.5 rounded">{w}</span>
              ))}
            </div>
          </div>
        )}
        {selectedScenarios.length > 0 && warnings.length === 0 && Object.keys(groups).length > 0 && (
          <div className="bg-emerald-50 border border-emerald-300 rounded p-2 flex items-center gap-1 text-[10px] font-black text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> 同一グループ内の出来高・段取・材料建値はすべて整合しています
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
                  <th className="px-2 py-1.5 text-left font-black sticky left-0 bg-[#18130F] z-10 min-w-[110px]">項目</th>
                  {selectedScenarios.map((s) => {
                    const c = colorFor(s.id);
                    return (
                      <th key={s.id} className="px-2 py-1.5 text-center font-black border-l border-[#3A3028] min-w-[120px]">
                        <div className="flex items-center justify-center gap-1">
                          {c && <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />}
                          <span className="truncate">{s.newEstimate.partNumber || '(未設定)'}</span>
                        </div>
                        {groups[s.id] && <div className="text-[8px] opacity-70 font-normal truncate">{groups[s.id]}</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Material section */}
                <tr className="bg-[#FEF0EB] border-b border-[#EEEBE6]">
                  <td colSpan={selectedScenarios.length + 1} className="px-2 py-1 font-black text-[#B5451B] text-[10px] sticky left-0 bg-[#FEF0EB]">材料</td>
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">材質</td>
                  {selectedScenarios.map((s) => {
                    const bad = groupValueInconsistent(s.id, () => null); // name handled separately below
                    return <td key={s.id} className={`px-2 py-1 text-center text-[#18130F] border-l border-[#EEEBE6] ${bad ? warnCell : ''}`}>{s.newEstimate.material.materialName || '—'}</td>;
                  })}
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">材料建値 (¥/kg)</td>
                  {selectedScenarios.map((s) => {
                    const bad = groupValueInconsistent(s.id, (x) => x.newEstimate.material.basePricePerKg);
                    return <td key={s.id} className={`px-2 py-1 text-right font-mono border-l border-[#EEEBE6] ${bad ? warnCell : ''}`}>¥{s.newEstimate.material.basePricePerKg.toLocaleString()}</td>;
                  })}
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">材料費/個</td>
                  {calcs.map(({ scenario, calc }) => (
                    <td key={scenario.id} className="px-2 py-1 text-right font-mono text-[#18130F] border-l border-[#EEEBE6]">{yen(calc.netMaterialCost)}</td>
                  ))}
                </tr>

                {/* Process section */}
                <tr className="bg-[#EFF4FD] border-b border-[#EEEBE6]">
                  <td colSpan={selectedScenarios.length + 1} className="px-2 py-1 font-black text-[#1E3A5F] text-[10px] sticky left-0 bg-[#EFF4FD]">工程（出来高 / 段取 / 賃率 / 加工費）</td>
                </tr>
                {processNames.map((pn) => (
                  <tr key={pn} className="border-b border-[#EEEBE6] hover:bg-[#FAFAF8]">
                    <td className="px-2 py-1 font-bold text-[#18130F] sticky left-0 bg-white">{pn}</td>
                    {calcs.map(({ scenario, calc }) => {
                      const p = scenario.newEstimate.processes.find((x) => x.processName.trim() === pn);
                      if (!p) return <td key={scenario.id} className="px-2 py-1 text-center text-[#C8C2B8] border-l border-[#EEEBE6]">—</td>;
                      const mode = resolveProcessCalcMode(p);
                      const procCost = calc.processCosts[scenario.newEstimate.processes.findIndex((x) => x.index === p.index)] || 0;
                      const yBad = groupValueInconsistent(scenario.id, (s) => { const q = s.newEstimate.processes.find((x) => x.processName.trim() === pn); return q && resolveProcessCalcMode(q) === 'standard' ? q.yieldPerHour : null; });
                      const sBad = groupValueInconsistent(scenario.id, (s) => { const q = s.newEstimate.processes.find((x) => x.processName.trim() === pn); return q && resolveProcessCalcMode(q) === 'standard' ? q.totalHours : null; });
                      return (
                        <td key={scenario.id} className="px-1 py-1 border-l border-[#EEEBE6]">
                          <div className="flex flex-col items-end gap-0.5 text-[9px] font-mono">
                            {mode === 'standard' ? (
                              <>
                                <span className={yBad ? 'bg-amber-200 px-1 rounded' : 'text-[#6B6057]'}>{p.yieldPerHour}個/h</span>
                                <span className={sBad ? 'bg-amber-200 px-1 rounded' : 'text-[#6B6057]'}>段{p.totalHours}h</span>
                                <span className="text-[#1E3A5F] font-bold">¥{p.hourlyRate.toLocaleString()}</span>
                              </>
                            ) : (
                              <span className="text-[#9C9490] text-[8px]">[{mode}]</span>
                            )}
                            <span className="text-[#18130F] font-black border-t border-[#EEEBE6] pt-0.5 w-full text-right">{yen(procCost)}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {/* Summary */}
                <tr className="bg-[#F0EDE8] border-b border-[#EEEBE6]">
                  <td colSpan={selectedScenarios.length + 1} className="px-2 py-1 font-black text-[#6B6057] text-[10px] sticky left-0 bg-[#F0EDE8]">集計</td>
                </tr>
                <tr className="border-b border-[#EEEBE6] bg-[#EEF3FB]">
                  <td className="px-2 py-1.5 font-black text-[#18130F] sticky left-0 bg-[#EEF3FB]">積み上げ単価</td>
                  {calcs.map(({ scenario, calc }) => (
                    <td key={scenario.id} className="px-2 py-1.5 text-right font-mono font-black text-[#1E3A5F] border-l border-[#EEEBE6]">{yen(calc.grandTotalUnitPrice)}</td>
                  ))}
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">目標単価</td>
                  {selectedScenarios.map((s) => (
                    <td key={s.id} className="px-2 py-1 text-right font-mono text-[#B5451B] border-l border-[#EEEBE6]">{s.newEstimate.adjustments.targetUnitPrice > 0 ? yen(s.newEstimate.adjustments.targetUnitPrice) : '—'}</td>
                  ))}
                </tr>
                <tr className="border-b border-[#EEEBE6]">
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">差額(辻褄)</td>
                  {calcs.map(({ scenario, calc }) => {
                    const t = scenario.newEstimate.adjustments.targetUnitPrice;
                    const diff = t > 0 ? calc.grandTotalUnitPrice - t : null;
                    const cls = diff === null ? 'text-[#9C9490]' : Math.abs(diff) < 0.5 ? 'text-emerald-700' : diff > 0 ? 'text-rose-600' : 'text-amber-700';
                    return <td key={scenario.id} className={`px-2 py-1 text-right font-mono font-bold border-l border-[#EEEBE6] ${cls}`}>{diff === null ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}</td>;
                  })}
                </tr>
                <tr>
                  <td className="px-2 py-1 font-bold text-[#6B6057] sticky left-0 bg-white">実利益率(内掛け)</td>
                  {calcs.map(({ scenario, calc }) => {
                    const cost = scenario.newEstimate.adjustments.actualPurchasePrice > 0 ? scenario.newEstimate.adjustments.actualPurchasePrice : calc.actualTotalCost;
                    const sell = scenario.newEstimate.adjustments.targetUnitPrice;
                    const rate = cost > 0 && sell > 0 ? rateFromCostSell(cost, sell, 'margin') : null;
                    const cls = rate === null ? 'text-[#9C9490]' : rate >= 0 ? 'text-emerald-700' : 'text-rose-600';
                    return <td key={scenario.id} className={`px-2 py-1 text-right font-mono font-bold border-l border-[#EEEBE6] ${cls}`}>{rate === null ? '—' : `${rate.toFixed(2)}%`}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
