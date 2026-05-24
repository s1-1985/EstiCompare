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

  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [customScenarios, setCustomScenarios] = useState<Scenario[]>([]);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [activeScenarioId, setActiveScenarioId] = useState(defaultScenario.id);
  const [newEstimate, setNewEstimate] = useState<DetailedEstimate>(JSON.parse(JSON.stringify(defaultScenario.newEstimate)));
  const [oldEstimate, setOldEstimate] = useState<DetailedEstimate>(JSON.parse(JSON.stringify(defaultScenario.oldEstimate)));

  const [activeSheetTab, setActiveSheetTab] = useState<'workspace' | 'compare'>('workspace');

  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);

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
      (error) => { console.error("Firestore loading error:", error); }
    );
    return unsub;
  }, [user]);

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

  const handleCreateNewSheet = () => {
    const emptyEst = createEmptyEstimate();
    setActiveScenarioId('new-custom-sheet');
    setOldEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewEstimate(JSON.parse(JSON.stringify(emptyEst)));
    setNewScenarioName('新規カスタム見積');
    setComparisonResult(null);
    setActiveSheetTab('workspace');
  };

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
      targetId = "";
    }

    setIsSaving(true);
    try {
      const savedId = await saveUserScenario(targetId, targetName, newEstimate, oldEstimate, comparisonResult);
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

  const triggerComparisonAnalysis = async () => {
    setIsComparing(true);
    setComparisonResult(null);
    try {
      const response = await fetch('/api/compare-estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    <div className="min-h-screen bg-[#F7F6F2] flex flex-col text-[#18130F] font-sans antialiased selection:bg-[#FDE6DC]">

      {/* HEADER */}
      <header className="bg-[#18130F] text-white sticky top-0 z-50 border-b border-[#2A2018]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex flex-row items-center justify-between gap-2 sm:gap-4">

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
                <span>{newEstimate.partNumber || '66-13401-09100-02'}_新旧比率積算.xlsm</span>
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
                  alt={user.displayName || "User"}
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

      {/* TOOLBAR RIBBON */}
      <div className="bg-[#F7F6F2] border-b border-[#D6D0C8] py-2 sm:py-2.5 select-none">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4">

          <div className="flex flex-wrap items-center gap-2">

            <div className="flex items-center gap-2 bg-white border border-[#D6D0C8] rounded px-3 py-1.5 flex-1 min-w-0">
              <span className="text-[10px] font-black text-[#9C9490] uppercase tracking-widest shrink-0 hidden sm:inline">
                台帳選択:
              </span>
              <select
                value={activeScenarioId}
                onChange={(e) => handleScenarioChange(e.target.value)}
                className="bg-transparent border-0 font-sans focus:outline-hidden font-bold text-[#18130F] text-xs cursor-pointer w-full focus:ring-0 truncate min-w-0"
              >
                {activeScenarioId === 'new-custom-sheet' && (
                  <option value="new-custom-sheet">新規カスタム見積 (未保存)</option>
                )}
                <optgroup label="システム備え付け (Excel再現データ)">
                  {SAMPLE_SCENARIOS.map((scen) => (
                    <option key={scen.id} value={scen.id}>{scen.name}</option>
                  ))}
                </optgroup>
                {customScenarios.length > 0 && (
                  <optgroup label="クラウド同期保存見積 (Firestore)">
                    {customScenarios.map((scen) => (
                      <option key={scen.id} value={scen.id}>{scen.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <button
              onClick={handleCreateNewSheet}
              className="p-2 px-2.5 sm:px-3 bg-white hover:bg-[#FEF0EB] active:bg-[#FDE6DC] text-[#B5451B] border border-[#D6D0C8] hover:border-[#F8C9BB] rounded font-bold flex items-center gap-1.5 cursor-pointer text-xs select-none transition-all min-h-[34px]"
              title="シートを完全にクリアして新しい見積データを作成します。"
            >
              <FilePlus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">新規白紙シート作成</span>
            </button>

            <button
              onClick={handleResetActiveSheet}
              className="p-2 px-2.5 sm:px-3 bg-white hover:bg-[#F0EDE8] border border-[#D6D0C8] rounded font-bold text-[#6B6057] flex items-center gap-1.5 cursor-pointer text-xs select-none transition-all min-h-[34px]"
              title="このシートの入力内容を、データベースの初期状態に戻します。"
            >
              <RotateCcw className="w-4 h-4 text-[#9C9490] shrink-0" />
              <span className="hidden sm:inline">数値リセット</span>
            </button>

          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            {user ? (
              <div className="flex items-center gap-2">
                {customScenarios.some(s => s.id === activeScenarioId) && (
                  <button
                    onClick={() => handleSaveScenario(true)}
                    disabled={isSaving}
                    className="p-2 px-3 sm:px-4 bg-white border border-[#D6D0C8] hover:bg-[#F0EDE8] text-[#18130F] rounded font-bold flex items-center gap-1.5 cursor-pointer text-xs transition-all min-h-[34px]"
                  >
                    <Save className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">上書き保存</span>
                  </button>
                )}
                <button
                  onClick={() => handleSaveScenario(false)}
                  disabled={isSaving}
                  className="p-2 px-3 sm:px-4 bg-[#B5451B] hover:bg-[#8A3215] text-white rounded font-bold flex items-center gap-1.5 cursor-pointer text-xs transition-all min-h-[34px]"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">新規ブックとしてクラウド保存</span>
                  <span className="sm:hidden">保存</span>
                </button>
              </div>
            ) : (
              <div className="text-[10px] text-[#9C9490] font-bold tracking-wider bg-white p-2 rounded border border-[#D6D0C8] hidden md:block">
                ※サインインすると変更した独自見積配列をクラウドへ無制限保存できます
              </div>
            )}
          </div>

        </div>
      </div>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6">

        <div className="mb-4 sm:mb-5">
          <div className="flex items-center justify-between gap-4 mb-2 px-1 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-[#6B6057] bg-white p-2 sm:p-2.5 rounded border border-[#D6D0C8] min-w-0">
              <BookOpen className="w-4 h-4 text-[#B5451B] shrink-0" />
              <span className="font-bold shrink-0">品目コード:</span>
              <strong className="font-mono text-[#B5451B] text-xs sm:text-sm bg-[#FEF0EB] px-2 sm:px-2.5 py-0.5 sm:py-1 rounded border border-[#F8C9BB] truncate">{newEstimate.partNumber}</strong>
            </div>

            <div className="text-[10px] text-[#9C9490] font-bold bg-white px-3 py-2 rounded border border-[#D6D0C8] hidden lg:block select-none">
              エクセル内の全関数・材料物量・アワー調達賃・利管積上・運賃等は全自動で一元連動します。
            </div>
          </div>
        </div>

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

      {/* BOTTOM TAB BAR */}
      <nav className="bg-white border-t-2 border-[#D6D0C8] sticky bottom-0 z-40 select-none">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex flex-row items-center justify-between gap-2 text-xs">

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

          </div>

          <div className="text-[10px] text-[#9C9490] font-bold select-none py-3 hidden lg:flex items-center gap-2 shrink-0">
            <Info className="w-3.5 h-3.5 text-[#9C9490]" />
            <span>仕入値や目標単価を入力すると、すべてのExcelセル連動公式が即時反映されます。</span>
          </div>

        </div>
      </nav>

    </div>
  );
}
