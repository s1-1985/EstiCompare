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
      return;
    }
    const preset = SAMPLE_SCENARIOS.find((s) => s.id === activeScenarioId)
                   || customScenarios.find((s) => s.id === activeScenarioId)
                   || SAMPLE_SCENARIOS[0];
    setOldEstimate(JSON.parse(JSON.stringify(preset.oldEstimate)));
    setNewEstimate(JSON.parse(JSON.stringify(preset.newEstimate)));
    setComparisonResult(null);
  };

  // Create a completely blank new sheet
  const handleCreateNewSheet = () => {
    const emptyEst = createEmptyEstimate();
    setActiveScenarioId('new-custom-sheet');
    setOldEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewScenarioName('新規カスタム見積');
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
    <div className="min-h-screen bg-gray-50 flex flex-col text-gray-800 font-sans antialiased selection:bg-blue-100">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 select-none sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Brand & Active file name */}
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-blue-600">
                  EstiCompare
                </span>
                <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-mono">
                  互換Webエミュレート
                </span>
              </div>
              <h1 className="text-sm font-medium tracking-tight text-gray-800 mt-0.5 flex items-center gap-2">
                <span>{newEstimate.partNumber || '66-13401-09100-02'}_新旧比率積算.xlsm</span>
              </h1>
            </div>
          </div>

          {/* Sync status & Google Account */}
          <div className="flex items-center gap-3">
            {isAuthLoading ? (
              <span className="text-[10px] text-gray-400 font-mono animate-pulse">Syncing...</span>
            ) : user ? (
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                <img
                  src={user.photoURL || undefined}
                  alt={user.displayName || "User"}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full border border-gray-300"
                />
                <span className="text-[10px] font-medium text-gray-700 max-w-[100px] truncate">
                  {user.displayName}
                </span>
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full" title="クラウド自動同期有効" />
                <button
                  onClick={logout}
                  className="ml-1 text-[10px] text-gray-400 hover:text-red-500 border-l border-gray-200 pl-2 font-medium cursor-pointer transition-colors"
                >
                  切断
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-3 py-1.5 rounded-lg border border-blue-600 text-xs font-medium flex items-center gap-2 cursor-pointer transition-all"
                title="Googleアカウントで確認サインインして、カスタマイズしたシートをFirestoreクラウドにマイデータ保存"
              >
                <div className="bg-white p-0.5 rounded flex items-center justify-center">
                  <span className="text-[10px] text-blue-700 font-black px-1 leading-none">G</span>
                </div>
                <span>クラウド同期ログイン</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Toolbar ribbon */}
      <div className="bg-white border-b border-gray-200 py-3 select-none">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">

          {/* File Operations */}
          <div className="flex flex-wrap items-center gap-3">

            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 min-w-[280px]">
              <span className="text-xs font-medium text-gray-500 shrink-0">
                シナリオ:
              </span>
              <select
                value={activeScenarioId}
                onChange={(e) => handleScenarioChange(e.target.value)}
                className="bg-transparent border-0 font-sans focus:outline-none font-medium text-gray-800 text-xs cursor-pointer w-full focus:ring-0 truncate"
              >
                {activeScenarioId === 'new-custom-sheet' && (
                  <option value="new-custom-sheet">新規カスタム見積 (未保存)</option>
                )}
                <optgroup label="システム備え付け (Excel再現データ)">
                  {SAMPLE_SCENARIOS.map((scen) => (
                    <option key={scen.id} value={scen.id}>
                      {scen.name}
                    </option>
                  ))}
                </optgroup>
                {customScenarios.length > 0 && (
                  <optgroup label="クラウド同期保存見積 (Firestore)">
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
              className="p-2 px-3 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 border border-gray-200 hover:border-gray-300 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer text-xs select-none transition-all"
              title="シートを完全にクリアして新しい見積データを作成します。"
            >
              <FilePlus className="w-4 h-4 text-gray-500" />
              <span>新規白紙シート作成</span>
            </button>

            <button
              onClick={handleResetActiveSheet}
              className="p-2 px-3 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg font-medium text-gray-700 flex items-center gap-1.5 cursor-pointer text-xs select-none transition-all"
              title="このシートの入力内容を、データベースの初期（Excel保存時）状態に戻します。"
            >
              <RotateCcw className="w-4 h-4 text-gray-400" />
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
                    className="p-2 px-4 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium flex items-center gap-1.5 cursor-pointer text-xs transition-all"
                  >
                    <Save className="w-4 h-4" />
                    <span>上書き保存</span>
                  </button>
                )}
                <button
                  onClick={() => handleSaveScenario(false)}
                  disabled={isSaving}
                  className="p-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm flex items-center gap-1.5 cursor-pointer text-xs transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>新規ブックとしてクラウド保存</span>
                </button>
              </div>
            ) : (
              <div className="text-[10px] text-gray-400 font-medium bg-gray-50 p-2 rounded-lg border border-gray-200 hidden md:block">
                ※サインインすると変更した独自見積配列をクラウドへ無制限保存できます
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Workbook workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">

        <div className="mb-6">
          <div className="flex items-center justify-between gap-4 mb-2 px-1 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-white p-2.5 rounded-lg border border-gray-200 shadow-sm">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span className="font-medium">品目コード:</span>
              <strong className="font-mono text-blue-600 text-sm bg-blue-50 px-2.5 py-1 rounded border border-blue-100">{newEstimate.partNumber}</strong>
            </div>

            <div className="text-[11px] text-gray-400 font-medium bg-white px-3 py-2 rounded-lg border border-gray-200 hidden lg:block select-none">
              エクセル内の全関数・材料物量。アワー調達賃・利管積上・運賃等は全自動で一元連動します。
            </div>
          </div>
        </div>

        {/* Workbook tab conditional render */}
        <section className="transition-all duration-200">
          {activeSheetTab === 'workspace' && (
            <ExcelGrid
              title="【新旧見積対比・調整調整シミュレーター】"
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

      {/* Bottom tab bar */}
      <nav className="bg-white border-t border-gray-200 sticky bottom-0 z-40 select-none">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-2.5 text-xs">

          {/* Active Navigation Sheets selector */}
          <div className="flex items-stretch divide-x divide-gray-100 w-full md:w-auto">

            {/* Sheet 1: Workspace */}
            <button
              onClick={() => setActiveSheetTab('workspace')}
              className={`px-5 py-4 font-medium flex items-center justify-center gap-2 cursor-pointer text-xs transition-all flex-1 md:flex-initial border-t-2 ${
                activeSheetTab === 'workspace'
                  ? 'border-t-blue-600 bg-white text-blue-600'
                  : 'border-t-transparent bg-gray-50 text-gray-500 hover:text-gray-700 hover:bg-white'
              }`}
            >
              <span className="text-gray-400 font-mono text-[10px]">Sheet1!</span>
              <span>1. 新旧見開き調整ワークスペース (Workspace)</span>
            </button>

            {/* Sheet 2: Compare/Audit */}
            <button
              onClick={() => setActiveSheetTab('compare')}
              className={`px-5 py-4 font-medium flex items-center justify-center gap-2 cursor-pointer text-xs transition-all flex-1 md:flex-initial border-t-2 ${
                activeSheetTab === 'compare'
                  ? 'border-t-blue-600 bg-white text-blue-600'
                  : 'border-t-transparent bg-gray-50 text-gray-500 hover:text-gray-700 hover:bg-white'
              }`}
            >
              <span className="text-gray-400 font-mono text-[10px]">Sheet2!</span>
              <span>2. 差額要因分析・説明調整監査報告 (Audit)</span>
            </button>

          </div>

          {/* Quick Info text */}
          <div className="text-[11px] text-gray-400 font-medium select-none py-3 md:py-0 flex items-center gap-2">
            <Info className="w-4 h-4 text-gray-400" />
            <span>仕入値や目標単価を入力すると、すべてのExcelセル連動公式が即時反映されます。</span>
          </div>

        </div>
      </nav>

    </div>
  );
}
