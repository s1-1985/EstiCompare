import { useState, useEffect } from 'react';
import { DetailedEstimate, ComparisonResult, Scenario } from './types';
import { SAMPLE_SCENARIOS } from './data/samples';
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
  LogOut
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
    
    // 1. Check custom scenarios first
    const customScen = customScenarios.find((s) => s.id === id);
    if (customScen) {
      setNewEstimate(JSON.parse(JSON.stringify(customScen.newEstimate)));
      setOldEstimate(JSON.parse(JSON.stringify(customScen.oldEstimate)));
      setComparisonResult(customScen.comparisonResult);
      setNewScenarioName(customScen.name);
      return;
    }

    // 2. Check presets list
    const preset = SAMPLE_SCENARIOS.find((s) => s.id === id);
    if (preset) {
      setNewEstimate(JSON.parse(JSON.stringify(preset.newEstimate)));
      setOldEstimate(JSON.parse(JSON.stringify(preset.oldEstimate)));
      setNewScenarioName('');
    }
  };

  // Reset current active sheet to original preset values
  const handleResetActiveSheet = () => {
    const preset = SAMPLE_SCENARIOS.find((s) => s.id === activeScenarioId) || SAMPLE_SCENARIOS[0];
    setOldEstimate(JSON.parse(JSON.stringify(preset.oldEstimate)));
    setNewEstimate(JSON.parse(JSON.stringify(preset.newEstimate)));
    setComparisonResult(null);
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
    <div className="min-h-screen bg-[#F0F4F2] flex flex-col text-slate-800 font-sans">
      
      {/* 1. REAL MICROSOFT EXCEL WINDOW FRAME HEADER */}
      <header className="bg-[#107C41] text-white shadow-md select-none border-b border-[#0a4d29]">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-2">
          
          {/* Brand & Active file name */}
          <div className="flex items-center gap-2">
            <div className="bg-[#0b542c] p-1.5 rounded text-white shadow-inner">
              <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-emerald-900 px-1.5 py-0.5 rounded text-[#C1F1D8] font-black tracking-wider uppercase">
                  EstiCompare
                </span>
                <h1 className="text-sm font-black tracking-tight flex items-center gap-1.5">
                  <span>{newEstimate.partNumber || '66-13401-09100-02'}_新旧比較.xlsm [互換Webモード]</span>
                </h1>
              </div>
              <p className="text-[10px] text-emerald-200 mt-1 leading-none font-medium">
                アップロード済ひな型原価積算関数の移植エミュレータ
              </p>
            </div>
          </div>

          {/* Sync status & Google Account */}
          <div className="flex items-center gap-2.5">
            {isAuthLoading ? (
              <span className="text-[10px] text-emerald-300">同期確認中...</span>
            ) : user ? (
              <div className="flex items-center gap-2 bg-[#0c592e] px-2.5 py-1 rounded-sm border border-[#0d6434]">
                <img 
                  src={user.photoURL || undefined}
                  alt={user.displayName || "Sign-in User"}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full border border-emerald-400"
                />
                <span className="text-[10px] font-bold text-emerald-100 max-w-[80px] truncate hidden md:inline">
                  {user.displayName}
                </span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-300" title="クラウド同期中" />
                <button 
                  onClick={logout}
                  className="ml-1 text-[9px] text-emerald-300 hover:text-white border-l border-emerald-600 pl-1.5 font-bold cursor-pointer"
                >
                  切断
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="bg-[#0c592e] hover:bg-[#073a1e] text-white px-2.5 py-1 rounded-sm border border-[#0e6e39] text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="Googleアカウントでサインインして、編集したシート配列をFirestoreクラウドにマイデータ保存"
              >
                <div className="bg-white p-0.5 rounded-sm">
                  <span className="text-[9px] text-[#107C41] font-extrabold px-0.5">G</span>
                </div>
                <span>クラウド同期ログイン</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* 2. EXCEL CONTROLS RIBBON (Action Bar) */}
      <div className="bg-white border-b border-slate-300 shadow-3xs py-2 select-none select-none">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {/* File Operations */}
          <div className="flex flex-wrap items-center gap-2 md:gap-4 divide-slate-200">
            
            {/* Active Preset model selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">📁 ひな型台帳選択:</span>
              <select
                value={activeScenarioId}
                onChange={(e) => handleScenarioChange(e.target.value)}
                className="bg-slate-50 border border-slate-350 px-2 py-1.5 rounded font-sans focus:outline-hidden font-bold text-slate-800 text-xs shadow-3xs cursor-pointer max-w-[250px] truncate"
              >
                <optgroup label="📂 システム備え付け (Excel再現データ)">
                  {SAMPLE_SCENARIOS.map((scen) => (
                    <option key={scen.id} value={scen.id}>
                      {scen.name}
                    </option>
                  ))}
                </optgroup>
                {customScenarios.length > 0 && (
                  <optgroup label="☁️ クラウド保存見積データ (Firestore)">
                    {customScenarios.map((scen) => (
                      <option key={scen.id} value={scen.id}>
                        {scen.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Reset data */}
            <button
              onClick={handleResetActiveSheet}
              className="p-1.5 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded font-semibold text-slate-700 flex items-center gap-1 cursor-pointer text-[11px] select-none"
              title="このシートの入力内容を、データベースの初期（Excel保存時）状態に戻します。"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>現在のシートをリセット</span>
            </button>

          </div>

          {/* Save Operations */}
          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-1.5 border-l pl-3 border-slate-200">
                {customScenarios.some(s => s.id === activeScenarioId) && (
                  <button
                    onClick={() => handleSaveScenario(true)}
                    disabled={isSaving}
                    className="p-1.5 px-2.5 bg-slate-50 border border-slate-350 hover:bg-slate-100 text-indigo-700 rounded font-bold hover:shadow-3xs flex items-center gap-1 cursor-pointer text-[11px]"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>上書き保存</span>
                  </button>
                )}
                <button
                  onClick={() => handleSaveScenario(false)}
                  disabled={isSaving}
                  className="p-1.5 px-3 bg-[#107C41] hover:bg-[#073a1e] text-white rounded font-bold shadow-3xs hover:shadow-2xs flex items-center gap-1 cursor-pointer text-[11px] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新規ブックとして保存</span>
                </button>
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 font-medium">
                ※サインインすると変更した独自見積をクラウドへ台帳保存できます
              </div>
            )}
          </div>

        </div>
      </div>

      {/* 3. WORKBOOK CENTRAL WORKSPACE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4">
        
        <div className="mb-4">
          
          <div className="flex items-center justify-between gap-3 mb-2 px-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <BookOpen className="w-4 h-4 text-[#107C41]" />
              <span>選択中の品目コード:</span>
              <strong className="font-mono text-[#107C41] text-sm bg-white px-2 py-0.5 rounded border border-slate-200 shadow-3xs">{newEstimate.partNumber}</strong>
            </div>

            {/* Quick Helper Banner */}
            <div className="text-[10px] text-slate-400 font-medium hidden sm:inline">
              エクセル内のすべての公式・関数（材料素費・端材控除・賃率段取サイクル・利管積上・運賃等）は全自動で追従連動します。
            </div>
          </div>

        </div>

        {/* WORKBOOK TAB CONDITIONAL RENDER */}
        <section className="transition-all duration-150">
          {activeSheetTab === 'workspace' && (
            <ExcelGrid
              title="【新旧見開き対比・お化粧調整シミュレーター】"
              oldEstimate={oldEstimate}
              onChangeOld={setOldEstimate}
              newEstimate={newEstimate}
              onChangeNew={setNewEstimate}
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

      {/* 4. REALISTIC EXCEL WORKBOOK BOTTOM TAB BAR */}
      <nav className="bg-white border-t border-slate-350 sticky bottom-0 z-40 select-none shadow-md">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-xs">
          
          {/* Active Navigation Sheets selector */}
          <div className="flex items-stretch divide-x divide-slate-200">
            
            {/* Sheet 1: Workspace */}
            <button
              onClick={() => setActiveSheetTab('workspace')}
              className={`px-4 py-3 font-bold border-t-3 flex items-center gap-1.5 cursor-pointer text-[12px] transition-colors ${
                activeSheetTab === 'workspace'
                  ? 'border-t-[#107C41] bg-slate-50 text-[#107C41]'
                  : 'border-t-transparent bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className="text-slate-400 font-mono text-[9px]">Sheet1!</span>
              <span>📊 1. 新旧見開き調整ワークスペース (Workspace)</span>
            </button>

            {/* Sheet 2: Compare/Audit */}
            <button
              onClick={() => setActiveSheetTab('compare')}
              className={`px-4 py-3 font-bold border-t-3 flex items-center gap-1.5 cursor-pointer text-[12px] transition-colors ${
                activeSheetTab === 'compare'
                  ? 'border-t-[#107C41] bg-[#107C41]/5 text-[#107C41]'
                  : 'border-t-transparent bg-white text-slate-500 hover:bg-[#107C41]/5 hover:text-[#107C41]'
              }`}
            >
              <span className="text-[#107C41] font-mono text-[9px] font-black">Sheet2!</span>
              <strong className="font-extrabold">⚖️ 2. 差額要因分析・説明お化粧監査報告書 (Audit)</strong>
            </button>

          </div>

          {/* Quick Info text */}
          <div className="text-[10px] text-slate-400 font-bold select-none p-2 sm:p-0 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>すべての入力値は内部仮想メモリで連動算出されます。</span>
          </div>

        </div>
      </nav>

    </div>
  );
}
