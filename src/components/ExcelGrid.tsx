import React, { useState } from 'react';
import { DetailedEstimate, ProcessRow, ProcessCalcMode, Scenario } from '../types';
import { calculateEstimate } from '../utils/calculations';
import { apiPost } from '../utils/apiClient';
import {
  Settings2, Lock, Zap, CheckCircle2, AlertTriangle,
  Sparkles, Database, TrendingUp, BarChart3,
  Coins, FileText, History, Truck, Copy, Package,
} from 'lucide-react';

const JAPAN_PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県',
  '静岡県','愛知県','三重県',
  '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
];

interface ExcelGridProps {
  oldEstimate: DetailedEstimate;
  onChangeOld: (updated: DetailedEstimate) => void;
  newEstimate: DetailedEstimate;
  onChangeNew: (updated: DetailedEstimate) => void;
  title: string;
  historyScenarios?: Scenario[];
  onLoadHistory?: (id: string) => void;
}

export const ExcelGrid: React.FC<ExcelGridProps> = ({
  oldEstimate,
  onChangeOld,
  newEstimate,
  onChangeNew,
  title,
  historyScenarios = [],
  onLoadHistory,
}) => {
  const oldCalc = calculateEstimate(oldEstimate);
  const newCalc = calculateEstimate(newEstimate);

  const [isInferringOld, setIsInferringOld] = useState(false);
  const [isInferringNew, setIsInferringNew] = useState(false);
  const [isCalcShippingOld, setIsCalcShippingOld] = useState(false);
  const [isCalcShippingNew, setIsCalcShippingNew] = useState(false);
  const [isGettingScrapOld, setIsGettingScrapOld] = useState(false);
  const [isGettingScrapNew, setIsGettingScrapNew] = useState(false);

  // ─── Process Inference (per side) ────────────────────────────────────────────
  const handleInferProcessParams = async (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const setLoading = isNew ? setIsInferringNew : setIsInferringOld;
    try {
      setLoading(true);
      const response = await apiPost('/api/infer-process-params', {
        processes: est.processes.filter(p => !p.isDirectInput && p.processName),
        partNumber: est.partNumber,
      });
      const { results } = await response.json();
      if (!results || !Array.isArray(results)) return;

      const filtered = est.processes.filter(p => !p.isDirectInput && p.processName.trim());
      const newProcs = [...est.processes];
      results.forEach((res: any, i: number) => {
        if (i >= filtered.length) return;
        const pIdx = newProcs.findIndex(p => p.index === filtered[i].index);
        if (pIdx > -1) {
          const suggestedRate = res.suggestedHourlyRate
            ? Math.round(res.suggestedHourlyRate / 100) * 100
            : newProcs[pIdx].hourlyRate;
          newProcs[pIdx] = {
            ...newProcs[pIdx],
            totalHours: res.suggestedTotalHours || 0,
            yieldPerHour: res.suggestedYieldPerHour || 0,
            hourlyRate: suggestedRate,
            actualHourlyRate: suggestedRate,
          };
        }
      });
      setter({ ...est, processes: newProcs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '通信エラー';
      alert(`AI自動設定に失敗しました: ${msg}\n※ログインが必要な機能です。`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Shipping Calculation (per side) ─────────────────────────────────────────
  const handleCalculateShipping = async (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const setLoading = isNew ? setIsCalcShippingNew : setIsCalcShippingOld;
    const { originPrefecture, destinationPrefecture, qtyPerBox } = est.logistics;
    if (!originPrefecture || !destinationPrefecture) {
      alert('発送元と送付先の都道府県を選択してください。');
      return;
    }
    const boxWeightKg = est.finishedWeightG > 0 && qtyPerBox > 0
      ? (est.finishedWeightG * qtyPerBox) / 1000
      : 0;
    if (boxWeightKg <= 0) {
      alert('完成品重量と箱入り数を先に入力してください。');
      return;
    }
    try {
      setLoading(true);
      const response = await apiPost('/api/calculate-shipping', {
        weightKg: boxWeightKg,
        qtyPerBox,
        originPrefecture,
        destinationPrefecture,
      });
      const data = await response.json();
      if (data.estimatedFreightPerBox > 0) {
        setter({
          ...est,
          logistics: { ...est.logistics, freightPerBox: Math.round(data.estimatedFreightPerBox) },
        });
        if (data.basis) alert(`AI推定送料: ¥${Math.round(data.estimatedFreightPerBox).toLocaleString()}/箱\n\n根拠: ${data.basis}\n\n※推定値です。実際の送料に合わせて手動で修正してください。`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '通信エラー';
      alert(`送料算出に失敗しました: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Scrap Price Lookup (per side) ───────────────────────────────────────────
  const handleGetScrapPrice = async (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const setLoading = isNew ? setIsGettingScrapNew : setIsGettingScrapOld;
    const materialName = est.material.materialName || newEstimate.material.materialName;
    if (!materialName.trim()) {
      alert('②共通諸元で材質・規格を入力してください。');
      return;
    }
    try {
      setLoading(true);
      const response = await apiPost('/api/get-scrap-price', { materialName });
      const data = await response.json();
      if (data.estimatedScrapPricePerKg > 0) {
        setter({
          ...est,
          material: { ...est.material, scrapPricePerKg: data.estimatedScrapPricePerKg },
        });
        if (data.basis) alert(`AI推定スクラップ単価: ¥${data.estimatedScrapPricePerKg.toLocaleString()}/kg\n\n根拠: ${data.basis}\n\n※推定値です。実際の相場に合わせて手動で修正してください。`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '通信エラー';
      alert(`スクラップ相場確認に失敗しました: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // ─── Common Meta ─────────────────────────────────────────────────────────────
  const updateCommonMeta = (key: 'partNumber' | 'partName' | 'baseLotSize' | 'finishedWeightG', value: any) => {
    onChangeOld({ ...oldEstimate, [key]: value });
    onChangeNew({ ...newEstimate, [key]: value });
  };

  const updateCommonMaterialMeta = (key: 'materialName' | 'inputWeightG', value: any) => {
    const rawVal = typeof value === 'string' ? parseFloat(value) : value;
    const finalVal = isNaN(rawVal) && typeof value === 'string' ? value : rawVal;
    onChangeOld({ ...oldEstimate, material: { ...oldEstimate.material, [key]: finalVal } });
    onChangeNew({ ...newEstimate, material: { ...newEstimate.material, [key]: finalVal } });
  };

  // ─── Per-Side Process Handlers ───────────────────────────────────────────────
  const updateProcessMeta = (
    isNew: boolean,
    index: number,
    key: 'processName' | 'workContent' | 'totalHours' | 'yieldPerHour' | 'actualHourlyRate' | 'directProcessingCost' | 'isDirectInput' | 'calcMode' | 'lumpSumPrice' | 'kgPrice',
    value: any
  ) => {
    const numericKeys = ['totalHours', 'yieldPerHour', 'actualHourlyRate', 'directProcessingCost', 'lumpSumPrice', 'kgPrice'];
    const est = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    setter({
      ...est,
      processes: est.processes.map((proc) => {
        if (proc.index !== index) return proc;
        if (key === 'isDirectInput' || key === 'calcMode') return { ...proc, [key]: value };
        if (typeof value === 'string' && numericKeys.includes(key)) {
          const parsed = parseFloat(value);
          return { ...proc, [key]: isNaN(parsed) ? (key === 'actualHourlyRate' ? undefined : 0) : parsed };
        }
        return { ...proc, [key]: value };
      }),
    });
  };

  const cycleCalcMode = (isNew: boolean, index: number, current: ProcessCalcMode) => {
    const modes: ProcessCalcMode[] = ['standard', 'kg', 'lump', 'direct'];
    const next = modes[(modes.indexOf(current) + 1) % modes.length];
    updateProcessMeta(isNew, index, 'calcMode', next);
  };

  const copyProcesses = (fromNew: boolean) => {
    if (fromNew) {
      onChangeOld({ ...oldEstimate, processes: newEstimate.processes.map(p => ({ ...p })) });
    } else {
      onChangeNew({ ...newEstimate, processes: oldEstimate.processes.map(p => ({ ...p })) });
    }
  };

  const getCalcMode = (proc: ProcessRow): ProcessCalcMode => {
    if (proc.calcMode) return proc.calcMode;
    if (proc.isDirectInput) return 'direct';
    if (proc.kgPrice > 0) return 'kg';
    return 'standard';
  };

  // ─── Per-Side Material / Logistics / Adjustments ──────────────────────────────
  const updateMaterialPrice = (isNew: boolean, key: 'basePricePerKg' | 'actualBasePricePerKg' | 'scrapPricePerKg' | 'scrapWeightG', value: any) => {
    const parsed = parseFloat(value);
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    setter({ ...target, material: { ...target.material, [key]: isNaN(parsed) ? 0 : parsed } });
  };

  const updateProcessRates = (isNew: boolean, index: number, key: 'hourlyRate' | 'actualHourlyRate' | 'directProcessingCost' | 'kgPrice' | 'lumpSumPrice' | 'actualLumpSumPrice', value: any) => {
    const parsed = parseFloat(value);
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    setter({
      ...target,
      processes: target.processes.map((proc) => {
        if (proc.index === index) return { ...proc, [key]: isNaN(parsed) ? 0 : parsed };
        return proc;
      }),
    });
  };

  const updateLogisticsRates = (isNew: boolean, key: 'qtyPerBox' | 'freightPerBox' | 'actualFreightPerBox' | 'originPrefecture' | 'destinationPrefecture', value: any) => {
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    if (key === 'originPrefecture' || key === 'destinationPrefecture') {
      setter({ ...target, logistics: { ...target.logistics, [key]: value } });
    } else {
      const parsed = parseFloat(value as string);
      setter({ ...target, logistics: { ...target.logistics, [key]: isNaN(parsed) ? 0 : parsed } });
    }
  };

  const updateAdjustments = (
    isNew: boolean,
    key: 'targetProfitRate' | 'minProfitRate' | 'targetProfitMarginOff' | 'targetUnitPrice' | 'actualPurchasePrice' | 'sgaRatePercent' | 'toolingCost' | 'otherAdjustment',
    value: any
  ) => {
    const parsed = parseFloat(value);
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const val = value === '' ? '' : (isNaN(parsed) ? 0 : parsed);

    if (key === 'targetProfitRate' || key === 'minProfitRate') {
      onChangeOld({ ...oldEstimate, adjustments: { ...oldEstimate.adjustments, [key]: val as any } });
      onChangeNew({ ...newEstimate, adjustments: { ...newEstimate.adjustments, [key]: val as any } });
    } else {
      setter({ ...target, adjustments: { ...target.adjustments, [key]: val as any } });
    }
  };

  // ─── Auto Reconcile ───────────────────────────────────────────────────────────
  const handleAutoReconcile = (isNew: boolean) => {
    const target = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
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
    } else {
      if (targetUnitPrice < minRequiredSellingPrice) {
        reconciledUnitPrice = Math.ceil(minRequiredSellingPrice);
        alert(`【下限利益率アラート】\n決定単価が下限利益率(${minProfitPercent}%)を維持できる最低単価 (¥${minRequiredSellingPrice.toFixed(0)}) を下回っているため、¥${reconciledUnitPrice} に自動引き上げします。`);
      }
    }

    const updatedAdjustments = { ...target.adjustments, targetUnitPrice: reconciledUnitPrice };
    const shipping = calc.shippingCostPerUnit;
    const otherAdj = target.adjustments.otherAdjustment || 0;
    const Y = reconciledUnitPrice - shipping - otherAdj;

    if (Y <= 0) {
      alert("目標単価が低すぎるため、加工費の自動調整ができません。");
      return;
    }

    const validProcesses = target.processes.filter(p => p.processName.trim() !== '' && !p.isDirectInput);
    if (validProcesses.length === 0) {
      alert("加工費の自動調整対象となる工程が見つかりません。");
      return;
    }

    const lotSize = target.baseLotSize || 1;
    const processHoursList = target.processes.map(proc => {
      if (!proc.processName.trim() || proc.isDirectInput) return 0;
      const processHour = proc.yieldPerHour > 0 ? (1 / proc.yieldPerHour) : 0;
      const setupHour = lotSize > 0 ? ((proc.totalHours || 0) / lotSize) : 0;
      return processHour + setupHour;
    });

    const currentTotalProcessCostTemp = target.processes.reduce((sum, proc, i) => {
      if (!proc.processName.trim() || proc.isDirectInput) return sum;
      const actRate = proc.actualHourlyRate ?? proc.hourlyRate ?? 3000;
      return sum + (processHoursList[i] * actRate);
    }, 0);

    let draftProcesses = [...target.processes];
    let finalSgaPercent = target.adjustments.sgaRatePercent || 15;

    const materialCost = calc.netMaterialCost;
    const directInputTotal = target.processes.reduce((sum, proc) => {
      if (!proc.processName.trim() || !proc.isDirectInput) return sum;
      return sum + (proc.directProcessingCost || 0);
    }, 0);

    if (currentTotalProcessCostTemp > 0) {
      const targetPrimeCost = Y / (1 + finalSgaPercent / 100);
      const targetNonDirectProcessCost = Math.max(0, targetPrimeCost - materialCost - directInputTotal);
      const multiplier = Math.max(0.1, targetNonDirectProcessCost / currentTotalProcessCostTemp);

      draftProcesses = target.processes.map((proc) => {
        if (!proc.processName.trim() || proc.isDirectInput) return proc;
        const actRate = proc.actualHourlyRate ?? proc.hourlyRate ?? 3000;
        const rawRate = actRate * multiplier;
        let roundedRate = Math.round(rawRate / 100) * 100;
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
      const neededSgaTrue = ((Y / tempPrimeCost) - 1) * 100;
      finalSgaPercent = Math.max(0, Math.round(neededSgaTrue * 100) / 100);
    }
    updatedAdjustments.sgaRatePercent = finalSgaPercent;
    setter({ ...target, processes: draftProcesses, adjustments: updatedAdjustments });
  };

  // ─── Style Helpers ────────────────────────────────────────────────────────────
  const isEmptyStr = (v: string | undefined) => !v || v.trim() === '';
  const isEmptyNum = (v: number | undefined | null) => !v || v === 0;

  const fld = (empty: boolean) =>
    empty
      ? 'bg-[#FEF0EB] border-[#F8C9BB] focus:border-[#B5451B] focus:ring-[#B5451B]/15'
      : 'bg-white border-[#D6D0C8] focus:border-[#B5451B] focus:ring-[#B5451B]/15';

  const inputBase = 'w-full px-3 py-2 text-xs font-mono font-bold rounded border outline-none focus:ring-1 transition-all';
  const labelBase = 'block text-[10px] font-black text-[#9C9490] mb-1 uppercase tracking-wider';

  // ─── Process Table (reused for both old/new in ③) ─────────────────────────────
  const renderProcessTable = (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const isInferring = isNew ? isInferringNew : isInferringOld;
    const headerBg = isNew ? 'bg-[#1E3A5F]' : 'bg-[#2D2219]';
    const borderAccent = isNew ? 'border-b-[#93B4D9]' : 'border-b-[#B5451B]';
    const label = isNew ? '🆕 新 — 工程マスタ' : '📋 旧 — 工程マスタ';

    const modeLabel: Record<string, string> = { standard: '加工費', kg: 'kg単価', lump: '一式', direct: '外注費' };
    const modeBtnStyle: Record<string, string> = {
      standard: 'bg-[#F0EDE8] text-[#6B6057] border-[#D6D0C8] hover:bg-[#E8E3DC]',
      kg:       'bg-[#EFF4FD] text-[#1E3A5F] border-[#93B4D9] hover:bg-[#D9E9F8]',
      lump:     'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200',
      direct:   'bg-[#FEF0EB] text-[#B5451B] border-[#F8C9BB] hover:bg-[#FDE6DC]',
    };
    const modeRowStyle: Record<string, string> = {
      standard: 'hover:bg-[#F7F6F2]/60',
      kg:       'bg-[#EFF4FD]/40 hover:bg-[#EFF4FD]/70',
      lump:     'bg-purple-50/40 hover:bg-purple-50/70',
      direct:   'bg-[#FEF0EB]/50 hover:bg-[#FEF0EB]',
    };

    return (
      <div className="bg-white rounded border border-[#D6D0C8] overflow-hidden flex flex-col">
        <div className={`${headerBg} text-white px-3 py-2.5 flex items-center justify-between gap-2 border-b-2 ${borderAccent}`}>
          <span className="text-xs font-black">{label}</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => copyProcesses(!isNew)}
              title={isNew ? "旧の工程を新にコピー" : "新の工程を旧にコピー"}
              className="bg-white/15 hover:bg-white/25 text-white text-[9px] font-bold px-2 py-1 rounded flex items-center gap-1 transition-all cursor-pointer border border-white/20"
            >
              <Copy className="w-3 h-3 shrink-0" />
              <span>{isNew ? '旧からコピー' : '新からコピー'}</span>
            </button>
            <button
              onClick={() => handleInferProcessParams(isNew)}
              disabled={isInferring}
              className="bg-white/15 hover:bg-white/25 text-white text-[9px] font-bold px-2 py-1 rounded disabled:opacity-50 flex items-center gap-1 transition-all cursor-pointer border border-white/20"
            >
              <Sparkles className={`w-3 h-3 shrink-0 ${isInferring ? 'animate-spin' : ''}`} />
              <span>{isInferring ? 'AI推定中...' : 'AI自動設定'}</span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[560px]">
            <thead>
              <tr className="bg-[#F0EDE8] border-b border-[#D6D0C8] text-[10px] text-[#9C9490] font-black uppercase tracking-wider">
                <th className="py-2 px-2 text-center w-8">#</th>
                <th className="py-2 px-2 text-left w-32">工程名</th>
                <th className="py-2 px-2 text-left">作業内容</th>
                <th className="py-2 px-2 text-right w-28 text-[#B5451B] bg-[#FEF0EB]">主入力値</th>
                <th className="py-2 px-2 text-right w-24">段取 (h)</th>
                <th className="py-2 px-2 text-right w-28 text-[#1E3A5F]">実態賃率 (/h)</th>
                <th className="py-2 px-2 text-center w-16">種別</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEBE6]">
              {est.processes.map((proc) => {
                const mode = getCalcMode(proc);
                return (
                  <tr key={proc.index} className={`transition-colors ${modeRowStyle[mode]}`}>
                    <td className="py-1.5 px-2 text-center font-mono text-[#9C9490] text-[10px] select-none">#{proc.index}</td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="text"
                        value={proc.processName}
                        onChange={(e) => updateProcessMeta(isNew, proc.index, 'processName', e.target.value)}
                        placeholder="工程名"
                        className="w-full px-2 py-1.5 text-xs font-bold rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]"
                      />
                    </td>
                    <td className="py-1.5 px-1.5">
                      <input
                        type="text"
                        value={proc.workContent}
                        onChange={(e) => updateProcessMeta(isNew, proc.index, 'workContent', e.target.value)}
                        placeholder="例: 300tプレス、金型No.P-12"
                        className="w-full px-2 py-1.5 text-xs text-[#6B6057] rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]"
                      />
                    </td>
                    <td className="py-1.5 px-1.5 bg-[#FEF0EB]/30">
                      {mode === 'direct' && (
                        <div className="relative">
                          <input type="number" value={proc.directProcessingCost || ''} onChange={(e) => updateProcessMeta(isNew, proc.index, 'directProcessingCost', e.target.value)} placeholder="0"
                            className="w-full pl-2 pr-12 py-1.5 text-xs font-mono text-[#B5451B] font-bold rounded border border-[#F8C9BB] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                          <span className="absolute right-1.5 top-1.5 text-[9px] text-[#B5451B] pointer-events-none font-bold">円/個</span>
                        </div>
                      )}
                      {mode === 'kg' && (
                        <div className="relative">
                          <input type="number" value={proc.kgPrice || ''} onChange={(e) => updateProcessMeta(isNew, proc.index, 'kgPrice', e.target.value)} placeholder="0"
                            className="w-full pl-2 pr-12 py-1.5 text-xs font-mono text-[#1E3A5F] font-bold rounded border border-[#93B4D9] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F]" />
                          <span className="absolute right-1.5 top-1.5 text-[9px] text-[#1E3A5F] pointer-events-none font-bold">円/kg</span>
                        </div>
                      )}
                      {mode === 'lump' && (
                        <div className="relative">
                          <input type="number" value={proc.lumpSumPrice || ''} onChange={(e) => updateProcessMeta(isNew, proc.index, 'lumpSumPrice', e.target.value)} placeholder="0"
                            className="w-full pl-2 pr-14 py-1.5 text-xs font-mono text-purple-800 font-bold rounded border border-purple-300 bg-white outline-none focus:ring-1 focus:border-purple-400" />
                          <span className="absolute right-1 top-1.5 text-[9px] text-purple-600 pointer-events-none font-bold">円/lot</span>
                        </div>
                      )}
                      {mode === 'standard' && (
                        <div className="relative">
                          <input type="number" value={proc.yieldPerHour || ''} onChange={(e) => updateProcessMeta(isNew, proc.index, 'yieldPerHour', e.target.value)} placeholder="0"
                            className={`w-full pl-2 pr-8 py-1.5 text-xs font-mono rounded border outline-none focus:ring-1 ${proc.processName && !proc.yieldPerHour ? 'border-[#F8C9BB] bg-[#FEF0EB] focus:border-[#B5451B]' : 'border-[#D6D0C8] bg-white focus:border-[#B5451B]'}`} />
                          <span className="absolute right-1.5 top-1.5 text-[9px] text-[#9C9490] pointer-events-none font-bold">個/h</span>
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-1.5">
                      {mode === 'standard' ? (
                        <div className="relative">
                          <input type="number" value={proc.totalHours || ''} onChange={(e) => updateProcessMeta(isNew, proc.index, 'totalHours', e.target.value)} placeholder="0" step="any"
                            className="w-full pl-2 pr-5 py-1.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
                          <span className="absolute right-1.5 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">h</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-8 text-[10px] text-[#D6D0C8] bg-[#F7F6F2] rounded border border-[#EEEBE6] select-none">—</div>
                      )}
                    </td>
                    <td className="py-1.5 px-1.5">
                      {mode === 'standard' ? (
                        <div className="relative">
                          <input type="number" value={proc.actualHourlyRate || ''} onChange={(e) => updateProcessMeta(isNew, proc.index, 'actualHourlyRate', e.target.value)} placeholder="実際賃率"
                            className="w-full pl-2 pr-10 py-1.5 text-xs font-mono font-bold text-[#1E3A5F] rounded border border-[#C5D8EE] bg-white outline-none focus:ring-1 focus:border-[#1E3A5F]" />
                          <span className="absolute right-1.5 top-1.5 text-[9px] text-[#1E3A5F] pointer-events-none font-bold">円/h</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-8 text-[10px] text-[#D6D0C8] bg-[#F7F6F2] rounded border border-[#EEEBE6] select-none">—</div>
                      )}
                    </td>
                    <td className="py-1.5 px-1.5 text-center">
                      <button
                        onClick={() => cycleCalcMode(isNew, proc.index, mode)}
                        title="タップで切替: 加工費→kg単価→一式→外注費"
                        className={`text-[9px] px-1.5 py-1 rounded font-bold border transition-all cursor-pointer w-full ${modeBtnStyle[mode]}`}
                      >
                        {modeLabel[mode]}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ─── Shipping Panel (reused for both old/new in ②.5) ─────────────────────────
  const renderShippingPanel = (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const calc = isNew ? newCalc : oldCalc;
    const isCalcShipping = isNew ? isCalcShippingNew : isCalcShippingOld;
    const label = isNew ? '🆕 新 — 送料設定' : '📋 旧 — 送料設定';
    const headerBg = isNew ? 'bg-[#1E3A5F]' : 'bg-[#2D2219]';
    const borderAccent = isNew ? 'border-b-[#93B4D9]' : 'border-b-[#B5451B]';

    const boxWeightKg = est.finishedWeightG > 0 && est.logistics.qtyPerBox > 0
      ? ((est.finishedWeightG * est.logistics.qtyPerBox) / 1000).toFixed(2)
      : null;

    return (
      <div className="bg-white rounded border border-[#D6D0C8] overflow-hidden">
        <div className={`${headerBg} text-white px-3 py-2.5 border-b-2 ${borderAccent}`}>
          <span className="text-xs font-black">{label}</span>
        </div>
        <div className="p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-[#18130F] w-24 shrink-0">箱入り数 <span className="text-[#B5451B]">*</span></label>
            <div className="relative flex-1">
              <input
                type="number"
                value={est.logistics.qtyPerBox || ''}
                onChange={(e) => updateLogisticsRates(isNew, 'qtyPerBox', e.target.value)}
                placeholder="10"
                className={`w-full pl-3 pr-14 py-1.5 text-xs font-mono rounded border outline-none focus:ring-1 transition-all ${fld(isEmptyNum(est.logistics.qtyPerBox))}`}
              />
              <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">個/箱</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-[#6B6057] w-24 shrink-0">発送元</label>
            <select
              value={est.logistics.originPrefecture || ''}
              onChange={(e) => updateLogisticsRates(isNew, 'originPrefecture', e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] transition-all"
            >
              <option value="">-- 都道府県を選択 --</option>
              {JAPAN_PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-[#6B6057] w-24 shrink-0">送付先</label>
            <select
              value={est.logistics.destinationPrefecture || ''}
              onChange={(e) => updateLogisticsRates(isNew, 'destinationPrefecture', e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] transition-all"
            >
              <option value="">-- 都道府県を選択 --</option>
              {JAPAN_PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {boxWeightKg && (
            <div className="text-[10px] text-[#9C9490] flex items-center gap-1.5 px-1">
              <Package className="w-3 h-3 shrink-0" />
              おおよその箱重量: <strong className="text-[#18130F] font-mono">約{boxWeightKg}kg</strong>
            </div>
          )}
          <button
            onClick={() => handleCalculateShipping(isNew)}
            disabled={isCalcShipping}
            className="w-full bg-[#1A4A2E] hover:bg-[#215E3A] text-white text-[10px] font-bold py-2 rounded flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer border border-[#2D6B44]"
          >
            <Truck className={`w-3.5 h-3.5 shrink-0 ${isCalcShipping ? 'animate-bounce' : ''}`} />
            {isCalcShipping ? 'AI算出中...' : 'AIで送料を試算（ヤマト/佐川目安）'}
          </button>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black text-[#18130F] w-24 shrink-0">
              運賃/箱 <span className="text-[#B5451B]">*</span>
            </label>
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
              <input
                type="number"
                value={est.logistics.freightPerBox || ''}
                onChange={(e) => updateLogisticsRates(isNew, 'freightPerBox', e.target.value)}
                placeholder="送料/箱"
                className={`w-full pl-6 pr-6 py-1.5 text-xs font-mono font-bold rounded border outline-none focus:ring-1 transition-all ${fld(isEmptyNum(est.logistics.freightPerBox))}`}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-[#9C9490] w-24 shrink-0">実際運賃/箱</label>
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
              <input
                type="number"
                value={est.logistics.actualFreightPerBox ?? ''}
                onChange={(e) => updateLogisticsRates(isNew, 'actualFreightPerBox', e.target.value)}
                placeholder="実際運賃/箱"
                className="w-full pl-6 pr-6 py-1.5 text-xs font-mono text-[#1E3A5F] rounded border border-[#C5D8EE] bg-[#EFF4FD]/30 outline-none focus:ring-1 focus:border-[#1E3A5F] transition-all"
              />
            </div>
          </div>
          <div className="text-[10px] text-[#9C9490] text-right border-t border-[#EEEBE6] pt-1.5">
            ▶ 送料/個: <strong className="font-mono text-[#18130F]">¥{calc.shippingCostPerUnit.toFixed(2)}</strong>
          </div>
        </div>
      </div>
    );
  };

  // ─── Main Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-16">

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ① 基本情報 ━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="bg-white rounded border border-[#D6D0C8] overflow-hidden">
        <div className="bg-[#18130F] text-white px-4 sm:px-5 py-2.5 flex items-center gap-2 border-b-2 border-[#B5451B]">
          <FileText className="w-3.5 h-3.5 text-[#F8C9BB] shrink-0" />
          <h2 className="text-xs font-black tracking-wide">① 基本情報</h2>
          <span className="text-[9px] text-[#9C9490] ml-auto">品番・品名・ロット・重量</span>
        </div>
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="lg:col-span-2">
            <label className={labelBase}>品番 <span className="text-[#B5451B]">*</span></label>
            <input
              type="text"
              value={newEstimate.partNumber}
              onChange={(e) => updateCommonMeta('partNumber', e.target.value)}
              placeholder="例: 66-13401-09100-02"
              className={`${inputBase} ${fld(isEmptyStr(newEstimate.partNumber))}`}
            />
          </div>
          <div className="lg:col-span-2">
            <label className={labelBase}>品名</label>
            <input
              type="text"
              value={newEstimate.partName ?? ''}
              onChange={(e) => updateCommonMeta('partName', e.target.value)}
              placeholder="例: 板金プレスブラケット"
              className={`w-full px-3 py-2 text-xs font-bold rounded border outline-none focus:ring-1 transition-all ${fld(isEmptyStr(newEstimate.partName))}`}
            />
          </div>
          <div>
            <label className={labelBase}>完成品重量 <span className="text-[#B5451B]">*</span></label>
            <div className="relative">
              <input
                type="number"
                value={newEstimate.finishedWeightG || ''}
                onChange={(e) => updateCommonMeta('finishedWeightG', parseFloat(e.target.value) || 0)}
                placeholder="180"
                className={`w-full pl-3 pr-8 py-2 text-xs font-mono font-bold rounded border outline-none focus:ring-1 transition-all ${fld(isEmptyNum(newEstimate.finishedWeightG))}`}
              />
              <span className="absolute right-2.5 top-2 text-[9px] text-[#9C9490] pointer-events-none">g</span>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-[#B5451B] mb-1 uppercase tracking-wider">新旧共通</label>
            <div className="text-[10px] text-[#9C9490] py-2 px-3 border border-[#D6D0C8] rounded bg-[#F7F6F2]">
              品番・品名・完成品重量・材質は新旧で同期されます
            </div>
          </div>

          {historyScenarios.length > 0 && (
            <div className="col-span-full mt-1 p-3 bg-[#FEF0EB] border border-[#F8C9BB] rounded">
              <div className="flex items-center gap-2 mb-2">
                <History className="w-3.5 h-3.5 text-[#B5451B] shrink-0" />
                <span className="text-[10px] font-black text-[#B5451B]">
                  この品番の保存済み見積が {historyScenarios.length} 件あります — 読み込むと現在の入力が上書きされます
                </span>
              </div>
              <div className="space-y-1.5">
                {historyScenarios.map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-white rounded px-3 py-2 border border-[#F8C9BB] gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#18130F] truncate block">{s.name}</span>
                      <span className="text-[10px] text-[#9C9490]">
                        旧: ¥{s.oldEstimate.adjustments.targetUnitPrice.toLocaleString()} → 新: ¥{s.newEstimate.adjustments.targetUnitPrice.toLocaleString()}
                        {s.updatedAt?.seconds && (
                          <span className="ml-2">{new Date(s.updatedAt.seconds * 1000).toLocaleDateString('ja-JP')}</span>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={() => onLoadHistory?.(s.id)}
                      className="shrink-0 text-[10px] font-bold text-[#B5451B] hover:text-[#8A3215] bg-white hover:bg-[#FEF0EB] border border-[#D6D0C8] hover:border-[#F8C9BB] rounded px-2.5 py-1 transition-all cursor-pointer"
                    >
                      読み込む
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ② 共通諸元 ━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="bg-white rounded border border-[#D6D0C8] overflow-hidden">
        <div className="bg-[#18130F] text-white px-4 sm:px-5 py-2.5 flex items-center gap-2 border-b-2 border-[#B5451B]">
          <Lock className="w-3.5 h-3.5 text-[#F8C9BB] shrink-0" />
          <h2 className="text-xs font-black tracking-wide">② 共通諸元</h2>
          <span className="ml-2 text-[9px] bg-[#B5451B] px-2 py-0.5 rounded font-black">新旧同期 — 変更すると両側に即反映</span>
        </div>
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="sm:col-span-2">
            <label className={labelBase}>材質・規格</label>
            <input
              type="text"
              value={newEstimate.material.materialName}
              onChange={(e) => updateCommonMaterialMeta('materialName', e.target.value)}
              placeholder="例: SPCC コイル鋼板 t2.0"
              className={`w-full px-3 py-2 text-xs font-bold rounded border outline-none focus:ring-1 transition-all ${fld(isEmptyStr(newEstimate.material.materialName))}`}
            />
          </div>
          <div>
            <label className={labelBase}>材料投入量 <span className="text-[#B5451B]">*</span></label>
            <div className="relative">
              <input
                type="number"
                value={newEstimate.material.inputWeightG || ''}
                onChange={(e) => updateCommonMaterialMeta('inputWeightG', e.target.value)}
                placeholder="220"
                className={`w-full pl-3 pr-8 py-2 text-xs font-mono rounded border outline-none focus:ring-1 transition-all ${fld(isEmptyNum(newEstimate.material.inputWeightG))}`}
              />
              <span className="absolute right-2.5 top-2 text-[9px] text-[#9C9490] pointer-events-none">g</span>
            </div>
          </div>
          <div className="sm:col-span-3">
            <p className="text-[10px] text-[#9C9490] py-2 px-3 border border-[#D6D0C8] rounded bg-[#F7F6F2]">
              スクラップ重量・スクラップ単価・見積ロットは旧・新それぞれ⑤で設定
            </p>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ③ 送料設定 ━━━━━━━━━━━━━━━━━━━━━━ */}
      <section>
        <div className="bg-[#18130F] text-white px-4 sm:px-5 py-2.5 flex items-center gap-2 border-b-2 border-[#B5451B] rounded-t">
          <Truck className="w-3.5 h-3.5 text-[#F8C9BB] shrink-0" />
          <h2 className="text-xs font-black tracking-wide">③ 送料設定</h2>
          <span className="text-[9px] text-[#9C9490] ml-auto">新旧で発送元・送付先が異なる場合はそれぞれ設定</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-0">
          {renderShippingPanel(false)}
          {renderShippingPanel(true)}
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ④ 工程マスタ（旧/新） ━━━━━━━━━━━━━━━━━━━━━━ */}
      <section>
        <div className="bg-[#18130F] text-white px-4 sm:px-5 py-2.5 flex items-center gap-2 border-b-2 border-[#B5451B] rounded-t">
          <BarChart3 className="w-3.5 h-3.5 text-[#F8C9BB] shrink-0" />
          <h2 className="text-xs font-black tracking-wide">④ 工程マスタ</h2>
          <span className="text-[9px] text-[#9C9490] ml-auto">旧・新それぞれ独立 / コピーボタンで転記</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-0">
          {renderProcessTable(false)}
          {renderProcessTable(true)}
        </div>
      </section>

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ⑤ 新旧対比 ━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {([false, true] as const).map((isNew) => {
          const est = isNew ? newEstimate : oldEstimate;
          const calc = isNew ? newCalc : oldCalc;
          const headerBg = isNew ? 'bg-[#1E3A5F]' : 'bg-[#18130F]';
          const borderCls = isNew ? 'border-[#93B4D9]' : 'border-[#B8B0A6]';
          const borderTopAccent = isNew ? 'border-b-2 border-b-[#93B4D9]' : 'border-b-2 border-b-[#B5451B]';
          const label = isNew ? '🆕 新単価' : '📋 旧単価';
          const labelSub = isNew ? '新仕入れ単価をもとに新売値を設定' : '現行仕入れ・現行売値の確認';
          const totalColor = isNew ? 'text-[#1E3A5F]' : 'text-[#18130F]';

          const isGettingScrap = isNew ? isGettingScrapNew : isGettingScrapOld;

          // 現在の利益率 computation
          const sellPrice = est.adjustments.targetUnitPrice || 0;
          const actualCost = calc.actualTotalCost;
          const profitMarkup = (sellPrice > 0 && actualCost > 0)
            ? ((sellPrice - actualCost) / actualCost * 100)
            : null;
          const profitMargin = (sellPrice > 0 && actualCost > 0)
            ? ((sellPrice - actualCost) / sellPrice * 100)
            : null;

          const modeLabel: Record<string, string> = { standard: '加工費', kg: 'kg単価', lump: '一式', direct: '外注費' };
          const modeBtnStyle: Record<string, string> = {
            standard: 'bg-[#F0EDE8] text-[#6B6057] border-[#D6D0C8] hover:bg-[#E8E3DC]',
            kg:       'bg-[#EFF4FD] text-[#1E3A5F] border-[#93B4D9] hover:bg-[#D9E9F8]',
            lump:     'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200',
            direct:   'bg-[#FEF0EB] text-[#B5451B] border-[#F8C9BB] hover:bg-[#FDE6DC]',
          };

          return (
            <div key={String(isNew)} className={`bg-white rounded border-2 ${borderCls} overflow-hidden`}>

              <div className={`${headerBg} text-white px-4 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between ${borderTopAccent}`}>
                <div>
                  <h3 className="text-sm font-black">{label}</h3>
                  <p className="text-[10px] opacity-60">{labelSub}</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] opacity-50">現在の見積単価</div>
                  <div className="text-xl font-black font-mono">¥{calc.grandTotalUnitPrice.toFixed(0)}</div>
                </div>
              </div>

              <div className="divide-y divide-[#EEEBE6]">

                {/* 価格目標: 仕入れ実費・売値・現在の利益率・見積ロット */}
                <div className="p-4 sm:p-5 space-y-3">
                  <h4 className="text-[10px] font-black text-[#9C9490] uppercase tracking-wider flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5" /> 価格目標
                  </h4>

                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-[#1E3A5F] w-24 sm:w-28 shrink-0">
                      仕入れ実費
                      <span className="text-[8px] text-[#93B4D9] block font-normal">社内のみ</span>
                    </label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
                      <input
                        type="number"
                        value={est.adjustments.actualPurchasePrice || ''}
                        onChange={(e) => updateAdjustments(isNew, 'actualPurchasePrice', e.target.value)}
                        placeholder="実際の仕入れ単価"
                        className="w-full pl-6 pr-3 py-1.5 text-xs font-mono text-[#1E3A5F] rounded border border-[#C5D8EE] bg-[#EFF4FD]/30 outline-none focus:ring-1 focus:border-[#1E3A5F] transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-black text-[#18130F] w-24 sm:w-28 shrink-0">
                      {isNew ? '目標' : '現行'}売値 <span className="text-[#B5451B]">*</span>
                      <span className="text-[8px] text-[#9C9490] block font-normal">客提示価格</span>
                    </label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
                      <input
                        type="number"
                        value={est.adjustments.targetUnitPrice || ''}
                        onChange={(e) => updateAdjustments(isNew, 'targetUnitPrice', e.target.value)}
                        placeholder={isNew ? "新しい売値を入力" : "現行売値"}
                        className={`w-full pl-6 pr-3 py-2 text-sm font-mono font-black rounded border outline-none focus:ring-2 transition-all ${fld(isEmptyNum(est.adjustments.targetUnitPrice))}`}
                      />
                    </div>
                  </div>

                  {/* 現在の利益率 */}
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-[#6B6057] w-24 sm:w-28 shrink-0">
                      現在の利益率
                      <span className="text-[8px] text-[#9C9490] block font-normal">売値÷仕入実費</span>
                    </label>
                    <div className="flex-1 text-[10px] font-mono px-3 py-1.5 bg-[#F7F6F2] rounded border border-[#EEEBE6]">
                      {profitMarkup !== null ? (
                        <span>
                          外掛け <strong className={`${profitMarkup >= 0 ? 'text-[#1D5C3A]' : 'text-rose-600'}`}>{profitMarkup.toFixed(1)}%</strong>
                          <span className="text-[#9C9490] mx-1.5">/</span>
                          内掛け <strong className={`${(profitMargin || 0) >= 0 ? 'text-[#1D5C3A]' : 'text-rose-600'}`}>{profitMargin!.toFixed(1)}%</strong>
                        </span>
                      ) : (
                        <span className="text-[#9C9490]">仕入実費と売値を入力すると表示</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-[#6B6057] w-24 sm:w-28 shrink-0">見積ロット</label>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={est.baseLotSize || ''}
                        onChange={(e) => {
                          const v = Math.max(1, parseInt(e.target.value) || 1);
                          isNew ? onChangeNew({ ...est, baseLotSize: v }) : onChangeOld({ ...est, baseLotSize: v });
                        }}
                        className="w-full pl-3 pr-14 py-1.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">個/Lot</span>
                    </div>
                  </div>
                </div>

                {/* 材料単価 */}
                <div className="p-4 sm:p-5 space-y-3">
                  <h4 className="text-[10px] font-black text-[#9C9490] uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> 材料単価
                  </h4>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-black text-[#18130F] w-24 sm:w-28 shrink-0">
                      建値（客先提示）<span className="text-[#B5451B]">*</span>
                    </label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
                      <input
                        type="number"
                        value={est.material.basePricePerKg || ''}
                        onChange={(e) => updateMaterialPrice(isNew, 'basePricePerKg', e.target.value)}
                        placeholder="建値/kg"
                        className={`w-full pl-6 pr-14 py-1.5 text-xs font-mono font-bold rounded border outline-none focus:ring-1 transition-all ${fld(isEmptyNum(est.material.basePricePerKg))}`}
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">円/kg</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-[#9C9490] w-24 sm:w-28 shrink-0">実際建値</label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
                      <input
                        type="number"
                        value={est.material.actualBasePricePerKg ?? ''}
                        onChange={(e) => updateMaterialPrice(isNew, 'actualBasePricePerKg', e.target.value)}
                        placeholder="仕入れ建値/kg"
                        className="w-full pl-6 pr-14 py-1.5 text-xs font-mono text-[#1E3A5F] rounded border border-[#C5D8EE] bg-[#EFF4FD]/30 outline-none focus:ring-1 focus:border-[#1E3A5F] transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">円/kg</span>
                    </div>
                  </div>
                  {/* スクラップ建値 + AIボタン */}
                  <div className="flex items-start gap-3">
                    <label className="text-[10px] font-bold text-[#9C9490] w-24 sm:w-28 shrink-0 pt-1.5">スクラップ建値</label>
                    <div className="flex-1 space-y-1.5">
                      <button
                        onClick={() => handleGetScrapPrice(isNew)}
                        disabled={isGettingScrap}
                        className="w-full bg-[#2D1A5F] hover:bg-[#3D2570] text-white text-[9px] font-bold py-1.5 rounded flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer border border-[#4A3080]"
                      >
                        <Sparkles className={`w-3 h-3 shrink-0 ${isGettingScrap ? 'animate-spin' : ''}`} />
                        {isGettingScrap ? 'AI相場確認中...' : 'AIに最新のスクラップ相場を確認させる'}
                      </button>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
                        <input
                          type="number"
                          value={est.material.scrapPricePerKg || ''}
                          onChange={(e) => updateMaterialPrice(isNew, 'scrapPricePerKg', e.target.value)}
                          placeholder="0（未入力でも可）"
                          className="w-full pl-6 pr-14 py-1.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] transition-all"
                        />
                        <span className="absolute right-2.5 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">円/kg</span>
                      </div>
                    </div>
                  </div>
                  {/* スクラップ量 (per-side input) */}
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-[#9C9490] w-24 sm:w-28 shrink-0">スクラップ量</label>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={est.material.scrapWeightG || ''}
                        onChange={(e) => updateMaterialPrice(isNew, 'scrapWeightG', e.target.value)}
                        placeholder="0（未入力でも可）"
                        className="w-full pl-3 pr-8 py-1.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">g</span>
                    </div>
                  </div>
                  {/* スクラップ単価 (calculated display) */}
                  <div className="flex items-center justify-between text-[10px] px-1">
                    <span className="text-[#9C9490]">
                      スクラップ単価
                      <span className="text-[9px] ml-1 text-[#C0BAB4]">(建値×重量÷1000)</span>
                    </span>
                    <span className="font-mono font-bold text-[#6B6057]">
                      ¥{calc.scrapValue.toFixed(2)} / 個
                    </span>
                  </div>
                  <div className="text-[10px] text-[#9C9490] text-right">
                    ▶ 材料費計: <strong className="font-mono text-[#18130F]">¥{calc.netMaterialCost.toFixed(2)}</strong>
                  </div>
                </div>

                {/* 工程賃率 */}
                {est.processes.some(p => p.processName.trim()) && (
                  <div className="p-4 sm:p-5 space-y-3">
                    <h4 className="text-[10px] font-black text-[#9C9490] uppercase tracking-wider flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5" /> 工程賃率
                      <span className="text-[9px] font-normal text-[#9C9490] normal-case ml-1">客提示用 (各側独立)</span>
                    </h4>
                    {est.processes.map((proc, i) => {
                      if (!proc.processName.trim()) return null;
                      const mode = getCalcMode(proc);
                      const rateKey: Record<string, 'hourlyRate' | 'kgPrice' | 'lumpSumPrice' | 'directProcessingCost'> = {
                        standard: 'hourlyRate', kg: 'kgPrice', lump: 'lumpSumPrice', direct: 'directProcessingCost',
                      };
                      const unit: Record<string, string> = { standard: '円/h', kg: '円/kg', lump: '円/lot', direct: '円/個' };
                      const rateVal = mode === 'standard' ? proc.hourlyRate : mode === 'kg' ? proc.kgPrice : mode === 'lump' ? proc.lumpSumPrice : proc.directProcessingCost;
                      const isEmpty = isEmptyNum(rateVal);
                      return (
                        <div key={proc.index} className="flex flex-col gap-1 pb-2 border-b border-[#EEEBE6] last:border-0 last:pb-0 sm:flex-row sm:items-center sm:gap-2 sm:border-0 sm:pb-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => cycleCalcMode(isNew, proc.index, mode)}
                              title="タップで切替"
                              className={`text-[8px] px-1.5 py-0.5 rounded font-bold border transition-all cursor-pointer shrink-0 ${modeBtnStyle[mode]}`}
                            >
                              {modeLabel[mode]}
                            </button>
                            <label className="text-[10px] font-bold text-[#18130F] truncate sm:w-20 sm:shrink-0" title={proc.processName}>
                              {proc.processName}
                            </label>
                          </div>
                          <div className="flex items-center gap-2 sm:flex-1">
                            <div className="relative flex-1">
                              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
                              <input
                                type="number"
                                value={rateVal || ''}
                                onChange={(e) => updateProcessRates(isNew, proc.index, rateKey[mode], e.target.value)}
                                placeholder={unit[mode]}
                                className={`w-full pl-6 pr-12 py-1.5 text-xs font-mono font-bold rounded border outline-none focus:ring-1 transition-all ${fld(isEmpty)}`}
                              />
                              <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">{unit[mode]}</span>
                            </div>
                            <span className="text-[10px] font-mono text-[#6B6057] w-16 text-right shrink-0">
                              ¥{calc.processCosts[i].toFixed(1)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-[10px] text-[#9C9490] text-right pt-1 border-t border-[#EEEBE6]">
                      ▶ 加工費計: <strong className="font-mono text-[#18130F]">¥{calc.totalProcessCost.toFixed(2)}</strong>
                    </div>
                  </div>
                )}

                {/* 送料（単価） — display only, data from ③ */}
                <div className="px-4 sm:px-5 py-3">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 text-[#9C9490] font-black uppercase tracking-wider">
                      <Database className="w-3 h-3" /> 送料（単価）
                    </span>
                    <span className="font-mono font-bold text-[#18130F]">¥{calc.shippingCostPerUnit.toFixed(2)} / 個</span>
                  </div>
                  <div className="text-[9px] text-[#9C9490] mt-0.5">送料は③で設定 / 利管費の計算対象外</div>
                </div>

                {/* 目標利益率・下限利益率・利管費 */}
                <div className="p-4 sm:p-5 space-y-3">
                  <h4 className="text-[10px] font-black text-[#9C9490] uppercase tracking-wider flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" /> 利益・利管費設定
                  </h4>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-[#6B6057] w-24 sm:w-28 shrink-0">
                      目標利益率
                      <span className="text-[8px] text-[#9C9490] block font-normal">外掛け目標</span>
                    </label>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={est.adjustments.targetProfitRate ?? ''}
                        onChange={(e) => updateAdjustments(isNew, 'targetProfitRate', e.target.value)}
                        placeholder="例: 25"
                        className="w-full pl-3 pr-8 py-1.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-[#6B6057] w-24 sm:w-28 shrink-0">
                      下限利益率
                      <span className="text-[8px] text-[#9C9490] block font-normal">外掛け下限</span>
                    </label>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={est.adjustments.minProfitRate ?? ''}
                        onChange={(e) => updateAdjustments(isNew, 'minProfitRate', e.target.value)}
                        placeholder="例: 15"
                        className="w-full pl-3 pr-8 py-1.5 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-rose-400 transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-black text-[#18130F] w-24 sm:w-28 shrink-0">
                      利管費率
                      <span className="text-[8px] text-[#9C9490] block font-normal">材料+加工費に乗算</span>
                    </label>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={est.adjustments.sgaRatePercent ?? ''}
                        onChange={(e) => updateAdjustments(isNew, 'sgaRatePercent', e.target.value)}
                        placeholder="15"
                        step="0.01"
                        className="w-full pl-3 pr-8 py-1.5 text-xs font-mono font-bold rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] transition-all"
                      />
                      <span className="absolute right-2.5 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">%</span>
                    </div>
                    {est.adjustments.sgaRatePercent !== undefined && (est.adjustments.sgaRatePercent < 5 || est.adjustments.sgaRatePercent > 30) && calc.grandTotalUnitPrice > 0 && (
                      <span className="text-rose-500 text-[9px] font-bold shrink-0 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> 要注意
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleAutoReconcile(isNew)}
                    className="w-full bg-[#18130F] hover:bg-[#B5451B] active:bg-[#8A3215] text-white font-black text-[11px] py-2.5 rounded border border-[#2A2018] hover:border-[#8A3215] flex items-center justify-center gap-2 transition-all cursor-pointer mt-1"
                  >
                    <Zap className="w-3.5 h-3.5 text-[#F8C9BB]" />
                    一発自動整合 — 賃率→利管費%を目標売値に合わせて逆算
                  </button>
                </div>

                {/* 計算結果サマリー */}
                <div className={`p-4 sm:p-5 ${Math.abs(calc.auditVariance) < 0.1 ? 'bg-[#E8F4EE]/60' : 'bg-[#FEF0EB]/60'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-black text-[#6B6057] uppercase tracking-wider">計算結果</h4>
                    {Math.abs(calc.auditVariance) < 0.1
                      ? <span className="text-[10px] font-black text-[#1D5C3A] flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> 整合済み</span>
                      : <span className="text-[10px] font-black text-[#B5451B] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> 乖離: {calc.auditVariance > 0 ? '+' : ''}{calc.auditVariance.toFixed(2)}円</span>
                    }
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { label: '材料費', val: calc.netMaterialCost },
                      { label: '加工費計', val: calc.totalProcessCost },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex justify-between text-xs">
                        <span className="text-[#9C9490]">{label}</span>
                        <span className="font-mono font-bold text-[#6B6057]">¥{val.toFixed(2)}</span>
                      </div>
                    ))}

                    {/* 調整 — input field */}
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="text-[#9C9490] shrink-0">調整</span>
                      <div className="relative w-32">
                        <span className="absolute left-2 top-1 text-[10px] text-[#9C9490]">¥</span>
                        <input
                          type="number"
                          value={est.adjustments.otherAdjustment || ''}
                          onChange={(e) => updateAdjustments(isNew, 'otherAdjustment', e.target.value)}
                          placeholder="0"
                          className="w-full pl-5 pr-2 py-1 text-xs font-mono text-right rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-[#9C9490]">{`利管費 (${est.adjustments.sgaRatePercent?.toFixed(1) ?? 0}%)`}</span>
                      <span className="font-mono font-bold text-[#6B6057]">¥{calc.sgaCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#9C9490]">送料/個</span>
                      <span className="font-mono font-bold text-[#6B6057]">¥{calc.shippingCostPerUnit.toFixed(2)}</span>
                    </div>

                    <div className="border-t border-[#D6D0C8] pt-2 mt-2 flex justify-between items-baseline">
                      <span className="font-black text-[#18130F] text-xs">見積単価</span>
                      <span className={`text-xl font-black font-mono ${totalColor}`}>¥{calc.grandTotalUnitPrice.toFixed(2)}</span>
                    </div>

                    {/* 型費 — separate from unit price */}
                    <div className="flex items-center justify-between text-xs gap-2 pt-2 border-t border-dashed border-[#D6D0C8]">
                      <span className="text-[#9C9490] shrink-0">型費（別途）</span>
                      <div className="relative w-32">
                        <span className="absolute left-2 top-1 text-[10px] text-[#9C9490]">¥</span>
                        <input
                          type="number"
                          value={est.adjustments.toolingCost || ''}
                          onChange={(e) => updateAdjustments(isNew, 'toolingCost', e.target.value)}
                          placeholder="0"
                          className="w-full pl-5 pr-2 py-1 text-xs font-mono text-right rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] transition-all"
                        />
                      </div>
                    </div>

                    {est.adjustments.targetUnitPrice > 0 && (
                      <div className="flex justify-between text-xs text-[#9C9490] border-t border-[#EEEBE6] pt-1.5 mt-1">
                        <span>目標売値</span>
                        <span className="font-mono">¥{est.adjustments.targetUnitPrice.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━ ⑥ 利管費警告 ━━━━━━━━━━━━━━━━━━━━━━ */}
      {(oldCalc.grandTotalUnitPrice > 0 || newCalc.grandTotalUnitPrice > 0) &&
        ((oldEstimate.adjustments.sgaRatePercent !== undefined && (oldEstimate.adjustments.sgaRatePercent < 5 || oldEstimate.adjustments.sgaRatePercent > 30)) ||
         (newEstimate.adjustments.sgaRatePercent !== undefined && (newEstimate.adjustments.sgaRatePercent < 5 || newEstimate.adjustments.sgaRatePercent > 30))) && (
        <div className="p-4 bg-rose-950/80 border border-rose-800 text-rose-200 rounded text-[10.5px] leading-relaxed">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-rose-300 block font-black text-xs mb-1">
                【審議警告】利管費%が不自然な範囲 (5%未満 / 30%超) です
              </strong>
              賃率調整だけで辻褄を合わせようとしている場合、
              <strong className="text-white">④工程マスタの「出来高」と「段取時間」の前提見直し</strong>を合わせて行うと自然な数値に収まります。
              <span className="block mt-1 text-rose-300">
                現在値: 旧={oldEstimate.adjustments.sgaRatePercent?.toFixed(1)}% / 新={newEstimate.adjustments.sgaRatePercent?.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
