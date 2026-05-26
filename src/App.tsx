import { useState, useEffect } from 'react';
import { DetailedEstimate, ComparisonResult, Scenario } from './types';
import { createEmptyEstimate } from './data/samples';
import { ExcelGrid, ProfitGauge } from './components/ExcelGrid';
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
  BarChart3,
  Zap,
  Settings2,
  CheckCircle2,
  AlertTriangle,
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
  const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [aiTestMsg, setAiTestMsg] = useState('');

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
    const parsed = parseFloat(value);
    setOldEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, [key]: isNaN(parsed) ? 0 : parsed } }));
  };

  const updateNewAdj = (key: string, value: string) => {
    const parsed = parseFloat(value);
    setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, [key]: isNaN(parsed) ? 0 : parsed } }));
  };

  const updateAdj = (isNew: boolean, key: string, value: string) => {
    const parsed = parseFloat(value);
    const val = isNaN(parsed) ? 0 : parsed;
    if (key === 'targetProfitRate') {
      setOldEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, [key]: val } }));
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, [key]: val } }));
    } else if (isNew) {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, [key]: val } }));
    } else {
      setOldEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, [key]: val } }));
    }
  };

  const toggleSgaMode = (isNew: boolean) => {
    if (isNew) {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, sgaCalcMode: (prev.adjustments.sgaCalcMode || 'markup') === 'markup' ? 'margin' : 'markup' } }));
    } else {
      setOldEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, sgaCalcMode: (prev.adjustments.sgaCalcMode || 'markup') === 'markup' ? 'margin' : 'markup' } }));
    }
  };

  const handleFitToSellPrice = (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const calc = isNew ? newCalc : oldCalc;
    const targetSell = est.adjustments.targetUnitPrice;
    if (!targetSell || targetSell <= 0) {
      alert('先に目標売値を入力してください。');
      return;
    }
    const primeCost = calc.primeCost;
    if (primeCost <= 0) {
      alert('材料費・加工費を先に入力してください。');
      return;
    }
    const base = targetSell - calc.shippingCostPerUnit - (est.adjustments.otherAdjustment || 0);
    if (base <= primeCost * 0.01) {
      alert('目標売値が積み上げコストより低すぎます。');
      return;
    }
    const mode = est.adjustments.sgaCalcMode || 'markup';
    const newRate = mode === 'margin'
      ? (1 - primeCost / base) * 100
      : (base / primeCost - 1) * 100;
    if (newRate < 0) {
      alert(`目標売値が積み上げコスト(¥${primeCost.toFixed(0)})を下回るため設定できません。`);
      return;
    }
    if (isNew) setNewEstimate({ ...est, adjustments: { ...est.adjustments, sgaRatePercent: parseFloat(newRate.toFixed(2)) } });
    else setOldEstimate({ ...est, adjustments: { ...est.adjustments, sgaRatePercent: parseFloat(newRate.toFixed(2)) } });
  };

  const handleAutoReconcile = (isNew: boolean) => {
    const target = isNew ? newEstimate : oldEstimate;
    const calc = isNew ? newCalc : oldCalc;
    const minProfitPercent = target.adjustments.minProfitRate || 0;
    const targetProfitPercent = target.adjustments.targetProfitRate || 0;
    const actualTotalCost = calc.actualTotalCost;
    const minRequiredSellingPrice = actualTotalCost * (1 + minProfitPercent / 100);
    const targetRequiredSellingPrice = actualTotalCost * (1 + targetProfitPercent / 100);
    let targetUnitPrice = target.adjustments.targetUnitPrice || 0;
    let reconciledUnitPrice = targetUnitPrice;
    if (targetUnitPrice <= 0) {
      reconciledUnitPrice = Math.round(targetRequiredSellingPrice);
    } else if (targetUnitPrice < minRequiredSellingPrice) {
      reconciledUnitPrice = Math.ceil(minRequiredSellingPrice);
      alert(`【下限利益率アラート】\n決定単価が下限利益率(${minProfitPercent}%)を維持できる最低単価 (¥${minRequiredSellingPrice.toFixed(2)}) を下回っているため、¥${reconciledUnitPrice.toFixed(2)} に自動引き上げします。`);
    }
    const updatedAdjustments = { ...target.adjustments, targetUnitPrice: reconciledUnitPrice };
    const shipping = calc.shippingCostPerUnit;
    const otherAdj = target.adjustments.otherAdjustment || 0;
    const Y = reconciledUnitPrice - shipping - otherAdj;
    if (Y <= 0) { alert("目標単価が低すぎるため、加工費の自動調整ができません。"); return; }
    const validProcesses = target.processes.filter(p => p.processName.trim() !== '' && !p.isDirectInput);
    if (validProcesses.length === 0) { alert("加工費の自動調整対象となる工程が見つかりません。"); return; }
    const lotSize = target.baseLotSize || 1;
    const processHoursList = target.processes.map(proc => {
      if (!proc.processName.trim() || proc.isDirectInput) return 0;
      return (proc.yieldPerHour > 0 ? 1 / proc.yieldPerHour : 0) + (lotSize > 0 ? (proc.totalHours || 0) / lotSize : 0);
    });
    const currentTotalProcessCostTemp = target.processes.reduce((sum, proc, i) => {
      if (!proc.processName.trim() || proc.isDirectInput) return sum;
      return sum + (processHoursList[i] * (proc.actualHourlyRate ?? proc.hourlyRate ?? 3000));
    }, 0);
    let draftProcesses = [...target.processes];
    const sgaMode = target.adjustments.sgaCalcMode || 'markup';
    let finalSgaPercent = target.adjustments.sgaRatePercent ?? 15;
    const materialCost = calc.netMaterialCost;
    const directInputTotal = target.processes.reduce((sum, proc) => {
      if (!proc.processName.trim() || !proc.isDirectInput) return sum;
      return sum + (proc.directProcessingCost || 0);
    }, 0);
    if (currentTotalProcessCostTemp > 0) {
      const targetPrimeCost = sgaMode === 'margin'
        ? Y * (1 - finalSgaPercent / 100)
        : Y / (1 + finalSgaPercent / 100);
      const targetNonDirectProcessCost = Math.max(0, targetPrimeCost - materialCost - directInputTotal);
      const multiplier = Math.max(0.1, targetNonDirectProcessCost / currentTotalProcessCostTemp);
      draftProcesses = target.processes.map((proc) => {
        if (!proc.processName.trim() || proc.isDirectInput) return proc;
        const actRate = proc.actualHourlyRate ?? proc.hourlyRate ?? 3000;
        let roundedRate = Math.round((actRate * multiplier) / 100) * 100;
        if (roundedRate < 1000) roundedRate = 1000;
        return { ...proc, hourlyRate: roundedRate };
      });
    }
    const tempPrimeCost = materialCost + draftProcesses.reduce((sum, proc, i) => {
      if (!proc.processName.trim()) return sum;
      if (proc.isDirectInput) return sum + (proc.directProcessingCost || 0);
      return sum + (processHoursList[i] * (proc.hourlyRate || 0));
    }, 0);
    if (tempPrimeCost > 0) {
      finalSgaPercent = sgaMode === 'margin'
        ? Math.max(0, Math.round((1 - tempPrimeCost / Y) * 10000) / 100)
        : Math.max(0, Math.round(((Y / tempPrimeCost) - 1) * 10000) / 100);
    }
    updatedAdjustments.sgaRatePercent = finalSgaPercent;
    if (isNew) setNewEstimate({ ...target, processes: draftProcesses, adjustments: updatedAdjustments });
    else setOldEstimate({ ...target, processes: draftProcesses, adjustments: updatedAdjustments });
  };

  // ─── 3-way linkage for ㉘/㉙/㉚ ───────────────────────────────────────────────

  const getNewCost = () =>
    newEstimate.adjustments.actualPurchasePrice > 0
      ? newEstimate.adjustments.actualPurchasePrice
      : newCalc.grandTotalUnitPrice;

  // ㉘ 目標売値 → auto-derive ㉙ markup only (internal)
  const handleNew28Change = (value: string) => {
    const sell = parseFloat(value);
    if (isNaN(sell) || sell <= 0) {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetUnitPrice: 0 } }));
      return;
    }
    const cost = getNewCost();
    if (cost > 0) {
      const markup = (sell - cost) / cost * 100;
      setNewEstimate(prev => ({
        ...prev,
        adjustments: {
          ...prev.adjustments,
          targetUnitPrice: sell,
          targetProfitRate: parseFloat(markup.toFixed(2)),
        },
      }));
    } else {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetUnitPrice: sell } }));
    }
  };

  // ㉙ 目標利益率（外掛け）→ auto-derive ㉘ sell price only (internal)
  const handleNew29Change = (value: string) => {
    const markup = parseFloat(value);
    const cost = getNewCost();
    if (!isNaN(markup) && cost > 0) {
      const sell = cost * (1 + markup / 100);
      setNewEstimate(prev => ({
        ...prev,
        adjustments: {
          ...prev.adjustments,
          targetProfitRate: markup,
          targetUnitPrice: sell > 0 ? parseFloat(sell.toFixed(2)) : 0,
        },
      }));
    } else {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetProfitRate: isNaN(markup) ? 0 : markup } }));
    }
  };

  // 得意先用目標利益率（外掛け）→ derive targetProfitMarginOff (internal margin for client)
  const handleNewClientMarkupChange = (value: string) => {
    const mu = parseFloat(value);
    if (!isNaN(mu) && mu >= 0) {
      const mg = mu / (1 + mu / 100); // store full precision to avoid round-trip drift
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetProfitMarginOff: mg } }));
    } else {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetProfitMarginOff: 0 } }));
    }
  };

  // 得意先用目標利益率（内掛け）→ directly sets targetProfitMarginOff
  const handleNewClientMarginChange = (value: string) => {
    const m = parseFloat(value);
    setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetProfitMarginOff: isNaN(m) ? 0 : m } }));
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

  // ㉚ derived display values (internal)
  const newInternalMarkup = newEstimate.adjustments.targetProfitRate || 0;
  const newInternalMargin = newInternalMarkup > 0 ? newInternalMarkup / (1 + newInternalMarkup / 100) : null;
  // 得意先用: derive external markup from stored internal margin
  const newClientMarginOff = newEstimate.adjustments.targetProfitMarginOff || 0;
  const newClientMarkupOff = newClientMarginOff > 0 && newClientMarginOff < 100
    ? parseFloat((newClientMarginOff / (1 - newClientMarginOff / 100)).toFixed(4))
    : null;

  const purchaseRatio = (oldPurchase > 0 && newPurchase > 0) ? (newPurchase / oldPurchase * 100) : null;
  const sellRatio = (oldSell > 0 && newSell > 0) ? (newSell / oldSell * 100) : null;
  const purchaseDiff = newPurchase - oldPurchase;
  const sellDiff = newSell - oldSell;

  // 目標売値と計算仕入値の差（賃率調整でリアルタイム変動）
  const oldGapToTarget = (oldSell > 0 && oldCalc.grandTotalUnitPrice > 0) ? oldSell - oldCalc.grandTotalUnitPrice : null;
  const newGapToTarget = (newSell > 0 && newCalc.grandTotalUnitPrice > 0) ? newSell - newCalc.grandTotalUnitPrice : null;
  // 計算仕入値を使った外掛け/内掛け（常時表示用）
  const oldCalcMarkup = (oldSell > 0 && oldCalc.grandTotalUnitPrice > 0) ? ((oldSell - oldCalc.grandTotalUnitPrice) / oldCalc.grandTotalUnitPrice * 100) : null;
  const oldCalcMargin = (oldSell > 0 && oldCalc.grandTotalUnitPrice > 0) ? ((oldSell - oldCalc.grandTotalUnitPrice) / oldSell * 100) : null;
  const newCalcMarkup = (newSell > 0 && newCalc.grandTotalUnitPrice > 0) ? ((newSell - newCalc.grandTotalUnitPrice) / newCalc.grandTotalUnitPrice * 100) : null;
  const newCalcMargin = (newSell > 0 && newCalc.grandTotalUnitPrice > 0) ? ((newSell - newCalc.grandTotalUnitPrice) / newSell * 100) : null;

  // ─── Format helpers ───────────────────────────────────────────────────────────

  const fmtYen = (v: number) =>
    v !== 0 ? `¥${v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  const fmtPct = (v: number | null) =>
    v !== null ? `${v.toFixed(2)}%` : '—';

  const profitColorCls = (v: number | null) =>
    v === null ? 'text-[#6B6057]' : v >= 0 ? 'text-emerald-700' : 'text-rose-600';

  const sideInp = 'w-full px-2 py-1 text-sm font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] focus:ring-[#B5451B]/15 transition-all';

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
        <aside className="w-72 flex-none bg-white border-r border-[#D6D0C8] overflow-y-auto flex flex-col">

          {/* Scenario actions */}
          <div className="border-b border-[#D6D0C8] p-2 space-y-1.5">
            <div className="text-[10px] font-black text-[#9C9490] uppercase tracking-widest px-1 pb-0.5">シナリオ操作</div>

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
            <div className="text-[10px] font-black text-[#9C9490] uppercase tracking-widest px-1 pb-0.5">共通諸元</div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">品番</label>
              <input
                type="text"
                value={newEstimate.partNumber}
                onChange={(e) => updateCommonMeta('partNumber', e.target.value)}
                placeholder="例: 66-13401-09"
                className={sideInp}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">品名</label>
              <input
                type="text"
                value={newEstimate.partName ?? ''}
                onChange={(e) => updateCommonMeta('partName', e.target.value)}
                placeholder="例: 板金プレス"
                className={sideInp}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">材質・規格</label>
              <input
                type="text"
                value={newEstimate.material.materialName}
                onChange={(e) => updateCommonMaterial('materialName', e.target.value)}
                placeholder="例: SPCC t2.0"
                className={sideInp}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">材料投入量 (g)</label>
              <input
                type="number"
                value={newEstimate.material.inputWeightG || ''}
                onChange={(e) => updateCommonMaterial('inputWeightG', e.target.value)}
                placeholder="220"
                className={sideInp}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">完成品重量 (g)</label>
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
            <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-0.5" style={{ color: '#B5451B' }}>旧単価</div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">㉑ 仕入実費</label>
              <div className="relative">
                <span className="absolute left-2 top-1 text-xs text-[#9C9490]">¥</span>
                <input
                  type="number"
                  value={oldEstimate.adjustments.actualPurchasePrice || ''}
                  onChange={(e) => updateOldAdj('actualPurchasePrice', e.target.value)}
                  placeholder="実際の仕入単価"
                  className={`${sideInp} pl-5`}
                />
              </div>
              {oldCalc.grandTotalUnitPrice > 0 && (
                <div className="text-[10px] text-[#9C9490] mt-0.5 font-mono">
                  算出: {fmtYen(oldCalc.grandTotalUnitPrice)}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">㉒ 現行売価</label>
              <div className="relative">
                <span className="absolute left-2 top-1 text-xs text-[#9C9490]">¥</span>
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
              <span className="text-xs text-[#18130F] font-bold">㉓ 利益率（外掛け）</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(oldMarkup)}`}>{fmtPct(oldMarkup)}</span>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#18130F] font-bold">㉔ 利益率（内掛け）</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(oldMargin)}`}>{fmtPct(oldMargin)}</span>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#18130F] font-bold">㉕ 粗利益/個</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(oldGrossPerUnit)}`}>
                {oldGrossPerUnit !== null ? fmtYen(oldGrossPerUnit) : '—'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">㉖ 下限利益率 (%)</label>
              <input
                type="number"
                value={oldEstimate.adjustments.minProfitRate || ''}
                onChange={(e) => updateOldAdj('minProfitRate', e.target.value)}
                placeholder="例: 15"
                className={sideInp}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">㉗ 設定時期 (yyyymm)</label>
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
            <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-0.5" style={{ color: '#1E3A5F' }}>新単価</div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">㉗ 仕入実費</label>
              <div className="relative">
                <span className="absolute left-2 top-1 text-xs text-[#9C9490]">¥</span>
                <input
                  type="number"
                  value={newEstimate.adjustments.actualPurchasePrice || ''}
                  onChange={(e) => updateNewAdj('actualPurchasePrice', e.target.value)}
                  placeholder="実際の仕入単価"
                  className={`${sideInp} pl-5`}
                />
              </div>
              {newCalc.grandTotalUnitPrice > 0 && (
                <div className="text-[10px] text-[#9C9490] mt-0.5 font-mono">
                  算出: {fmtYen(newCalc.grandTotalUnitPrice)}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[9px] font-bold text-[#1E3A5F] mb-0.5">
                ㉘ 目標売値
                <span className="text-[10px] text-[#9C9490] font-normal ml-1">← 連動</span>
              </label>
              <div className="relative">
                <span className="absolute left-2 top-1 text-xs text-[#9C9490]">¥</span>
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
                <span className="text-[10px] text-[#9C9490] font-normal ml-1">← 連動</span>
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

            <div className="flex justify-between items-baseline px-0.5">
              <span className="text-[9px] font-bold text-[#1E3A5F]">㉚ 目標利益率（内掛け）</span>
              <span className="font-mono font-black text-xs text-[#1E3A5F]">
                {newInternalMargin !== null ? `${newInternalMargin.toFixed(2)}%` : '—'}
              </span>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#18130F] font-bold">㉛ 粗利益/個</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(newGrossPerUnit)}`}>
                {newGrossPerUnit !== null ? fmtYen(newGrossPerUnit) : '—'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">㉜ 下限利益率 (%)</label>
              <input
                type="number"
                value={newEstimate.adjustments.minProfitRate || ''}
                onChange={(e) => updateNewAdj('minProfitRate', e.target.value)}
                placeholder="例: 15"
                className={sideInp}
              />
            </div>

            {/* 得意先用目標利益率 */}
            <div className="pt-1 border-t border-[#C5D8EE]">
              <div className="text-[9px] font-black uppercase tracking-widest text-[#6B6057] mb-1">得意先用目標利益率</div>
              <div className="space-y-1">
                <div>
                  <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">
                    外掛け
                    <span className="text-[9px] font-normal ml-1">→ 内掛け連動</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={newClientMarkupOff !== null ? newClientMarkupOff : ''}
                      onChange={(e) => handleNewClientMarkupChange(e.target.value)}
                      placeholder="例: 17.6"
                      className={`${sideInp} pr-6 text-sm border-[#C8C2B8] focus:border-[#6B6057] focus:ring-[#6B6057]/15`}
                    />
                    <span className="absolute right-2 top-1 text-[9px] text-[#9C9490]">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-[#6B6057] mb-0.5">
                    内掛け
                    <span className="text-[9px] font-normal ml-1">→ 外掛け連動</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={newClientMarginOff || ''}
                      onChange={(e) => handleNewClientMarginChange(e.target.value)}
                      placeholder="例: 15"
                      className={`${sideInp} pr-6 text-sm border-[#C8C2B8] focus:border-[#6B6057] focus:ring-[#6B6057]/15`}
                    />
                    <span className="absolute right-2 top-1 text-[9px] text-[#9C9490]">%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </aside>

        {/* ── RIGHT PANE ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── Sticky calculation header ── */}
          <div className="flex-none bg-[#F0EDE8] border-b-2 border-[#C8C2B8] px-3 py-3">
            <div className="flex gap-2 sm:gap-3">

              {/* 旧単価 panel — 2列グリッドで詰める */}
              <div className="flex-1 min-w-0 bg-white rounded-lg border border-[#E0C0B0] overflow-hidden shadow-sm flex flex-col max-h-[calc(50vh)]">
                <div className="bg-[#FEF0EB] px-3 py-1 border-b border-[#E8C8BC] flex items-center gap-1.5 flex-wrap flex-none">
                  <span className="w-2 h-2 rounded-sm bg-[#B5451B] shrink-0" />
                  <span className="text-xs font-black text-[#B5451B] uppercase tracking-wider">旧単価</span>
                  {/* B: Constraint badges */}
                  {oldMarkup !== null && (
                    <span className={`text-[9px] font-black px-1 py-0.5 rounded border leading-none ${
                      oldMarkup >= 25 ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-rose-100 text-rose-700 border-rose-300'
                    }`}>外{oldMarkup >= 25 ? '✓' : '✗'}25%</span>
                  )}
                  {oldEstimate.adjustments.targetProfitMarginOff > 0 && (
                    <span className={`text-[9px] font-black px-1 py-0.5 rounded border leading-none ${
                      oldEstimate.adjustments.targetProfitMarginOff <= 15 ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-amber-100 text-amber-700 border-amber-300'
                    }`}>内{oldEstimate.adjustments.targetProfitMarginOff <= 15 ? '✓' : '!'}15%</span>
                  )}
                  {oldEstimate.adjustments.actualPurchasePrice > 0 && (
                    <span className="ml-auto text-[10px] text-[#9C9490]">㉑実費: <strong className="font-mono text-[#18130F]">{fmtYen(oldEstimate.adjustments.actualPurchasePrice)}</strong></span>
                  )}
                </div>
                <div className="px-3 py-2 overflow-y-auto flex-1">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {/* 計算仕入値 */}
                    <div>
                      <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">計算仕入値</div>
                      <div className="font-mono font-black text-sm text-[#18130F]">
                        {oldCalc.grandTotalUnitPrice > 0 ? fmtYen(oldCalc.grandTotalUnitPrice) : '—'}
                      </div>
                    </div>
                    {/* 現行売値㉒ */}
                    <div>
                      <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">㉒ 現行売値</div>
                      <div className={`font-mono font-black text-base ${oldSell > 0 ? 'text-[#B5451B]' : 'text-[#C8C2B8]'}`}>
                        {oldSell > 0 ? fmtYen(oldSell) : '未入力'}
                      </div>
                    </div>
                    {/* 外掛け */}
                    {oldCalcMarkup !== null ? (
                      <div>
                        <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">㉓ 外掛け</div>
                        <div className={`font-mono font-black text-sm ${profitColorCls(oldCalcMarkup)}`}>{fmtPct(oldCalcMarkup)}</div>
                      </div>
                    ) : <div />}
                    {/* 内掛け */}
                    {oldCalcMargin !== null ? (
                      <div>
                        <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">㉔ 内掛け</div>
                        <div className={`font-mono font-black text-sm ${profitColorCls(oldCalcMargin)}`}>{fmtPct(oldCalcMargin)}</div>
                      </div>
                    ) : <div />}
                    {/* 粗利益 */}
                    {oldGrossPerUnit !== null ? (
                      <div>
                        <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">㉕ 粗利益/個</div>
                        <div className={`font-mono font-black text-xs ${profitColorCls(oldGrossPerUnit)}`}>{fmtYen(oldGrossPerUnit)}</div>
                      </div>
                    ) : <div />}
                    {/* 売値-計算差 */}
                    {oldGapToTarget !== null ? (
                      <div>
                        <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">売値-計算差</div>
                        <div className={`font-mono font-black text-xs ${oldGapToTarget >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {oldGapToTarget >= 0 ? '+' : ''}{fmtYen(oldGapToTarget)}
                        </div>
                      </div>
                    ) : <div />}
                  </div>

                  {/* Section 5: 利益・利管費設定 */}
                  <div className="mt-2 pt-2 border-t border-[#EEEBE6] space-y-2">
                    <div className="text-[9px] font-black text-[#6B6057] uppercase tracking-wide">利益・利管費設定</div>

                    {/* 目標利益率（共通） */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-[#18130F] shrink-0">目標利益率<span className="text-[8px] text-[#9C9490] block">外掛け・両列共通</span></label>
                      <div className="relative w-28 flex-none">
                        <input type="number" value={oldEstimate.adjustments.targetProfitRate ?? ''}
                          onChange={(e) => updateAdj(false, 'targetProfitRate', e.target.value)}
                          placeholder="25" className="w-full pl-1.5 pr-6 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                        <span className="absolute right-1.5 top-1 text-[8px] text-[#9C9490]">%</span>
                      </div>
                    </div>

                    {/* 下限利益率（この列） */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-[#18130F] shrink-0">下限利益率<span className="text-[8px] text-[#9C9490] block">外掛け・この列</span></label>
                      <div className="relative w-28 flex-none">
                        <input type="number" value={oldEstimate.adjustments.minProfitRate || ''}
                          onChange={(e) => updateAdj(false, 'minProfitRate', e.target.value)}
                          placeholder="15" className="w-full pl-1.5 pr-6 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                        <span className="absolute right-1.5 top-1 text-[8px] text-[#9C9490]">%</span>
                      </div>
                    </div>

                    {/* 利管費率 */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-[#18130F] shrink-0">利管費率</label>
                      <div className="flex items-center gap-1 w-28 flex-none">
                        <button
                          onClick={() => toggleSgaMode(false)}
                          className={`shrink-0 text-[9px] font-black px-1 py-0.5 rounded border cursor-pointer transition-all leading-none ${
                            (oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin'
                              ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                              : 'bg-[#FEF0EB] text-[#B5451B] border-[#F8C9BB]'
                          }`}
                        >{(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? '内掛' : '外掛'}</button>
                        <div className="relative flex-1">
                          <input type="number" value={oldEstimate.adjustments.sgaRatePercent || ''}
                            onChange={(e) => updateAdj(false, 'sgaRatePercent', e.target.value)}
                            placeholder="15" step="0.01"
                            className="w-full pl-1.5 pr-6 py-1 text-xs font-mono font-bold rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                          <span className="absolute right-1.5 top-1 text-[8px] text-[#9C9490]">%</span>
                        </div>
                      </div>
                    </div>

                    {/* 利管費固定額 */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-[#18130F] shrink-0">利管費固定額</label>
                      <div className="relative w-28 flex-none">
                        <span className="absolute left-1.5 top-1 text-[8px] text-[#9C9490]">¥</span>
                        <input type="number" value={oldEstimate.adjustments.sgaFixedAdjustment ?? ''}
                          onChange={(e) => updateAdj(false, 'sgaFixedAdjustment', e.target.value)}
                          placeholder="0" className="w-full pl-4 pr-2 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                      </div>
                    </div>

                    {/* 客向内掛け率 */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-[#18130F] shrink-0">客向内掛け率<span className="text-[8px] text-[#9C9490] block">架空仕入原価算出</span></label>
                      <div className="relative w-28 flex-none">
                        <input type="number" value={oldEstimate.adjustments.targetProfitMarginOff ?? ''}
                          onChange={(e) => updateAdj(false, 'targetProfitMarginOff', e.target.value)}
                          placeholder="15" className="w-full pl-1.5 pr-6 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                        <span className="absolute right-1.5 top-1 text-[8px] text-[#9C9490]">%</span>
                      </div>
                    </div>

                    {/* 売値に合わせて利管費率を逆算 */}
                    <button onClick={() => handleFitToSellPrice(false)}
                      className="w-full font-black text-[10px] py-1 rounded border flex items-center justify-center gap-1 cursor-pointer transition-all bg-[#FEF0EB] text-[#B5451B] border-[#F8C9BB] hover:opacity-80">
                      <Settings2 className="w-3 h-3" />
                      売値に合わせて利益率を設定
                    </button>

                    <button onClick={() => handleAutoReconcile(false)}
                      className="w-full bg-[#18130F] hover:bg-[#B5451B] text-white font-black text-[10px] py-1.5 rounded border border-[#2A2018] flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                      <Zap className="w-3 h-3 text-[#F8C9BB]" />
                      一発自動整合
                    </button>
                  </div>

                  {/* ProfitGauge */}
                  <div className="mt-2 pt-2 border-t border-[#EEEBE6]">
                    <ProfitGauge
                      actualRate={oldCalc.actualTotalCost > 0
                        ? ((oldCalc.adjustedSellingPrice - oldCalc.actualTotalCost) / oldCalc.actualTotalCost * 100)
                        : 0}
                      minRate={oldEstimate.adjustments.minProfitRate || 0}
                      targetRate={oldEstimate.adjustments.targetProfitRate || 0}
                    />
                  </div>

                  {/* Section 6: 計算結果 */}
                  <div className={`mt-2 pt-2 border-t-2 border-[#D6D0C8] space-y-1 ${oldEstimate.adjustments.targetUnitPrice > 0 && Math.abs(oldCalc.auditVariance) < 0.1 ? 'text-emerald-700' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-[#6B6057] uppercase tracking-wide">計算結果</span>
                      {oldEstimate.adjustments.targetUnitPrice > 0 && Math.abs(oldCalc.auditVariance) < 0.1
                        ? <span className="text-[9px] font-black text-emerald-700 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> 整合済み</span>
                        : oldEstimate.adjustments.targetUnitPrice > 0
                          ? <span className="text-[9px] font-black text-[#B5451B]">乖離: {oldCalc.auditVariance > 0 ? '+' : ''}{oldCalc.auditVariance.toFixed(2)}円</span>
                          : <span className="text-[9px] text-[#9C9490]">目標売値未設定</span>
                      }
                    </div>
                    {[
                      { label: '材料費', val: oldCalc.netMaterialCost },
                      { label: '加工費計', val: oldCalc.totalProcessCost },
                      { label: '直製造原価', val: oldCalc.primeCost },
                      { label: `利管費(${(+(oldEstimate.adjustments.sgaRatePercent || 0)).toFixed(1)}%)`, val: oldCalc.sgaCost },
                      { label: '送料/個', val: oldCalc.shippingCostPerUnit },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex justify-between text-[10px]">
                        <span className="text-[#6B6057]">{label}</span>
                        <span className="font-mono font-bold text-[#18130F]">¥{val.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-[10px] gap-2">
                      <span className="text-[#18130F] font-bold shrink-0">調整</span>
                      <div className="relative w-20">
                        <span className="absolute left-1.5 top-0.5 text-[9px] text-[#9C9490]">¥</span>
                        <input type="number" value={oldEstimate.adjustments.otherAdjustment ?? ''}
                          onChange={(e) => updateAdj(false, 'otherAdjustment', e.target.value)}
                          placeholder="0"
                          className="w-full pl-4 pr-1 py-0.5 text-[10px] font-mono text-right rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                      </div>
                    </div>
                    <div className="flex justify-between items-baseline border-t border-[#EEEBE6] pt-1 mt-1">
                      <span className="font-black text-[#18130F] text-xs">見積単価</span>
                      <span className="text-xl font-black font-mono text-[#18130F]">
                        ¥{oldCalc.grandTotalUnitPrice.toFixed(2)}
                      </span>
                    </div>
                    {oldEstimate.adjustments.targetUnitPrice > 0 && oldCalc.grandTotalUnitPrice > 0 && (() => {
                      const targetSell = oldEstimate.adjustments.targetUnitPrice;
                      const gap = targetSell - oldCalc.grandTotalUnitPrice;
                      const isOver = gap < -0.005;
                      const isExact = Math.abs(gap) < 0.005;
                      const primeCost = oldCalc.primeCost;
                      const base = targetSell - oldCalc.shippingCostPerUnit - (oldEstimate.adjustments.otherAdjustment || 0);
                      const mode = oldEstimate.adjustments.sgaCalcMode || 'markup';
                      const reqSgaMarkup = primeCost > 0.01 && base > primeCost ? (base / primeCost - 1) * 100 : null;
                      const reqSgaMargin = primeCost > 0.01 && base > 0 ? (1 - primeCost / base) * 100 : null;
                      return (
                        <div className={`mt-1 p-1.5 rounded border text-[10px] space-y-1 ${isExact ? 'bg-[#E8F5EC] border-emerald-300' : isOver ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
                          <div className="flex justify-between"><span className="font-bold">目標売値</span><span className="font-mono font-black">¥{targetSell.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="font-bold">差額</span><span className={`font-mono font-black ${isExact ? 'text-emerald-700' : isOver ? 'text-rose-600' : 'text-amber-700'}`}>{gap >= 0 ? '+' : ''}{gap.toFixed(2)}</span></div>
                          {!isExact && (
                            <div className="border-t border-current/20 pt-1">
                              <div className="text-[9px] text-[#6B6057] font-bold mb-0.5">目標達成の利管費率</div>
                              {mode === 'markup' && reqSgaMarkup !== null && (
                                <div className="flex justify-between"><span>外掛けで</span><span className={`font-mono font-black ${reqSgaMarkup < 0 ? 'text-rose-600' : 'text-[#B5451B]'}`}>{reqSgaMarkup.toFixed(2)}%</span></div>
                              )}
                              {mode === 'margin' && reqSgaMargin !== null && (
                                <div className="flex justify-between"><span>内掛けで</span><span className={`font-mono font-black ${reqSgaMargin < 0 ? 'text-rose-600' : 'text-[#1E3A5F]'}`}>{reqSgaMargin.toFixed(2)}%</span></div>
                              )}
                            </div>
                          )}
                          {isExact && <div className="text-emerald-700 font-black text-center">✓ 目標売値と一致</div>}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* 新単価 panel — 2列グリッドで詰める */}
              <div className="flex-1 min-w-0 bg-white rounded-lg border border-[#A8C4E0] overflow-hidden shadow-sm flex flex-col max-h-[calc(50vh)]">
                <div className="bg-[#EFF4FD] px-3 py-1 border-b border-[#B8CCE8] flex items-center gap-1.5 flex-wrap flex-none">
                  <span className="w-2 h-2 rounded-sm bg-[#1E3A5F] shrink-0" />
                  <span className="text-xs font-black text-[#1E3A5F] uppercase tracking-wider">新単価</span>
                  {/* B: Constraint badges */}
                  {newMarkup !== null && (
                    <span className={`text-[9px] font-black px-1 py-0.5 rounded border leading-none ${
                      newMarkup >= 25 ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-rose-100 text-rose-700 border-rose-300'
                    }`}>外{newMarkup >= 25 ? '✓' : '✗'}25%</span>
                  )}
                  {newEstimate.adjustments.targetProfitMarginOff > 0 && (
                    <span className={`text-[9px] font-black px-1 py-0.5 rounded border leading-none ${
                      newEstimate.adjustments.targetProfitMarginOff <= 15 ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-amber-100 text-amber-700 border-amber-300'
                    }`}>内{newEstimate.adjustments.targetProfitMarginOff <= 15 ? '✓' : '!'}15%</span>
                  )}
                  {newEstimate.adjustments.actualPurchasePrice > 0 && (
                    <span className="ml-auto text-[10px] text-[#9C9490]">㉗実費: <strong className="font-mono text-[#18130F]">{fmtYen(newEstimate.adjustments.actualPurchasePrice)}</strong></span>
                  )}
                </div>
                <div className="px-3 py-2 overflow-y-auto flex-1">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {/* 計算仕入値 */}
                    <div>
                      <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">計算仕入値</div>
                      <div className="font-mono font-black text-sm text-[#18130F]">
                        {newCalc.grandTotalUnitPrice > 0 ? fmtYen(newCalc.grandTotalUnitPrice) : '—'}
                      </div>
                    </div>
                    {/* 目標売値㉘ */}
                    <div>
                      <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">㉘ 目標売値</div>
                      <div className={`font-mono font-black text-base ${newSell > 0 ? 'text-[#1E3A5F]' : 'text-[#C8C2B8]'}`}>
                        {newSell > 0 ? fmtYen(newSell) : '未入力'}
                      </div>
                    </div>
                    {/* 外掛け */}
                    {newCalcMarkup !== null ? (
                      <div>
                        <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">㉙ 外掛け</div>
                        <div className={`font-mono font-black text-sm ${profitColorCls(newCalcMarkup)}`}>{fmtPct(newCalcMarkup)}</div>
                      </div>
                    ) : <div />}
                    {/* 内掛け */}
                    {newCalcMargin !== null ? (
                      <div>
                        <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">㉚ 内掛け</div>
                        <div className={`font-mono font-black text-sm ${profitColorCls(newCalcMargin)}`}>{fmtPct(newCalcMargin)}</div>
                      </div>
                    ) : <div />}
                    {/* 粗利益 */}
                    {newGrossPerUnit !== null ? (
                      <div>
                        <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">㉛ 粗利益/個</div>
                        <div className={`font-mono font-black text-xs ${profitColorCls(newGrossPerUnit)}`}>{fmtYen(newGrossPerUnit)}</div>
                      </div>
                    ) : <div />}
                    {/* 売値-計算差 */}
                    {newGapToTarget !== null ? (
                      <div>
                        <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">売値-計算差</div>
                        <div className={`font-mono font-black text-xs ${newGapToTarget >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {newGapToTarget >= 0 ? '+' : ''}{fmtYen(newGapToTarget)}
                        </div>
                      </div>
                    ) : <div />}
                    {/* 新旧比較（2列フル） */}
                    {purchaseRatio !== null && (
                      <div className="col-span-2 border-t border-[#F0EDE8] pt-1 grid grid-cols-2 gap-x-3">
                        <div>
                          <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">仕入比 新/旧</div>
                          <div className={`font-mono font-black text-xs ${purchaseDiff > 0.01 ? 'text-rose-600' : purchaseDiff < -0.01 ? 'text-emerald-700' : 'text-[#6B6057]'}`}>
                            {purchaseRatio.toFixed(1)}% <span className="opacity-70">({purchaseDiff > 0 ? '+' : ''}{Math.round(purchaseDiff).toLocaleString()})</span>
                          </div>
                        </div>
                        {sellRatio !== null && (
                          <div>
                            <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">売価比 新/旧</div>
                            <div className={`font-mono font-black text-xs ${sellDiff > 0.01 ? 'text-rose-600' : sellDiff < -0.01 ? 'text-emerald-700' : 'text-[#6B6057]'}`}>
                              {sellRatio.toFixed(1)}% <span className="opacity-70">({sellDiff > 0 ? '+' : ''}{Math.round(sellDiff).toLocaleString()})</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Section 5: 利益・利管費設定 */}
                  <div className="mt-2 pt-2 border-t border-[#EEEBE6] space-y-2">
                    <div className="text-[9px] font-black text-[#6B6057] uppercase tracking-wide">利益・利管費設定</div>

                    {/* 目標利益率（共通） */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-[#18130F] shrink-0">目標利益率<span className="text-[8px] text-[#9C9490] block">外掛け・両列共通</span></label>
                      <div className="relative w-28 flex-none">
                        <input type="number" value={newEstimate.adjustments.targetProfitRate ?? ''}
                          onChange={(e) => updateAdj(true, 'targetProfitRate', e.target.value)}
                          placeholder="25" className="w-full pl-1.5 pr-6 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                        <span className="absolute right-1.5 top-1 text-[8px] text-[#9C9490]">%</span>
                      </div>
                    </div>

                    {/* 下限利益率（この列） */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-[#18130F] shrink-0">下限利益率<span className="text-[8px] text-[#9C9490] block">外掛け・この列</span></label>
                      <div className="relative w-28 flex-none">
                        <input type="number" value={newEstimate.adjustments.minProfitRate || ''}
                          onChange={(e) => updateAdj(true, 'minProfitRate', e.target.value)}
                          placeholder="15" className="w-full pl-1.5 pr-6 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                        <span className="absolute right-1.5 top-1 text-[8px] text-[#9C9490]">%</span>
                      </div>
                    </div>

                    {/* 利管費率 */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-[#18130F] shrink-0">利管費率</label>
                      <div className="flex items-center gap-1 w-28 flex-none">
                        <button
                          onClick={() => toggleSgaMode(true)}
                          className={`shrink-0 text-[9px] font-black px-1 py-0.5 rounded border cursor-pointer transition-all leading-none ${
                            (newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin'
                              ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                              : 'bg-[#FEF0EB] text-[#B5451B] border-[#F8C9BB]'
                          }`}
                        >{(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? '内掛' : '外掛'}</button>
                        <div className="relative flex-1">
                          <input type="number" value={newEstimate.adjustments.sgaRatePercent || ''}
                            onChange={(e) => updateAdj(true, 'sgaRatePercent', e.target.value)}
                            placeholder="15" step="0.01"
                            className="w-full pl-1.5 pr-6 py-1 text-xs font-mono font-bold rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                          <span className="absolute right-1.5 top-1 text-[8px] text-[#9C9490]">%</span>
                        </div>
                      </div>
                    </div>

                    {/* 利管費固定額 */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-[#18130F] shrink-0">利管費固定額</label>
                      <div className="relative w-28 flex-none">
                        <span className="absolute left-1.5 top-1 text-[8px] text-[#9C9490]">¥</span>
                        <input type="number" value={newEstimate.adjustments.sgaFixedAdjustment ?? ''}
                          onChange={(e) => updateAdj(true, 'sgaFixedAdjustment', e.target.value)}
                          placeholder="0" className="w-full pl-4 pr-2 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                      </div>
                    </div>

                    {/* 客向内掛け率 */}
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-bold text-[#18130F] shrink-0">客向内掛け率<span className="text-[8px] text-[#9C9490] block">架空仕入原価算出</span></label>
                      <div className="relative w-28 flex-none">
                        <input type="number" value={newEstimate.adjustments.targetProfitMarginOff ?? ''}
                          onChange={(e) => updateAdj(true, 'targetProfitMarginOff', e.target.value)}
                          placeholder="15" className="w-full pl-1.5 pr-6 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                        <span className="absolute right-1.5 top-1 text-[8px] text-[#9C9490]">%</span>
                      </div>
                    </div>

                    {/* 売値に合わせて利管費率を逆算 */}
                    <button onClick={() => handleFitToSellPrice(true)}
                      className="w-full font-black text-[10px] py-1 rounded border flex items-center justify-center gap-1 cursor-pointer transition-all bg-[#EFF4FD] text-[#1E3A5F] border-[#B8CCE8] hover:opacity-80">
                      <Settings2 className="w-3 h-3" />
                      売値に合わせて利益率を設定
                    </button>

                    <button onClick={() => handleAutoReconcile(true)}
                      className="w-full bg-[#18130F] hover:bg-[#B5451B] text-white font-black text-[10px] py-1.5 rounded border border-[#2A2018] flex items-center justify-center gap-1.5 cursor-pointer transition-all">
                      <Zap className="w-3 h-3 text-[#F8C9BB]" />
                      一発自動整合
                    </button>
                  </div>

                  {/* ProfitGauge */}
                  <div className="mt-2 pt-2 border-t border-[#EEEBE6]">
                    <ProfitGauge
                      actualRate={newCalc.actualTotalCost > 0
                        ? ((newCalc.adjustedSellingPrice - newCalc.actualTotalCost) / newCalc.actualTotalCost * 100)
                        : 0}
                      minRate={newEstimate.adjustments.minProfitRate || 0}
                      targetRate={newEstimate.adjustments.targetProfitRate || 0}
                    />
                  </div>

                  {/* Section 6: 計算結果 */}
                  <div className={`mt-2 pt-2 border-t-2 border-[#D6D0C8] space-y-1 ${newEstimate.adjustments.targetUnitPrice > 0 && Math.abs(newCalc.auditVariance) < 0.1 ? 'text-emerald-700' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-[#6B6057] uppercase tracking-wide">計算結果</span>
                      {newEstimate.adjustments.targetUnitPrice > 0 && Math.abs(newCalc.auditVariance) < 0.1
                        ? <span className="text-[9px] font-black text-emerald-700 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> 整合済み</span>
                        : newEstimate.adjustments.targetUnitPrice > 0
                          ? <span className="text-[9px] font-black text-[#B5451B]">乖離: {newCalc.auditVariance > 0 ? '+' : ''}{newCalc.auditVariance.toFixed(2)}円</span>
                          : <span className="text-[9px] text-[#9C9490]">目標売値未設定</span>
                      }
                    </div>
                    {[
                      { label: '材料費', val: newCalc.netMaterialCost },
                      { label: '加工費計', val: newCalc.totalProcessCost },
                      { label: '直製造原価', val: newCalc.primeCost },
                      { label: `利管費(${(+(newEstimate.adjustments.sgaRatePercent || 0)).toFixed(1)}%)`, val: newCalc.sgaCost },
                      { label: '送料/個', val: newCalc.shippingCostPerUnit },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex justify-between text-[10px]">
                        <span className="text-[#6B6057]">{label}</span>
                        <span className="font-mono font-bold text-[#18130F]">¥{val.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-[10px] gap-2">
                      <span className="text-[#18130F] font-bold shrink-0">調整</span>
                      <div className="relative w-20">
                        <span className="absolute left-1.5 top-0.5 text-[9px] text-[#9C9490]">¥</span>
                        <input type="number" value={newEstimate.adjustments.otherAdjustment ?? ''}
                          onChange={(e) => updateAdj(true, 'otherAdjustment', e.target.value)}
                          placeholder="0"
                          className="w-full pl-4 pr-1 py-0.5 text-[10px] font-mono text-right rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                      </div>
                    </div>
                    <div className="flex justify-between items-baseline border-t border-[#EEEBE6] pt-1 mt-1">
                      <span className="font-black text-[#18130F] text-xs">見積単価</span>
                      <span className="text-xl font-black font-mono text-[#1E3A5F]">
                        ¥{newCalc.grandTotalUnitPrice.toFixed(2)}
                      </span>
                    </div>
                    {newEstimate.adjustments.targetUnitPrice > 0 && newCalc.grandTotalUnitPrice > 0 && (() => {
                      const targetSell = newEstimate.adjustments.targetUnitPrice;
                      const gap = targetSell - newCalc.grandTotalUnitPrice;
                      const isOver = gap < -0.005;
                      const isExact = Math.abs(gap) < 0.005;
                      const primeCost = newCalc.primeCost;
                      const base = targetSell - newCalc.shippingCostPerUnit - (newEstimate.adjustments.otherAdjustment || 0);
                      const mode = newEstimate.adjustments.sgaCalcMode || 'markup';
                      const reqSgaMarkup = primeCost > 0.01 && base > primeCost ? (base / primeCost - 1) * 100 : null;
                      const reqSgaMargin = primeCost > 0.01 && base > 0 ? (1 - primeCost / base) * 100 : null;
                      return (
                        <div className={`mt-1 p-1.5 rounded border text-[10px] space-y-1 ${isExact ? 'bg-[#E8F5EC] border-emerald-300' : isOver ? 'bg-rose-50 border-rose-200' : 'bg-amber-50 border-amber-200'}`}>
                          <div className="flex justify-between"><span className="font-bold">目標売値</span><span className="font-mono font-black">¥{targetSell.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span className="font-bold">差額</span><span className={`font-mono font-black ${isExact ? 'text-emerald-700' : isOver ? 'text-rose-600' : 'text-amber-700'}`}>{gap >= 0 ? '+' : ''}{gap.toFixed(2)}</span></div>
                          {!isExact && (
                            <div className="border-t border-current/20 pt-1">
                              <div className="text-[9px] text-[#6B6057] font-bold mb-0.5">目標達成の利管費率</div>
                              {mode === 'markup' && reqSgaMarkup !== null && (
                                <div className="flex justify-between"><span>外掛けで</span><span className={`font-mono font-black ${reqSgaMarkup < 0 ? 'text-rose-600' : 'text-[#B5451B]'}`}>{reqSgaMarkup.toFixed(2)}%</span></div>
                              )}
                              {mode === 'margin' && reqSgaMargin !== null && (
                                <div className="flex justify-between"><span>内掛けで</span><span className={`font-mono font-black ${reqSgaMargin < 0 ? 'text-rose-600' : 'text-[#1E3A5F]'}`}>{reqSgaMargin.toFixed(2)}%</span></div>
                              )}
                            </div>
                          )}
                          {isExact && <div className="text-emerald-700 font-black text-center">✓ 目標売値と一致</div>}
                        </div>
                      );
                    })()}
                  </div>
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

      {/* AI疎通確認デモボタン */}
      <div className="fixed bottom-20 right-3 z-50 flex flex-col items-end gap-2">
        {aiTestStatus !== 'idle' && (
          <div className={`text-[10px] font-mono font-black px-2 py-1 rounded shadow-lg max-w-[220px] text-right leading-snug ${
            aiTestStatus === 'loading' ? 'bg-amber-100 text-amber-800' :
            aiTestStatus === 'ok' ? 'bg-emerald-100 text-emerald-800' :
            'bg-rose-100 text-rose-800'
          }`}>
            {aiTestMsg}
          </div>
        )}
        <button
          onClick={async () => {
            if (!user) { setAiTestStatus('error'); setAiTestMsg('✗ 先にログインしてください'); setTimeout(() => setAiTestStatus('idle'), 5000); return; }
            setAiTestStatus('loading');
            setAiTestMsg('確認中...');
            try {
              const res = await apiPost('/api/ping-ai', {});
              const d = await res.json();
              if (d.ok) {
                setAiTestStatus('ok');
                setAiTestMsg(`✓ AI接続OK: ${d.response || ''}`);
              } else {
                setAiTestStatus('error');
                setAiTestMsg(`✗ ${d.error || '不明なエラー'}`);
              }
            } catch (e: any) {
              setAiTestStatus('error');
              setAiTestMsg(`✗ ${e?.message}`);
            }
            setTimeout(() => setAiTestStatus('idle'), 8000);
          }}
          className="bg-[#18130F] hover:bg-[#B5451B] text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg cursor-pointer transition-all flex items-center gap-1.5"
        >
          <Zap className="w-3 h-3" />
          AI疎通確認
        </button>
      </div>

    </div>
  );
}
