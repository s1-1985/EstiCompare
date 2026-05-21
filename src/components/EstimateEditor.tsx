import React, { useState } from 'react';
import { DetailedEstimate, ProcessRow } from '../types';
import { calculateEstimate } from '../utils/calculations';
import { Plus, Trash2, Cpu, Loader2, Sparkles, FileText, HelpCircle, RefreshCw, Calculator, DollarSign, Percent } from 'lucide-react';

interface EstimateEditorProps {
  estimate: DetailedEstimate;
  onChange: (updated: DetailedEstimate) => void;
  title: string;
  isNewPrice: boolean; // 新単価ならレッド/オレンジ系、旧単価ならブルー系
  onAIParseSuccess: (parsed: Partial<DetailedEstimate>) => void;
  onResetToSample: () => void;
}

const DEFAULT_PROCESS_NAMES = [
  'ブランク抜き', 'バリ取り', '曲げ加工', '溶接', 'カシメ',
  'タップ加工', 'メッキ・表面処理', 'シルク印刷', '検査', '梱包・発送'
];

export const EstimateEditor: React.FC<EstimateEditorProps> = ({
  estimate,
  onChange,
  title,
  isNewPrice,
  onAIParseSuccess,
  onResetToSample,
}) => {
  const [rawText, setRawText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showParsePanel, setShowParsePanel] = useState(false);
  const [parseError, setParseError] = useState('');

  // リアルタイム計算
  const calc = calculateEstimate(estimate);

  // メタデータ更新用ヘルパー
  const updateMeta = (key: keyof DetailedEstimate, value: any) => {
    onChange({
      ...estimate,
      [key]: value,
    });
  };

  // 材料費更新用ヘルパー
  const updateMaterial = (key: keyof DetailedEstimate['material'], value: any) => {
    const rawVal = typeof value === 'string' ? parseFloat(value) : value;
    onChange({
      ...estimate,
      material: {
        ...estimate.material,
        [key]: isNaN(rawVal) && typeof value === 'string' ? value : rawVal,
      },
    });
  };

  // 物流費更新用ヘルパー
  const updateLogistics = (key: keyof DetailedEstimate['logistics'], value: any) => {
    const parsed = parseFloat(value);
    onChange({
      ...estimate,
      logistics: {
        ...estimate.logistics,
        [key]: isNaN(parsed) ? 0 : parsed,
      },
    });
  };

  // 調整額更新用ヘルパー
  const updateAdjustments = (key: keyof DetailedEstimate['adjustments'], value: any) => {
    const parsed = parseFloat(value);
    onChange({
      ...estimate,
      adjustments: {
        ...estimate.adjustments,
        [key]: isNaN(parsed) ? 0 : parsed,
      },
    });
  };

  // 工程行更新用ヘルパー
  const updateProcessRow = (id: number, key: keyof ProcessRow, value: any) => {
    onChange({
      ...estimate,
      processes: estimate.processes.map((p) => {
        if (p.index === id) {
          if (key === 'isDirectInput') {
            return { ...p, [key]: value };
          }
          if (typeof value === 'string' && (key === 'hourlyRate' || key === 'totalHours' || key === 'yieldPerHour' || key === 'kgPrice' || key === 'directProcessingCost')) {
            const parsed = parseFloat(value);
            return { ...p, [key]: isNaN(parsed) ? 0 : parsed };
          }
          return { ...p, [key]: value };
        }
        return p;
      }),
    });
  };

  // 行クリア
  const clearProcessRow = (idx: number) => {
    onChange({
      ...estimate,
      processes: estimate.processes.map((p) => {
        if (p.index === idx) {
          return {
            index: idx,
            processName: '',
            workContent: '',
            hourlyRate: 0,
            totalHours: 0,
            yieldPerHour: 0,
            kgPrice: 0,
            isDirectInput: false,
            directProcessingCost: 0,
          };
        }
        return p;
      }),
    });
  };

  // クイックテンプレート流し込み (空の行を見つけて設定)
  const applyQuickTemplate = () => {
    const prefilledProcesses = estimate.processes.map((p, i) => {
      if (!p.processName && i < DEFAULT_PROCESS_NAMES.length) {
        return {
          ...p,
          processName: DEFAULT_PROCESS_NAMES[i],
          hourlyRate: 2400,
          totalHours: 0.5,
          yieldPerHour: 100,
        };
      }
      return p;
    });
    onChange({
      ...estimate,
      processes: prefilledProcesses,
    });
  };

  // AIパース（Geminiを活用して、雑多なテキストからExcel構造に合致するよう分解）
  const handleAIParse = async () => {
    if (!rawText.trim()) {
      setParseError('パースするテキストまたは仕様データを入力してください。');
      return;
    }
    setIsParsing(true);
    setParseError('');

    try {
      const response = await fetch('/api/parse-estimate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: rawText }),
      });

      if (!response.ok) {
        throw new Error('パースサーバーの応答に失敗しました。');
      }

      const rawParsed = await response.json();
      
      // 得られたフラットなitemsを、詳細設計（DetailedEstimate）の構造にインテリジェントに変換
      // カテゴリが「材料費」のものは材料費へ、その他は processes や送料へマッピング
      const items = rawParsed.items || [];
      const materialItem = items.find((itm: any) => itm.category === '材料費' || itm.name.includes('樹脂') || itm.name.includes('材') || itm.name.includes('板'));
      const logisticItem = items.find((itm: any) => itm.category === '物流費' || itm.name.includes('送料') || itm.name.includes('梱包'));
      const otherCosts = items.find((itm: any) => itm.name.includes('型') || itm.name.includes('初期'));

      // 素材料マッピング
      const parsedMaterial = {
        materialName: materialItem?.name || estimate.material.materialName,
        inputWeightG: materialItem ? (materialItem.quantity > 50 ? materialItem.quantity : 180) : estimate.material.inputWeightG,
        basePricePerKg: materialItem?.unitPrice || estimate.material.basePricePerKg,
        scrapWeightG: estimate.material.scrapWeightG,
        scrapPricePerKg: estimate.material.scrapPricePerKg,
      };

      // 加工費工程へのマッピング（最大10行）
      const processItems = items.filter((itm: any) => itm !== materialItem && itm !== logisticItem);
      const newProcesses = [...estimate.processes];

      processItems.forEach((itm: any, index: number) => {
        if (index < 10) {
          newProcesses[index] = {
            index: index + 1,
            processName: itm.name.substring(0, 20),
            workContent: itm.notes ? itm.notes.substring(0, 30) : 'AI自動インポート',
            hourlyRate: itm.unitPrice > 1000 ? itm.unitPrice : 2400,
            totalHours: itm.quantity < 10 ? itm.quantity : 0.5,
            yieldPerHour: itm.quantity >= 10 ? itm.quantity : 120,
            kgPrice: 0,
            isDirectInput: itm.unitPrice < 500, // 単価が安いものは直接入力と見なす
            directProcessingCost: itm.unitPrice < 500 ? itm.unitPrice : 0,
          };
        }
      });

      onAIParseSuccess({
        partNumber: rawParsed.title && rawParsed.title.match(/[a-zA-Z0-9-]{6,}/) ? rawParsed.title : estimate.partNumber,
        material: parsedMaterial,
        processes: newProcesses,
        logistics: logisticItem ? {
          qtyPerBox: 100,
          freightPerBox: logisticItem.unitPrice * logisticItem.quantity,
        } : estimate.logistics,
        adjustments: {
          ...estimate.adjustments,
          toolingCost: otherCosts ? otherCosts.unitPrice * otherCosts.quantity : estimate.adjustments.toolingCost,
        }
      });

      setRawText('');
      setShowParsePanel(false);
    } catch (err: any) {
      console.error(err);
      setParseError(err.message || '予期せぬパースエラーが発生しました。');
    } finally {
      setIsParsing(false);
    }
  };

  // スタイルのマッピング
  const accentColor = isNewPrice ? 'rose' : 'indigo';
  const borderFocus = isNewPrice ? 'focus:border-rose-400 focus:ring-rose-200' : 'focus:border-indigo-400 focus:ring-indigo-200';
  const bgTheme = isNewPrice ? 'bg-rose-50/25 border-rose-100' : 'bg-indigo-50/25 border-indigo-100';
  const badgeTheme = isNewPrice ? 'bg-rose-100 text-rose-800' : 'bg-indigo-100 text-indigo-800';
  const primaryButtonChange = isNewPrice ? 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500' : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden flex flex-col h-full">
      {/* 1. Header Bar */}
      <div className={`h-1.5 ${isNewPrice ? 'bg-rose-500' : 'bg-indigo-500'}`} />
      
      <div className="p-4 border-b border-gray-100 bg-gray-50/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className={`w-5 h-5 ${isNewPrice ? 'text-rose-600' : 'text-indigo-600'}`} />
          <div>
            <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
              <span>{title}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeTheme}`}>
                {isNewPrice ? '改定後・新価格' : '現行品・旧価格'}
              </span>
            </h3>
            <p className="text-[10px] text-gray-400 mt-0.5">品番: {estimate.partNumber || '未設定'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setShowParsePanel(!showParsePanel)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-950 bg-white border border-gray-200 px-2.5 py-1.5 rounded-lg shadow-3xs hover:bg-gray-50 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>AI一括取込</span>
          </button>
          
          <button
            onClick={onResetToSample}
            className="text-xs text-gray-500 hover:text-gray-800 p-1.5 rounded-lg border border-transparent hover:border-gray-200 bg-gray-50 flex items-center gap-1"
            title="サンプル基準値に戻す"
            id={`reset-btn-${accentColor}`}
          >
            <RefreshCw className="w-3 h-3" />
            <span>リセット</span>
          </button>
        </div>
      </div>

      {/* AI Parsing Drawer */}
      {showParsePanel && (
        <div className="bg-amber-50/45 border-b border-amber-100 p-4 transition-all duration-200">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>テキスト・メール・見積書をAIにパースさせる</span>
            </h4>
            <button
              onClick={() => setShowParsePanel(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              閉じる
            </button>
          </div>
          <p className="text-[11px] text-amber-900/80 mb-3 leading-relaxed">
            部材構成や、設備加工の稼働仕様、運賃等のテキストをコピー＆ペーストしてください。AIが適切なパラメータ（材料投入量、建値、工程名、賃率、出来高など）へマッピングします。
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="（例）製品: 66-13401-09100-02&#10;・材料にステンレスSUS304を180g使用（kgあたり建値880円、スクラップ重量55g、買取単価160円）&#10;・工程1: プレス抜き加工 賃率2800円/h、段取0.5h、出来高は1時間に600枚&#10;・運賃は1箱50個入りで1箱1200円"
            rows={4}
            className="w-full text-xs font-mono border border-amber-200 focus:border-amber-400 focus:ring-1 focus:ring-amber-200 focus:outline-hidden p-2.5 rounded-lg bg-white shadow-inner resize-y transition-colors"
          />
          {parseError && <div className="text-xs text-red-600 font-semibold mt-1 mb-2">{parseError}</div>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => {
                setRawText('');
                setParseError('');
              }}
              className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5"
            >
              クリア
            </button>
            <button
              onClick={handleAIParse}
              disabled={isParsing}
              className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg text-white shadow-xs bg-amber-500 hover:bg-amber-600 transition-colors`}
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>パース中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3" />
                  <span>AIパースを反映</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Spreadsheet Main Pane */}
      <div className="p-4 space-y-5 overflow-y-auto flex-1 max-h-[750px]">
        
        {/* SECTION A: HEADER & LOT SPEC */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 mb-1">品番</label>
            <input
              type="text"
              value={estimate.partNumber}
              onChange={(e) => updateMeta('partNumber', e.target.value)}
              className={`w-full border border-gray-200 focus:outline-hidden px-2 py-1 rounded-md text-xs font-semibold text-gray-800 bg-white ${borderFocus}`}
              placeholder="e.g. 66-13401-09100-02"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 mb-1">見積基準数 (Lot)</label>
            <input
              type="number"
              value={estimate.baseLotSize}
              onChange={(e) => updateMeta('baseLotSize', Math.max(1, parseInt(e.target.value) || 0))}
              className={`w-full border border-gray-200 focus:outline-hidden px-2 py-1 rounded-md text-xs font-mono text-gray-800 bg-white ${borderFocus}`}
              min="1"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 mb-1">基準数単位</label>
            <input
              type="text"
              value={estimate.lotUnit}
              onChange={(e) => updateMeta('lotUnit', e.target.value)}
              className={`w-full border border-gray-200 focus:outline-hidden px-2 py-1 rounded-md text-xs text-gray-800 bg-white ${borderFocus}`}
              placeholder="個/Lot"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 mb-1">完成品重量 (g)</label>
            <input
              type="number"
              value={estimate.finishedWeightG}
              onChange={(e) => updateMeta('finishedWeightG', parseFloat(e.target.value) || 0)}
              className={`w-full border border-gray-200 focus:outline-hidden px-2 py-1 rounded-md text-xs font-mono text-gray-800 bg-yellow-50 focus:bg-white ${borderFocus}`}
              placeholder="0.00"
              step="any"
            />
          </div>
        </div>

        {/* SECTION B: 1.材料費 */}
        <div className="border border-gray-150 rounded-lg overflow-hidden bg-white">
          <div className="bg-gray-100/85 px-3 py-1.5 flex items-center justify-between border-b border-gray-200">
            <span className="text-xs font-bold text-gray-700">1. 材料費</span>
            <span className="text-[10px] font-semibold text-gray-500">数量/重さ 単位は「g」、建値は「円/kg」</span>
          </div>

          <div className="p-3">
            {/* 素材料テーブル & スクラップテーブル */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              
              {/* 素材料 */}
              <div className="space-y-2 border-r lg:border-r border-transparent lg:border-gray-200 pr-0 lg:pr-4">
                <span className="text-[10px] font-bold text-gray-400 block tracking-wider">【素材料 ①】</span>
                
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-[9px] text-gray-500 mb-0.5">材質・寸法</label>
                    <input
                      type="text"
                      value={estimate.material.materialName}
                      onChange={(e) => updateMaterial('materialName', e.target.value)}
                      className={`w-full border border-gray-200 focus:outline-hidden px-1.5 py-1 rounded-md text-[11px] text-gray-800 ${borderFocus}`}
                      placeholder="SUS304"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-500 mb-0.5">投入量 (g)</label>
                    <input
                      type="number"
                      value={estimate.material.inputWeightG}
                      onChange={(e) => updateMaterial('inputWeightG', e.target.value)}
                      className={`w-full border border-gray-200 focus:outline-hidden px-1.5 py-1 rounded-md text-[11px] text-right font-mono bg-yellow-50 focus:bg-white ${borderFocus}`}
                      min="0"
                      step="any"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-500 mb-0.5">建値 (円/kg)</label>
                    <input
                      type="number"
                      value={estimate.material.basePricePerKg}
                      onChange={(e) => updateMaterial('basePricePerKg', e.target.value)}
                      className={`w-full border border-gray-200 focus:outline-hidden px-1.5 py-1 rounded-md text-[11px] text-right font-mono bg-yellow-50 focus:bg-white ${borderFocus}`}
                      min="0"
                      step="any"
                    />
                  </div>
                </div>

                <div className="flex justify-between text-[11px] text-gray-500 pt-1">
                  <span>素材料小計:</span>
                  <span className="font-semibold font-mono text-gray-800">
                    ¥{calc.rawMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /個
                  </span>
                </div>
              </div>

              {/* スクラップ */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-gray-400 block tracking-wider">【スクラップ ②】</span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] text-gray-500 mb-0.5">発生重量 (g)</label>
                    <input
                      type="number"
                      value={estimate.material.scrapWeightG}
                      onChange={(e) => updateMaterial('scrapWeightG', e.target.value)}
                      className={`w-full border border-gray-200 focus:outline-hidden px-1.5 py-1 rounded-md text-[11px] text-right font-mono bg-yellow-50 focus:bg-white ${borderFocus}`}
                      min="0"
                      step="any"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-gray-500 mb-0.5">買取単価 (円/kg)</label>
                    <input
                      type="number"
                      value={estimate.material.scrapPricePerKg}
                      onChange={(e) => updateMaterial('scrapPricePerKg', e.target.value)}
                      className={`w-full border border-gray-200 focus:outline-hidden px-1.5 py-1 rounded-md text-[11px] text-right font-mono bg-yellow-50 focus:bg-white ${borderFocus}`}
                      min="0"
                      step="any"
                    />
                  </div>
                </div>

                <div className="flex justify-between text-[11px] text-gray-500 pt-1">
                  <span>スクラップ控除:</span>
                  <span className="font-semibold font-mono text-emerald-600">
                    -¥{calc.scrapValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /個
                  </span>
                </div>
              </div>

            </div>

            {/* Total Block */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-slate-950 bg-gray-50/50 p-2 rounded-lg">
              <span className="flex items-center gap-1">
                <span className="bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded-sm">①-②</span>
                <span>材料原価 / 個:</span>
              </span>
              <span className="font-mono text-sm tracking-wide text-gray-900 bg-white border border-gray-100 px-2.5 py-0.5 rounded-md shadow-3xs">
                ¥{calc.netMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION C: 2.加工費 */}
        <div className="border border-gray-150 rounded-lg bg-white overflow-hidden">
          <div className="bg-gray-100/85 px-3 py-1.5 flex items-center justify-between border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-700">2. 加工費明細 (最多10工程)</span>
              <button
                onClick={applyQuickTemplate}
                className="text-[9px] bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 font-semibold px-2 py-0.5 rounded-md shadow-3xs hover:shadow-2xs"
              >
                定型工程を適用
              </button>
            </div>
            <span className="text-[10px] font-semibold text-gray-500">
              各工程の加工費 = (((段取時間h×60)/ロット) + (60/出来高)) × (賃率/60)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-150 text-[11px]">
              <thead className="bg-gray-50">
                <tr className="divide-x divide-gray-100 text-gray-500 uppercase tracking-wider font-semibold text-[9px]">
                  <th scope="col" className="px-1.5 py-2 text-center w-8">工順</th>
                  <th scope="col" className="px-2 py-2 text-left w-24">工程</th>
                  <th scope="col" className="px-2 py-2 text-left w-28">作業内容</th>
                  <th scope="col" className="px-1.5 py-2 text-right w-16">賃率 (円/h)</th>
                  <th scope="col" className="px-1.5 py-2 text-right w-14">段取時間 (h)</th>
                  <th scope="col" className="px-1.5 py-2 text-right w-16">出来高 (個/h)</th>
                  <th scope="col" className="px-1 text-center w-12 text-[8px]">直接/Kg単価</th>
                  <th scope="col" className="px-1.5 py-2 text-right w-16">直接設定欄</th>
                  <th scope="col" className="px-2 py-2 text-right w-24 bg-gray-100/30">算出加工費</th>
                  <th scope="col" className="px-1 py-2 text-center w-8">消</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {estimate.processes.map((proc, index) => {
                  const cost = calc.processCosts[index];
                  const hasProcess = !!proc.processName.trim();
                  
                  // 作業時間分換算と、段取分換算
                  const setupMin = proc.totalHours * 60;
                  const unitWorkMin = proc.yieldPerHour > 0 ? (60 / proc.yieldPerHour) : 0;
                  const minuteRate = proc.hourlyRate / 60;

                  return (
                    <tr key={proc.index} className={`divide-x divide-gray-50 ${hasProcess ? 'bg-white' : 'bg-gray-50/20'}`}>
                      {/* Index */}
                      <td className="px-1 py-1 text-center font-mono font-bold text-gray-400 border-r border-gray-100 bg-gray-50/25">
                        {proc.index}
                      </td>

                      {/* Process Name */}
                      <td className="p-0.5 px-1 bg-yellow-50 focus-within:bg-white">
                        <input
                          type="text"
                          value={proc.processName}
                          onChange={(e) => updateProcessRow(proc.index, 'processName', e.target.value)}
                          placeholder={`工程 ${proc.index}`}
                          className="w-full bg-transparent border-0 py-1 px-1 focus:ring-0 text-[11px]"
                        />
                      </td>

                      {/* Work Content */}
                      <td className="p-0.5 px-1">
                        <input
                          type="text"
                          value={proc.workContent}
                          onChange={(e) => updateProcessRow(proc.index, 'workContent', e.target.value)}
                          placeholder="作業内容など"
                          disabled={!hasProcess}
                          className="w-full bg-transparent border-0 py-1 px-1 focus:ring-0 text-[11px]"
                        />
                      </td>

                      {/* Hourly Rate */}
                      <td className="p-0.5 px-1 bg-yellow-50 focus-within:bg-white">
                        <input
                          type="number"
                          value={proc.hourlyRate || ''}
                          onChange={(e) => updateProcessRow(proc.index, 'hourlyRate', e.target.value)}
                          placeholder="2400"
                          disabled={!hasProcess || proc.isDirectInput}
                          className="w-full bg-transparent border-0 py-1 px-1 focus:ring-0 text-right font-mono text-[11px]"
                        />
                      </td>

                      {/* Setup Time (Hours) */}
                      <td className="p-0.5 px-1 bg-yellow-50 focus-within:bg-white">
                        <input
                          type="number"
                          value={proc.totalHours || ''}
                          onChange={(e) => updateProcessRow(proc.index, 'totalHours', e.target.value)}
                          placeholder="0.5"
                          disabled={!hasProcess || proc.isDirectInput}
                          step="any"
                          className="w-full bg-transparent border-0 py-1 px-1 focus:ring-0 text-right font-mono text-[11px]"
                        />
                      </td>

                      {/* Yield Per Hour */}
                      <td className="p-0.5 px-1 bg-yellow-50 focus-within:bg-white">
                        <input
                          type="number"
                          value={proc.yieldPerHour || ''}
                          onChange={(e) => updateProcessRow(proc.index, 'yieldPerHour', e.target.value)}
                          placeholder="100"
                          disabled={!hasProcess || proc.isDirectInput}
                          className="w-full bg-transparent border-0 py-1 px-1 focus:ring-0 text-right font-mono text-[11px]"
                        />
                      </td>

                      {/* Direct Toggle */}
                      <td className="p-1 px-1.5 text-center">
                        <div className="flex flex-col gap-0.5 items-center justify-center">
                          <input
                            type="checkbox"
                            checked={proc.isDirectInput}
                            onChange={(e) => updateProcessRow(proc.index, 'isDirectInput', e.target.checked)}
                            disabled={!hasProcess}
                            className="rounded-sm border-gray-300 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                          />
                          <span className="text-[7px] text-gray-400 font-semibold uppercase">{proc.isDirectInput ? '直接' : '演算'}</span>
                        </div>
                      </td>

                      {/* Direct Input Value */}
                      <td className={`p-0.5 px-1 ${proc.isDirectInput ? 'bg-yellow-50 focus-within:bg-white' : 'bg-gray-100/50'}`}>
                        <input
                          type="number"
                          value={proc.isDirectInput ? (proc.directProcessingCost || '') : ''}
                          onChange={(e) => updateProcessRow(proc.index, 'directProcessingCost', e.target.value)}
                          placeholder={proc.isDirectInput ? "直接値" : '自動計算'}
                          disabled={!hasProcess || !proc.isDirectInput}
                          className="w-full bg-transparent border-0 py-1 px-1 focus:ring-0 text-right font-mono text-[11px]"
                        />
                      </td>

                      {/* Computed Processing Cost */}
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-gray-800 bg-gray-50/40">
                        {hasProcess ? (
                          <span>¥{cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>

                      {/* Clear Button */}
                      <td className="px-1 text-center">
                        <button
                          onClick={() => clearProcessRow(proc.index)}
                          disabled={!hasProcess}
                          className="text-gray-300 hover:text-red-500 p-0.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="工程クリア"
                          id={`clear-proc-btn-${accentColor}-${proc.index}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Subtotals Area */}
          <div className="p-3 bg-gray-50/65 border-t border-gray-250 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs text-gray-600">
            <span className="font-semibold text-gray-500">加工稼働 登録完了: {estimate.processes.filter(p => p.processName.trim()).length}工程</span>
            
            <div className="flex gap-4 self-end sm:self-auto flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">加工費合計 /個:</span>
                <span className="font-mono font-bold text-gray-900 text-sm bg-white border border-gray-100 shadow-2xs py-0.5 px-2.5 rounded-md">
                  ¥{calc.totalProcessCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">小計 (材料＋加工):</span>
                <span className="font-mono font-extrabold text-indigo-700 text-sm bg-indigo-50 border border-indigo-100 py-0.5 px-2.5 rounded-md">
                  ¥{calc.primeCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION D: 3.その他の費用 */}
        <div className="border border-gray-150 rounded-lg bg-white overflow-hidden">
          <div className="bg-gray-100/85 px-3 py-1.5 border-b border-gray-200">
            <h4 className="text-xs font-bold text-gray-700">3. その他の費用（送料・管理費・型費調整等）</h4>
          </div>

          <div className="p-3 grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Tooling and Adjustments */}
            <div className="space-y-3 col-span-1 md:col-span-2 grid grid-cols-2 gap-3 border-r border-transparent md:border-gray-100 pr-0 md:pr-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-1">略図・型費・その他 (円)</label>
                <input
                  type="number"
                  value={estimate.adjustments.toolingCost || ''}
                  onChange={(e) => updateAdjustments('toolingCost', e.target.value)}
                  placeholder="0"
                  className={`w-full border border-gray-200 focus:outline-hidden px-2 py-1.5 rounded-md text-[11px] font-mono text-gray-800 bg-yellow-50 focus:bg-white ${borderFocus}`}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-1">一般手動調整額 (円)</label>
                <input
                  type="number"
                  value={estimate.adjustments.otherAdjustment || ''}
                  onChange={(e) => updateAdjustments('otherAdjustment', e.target.value)}
                  placeholder="0"
                  className={`w-full border border-gray-200 focus:outline-hidden px-2 py-1.5 rounded-md text-[11px] font-mono text-gray-800 bg-yellow-50 focus:bg-white ${borderFocus}`}
                />
              </div>
            </div>

            {/* General Administrative (利管費) */}
            <div className="space-y-2 border-r border-transparent md:border-gray-100 pr-0 md:pr-4">
              <span className="text-[10px] font-bold text-gray-400 block tracking-wider uppercase">利管費（一般管理・利益比）</span>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">利管費率 (%)</label>
                  <input
                    type="number"
                    value={estimate.adjustments.sgaRatePercent || ''}
                    onChange={(e) => updateAdjustments('sgaRatePercent', e.target.value)}
                    placeholder="10"
                    className={`w-full border border-gray-200 focus:outline-hidden px-1.5 py-1 rounded-md text-[11px] font-mono text-gray-800 bg-yellow-50 focus:bg-white ${borderFocus}`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">固定加算金 (円)</label>
                  <input
                    type="number"
                    value={estimate.adjustments.sgaFixedAdjustment || ''}
                    onChange={(e) => updateAdjustments('sgaFixedAdjustment', e.target.value)}
                    placeholder="0"
                    className={`w-full border border-gray-200 focus:outline-hidden px-1.5 py-1 rounded-md text-[11px] font-mono text-gray-800 bg-yellow-50 focus:bg-white ${borderFocus}`}
                  />
                </div>
              </div>

              <div className="flex justify-between text-[10px] text-gray-500 pt-1">
                <span>利管費/個:</span>
                <span className="font-semibold font-mono text-gray-850">
                  ¥{calc.sgaCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Logistics (送料) */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-gray-400 block tracking-wider">送料 / 輸送費</span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">1箱の入数</label>
                  <input
                    type="number"
                    value={estimate.logistics.qtyPerBox || ''}
                    onChange={(e) => updateLogistics('qtyPerBox', e.target.value)}
                    placeholder="50"
                    className={`w-full border border-gray-200 focus:outline-hidden px-1.5 py-1 rounded-md text-[11px] font-mono text-gray-800 bg-yellow-50 focus:bg-white ${borderFocus}`}
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-gray-500 mb-0.5">1箱の運賃 (円)</label>
                  <input
                    type="number"
                    value={estimate.logistics.freightPerBox || ''}
                    onChange={(e) => updateLogistics('freightPerBox', e.target.value)}
                    placeholder="1000"
                    className={`w-full border border-gray-200 focus:outline-hidden px-1.5 py-1 rounded-md text-[11px] font-mono text-gray-800 bg-yellow-50 focus:bg-white ${borderFocus}`}
                  />
                </div>
              </div>

              <div className="flex justify-between text-[10px] text-gray-500 pt-1">
                <span>送料個別換算:</span>
                <span className="font-semibold font-mono text-gray-850">
                  ¥{calc.shippingCostPerUnit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

          </div>

          {/* Other sum total */}
          <div className="bg-gray-50/70 p-2.5 px-3 border-t border-gray-150 flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-500">その他の諸費用小計:</span>
            <span className="font-mono font-bold text-gray-800">
              ¥{calc.totalOtherExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /個
            </span>
          </div>
        </div>

        {/* SECTION E: 4. 御見積単価 SUMMARY CARD */}
        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${bgTheme}`}>
          <div className="text-center sm:text-left">
            <span className="text-[10px] font-extrabold uppercase tracking-widest block text-gray-400">4. 算出御見積単価（1+2+3）</span>
            <span className="text-xs text-gray-500 mt-0.5 block leading-tight">材料費・加工設備工賃・一般管理費を積算し、最適な正価コストを算定しました。</span>
          </div>

          <div className="bg-white px-5 py-2 rounded-xl flex items-center gap-1.5 shadow-xs border border-gray-100 select-none">
            <span className="text-xs text-gray-400 font-bold mb-1">¥</span>
            <span className={`text-2xl font-black font-mono tracking-wide ${isNewPrice ? 'text-rose-600' : 'text-indigo-600'}`}>
              {calc.grandTotalUnitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* SECTION F: ADVANCED利益 & 交渉調整シミュレーション */}
        <div className="border border-slate-250 rounded-lg overflow-hidden bg-slate-900 text-slate-100 shadow-lg">
          <div className="bg-slate-850 px-3 py-2 flex items-center justify-between border-b border-slate-800 select-none">
            <div className="flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-200">利益率・売価値引 逆算シミュレーター</span>
            </div>
            <span className="text-[9px] font-semibold text-emerald-400 tracking-wider">EXCEL連動関数エリア</span>
          </div>

          <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            
            {/* Targets Setters */}
            <div className="grid grid-cols-2 gap-3 col-span-1 md:col-span-2 border-r border-transparent md:border-slate-800 pr-0 md:pr-4">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                  <span>目標単価 (円)</span>
                  <HelpCircle className="w-3 h-3 text-slate-500" title="得意先・親会社が求める希望調達単価" />
                </label>
                <input
                  type="number"
                  value={estimate.adjustments.targetUnitPrice || ''}
                  onChange={(e) => updateAdjustments('targetUnitPrice', e.target.value)}
                  placeholder="250"
                  className="w-full bg-slate-800 text-slate-100 border border-slate-700 focus:outline-hidden focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 px-2 py-1.5 rounded-md font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                  <span>調整利益率 (%)</span>
                  <HelpCircle className="w-3 h-3 text-slate-500" title="確保したい目標とする粗利率。これより逆算して値引き後の最適売価を求めます。" />
                </label>
                <input
                  type="number"
                  value={estimate.adjustments.targetProfitRate || ''}
                  onChange={(e) => updateAdjustments('targetProfitRate', e.target.value)}
                  placeholder="15"
                  className="w-full bg-slate-800 text-slate-100 border border-slate-700 focus:outline-hidden focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 px-2 py-1.5 rounded-md font-mono font-semibold"
                />
              </div>

              <div className="col-span-2 pt-1">
                <label className="block text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                  <span>実際の仕入単価 / 受注売価 (円)</span>
                  <HelpCircle className="w-3 h-3 text-slate-500" title="最終的に交渉合意した実際の取引値、または売価" />
                </label>
                <input
                  type="number"
                  value={estimate.adjustments.actualPurchasePrice || ''}
                  onChange={(e) => updateAdjustments('actualPurchasePrice', e.target.value)}
                  placeholder="240"
                  className="w-full bg-slate-800 text-slate-100 border border-slate-700 focus:outline-hidden focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 px-2 py-1.5 rounded-md font-mono font-semibold"
                />
              </div>
            </div>

            {/* Reversed results (逆算プレビュー) */}
            <div className="space-y-2 border-r border-transparent md:border-slate-800 pr-0 md:pr-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">調整利益率ベースの【逆算売価】:</span>
                <span className="text-sm font-extrabold text-emerald-400 font-mono">
                  ¥{calc.adjustedSellingPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <p className="text-[9px] text-slate-500 mt-1 leading-tight">指定の利益率を確保するために設定すべき希望提示金額です。</p>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-400 block">目標単価との【乖離額】:</span>
                <span className={`text-sm font-extrabold font-mono ${calc.priceVarianceFromTarget > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {calc.priceVarianceFromTarget > 0 ? '+' : ''}¥{calc.priceVarianceFromTarget.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
              </div>
            </div>

            {/* Actual profitability metrics */}
            <div className="space-y-2 flex flex-col justify-between bg-slate-850 p-2.5 rounded-lg border border-slate-800">
              <div>
                <span className="text-[10px] text-slate-400 block">実際の仕入価格での【実際利益率】:</span>
                <span className={`text-base font-extrabold font-mono ${calc.actualProfitRate > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {calc.actualProfitRate.toFixed(2)}%
                </span>
                <p className="text-[9px] text-slate-500 mt-1 leading-tight">製造原価との差額から、実際に手元に残るマージンです。</p>
              </div>

              <div className="pt-2 border-t border-slate-750">
                <span className="text-[10px] text-slate-400 block">実際の利益額:</span>
                <span className={`font-mono font-bold ${calc.actualProfitAmount > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  ¥{calc.actualProfitAmount.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} /個
                </span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
