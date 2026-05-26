import { useState, useEffect } from 'react';
import { DetailedEstimate, ComparisonResult, Scenario } from './types';
import { createEmptyEstimate } from './data/samples';
import { ExcelGrid } from './components/ExcelGrid';
import { CompareResults } from './components/CompareResults';
import { ScenarioLibrary } from './components/ScenarioLibrary';
import { PrintSheet } from './components/PrintSheet';
import {
  FileSpreadsheet,
  RotateCcw,
  Save,
  Plus,
  Database,
  Info,
  FilePlus,
  Printer,
} from 'lucide-react';
import { auth, loginWithGoogle, logout } from './firebase';
import { subscribeScenarios, saveUserScenario } from './utils/firestoreService';
import { apiPost } from './utils/apiClient';
import { calculateEstimate } from './utils/calculations';

type ActiveView = 'workspace' | 'library';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([]);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [activeView, setActiveView] = useState<ActiveView>('workspace');
  const [activeScenarioId, setActiveScenarioId] = useState('');
  const [newEstimate, setNewEstimate] = useState<DetailedEstimate>(() =>
    JSON.parse(JSON.stringify(createEmptyEstimate()))
  );
  const [oldEstimate, setOldEstimate] = useState<DetailedEstimate>(() =>
    JSON.parse(JSON.stringify(createEmptyEstimate()))
  );

  const [activeSheetTab, setActiveSheetTab] = useState<'workspace' | 'compare' | 'print'>('workspace');
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [aiRetryCountdown, setAiRetryCountdown] = useState<number | null>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) {
      setCustomScenarios([]);
      return;
    }
    const unsub = subscribeScenarios(
      user.uid,
      (scens) => { setCustomScenarios(scens); },
      (error) => { console.error('Firestore loading error:', error); }
    );
    return unsub;
  }, [user]);

  const handleScenarioLoad = (id: string) => {
    const scen = customScenarios.find((s) => s.id === id);
    if (!scen) return;
    setActiveScenarioId(id);
    setNewEstimate(JSON.parse(JSON.stringify(scen.newEstimate)));
    setOldEstimate(JSON.parse(JSON.stringify(scen.oldEstimate)));
    setComparisonResult(scen.comparisonResult);
    setNewScenarioName(scen.name);
    setActiveSheetTab('workspace');
    setActiveView('workspace');
  };

  const handleResetActiveSheet = () => {
    const saved = customScenarios.find((s) => s.id === activeScenarioId);
    if (saved) {
      setNewEstimate(JSON.parse(JSON.stringify(saved.newEstimate)));
      setOldEstimate(JSON.parse(JSON.stringify(saved.oldEstimate)));
      setComparisonResult(saved.comparisonResult);
    } else {
      const emptyEst = createEmptyEstimate();
      setNewEstimate(JSON.parse(JSON.stringify(emptyEst)));
      setOldEstimate(JSON.parse(JSON.stringify(emptyEst)));
      setComparisonResult(null);
    }
    setActiveSheetTab('workspace');
    setActiveView('workspace');
  };

  const handleCreateNewSheet = () => {
    const emptyEst = createEmptyEstimate();
    setActiveScenarioId('new-custom-sheet');
    setOldEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewScenarioName('新規カスタム見積');
    setComparisonResult(null);
    setActiveSheetTab('workspace');
    setActiveView('workspace');
  };

  const handleSaveScenario = async (isOverwriting: boolean = false) => {
    if (!user) {
      alert('クラウド保存を利用するには右上からサインインしてください。');
      return;
    }

    let targetId = activeScenarioId;
    let targetName = newScenarioName.trim();

    if (!isOverwriting || !customScenarios.some(s => s.id === activeScenarioId)) {
      const promptName = prompt(
        '登録する見積シナリオの名称を入力してください:',
        newScenarioName || 'マイカスタム見積シナリオ'
      );
      if (!promptName || !promptName.trim()) return;
      targetName = promptName.trim();
      targetId = '';
    }

    setIsSaving(true);
    try {
      const savedId = await saveUserScenario(
        targetId, targetName, newEstimate, oldEstimate, comparisonResult
      );
      if (savedId) {
        setActiveScenarioId(savedId);
        setNewScenarioName(targetName);
        alert(`見積シナリオ「${targetName}」を正常に保存しました！`);
      }
    } catch (error: any) {
      console.error(error);
      alert('保存に失敗しました。再度お試しください。');
    } finally {
      setIsSaving(false);
    }
  };

  const triggerComparisonAnalysis = async () => {
    setIsComparing(true);
    setComparisonResult(null);
    try {
      const response = await apiPost('/api/compare-estimates', { oldEstimate, newEstimate }, { onRetryCountdown: setAiRetryCountdown });
      const report = await response.json();
      setComparisonResult(report);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'AI価格監査に失敗しました。ログインしているか、入力内容を確認してください。');
    } finally {
      setIsComparing(false);
    }
  };

  // ─── Common sidebar handlers ──────────────────────────────────────────────────

  const updateCommonMeta = (key: 'partNumber' | 'partName' | 'finishedWeightG', value: any) => {
    setOldEstimate(prev => ({ ...prev, [key]: value }));
    setNewEstimate(prev => ({ ...prev, [key]: value }));
  };

  const updateCommonMaterial = (key: 'materialName' | 'inputWeightG', value: any) => {
    const v = key === 'inputWeightG' ? (parseFloat(value) || 0) : value;
    setOldEstimate(prev => ({ ...prev, material: { ...prev.material, [key]: v } }));
    setNewEstimate(prev => ({ ...prev, material: { ...prev.material, [key]: v } }));
  };

  const updateOldAdj = (key: string, value: string) => {
    setOldEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, [key]: parseFloat(value) || 0 } }));
  };

  const updateNewAdj = (key: string, value: string) => {
    setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, [key]: parseFloat(value) || 0 } }));
  };

  // ─── 3-way linkage for ㉘/㉙/㉚ ───────────────────────────────────────────────

  const getNewCost = () =>
    newEstimate.adjustments.actualPurchasePrice > 0
      ? newEstimate.adjustments.actualPurchasePrice
      : newCalc.grandTotalUnitPrice;

  // ㉘ 目標売値 → auto-derive ㉙ markup and ㉚ margin
  const handleNew28Change = (value: string) => {
    const sell = parseFloat(value);
    if (isNaN(sell) || sell <= 0) {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetUnitPrice: sell || 0 } }));
      return;
    }
    const cost = getNewCost();
    if (cost > 0) {
      const markup = (sell - cost) / cost * 100;
      const margin = (sell - cost) / sell * 100;
      setNewEstimate(prev => ({
        ...prev,
        adjustments: {
          ...prev.adjustments,
          targetUnitPrice: sell,
          targetProfitRate: parseFloat(markup.toFixed(2)),
          targetProfitMarginOff: parseFloat(margin.toFixed(2)),
        },
      }));
    } else {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetUnitPrice: sell } }));
    }
  };

  // ㉙ 目標利益率（外掛け）→ auto-derive ㉘ sell price and ㉚ margin
  const handleNew29Change = (value: string) => {
    const markup = parseFloat(value);
    const cost = getNewCost();
    if (!isNaN(markup) && cost > 0 && markup >= 0) {
      const sell = cost * (1 + markup / 100);
      const margin = markup / (1 + markup / 100) * 100;
      setNewEstimate(prev => ({
        ...prev,
        adjustments: {
          ...prev.adjustments,
          targetProfitRate: markup,
          targetUnitPrice: parseFloat(sell.toFixed(2)),
          targetProfitMarginOff: parseFloat(margin.toFixed(2)),
        },
      }));
    } else {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetProfitRate: isNaN(markup) ? 0 : markup } }));
    }
  };

  // ㉚ 目標利益率（内掛け）→ auto-derive ㉘ sell price and ㉙ markup
  const handleNew30Change = (value: string) => {
    const margin = parseFloat(value);
    const cost = getNewCost();
    if (!isNaN(margin) && cost > 0 && margin >= 0 && margin < 100) {
      const sell = cost / (1 - margin / 100);
      const markup = (sell - cost) / cost * 100;
      setNewEstimate(prev => ({
        ...prev,
        adjustments: {
          ...prev.adjustments,
          targetProfitMarginOff: margin,
          targetUnitPrice: parseFloat(sell.toFixed(2)),
          targetProfitRate: parseFloat(markup.toFixed(2)),
        },
      }));
    } else {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetProfitMarginOff: isNaN(margin) ? 0 : margin } }));
    }
  };

  // ─── Derived values ───────────────────────────────────────────────────────────

  const isOverwritable = customScenarios.some(s => s.id === activeScenarioId);
  const oldCalc = calculateEstimate(oldEstimate);
  const newCalc = calculateEstimate(newEstimate);

  // 仕入実費: use actualPurchasePrice if entered, else fall back to calculated grandTotal
  const oldPurchase = oldEstimate.adjustments.actualPurchasePrice > 0
    ? oldEstimate.adjustments.actualPurchasePrice
    : oldCalc.grandTotalUnitPrice;
  const newPurchase = newEstimate.adjustments.actualPurchasePrice > 0
    ? newEstimate.adjustments.actualPurchasePrice
    : newCalc.grandTotalUnitPrice;

  const oldSell = oldEstimate.adjustments.targetUnitPrice || 0;
  const oldMarkup = (oldSell > 0 && oldPurchase > 0) ? ((oldSell - oldPurchase) / oldPurchase * 100) : null;
  const oldMargin = (oldSell > 0 && oldPurchase > 0) ? ((oldSell - oldPurchase) / oldSell * 100) : null;
  const oldGrossPerUnit = oldSell > 0 && oldPurchase > 0 ? oldSell - oldPurchase : null;

  const newSell = newEstimate.adjustments.targetUnitPrice || 0;
  const newMarkup = (newSell > 0 && newPurchase > 0) ? ((newSell - newPurchase) / newPurchase * 100) : null;
  const newMargin = (newSell > 0 && newPurchase > 0) ? ((newSell - newPurchase) / newSell * 100) : null;
  const newGrossPerUnit = newSell > 0 && newPurchase > 0 ? newSell - newPurchase : null;

  const purchaseRatio = (oldPurchase > 0 && newPurchase > 0) ? (newPurchase / oldPurchase * 100) : null;
  const sellRatio = (oldSell > 0 && newSell > 0) ? (newSell / oldSell * 100) : null;
  const purchaseDiff = newPurchase - oldPurchase;
  const sellDiff = newSell - oldSell;

  // ─── Format helpers ───────────────────────────────────────────────────────────

  const fmtYen = (v: number) =>
    v !== 0 ? `¥${v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  const fmtPct = (v: number | null) =>
    v !== null ? `${v.toFixed(2)}%` : '—';

  const profitColorCls = (v: number | null) =>
    v === null ? 'text-[#6B6057]' : v >= 0 ? 'text-emerald-700' : 'text-rose-600';

  const sideInp = 'w-full px-2 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] focus:ring-[#B5451B]/15 transition-all';

  return (
    <div className="h-screen bg-[#F7F6F2] flex flex-col text-[#18130F] font-sans antialiased selection:bg-[#FDE6DC] overflow-hidden">

      {/* HEADER */}
      <header className="bg-[#18130F] text-white sticky top-0 z-50 border-b border-[#2A2018] flex-none">
        <div className="max-w-full px-3 sm:px-6 py-2.5 sm:py-3 flex flex-row items-center justify-between gap-2 sm:gap-4">

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="bg-[#B5451B] p-1.5 sm:p-2 rounded text-white flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] bg-[#B5451B] px-1.5 py-0.5 rounded text-white font-black tracking-widest uppercase">
                  EstiCompare
                </span>
                <span className="text-[9px] bg-[#2A2018] px-1.5 py-0.5 rounded text-[#9C9490] font-mono font-bold hidden sm:inline">
                  互換Webエミュレート
                </span>
              </div>
              <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white mt-0.5 truncate max-w-[160px] sm:max-w-none">
                {newEstimate.partNumber
                  ? <span>{newEstimate.partNumber}_新旧比率積算.xlsm</span>
                  : <span className="text-[#9C9490]">新規シート (未保存)</span>
                }
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAuthLoading ? (
              <span className="text-[10px] text-[#9C9490] font-mono">読込中...</span>
            ) : user ? (
              <div className="flex items-center gap-1.5 sm:gap-2 bg-[#2A2018] px-2 sm:px-3 py-1.5 rounded border border-[#3D3228]">
                <img
                  src={user.photoURL || undefined}
                  alt={user.displayName || 'User'}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full border border-[#B5451B] shrink-0"
                />
                <span className="text-[10px] font-bold text-white max-w-[70px] sm:max-w-[100px] truncate hidden xs:block">
                  {user.displayName}
                </span>
                <span className="inline-block w-2 h-2 bg-[#B5451B] rounded-full shrink-0" title="クラウド自動同期有効" />
                <button
                  onClick={logout}
                  className="ml-0.5 sm:ml-1 text-[10px] text-[#9C9490] hover:text-[#F8C9BB] border-l border-[#3D3228] pl-1.5 sm:pl-2 font-bold cursor-pointer transition-colors"
                >
                  切断
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="bg-[#B5451B] hover:bg-[#8A3215] active:bg-[#6B260F] text-white px-2.5 sm:px-3 py-1.5 rounded border border-[#8A3215] text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                title="Googleアカウントでサインイン"
              >
                <div className="bg-white p-0.5 rounded flex items-center justify-center shrink-0">
                  <span className="text-[10px] text-[#8A3215] font-black px-0.5 leading-none">G</span>
                </div>
                <span className="hidden sm:inline">クラウド同期ログイン</span>
                <span className="sm:hidden">ログイン</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* MIDDLE AREA: sidebar + right pane */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="w-48 flex-none bg-white border-r border-[#D6D0C8] overflow-y-auto flex flex-col">

          {/* Scenario actions */}
          <div className="border-b border-[#D6D0C8] p-2 space-y-1.5">
            <div className="text-[8px] font-black text-[#9C9490] uppercase tracking-widest px-1 pb-0.5">シナリオ操作</div>

            <button
              onClick={() => setActiveView(activeView === 'library' ? 'workspace' : 'library')}
              className={`w-full p-1.5 border rounded font-bold flex items-center gap-1.5 cursor-pointer text-[10px] select-none transition-all ${
                activeView === 'library'
                  ? 'bg-[#B5451B] text-white border-[#8A3215] hover:bg-[#8A3215]'
                  : 'bg-white hover:bg-[#FEF0EB] text-[#B5451B] border-[#D6D0C8] hover:border-[#F8C9BB]'
              }`}
              title="保存済み見積シナリオの一覧・検索・読み込み"
            >
              <Database className="w-3 h-3 shrink-0" />
              <span>マイシナリオ</span>
              {customScenarios.length > 0 && (
                <span className={`ml-auto text-[8px] font-black rounded-full px-1.5 py-0.5 leading-none ${
                  activeView === 'library' ? 'bg-white/20 text-white' : 'bg-[#B5451B] text-white'
                }`}>
                  {customScenarios.length}
                </span>
              )}
            </button>

            <button
              onClick={handleCreateNewSheet}
              className="w-full p-1.5 bg-white hover:bg-[#FEF0EB] text-[#B5451B] border border-[#D6D0C8] hover:border-[#F8C9BB] rounded font-bold flex items-center gap-1.5 cursor-pointer text-[10px] select-none transition-all"
              title="シートを完全にクリアして新しい見積データを作成します。"
            >
              <FilePlus className="w-3 h-3 shrink-0" />
              <span>新規作成</span>
            </button>

            <button
              onClick={handleResetActiveSheet}
              className="w-full p-1.5 bg-white hover:bg-[#F0EDE8] border border-[#D6D0C8] rounded font-bold text-[#6B6057] flex items-center gap-1.5 cursor-pointer text-[10px] select-none transition-all"
              title={isOverwritable ? '保存済みの状態に戻します。' : 'シートを初期化します。'}
            >
              <RotateCcw className="w-3 h-3 text-[#9C9490] shrink-0" />
              <span>数値リセット</span>
            </button>

            {user ? (
              <>
                {isOverwritable && (
                  <button
                    onClick={() => handleSaveScenario(true)}
                    disabled={isSaving}
                    className="w-full p-1.5 bg-white border border-[#D6D0C8] hover:bg-[#F0EDE8] text-[#18130F] rounded font-bold flex items-center gap-1.5 cursor-pointer text-[10px] transition-all disabled:opacity-50"
                  >
                    <Save className="w-3 h-3 shrink-0" />
                    <span>上書き保存</span>
                  </button>
                )}
                <button
                  onClick={() => handleSaveScenario(false)}
                  disabled={isSaving}
                  className="w-full p-1.5 bg-[#B5451B] hover:bg-[#8A3215] text-white rounded font-bold flex items-center gap-1.5 cursor-pointer text-[10px] transition-all disabled:opacity-50"
                >
                  <Plus className="w-3 h-3 shrink-0" />
                  <span className="leading-tight">保存</span>
                </button>
              </>
            ) : (
              <div className="text-[8px] text-[#9C9490] font-bold p-1.5 rounded border border-[#D6D0C8] bg-[#F7F6F2] leading-tight">
                サインインでクラウド保存
              </div>
            )}
          </div>

          {/* 共通諸元 inputs — 見積ロットは各列で設定するため除外 */}
          <div className="border-b border-[#D6D0C8] p-2 space-y-1.5">
            <div className="text-[8px] font-black text-[#9C9490] uppercase tracking-widest px-1 pb-0.5">共通諸元</div>

            <div>
              <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">品番</label>
              <input
                type="text"
                value={newEstimate.partNumber}
                onChange={(e) => updateCommonMeta('partNumber', e.target.value)}
                placeholder="例: 66-13401-09"
                className={sideInp}
              />
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">品名</label>
              <input
                type="text"
                value={newEstimate.partName ?? ''}
                onChange={(e) => updateCommonMeta('partName', e.target.value)}
                placeholder="例: 板金プレス"
                className={sideInp}
              />
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">材質・規格</label>
              <input
                type="text"
                value={newEstimate.material.materialName}
                onChange={(e) => updateCommonMaterial('materialName', e.target.value)}
                placeholder="例: SPCC t2.0"
                className={sideInp}
              />
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">材料投入量 (g)</label>
              <input
                type="number"
                value={newEstimate.material.inputWeightG || ''}
                onChange={(e) => updateCommonMaterial('inputWeightG', e.target.value)}
                placeholder="220"
                className={sideInp}
              />
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">完成品重量 (g)</label>
              <input
                type="number"
                value={newEstimate.finishedWeightG || ''}
                onChange={(e) => updateCommonMeta('finishedWeightG', parseFloat(e.target.value) || 0)}
                placeholder="180"
                className={sideInp}
              />
            </div>
          </div>

          {/* 旧単価 KPI section */}
          <div className="border-b border-[#D6D0C8] p-2 space-y-1.5" style={{ borderTop: '3px solid #B5451B' }}>
            <div className="text-[8px] font-black uppercase tracking-widest px-1 pb-0.5" style={{ color: '#B5451B' }}>旧単価</div>

            <div>
              <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">㉑ 仕入実費</label>
              <div className="relative">
                <span className="absolute left-2 top-1 text-[9px] text-[#9C9490]">¥</span>
                <input
                  type="number"
                  value={oldEstimate.adjustments.actualPurchasePrice || ''}
                  onChange={(e) => updateOldAdj('actualPurchasePrice', e.target.value)}
                  placeholder="実際の仕入単価"
                  className={`${sideInp} pl-5`}
                />
              </div>
              {oldCalc.grandTotalUnitPrice > 0 && (
                <div className="text-[8px] text-[#9C9490] mt-0.5 font-mono">
                  算出: {fmtYen(oldCalc.grandTotalUnitPrice)}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">㉒ 現行売価</label>
              <div className="relative">
                <span className="absolute left-2 top-1 text-[9px] text-[#9C9490]">¥</span>
                <input
                  type="number"
                  value={oldEstimate.adjustments.targetUnitPrice || ''}
                  onChange={(e) => updateOldAdj('targetUnitPrice', e.target.value)}
                  placeholder="現行売値"
                  className={`${sideInp} pl-5`}
                />
              </div>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-[#6B6057]">㉓ 利益率（外掛け）</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(oldMarkup)}`}>{fmtPct(oldMarkup)}</span>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-[#6B6057]">㉔ 利益率（内掛け）</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(oldMargin)}`}>{fmtPct(oldMargin)}</span>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-[#6B6057]">㉕ 粗利益/個</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(oldGrossPerUnit)}`}>
                {oldGrossPerUnit !== null ? fmtYen(oldGrossPerUnit) : '—'}
              </span>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">㉖ 設定時期 (yyyymm)</label>
              <input
                type="text"
                value={oldEstimate.date || ''}
                onChange={(e) => setOldEstimate(prev => ({ ...prev, date: e.target.value }))}
                placeholder="例: 202501"
                maxLength={6}
                className={sideInp}
              />
            </div>
          </div>

          {/* 新単価 KPI section */}
          <div className="p-2 space-y-1.5" style={{ borderTop: '3px solid #1E3A5F' }}>
            <div className="text-[8px] font-black uppercase tracking-widest px-1 pb-0.5" style={{ color: '#1E3A5F' }}>新単価</div>

            <div>
              <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">㉗ 仕入実費</label>
              <div className="relative">
                <span className="absolute left-2 top-1 text-[9px] text-[#9C9490]">¥</span>
                <input
                  type="number"
                  value={newEstimate.adjustments.actualPurchasePrice || ''}
                  onChange={(e) => updateNewAdj('actualPurchasePrice', e.target.value)}
                  placeholder="実際の仕入単価"
                  className={`${sideInp} pl-5`}
                />
              </div>
              {newCalc.grandTotalUnitPrice > 0 && (
                <div className="text-[8px] text-[#9C9490] mt-0.5 font-mono">
                  算出: {fmtYen(newCalc.grandTotalUnitPrice)}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#1E3A5F] mb-0.5">
                ㉘ 目標売値
                <span className="text-[8px] text-[#9C9490] font-normal ml-1">← 連動</span>
              </label>
              <div className="relative">
                <span className="absolute left-2 top-1 text-[9px] text-[#9C9490]">¥</span>
                <input
                  type="number"
                  value={newEstimate.adjustments.targetUnitPrice || ''}
                  onChange={(e) => handleNew28Change(e.target.value)}
                  placeholder="目標売値"
                  className={`${sideInp} pl-5 border-[#93B4D9] focus:border-[#1E3A5F] focus:ring-[#1E3A5F]/15`}
                />
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#1E3A5F] mb-0.5">
                ㉙ 目標利益率（外掛け）
                <span className="text-[8px] text-[#9C9490] font-normal ml-1">← 連動</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={newEstimate.adjustments.targetProfitRate || ''}
                  onChange={(e) => handleNew29Change(e.target.value)}
                  placeholder="例: 25"
                  className={`${sideInp} pr-6 border-[#93B4D9] focus:border-[#1E3A5F] focus:ring-[#1E3A5F]/15`}
                />
                <span className="absolute right-2 top-1 text-[9px] text-[#9C9490]">%</span>
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#1E3A5F] mb-0.5">
                ㉚ 目標利益率（内掛け）
                <span className="text-[8px] text-[#9C9490] font-normal ml-1">← 連動</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={newEstimate.adjustments.targetProfitMarginOff || ''}
                  onChange={(e) => handleNew30Change(e.target.value)}
                  placeholder="例: 20"
                  className={`${sideInp} pr-6 border-[#93B4D9] focus:border-[#1E3A5F] focus:ring-[#1E3A5F]/15`}
                />
                <span className="absolute right-2 top-1 text-[9px] text-[#9C9490]">%</span>
              </div>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-[9px] text-[#6B6057]">㉛ 粗利益/個</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(newGrossPerUnit)}`}>
                {newGrossPerUnit !== null ? fmtYen(newGrossPerUnit) : '—'}
              </span>
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">㉜ 下限利益率 (%)</label>
              <input
                type="number"
                value={newEstimate.adjustments.minProfitRate ?? ''}
                onChange={(e) => updateNewAdj('minProfitRate', e.target.value)}
                placeholder="例: 15"
                className={sideInp}
              />
            </div>
          </div>

        </aside>

        {/* ── RIGHT PANE ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── Sticky calculation header — light, high-contrast ── */}
          <div className="flex-none bg-[#F0EDE8] border-b-2 border-[#C8C2B8] px-3 py-3 sm:py-4">
            <div className="flex gap-2 sm:gap-3">

              {/* 旧単価 panel */}
              <div className="flex-1 min-w-0 bg-white rounded-lg border border-[#E0C0B0] overflow-hidden shadow-sm">
                <div className="bg-[#FEF0EB] px-3 py-1.5 border-b border-[#E8C8BC] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-[#B5451B] shrink-0" />
                  <span className="text-[9px] font-black text-[#B5451B] uppercase tracking-wider">旧単価</span>
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-[9px] text-[#9C9490] font-bold shrink-0">仕入実費 ㉑</span>
                    <span className="font-mono font-black text-xs text-[#18130F] truncate">{fmtYen(oldPurchase)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-[9px] text-[#9C9490] font-bold shrink-0">現行売値 ㉒</span>
                    <span className="font-mono font-black text-sm text-[#18130F] truncate">{oldSell > 0 ? fmtYen(oldSell) : <span className="text-[#C8C2B8] text-xs">未入力</span>}</span>
                  </div>
                  {oldGrossPerUnit !== null && (
                    <div className="flex items-baseline justify-between gap-1 pt-1 border-t border-[#F0EDE8]">
                      <span className="text-[9px] text-[#9C9490] font-bold shrink-0">粗利益 ㉕</span>
                      <span className={`font-mono font-black text-xs truncate ${profitColorCls(oldGrossPerUnit)}`}>{fmtYen(oldGrossPerUnit)}</span>
                    </div>
                  )}
                  {oldMarkup !== null && (
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[9px] text-[#9C9490] font-bold shrink-0">外掛け ㉓</span>
                      <span className={`font-mono font-black text-xs ${profitColorCls(oldMarkup)}`}>{fmtPct(oldMarkup)}</span>
                    </div>
                  )}
                  {oldMargin !== null && (
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[9px] text-[#9C9490] font-bold shrink-0">内掛け ㉔</span>
                      <span className={`font-mono font-black text-xs ${profitColorCls(oldMargin)}`}>{fmtPct(oldMargin)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 新単価 panel */}
              <div className="flex-1 min-w-0 bg-white rounded-lg border border-[#A8C4E0] overflow-hidden shadow-sm">
                <div className="bg-[#EFF4FD] px-3 py-1.5 border-b border-[#B8CCE8] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm bg-[#1E3A5F] shrink-0" />
                  <span className="text-[9px] font-black text-[#1E3A5F] uppercase tracking-wider">新単価</span>
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-[9px] text-[#9C9490] font-bold shrink-0">仕入実費 ㉗</span>
                    <span className="font-mono font-black text-xs text-[#18130F] truncate">{fmtYen(newPurchase)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-[9px] text-[#9C9490] font-bold shrink-0">目標売値 ㉘</span>
                    <span className="font-mono font-black text-sm text-[#1E3A5F] truncate">{newSell > 0 ? fmtYen(newSell) : <span className="text-[#C8C2B8] text-xs">未入力</span>}</span>
                  </div>
                  {newGrossPerUnit !== null && (
                    <div className="flex items-baseline justify-between gap-1 pt-1 border-t border-[#F0EDE8]">
                      <span className="text-[9px] text-[#9C9490] font-bold shrink-0">粗利益 ㉛</span>
                      <span className={`font-mono font-black text-xs truncate ${profitColorCls(newGrossPerUnit)}`}>{fmtYen(newGrossPerUnit)}</span>
                    </div>
                  )}
                  {newMarkup !== null && (
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[9px] text-[#9C9490] font-bold shrink-0">外掛け ㉙</span>
                      <span className={`font-mono font-black text-xs ${profitColorCls(newMarkup)}`}>{fmtPct(newMarkup)}</span>
                    </div>
                  )}
                  {newMargin !== null && (
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[9px] text-[#9C9490] font-bold shrink-0">内掛け ㉚</span>
                      <span className={`font-mono font-black text-xs ${profitColorCls(newMargin)}`}>{fmtPct(newMargin)}</span>
                    </div>
                  )}
                  {purchaseRatio !== null && (
                    <div className="flex items-baseline justify-between gap-1 pt-1 border-t border-[#F0EDE8]">
                      <span className="text-[9px] text-[#9C9490] font-bold shrink-0">仕入比 新/旧</span>
                      <span className={`font-mono font-black text-xs ${purchaseDiff > 0.01 ? 'text-rose-600' : purchaseDiff < -0.01 ? 'text-emerald-700' : 'text-[#6B6057]'}`}>
                        {purchaseRatio.toFixed(1)}%
                        <span className="text-[8px] ml-1 opacity-80">({purchaseDiff > 0 ? '+' : ''}{purchaseDiff.toFixed(0)})</span>
                      </span>
                    </div>
                  )}
                  {sellRatio !== null && (
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[9px] text-[#9C9490] font-bold shrink-0">売価比 新/旧</span>
                      <span className={`font-mono font-black text-xs ${sellDiff > 0.01 ? 'text-rose-600' : sellDiff < -0.01 ? 'text-emerald-700' : 'text-[#6B6057]'}`}>
                        {sellRatio.toFixed(1)}%
                        <span className="text-[8px] ml-1 opacity-80">({sellDiff > 0 ? '+' : ''}{sellDiff.toFixed(0)})</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Scrollable main area */}
          <main className="flex-1 overflow-y-auto p-3 sm:p-5">
            {activeView === 'library' ? (
              <ScenarioLibrary
                scenarios={customScenarios}
                onLoad={handleScenarioLoad}
                onBack={() => setActiveView('workspace')}
                isLoggedIn={!!user}
                onNewSheet={handleCreateNewSheet}
              />
            ) : (
              <section>
                {activeSheetTab === 'workspace' && (
                  <ExcelGrid
                    title="【新旧見積対比・調整シミュレーター】"
                    oldEstimate={oldEstimate}
                    onChangeOld={setOldEstimate}
                    newEstimate={newEstimate}
                    onChangeNew={setNewEstimate}
                    historyScenarios={customScenarios.filter(
                      (s) => s.newEstimate.partNumber.trim() !== '' &&
                             s.newEstimate.partNumber === newEstimate.partNumber &&
                             s.id !== activeScenarioId
                    )}
                    onLoadHistory={handleScenarioLoad}
                  />
                )}

                {activeSheetTab === 'compare' && (
                  <CompareResults
                    oldEstimate={oldEstimate}
                    newEstimate={newEstimate}
                    comparison={comparisonResult}
                    isLoading={isComparing}
                    retryCountdown={aiRetryCountdown}
                    onRunComparison={triggerComparisonAnalysis}
                  />
                )}

                {activeSheetTab === 'print' && (
                  <PrintSheet
                    oldEstimate={oldEstimate}
                    newEstimate={newEstimate}
                  />
                )}
              </section>
            )}
          </main>

        </div>
      </div>

      {/* BOTTOM TAB BAR — hidden in library view */}
      {activeView === 'workspace' && (
        <nav className="bg-white border-t-2 border-[#D6D0C8] flex-none z-40 select-none">
          <div className="px-3 sm:px-6 flex flex-row items-center justify-between gap-2 text-xs">

            <div className="flex items-stretch divide-x divide-[#EEEBE6] flex-1">

              <button
                onClick={() => setActiveSheetTab('workspace')}
                className={`px-3 sm:px-5 py-3.5 sm:py-4 font-black flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer text-xs transition-all flex-1 border-t-2 ${
                  activeSheetTab === 'workspace'
                    ? 'border-t-[#B5451B] bg-[#FEF0EB] text-[#B5451B]'
                    : 'border-t-transparent bg-white text-[#9C9490] hover:text-[#6B6057] hover:bg-[#F7F6F2]'
                }`}
              >
                <span className="text-[#9C9490] font-mono text-[9px] sm:text-[10px] shrink-0">Sheet1!</span>
                <span className="hidden sm:inline">1. 新旧見開き調整ワークスペース (Workspace)</span>
                <span className="sm:hidden">入力・調整</span>
              </button>

              <button
                onClick={() => setActiveSheetTab('compare')}
                className={`px-3 sm:px-5 py-3.5 sm:py-4 font-black flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer text-xs transition-all flex-1 border-t-2 ${
                  activeSheetTab === 'compare'
                    ? 'border-t-[#B5451B] bg-[#FEF0EB] text-[#B5451B]'
                    : 'border-t-transparent bg-white text-[#9C9490] hover:text-[#B5451B] hover:bg-[#F7F6F2]'
                }`}
              >
                <span className={`font-mono text-[9px] sm:text-[10px] font-black shrink-0 ${activeSheetTab === 'compare' ? 'text-[#B5451B]' : 'text-[#9C9490]'}`}>Sheet2!</span>
                <span className="hidden sm:inline">2. 差額要因分析・説明調整監査報告 (Audit)</span>
                <span className="sm:hidden">差額分析</span>
              </button>

              <button
                onClick={() => setActiveSheetTab('print')}
                className={`px-3 sm:px-5 py-3.5 sm:py-4 font-black flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer text-xs transition-all flex-1 border-t-2 ${
                  activeSheetTab === 'print'
                    ? 'border-t-[#2A4A7F] bg-[#EBF0FA] text-[#2A4A7F]'
                    : 'border-t-transparent bg-white text-[#9C9490] hover:text-[#2A4A7F] hover:bg-[#F0F4FB]'
                }`}
              >
                <Printer className={`w-3.5 h-3.5 shrink-0 ${activeSheetTab === 'print' ? 'text-[#2A4A7F]' : 'text-[#9C9490]'}`} />
                <span className={`font-mono text-[9px] sm:text-[10px] font-black shrink-0 ${activeSheetTab === 'print' ? 'text-[#2A4A7F]' : 'text-[#9C9490]'}`}>Sheet3!</span>
                <span className="hidden sm:inline">3. 見積書 印刷・Excel出力 (Print)</span>
                <span className="sm:hidden">印刷・出力</span>
              </button>

            </div>

            <div className="text-[10px] text-[#9C9490] font-bold select-none py-3 hidden lg:flex items-center gap-2 shrink-0">
              <Info className="w-3.5 h-3.5 text-[#9C9490]" />
              <span>仕入値や目標単価を入力すると、すべてのExcelセル連動公式が即時反映されます。</span>
            </div>

          </div>
        </nav>
      )}

    </div>
  );
}
