import { useState, useEffect } from 'react';
import { DetailedEstimate, ComparisonResult } from './types';
import { SAMPLE_SCENARIOS } from './data/samples';
import { EstimateEditor } from './components/EstimateEditor';
import { CompareResults } from './components/CompareResults';
import { Sparkles, BrainCircuit, RefreshCw, Layers, Sliders, Info, Cpu } from 'lucide-react';

export default function App() {
  const defaultScenario = SAMPLE_SCENARIOS[0];
  
  const [activeScenarioId, setActiveScenarioId] = useState(defaultScenario.id);
  const [newEstimate, setNewEstimate] = useState<DetailedEstimate>(JSON.parse(JSON.stringify(defaultScenario.newEstimate)));
  const [oldEstimate, setOldEstimate] = useState<DetailedEstimate>(JSON.parse(JSON.stringify(defaultScenario.oldEstimate)));
  
  // 査定結果ステート
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  
  // AI生成用入力ステート
  const [aiPrompt, setAiPrompt] = useState('自動車用の板金ブラケット（SUS304 t2.0、ナット2点溶接、見積基準数300個、完成品重量125g）');
  const [aiConditions, setAiConditions] = useState('プレス抜き、曲げ、ナット溶接などの標準仕上げ工程と、1箱50個入りのダンボール簡易配送');
  const [aiSpec, setAiSpec] = useState('SUS304磨き板、投入量180g、建値880円、スクラップ発生55gバッチ回収。梱包送料1箱1200円');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationTarget, setGenerationTarget] = useState<'new' | 'old'>('new');
  const [generationError, setGenerationError] = useState('');

  // シナリオ切替
  const handleScenarioChange = (id: string) => {
    setActiveScenarioId(id);
    const scen = SAMPLE_SCENARIOS.find((s) => s.id === id);
    if (scen) {
      setNewEstimate(JSON.parse(JSON.stringify(scen.newEstimate)));
      setOldEstimate(JSON.parse(JSON.stringify(scen.oldEstimate)));
      setComparisonResult(null);
    }
  };

  // サンプルデータへリセット
  const handleReset = (target: 'new' | 'old') => {
    const scen = SAMPLE_SCENARIOS.find((s) => s.id === activeScenarioId);
    if (scen) {
      if (target === 'new') {
        setNewEstimate(JSON.parse(JSON.stringify(scen.newEstimate)));
      } else {
        setOldEstimate(JSON.parse(JSON.stringify(scen.oldEstimate)));
      }
      setComparisonResult(null);
    }
  };

  // AIパース（一括取込）成功時
  const handleAIParseSuccess = (target: 'new' | 'old', parsed: Partial<DetailedEstimate>) => {
    if (target === 'new') {
      setNewEstimate((prev) => ({ ...prev, ...parsed }));
    } else {
      setOldEstimate((prev) => ({ ...prev, ...parsed }));
    }
    setComparisonResult(null);
  };

  // 新旧比較AI分析の実行
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
        throw new Error('新旧比較の自動査定に失敗しました。');
      }

      const report = await response.json();
      setComparisonResult(report);
    } catch (err: any) {
      console.error(err);
      alert(err.message || '予期せぬエラーが発生しました。');
    } finally {
      setIsComparing(false);
    }
  };

  // AIによる見積の自動作成
  const handleAIEstimateGeneration = async () => {
    if (!aiPrompt.trim()) {
      setGenerationError('製品要求仕様、または調達要件を入力してください。');
      return;
    }
    
    setIsGenerating(true);
    setGenerationError('');
    try {
      const response = await fetch('/api/generate-estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: aiPrompt, conditions: aiConditions, spec: aiSpec }),
      });

      if (!response.ok) {
        throw new Error('AI見積作成サービスの起動に失敗しました。');
      }

      const generated = await response.json();
      
      // 得られたデータを10行加工費構造に適合させる
      const processesWithCorrectIndex = Array.from({ length: 10 }, (_, i) => {
        const found = generated.processes?.find((p: any) => p.index === i + 1);
        if (found) {
          return {
            ...found,
            index: i + 1
          };
        }
        
        // 最初の数行のみ生成されていれば他は綺麗に空欄
        return {
          index: i + 1,
          processName: '',
          workContent: '',
          hourlyRate: 0,
          totalHours: 0,
          yieldPerHour: 0,
          kgPrice: 0,
          isDirectInput: false,
          directProcessingCost: 0
        };
      });

      const structuredResult: DetailedEstimate = {
        partNumber: generated.partNumber || '66-13401-09100-02',
        baseLotSize: generated.baseLotSize || 300,
        lotUnit: generated.lotUnit || '個/Lot',
        finishedWeightG: generated.finishedWeightG || 125,
        date: new Date().toISOString().split('T')[0],
        material: {
          materialName: generated.material?.materialName || '板金材料',
          inputWeightG: generated.material?.inputWeightG || 180,
          basePricePerKg: generated.material?.basePricePerKg || 880,
          scrapWeightG: generated.material?.scrapWeightG || 55,
          scrapPricePerKg: generated.material?.scrapPricePerKg || 160
        },
        processes: processesWithCorrectIndex,
        logistics: {
          qtyPerBox: generated.logistics?.qtyPerBox || 50,
          freightPerBox: generated.logistics?.freightPerBox || 1200
        },
        adjustments: {
          targetProfitRate: generated.adjustments?.targetProfitRate || 15,
          targetUnitPrice: generated.adjustments?.targetUnitPrice || 250,
          targetProfitMarginOff: 0,
          actualPurchasePrice: generated.adjustments?.actualPurchasePrice || 240,
          sgaRatePercent: generated.adjustments?.sgaRatePercent || 10,
          sgaFixedAdjustment: generated.adjustments?.sgaFixedAdjustment || 0,
          otherAdjustment: generated.adjustments?.otherAdjustment || 0,
          toolingCost: generated.adjustments?.toolingCost || 0
        }
      };

      if (generationTarget === 'new') {
        setNewEstimate(structuredResult);
      } else {
        setOldEstimate(structuredResult);
      }
      setComparisonResult(null);
      alert(`AIによる見積自動計算が完了しました！「${generationTarget === 'new' ? '新単価 (最新見積)' : '旧単価 (前回見積)'}」に反映されました。セルデータはそのままエディタで微調整可能です。`);
    } catch (err: any) {
      console.error(err);
      setGenerationError(err.message || 'エラーが発生しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800 font-sans">
      
      {/* 1. TOP HEADER APP BAR */}
      <header className="bg-white border-b border-gray-250 sticky top-0 z-40 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 rounded-lg text-white shadow-xs">
              <BrainCircuit className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-gray-900">
                見積新旧比較・交渉材料自動策定システム
              </h1>
              <p className="text-[10px] text-gray-500 font-medium">
                アップロードされたマクロExcel『66-13401-09100-02 新旧比較.xlsm』に基づき、関数・シミュレーションを完全Web移植
              </p>
            </div>
          </div>

          {/* Quick Scenario Select Picker */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold text-indigo-900 uppercase tracking-widest">ひな型シナリオ:</span>
            <select
              value={activeScenarioId}
              onChange={(e) => handleScenarioChange(e.target.value)}
              className="border border-gray-300 font-sans text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 text-gray-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-300 font-semibold cursor-pointer"
              id="scenario-picker"
            >
              {SAMPLE_SCENARIOS.map((scen) => (
                <option key={scen.id} value={scen.id}>
                  {scen.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* 2. BODY CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-6">

        {/* TOP INTERACTIVE DRAWER: AI ESTIMATE BUILDER */}
        <section className="bg-linear-to-r from-slate-900 to-indigo-950 text-white rounded-xl p-5 shadow-sm border border-indigo-900/60 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 transform translate-x-12 -translate-y-12 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-5 h-5 text-indigo-400" />
            <h3 className="text-xs font-black uppercase tracking-widest text-indigo-300">
              AI 詳細見積 自動作成パネル（仕様文から原価ビルダーを初期起動）
            </h3>
          </div>

          <p className="text-[11px] text-slate-350 max-w-4xl leading-relaxed mb-4 leading-normal">
            図面要求仕様や加工要件を入力するだけで、Geminiが設備加工賃率や金属スクラップ・材料建値相場を踏まえ、<strong>Excelの全10行構成案</strong>・材料投入重量・梱包送料を自動積算します。作成後、そのまま横のエディタで数値を修正・再連動してシミュレーションできます。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-bold">① 製品仕様・材質・寸法の記述</label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-700 focus:border-indigo-400 p-2 rounded-lg text-xs leading-relaxed text-slate-100 placeholder-slate-600 resize-none h-14"
                placeholder="例：SUS304 t2.0製の板金ブラケット。品目名: 66-13401-09100-02"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-bold">② 追加工・表面処理・ロット要件</label>
              <textarea
                value={aiConditions}
                onChange={(e) => setAiConditions(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-700 focus:border-indigo-400 p-2 rounded-lg text-xs leading-relaxed text-slate-100 placeholder-slate-600 resize-none h-14"
                placeholder="例：プレス抜き、曲げ、2箇所溶接、ロットは300個、配送箱あたり入数50個"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1 font-bold">③ 原料・スクラップの補足情報</label>
              <textarea
                value={aiSpec}
                onChange={(e) => setAiSpec(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-700 focus:border-indigo-400 p-2 rounded-lg text-xs leading-relaxed text-slate-100 placeholder-slate-600 resize-none h-14"
                placeholder="例：材料投入量180g、建値880円、スクラップ55gを回収価格160円で控除"
              />
            </div>
          </div>

          {generationError && (
            <div className="text-xs text-rose-450 font-bold mt-2 font-mono">※ {generationError}</div>
          )}

          <div className="mt-3.5 pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold">自動積算データの流し込み対象:</span>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-200">
                <input
                  type="radio"
                  name="gen_target"
                  checked={generationTarget === 'new'}
                  onChange={() => setGenerationTarget('new')}
                  className="accent-indigo-500"
                />
                <span className="font-semibold text-xs">新単価 (最新見積欄)</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-200 ml-2">
                <input
                  type="radio"
                  name="gen_target"
                  checked={generationTarget === 'old'}
                  onChange={() => setGenerationTarget('old')}
                  className="accent-indigo-500"
                />
                <span className="font-semibold text-xs">旧単価 (旧価格・前回見積)</span>
              </label>
            </div>

            <button
              onClick={handleAIEstimateGeneration}
              disabled={isGenerating}
              className={`px-5 py-2 font-black rounded-lg text-xs tracking-wide transition-colors flex items-center gap-1.5 shadow-md text-white cursor-pointer ${
                isGenerating ? 'bg-indigo-500 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
              id="ai-generation-btn"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>AIが下請工賃＆材料価格に基づき精密積算中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>指定の側に見積データを自動作成</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* COMPARATIVE ANALYSIS BOARD */}
        <section className="bg-slate-200 p-1 rounded-2xl">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-300">
            <div className="flex items-center justify-between mb-4 border-b pb-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>見積査定・新旧比較デルタ盤</span>
              </h3>
              <div className="text-[10px] text-gray-400 font-bold select-none">
                ※ エディタ側で各工程を編集すると、下記の全額、差分、率もリアクティブに即時再計算されます
              </div>
            </div>

            <CompareResults 
              oldEstimate={oldEstimate}
              newEstimate={newEstimate}
              comparison={comparisonResult}
              isLoading={isComparing}
              onRunComparison={triggerComparisonAnalysis}
            />
          </div>
        </section>

        {/* SIDE-BY-SIDE SPREADSHEETS */}
        <div className="space-y-3 pb-8">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-black uppercase tracking-wider text-gray-700">
              新旧詳細構成シート（一対比較エディタ）
            </h2>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            
            {/* Left Column: New Price config */}
            <div className="p-1 bg-rose-50/60 rounded-2xl border border-rose-100">
              <EstimateEditor
                estimate={newEstimate}
                onChange={setNewEstimate}
                title="新単価 (最新見積・改定要求案)"
                isNewPrice={true}
                onAIParseSuccess={(p) => handleAIParseSuccess('new', p)}
                onResetToSample={() => handleReset('new')}
              />
            </div>

            {/* Right Column: Old Price config */}
            <div className="p-1 bg-indigo-50/60 rounded-2xl border border-indigo-100">
              <EstimateEditor
                estimate={oldEstimate}
                onChange={setOldEstimate}
                title="旧単価 (前回見積・現行合意単価)"
                isNewPrice={false}
                onAIParseSuccess={(p) => handleAIParseSuccess('old', p)}
                onResetToSample={() => handleReset('old')}
              />
            </div>

          </div>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-gray-250 mt-auto py-5 text-gray-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-600" />
            <span>すべての計算式は、アップロードされた「新旧比較.xlsm」で定義されているExcel関数・計算構造に完全に適合しています。</span>
          </div>
          <div className="font-semibold text-gray-600">
            アクティブ品番: <span className="font-mono text-indigo-600 font-black">{newEstimate.partNumber}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
