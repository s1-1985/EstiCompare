import { useState, useEffect } from 'react';
import { DetailedEstimate, ComparisonResult, Scenario } from './types';
import { SAMPLE_SCENARIOS, createEmptyEstimate } from './data/samples';
import { ExcelGrid } from './components/ExcelGrid';
import { CompareResults } from './components/CompareResults';
import { 
  FileSpreadsheet, 
  RotateCcw, 
  Save, 
  Plus, 
  Sparkles, 
  Database, 
  ChevronRight, 
  BookOpen, 
  Info,
  LogOut,
  FilePlus
} from 'lucide-react';
import { auth, loginWithGoogle, logout } from './firebase';
import { subscribeScenarios, saveUserScenario } from './utils/firestoreService';

export default function App() {
  const defaultScenario = SAMPLE_SCENARIOS[0];
  
  // Auth & Sync status
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([]);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [activeScenarioId, setActiveScenarioId] = useState(defaultScenario.id);
  const [newEstimate, setNewEstimate] = useState<DetailedEstimate>(JSON.parse(JSON.stringify(defaultScenario.newEstimate)));
  const [oldEstimate, setOldEstimate] = useState<DetailedEstimate>(JSON.parse(JSON.stringify(defaultScenario.oldEstimate)));
  
  // Current open Sheet Tab
  const [activeSheetTab, setActiveSheetTab] = useState<'workspace' | 'compare'>('workspace');

  // AI evaluation report state
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  // Auth trigger
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return unsub;
  }, []);

  // Firestore sync trigger
  useEffect(() => {
    if (!user) {
      setCustomScenarios([]);
      return;
    }
    const unsub = subscribeScenarios(
      user.uid,
      (scens) => {
        setCustomScenarios(scens);
      },
      (error) => {
        console.error("Firestore loading error:", error);
      }
    );
    return unsub;
  }, [user]);

  // Scenario picker Switcher
  const handleScenarioChange = (id: string) => {
    setActiveScenarioId(id);
    setComparisonResult(null);
    setActiveSheetTab('workspace');
    
    const customScen = customScenarios.find((s) => s.id === id);
    if (customScen) {
      setNewEstimate(JSON.parse(JSON.stringify(customScen.newEstimate)));
      setOldEstimate(JSON.parse(JSON.stringify(customScen.oldEstimate)));
      setComparisonResult(customScen.comparisonResult);
      setNewScenarioName(customScen.name);
      return;
    }

    const preset = SAMPLE_SCENARIOS.find((s) => s.id === id);
    if (preset) {
      setNewEstimate(JSON.parse(JSON.stringify(preset.newEstimate)));
      setOldEstimate(JSON.parse(JSON.stringify(preset.oldEstimate)));
      setNewScenarioName('');
    }
  };

  // Reset current active sheet to original preset values
  const handleResetActiveSheet = () => {
    if (activeScenarioId === 'new-custom-sheet') {
      const emptyEst = createEmptyEstimate();
      setOldEstimate(JSON.parse(JSON.stringify(emptyEst)));
      setNewEstimate(JSON.parse(JSON.stringify(emptyEst)));
      setComparisonResult(null);
      setActiveSheetTab('workspace');
      return;
    }
    const preset = SAMPLE_SCENARIOS.find((s) => s.id === activeScenarioId)
                   || customScenarios.find((s) => s.id === activeScenarioId)
                   || SAMPLE_SCENARIOS[0];
    setOldEstimate(JSON.parse(JSON.stringify(preset.oldEstimate)));
    setNewEstimate(JSON.parse(JSON.stringify(preset.newEstimate)));
    setComparisonResult(null);
    setActiveSheetTab('workspace');
  };

  // Create a completely blank new sheet
  const handleCreateNewSheet = () => {
    const emptyEst = createEmptyEstimate();
    setActiveScenarioId('new-custom-sheet');
    setOldEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewScenarioName('新規カスタム見積');
    setComparisonResult(null);
    setActiveSheetTab('workspace');
  };

  // Save changes to cloud
  const handleSaveScenario = async (isOverwriting: boolean = false) => {
    if (!user) {
      alert("クラウド保存を利用するには右上からサインインしてください。");
      return;
    }

    let targetId = activeScenarioId;
    let targetName = newScenarioName.trim();

    if (!isOverwriting || !customScenarios.some(s => s.id === activeScenarioId)) {
      const promptName = prompt("登録する見積シナリオの名称を入力してください:", newScenarioName || "マイカスタム見積シナリオ");
      if (!promptName || !promptName.trim()) return;
      targetName = promptName.trim();
      targetId = ""; // empty forces firestoreService to create a new record
    }

    setIsSaving(true);
    try {
      const savedId = await saveUserScenario(
        targetId,
        targetName,
        newEstimate,
        oldEstimate,
        comparisonResult
      );
      if (savedId) {
        setActiveScenarioId(savedId);
        setNewScenarioName(targetName);
        alert(`見積シナリオ「${targetName}」を正常に保存しました！`);
      }
    } catch (error: any) {
      console.error(error);
      alert(`保存失敗: ${error.message || error}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Run optional Gemini price comparison report
  const triggerComparisonAnalysis = async () => {
    setIsComparing(true);
    setComparisonResult(null);
    try {
      const response = await fetch('/api/compare-estimates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ oldEstimate, newEstimate }),
      });

      if (!response.ok) {
        throw new Error('見積自動査定サービスのエラー。APIキーが登録されているか確認してください。');
      }

      const report = await response.json();
      setComparisonResult(report);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'AI価格監査に失敗しました。詳細仕様の入力欄が正しいフォーマットか確認してください。');
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800 font-sans antialiased selection:bg-emerald-200">
      
      {/* 1. PROFESSIONAL SaaS INDUSTRIAL HEADER */}
      <header className="bg-slate-900 text-white shadow-lg select-none border-b border-slate-950 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Brand & Active file name */}
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-md flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] bg-emerald-700 px-2 py-0.5 rounded-full text-white font-extrabold tracking-widest uppercase">
                  EstiCompare
                </span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400 font-mono font-bold">
                  互換Webエミュレート
                </span>
              </div>
              <h1 className="text-sm font-extrabold tracking-tight text-white mt-1 flex items-center gap-2">
                <span>{newEstimate.partNumber || '66-13401-09100-02'}_新旧比率積算.xlsm</span>
              </h1>
            </div>
          </div>

          {/* Sync status & Google Account */}
          <div className="flex items-center gap-3">
            {isAuthLoading ? (
              <span className="text-[10px] text-slate-400 font-mono animate-pulse">Syncing...</span>
            ) : user ? (
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm">
                <img 
                  src={user.photoURL || undefined}
                  alt={user.displayName || "User"}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full border border-emerald-500"
                />
                <span className="text-[10px] font-bold text-slate-100 max-w-[100px] truncate">
                  {user.displayName}
                </span>
                <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" title="クラウド自動同期有効" />
                <button 
                  onClick={logout}
                  className="ml-1 text-[10px] text-slate-400 hover:text-red-400 border-l border-slate-700 pl-2 font-bold cursor-pointer transition-colors"
                >
                  切断
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white px-3 py-1.5 rounded-xl border border-emerald-600 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-md hover:shadow-lg"
                title="Googleアカウントで確認サインインして、カスタマイズしたシートをFirestoreクラウドにマイデータ保存"
              >
                <div className="bg-white p-0.5 rounded-lg flex items-center justify-center">
                  <span className="text-[10px] text-emerald-800 font-black px-1 leading-none">G</span>
                </div>
                <span>クラウド同期ログイン</span>
              </button>
            )}
          </div>

        </div>
      </header>
 
      {/* 2. EXCEL CONTROLS RIBBON (Action Bar) */}
      <div className="bg-white border-b border-slate-200 shadow-xs py-3 select-none">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          
          {/* File Operations */}
          <div className="flex flex-wrap items-center gap-3">
            
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 min-w-[280px]">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest shrink-0">
                📂 台帳選択:
              </span>
              <select
                value={activeScenarioId}
                onChange={(e) => handleScenarioChange(e.target.value)}
                className="bg-transparent border-0 font-sans focus:outline-hidden font-extrabold text-slate-800 text-xs cursor-pointer w-full focus:ring-0 truncate"
              >
                {activeScenarioId === 'new-custom-sheet' && (
                  <option value="new-custom-sheet">✨ 新規カスタム見積 (未保存)</option>
                )}
                <optgroup label="📂 システム備え付け (Excel再現データ)">
                  {SAMPLE_SCENARIOS.map((scen) => (
                    <option key={scen.id} value={scen.id}>
                      {scen.name}
                    </option>
                  ))}
                </optgroup>
                {customScenarios.length > 0 && (
                  <optgroup label="☁️ クラウド同期保存見積 (Firestore)">
                    {customScenarios.map((scen) => (
                      <option key={scen.id} value={scen.id}>
                        {scen.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <button
              onClick={handleCreateNewSheet}
              className="p-2 px-3 bg-emerald-50 hover:bg-emerald-100/80 active:bg-emerald-200/50 text-emerald-800 border-2 border-transparent hover:border-emerald-200 rounded-xl font-bold flex items-center gap-1.5 cursor-pointer text-xs select-none transition-all"
              title="シートを完全にクリアして新しい見積データを作成します。"
            >
              <FilePlus className="w-4 h-4 text-emerald-600" />
              <span>新規白紙シート作成</span>
            </button>

            <button
              onClick={handleResetActiveSheet}
              className="p-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer text-xs select-none transition-all"
              title="このシートの入力内容を、データベースの初期（Excel保存時）状態に戻します。"
            >
              <RotateCcw className="w-4 h-4 text-slate-400" />
              <span>数値リセット</span>
            </button>

          </div>

          {/* Save Operations */}
          <div className="flex items-center justify-end gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                {customScenarios.some(s => s.id === activeScenarioId) && (
                  <button
                    onClick={() => handleSaveScenario(true)}
                    disabled={isSaving}
                    className="p-2 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-indigo-700 rounded-xl font-bold hover:shadow-xs flex items-center gap-1.5 cursor-pointer text-xs transition-all"
                  >
                    <Save className="w-4 h-4" />
                    <span>上書き保存</span>
                  </button>
                )}
                <button
                  onClick={() => handleSaveScenario(false)}
                  disabled={isSaving}
                  className="p-2 px-4 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold shadow-md hover:shadow-lg flex items-center gap-1.5 cursor-pointer text-xs transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>新規ブックとしてクラウド保存</span>
                </button>
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 font-extrabold tracking-wider bg-slate-50 p-2 rounded-lg border border-slate-200 hidden md:block">
                ※サインインすると変更した独自見積配列をクラウドへ無制限保存できます
              </div>
            )}
          </div>

        </div>
      </div>

      {/* 3. WORKBOOK CENTRAL WORKSPACE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4 mb-2 px-1 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-white p-2.5 rounded-xl border border-slate-200 shadow-3xs">
              <BookOpen className="w-4 h-4 text-[#107C41]" />
              <span className="font-bold">品目コード:</span>
              <strong className="font-mono text-[#107C41] text-sm bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/20">{newEstimate.partNumber}</strong>
            </div>

            <div className="text-[11px] text-slate-400 font-bold bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 hidden lg:block select-none">
              ℹ️ エクセル内の全関数・材料物量。アワー調達賃・利管積上・運賃等は全自動で一元連動します。
            </div>
          </div>
        </div>

        {/* WORKBOOK TAB CONDITIONAL RENDER */}
        <section className="transition-all duration-200">
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
              onLoadHistory={handleScenarioChange}
            />
          )}

          {activeSheetTab === 'compare' && (
            <CompareResults
              oldEstimate={oldEstimate}
              newEstimate={newEstimate}
              comparison={comparisonResult}
              isLoading={isComparing}
              onRunComparison={triggerComparisonAnalysis}
            />
          )}
        </section>

      </main>

      {/* 4. EXCEL WORKBOOK BOTTOM TAB BAR */}
      <nav className="bg-white border-t border-slate-200 sticky bottom-0 z-40 select-none shadow-xl">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-2.5 text-xs">
          
          {/* Active Navigation Sheets selector */}
          <div className="flex items-stretch divide-x divide-slate-100 w-full md:w-auto">
            
            {/* Sheet 1: Workspace */}
            <button
              onClick={() => setActiveSheetTab('workspace')}
              className={`px-5 py-4 font-black flex items-center justify-center gap-2 cursor-pointer text-xs transition-all flex-1 md:flex-initial border-t-[3px] ${
                activeSheetTab === 'workspace'
                  ? 'border-t-[#107C41] bg-slate-50 text-[#107C41]'
                  : 'border-t-transparent bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-slate-400 font-mono text-[10px]">Sheet1!</span>
              <span>1. 新旧見開き調整ワークスペース (Workspace)</span>
            </button>

            {/* Sheet 2: Compare/Audit */}
            <button
              onClick={() => setActiveSheetTab('compare')}
              className={`px-5 py-4 font-black flex items-center justify-center gap-2 cursor-pointer text-xs transition-all flex-1 md:flex-initial border-t-[3px] ${
                activeSheetTab === 'compare'
                  ? 'border-t-[#107C41] bg-emerald-500/5 text-[#107C41]'
                  : 'border-t-transparent bg-white text-slate-400 hover:text-[#107C41] hover:bg-slate-50'
              }`}
            >
              <span className="text-[#107C41] font-mono text-[10px] font-black">Sheet2!</span>
              <span>2. 差額要因分析・説明調整監査報告 (Audit)</span>
            </button>

          </div>

          {/* Quick Info text */}
          <div className="text-[11px] text-slate-400 font-bold select-none py-3 md:py-0 flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400" />
            <span>仕入値や目標単価を入力すると、すべてのExcelセル連動公式が即時反映されます。</span>
          </div>

        </div>
      </nav>

    </div>
  );
}
