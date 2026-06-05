import { useState, useEffect, useRef } from 'react';
import { DetailedEstimate, ComparisonResult, Scenario, QuantityPattern, BatchPart, ImportSource, ScenarioKind } from './types';
import { createEmptyEstimate } from './data/samples';
import { ExcelGrid } from './components/ExcelGrid';
import { CompareResults } from './components/CompareResults';
import { ScenarioLibrary } from './components/ScenarioLibrary';
import { PrintSheet } from './components/PrintSheet';
import { MultiPatternSheet } from './components/MultiPatternSheet';
import { BatchCompareSheet } from './components/BatchCompareSheet';
import { Tooltip } from './components/Tooltip';
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
  Layers,
  Layers3,
  Lock,
  Unlock,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { auth, loginWithGoogle, logout } from './firebase';
import { subscribeScenarios, saveUserScenario } from './utils/firestoreService';
import { apiPost } from './utils/apiClient';
import { calculateEstimate, sellFromCost, costFromSell, rateFromCostSell, convertRate, createBlankPattern, createPatternFromEstimate } from './utils/calculations';

type ActiveView = 'workspace' | 'library' | 'multipattern' | 'batch';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([]);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveModal, setSaveModal] = useState<{ isOverwriting: boolean; kind: ScenarioKind } | null>(null);
  const [saveModalName, setSaveModalName] = useState('');
  const [saveModalNotes, setSaveModalNotes] = useState('');

  const [activeView, setActiveView] = useState<ActiveView>('workspace');
  const [activeScenarioId, setActiveScenarioId] = useState('');
  const [activeMultiPatternId, setActiveMultiPatternId] = useState('');
  const [activeBatchId, setActiveBatchId] = useState('');
  const [mpMarket, setMpMarket] = useState<{ price: number; basis: string } | null>(null);
  const [mpMarketLoading, setMpMarketLoading] = useState(false);
  const [newEstimate, setNewEstimate] = useState<DetailedEstimate>(() =>
    JSON.parse(JSON.stringify(createEmptyEstimate()))
  );
  const [oldEstimate, setOldEstimate] = useState<DetailedEstimate>(() =>
    JSON.parse(JSON.stringify(createEmptyEstimate()))
  );
  // 複数Lot見積は新旧比較から独立した機能。専用のベース見積を持つ（基準数は各Lotで設定するため0）。
  const [multiPatternBase, setMultiPatternBase] = useState<DetailedEstimate>(() => ({
    ...JSON.parse(JSON.stringify(createEmptyEstimate())),
    baseLotSize: 0,
  }));
  const [quantityPatterns, setQuantityPatterns] = useState<QuantityPattern[]>([]);
  const [batchParts, setBatchParts] = useState<BatchPart[]>([]);

  const [activeSheetTab, setActiveSheetTab] = useState<'workspace' | 'compare' | 'print'>('workspace');
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [aiRetryCountdown, setAiRetryCountdown] = useState<number | null>(null);
  const [aiReconcileModal, setAiReconcileModal] = useState<{
    isNew: boolean;
    status: 'loading' | 'result' | 'error';
    result?: any;
    error?: string;
  } | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
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

  // Restore the 複数品番同時比較 working set (per user) from localStorage on login.
  // batchParts is self-contained (each part holds its full estimate), so this is
  // a safe local scratchpad that survives a page refresh without Firestore.
  const batchHydratedRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`esticompare:batch:${user.uid}`);
      setBatchParts(raw ? JSON.parse(raw) : []);
    } catch {
      setBatchParts([]);
    }
    batchHydratedRef.current = true;
  }, [user]);

  useEffect(() => {
    if (!user || !batchHydratedRef.current) return;
    try {
      localStorage.setItem(`esticompare:batch:${user.uid}`, JSON.stringify(batchParts));
    } catch {
      /* quota or serialization error — ignore, working set is non-critical */
    }
  }, [batchParts, user]);

  // 複数Lot見積も独立した作業セット（base + patterns）としてlocalStorageに保持。
  // 新旧比較・複数品番とは別タイミングで使うため、シナリオやnewEstimateには連動させない。
  const mpHydratedRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(`esticompare:multipattern:${user.uid}`);
      if (raw) {
        const data = JSON.parse(raw);
        setMultiPatternBase(data.base || { ...createEmptyEstimate(), baseLotSize: 0 });
        setQuantityPatterns(Array.isArray(data.patterns) ? data.patterns : []);
      } else {
        setMultiPatternBase({ ...JSON.parse(JSON.stringify(createEmptyEstimate())), baseLotSize: 0 });
        setQuantityPatterns([]);
      }
    } catch {
      setMultiPatternBase({ ...JSON.parse(JSON.stringify(createEmptyEstimate())), baseLotSize: 0 });
      setQuantityPatterns([]);
    }
    mpHydratedRef.current = true;
  }, [user]);

  useEffect(() => {
    if (!user || !mpHydratedRef.current) return;
    try {
      localStorage.setItem(`esticompare:multipattern:${user.uid}`, JSON.stringify({ base: multiPatternBase, patterns: quantityPatterns }));
    } catch {
      /* non-critical working set */
    }
  }, [multiPatternBase, quantityPatterns, user]);

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
      if (isDraggingRef.current || isSidebarDragging.current) {
        document.body.style.userSelect = '';
      }
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

  // ─── 複数Lot見積（独立） — 新規・取込・入場時の初期化 ─────────────────────────
  const seedBlankPatterns = () =>
    [0, 1, 2].map((i) => createBlankPattern(`パターン${i + 1}`, multiPatternBase.lotUnit || '個', i));

  const handleNewMultiPattern = () => {
    setMultiPatternBase({ ...JSON.parse(JSON.stringify(createEmptyEstimate())), baseLotSize: 0 });
    setQuantityPatterns([0, 1, 2].map((i) => createBlankPattern(`パターン${i + 1}`, '個', i)));
    setActiveMultiPatternId('');
    setMpMarket(null);
  };

  const handleNewBatch = () => {
    setBatchParts([]);
    setActiveBatchId('');
  };

  // マイシナリオの読込: kind に応じて正しい機能で開く（重要: 複数Lot/複数品番を新旧比較で開かない）
  const handleScenarioLoad = (id: string) => {
    const scen = customScenarios.find((s) => s.id === id);
    if (!scen) return;
    const kind = scen.kind || 'compare';
    setNewScenarioName(scen.name);
    if (kind === 'multilot') {
      setMultiPatternBase(JSON.parse(JSON.stringify(scen.multiPatternBase || scen.newEstimate)));
      setQuantityPatterns(scen.quantityPatterns && scen.quantityPatterns.length > 0
        ? JSON.parse(JSON.stringify(scen.quantityPatterns)) : seedBlankPatterns());
      setActiveMultiPatternId(id);
      setActiveView('multipattern');
      return;
    }
    if (kind === 'batch') {
      setBatchParts(scen.batchParts ? JSON.parse(JSON.stringify(scen.batchParts)) : []);
      setActiveBatchId(id);
      setActiveView('batch');
      return;
    }
    setActiveScenarioId(id);
    setNewEstimate(JSON.parse(JSON.stringify(scen.newEstimate)));
    setOldEstimate(JSON.parse(JSON.stringify(scen.oldEstimate)));
    setComparisonResult(scen.comparisonResult);
    setActiveSheetTab('workspace');
    setActiveView('workspace');
  };

  // 他機能・ライブラリの品番データを複数Lotのベースに取り込む（全Lotの賃率を新ベースで再スナップショット）
  const importIntoMultiPattern = (est: DetailedEstimate) => {
    const cloned: DetailedEstimate = JSON.parse(JSON.stringify(est));
    const snapshot = createPatternFromEstimate(cloned, '', cloned.baseLotSize || 0).processRates;
    setMultiPatternBase(cloned);
    setQuantityPatterns((prev) => {
      const list = prev.length ? prev : seedBlankPatterns();
      return list.map((p) => ({
        ...p,
        lotUnit: p.lotUnit || cloned.lotUnit,
        processRates: JSON.parse(JSON.stringify(snapshot)),
      }));
    });
    setActiveView('multipattern');
  };

  const goMultiPattern = () => {
    if (activeView === 'multipattern') { setActiveView('workspace'); return; }
    if (quantityPatterns.length === 0) setQuantityPatterns(seedBlankPatterns());
    setActiveView('multipattern');
  };

  const handleResetActiveSheet = () => {
    if (activeView === 'multipattern') {
      const savedMp = customScenarios.find((s) => s.id === activeMultiPatternId);
      if (savedMp) {
        setMultiPatternBase(JSON.parse(JSON.stringify(savedMp.multiPatternBase || savedMp.newEstimate)));
        setQuantityPatterns(savedMp.quantityPatterns ? JSON.parse(JSON.stringify(savedMp.quantityPatterns)) : seedBlankPatterns());
      } else { handleNewMultiPattern(); }
      return;
    }
    if (activeView === 'batch') {
      const savedB = customScenarios.find((s) => s.id === activeBatchId);
      if (savedB) { setBatchParts(savedB.batchParts ? JSON.parse(JSON.stringify(savedB.batchParts)) : []); }
      else { handleNewBatch(); }
      return;
    }
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

  // 「新規作成」は現在表示中の機能に対して働く（新旧比較／複数Lot／複数品番）
  const handleCreateNewSheet = () => {
    if (activeView === 'multipattern') { handleNewMultiPattern(); return; }
    if (activeView === 'batch') { handleNewBatch(); return; }
    const emptyEst = createEmptyEstimate();
    setActiveScenarioId('new-custom-sheet');
    setOldEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewScenarioName('新規カスタム見積');
    setComparisonResult(null);
    setActiveSheetTab('workspace');
    setActiveView('workspace');
  };

  // マイシナリオの「新規作成」: タブ（機能）に応じて白紙作成し、その機能を開く
  const handleNewByKind = (kind: ScenarioKind) => {
    if (kind === 'multilot') { handleNewMultiPattern(); setActiveView('multipattern'); return; }
    if (kind === 'batch') { handleNewBatch(); setActiveView('batch'); return; }
    const emptyEst = createEmptyEstimate();
    setActiveScenarioId('new-custom-sheet');
    setOldEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewScenarioName('新規カスタム見積');
    setComparisonResult(null);
    setActiveSheetTab('workspace');
    setActiveView('workspace');
  };

  // 表示中の機能から保存種別を決める（新旧比較／複数Lot／複数品番）
  const currentSaveKind: ScenarioKind =
    activeView === 'multipattern' ? 'multilot' : activeView === 'batch' ? 'batch' : 'compare';

  const defaultSaveName = (kind: ScenarioKind): string => {
    if (kind === 'multilot') return multiPatternBase.partNumber ? `${multiPatternBase.partNumber} 複数Lot見積` : '複数Lot見積';
    if (kind === 'batch') {
      const first = batchParts.find((p) => p.estimate.partNumber.trim());
      return `複数品番同時比較（${batchParts.length}品番${first ? ' / ' + first.estimate.partNumber : ''}）`;
    }
    return newScenarioName || 'マイカスタム見積シナリオ';
  };

  const handleSaveScenario = (isOverwriting: boolean = false) => {
    if (!user) {
      alert('クラウド保存を利用するには右上からサインインしてください。');
      return;
    }
    const kind = currentSaveKind;
    if (kind === 'batch' && batchParts.length === 0) { alert('保存する品番がありません。先に品番を追加してください。'); return; }
    if (kind === 'multilot' && quantityPatterns.length === 0) { alert('保存するLotがありません。先にLotを追加してください。'); return; }
    setSaveModalName(defaultSaveName(kind));
    setSaveModalNotes('');
    setSaveModal({ isOverwriting, kind });
  };

  const handleSaveConfirm = async () => {
    if (!saveModal) return;
    const { isOverwriting, kind } = saveModal;
    const activeId = kind === 'multilot' ? activeMultiPatternId : kind === 'batch' ? activeBatchId : activeScenarioId;
    const targetId = isOverwriting && customScenarios.some((s) => s.id === activeId && (s.kind || 'compare') === kind) ? activeId : '';
    const targetName = saveModalName.trim() || defaultSaveName(kind);
    setSaveModal(null);
    setIsSaving(true);
    try {
      let input;
      if (kind === 'multilot') {
        // 一覧表示・ルール検証用にベース見積を newEstimate/oldEstimate にも入れる
        input = {
          id: targetId, name: targetName, kind, notes: saveModalNotes.trim() || undefined,
          newEstimate: multiPatternBase, oldEstimate: JSON.parse(JSON.stringify(multiPatternBase)),
          comparisonResult: null, multiPatternBase, quantityPatterns,
        };
      } else if (kind === 'batch') {
        const display = batchParts[0]?.estimate || createEmptyEstimate();
        input = {
          id: targetId, name: targetName, kind, notes: saveModalNotes.trim() || undefined,
          newEstimate: display, oldEstimate: JSON.parse(JSON.stringify(display)),
          comparisonResult: null, batchParts,
        };
      } else {
        input = {
          id: targetId, name: targetName, kind, notes: saveModalNotes.trim() || undefined,
          newEstimate, oldEstimate, comparisonResult,
        };
      }
      const savedId = await saveUserScenario(input);
      if (savedId) {
        if (kind === 'multilot') setActiveMultiPatternId(savedId);
        else if (kind === 'batch') setActiveBatchId(savedId);
        else { setActiveScenarioId(savedId); setNewScenarioName(targetName); }
        setSaveToast(`「${targetName}」を保存しました`);
        setTimeout(() => setSaveToast(null), 3000);
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message || '保存に失敗しました。再度お試しください。');
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

  // 複数Lot基本諸元（サイドバー）の編集ハンドラ — multiPatternBaseを更新
  const updateMpField = (key: 'partNumber' | 'partName' | 'finishedWeightG', value: any) =>
    setMultiPatternBase(prev => ({ ...prev, [key]: value }));
  const updateMpMaterial = (key: 'materialName' | 'inputWeightG' | 'basePricePerKg' | 'actualBasePricePerKg' | 'scrapWeightG' | 'scrapPricePerKg', value: any) => {
    if (key === 'materialName') setMpMarket(null); // 材質変更で相場結果は無効化
    setMultiPatternBase(prev => ({ ...prev, material: { ...prev.material, [key]: value } }));
  };
  const updateMpMinProfit = (value: string) => {
    const parsed = parseFloat(value);
    setMultiPatternBase(prev => ({ ...prev, adjustments: { ...prev.adjustments, minProfitRate: isNaN(parsed) ? 0 : parsed } }));
  };

  // 材料建値の市場相場をAIで推定し、客提示建値との乖離をチェックする
  const checkMpMarketPrice = async () => {
    if (!user) { alert('AI相場照合はログインが必要です。'); return; }
    const name = multiPatternBase.material.materialName.trim();
    if (!name) { alert('先に材質・規格を入力してください。'); return; }
    setMpMarketLoading(true);
    setMpMarket(null);
    try {
      const res = await apiPost('/api/get-material-price', { materialName: name });
      const data = await res.json();
      if (typeof data.estimatedBasePricePerKg === 'number' && data.estimatedBasePricePerKg > 0) {
        setMpMarket({ price: data.estimatedBasePricePerKg, basis: data.basis || '' });
      } else {
        alert('相場の推定に失敗しました。');
      }
    } catch (e: any) {
      alert(`相場照合に失敗しました。\n${e?.message || '通信エラー'}`);
    } finally {
      setMpMarketLoading(false);
    }
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
    const newRate = rateFromCostSell(primeCost, base, mode);
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
      // 目標利益率・下限利益率は外掛け(markup)なので sell = cost / (1 - rate)
      const minRequiredSellingPrice = minProfitPercent < 100 ? actualTotalCost / (1 - minProfitPercent / 100) : actualTotalCost * 100;
      const targetRequiredSellingPrice = targetProfitPercent < 100 ? actualTotalCost / (1 - targetProfitPercent / 100) : actualTotalCost * 100;
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
    const hasAnyProcess = target.processes.some(p => p.processName.trim() !== '');
    if (!hasAnyProcess) { alert("加工費の自動調整対象となる工程が見つかりません。"); return; }
    const lotSize = target.baseLotSize || 1;
    const processHoursList = target.processes.map(proc => {
      if (!proc.processName.trim()) return 0;
      const mode = proc.calcMode || (proc.isDirectInput ? 'direct' : proc.kgPrice > 0 ? 'kg' : 'standard');
      if (mode !== 'standard') return 0;
      return (proc.yieldPerHour > 0 ? 1 / proc.yieldPerHour : 0) + (lotSize > 0 ? (proc.totalHours || 0) / lotSize : 0);
    });
    // ロック中の工程は調整対象外。現在の客提示加工費をそのまま固定費として扱う。
    const lockedClientCost = target.processes.reduce((sum, proc, i) =>
      (proc.processName.trim() && proc.locked) ? sum + (calc.processCosts[i] || 0) : sum, 0);
    // 現在の客提示加工費合計（standardは実態賃率で、他はそのまま）— ロック工程は除外
    const currentStdCostTemp = target.processes.reduce((sum, proc, i) => {
      const mode = proc.calcMode || (proc.isDirectInput ? 'direct' : proc.kgPrice > 0 ? 'kg' : 'standard');
      if (!proc.processName.trim() || proc.locked || mode !== 'standard') return sum;
      return sum + (processHoursList[i] * (proc.actualHourlyRate ?? proc.hourlyRate ?? 3000));
    }, 0);
    // non-standard（kg/lump/direct）の客提示コスト合計 — ロック工程は除外
    const nonStdClientCostCurrent = calc.processCosts.reduce((sum, cost, i) => {
      const proc = target.processes[i];
      if (!proc || !proc.processName.trim() || proc.locked) return sum;
      const mode = proc.calcMode || (proc.isDirectInput ? 'direct' : proc.kgPrice > 0 ? 'kg' : 'standard');
      return mode !== 'standard' ? sum + cost : sum;
    }, 0);
    let draftProcesses = [...target.processes];
    const sgaMode = target.adjustments.sgaCalcMode || 'markup';
    // 利管費率の健全範囲。KNOWLEDGE §4-4 の正常範囲(5〜25%)に合わせ、複数Lot/複数品番と統一。
    // （旧実装は上限15%と狭く、17〜25%の自然な率でも辻褄が残り「計算がおかしい」原因になっていた）
    const SGA_MIN = 5;
    const SGA_MAX = 25;
    let finalSgaPercent = Math.min(SGA_MAX, Math.max(SGA_MIN, target.adjustments.sgaRatePercent ?? 15));
    const materialCost = calc.netMaterialCost;
    const targetPrimeCost = costFromSell(Y, finalSgaPercent, sgaMode);
    // non-standardも含めて全体をスケール
    const totalCurrentClientCost = currentStdCostTemp + nonStdClientCostCurrent;
    // ロック工程の固定費を差し引いた残りを、未ロック工程の賃率スケールで埋める
    const targetTotalProcessCost = Math.max(0, targetPrimeCost - materialCost - lockedClientCost);
    if (totalCurrentClientCost > 0) {
      const multiplier = Math.max(0.1, targetTotalProcessCost / totalCurrentClientCost);
      draftProcesses = target.processes.map((proc) => {
        if (!proc.processName.trim() || proc.locked) return proc;
        const mode = proc.calcMode || (proc.isDirectInput ? 'direct' : proc.kgPrice > 0 ? 'kg' : 'standard');
        if (mode === 'standard') {
          const actRate = proc.actualHourlyRate ?? proc.hourlyRate ?? 3000;
          let roundedRate = Math.round((actRate * multiplier) / 100) * 100;
          if (roundedRate < 1000) roundedRate = 1000;
          return { ...proc, hourlyRate: roundedRate };
        } else if (mode === 'direct') {
          const actual = proc.actualDirectProcessingCost ?? proc.directProcessingCost;
          return { ...proc, directProcessingCost: parseFloat(((actual || 0) * multiplier).toFixed(2)) };
        } else if (mode === 'kg') {
          const actual = proc.actualKgPrice ?? proc.kgPrice;
          return { ...proc, kgPrice: parseFloat(((actual || 0) * multiplier).toFixed(2)) };
        } else if (mode === 'lump') {
          const actual = proc.actualLumpSumPrice ?? proc.lumpSumPrice;
          return { ...proc, lumpSumPrice: parseFloat(((actual || 0) * multiplier).toFixed(2)) };
        }
        return proc;
      });
    }
    const tempPrimeCost = materialCost + draftProcesses.reduce((sum, proc, i) => {
      if (!proc.processName.trim()) return sum;
      const mode = proc.calcMode || (proc.isDirectInput ? 'direct' : proc.kgPrice > 0 ? 'kg' : 'standard');
      if (mode === 'direct') return sum + (proc.directProcessingCost || 0);
      if (mode === 'kg') return sum + (target.finishedWeightG > 0 ? (target.finishedWeightG / 1000) * (proc.kgPrice || 0) : 0);
      if (mode === 'lump') return sum + (lotSize > 0 ? (proc.lumpSumPrice || 0) / lotSize : 0);
      return sum + (processHoursList[i] * (proc.hourlyRate || 0));
    }, 0);
    let clampedOutOfRange = false; // 賃率丸めの残差をSGAで吸収しきれず辻褄が残るケース
    if (tempPrimeCost > 0) {
      const rawSga = Math.round(rateFromCostSell(tempPrimeCost, Y, sgaMode) * 100) / 100;
      if (rawSga < SGA_MIN) {
        if (isNew && !locked) {
          // 新単価フリー: 目標単価を引き上げて最低SGA_MINを確保
          const requiredY = sellFromCost(tempPrimeCost, SGA_MIN, sgaMode);
          const raisedPrice = Math.ceil(requiredY + (reconciledUnitPrice - Y));
          reconciledUnitPrice = raisedPrice;
          updatedAdjustments.targetUnitPrice = raisedPrice;
          const adjustedY = raisedPrice - (calc.shippingCostPerUnit) - (target.adjustments.otherAdjustment || 0);
          finalSgaPercent = Math.min(SGA_MAX, Math.max(SGA_MIN, Math.round(rateFromCostSell(tempPrimeCost, adjustedY, sgaMode) * 100) / 100));
        } else {
          // 旧単価 or 新単価ロック: 目標単価固定、SGAをSGA_MINに設定（辻褄は残る）
          finalSgaPercent = SGA_MIN;
          clampedOutOfRange = true;
        }
      } else if (rawSga > SGA_MAX) {
        // SGAが健全上限を超過 → SGA_MAXにクランプ（辻褄は残る）
        finalSgaPercent = SGA_MAX;
        clampedOutOfRange = true;
      } else {
        finalSgaPercent = Math.min(SGA_MAX, Math.max(SGA_MIN, rawSga));
      }
    }
    updatedAdjustments.sgaRatePercent = finalSgaPercent;
    if (isNew) setNewEstimate({ ...target, processes: draftProcesses, adjustments: updatedAdjustments });
    else setOldEstimate({ ...target, processes: draftProcesses, adjustments: updatedAdjustments });

    // 辻褄が合わない（auditVariance≠0が残る）場合、AGENTS.md §3に従い前提見直しを促す
    if (clampedOutOfRange) {
      const finalPrimeCost = tempPrimeCost;
      const finalSgaCost = sgaMode === 'markup'
        ? (finalSgaPercent < 100 ? finalPrimeCost * (finalSgaPercent / 100) / (1 - finalSgaPercent / 100) : 0)
        : finalPrimeCost * (finalSgaPercent / 100);
      const finalGrand = finalPrimeCost + finalSgaCost + calc.shippingCostPerUnit + (target.adjustments.otherAdjustment || 0);
      const residual = finalGrand - reconciledUnitPrice;
      if (Math.abs(residual) >= 1) {
        alert(
          `【辻褄を合わせきれませんでした】\n` +
          `利管費率を健全範囲(${SGA_MIN}〜${SGA_MAX}%)に収めると、積み上げ単価が目標単価から ${residual > 0 ? '+' : ''}${residual.toFixed(2)}円 ずれます。\n\n` +
          `これは賃率の調整だけでは辻褄が合わないサインです。AGENTS.mdの原則に従い、` +
          `出来高(個/h)や段取時間(h)など生産前提の見直し（新旧同時）を検討してください。`
        );
      }
    }
  };

  // ─── AI自動補正 ────────────────────────────────────────────────────────────────
  const handleAiAutoReconcile = async (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const targetSellPrice = est.adjustments.targetUnitPrice;
    if (!targetSellPrice || targetSellPrice <= 0) {
      alert('先に目標売価を入力してください。');
      return;
    }
    if (!user) {
      alert('AI機能はログインが必要です。');
      return;
    }
    setAiReconcileModal({ isNew, status: 'loading' });
    try {
      const response = await apiPost('/api/ai-auto-reconcile', { estimate: est, targetSellPrice, isNew });
      const data = await response.json();
      setAiReconcileModal({ isNew, status: 'result', result: data });
    } catch (e: any) {
      setAiReconcileModal({ isNew, status: 'error', error: e?.message || 'AI補正に失敗しました。' });
    }
  };

  const applyAiReconcileResult = () => {
    if (!aiReconcileModal?.result) return;
    const { isNew, result } = aiReconcileModal;
    const est = isNew ? newEstimate : oldEstimate;
    const adjustments: any[] = Array.isArray(result.processAdjustments) ? result.processAdjustments : [];
    const updatedProcesses = est.processes.map((proc) => {
      if (proc.locked) return proc; // ロック工程はAI自動補正で変更しない
      // 賃率調整は standard モードの工程のみ（kg/一式/直接入力は hourlyRate を使わない）。
      const mode = proc.calcMode || (proc.isDirectInput ? 'direct' : proc.kgPrice > 0 ? 'kg' : 'standard');
      if (mode !== 'standard') return proc;
      // AI には 1始まりの proc.index を含むデータを渡しているため、同じ 1始まり index で照合する。
      const adj = adjustments.find((a) => a?.index === proc.index);
      if (!adj || typeof adj.suggestedHourlyRate !== 'number' || adj.suggestedHourlyRate <= 0) return proc;
      return { ...proc, hourlyRate: Math.round(adj.suggestedHourlyRate / 100) * 100 };
    });
    const suggestedSga = typeof result.suggestedSgaPercent === 'number'
      ? result.suggestedSgaPercent : est.adjustments.sgaRatePercent;
    const updatedEst = {
      ...est,
      processes: updatedProcesses,
      adjustments: { ...est.adjustments, sgaRatePercent: suggestedSga },
    };
    if (isNew) setNewEstimate(updatedEst);
    else setOldEstimate(updatedEst);
    setAiReconcileModal(null);
  };

  // ─── 3-way linkage for ㉘/㉙/㉚ ───────────────────────────────────────────────

  const getNewCost = () =>
    newEstimate.adjustments.actualPurchasePrice > 0
      ? newEstimate.adjustments.actualPurchasePrice
      : newCalc.actualTotalCost;

  // 目標売値 → auto-derive ㉙ markup only (internal)
  const handleNew28Change = (value: string) => {
    const sell = parseFloat(value);
    if (isNaN(sell) || sell <= 0) {
      setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetUnitPrice: 0 } }));
      return;
    }
    const cost = getNewCost();
    if (cost > 0) {
      const markup = rateFromCostSell(cost, sell, 'markup'); // 外掛け = (売価−原価)/売価
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
    let markup = parseFloat(value);
    // 外掛けは率<100%でのみ売価が定義される（100%以上は原価÷0以下で発散）。
    if (!isNaN(markup) && markup >= 100) {
      markup = 99.99;
      alert('目標利益率（外掛け）は100%未満で入力してください。99.99%に補正しました。');
    }
    const cost = getNewCost();
    if (!isNaN(markup) && cost > 0) {
      const sell = sellFromCost(cost, markup, 'markup'); // 外掛け: 売価 = 原価/(1−率)
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
      const mg = convertRate(mu, 'markup'); // 外掛け入力→内掛けで保存（i = e/(1−e)）
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

  const overwriteTargetId = currentSaveKind === 'multilot' ? activeMultiPatternId
    : currentSaveKind === 'batch' ? activeBatchId : activeScenarioId;
  const isOverwritable = customScenarios.some(s => s.id === overwriteTargetId && (s.kind || 'compare') === currentSaveKind);
  const oldCalc = calculateEstimate(oldEstimate);
  const newCalc = calculateEstimate(newEstimate);

  // 仕入実費: use actualPurchasePrice if entered, else fall back to calculated grandTotal
  const oldPurchase = oldEstimate.adjustments.actualPurchasePrice > 0
    ? oldEstimate.adjustments.actualPurchasePrice
    : oldCalc.actualTotalCost;
  const newPurchase = newEstimate.adjustments.actualPurchasePrice > 0
    ? newEstimate.adjustments.actualPurchasePrice
    : newCalc.actualTotalCost;

  const oldSell = oldEstimate.adjustments.targetUnitPrice || 0;
  const oldMarkup = (oldSell > 0 && oldPurchase > 0) ? rateFromCostSell(oldPurchase, oldSell, 'markup') : null; // 外掛け
  const oldMargin = (oldSell > 0 && oldPurchase > 0) ? rateFromCostSell(oldPurchase, oldSell, 'margin') : null; // 内掛け
  const oldGrossPerUnit = oldSell > 0 && oldPurchase > 0 ? oldSell - oldPurchase : null;

  const newSell = newEstimate.adjustments.targetUnitPrice || 0;
  const newMarkup = (newSell > 0 && newPurchase > 0) ? rateFromCostSell(newPurchase, newSell, 'markup') : null; // 外掛け
  const newMargin = (newSell > 0 && newPurchase > 0) ? rateFromCostSell(newPurchase, newSell, 'margin') : null; // 内掛け
  const newGrossPerUnit = newSell > 0 && newPurchase > 0 ? newSell - newPurchase : null;

  // ㉚ derived display values (internal)
  const newInternalMarkup = newEstimate.adjustments.targetProfitRate || 0;
  const newInternalMargin = newInternalMarkup > 0 ? convertRate(newInternalMarkup, 'markup') : null; // 外→内
  // 得意先用: 保存値（内掛け）から外掛けを導出
  const newClientMarginOff = newEstimate.adjustments.targetProfitMarginOff || 0;
  const newClientMarkupOff = newClientMarginOff > 0
    ? parseFloat(convertRate(newClientMarginOff, 'margin').toFixed(4)) // 内→外
    : null;

  const purchaseRatio = (oldPurchase > 0 && newPurchase > 0) ? (newPurchase / oldPurchase * 100) : null;
  const sellRatio = (oldSell > 0 && newSell > 0) ? (newSell / oldSell * 100) : null;
  const purchaseDiff = newPurchase - oldPurchase;
  const sellDiff = newSell - oldSell;

  // 積み上げ単価 - 目標単価（マイナス＝目標に対して積み上げが足りない）
  const oldGapToTarget = (oldSell > 0 && oldCalc.grandTotalUnitPrice > 0) ? oldCalc.grandTotalUnitPrice - oldSell : null;
  const newGapToTarget = (newSell > 0 && newCalc.grandTotalUnitPrice > 0) ? newCalc.grandTotalUnitPrice - newSell : null;
  // 積み上げ単価を使った外掛け/内掛け（常時表示用）
  const oldCalcMarkup = (oldSell > 0 && oldCalc.grandTotalUnitPrice > 0) ? rateFromCostSell(oldCalc.grandTotalUnitPrice, oldSell, 'markup') : null;
  const oldCalcMargin = (oldSell > 0 && oldCalc.grandTotalUnitPrice > 0) ? rateFromCostSell(oldCalc.grandTotalUnitPrice, oldSell, 'margin') : null;
  const newCalcMarkup = (newSell > 0 && newCalc.grandTotalUnitPrice > 0) ? rateFromCostSell(newCalc.grandTotalUnitPrice, newSell, 'markup') : null;
  const newCalcMargin = (newSell > 0 && newCalc.grandTotalUnitPrice > 0) ? rateFromCostSell(newCalc.grandTotalUnitPrice, newSell, 'margin') : null;

  // 帳尻利管費率: 材工費 (primeCost) に対して、何%の利管費をかければ目標売値に帳尻が合うか
  // base = targetSell - shipping - other を売価、primeCost を原価として外掛け/内掛けを算出
  // 帳尻利管費率: base > 0 さえあれば常に表示（マイナスや0は赤で警告表示）
  const calcReconcileRates = (primeCost: number, sell: number, shipping: number, other: number) => {
    if (primeCost <= 0 || sell <= 0) return { margin: null as number | null, markup: null as number | null };
    const base = sell - shipping - other;
    if (base <= 0) return { margin: null as number | null, markup: null as number | null };
    return {
      margin: rateFromCostSell(primeCost, base, 'margin'), // 内掛け = (base-cost)/cost
      markup: rateFromCostSell(primeCost, base, 'markup'), // 外掛け = (base-cost)/base
    };
  };
  const { margin: oldReconcileMargin, markup: oldReconcileMarkup } = calcReconcileRates(
    oldCalc.primeCost, oldSell, oldCalc.shippingCostPerUnit, oldEstimate.adjustments.otherAdjustment || 0
  );
  const { margin: newReconcileMargin, markup: newReconcileMarkup } = calcReconcileRates(
    newCalc.primeCost, newSell, newCalc.shippingCostPerUnit, newEstimate.adjustments.otherAdjustment || 0
  );

  // Proposal 2: 売値フロア — 外掛け25%を維持できる最低売値（売価=原価/(1−0.25)）
  const newSellFloor = newCalc.actualTotalCost > 0 ? sellFromCost(newCalc.actualTotalCost, 25, 'markup') : null;
  const newSellFloorGap = newSellFloor !== null && newSell > 0 ? newSell - newSellFloor : null;

  // Proposal 5: primeCostベース客向け実内掛け — materials+processingだけを客提示仕入れと仮定した場合の客向け内掛け率
  // 内掛け = (売価−原価)/原価。値が小さいほど primeCost が十分に膨らんでいる
  const oldPrimeCostMargin = oldSell > 0 && oldCalc.primeCost > 0
    ? rateFromCostSell(oldCalc.primeCost, oldSell, 'margin') : null;
  const newPrimeCostMargin = newSell > 0 && newCalc.primeCost > 0
    ? rateFromCostSell(newCalc.primeCost, newSell, 'margin') : null;

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

  // 架空利管費率（客提示の積み上げ単価に実際に含まれている利管費率）:
  //   原価＝客提示primeCost、売価＝積み上げ単価−送料−その他調整。選択中の方式(外掛け/内掛け)で算出。
  //   ＝ 客が見積書から逆算して読み取る実効利管費率。入力した利管費率にほぼ一致する（sgaFixed分のみ差）。
  //   ※ 目標単価から逆算する「帳尻利管費率」(calcReconcileRates)とは別物。混同しないこと。
  const getEmbeddedSgaRate = (grandTotal: number, shippingCost: number, other: number, primeCost: number, mode: 'markup' | 'margin'): number | null => {
    const base = grandTotal - shippingCost - other;
    if (base <= 0 || primeCost <= 0) return null;
    return rateFromCostSell(primeCost, base, mode);
  };
  const oldSgaMode = oldEstimate.adjustments.sgaCalcMode || 'markup';
  const newSgaMode = newEstimate.adjustments.sgaCalcMode || 'markup';
  const oldEmbeddedSgaRate = getEmbeddedSgaRate(oldCalc.grandTotalUnitPrice, oldCalc.shippingCostPerUnit, oldEstimate.adjustments.otherAdjustment || 0, oldCalc.primeCost, oldSgaMode);
  const newEmbeddedSgaRate = getEmbeddedSgaRate(newCalc.grandTotalUnitPrice, newCalc.shippingCostPerUnit, newEstimate.adjustments.otherAdjustment || 0, newCalc.primeCost, newSgaMode);

  // 実態利益率: 仕入実費(原価)と積み上げ単価(売価)から算出した【外掛け】利益率
  //   外掛け = (積み上げ単価 − 仕入実費) ÷ 積み上げ単価 × 100
  const oldActualCostForMarkup = oldEstimate.adjustments.actualPurchasePrice > 0
    ? oldEstimate.adjustments.actualPurchasePrice : oldCalc.actualTotalCost;
  const newActualCostForMarkup = newEstimate.adjustments.actualPurchasePrice > 0
    ? newEstimate.adjustments.actualPurchasePrice : newCalc.actualTotalCost;
  const oldActualMarkupRate = oldActualCostForMarkup > 0 && oldCalc.grandTotalUnitPrice > 0
    ? rateFromCostSell(oldActualCostForMarkup, oldCalc.grandTotalUnitPrice, 'markup') : null; // 外掛け
  const newActualMarkupRate = newActualCostForMarkup > 0 && newCalc.grandTotalUnitPrice > 0
    ? rateFromCostSell(newActualCostForMarkup, newCalc.grandTotalUnitPrice, 'markup') : null;

  const showFixedHeader = activeView === 'workspace' && activeSheetTab === 'workspace';

  // SGA率が不自然な範囲かどうか（5%未満 or 30%超）
  const sgaWarnOld = (+(oldEstimate.adjustments.sgaRatePercent || 0)) > 0 &&
    ((+(oldEstimate.adjustments.sgaRatePercent || 0)) < 5 || (+(oldEstimate.adjustments.sgaRatePercent || 0)) > 30);
  const sgaWarnNew = (+(newEstimate.adjustments.sgaRatePercent || 0)) > 0 &&
    ((+(newEstimate.adjustments.sgaRatePercent || 0)) < 5 || (+(newEstimate.adjustments.sgaRatePercent || 0)) > 30);
  // 新旧比較向けの警告なので、複数Lot・複数品番・ライブラリ表示中は出さない（workspace限定）。
  const sgaWarnActive = activeView === 'workspace' &&
    (oldCalc.grandTotalUnitPrice > 0 || newCalc.grandTotalUnitPrice > 0) && (sgaWarnOld || sgaWarnNew);

  // ─── 機能間データ取込ソース（相互補完） ───────────────────────────────────────
  // 新旧比較・ライブラリ・複数品番・複数Lot で作った品番データを、他機能から取り込めるようにする。
  const hasData = (e: DetailedEstimate) =>
    e.partNumber.trim() !== '' || e.processes.some((p) => p.processName.trim() !== '') || e.material.basePricePerKg > 0;

  const workspaceSources: ImportSource[] = [];
  if (hasData(newEstimate)) {
    workspaceSources.push({
      id: 'ws-new', group: '現在の新旧比較', label: newEstimate.partNumber || '(品番未設定)',
      subLabel: `新単価${newEstimate.partName ? ' / ' + newEstimate.partName : ''}`, estimate: newEstimate,
      oldUnitPrice: oldCalc.grandTotalUnitPrice > 0 ? oldCalc.grandTotalUnitPrice : undefined,
    });
  }
  if (hasData(oldEstimate)) {
    workspaceSources.push({
      id: 'ws-old', group: '現在の新旧比較', label: oldEstimate.partNumber || '(品番未設定)',
      subLabel: '旧単価', estimate: oldEstimate,
    });
  }
  const librarySources: ImportSource[] = customScenarios.map((s) => {
    const oc = calculateEstimate(s.oldEstimate);
    return {
      id: `lib-${s.id}`, group: 'ライブラリ', label: s.newEstimate.partNumber || '(品番未設定)',
      subLabel: s.name, estimate: s.newEstimate,
      oldUnitPrice: oc.grandTotalUnitPrice > 0 ? oc.grandTotalUnitPrice : undefined, sourceScenarioId: s.id,
    };
  });
  const batchSources: ImportSource[] = batchParts
    .filter((p) => hasData(p.estimate))
    .map((p, i) => ({
      id: `batch-${p.id}`, group: '複数品番', label: p.estimate.partNumber || `品番${i + 1}`,
      subLabel: p.estimate.partName || undefined, estimate: p.estimate, oldUnitPrice: p.oldUnitPrice,
    }));
  const mpSources: ImportSource[] = hasData(multiPatternBase)
    ? [{ id: 'mp-base', group: '複数Lot', label: multiPatternBase.partNumber || '(品番未設定)', subLabel: '複数Lotベース', estimate: multiPatternBase }]
    : [];
  // 複数Lotには自分以外（新旧比較/ライブラリ/複数品番）を、複数品番には自分以外を渡す。
  const multiPatternImportSources = [...workspaceSources, ...librarySources, ...batchSources];
  const batchImportSources = [...workspaceSources, ...librarySources, ...mpSources];

  // ─── Format helpers ───────────────────────────────────────────────────────────

  const fmtYen = (v: number) =>
    v !== 0 ? `¥${v.toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  const fmtPct = (v: number | null) =>
    v !== null ? `${v.toFixed(2)}%` : '—';

  const profitColorCls = (v: number | null) =>
    v === null ? 'text-[#6B6057]' : v >= 0 ? 'text-emerald-700' : 'text-rose-600';

  const sideInp = 'w-full px-2 py-1.5 text-sm font-mono text-[#18130F] rounded border border-[#A09488] bg-white outline-none focus:ring-1 focus:border-[#B5451B] focus:ring-[#B5451B]/20 transition-all';

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
                <span className="text-[9px] bg-[#2A2018] px-1.5 py-0.5 rounded text-[#5C5248] font-mono font-bold hidden sm:inline">
                  互換Webエミュレート
                </span>
              </div>
              <h1 className="text-xs sm:text-sm font-bold tracking-tight text-white mt-0.5 truncate max-w-[160px] sm:max-w-none">
                {newEstimate.partNumber
                  ? <span>{newEstimate.partNumber}_新旧比率積算.xlsm</span>
                  : <span className="text-[#5C5248]">新規シート (未保存)</span>
                }
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAuthLoading ? (
              <span className="text-[10px] text-[#5C5248] font-mono">読込中...</span>
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
                  className="ml-0.5 sm:ml-1 text-[10px] text-[#5C5248] hover:text-[#F8C9BB] border-l border-[#3D3228] pl-1.5 sm:pl-2 font-bold cursor-pointer transition-colors"
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
          <div className="border-b border-[#A09488] p-2 space-y-1.5">
            <div className="text-[10px] font-black text-[#5C5248] uppercase tracking-widest px-1 pb-0.5">シナリオ操作</div>

            <button
              onClick={() => { setActiveView('workspace'); setActiveSheetTab('workspace'); }}
              className={`w-full p-1.5 border rounded font-bold flex items-center gap-1.5 cursor-pointer text-xs select-none transition-all ${
                activeView === 'workspace'
                  ? 'bg-[#18130F] text-white border-[#000] hover:bg-[#2D2219]'
                  : 'bg-white hover:bg-[#F0EDE8] text-[#18130F] border-[#A09488]'
              }`}
              title="おおもとの新旧比較ワークスペースを開く"
            >
              <FileSpreadsheet className="w-3 h-3 shrink-0" />
              <span>新旧比較</span>
            </button>

            <button
              onClick={() => setActiveView(activeView === 'library' ? 'workspace' : 'library')}
              className={`w-full p-1.5 border rounded font-bold flex items-center gap-1.5 cursor-pointer text-xs select-none transition-all ${
                activeView === 'library'
                  ? 'bg-[#B5451B] text-white border-[#8A3215] hover:bg-[#8A3215]'
                  : 'bg-white hover:bg-[#FEF0EB] text-[#B5451B] border-[#A09488] hover:border-[#F8C9BB]'
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
              onClick={goMultiPattern}
              className={`w-full p-1.5 border rounded font-bold flex items-center gap-1.5 cursor-pointer text-xs select-none transition-all ${
                activeView === 'multipattern'
                  ? 'bg-[#1E3A5F] text-white border-[#16293F] hover:bg-[#2A4A7F]'
                  : 'bg-white hover:bg-[#EFF4FD] text-[#1E3A5F] border-[#A09488] hover:border-[#B8CCE8]'
              }`}
              title="1品番・複数Lot（数量別）の同時辻褄合わせシート（新旧比較とは独立）"
            >
              <Layers className="w-3 h-3 shrink-0" />
              <span>複数Lot見積</span>
              {quantityPatterns.length > 0 && (
                <span className={`ml-auto text-[8px] font-black rounded-full px-1.5 py-0.5 leading-none ${
                  activeView === 'multipattern' ? 'bg-white/20 text-white' : 'bg-[#1E3A5F] text-white'
                }`}>
                  {quantityPatterns.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveView(activeView === 'batch' ? 'workspace' : 'batch')}
              className={`w-full p-1.5 border rounded font-bold flex items-center gap-1.5 cursor-pointer text-xs select-none transition-all ${
                activeView === 'batch'
                  ? 'bg-[#1E3A5F] text-white border-[#16293F] hover:bg-[#2A4A7F]'
                  : 'bg-white hover:bg-[#EFF4FD] text-[#1E3A5F] border-[#A09488] hover:border-[#B8CCE8]'
              }`}
              title="複数品番を横並びに編集しながら整合（一斉単価改定向け／直接入力・ライブラリ取込）"
            >
              <Layers3 className="w-3 h-3 shrink-0" />
              <span>複数品番同時比較</span>
              {batchParts.length > 0 && (
                <span className={`ml-auto text-[8px] font-black rounded-full px-1.5 py-0.5 leading-none ${
                  activeView === 'batch' ? 'bg-white/20 text-white' : 'bg-[#1E3A5F] text-white'
                }`}>
                  {batchParts.length}
                </span>
              )}
            </button>

            <button
              onClick={handleCreateNewSheet}
              className="w-full p-1.5 bg-white hover:bg-[#FEF0EB] text-[#B5451B] border border-[#A09488] hover:border-[#F8C9BB] rounded font-bold flex items-center gap-1.5 cursor-pointer text-[10px] select-none transition-all"
              title={
                activeView === 'multipattern' ? '複数Lot見積を白紙から新規作成します（空のLot×3）。'
                : activeView === 'batch' ? '複数品番同時比較を白紙から新規作成します。'
                : 'シートを完全にクリアして新しい新旧比較データを作成します。'
              }
            >
              <FilePlus className="w-3 h-3 shrink-0" />
              <span>
                {activeView === 'multipattern' ? '新規作成（複数Lot）'
                  : activeView === 'batch' ? '新規作成（複数品番）'
                  : '新規作成（新旧比較）'}
              </span>
            </button>

            <button
              onClick={handleResetActiveSheet}
              className="w-full p-1.5 bg-white hover:bg-[#F0EDE8] border border-[#A09488] rounded font-bold text-[#6B6057] flex items-center gap-1.5 cursor-pointer text-[10px] select-none transition-all"
              title={isOverwritable ? '保存済みの状態に戻します。' : 'シートを初期化します。'}
            >
              <RotateCcw className="w-3 h-3 text-[#5C5248] shrink-0" />
              <span>数値リセット</span>
            </button>

            {user ? (
              <>
                {isOverwritable && (
                  <button
                    onClick={() => handleSaveScenario(true)}
                    disabled={isSaving}
                    className="w-full p-1.5 bg-white border border-[#A09488] hover:bg-[#F0EDE8] text-[#18130F] rounded font-bold flex items-center gap-1.5 cursor-pointer text-[10px] transition-all disabled:opacity-50"
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
              <div className="text-[8px] text-[#5C5248] font-bold p-1.5 rounded border border-[#A09488] bg-[#F7F6F2] leading-tight">
                サインインでクラウド保存
              </div>
            )}
          </div>

          {activeView === 'multipattern' ? (
            // 複数Lot見積を開いている間は、共通諸元以下を複数Lotの基本諸元に置き換える
            <div className="border-b border-[#A09488] p-2 space-y-1.5" style={{ borderTop: '3px solid #1E3A5F' }}>
              <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-0.5" style={{ color: '#1E3A5F' }}>複数Lot 基本諸元（全Lot共通）</div>
              <div>
                <label className="block text-xs font-bold text-[#18130F] mb-0.5">品番</label>
                <input type="text" value={multiPatternBase.partNumber} onChange={(e) => updateMpField('partNumber', e.target.value)} placeholder="例: 66-13401-09" className={sideInp} />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#18130F] mb-0.5">品名</label>
                <input type="text" value={multiPatternBase.partName ?? ''} onChange={(e) => updateMpField('partName', e.target.value)} placeholder="例: 板金プレス" className={sideInp} />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#18130F] mb-0.5">材質・規格</label>
                <input type="text" value={multiPatternBase.material.materialName} onChange={(e) => updateMpMaterial('materialName', e.target.value)} placeholder="例: SPCC t2.0" className={sideInp} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-xs font-bold text-[#18130F] mb-0.5">投入量 g</label>
                  <input type="number" value={multiPatternBase.material.inputWeightG || ''} onChange={(e) => updateMpMaterial('inputWeightG', parseFloat(e.target.value) || 0)} className={sideInp} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#18130F] mb-0.5">完成品 g</label>
                  <input type="number" value={multiPatternBase.finishedWeightG || ''} onChange={(e) => updateMpField('finishedWeightG', parseFloat(e.target.value) || 0)} className={sideInp} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-xs font-bold text-[#18130F] mb-0.5">材料建値 ¥/kg</label>
                  <input type="number" value={multiPatternBase.material.basePricePerKg || ''} onChange={(e) => updateMpMaterial('basePricePerKg', parseFloat(e.target.value) || 0)} className={sideInp} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#18130F] mb-0.5">実態建値 ¥/kg</label>
                  <input type="number" value={multiPatternBase.material.actualBasePricePerKg ?? ''} placeholder={String(multiPatternBase.material.basePricePerKg || 0)} onChange={(e) => updateMpMaterial('actualBasePricePerKg', e.target.value === '' ? undefined : parseFloat(e.target.value) || 0)} className={sideInp} />
                </div>
              </div>
              <div>
                <button
                  onClick={checkMpMarketPrice}
                  disabled={mpMarketLoading}
                  className="w-full p-1 bg-white border border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#EFF4FD] rounded font-bold text-[10px] cursor-pointer transition-all disabled:opacity-50 inline-flex items-center justify-center gap-1"
                  title="材質・規格からAIで建値の市場相場を推定し、客提示建値との乖離を確認します"
                >
                  <Zap className="w-3 h-3" /> {mpMarketLoading ? '相場照合中...' : 'AIで建値相場を照合'}
                </button>
                {mpMarket && (() => {
                  const base = multiPatternBase.material.basePricePerKg || 0;
                  const dev = base > 0 ? ((base - mpMarket.price) / mpMarket.price) * 100 : null;
                  const bad = dev !== null && Math.abs(dev) > 20;
                  return (
                    <div className={`mt-1 text-[9px] leading-tight rounded p-1 border ${bad ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-[#F0F5FF] border-[#B8CCE8] text-[#1E3A5F]'}`}>
                      <div className="font-bold">相場目安 ¥{mpMarket.price.toLocaleString()}/kg
                        {dev !== null && <span> ／ 客提示 {dev > 0 ? '+' : ''}{dev.toFixed(0)}%</span>}
                      </div>
                      {bad && <div className="font-bold">⚠ 相場との乖離が大きく、客先に疑われる恐れ</div>}
                      {mpMarket.basis && <div className="text-[#6B6057] mt-0.5">{mpMarket.basis}</div>}
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-xs font-bold text-[#18130F] mb-0.5">スクラップ g</label>
                  <input type="number" value={multiPatternBase.material.scrapWeightG || ''} onChange={(e) => updateMpMaterial('scrapWeightG', parseFloat(e.target.value) || 0)} className={sideInp} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#18130F] mb-0.5">スク単価 ¥/kg</label>
                  <input type="number" value={multiPatternBase.material.scrapPricePerKg || ''} onChange={(e) => updateMpMaterial('scrapPricePerKg', parseFloat(e.target.value) || 0)} className={sideInp} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-0.5" style={{ color: '#B5451B' }}>下限利益率 (%)</label>
                <input type="number" step="0.1" value={multiPatternBase.adjustments.minProfitRate || ''} onChange={(e) => updateMpMinProfit(e.target.value)} placeholder="例: 15" className={`${sideInp} border-[#F8C9BB]`} />
                <p className="text-[9px] text-[#5C5248] mt-0.5 leading-tight">実態利益率がこれを下回るLotを赤く警告します。</p>
              </div>
            </div>
          ) : activeView === 'batch' ? (
            // 複数品番では諸元を各品番の列で入力するため、共通諸元以下は表示しない（紛らわしさ回避）
            <div className="border-b border-[#A09488] p-2">
              <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-1" style={{ color: '#B5451B' }}>複数品番同時比較</div>
              <p className="text-[10px] text-[#6B6057] leading-relaxed px-1">
                品番・材料・工程・利管費などの諸元は、右側の<strong className="text-[#18130F]">各品番の列</strong>で直接入力します。
              </p>
            </div>
          ) : (
          <>
          {/* 共通諸元 inputs — 見積ロットは各列で設定するため除外 */}
          <div className="border-b border-[#A09488] p-2 space-y-1.5">
            <div className="text-[10px] font-black text-[#5C5248] uppercase tracking-widest px-1 pb-0.5">共通諸元</div>

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
          <div className="border-b border-[#A09488] p-2 space-y-1.5 bg-[#FFF5F2]" style={{ borderTop: '3px solid #B5451B' }}>
            <div className="text-[10px] font-black uppercase tracking-widest px-1 pb-0.5" style={{ color: '#B5451B' }}>旧単価</div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">仕入実費</label>
              <div className="relative">
                <span className="absolute left-2 top-1 text-xs text-[#5C5248]">¥</span>
                <input
                  type="number"
                  value={oldEstimate.adjustments.actualPurchasePrice || ''}
                  onChange={(e) => updateOldAdj('actualPurchasePrice', e.target.value)}
                  placeholder="実際の仕入単価"
                  className={`${sideInp} pl-5`}
                />
              </div>
              {oldCalc.grandTotalUnitPrice > 0 && (
                <div className="text-[10px] text-[#5C5248] mt-0.5 font-mono">
                  算出: {fmtYen(oldCalc.grandTotalUnitPrice)}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-[#18130F] mb-0.5">現行売価</label>
              <div className="relative">
                <span className="absolute left-2 top-1 text-xs text-[#5C5248]">¥</span>
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
                    <span className={`text-[8px] font-bold transition-colors ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'markup' ? 'text-[#B5451B]' : 'text-[#5C5248]'}`}>外</span>
                    <div className={`relative w-8 h-4 rounded-full border-2 transition-all ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'bg-[#E8C8BC] border-[#D6A89C]'}`}>
                      <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'left-4' : 'left-0.5'}`} />
                    </div>
                    <span className={`text-[8px] font-bold transition-colors ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'text-[#1E3A5F]' : 'text-[#5C5248]'}`}>内</span>
                  </button>
                  <div className={`relative flex-1 rounded border ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'border-blue-300 bg-blue-50' : 'border-orange-300 bg-orange-50'}`}>
                    <input type="number" value={oldEstimate.adjustments.sgaRatePercent || ''}
                      onChange={(e) => updateAdj(false, 'sgaRatePercent', e.target.value)}
                      placeholder="15" step="0.01"
                      className="w-full pl-1.5 pr-5 py-0.5 text-[11px] font-mono font-bold bg-transparent outline-none focus:ring-1 focus:ring-[#B5451B]/30" />
                    <span className="absolute right-1 top-0.5 text-[8px] text-[#5C5248]">%</span>
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
                  <span className="absolute right-2 top-1 text-[9px] text-[#5C5248]">%</span>
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
                <span className="absolute left-2 top-1 text-xs text-[#5C5248]">¥</span>
                <input
                  type="number"
                  value={newEstimate.adjustments.actualPurchasePrice || ''}
                  onChange={(e) => updateNewAdj('actualPurchasePrice', e.target.value)}
                  placeholder="実際の仕入単価"
                  className={`${sideInp} pl-5`}
                />
              </div>
              {newCalc.grandTotalUnitPrice > 0 && (
                <div className="text-[10px] text-[#5C5248] mt-0.5 font-mono">
                  算出: {fmtYen(newCalc.grandTotalUnitPrice)}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-1 mb-0.5">
                <label className="block text-[9px] font-bold text-[#1E3A5F]">
                  目標売値
                  <span className="text-[10px] text-[#5C5248] font-normal ml-1">← 連動</span>
                </label>
                {(() => {
                  const locked = !!newEstimate.adjustments.targetPriceLocked;
                  return (
                    <button
                      onClick={() => setNewEstimate(prev => ({ ...prev, adjustments: { ...prev.adjustments, targetPriceLocked: !prev.adjustments.targetPriceLocked } }))}
                      title={locked ? 'ロック中（自動補正で目標単価を変えない）— クリックで解除' : '解除中（自動補正で目標単価を調整可）— クリックでロック'}
                      className="shrink-0 inline-flex items-center gap-1 cursor-pointer group select-none"
                    >
                      <Unlock className={`w-3 h-3 transition-colors ${locked ? 'text-[#C8C2B8]' : 'text-[#6B6057]'}`} />
                      <span className={`relative w-8 h-4 rounded-full border-2 transition-all ${locked ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'bg-[#E2DED7] border-[#C8C2B8]'}`}>
                        <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${locked ? 'left-4' : 'left-0.5'}`} />
                      </span>
                      <Lock className={`w-3 h-3 transition-colors ${locked ? 'text-[#1E3A5F]' : 'text-[#C8C2B8]'}`} />
                      <span className={`text-[8px] font-black ml-0.5 ${locked ? 'text-[#1E3A5F]' : 'text-[#5C5248]'}`}>{locked ? 'ロック' : '解除'}</span>
                    </button>
                  );
                })()}
              </div>
              <div className="relative">
                <span className="absolute left-2 top-1 text-xs text-[#5C5248]">¥</span>
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
                <span className="text-[10px] text-[#5C5248] font-normal ml-1">← 連動</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={newEstimate.adjustments.targetProfitRate || ''}
                  onChange={(e) => handleNew29Change(e.target.value)}
                  placeholder="例: 25"
                  className={`${sideInp} pr-6 border-[#93B4D9] focus:border-[#1E3A5F] focus:ring-[#1E3A5F]/15`}
                />
                <span className="absolute right-2 top-1 text-[9px] text-[#5C5248]">%</span>
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
                    <span className={`text-[8px] font-bold transition-colors ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'markup' ? 'text-[#B5451B]' : 'text-[#5C5248]'}`}>外</span>
                    <div className={`relative w-8 h-4 rounded-full border-2 transition-all ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'bg-[#E8C8BC] border-[#D6A89C]'}`}>
                      <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'left-4' : 'left-0.5'}`} />
                    </div>
                    <span className={`text-[8px] font-bold transition-colors ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'text-[#1E3A5F]' : 'text-[#5C5248]'}`}>内</span>
                  </button>
                  <div className={`relative flex-1 rounded border ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'border-blue-300 bg-blue-50' : 'border-orange-300 bg-orange-50'}`}>
                    <input type="number" value={newEstimate.adjustments.sgaRatePercent || ''}
                      onChange={(e) => updateAdj(true, 'sgaRatePercent', e.target.value)}
                      placeholder="15" step="0.01"
                      className="w-full pl-1.5 pr-5 py-0.5 text-[11px] font-mono font-bold bg-transparent outline-none focus:ring-1 focus:ring-[#1E3A5F]/30" />
                    <span className="absolute right-1 top-0.5 text-[8px] text-[#5C5248]">%</span>
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
                    <span className="absolute right-2 top-1 text-[9px] text-[#5C5248]">%</span>
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
                    <span className="absolute right-2 top-1 text-[9px] text-[#5C5248]">%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </>
          )}

        </aside>

        {/* ── Sidebar resize handle ── */}
        <div
          className="flex-none w-2 bg-[#D6D0C8] hover:bg-[#B5451B]/40 cursor-ew-resize flex items-center justify-center group transition-colors select-none z-10"
          onMouseDown={(e) => { isSidebarDragging.current = true; document.body.style.userSelect = 'none'; e.preventDefault(); }}
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
                      <div className="flex items-center gap-0.5 mb-1"><span className="text-[9px] font-bold text-[#5C5248] leading-none truncate">仕入実費</span><Tooltip text="実際の仕入れ原価。actualPurchasePrice入力時はその値を使用。未入力時は材料費＋加工費＋実際の送料を積み上げた値。" /></div>
                      <div className="font-mono font-black text-sm text-[#6B6057] leading-tight">
                        {oldEstimate.adjustments.actualPurchasePrice > 0 ? fmtYen(oldEstimate.adjustments.actualPurchasePrice) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#E8C8BC] pr-2">
                      <div className="text-[9px] font-bold text-[#5C5248] leading-none mb-1 truncate">現行単価</div>
                      <div className="font-mono font-black text-sm text-[#B5451B] leading-tight">
                        {oldSell > 0 ? fmtYen(oldSell) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#E8C8BC] pr-2">
                      <div className="flex items-center gap-0.5 mb-1"><span className="text-[9px] font-bold text-[#5C5248] leading-none truncate">積み上げ単価</span><Tooltip text="材料費＋加工費（客提示賃率）＋利管費＋送料＋その他調整を積み上げた客提示用の見積単価。" /></div>
                      <div className="font-mono font-black text-sm text-[#18130F] leading-tight">
                        {oldCalc.grandTotalUnitPrice > 0 ? fmtYen(oldCalc.grandTotalUnitPrice) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#E8C8BC] pr-2">
                      <div className="flex items-center gap-0.5 mb-1"><span className="text-[9px] font-bold text-[#5C5248] leading-none truncate">架空利管費率</span><Tooltip text="客提示の積み上げ単価に実際に含まれる利管費率。材工費(=客提示原価)に対し、積み上げ単価−送料−その他がどれだけ上乗せされているか。客が見積書から逆算して読み取る実効利管費率で、入力した利管費率にほぼ一致します（目標単価から逆算する帳尻利管費率とは別物）。" /></div>
                      <div className={`font-mono font-black text-sm leading-tight ${oldEmbeddedSgaRate !== null ? 'text-amber-700' : 'text-[#C8C2B8]'}`}>
                        {oldEmbeddedSgaRate !== null ? `${oldEmbeddedSgaRate.toFixed(2)}%` : '—'}
                      </div>
                      {oldEmbeddedSgaRate !== null && <div className="text-[8px] text-[#5C5248] mt-0.5">{oldSgaMode === 'markup' ? '外掛け' : '内掛け'}</div>}
                    </div>
                    <div>
                      <div className="flex items-center gap-0.5 mb-1"><span className="text-[9px] font-bold text-[#5C5248] leading-none truncate">実態利益率</span><Tooltip text="仕入実費(原価)と積み上げ単価(売価)から算出した外掛け利益率。(積み上げ単価 − 仕入実費) ÷ 積み上げ単価 × 100。" /></div>
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
                      <div className="text-[10px] text-[#5C5248] font-bold leading-none mb-0.5">粗利益/個</div>
                      <div className={`font-mono font-black text-xs ${profitColorCls(oldGrossPerUnit)}`}>{oldGrossPerUnit !== null ? fmtYen(oldGrossPerUnit) : '—'}</div>
                    </div>
                    {/* 売値-計算差 (積み上げ - 目標: マイナスは積み上げ不足) */}
                    <div>
                      <div className="text-[10px] text-[#5C5248] font-bold leading-none mb-0.5">積み上げ-目標差</div>
                      <div className={`font-mono font-black text-xs ${oldGapToTarget !== null ? (oldGapToTarget >= 0 ? 'text-emerald-700' : 'text-rose-600') : 'text-[#5C5248]'}`}>
                        {oldGapToTarget !== null ? `${oldGapToTarget >= 0 ? '+' : ''}${fmtYen(oldGapToTarget)}` : '—'}
                      </div>
                    </div>
                    {/* 架空仕入れ積み上げ達成度 */}
                    <div className="col-span-2 mt-0.5">
                      {oldFictionalProgress !== null && oldCalc.suggestedPurchasePriceForClient > 0 ? (
                        <>
                          <div className="flex justify-between text-[9px] mb-0.5">
                            <span className="text-[#5C5248] font-bold">架空仕入げ積み上げ達成</span>
                            <span className={`font-mono font-black ${oldFictionalProgress > 100 ? 'text-rose-600' : oldFictionalProgress >= 100 ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {oldFictionalProgress.toFixed(0)}%{oldFictionalProgress > 100 ? ' ⚠ 超過' : ''}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#F0EDE8] overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${oldFictionalProgress > 100 ? 'bg-rose-500' : oldFictionalProgress >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                              style={{ width: `${Math.min(100, oldFictionalProgress).toFixed(0)}%` }} />
                          </div>
                          <div className="flex justify-between text-[8px] text-[#5C5248] mt-0.5">
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

                    {/* 帳尻利管費率（内掛け・外掛け色分け枠表示） */}
                    {(oldReconcileMargin !== null || oldReconcileMarkup !== null) && (
                      <div className="mb-1.5">
                        <div className="text-[8px] font-black text-[#6B6057] uppercase tracking-wide mb-1">帳尻利管費率 材工費→売値</div>
                        <div className="flex gap-1.5">
                          {oldReconcileMarkup !== null && (
                            <div className={`flex-1 px-2 py-1 rounded border-2 ${oldReconcileMarkup < 0 ? 'border-rose-400 bg-rose-50' : 'border-[#D6A89C] bg-[#FEF0EB]'}`}>
                              <div className="text-[8px] font-bold text-[#B5451B] mb-0.5">外掛け</div>
                              <div className={`font-mono font-black text-base leading-none ${oldReconcileMarkup < 0 ? 'text-rose-600' : 'text-[#B5451B]'}`}>
                                {oldReconcileMarkup.toFixed(2)}%
                              </div>
                              <div className="text-[7px] text-[#B5451B]/70 mt-0.5">(売価−原価)÷売価</div>
                            </div>
                          )}
                          {oldReconcileMargin !== null && (
                            <div className={`flex-1 px-2 py-1 rounded border-2 ${oldReconcileMargin < 0 ? 'border-rose-400 bg-rose-50' : 'border-[#93B4D9] bg-[#EFF4FD]'}`}>
                              <div className="text-[8px] font-bold text-[#1E3A5F] mb-0.5">内掛け</div>
                              <div className={`font-mono font-black text-base leading-none ${oldReconcileMargin < 0 ? 'text-rose-600' : 'text-[#1E3A5F]'}`}>
                                {oldReconcileMargin.toFixed(2)}%
                              </div>
                              <div className="text-[7px] text-[#1E3A5F]/70 mt-0.5">(売価−原価)÷原価</div>
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
                          <span className={`text-[8px] font-bold transition-colors ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'markup' ? 'text-[#B5451B]' : 'text-[#5C5248]'}`}>外</span>
                          <div className={`relative w-8 h-4 rounded-full border-2 transition-all ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'bg-[#E8C8BC] border-[#D6A89C]'}`}>
                            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'left-4' : 'left-0.5'}`} />
                          </div>
                          <span className={`text-[8px] font-bold transition-colors ${(oldEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'text-[#1E3A5F]' : 'text-[#5C5248]'}`}>内</span>
                        </button>
                        <div className="relative flex-1">
                          <input type="number" value={oldEstimate.adjustments.sgaRatePercent || ''}
                            onChange={(e) => updateAdj(false, 'sgaRatePercent', e.target.value)}
                            placeholder="15" step="0.01"
                            className="w-full pl-1.5 pr-5 py-0.5 text-[11px] font-mono font-bold rounded border border-[#A09488] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                          <span className="absolute right-1 top-0.5 text-[8px] text-[#5C5248]">%</span>
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
                      <button onClick={() => handleAiAutoReconcile(false)}
                        className="flex-1 bg-[#3A3028] hover:bg-[#5A4A3A] text-white font-black text-[9px] py-1 rounded border border-[#5A4A3A] flex items-center justify-center gap-0.5 cursor-pointer transition-all">
                        <Zap className="w-2.5 h-2.5 text-amber-300" />
                        AI自動補正
                      </button>
                    </div>
                  </div>

                  {/* Section 6: 計算結果 */}
                  <div className={`mt-2 pt-2 border-t-2 border-[#A09488] space-y-1 ${oldEstimate.adjustments.targetUnitPrice > 0 && Math.abs(oldCalc.auditVariance) < 0.1 ? 'text-emerald-700' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-[#6B6057] uppercase tracking-wide">計算結果</span>
                      {oldEstimate.adjustments.targetUnitPrice > 0 && Math.abs(oldCalc.auditVariance) < 0.1
                        ? <span className="text-[9px] font-black text-emerald-700 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> 整合済み</span>
                        : oldEstimate.adjustments.targetUnitPrice > 0
                          ? <span className="text-[9px] font-black text-[#B5451B]">乖離: {oldCalc.auditVariance > 0 ? '+' : ''}{oldCalc.auditVariance.toFixed(2)}円</span>
                          : <span className="text-[9px] text-[#5C5248]">目標売値未設定</span>
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
                        <span className="absolute left-1.5 top-0.5 text-[9px] text-[#5C5248]">¥</span>
                        <input type="number" value={oldEstimate.adjustments.otherAdjustment || ''}
                          onChange={(e) => updateAdj(false, 'otherAdjustment', e.target.value)}
                          placeholder="0"
                          className="w-full pl-4 pr-1 py-0.5 text-[10px] font-mono text-right rounded border border-[#A09488] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
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
                      <div className="flex items-center gap-0.5 mb-1"><span className="text-[9px] font-bold text-[#5C5248] leading-none truncate">仕入実費</span><Tooltip text="実際の仕入れ原価。actualPurchasePrice入力時はその値を使用。未入力時は材料費＋加工費＋実際の送料を積み上げた値。" /></div>
                      <div className="font-mono font-black text-sm text-[#6B6057] leading-tight">
                        {newEstimate.adjustments.actualPurchasePrice > 0 ? fmtYen(newEstimate.adjustments.actualPurchasePrice) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#B8CCE8] pr-2">
                      <div className="text-[9px] font-bold text-[#5C5248] leading-none mb-1 truncate">目標単価</div>
                      <div className="font-mono font-black text-sm text-[#1E3A5F] leading-tight">
                        {newSell > 0 ? fmtYen(newSell) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#B8CCE8] pr-2">
                      <div className="flex items-center gap-0.5 mb-1"><span className="text-[9px] font-bold text-[#5C5248] leading-none truncate">積み上げ単価</span><Tooltip text="材料費＋加工費（客提示賃率）＋利管費＋送料＋その他調整を積み上げた客提示用の見積単価。" /></div>
                      <div className="font-mono font-black text-sm text-[#18130F] leading-tight">
                        {newCalc.grandTotalUnitPrice > 0 ? fmtYen(newCalc.grandTotalUnitPrice) : '—'}
                      </div>
                    </div>
                    <div className="border-r border-[#B8CCE8] pr-2">
                      <div className="flex items-center gap-0.5 mb-1"><span className="text-[9px] font-bold text-[#5C5248] leading-none truncate">架空利管費率</span><Tooltip text="客提示の積み上げ単価に実際に含まれる利管費率。材工費(=客提示原価)に対し、積み上げ単価−送料−その他がどれだけ上乗せされているか。客が見積書から逆算して読み取る実効利管費率で、入力した利管費率にほぼ一致します（目標単価から逆算する帳尻利管費率とは別物）。" /></div>
                      <div className={`font-mono font-black text-sm leading-tight ${newEmbeddedSgaRate !== null ? 'text-amber-700' : 'text-[#C8C2B8]'}`}>
                        {newEmbeddedSgaRate !== null ? `${newEmbeddedSgaRate.toFixed(2)}%` : '—'}
                      </div>
                      {newEmbeddedSgaRate !== null && <div className="text-[8px] text-[#5C5248] mt-0.5">{newSgaMode === 'markup' ? '外掛け' : '内掛け'}</div>}
                    </div>
                    <div>
                      <div className="flex items-center gap-0.5 mb-1"><span className="text-[9px] font-bold text-[#5C5248] leading-none truncate">実態利益率</span><Tooltip text="仕入実費(原価)と積み上げ単価(売価)から算出した外掛け利益率。(積み上げ単価 − 仕入実費) ÷ 積み上げ単価 × 100。" /></div>
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
                      <div className="text-[10px] text-[#5C5248] font-bold leading-none mb-0.5">粗利益/個</div>
                      <div className={`font-mono font-black text-xs ${profitColorCls(newGrossPerUnit)}`}>{newGrossPerUnit !== null ? fmtYen(newGrossPerUnit) : '—'}</div>
                    </div>
                    {/* 積み上げ-目標差 (積み上げ - 目標: マイナスは積み上げ不足) */}
                    <div>
                      <div className="text-[10px] text-[#5C5248] font-bold leading-none mb-0.5">積み上げ-目標差</div>
                      <div className={`font-mono font-black text-xs ${newGapToTarget !== null ? (newGapToTarget >= 0 ? 'text-emerald-700' : 'text-rose-600') : 'text-[#5C5248]'}`}>
                        {newGapToTarget !== null ? `${newGapToTarget >= 0 ? '+' : ''}${fmtYen(newGapToTarget)}` : '—'}
                      </div>
                    </div>
                    {/* 新旧比較（2列フル） */}
                    <div className="col-span-2 border-t border-[#F0EDE8] pt-1 grid grid-cols-2 gap-x-3">
                      <div>
                        <div className="text-[10px] text-[#5C5248] font-bold leading-none mb-0.5">仕入比 新/旧</div>
                        <div className={`font-mono font-black text-xs ${purchaseRatio !== null ? (purchaseDiff > 0.01 ? 'text-rose-600' : purchaseDiff < -0.01 ? 'text-emerald-700' : 'text-[#6B6057]') : 'text-[#5C5248]'}`}>
                          {purchaseRatio !== null ? `${purchaseRatio.toFixed(1)}% (${purchaseDiff > 0 ? '+' : ''}${Math.round(purchaseDiff).toLocaleString()})` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#5C5248] font-bold leading-none mb-0.5">売価比 新/旧</div>
                        <div className={`font-mono font-black text-xs ${sellRatio !== null ? (sellDiff > 0.01 ? 'text-rose-600' : sellDiff < -0.01 ? 'text-emerald-700' : 'text-[#6B6057]') : 'text-[#5C5248]'}`}>
                          {sellRatio !== null ? `${sellRatio.toFixed(1)}% (${sellDiff > 0 ? '+' : ''}${Math.round(sellDiff).toLocaleString()})` : '—'}
                        </div>
                      </div>
                    </div>
                    {/* 外掛25%フロア（最低売値）常時表示 */}
                    <div className="col-span-2 border-t border-[#F0EDE8] pt-1 mt-0.5">
                      <div className="text-[10px] text-[#5C5248] font-bold leading-none mb-0.5">外掛25%フロア（最低売値）</div>
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
                            <span className="text-[#5C5248] font-bold">架空仕入げ積み上げ達成</span>
                            <span className={`font-mono font-black ${newFictionalProgress > 100 ? 'text-rose-600' : newFictionalProgress >= 100 ? 'text-emerald-700' : 'text-amber-700'}`}>
                              {newFictionalProgress.toFixed(0)}%{newFictionalProgress > 100 ? ' ⚠ 超過' : ''}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#F0EDE8] overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${newFictionalProgress > 100 ? 'bg-rose-500' : newFictionalProgress >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                              style={{ width: `${Math.min(100, newFictionalProgress).toFixed(0)}%` }} />
                          </div>
                          <div className="flex justify-between text-[8px] text-[#5C5248] mt-0.5">
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

                    {/* 帳尻利管費率（内掛け・外掛け色分け枠表示） */}
                    {(newReconcileMargin !== null || newReconcileMarkup !== null) && (
                      <div className="mb-1.5">
                        <div className="text-[8px] font-black text-[#6B6057] uppercase tracking-wide mb-1">帳尻利管費率 材工費→売値</div>
                        <div className="flex gap-1.5">
                          {newReconcileMarkup !== null && (
                            <div className={`flex-1 px-2 py-1 rounded border-2 ${newReconcileMarkup < 0 ? 'border-rose-400 bg-rose-50' : 'border-[#D6A89C] bg-[#FEF0EB]'}`}>
                              <div className="text-[8px] font-bold text-[#B5451B] mb-0.5">外掛け</div>
                              <div className={`font-mono font-black text-base leading-none ${newReconcileMarkup < 0 ? 'text-rose-600' : 'text-[#B5451B]'}`}>
                                {newReconcileMarkup.toFixed(2)}%
                              </div>
                              <div className="text-[7px] text-[#B5451B]/70 mt-0.5">(売価−原価)÷売価</div>
                            </div>
                          )}
                          {newReconcileMargin !== null && (
                            <div className={`flex-1 px-2 py-1 rounded border-2 ${newReconcileMargin < 0 ? 'border-rose-400 bg-rose-50' : 'border-[#93B4D9] bg-[#EFF4FD]'}`}>
                              <div className="text-[8px] font-bold text-[#1E3A5F] mb-0.5">内掛け</div>
                              <div className={`font-mono font-black text-base leading-none ${newReconcileMargin < 0 ? 'text-rose-600' : 'text-[#1E3A5F]'}`}>
                                {newReconcileMargin.toFixed(2)}%
                              </div>
                              <div className="text-[7px] text-[#1E3A5F]/70 mt-0.5">(売価−原価)÷原価</div>
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
                          <span className={`text-[8px] font-bold transition-colors ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'markup' ? 'text-[#B5451B]' : 'text-[#5C5248]'}`}>外</span>
                          <div className={`relative w-8 h-4 rounded-full border-2 transition-all ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'bg-[#1E3A5F] border-[#1E3A5F]' : 'bg-[#E8C8BC] border-[#D6A89C]'}`}>
                            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'left-4' : 'left-0.5'}`} />
                          </div>
                          <span className={`text-[8px] font-bold transition-colors ${(newEstimate.adjustments.sgaCalcMode || 'markup') === 'margin' ? 'text-[#1E3A5F]' : 'text-[#5C5248]'}`}>内</span>
                        </button>
                        <div className="relative flex-1">
                          <input type="number" value={newEstimate.adjustments.sgaRatePercent || ''}
                            onChange={(e) => updateAdj(true, 'sgaRatePercent', e.target.value)}
                            placeholder="15" step="0.01"
                            className="w-full pl-1.5 pr-5 py-0.5 text-[11px] font-mono font-bold rounded border border-[#A09488] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                          <span className="absolute right-1 top-0.5 text-[8px] text-[#5C5248]">%</span>
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
                      <button onClick={() => handleAiAutoReconcile(true)}
                        className="flex-1 bg-[#3A3028] hover:bg-[#5A4A3A] text-white font-black text-[9px] py-1 rounded border border-[#5A4A3A] flex items-center justify-center gap-0.5 cursor-pointer transition-all">
                        <Zap className="w-2.5 h-2.5 text-amber-300" />
                        AI自動補正
                      </button>
                    </div>
                  </div>

                  {/* Section 6: 計算結果 */}
                  <div className={`mt-2 pt-2 border-t-2 border-[#A09488] space-y-1 ${newEstimate.adjustments.targetUnitPrice > 0 && Math.abs(newCalc.auditVariance) < 0.1 ? 'text-emerald-700' : ''}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black text-[#6B6057] uppercase tracking-wide">計算結果</span>
                      {newEstimate.adjustments.targetUnitPrice > 0 && Math.abs(newCalc.auditVariance) < 0.1
                        ? <span className="text-[9px] font-black text-emerald-700 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> 整合済み</span>
                        : newEstimate.adjustments.targetUnitPrice > 0
                          ? <span className="text-[9px] font-black text-[#B5451B]">乖離: {newCalc.auditVariance > 0 ? '+' : ''}{newCalc.auditVariance.toFixed(2)}円</span>
                          : <span className="text-[9px] text-[#5C5248]">目標売値未設定</span>
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
                        <span className="absolute left-1.5 top-0.5 text-[9px] text-[#5C5248]">¥</span>
                        <input type="number" value={newEstimate.adjustments.otherAdjustment || ''}
                          onChange={(e) => updateAdj(true, 'otherAdjustment', e.target.value)}
                          placeholder="0"
                          className="w-full pl-4 pr-1 py-0.5 text-[10px] font-mono text-right rounded border border-[#A09488] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
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
              onMouseDown={(e) => { isDraggingRef.current = true; document.body.style.userSelect = 'none'; e.preventDefault(); }}
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
                onNew={handleNewByKind}
              />
            ) : activeView === 'multipattern' ? (
              <MultiPatternSheet
                base={multiPatternBase}
                patterns={quantityPatterns}
                onBaseChange={setMultiPatternBase}
                onPatternsChange={setQuantityPatterns}
                onNew={handleNewMultiPattern}
                importSources={multiPatternImportSources}
                onImport={importIntoMultiPattern}
              />
            ) : activeView === 'batch' ? (
              <BatchCompareSheet
                parts={batchParts}
                onPartsChange={setBatchParts}
                importSources={batchImportSources}
                onBack={() => setActiveView('workspace')}
                onNew={handleNewBatch}
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

      {/* SAVE TOAST */}
      {saveToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] bg-[#18130F] text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          {saveToast}
        </div>
      )}

      {/* SAVE MODAL */}
      {saveModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl border border-[#A09488] px-6 py-5 min-w-[320px] max-w-sm w-full mx-4">
            <h3 className="text-sm font-black text-[#18130F] mb-3">シナリオ保存</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#18130F] mb-1">シナリオ名 <span className="text-[#B5451B]">*</span></label>
                <input
                  type="text"
                  value={saveModalName}
                  onChange={(e) => setSaveModalName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded border border-[#A09488] outline-none focus:ring-1 focus:border-[#B5451B]"
                  placeholder="シナリオ名を入力"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#18130F] mb-1">補足説明（任意）</label>
                <textarea
                  value={saveModalNotes}
                  onChange={(e) => setSaveModalNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded border border-[#A09488] outline-none focus:ring-1 focus:border-[#B5451B] resize-none"
                  placeholder="変更理由・メモなど"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setSaveModal(null)}
                className="flex-1 py-2 text-xs font-bold border border-[#A09488] rounded text-[#6B6057] hover:bg-[#F7F6F2] cursor-pointer transition-all"
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

      {/* AI自動補正モーダル */}
      {aiReconcileModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl border border-[#A09488] px-6 py-5 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            {aiReconcileModal.status === 'loading' && (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-bold text-[#18130F]">AIが見積を分析中...</p>
                <p className="text-xs text-[#6B6057]">Geminiが業界標準と比較して補正案を生成しています</p>
              </div>
            )}
            {aiReconcileModal.status === 'error' && (
              <div className="space-y-3">
                <h3 className="text-sm font-black text-[#B5451B]">AI補正エラー</h3>
                <p className="text-xs text-[#6B6057]">{aiReconcileModal.error}</p>
                <button onClick={() => setAiReconcileModal(null)} className="w-full py-2 text-xs font-bold bg-[#18130F] text-white rounded cursor-pointer">閉じる</button>
              </div>
            )}
            {aiReconcileModal.status === 'result' && aiReconcileModal.result && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-black text-[#18130F]">AI自動補正 — 提案内容</h3>
                  <span className="ml-auto text-[10px] text-[#5C5248]">{aiReconcileModal.isNew ? '新単価' : '旧単価'}</span>
                </div>
                <p className="text-xs text-[#3A3028] bg-amber-50 rounded p-2 border border-amber-200">{aiReconcileModal.result.summary}</p>
                {aiReconcileModal.result.warnings?.length > 0 && (
                  <div className="space-y-1">
                    {aiReconcileModal.result.warnings.map((w: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-[#B5451B] bg-red-50 rounded p-1.5 border border-red-200">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-[#6B6057] uppercase tracking-wide">工程別賃率補正案</p>
                  {aiReconcileModal.result.processAdjustments?.map((adj: any) => (
                    <div key={adj.index} className="bg-[#F7F6F2] rounded p-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-[#3A3028]">工程{adj.index}</span>
                        <span className="text-[10px] text-[#5C5248]">{adj.currentHourlyRate?.toLocaleString()}円/h</span>
                        <span className="text-[10px] text-[#5C5248]">→</span>
                        <span className="text-[10px] font-black text-[#1E3A5F]">{adj.suggestedHourlyRate?.toLocaleString()}円/h</span>
                      </div>
                      <p className="text-[9px] text-[#6B6057]">{adj.industryAssessment}</p>
                      {adj.adjustmentReason && <p className="text-[9px] text-[#3A3028]">{adj.adjustmentReason}</p>}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 bg-blue-50 rounded p-2 border border-blue-200">
                  <span className="text-xs font-bold text-[#1E3A5F]">推奨SGA率:</span>
                  <span className="text-sm font-black text-[#1E3A5F]">{aiReconcileModal.result.suggestedSgaPercent?.toFixed(2)}%</span>
                </div>
                <p className="text-[10px] text-[#6B6057]">{aiReconcileModal.result.overallAssessment}</p>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setAiReconcileModal(null)} className="flex-1 py-2 text-xs font-bold border border-[#A09488] rounded text-[#6B6057] hover:bg-[#F7F6F2] cursor-pointer">キャンセル</button>
                  <button onClick={applyAiReconcileResult} className="flex-1 py-2 text-xs font-black bg-amber-500 hover:bg-amber-600 text-white rounded cursor-pointer">この補正を適用</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BOTTOM TAB BAR — hidden in library view */}
      {activeView === 'workspace' && (
        <nav className="bg-white border-t-2 border-[#A09488] flex-none z-40 select-none">
          <div className="px-3 sm:px-6 flex flex-row items-center justify-between gap-2 text-xs">

            <div className="flex items-stretch divide-x divide-[#EEEBE6] flex-1">

              <button
                onClick={() => setActiveSheetTab('workspace')}
                className={`px-3 sm:px-5 py-3.5 sm:py-4 font-black flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer text-xs transition-all flex-1 border-t-2 ${
                  activeSheetTab === 'workspace'
                    ? 'border-t-[#B5451B] bg-[#FEF0EB] text-[#B5451B]'
                    : 'border-t-transparent bg-white text-[#5C5248] hover:text-[#6B6057] hover:bg-[#F7F6F2]'
                }`}
              >
                <span className="text-[#5C5248] font-mono text-[9px] sm:text-[10px] shrink-0">Sheet1!</span>
                <span className="hidden sm:inline">1. 新旧見開き調整ワークスペース (Workspace)</span>
                <span className="sm:hidden">入力・調整</span>
              </button>

              <button
                onClick={() => setActiveSheetTab('compare')}
                className={`px-3 sm:px-5 py-3.5 sm:py-4 font-black flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer text-xs transition-all flex-1 border-t-2 ${
                  activeSheetTab === 'compare'
                    ? 'border-t-[#B5451B] bg-[#FEF0EB] text-[#B5451B]'
                    : 'border-t-transparent bg-white text-[#5C5248] hover:text-[#B5451B] hover:bg-[#F7F6F2]'
                }`}
              >
                <span className={`font-mono text-[9px] sm:text-[10px] font-black shrink-0 ${activeSheetTab === 'compare' ? 'text-[#B5451B]' : 'text-[#5C5248]'}`}>Sheet2!</span>
                <span className="hidden sm:inline">2. 差額要因分析・説明調整監査報告 (Audit)</span>
                <span className="sm:hidden">差額分析</span>
              </button>

              <button
                onClick={() => setActiveSheetTab('print')}
                className={`px-3 sm:px-5 py-3.5 sm:py-4 font-black flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer text-xs transition-all flex-1 border-t-2 ${
                  activeSheetTab === 'print'
                    ? 'border-t-[#2A4A7F] bg-[#EBF0FA] text-[#2A4A7F]'
                    : 'border-t-transparent bg-white text-[#5C5248] hover:text-[#2A4A7F] hover:bg-[#F0F4FB]'
                }`}
              >
                <Printer className={`w-3.5 h-3.5 shrink-0 ${activeSheetTab === 'print' ? 'text-[#2A4A7F]' : 'text-[#5C5248]'}`} />
                <span className={`font-mono text-[9px] sm:text-[10px] font-black shrink-0 ${activeSheetTab === 'print' ? 'text-[#2A4A7F]' : 'text-[#5C5248]'}`}>Sheet3!</span>
                <span className="hidden sm:inline">3. 見積書 印刷・Excel出力 (Print)</span>
                <span className="sm:hidden">印刷・出力</span>
              </button>

            </div>

            <div className="text-[10px] text-[#5C5248] font-bold select-none py-3 hidden lg:flex items-center gap-2 shrink-0">
              <Info className="w-3.5 h-3.5 text-[#5C5248]" />
              <span>仕入値や目標単価を入力すると、すべてのExcelセル連動公式が即時反映されます。</span>
            </div>

          </div>
        </nav>
      )}

    </div>
  );
}
