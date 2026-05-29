import { useState, useEffect, useRef } from 'react';
import React from 'react';
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

// ─── Tooltip component ────────────────────────────────────────────────────────
const Tooltip = ({ text }: { text: string }) => {
  const [show, setShow] = React.useState(false);
  return (
    <span className="relative inline-block">
      <span
        className="cursor-help text-[#9C9490] text-[9px] border border-[#9C9490] rounded-full w-3 h-3 inline-flex items-center justify-center leading-none ml-0.5"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >?</span>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 bg-[#18130F] text-white text-[10px] rounded p-2 shadow-lg whitespace-pre-wrap leading-relaxed pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([]);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveModal, setSaveModal] = useState<{ isOverwriting: boolean } | null>(null);
  const [saveModalName, setSaveModalName] = useState('');
  const [saveModalNotes, setSaveModalNotes] = useState('');

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
  const [headerHeightPct, setHeaderHeightPct] = useState(40);
  const [sidebarWidthPx, setSidebarWidthPx] = useState(230);
  const isDraggingRef = useRef(false);
  const isSidebarDragging = useRef(false);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const middleAreaRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current && rightPaneRef.current) {
        const rect = rightPaneRef.current.getBoundingClientRect();
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        setHeaderHeightPct(Math.min(75, Math.max(20, pct)));
      }
      if (isSidebarDragging.current && middleAreaRef.current) {
        const containerLeft = middleAreaRef.current.getBoundingClientRect().left;
        const newWidth = e.clientX - containerLeft;
        setSidebarWidthPx(Math.min(450, Math.max(150, newWidth)));
      }
    };
    const onMouseUp = () => {
      isDraggingRef.current = false;
      isSidebarDragging.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

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

  const handleSaveScenario = (isOverwriting: boolean = false) => {
    if (!user) {
      alert('クラウド保存を利用するには右上からサインインしてください。');
      return;
    }
    setSaveModalName(newScenarioName || 'マイカスタム見積シナリオ');
    setSaveModalNotes('');
    setSaveModal({ isOverwriting });
  };

  const handleSaveConfirm = async () => {
    if (!saveModal) return;
    const isOverwriting = saveModal.isOverwriting;
    let targetId = isOverwriting && customScenarios.some(s => s.id === activeScenarioId) ? activeScenarioId : '';
    const targetName = saveModalName.trim() || 'マイカスタム見積シナリオ';
    setSaveModal(null);
    setIsSaving(true);
    try {
      const savedId = await saveUserScenario(
        targetId, targetName, newEstimate, oldEstimate, comparisonResult, saveModalNotes.trim() || undefined
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
    const locked = isNew && (target.adjustments.targetPriceLocked === true);
    let targetUnitPrice = target.adjustments.targetUnitPrice || 0;
    let reconciledUnitPrice = targetUnitPrice;

    if (!isNew) {
      // 旧単価: 売値（targetUnitPrice）は絶対固定。架空の賃率を比例調整して帳尻合わせ。
      if (targetUnitPrice <= 0) { alert('先に現行売価を入力してください。'); return; }
      reconciledUnitPrice = targetUnitPrice;
    } else if (locked) {
      // 新単価ロック: 目標単価固定
      if (targetUnitPrice <= 0) { alert('先に目標単価を入力してください。'); return; }
      reconciledUnitPrice = targetUnitPrice;
    } else {
      // 新単価フリー: 下限利益率を下回らなければ目標単価を調整可能
      const minProfitPercent = target.adjustments.minProfitRate || 0;
      const targetProfitPercent = target.adjustments.targetProfitRate || 0;
      const actualTotalCost = calc.actualTotalCost;
      const minRequiredSellingPrice = actualTotalCost * (1 + minProfitPercent / 100);
      const targetRequiredSellingPrice = actualTotalCost * (1 + targetProfitPercent / 100);
      if (targetUnitPrice <= 0) {
        reconciledUnitPrice = Math.round(targetRequiredSellingPrice);
      } else if (minProfitPercent > 0 && targetUnitPrice < minRequiredSellingPrice) {
        reconciledUnitPrice = Math.ceil(minRequiredSellingPrice);
        alert(`【下限利益率アラート】\n決定単価が下限利益率(${minProfitPercent}%)を維持できる最低単価 (¥${minRequiredSellingPrice.toFixed(2)}) を下回っているため、¥${reconciledUnitPrice.toFixed(2)} に自動引き上げします。`);
      }
    }
    const updatedAdjustments = { ...target.adjustments, targetUnitPrice: isNew ? reconciledUnitPrice : target.adjustments.targetUnitPrice };
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
    const SGA_MIN = 5;
    const SGA_MAX = 15;
    let finalSgaPercent = Math.min(SGA_MAX, Math.max(SGA_MIN, target.adjustments.sgaRatePercent ?? 15));
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
      const rawSga = sgaMode === 'margin'
        ? Math.round((1 - tempPrimeCost / Y) * 10000) / 100
        : Math.round(((Y / tempPrimeCost) - 1) * 10000) / 100;
      if (rawSga < SGA_MIN) {
        if (isNew && !locked) {
          // 新単価フリー: 目標単価を引き上げて最低SGA_MINを確保
          const requiredY = sgaMode === 'markup'
            ? tempPrimeCost * (1 + SGA_MIN / 100)
            : tempPrimeCost / (1 - SGA_MIN / 100);
          const raisedPrice = Math.ceil(requiredY + (reconciledUnitPrice - Y));
          reconciledUnitPrice = raisedPrice;
          updatedAdjustments.targetUnitPrice = raisedPrice;
          const adjustedY = raisedPrice - (calc.shippingCostPerUnit) - (target.adjustments.otherAdjustment || 0);
          finalSgaPercent = sgaMode === 'markup'
            ? Math.min(SGA_MAX, Math.max(SGA_MIN, Math.round(((adjustedY / tempPrimeCost) - 1) * 10000) / 100))
            : Math.min(SGA_MAX, Math.max(SGA_MIN, Math.round((1 - tempPrimeCost / adjustedY) * 10000) / 100));
        } else {
          // 旧単価 or 新単価ロック: 目標単価固定、SGAをSGA_MINに設定
          finalSgaPercent = SGA_MIN;
        }
      } else {
        finalSgaPercent = Math.min(SGA_MAX, Math.max(SGA_MIN, rawSga));
      }
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

  // 目標売値 → auto-derive ㉙ markup only (internal)
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

  // 目標利益率（外掛け）→ auto-derive ㉘ sell price only (internal)
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

  // 積み上げ単価 - 目標単価（マイナス＝目標に対して積み上げが足りない）
  const oldGapToTarget = (oldSell > 0 && oldCalc.grandTotalUnitPrice > 0) ? oldCalc.grandTotalUnitPrice - oldSell : null;
  const newGapToTarget = (newSell > 0 && newCalc.grandTotalUnitPrice > 0) ? newCalc.grandTotalUnitPrice - newSell : null;
  // 積み上げ単価を使った外掛け/内掛け（常時表示用）
  const oldCalcMarkup = (oldSell > 0 && oldCalc.grandTotalUnitPrice > 0) ? ((oldSell - oldCalc.grandTotalUnitPrice) / oldCalc.grandTotalUnitPrice * 100) : null;
  const oldCalcMargin = (oldSell > 0 && oldCalc.grandTotalUnitPrice > 0) ? ((oldSell - oldCalc.grandTotalUnitPrice) / oldSell * 100) : null;
  const newCalcMarkup = (newSell > 0 && newCalc.grandTotalUnitPrice > 0) ? ((newSell - newCalc.grandTotalUnitPrice) / newCalc.grandTotalUnitPrice * 100) : null;
  const newCalcMargin = (newSell > 0 && newCalc.grandTotalUnitPrice > 0) ? ((newSell - newCalc.grandTotalUnitPrice) / newSell * 100) : null;

  // 帳尻内掛け率: 材工費 (primeCost) に対して、何% 内掛け利管費をかければ目標売値に帳尻が合うか
  // base = targetSell - shipping - other → sgaRate(margin mode) = 1 - primeCost/base
  const oldReconcileMargin: number | null = (() => {
    if (oldCalc.primeCost <= 0 || oldSell <= 0) return null;
    const base = oldSell - oldCalc.shippingCostPerUnit - (oldEstimate.adjustments.otherAdjustment || 0);
    if (base <= oldCalc.primeCost) return null;
    return (1 - oldCalc.primeCost / base) * 100;
  })();
  const oldReconcileMarkup: number | null = (() => {
    if (oldCalc.primeCost <= 0 || oldSell <= 0) return null;
    const base = oldSell - oldCalc.shippingCostPerUnit - (oldEstimate.adjustments.otherAdjustment || 0);
    if (base <= oldCalc.primeCost) return null;
    return (base / oldCalc.primeCost - 1) * 100;
  })();

  const newReconcileMargin: number | null = (() => {
    if (newCalc.primeCost <= 0 || newSell <= 0) return null;
    const base = newSell - newCalc.shippingCostPerUnit - (newEstimate.adjustments.otherAdjustment || 0);
    if (base <= newCalc.primeCost) return null;
    return (1 - newCalc.primeCost / base) * 100;
  })();
  const newReconcileMarkup: number | null = (() => {
    if (newCalc.primeCost <= 0 || newSell <= 0) return null;
    const base = newSell - newCalc.shippingCostPerUnit - (newEstimate.adjustments.otherAdjustment || 0);
    if (base <= newCalc.primeCost) return null;
    return (base / newCalc.primeCost - 1) * 100;
  })();

  // Proposal 2: 売値フロア — 外掛け25%を維持できる最低売値
  const newSellFloor = newCalc.actualTotalCost > 0 ? newCalc.actualTotalCost * 1.25 : null;
  const newSellFloorGap = newSellFloor !== null && newSell > 0 ? newSell - newSellFloor : null;

  // Proposal 5: primeCostベース客向け実内掛け — materials+processingだけを客提示仕入れと仮定した場合の客向け内掛け率
  // ≤15% なら primeCostが十分に膨らんでいる。>15% ならまだ積み上げが必要
  const oldPrimeCostMargin = oldSell > 0 && oldCalc.primeCost > 0
    ? (oldSell - oldCalc.primeCost) / oldSell * 100 : null;
  const newPrimeCostMargin = newSell > 0 && newCalc.primeCost > 0
    ? (newSell - newCalc.primeCost) / newSell * 100 : null;

  // 架空仕入れ積み上げ達成度 — 売値(目標)に対してgrandTotalUnitPriceがどの程度達しているか
  const oldFictionalTarget = oldCalc.suggestedPurchasePriceForClient > 0 && (oldEstimate.adjustments.targetProfitMarginOff || 0) > 0
    ? oldCalc.suggestedPurchasePriceForClient : oldSell;
  const newFictionalTarget = newCalc.suggestedPurchasePriceForClient > 0 && (newEstimate.adjustments.targetProfitMarginOff || 0) > 0
    ? newCalc.suggestedPurchasePriceForClient : newSell;
  const oldFictionalProgress = oldFictionalTarget > 0
    ? (oldCalc.grandTotalUnitPrice / oldFictionalTarget * 100) : null;
  const newFictionalProgress = newFictionalTarget > 0
    ? (newCalc.grandTotalUnitPrice / newFictionalTarget * 100) : null;

  // 積み上げ単価 = 直製造原価 + 送料 (SGA抜き)
  const oldStackPrice = oldCalc.primeCost + oldCalc.shippingCostPerUnit;
  const newStackPrice = newCalc.primeCost + newCalc.shippingCostPerUnit;

  // 架空仕入れをもととした利管費率（targetProfitMarginOffが設定されている場合のみ表示）
  const oldSellForCalc = oldSell > 0 ? oldSell : oldCalc.grandTotalUnitPrice;
  const newSellForCalc = newSell > 0 ? newSell : newCalc.grandTotalUnitPrice;

  // 実態の利管費率（内掛け）: (売値 - 架空送料 - 架空primeCost) ÷ (売値 - 架空送料) × 100
  const getActualSgaRate = (sell: number, shippingCost: number, primeCost: number): number | null => {
    const base = sell - shippingCost;
    if (base <= 0) return null;
    return (base - primeCost) / base * 100;
  };
  const oldActualSgaRate = getActualSgaRate(oldSellForCalc, oldCalc.shippingCostPerUnit, oldCalc.primeCost);
  const newActualSgaRate = getActualSgaRate(newSellForCalc, newCalc.shippingCostPerUnit, newCalc.primeCost);
  const getFictionalSgaRate = (sell: number, sp: number, mode: string, hasOffset: boolean): number | null => {
    if (!hasOffset || sp <= 0 || sell <= 0 || Math.abs(sell - sp) < 0.01) return null;
    return mode === 'margin' ? (sell - sp) / sell * 100 : (sell - sp) / sp * 100;
  };
  const oldFictionalSgaRate = getFictionalSgaRate(oldSellForCalc, oldCalc.suggestedPurchasePriceForClient, oldEstimate.adjustments.sgaCalcMode || 'markup', (oldEstimate.adjustments.targetProfitMarginOff || 0) > 0);
  const newFictionalSgaRate = getFictionalSgaRate(newSellForCalc, newCalc.suggestedPurchasePriceForClient, newEstimate.adjustments.sgaCalcMode || 'markup', (newEstimate.adjustments.targetProfitMarginOff || 0) > 0);

  // 実態の利益率（外掛け）: 仕入実費が入力されている場合は直接使用（送料を二重計上しない）
  const oldActualCostForMarkup = oldEstimate.adjustments.actualPurchasePrice > 0
    ? oldEstimate.adjustments.actualPurchasePrice : oldCalc.actualTotalCost;
  const newActualCostForMarkup = newEstimate.adjustments.actualPurchasePrice > 0
    ? newEstimate.adjustments.actualPurchasePrice : newCalc.actualTotalCost;
  const oldActualMarkupRate = oldActualCostForMarkup > 0 && oldSellForCalc > 0
    ? (oldSellForCalc - oldActualCostForMarkup) / oldActualCostForMarkup * 100 : null;
  const newActualMarkupRate = newActualCostForMarkup > 0 && newSellForCalc > 0
    ? (newSellForCalc - newActualCostForMarkup) / newActualCostForMarkup * 100 : null;

  const showFixedHeader = activeView === 'workspace' && activeSheetTab === 'workspace';

  // SGA率が不自然な範囲かどうか（5%未満 or 30%超）
  const sgaWarnOld = (+(oldEstimate.adjustments.sgaRatePercent || 0)) > 0 &&
    ((+(oldEstimate.adjustments.sgaRatePercent || 0)) < 5 || (+(oldEstimate.adjustments.sgaRatePercent || 0)) > 30);
  const sgaWarnNew = (+(newEstimate.adjustments.sgaRatePercent || 0)) > 0 &&
    ((+(newEstimate.adjustments.sgaRatePercent || 0)) < 5 || (+(newEstimate.adjustments.sgaRatePercent || 0)) > 30);
  const sgaWarnActive = (oldCalc.grandTotalUnitPrice > 0 || newCalc.grandTotalUnitPrice > 0) && (sgaWarnOld || sgaWarnNew);

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
      <header className={`sticky top-0 z-50 flex-none flex flex-col ${sgaWarnActive ? 'bg-[#7C1A0A]' : 'bg-[#18130F]'} transition-colors`}>
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
        {sgaWarnActive && (
          <div className="px-3 sm:px-6 py-2 bg-[#B5451B] border-t border-[#D4603A] text-white">
            <div className="max-w-4xl mx-auto flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-2 mb-1 w-full">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#FFD0C0]" />
                <span className="font-black text-sm text-[#FFD0C0]">【審議警告】利管費%が不自然な範囲(5%未満/30%超)</span>
                <span className="ml-auto font-mono font-bold text-sm text-[#FFD0C0] shrink-0">
                  旧={((+(oldEstimate.adjustments.sgaRatePercent || 0)).toFixed(2))}% / 新={((+(newEstimate.adjustments.sgaRatePercent || 0)).toFixed(2))}%
                </span>
              </div>
              <p className="text-xs text-white/90 leading-relaxed">
                賃率だけでなく<strong className="text-white">工程の出来高・段取時間の前提</strong>も見直してください。賃率調整だけで辻褄を合わせようとすると利管費率が不自然な数値になります。
              </p>
            </div>
          </div>
        )}
      </header>

      {/* MIDDLE AREA: sidebar + right pane */}
      <div ref={middleAreaRef} className="flex-1 flex overflow-hidden">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="flex-none bg-white overflow-y-auto flex flex-col" style={{ width: sidebarWidthPx }}>

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
          <div className="border-b border-[#D6D0C8] p-2 space-y-1.5 bg-[#FFF5F2]" style={{ borderTop: '3px solid #B5451B' }}>
            <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-0.5" style={{ color: '#B5451B' }}>旧単価</div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">仕入実費</label>
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
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">現行売価</label>
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
              <span className="text-xs text-[#18130F] font-bold">利益率（外掛け）</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(oldMarkup)}`}>{fmtPct(oldMarkup)}</span>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#18130F] font-bold">利益率（内掛け）</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(oldMargin)}`}>{fmtPct(oldMargin)}</span>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#18130F] font-bold">粗利益/個</span>
              <span className={`font-mono font-black text-xs ${profitColorCls(oldGrossPerUnit)}`}>
                {oldGrossPerUnit !== null ? fmtYen(oldGrossPerUnit) : '—'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">上限利益率 (%)</label>
              <input
                type="number"
                value={oldEstimate.adjustments.maxProfitRate || ''}
                onChange={(e) => updateOldAdj('maxProfitRate', e.target.value)}
                placeholder="例: 35"
                className={sideInp}
              />
            </div>

            {/* 利益・利管費設定 for 旧単価 */}
            <div className="pt-1.5 border-t border-[#F0C0B0]">
              <div className="text-[9px] font-black text-[#B5451B] uppercase tracking-wide mb-1">利益・利管費設定</div>

              <div className="mb-1.5">
                <label className="text-[9px] font-bold text-[#18130F] block mb-0.5">利管費率</label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleSgaMode(false)}
                    className="shrink-0 flex items-center gap-0.5 cursor-pointer"
                    title="クリックで内掛け/外掛けを切り替え"
                  >
                    <span className={`text-[8px] font-bold transition-colors ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'markup' ? 'text-[#B5451B]' : 'text-[#9C9490]'}`}>外</span>
                    <div className={`relative w-8 h-4 rounded-full border-2 transition-all ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'bg-[#E8C8BC] border-[#D6A89C]'}`}>
                      <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'left-4' : 'left-0.5'}`} />
                    </div>
                    <span className={`text-[8px] font-bold transition-colors ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'text-[#1E3A5F]' : 'text-[#9C9490]'}`}>内</span>
                  </button>
                  <div className={`relative flex-1 rounded border ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'border-blue-300 bg-blue-50' : 'border-orange-300 bg-orange-50'}`}>
                    <input type="number" value={oldEstimate.adjustments.sgaRatePercent || ''}
                      onChange={(e) => updateAdj(false, 'sgaRatePercent', e.target.value)}
                      placeholder="15" step="0.01"
                      className="w-full pl-1.5 pr-5 py-0.5 text-[11px] font-mono font-bold bg-transparent outline-none focus:ring-1 focus:ring-[#B5451B]/30" />
                    <span className="absolute right-1 top-0.5 text-[8px] text-[#9C9490]">%</span>
                  </div>
                </div>
              </div>

              <div className="mb-1">
                <label className="text-[9px] font-bold text-[#18130F] block mb-0.5">客向け内掛け率 (%)</label>
                <div className="relative">
                  <input type="number" value={oldEstimate.adjustments.targetProfitMarginOff || ''}
                    onChange={(e) => updateOldAdj('targetProfitMarginOff', e.target.value)}
                    placeholder="例: 15"
                    className={`${sideInp} pr-5`} />
                  <span className="absolute right-2 top-1 text-[9px] text-[#9C9490]">%</span>
                </div>
              </div>

              <div className="mb-1">
                <label className="text-[9px] font-bold text-[#18130F] block mb-0.5">利管費固定調整 (¥)</label>
                <input type="number" value={oldEstimate.adjustments.sgaFixedAdjustment || ''}
                  onChange={(e) => updateOldAdj('sgaFixedAdjustment', e.target.value)}
                  placeholder="0"
                  className={sideInp} />
              </div>

              <div className="mb-1">
                <label className="text-[9px] font-bold text-[#18130F] block mb-0.5">その他調整 (¥)</label>
                <input type="number" value={oldEstimate.adjustments.otherAdjustment || ''}
                  onChange={(e) => updateOldAdj('otherAdjustment', e.target.value)}
                  placeholder="0"
                  className={sideInp} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">設定時期 (yyyymm)</label>
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
          <div className="p-2 space-y-1.5 bg-[#F0F5FF]" style={{ borderTop: '3px solid #1E3A5F' }}>
            <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-0.5" style={{ color: '#1E3A5F' }}>新単価</div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">仕入実費</label>
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
              <div className="flex items-center gap-1 mb-0.5">
                <label className="block text-[9px] font-bold text-[#1E3A5F]">
                  目標売値
                  <span className="text-[10px] text-[#9C9490] font-normal ml-1">← 連動</span>
                </label>
                <button
                  onClick={() => setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetPriceLocked: !prev.adjustments.targetPriceLocked } }))}
                  title={newEstimate.adjustments.targetPriceLocked ? 'ロック中（クリックで解除）' : '解除中（クリックでロック）'}
                  className={`shrink-0 w-4 h-4 rounded flex items-center justify-center transition-colors cursor-pointer text-[10px] leading-none ${newEstimate.adjustments.targetPriceLocked ? 'bg-[#1E3A5F] text-white' : 'bg-[#D6D0C8] text-[#6B6057]'}`}
                >
                  {newEstimate.adjustments.targetPriceLocked ? '🔒' : '🔓'}
                </button>
              </div>
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
                目標利益率（外掛け）
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
              <span className="text-[9px] font-bold text-[#1E3A5F]">目標利益率（内掛け）</span>
              <span className="font-mono font-black text-xs text-[#1E3A5F]">
                {newInternalMargin !== null ? `${newInternalMargin.toFixed(2)}%` : '—'}
              </span>
            </div>

            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#18130F] font-bold">粗利益/個</span>
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

            {/* 利益・利管費設定 for 新単価 */}
            <div className="pt-1.5 border-t border-[#C5D8EE]">
              <div className="text-[9px] font-black text-[#1E3A5F] uppercase tracking-wide mb-1">利益・利管費設定</div>

              <div className="mb-1.5">
                <label className="text-[9px] font-bold text-[#18130F] block mb-0.5">利管費率</label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleSgaMode(true)}
                    className="shrink-0 flex items-center gap-0.5 cursor-pointer"
                    title="クリックで内掛け/外掛けを切り替え"
                  >
                    <span className={`text-[8px] font-bold transition-colors ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'markup' ? 'text-[#B5451B]' : 'text-[#9C9490]'}`}>外</span>
                    <div className={`relative w-8 h-4 rounded-full border-2 transition-all ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'bg-[#E8C8BC] border-[#D6A89C]'}`}>
                      <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'left-4' : 'left-0.5'}`} />
                    </div>
                    <span className={`text-[8px] font-bold transition-colors ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'text-[#1E3A5F]' : 'text-[#9C9490]'}`}>内</span>
                  </button>
                  <div className={`relative flex-1 rounded border ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'border-blue-300 bg-blue-50' : 'border-orange-300 bg-orange-50'}`}>
                    <input type="number" value={newEstimate.adjustments.sgaRatePercent || ''}
                      onChange={(e) => updateAdj(true, 'sgaRatePercent', e.target.value)}
                      placeholder="15" step="0.01"
                      className="w-full pl-1.5 pr-5 py-0.5 text-[11px] font-mono font-bold bg-transparent outline-none focus:ring-1 focus:ring-[#1E3A5F]/30" />
                    <span className="absolute right-1 top-0.5 text-[8px] text-[#9C9490]">%</span>
                  </div>
                </div>
              </div>

              <div className="mb-1">
                <label className="text-[9px] font-bold text-[#18130F] block mb-0.5">利管費固定調整 (¥)</label>
                <input type="number" value={newEstimate.adjustments.sgaFixedAdjustment || ''}
                  onChange={(e) => updateNewAdj('sgaFixedAdjustment', e.target.value)}
                  placeholder="0"
                  className={sideInp} />
              </div>

              <div className="mb-1">
                <label className="text-[9px] font-bold text-[#18130F] block mb-0.5">その他調整 (¥)</label>
                <input type="number" value={newEstimate.adjustments.otherAdjustment || ''}
                  onChange={(e) => updateNewAdj('otherAdjustment', e.target.value)}
                  placeholder="0"
                  className={sideInp} />
              </div>
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

        {/* ── Sidebar resize handle ── */}
        <div
          className="flex-none w-2 bg-[#D6D0C8] hover:bg-[#B5451B]/40 cursor-ew-resize flex items-center justify-center group transition-colors select-none z-10"
          onMouseDown={(e) => { isSidebarDragging.current = true; e.preventDefault(); }}
          title="ドラッグしてサイドバーの幅を調整"
        >
          <div className="h-8 w-0.5 rounded-full bg-[#9C9490] group-hover:bg-[#B5451B] transition-colors" />
        </div>

        {/* ── RIGHT PANE ── */}
        <div ref={rightPaneRef} className="flex-1 flex flex-col overflow-hidden">

          {/* ── Resizable calculation header (workspace only) ── */}
          {showFixedHeader && (
          <div className="flex-none overflow-hidden bg-[#F0EDE8]" style={{ height: `${headerHeightPct}%` }}>
            <div className="flex gap-2 sm:gap-3 h-full px-3 py-2">

              {/* 旧単価 panel — 2列グリッドで詰める */}
              <div className="flex-1 min-w-0 bg-white rounded-lg border border-[#E0C0B0] overflow-hidden shadow-sm flex flex-col">
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
                </div>

                {/* ── Key metrics strip ── */}
                <div className="flex-none px-3 py-2 bg-[#FEF3EE] border-b-2 border-[#E8C8BC]">
                  <div className="grid grid-cols-5 gap-x-2">
                    <div className="border-r border-[#E8C8BC] pr-2">
                      <div className="text-[9px] font-bold text-[#9C9490] leading-none mb-1 truncate">仕入実費<Tooltip text="実際の仕入れ原価。actualPurchasePrice入力時はその値を使用。未入力時は材料費＋加工費＋実際の送料を積み上げた値。" /></div>
                      <div className="font-mono font-black text-sm text-[#6B6057] leading-tight">
                        {oldEstimate.adjustments.actualPurchasePrice > 0 ? fmtYen(oldEstimate.adjustments.actualPurchasePrice) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#E8C8BC] pr-2">
                      <div className="text-[9px] font-bold text-[#9C9490] leading-none mb-1 truncate">現行単価</div>
                      <div className="font-mono font-black text-sm text-[#B5451B] leading-tight">
                        {oldSell > 0 ? fmtYen(oldSell) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#E8C8BC] pr-2">
                      <div className="text-[9px] font-bold text-[#9C9490] leading-none mb-1 truncate">積み上げ単価<Tooltip text="材料費＋加工費（客提示賃率）＋利管費＋送料＋その他調整を積み上げた客提示用の見積単価。" /></div>
                      <div className="font-mono font-black text-sm text-[#18130F] leading-tight">
                        {oldCalc.grandTotalUnitPrice > 0 ? fmtYen(oldCalc.grandTotalUnitPrice) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#E8C8BC] pr-2">
                      <div className="text-[9px] font-bold text-[#9C9490] leading-none mb-1 truncate">架空利管費率<Tooltip text="客提示用の積み上げ単価に占める利管費の割合（内掛け）。suggestedPurchasePriceForClient算出時に使用する客先提示用の利益率。" /></div>
                      <div className={`font-mono font-black text-sm leading-tight ${oldActualSgaRate !== null ? 'text-amber-700' : 'text-[#C8C2B8]'}`}>
                        {oldActualSgaRate !== null ? `${oldActualSgaRate.toFixed(2)}%` : '—'}
                      </div>
                      {oldActualSgaRate !== null && <div className="text-[8px] text-[#9C9490] mt-0.5">内掛け</div>}
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-[#9C9490] leading-none mb-1 truncate">実態利益率<Tooltip text="実際の仕入原価に対して何%の利益を乗せているか（外掛け）。(売値 - 仕入実費) ÷ 仕入実費 × 100" /></div>
                      <div className={`font-mono font-black text-sm leading-tight ${oldActualMarkupRate !== null ? profitColorCls(oldActualMarkupRate) : 'text-[#C8C2B8]'}`}>
                        {oldActualMarkupRate !== null ? `${oldActualMarkupRate.toFixed(2)}%` : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-3 py-2 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {/* 粗利益 */}
                    <div>
                      <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">粗利益/個</div>
                      <div className={`font-mono font-black text-xs ${profitColorCls(oldGrossPerUnit)}`}>{oldGrossPerUnit !== null ? fmtYen(oldGrossPerUnit) : '—'}</div>
                    </div>
                    {/* 売値-計算差 (積み上げ - 目標: マイナスは積み上げ不足) */}
                    <div>
                      <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">積み上げ-目標差</div>
                      <div className={`font-mono font-black text-xs ${oldGapToTarget !== null ? (oldGapToTarget >= 0 ? 'text-emerald-700' : 'text-rose-600') : 'text-[#9C9490]'}`}>
                        {oldGapToTarget !== null ? `${oldGapToTarget >= 0 ? '+' : ''}${fmtYen(oldGapToTarget)}` : '—'}
                      </div>
                    </div>
                    {/* 架空仕入れ積み上げ達成度 */}
                    <div className="col-span-2 mt-0.5">
                      {oldFictionalProgress !== null && oldCalc.suggestedPurchasePriceForClient > 0 ? (
                        <>
                          <div className="flex justify-between text-[9px] mb-0.5">
                            <span className="text-[#9C9490] font-bold">架空仕入げ積み上げ達成</span>
                            <span className={`font-mono font-black ${oldFictionalProgress > 100 ? 'text-rose-600' : oldFictionalProgress >= 100 ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {oldFictionalProgress.toFixed(0)}%{oldFictionalProgress > 100 ? ' ⚠ 超過' : ''}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#F0EDE8] overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${oldFictionalProgress > 100 ? 'bg-rose-500' : oldFictionalProgress >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                              style={{ width: `${Math.min(100, oldFictionalProgress).toFixed(0)}%` }} />
                          </div>
                          <div className="flex justify-between text-[8px] text-[#9C9490] mt-0.5">
                            <span>目標: ¥{oldFictionalTarget.toFixed(2)}</span>
                            <span>現在: ¥{oldCalc.grandTotalUnitPrice.toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-[9px] text-[#C8C2B8]">架空仕入げ積み上げ達成 —</div>
                      )}
                    </div>
                  </div>

                  {/* Section 5: 利益・利管費設定 (compact 2-col) */}
                  <div className="mt-2 pt-2 border-t border-[#EEEBE6]">
                    <div className="text-[9px] font-black text-[#6B6057] uppercase tracking-wide mb-1.5">利益・利管費設定</div>

                    {/* 帳尻利管費率（内掛け・外掛け並列表示） */}
                    {(oldReconcileMargin !== null || oldReconcileMarkup !== null) && (
                      <div className={`mb-1.5 px-2 py-1 rounded border ${
                        oldEstimate.adjustments.sgaRatePercent > 0 && oldReconcileMargin !== null && Math.abs(oldReconcileMargin - (oldEstimate.adjustments.sgaRatePercent || 0)) < 0.1
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-amber-50 border-amber-200'
                      }`}>
                        <div className="text-[8px] font-black text-amber-800 leading-tight mb-1">帳尻利管費率 材工費→売値</div>
                        <div className="flex gap-3">
                          {oldReconcileMargin !== null && (
                            <div className="flex items-center gap-1">
                              <span className="text-[8px] text-[#6B6057]">内掛け</span>
                              <span className="font-mono font-black text-sm text-amber-700">{oldReconcileMargin.toFixed(2)}%</span>
                            </div>
                          )}
                          {oldReconcileMarkup !== null && (
                            <div className="flex items-center gap-1">
                              <span className="text-[8px] text-[#6B6057]">外掛け</span>
                              <span className="font-mono font-black text-sm text-amber-700">{oldReconcileMarkup.toFixed(2)}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Row 2: 利管費率 (full width) */}
                    <div className="mb-1.5">
                      <label className="text-[9px] font-bold text-[#18130F] block mb-0.5">利管費率</label>
                      <div className="flex items-center gap-1">
                        {/* トグルスイッチ：内掛け/外掛け */}
                        <button
                          onClick={() => toggleSgaMode(false)}
                          className="shrink-0 flex items-center gap-0.5 cursor-pointer group"
                          title="クリックで内掛け/外掛けを切り替え"
                        >
                          <span className={`text-[8px] font-bold transition-colors ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'markup' ? 'text-[#B5451B]' : 'text-[#9C9490]'}`}>外</span>
                          <div className={`relative w-8 h-4 rounded-full border-2 transition-all ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'bg-[#E8C8BC] border-[#D6A89C]'}`}>
                            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'left-4' : 'left-0.5'}`} />
                          </div>
                          <span className={`text-[8px] font-bold transition-colors ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'text-[#1E3A5F]' : 'text-[#9C9490]'}`}>内</span>
                        </button>
                        <div className="relative flex-1">
                          <input type="number" value={oldEstimate.adjustments.sgaRatePercent || ''}
                            onChange={(e) => updateAdj(false, 'sgaRatePercent', e.target.value)}
                            placeholder="15" step="0.01"
                            className="w-full pl-1.5 pr-5 py-0.5 text-[11px] font-mono font-bold rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                          <span className="absolute right-1 top-0.5 text-[8px] text-[#9C9490]">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-1">
                      <button onClick={() => handleFitToSellPrice(false)}
                        className="flex-1 font-black text-[9px] py-1 rounded border flex items-center justify-center gap-0.5 cursor-pointer transition-all bg-[#FEF0EB] text-[#B5451B] border-[#F8C9BB] hover:opacity-80">
                        <Settings2 className="w-2.5 h-2.5" />
                        売値に合わせる
                      </button>
                      <button onClick={() => handleAutoReconcile(false)}
                        className="flex-1 bg-[#18130F] hover:bg-[#B5451B] text-white font-black text-[9px] py-1 rounded border border-[#2A2018] flex items-center justify-center gap-0.5 cursor-pointer transition-all">
                        <Zap className="w-2.5 h-2.5 text-[#F8C9BB]" />
                        自動補正
                      </button>
                      <button onClick={() => alert('AI自動補正機能は近日実装予定です')}
                        className="flex-1 bg-[#3A3028] hover:bg-[#5A4A3A] text-white font-black text-[9px] py-1 rounded border border-[#5A4A3A] flex items-center justify-center gap-0.5 cursor-pointer transition-all">
                        <Zap className="w-2.5 h-2.5 text-amber-300" />
                        AI自動補正
                      </button>
                    </div>
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
                    <div className="space-y-0.5">
                      {[
                        { label: '材料費', val: oldCalc.netMaterialCost },
                        { label: '加工費計', val: oldCalc.totalProcessCost },
                        { label: `利管費(${(+(oldEstimate.adjustments.sgaRatePercent || 0)).toFixed(2)}%)`, val: oldCalc.sgaCost },
                        { label: '送料/個', val: oldCalc.shippingCostPerUnit },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex justify-between text-[10px]">
                          <span className="text-[#6B6057]">{label}</span>
                          <span className="font-mono font-bold text-[#18130F]">¥{val.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[10px] gap-2">
                      <span className="text-[#18130F] font-bold shrink-0">調整</span>
                      <div className="relative w-20">
                        <span className="absolute left-1.5 top-0.5 text-[9px] text-[#9C9490]">¥</span>
                        <input type="number" value={oldEstimate.adjustments.otherAdjustment || ''}
                          onChange={(e) => updateAdj(false, 'otherAdjustment', e.target.value)}
                          placeholder="0"
                          className="w-full pl-4 pr-1 py-0.5 text-[10px] font-mono text-right rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] border-t border-[#EEEBE6] pt-1 mt-1">
                      <span className="font-black text-[#18130F]">見積単価</span>
                      <span className="font-mono font-black text-[#18130F]">¥{oldCalc.grandTotalUnitPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 新単価 panel — 2列グリッドで詰める */}
              <div className="flex-1 min-w-0 bg-white rounded-lg border border-[#A8C4E0] overflow-hidden shadow-sm flex flex-col">
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
                </div>

                {/* ── Key metrics strip ── */}
                <div className="flex-none px-3 py-2 bg-[#EEF3FB] border-b-2 border-[#B8CCE8]">
                  <div className="grid grid-cols-5 gap-x-2">
                    <div className="border-r border-[#B8CCE8] pr-2">
                      <div className="text-[9px] font-bold text-[#9C9490] leading-none mb-1 truncate">仕入実費<Tooltip text="実際の仕入れ原価。actualPurchasePrice入力時はその値を使用。未入力時は材料費＋加工費＋実際の送料を積み上げた値。" /></div>
                      <div className="font-mono font-black text-sm text-[#6B6057] leading-tight">
                        {newEstimate.adjustments.actualPurchasePrice > 0 ? fmtYen(newEstimate.adjustments.actualPurchasePrice) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#B8CCE8] pr-2">
                      <div className="text-[9px] font-bold text-[#9C9490] leading-none mb-1 truncate">目標単価</div>
                      <div className="font-mono font-black text-sm text-[#1E3A5F] leading-tight">
                        {newSell > 0 ? fmtYen(newSell) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#B8CCE8] pr-2">
                      <div className="text-[9px] font-bold text-[#9C9490] leading-none mb-1 truncate">積み上げ単価<Tooltip text="材料費＋加工費（客提示賃率）＋利管費＋送料＋その他調整を積み上げた客提示用の見積単価。" /></div>
                      <div className="font-mono font-black text-sm text-[#18130F] leading-tight">
                        {newCalc.grandTotalUnitPrice > 0 ? fmtYen(newCalc.grandTotalUnitPrice) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#B8CCE8] pr-2">
                      <div className="text-[9px] font-bold text-[#9C9490] leading-none mb-1 truncate">架空利管費率<Tooltip text="客提示用の積み上げ単価に占める利管費の割合（内掛け）。suggestedPurchasePriceForClient算出時に使用する客先提示用の利益率。" /></div>
                      <div className={`font-mono font-black text-sm leading-tight ${newActualSgaRate !== null ? 'text-amber-700' : 'text-[#C8C2B8]'}`}>
                        {newActualSgaRate !== null ? `${newActualSgaRate.toFixed(2)}%` : '—'}
                      </div>
                      {newActualSgaRate !== null && <div className="text-[8px] text-[#9C9490] mt-0.5">内掛け</div>}
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-[#9C9490] leading-none mb-1 truncate">実態利益率<Tooltip text="実際の仕入原価に対して何%の利益を乗せているか（外掛け）。(売値 - 仕入実費) ÷ 仕入実費 × 100" /></div>
                      <div className={`font-mono font-black text-sm leading-tight ${newActualMarkupRate !== null ? profitColorCls(newActualMarkupRate) : 'text-[#C8C2B8]'}`}>
                        {newActualMarkupRate !== null ? `${newActualMarkupRate.toFixed(2)}%` : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-3 py-2 flex-1 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {/* 粗利益 */}
                    <div>
                      <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">粗利益/個</div>
                      <div className={`font-mono font-black text-xs ${profitColorCls(newGrossPerUnit)}`}>{newGrossPerUnit !== null ? fmtYen(newGrossPerUnit) : '—'}</div>
                    </div>
                    {/* 積み上げ-目標差 (積み上げ - 目標: マイナスは積み上げ不足) */}
                    <div>
                      <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">積み上げ-目標差</div>
                      <div className={`font-mono font-black text-xs ${newGapToTarget !== null ? (newGapToTarget >= 0 ? 'text-emerald-700' : 'text-rose-600') : 'text-[#9C9490]'}`}>
                        {newGapToTarget !== null ? `${newGapToTarget >= 0 ? '+' : ''}${fmtYen(newGapToTarget)}` : '—'}
                      </div>
                    </div>
                    {/* 新旧比較（2列フル） */}
                    <div className="col-span-2 border-t border-[#F0EDE8] pt-1 grid grid-cols-2 gap-x-3">
                      <div>
                        <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">仕入比 新/旧</div>
                        <div className={`font-mono font-black text-xs ${purchaseRatio !== null ? (purchaseDiff > 0.01 ? 'text-rose-600' : purchaseDiff < -0.01 ? 'text-emerald-700' : 'text-[#6B6057]') : 'text-[#9C9490]'}`}>
                          {purchaseRatio !== null ? `${purchaseRatio.toFixed(1)}% (${purchaseDiff > 0 ? '+' : ''}${Math.round(purchaseDiff).toLocaleString()})` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">売価比 新/旧</div>
                        <div className={`font-mono font-black text-xs ${sellRatio !== null ? (sellDiff > 0.01 ? 'text-rose-600' : sellDiff < -0.01 ? 'text-emerald-700' : 'text-[#6B6057]') : 'text-[#9C9490]'}`}>
                          {sellRatio !== null ? `${sellRatio.toFixed(1)}% (${sellDiff > 0 ? '+' : ''}${Math.round(sellDiff).toLocaleString()})` : '—'}
                        </div>
                      </div>
                    </div>
                    {/* 外掛25%フロア（最低売値）常時表示 */}
                    <div className="col-span-2 border-t border-[#F0EDE8] pt-1 mt-0.5">
                      <div className="text-[10px] text-[#9C9490] font-bold leading-none mb-0.5">外掛25%フロア（最低売値）</div>
                      {newSellFloor !== null ? (
                        <div className="flex items-baseline gap-2">
                          <span className={`font-mono font-black text-sm ${newSell > 0 && newSell < newSellFloor ? 'text-rose-600' : 'text-emerald-700'}`}>
                            ¥{newSellFloor.toFixed(2)}
                          </span>
                          {newSellFloorGap !== null && (
                            <span className={`text-[9px] font-black font-mono ${newSellFloorGap >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {newSellFloorGap >= 0 ? `+¥${newSellFloorGap.toFixed(2)} 余裕` : `¥${Math.abs(newSellFloorGap).toFixed(2)} 不足`}
                            </span>
                          )}
                        </div>
                      ) : <div className="text-[10px] text-[#C8C2B8]">—</div>}
                    </div>
                    {/* 架空仕入れ積み上げ達成度 */}
                    <div className="col-span-2 mt-0.5">
                      {newFictionalProgress !== null && newCalc.suggestedPurchasePriceForClient > 0 ? (
                        <>
                          <div className="flex justify-between text-[9px] mb-0.5">
                            <span className="text-[#9C9490] font-bold">架空仕入げ積み上げ達成</span>
                            <span className={`font-mono font-black ${newFictionalProgress > 100 ? 'text-rose-600' : newFictionalProgress >= 100 ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {newFictionalProgress.toFixed(0)}%{newFictionalProgress > 100 ? ' ⚠ 超過' : ''}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#F0EDE8] overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${newFictionalProgress > 100 ? 'bg-rose-500' : newFictionalProgress >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                              style={{ width: `${Math.min(100, newFictionalProgress).toFixed(0)}%` }} />
                          </div>
                          <div className="flex justify-between text-[8px] text-[#9C9490] mt-0.5">
                            <span>目標: ¥{newFictionalTarget.toFixed(2)}</span>
                            <span>現在: ¥{newCalc.grandTotalUnitPrice.toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-[9px] text-[#C8C2B8]">架空仕入げ積み上げ達成 —</div>
                      )}
                    </div>
                    {/* dummy to close old conditional */}
                  </div>

                  {/* Section 5: 利益・利管費設定 (compact 2-col) */}
                  <div className="mt-2 pt-2 border-t border-[#EEEBE6]">
                    <div className="text-[9px] font-black text-[#6B6057] uppercase tracking-wide mb-1.5">利益・利管費設定</div>

                    {/* 帳尻利管費率（内掛け・外掛け並列表示） */}
                    {(newReconcileMargin !== null || newReconcileMarkup !== null) && (
                      <div className={`mb-1.5 px-2 py-1 rounded border ${
                        newEstimate.adjustments.sgaRatePercent > 0 && newReconcileMargin !== null && Math.abs(newReconcileMargin - (newEstimate.adjustments.sgaRatePercent || 0)) < 0.1
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-amber-50 border-amber-200'
                      }`}>
                        <div className="text-[8px] font-black text-amber-800 leading-tight mb-1">帳尻利管費率 材工費→売値</div>
                        <div className="flex gap-3">
                          {newReconcileMargin !== null && (
                            <div className="flex items-center gap-1">
                              <span className="text-[8px] text-[#6B6057]">内掛け</span>
                              <span className="font-mono font-black text-sm text-amber-700">{newReconcileMargin.toFixed(2)}%</span>
                            </div>
                          )}
                          {newReconcileMarkup !== null && (
                            <div className="flex items-center gap-1">
                              <span className="text-[8px] text-[#6B6057]">外掛け</span>
                              <span className="font-mono font-black text-sm text-amber-700">{newReconcileMarkup.toFixed(2)}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Row 2: 利管費率 (full width) */}
                    <div className="mb-1.5">
                      <label className="text-[9px] font-bold text-[#18130F] block mb-0.5">利管費率</label>
                      <div className="flex items-center gap-1">
                        {/* トグルスイッチ：内掛け/外掛け */}
                        <button
                          onClick={() => toggleSgaMode(true)}
                          className="shrink-0 flex items-center gap-0.5 cursor-pointer group"
                          title="クリックで内掛け/外掛けを切り替え"
                        >
                          <span className={`text-[8px] font-bold transition-colors ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'markup' ? 'text-[#B5451B]' : 'text-[#9C9490]'}`}>外</span>
                          <div className={`relative w-8 h-4 rounded-full border-2 transition-all ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'bg-[#E8C8BC] border-[#D6A89C]'}`}>
                            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'left-4' : 'left-0.5'}`} />
                          </div>
                          <span className={`text-[8px] font-bold transition-colors ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'text-[#1E3A5F]' : 'text-[#9C9490]'}`}>内</span>
                        </button>
                        <div className="relative flex-1">
                          <input type="number" value={newEstimate.adjustments.sgaRatePercent || ''}
                            onChange={(e) => updateAdj(true, 'sgaRatePercent', e.target.value)}
                            placeholder="15" step="0.01"
                            className="w-full pl-1.5 pr-5 py-0.5 text-[11px] font-mono font-bold rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                          <span className="absolute right-1 top-0.5 text-[8px] text-[#9C9490]">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-1">
                      <button onClick={() => handleFitToSellPrice(true)}
                        className="flex-1 font-black text-[9px] py-1 rounded border flex items-center justify-center gap-0.5 cursor-pointer transition-all bg-[#EFF4FD] text-[#1E3A5F] border-[#B8CCE8] hover:opacity-80">
                        <Settings2 className="w-2.5 h-2.5" />
                        売値に合わせる
                      </button>
                      <button onClick={() => handleAutoReconcile(true)}
                        className="flex-1 bg-[#18130F] hover:bg-[#B5451B] text-white font-black text-[9px] py-1 rounded border border-[#2A2018] flex items-center justify-center gap-0.5 cursor-pointer transition-all">
                        <Zap className="w-2.5 h-2.5 text-[#F8C9BB]" />
                        自動補正
                      </button>
                      <button onClick={() => alert('AI自動補正機能は近日実装予定です')}
                        className="flex-1 bg-[#3A3028] hover:bg-[#5A4A3A] text-white font-black text-[9px] py-1 rounded border border-[#5A4A3A] flex items-center justify-center gap-0.5 cursor-pointer transition-all">
                        <Zap className="w-2.5 h-2.5 text-amber-300" />
                        AI自動補正
                      </button>
                    </div>
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
                    <div className="space-y-0.5">
                      {[
                        { label: '材料費', val: newCalc.netMaterialCost },
                        { label: '加工費計', val: newCalc.totalProcessCost },
                        { label: `利管費(${(+(newEstimate.adjustments.sgaRatePercent || 0)).toFixed(2)}%)`, val: newCalc.sgaCost },
                        { label: '送料/個', val: newCalc.shippingCostPerUnit },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex justify-between text-[10px]">
                          <span className="text-[#6B6057]">{label}</span>
                          <span className="font-mono font-bold text-[#18130F]">¥{val.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[10px] gap-2">
                      <span className="text-[#18130F] font-bold shrink-0">調整</span>
                      <div className="relative w-20">
                        <span className="absolute left-1.5 top-0.5 text-[9px] text-[#9C9490]">¥</span>
                        <input type="number" value={newEstimate.adjustments.otherAdjustment || ''}
                          onChange={(e) => updateAdj(true, 'otherAdjustment', e.target.value)}
                          placeholder="0"
                          className="w-full pl-4 pr-1 py-0.5 text-[10px] font-mono text-right rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] border-t border-[#EEEBE6] pt-1 mt-1">
                      <span className="font-black text-[#18130F]">見積単価</span>
                      <span className="font-mono font-black text-[#1E3A5F]">¥{newCalc.grandTotalUnitPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
          )}

          {/* ── Drag handle (workspace only) ── */}
          {showFixedHeader && (
            <div
              className="flex-none h-3 bg-[#D6D0C8] hover:bg-[#B5451B]/30 cursor-ns-resize relative flex items-center justify-center group transition-colors select-none z-10 border-t border-b border-[#C8C2B8]"
              onMouseDown={(e) => { isDraggingRef.current = true; e.preventDefault(); }}
              title="ドラッグして上部エリアの高さを調整"
            >
              <div className="w-12 h-1 rounded-full bg-[#9C9490] group-hover:bg-[#B5451B] transition-colors" />
            </div>
          )}

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

      {/* SAVE MODAL */}
      {saveModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D6D0C8] px-6 py-5 min-w-[320px] max-w-sm w-full mx-4">
            <h3 className="text-sm font-black text-[#18130F] mb-3">シナリオ保存</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#18130F] mb-1">シナリオ名 <span className="text-[#B5451B]">*</span></label>
                <input
                  type="text"
                  value={saveModalName}
                  onChange={(e) => setSaveModalName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded border border-[#D6D0C8] outline-none focus:ring-1 focus:border-[#B5451B]"
                  placeholder="シナリオ名を入力"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#18130F] mb-1">補足説明（任意）</label>
                <textarea
                  value={saveModalNotes}
                  onChange={(e) => setSaveModalNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded border border-[#D6D0C8] outline-none focus:ring-1 focus:border-[#B5451B] resize-none"
                  placeholder="変更理由・メモなど"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setSaveModal(null)}
                className="flex-1 py-2 text-xs font-bold border border-[#D6D0C8] rounded text-[#6B6057] hover:bg-[#F7F6F2] cursor-pointer transition-all"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveConfirm}
                disabled={!saveModalName.trim()}
                className="flex-1 py-2 text-xs font-bold bg-[#B5451B] hover:bg-[#8A3215] text-white rounded cursor-pointer transition-all disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

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
