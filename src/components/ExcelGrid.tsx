import React, { useState } from 'react';
import { DetailedEstimate, ProcessRow, ProcessCalcMode, Scenario } from '../types';
import { calculateEstimate } from '../utils/calculations';
import { apiPost } from '../utils/apiClient';
import {
  Settings2, Zap, CheckCircle2, AlertTriangle,
  Sparkles, TrendingUp, BarChart3, Coins,
  History, Truck, Copy, Package, ArrowLeftRight,
} from 'lucide-react';

// ─── Visual sub-components ───────────────────────────────────────────────────

const CostCompositionBar: React.FC<{
  netMaterialCost: number; totalProcessCost: number; sgaCost: number;
  shippingCostPerUnit: number; total: number;
}> = ({ netMaterialCost, totalProcessCost, sgaCost, shippingCostPerUnit, total }) => {
  if (total <= 0) return null;
  const segs = [
    { label: '材料', v: netMaterialCost, fill: '#B5451B' },
    { label: '加工', v: totalProcessCost, fill: '#1E3A5F' },
    { label: '利管費', v: sgaCost, fill: '#6B3FA0' },
    { label: '送料', v: shippingCostPerUnit, fill: '#1A6B3A' },
  ].filter(s => s.v > 0);
  return (
    <div className="px-4 pt-3 pb-3 bg-[#FAFAF8] border-b border-[#F0EDE8]">
      <div className="flex h-5 rounded overflow-hidden gap-[1.5px] mb-2.5">
        {segs.map(({ label, v, fill }) => {
          const pct = v / total * 100;
          return (
            <div key={label} style={{ width: `${pct.toFixed(1)}%`, background: fill }}
              title={`${label}: ¥${v.toFixed(2)} (${pct.toFixed(2)}%)`}
              className="flex items-center justify-center overflow-hidden transition-all duration-700">
              {pct > 10 && <span className="text-[8px] font-black text-white/90 select-none tracking-tight">{pct.toFixed(0)}%</span>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segs.map(({ label, v, fill }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: fill }} />
            <span className="text-[9px] text-[#6B6057]">{label}</span>
            <span className="text-[9px] font-mono font-black text-[#18130F]">¥{Math.round(v).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ProfitGauge: React.FC<{
  actualRate: number; minRate: number; targetRate: number;
}> = ({ actualRate, minRate, targetRate }) => {
  if (targetRate <= 0 && minRate <= 0) return null;
  const maxVal = Math.max(targetRate + 5, 30, actualRate + 2, 1);
  const clamp = (v: number) => Math.max(0, Math.min(v, maxVal));
  const toW = (v: number) => `${(clamp(v) / maxVal * 100).toFixed(1)}%`;
  const status: 'good' | 'warn' | 'bad' = actualRate >= targetRate ? 'good' : actualRate >= minRate ? 'warn' : 'bad';
  const clrs = { good: '#1D5C3A', warn: '#D97706', bad: '#DC2626' };
  const color = clrs[status];
  const labels = { good: '目標達成', warn: '下限付近', bad: '下限割れ' };
  return (
    <div className="px-4 pt-3 pb-3 border-b border-[#F0EDE8] bg-[#FAFAF8]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-black text-[#9C9490] uppercase tracking-wider">実利益率ゲージ</span>
        <div className="flex items-center gap-1.5">
          <span className="text-base font-black font-mono leading-none" style={{ color }}>{actualRate.toFixed(2)}%</span>
          <span className="text-[8px] px-1.5 py-0.5 rounded font-bold border leading-none"
            style={{ color, borderColor: color + '50', background: color + '12' }}>
            {labels[status]}
          </span>
        </div>
      </div>
      <div className="relative h-3 rounded-full bg-[#EEEBE6] overflow-hidden">
        {minRate > 0 && <div className="absolute left-0 top-0 h-full bg-rose-200" style={{ width: toW(minRate) }} />}
        <div className="absolute top-0 h-full bg-amber-100"
          style={{ left: toW(Math.min(minRate, targetRate)), width: `${(clamp(targetRate) - clamp(Math.min(minRate, targetRate))) / maxVal * 100}%` }} />
        <div className="absolute top-0 h-full bg-emerald-100" style={{ left: toW(targetRate), right: 0 }} />
        <div className="absolute left-0 top-0 h-full transition-all duration-700 opacity-80"
          style={{ width: toW(actualRate), background: color }} />
        {minRate > 0 && <div className="absolute top-0 h-full w-[2px] bg-rose-600/70" style={{ left: toW(minRate) }} />}
        {targetRate > 0 && <div className="absolute top-0 h-full w-[2px] bg-emerald-700/70" style={{ left: toW(targetRate) }} />}
      </div>
      <div className="flex gap-3 mt-1.5 text-[8px]">
        {minRate > 0 && <span className="text-rose-600">下限 {minRate}%</span>}
        {targetRate > 0 && <span className="text-emerald-700">目標 {targetRate}%</span>}
        <span className="text-[#9C9490] ml-auto">実態 <strong style={{ color }}>{actualRate.toFixed(2)}%</strong></span>
      </div>
    </div>
  );
};

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
  oldEstimate, onChangeOld, newEstimate, onChangeNew,
  historyScenarios = [], onLoadHistory,
}) => {
  const oldCalc = calculateEstimate(oldEstimate);
  const newCalc = calculateEstimate(newEstimate);

  const [isInferringOld, setIsInferringOld] = useState(false);
  const [isInferringNew, setIsInferringNew] = useState(false);
  const [isCalcShippingOld, setIsCalcShippingOld] = useState(false);
  const [isCalcShippingNew, setIsCalcShippingNew] = useState(false);
  const [isGettingScrapOld, setIsGettingScrapOld] = useState(false);
  const [isGettingScrapNew, setIsGettingScrapNew] = useState(false);
  const [aiRetryCountdown, setAiRetryCountdown] = useState<number | null>(null);

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleInferProcessParams = async (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const setLoading = isNew ? setIsInferringNew : setIsInferringOld;
    try {
      setLoading(true);
      const response = await apiPost('/api/infer-process-params', {
        processes: est.processes.filter(p => !p.isDirectInput && p.processName),
        partNumber: est.partNumber,
      }, { onRetryCountdown: setAiRetryCountdown });
      const { results } = await response.json();
      if (!results || !Array.isArray(results)) return;
      const filtered = est.processes.filter(p => !p.isDirectInput && p.processName.trim());
      const newProcs = [...est.processes];
      results.forEach((res: any, i: number) => {
        if (i >= filtered.length) return;
        const pIdx = newProcs.findIndex(p => p.index === filtered[i].index);
        if (pIdx > -1) {
          const suggestedRate = res.suggestedHourlyRate ? Math.round(res.suggestedHourlyRate / 100) * 100 : newProcs[pIdx].hourlyRate;
          newProcs[pIdx] = { ...newProcs[pIdx], totalHours: res.suggestedTotalHours || 0, yieldPerHour: res.suggestedYieldPerHour || 0, hourlyRate: suggestedRate, actualHourlyRate: suggestedRate };
        }
      });
      setter({ ...est, processes: newProcs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '通信エラー';
      alert(`AI自動設定に失敗しました: ${msg}\n※ログインが必要な機能です。`);
    } finally { setLoading(false); }
  };

  const handleCalculateShipping = async (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const setLoading = isNew ? setIsCalcShippingNew : setIsCalcShippingOld;
    const { originPrefecture, destinationPrefecture, qtyPerBox } = est.logistics;
    if (!originPrefecture || !destinationPrefecture) { alert('発送元と送付先の都道府県を選択してください。'); return; }
    const boxWeightKg = est.finishedWeightG > 0 && qtyPerBox > 0 ? (est.finishedWeightG * qtyPerBox) / 1000 : 0;
    if (boxWeightKg <= 0) { alert('完成品重量と箱入り数を先に入力してください。'); return; }
    try {
      setLoading(true);
      const response = await apiPost('/api/calculate-shipping', { weightKg: boxWeightKg, qtyPerBox, originPrefecture, destinationPrefecture }, { onRetryCountdown: setAiRetryCountdown });
      const data = await response.json();
      if (data.estimatedFreightPerBox > 0) {
        setter({ ...est, logistics: { ...est.logistics, freightPerBox: Math.round(data.estimatedFreightPerBox) } });
        if (data.basis) alert(`AI推定送料: ¥${Math.round(data.estimatedFreightPerBox).toLocaleString()}/箱\n\n根拠: ${data.basis}\n\n※推定値です。実際の送料に合わせて手動で修正してください。`);
      }
    } catch (err) {
      alert(`送料算出に失敗しました: ${err instanceof Error ? err.message : '通信エラー'}`);
    } finally { setLoading(false); }
  };

  const handleGetScrapPrice = async (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const setLoading = isNew ? setIsGettingScrapNew : setIsGettingScrapOld;
    const materialName = est.material.materialName || newEstimate.material.materialName;
    if (!materialName.trim()) { alert('共通諸元で材質・規格を入力してください。'); return; }
    try {
      setLoading(true);
      const response = await apiPost('/api/get-scrap-price', { materialName }, { onRetryCountdown: setAiRetryCountdown });
      const data = await response.json();
      if (data.estimatedScrapPricePerKg > 0) {
        setter({ ...est, material: { ...est.material, scrapPricePerKg: data.estimatedScrapPricePerKg } });
        if (data.basis) alert(`AI推定スクラップ単価: ¥${data.estimatedScrapPricePerKg.toLocaleString()}/kg\n\n根拠: ${data.basis}\n\n※推定値です。`);
      }
    } catch (err) {
      alert(`スクラップ相場確認に失敗しました: ${err instanceof Error ? err.message : '通信エラー'}`);
    } finally { setLoading(false); }
  };

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

  const updateProcessMeta = (isNew: boolean, index: number, key: keyof ProcessRow, value: any) => {
    const numericKeys = ['totalHours','yieldPerHour','actualHourlyRate','directProcessingCost','lumpSumPrice','kgPrice'];
    const est = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    setter({
      ...est,
      processes: est.processes.map((proc) => {
        if (proc.index !== index) return proc;
        if (key === 'isDirectInput' || key === 'calcMode') return { ...proc, [key]: value };
        if (typeof value === 'string' && numericKeys.includes(key as string)) {
          const parsed = parseFloat(value);
          return { ...proc, [key]: isNaN(parsed) ? (key === 'actualHourlyRate' ? undefined : 0) : parsed };
        }
        return { ...proc, [key]: value };
      }),
    });
  };

  const cycleCalcMode = (isNew: boolean, index: number, current: ProcessCalcMode) => {
    const modes: ProcessCalcMode[] = ['standard', 'kg', 'lump', 'direct'];
    updateProcessMeta(isNew, index, 'calcMode', modes[(modes.indexOf(current) + 1) % modes.length]);
  };

  const copyProcesses = (fromNew: boolean) => {
    if (fromNew) onChangeOld({ ...oldEstimate, processes: newEstimate.processes.map(p => ({ ...p })) });
    else onChangeNew({ ...newEstimate, processes: oldEstimate.processes.map(p => ({ ...p })) });
  };

  const copyFullColumn = (fromNew: boolean) => {
    if (fromNew) {
      onChangeOld({ ...oldEstimate, material: { ...newEstimate.material }, processes: newEstimate.processes.map(p => ({ ...p })), logistics: { ...newEstimate.logistics }, adjustments: { ...newEstimate.adjustments } });
    } else {
      onChangeNew({ ...newEstimate, material: { ...oldEstimate.material }, processes: oldEstimate.processes.map(p => ({ ...p })), logistics: { ...oldEstimate.logistics }, adjustments: { ...oldEstimate.adjustments } });
    }
  };

  const getCalcMode = (proc: ProcessRow): ProcessCalcMode => {
    if (proc.calcMode) return proc.calcMode;
    if (proc.isDirectInput) return 'direct';
    if (proc.kgPrice > 0) return 'kg';
    return 'standard';
  };

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
    setter({ ...target, processes: target.processes.map(proc => proc.index === index ? { ...proc, [key]: isNaN(parsed) ? 0 : parsed } : proc) });
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

  const updateAdjustments = (isNew: boolean, key: 'targetProfitRate' | 'minProfitRate' | 'targetProfitMarginOff' | 'targetUnitPrice' | 'actualPurchasePrice' | 'sgaRatePercent' | 'toolingCost' | 'otherAdjustment', value: any) => {
    const parsed = parseFloat(value);
    const val = value === '' ? '' : (isNaN(parsed) ? 0 : parsed);
    if (key === 'targetProfitRate' || key === 'minProfitRate') {
      onChangeOld({ ...oldEstimate, adjustments: { ...oldEstimate.adjustments, [key]: val as any } });
      onChangeNew({ ...newEstimate, adjustments: { ...newEstimate.adjustments, [key]: val as any } });
    } else {
      const target = isNew ? newEstimate : oldEstimate;
      const setter = isNew ? onChangeNew : onChangeOld;
      setter({ ...target, adjustments: { ...target.adjustments, [key]: val as any } });
    }
  };

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
      finalSgaPercent = Math.max(0, Math.round(((Y / tempPrimeCost) - 1) * 10000) / 100);
    }
    updatedAdjustments.sgaRatePercent = finalSgaPercent;
    setter({ ...target, processes: draftProcesses, adjustments: updatedAdjustments });
  };

  // ─── Style helpers ────────────────────────────────────────────────────────────
  const isEmptyStr = (v: string | undefined) => !v || v.trim() === '';
  const isEmptyNum = (v: number | undefined | null) => !v || v === 0;
  const fld = (empty: boolean) => empty
    ? 'bg-[#FEF0EB] border-[#F8C9BB] focus:border-[#B5451B] focus:ring-[#B5451B]/15'
    : 'bg-white border-[#D6D0C8] focus:border-[#B5451B] focus:ring-[#B5451B]/15';
  const inp = 'w-full px-2.5 py-1.5 text-xs font-mono rounded border outline-none focus:ring-1 transition-all';

  const modeLabel: Record<string, string> = { standard: '加工費', kg: 'kg単価', lump: '一式', direct: '外注費' };
  const modeBtnStyle: Record<string, string> = {
    standard: 'bg-[#F0EDE8] text-[#6B6057] border-[#D6D0C8]',
    kg:       'bg-[#EFF4FD] text-[#1E3A5F] border-[#93B4D9]',
    lump:     'bg-purple-100 text-purple-700 border-purple-300',
    direct:   'bg-[#FEF0EB] text-[#B5451B] border-[#F8C9BB]',
  };

  // ─── renderColumn ─────────────────────────────────────────────────────────────
  const renderColumn = (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const calc = isNew ? newCalc : oldCalc;
    const isInferring = isNew ? isInferringNew : isInferringOld;
    const isCalcShipping = isNew ? isCalcShippingNew : isCalcShippingOld;
    const isGettingScrap = isNew ? isGettingScrapNew : isGettingScrapOld;

    const colBorder = isNew ? 'border-[#1E3A5F]' : 'border-[#2D2219]';
    const colHeaderBg = isNew ? 'bg-[#1E3A5F]' : 'bg-[#2D2219]';
    const colAccentText = isNew ? 'text-[#1E3A5F]' : 'text-[#B5451B]';
    const colAccentBg = isNew ? 'bg-[#EFF4FD]' : 'bg-[#FEF0EB]';
    const colBorderAccent = isNew ? 'border-b-[#93B4D9]' : 'border-b-[#B5451B]';
    const colAccentBorder = isNew ? 'border-[#93B4D9]' : 'border-[#F8C9BB]';
    const colAccentLeft = isNew ? 'border-l-[#93B4D9]' : 'border-l-[#B5451B]';

    const sh = (Icon: any, label: string) => (
      <div className={`px-4 py-2.5 flex items-center gap-1.5 border-b border-[#F0EDE8] border-l-2 ${colAccentLeft} ${colAccentBg}/40`}>
        <Icon className={`w-3.5 h-3.5 shrink-0 ${colAccentText}`} />
        <span className={`text-xs font-black uppercase tracking-wider ${colAccentText}`}>{label}</span>
      </div>
    );

    const boxWeightKg = est.finishedWeightG > 0 && est.logistics.qtyPerBox > 0
      ? ((est.finishedWeightG * est.logistics.qtyPerBox) / 1000).toFixed(2) : null;

    return (
      <div className={`bg-white rounded-lg border-2 ${colBorder} overflow-hidden`}>

        {/* Column header */}
        <div className={`${colHeaderBg} text-white px-4 py-3 border-b-2 ${colBorderAccent}`}>
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <div className="text-sm font-black">{isNew ? '🆕 新単価' : '📋 旧単価'}</div>
              <div className="text-[11px] opacity-70">{isNew ? '新仕入れ・新売値設定' : '現行仕入れ・現行売値の確認'}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] opacity-60">見積単価</div>
              <div className={`text-2xl font-black font-mono ${calc.grandTotalUnitPrice > 0 ? 'text-white' : 'text-white/30'}`}>
                {calc.grandTotalUnitPrice > 0 ? `¥${Math.round(calc.grandTotalUnitPrice).toLocaleString()}` : '—'}
              </div>
            </div>
          </div>
          <button
            onClick={() => copyFullColumn(!isNew)}
            className="w-full text-xs font-bold py-1.5 rounded border border-white/30 bg-white/10 hover:bg-white/20 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {isNew ? '← 旧の全内訳を転記' : '新の全内訳を転記 →'}
          </button>
        </div>

        {/* ── 見積ロット（列ごとに独立設定） ── */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-[#F0EDE8] bg-[#FAFAF8]">
          <label className="text-[10px] font-black text-[#18130F] w-24 shrink-0">
            見積ロット <span className="text-[#B5451B]">*</span>
          </label>
          <div className="relative flex-1">
            <input
              type="number"
              value={est.baseLotSize || ''}
              onChange={(e) => {
                const v = Math.max(1, parseInt(e.target.value) || 1);
                (isNew ? onChangeNew : onChangeOld)({ ...est, baseLotSize: v });
              }}
              placeholder="300"
              className={`${inp} pr-12 font-bold ${fld(isEmptyNum(est.baseLotSize))}`}
            />
            <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">個/Lot</span>
          </div>
        </div>

        {/* ── コスト構成バー ── */}
        <CostCompositionBar
          netMaterialCost={calc.netMaterialCost}
          totalProcessCost={calc.totalProcessCost}
          sgaCost={calc.sgaCost}
          shippingCostPerUnit={calc.shippingCostPerUnit}
          total={calc.grandTotalUnitPrice}
        />

        {/* ── 1. 仕入実費（社内のみ） ── */}
        {sh(Coins, '1. 仕入実費（社内のみ）')}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">
              仕入れ実費
              <span className="text-[9px] text-[#6B6057] block font-normal">整合チェック用</span>
            </label>
            <div className="relative w-48 flex-none">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
              <input type="number" value={est.adjustments.actualPurchasePrice || ''}
                onChange={(e) => updateAdjustments(isNew, 'actualPurchasePrice', e.target.value)}
                placeholder="実際の仕入れ単価"
                className={`${inp} pl-6 text-[#1E3A5F] border-[#C5D8EE] bg-[#EFF4FD]/30 focus:border-[#1E3A5F] focus:ring-[#1E3A5F]/15`} />
            </div>
          </div>
        </div>

        {/* ── 2. 材料 ── */}
        {sh(TrendingUp, '2. 材料')}
        <div className="px-4 py-3 space-y-2">

          {/* 実際建値（仕入）を先に表示 */}
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">実際建値（仕入）</label>
            <div className="relative w-48 flex-none">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
              <input type="number" value={est.material.actualBasePricePerKg ?? ''}
                onChange={(e) => updateMaterialPrice(isNew, 'actualBasePricePerKg', e.target.value)}
                placeholder="仕入建値/kg"
                className={`${inp} pl-6 pr-14 text-[#1E3A5F] border-[#C5D8EE] bg-[#EFF4FD]/30 focus:border-[#1E3A5F] focus:ring-[#1E3A5F]/15`} />
              <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">円/kg</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">建値（客先）<span className="text-[#B5451B]">*</span></label>
            <div className="relative w-48 flex-none">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
              <input type="number" value={est.material.basePricePerKg || ''}
                onChange={(e) => updateMaterialPrice(isNew, 'basePricePerKg', e.target.value)}
                placeholder="建値/kg"
                className={`${inp} pl-6 pr-14 font-bold ${fld(isEmptyNum(est.material.basePricePerKg))}`} />
              <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">円/kg</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">スクラップ量</label>
            <div className="relative w-48 flex-none">
              <input type="number" value={est.material.scrapWeightG || ''}
                onChange={(e) => updateMaterialPrice(isNew, 'scrapWeightG', e.target.value)}
                placeholder="0"
                className={`${inp} pr-8 border-[#D6D0C8] bg-white focus:border-[#B5451B] focus:ring-[#B5451B]/15`} />
              <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">g</span>
            </div>
          </div>

          <div className="flex items-start justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0 pt-1.5">スクラップ建値</label>
            <div className="w-48 flex-none space-y-1.5">
              <button onClick={() => handleGetScrapPrice(isNew)} disabled={isGettingScrap}
                className="w-full bg-[#2D1A5F] hover:bg-[#3D2570] text-white text-xs font-bold py-1.5 rounded flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer border border-[#4A3080] transition-colors">
                <Sparkles className={`w-3 h-3 ${isGettingScrap ? 'animate-spin' : ''}`} />
                {isGettingScrap && aiRetryCountdown !== null ? `${aiRetryCountdown}秒後再試行` : isGettingScrap ? 'AI確認中...' : 'AI相場確認'}
              </button>
              <div className="relative">
                <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
                <input type="number" value={est.material.scrapPricePerKg || ''}
                  onChange={(e) => updateMaterialPrice(isNew, 'scrapPricePerKg', e.target.value)}
                  placeholder="0"
                  className={`${inp} pl-6 pr-14 border-[#D6D0C8] bg-white focus:border-[#B5451B] focus:ring-[#B5451B]/15`} />
                <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">円/kg</span>
              </div>
            </div>
          </div>

          <div className={`flex justify-between text-xs px-3 py-1.5 ${colAccentBg} rounded border ${colAccentBorder}`}>
            <span className={`font-bold ${colAccentText}`}>材料費/個</span>
            <span className={`font-mono font-black ${colAccentText}`}>¥{calc.netMaterialCost.toFixed(2)}</span>
          </div>
        </div>

        {/* ── 3. 加工工程 ── */}
        {sh(Settings2, '3. 加工工程')}
        <div className="px-4 py-3">

          <div className="flex items-center gap-1.5 mb-2">
            <button onClick={() => copyProcesses(!isNew)}
              className={`text-xs px-2.5 py-1.5 rounded font-bold border flex items-center gap-1 cursor-pointer transition-colors ${colAccentBg} ${colAccentText} ${colAccentBorder} hover:opacity-80`}>
              <Copy className="w-3 h-3" />{isNew ? '旧から工程コピー' : '新から工程コピー'}
            </button>
            <button onClick={() => handleInferProcessParams(isNew)} disabled={isInferring}
              className="text-xs px-2.5 py-1.5 bg-[#18130F] hover:bg-[#2D2219] text-white rounded font-bold border border-[#2D2219] flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors">
              <Sparkles className={`w-3 h-3 ${isInferring ? 'animate-spin' : ''}`} />
              {isInferring && aiRetryCountdown !== null ? `${aiRetryCountdown}秒後再試行` : isInferring ? 'AI推定中...' : 'AI自動設定'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[580px]">
              <thead>
                <tr className="bg-[#F0EDE8] text-xs text-[#18130F] font-black uppercase tracking-wider">
                  <th className="py-1.5 px-1 text-center w-5">#</th>
                  <th className="py-1.5 px-1.5 text-left" style={{minWidth: 70, maxWidth: 90}}>工程名</th>
                  <th className="py-1.5 px-1 text-center w-10">種別</th>
                  <th className="py-1.5 px-1 text-right w-24">出来高</th>
                  <th className="py-1.5 px-1 text-right w-16">段取(h)</th>
                  <th className="py-1.5 px-1 text-right w-24 text-[#B5451B]">客提示賃率</th>
                  <th className="py-1.5 px-1 text-right w-24 text-[#1E3A5F]">実態賃率</th>
                  <th className="py-1.5 px-1 text-right w-20">→費用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEBE6]">
                {est.processes.map((proc, i) => {
                  const mode = getCalcMode(proc);
                  const costPerUnit = calc.processCosts[i] ?? 0;
                  return (
                    <tr key={proc.index} className="hover:bg-[#FAFAF8]">
                      <td className="py-1 px-1 text-center text-[9px] text-[#9C9490] font-mono">#{proc.index}</td>
                      <td className="py-1 px-1.5">
                        <input type="text" value={proc.processName}
                          onChange={(e) => updateProcessMeta(isNew, proc.index, 'processName', e.target.value)}
                          placeholder="工程名"
                          className="w-full px-2 py-1 text-xs font-bold rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B] mb-0.5" />
                        <input type="text" value={proc.workContent}
                          onChange={(e) => updateProcessMeta(isNew, proc.index, 'workContent', e.target.value)}
                          placeholder="作業内容"
                          className="w-full px-2 py-0.5 text-[9px] text-[#6B6057] rounded border border-[#EEEBE6] bg-[#F7F6F2] outline-none focus:ring-1 focus:border-[#B5451B]" />
                      </td>
                      <td className="py-1 px-1 text-center">
                        <button onClick={() => cycleCalcMode(isNew, proc.index, mode)}
                          className={`text-[8px] px-1 py-0.5 rounded font-bold border cursor-pointer w-full ${modeBtnStyle[mode]}`}>
                          {modeLabel[mode]}
                        </button>
                      </td>
                      <td className="py-1 px-1">
                        {mode === 'standard' && (
                          <div className="relative">
                            <input type="number" value={proc.yieldPerHour || ''}
                              onChange={(e) => updateProcessMeta(isNew, proc.index, 'yieldPerHour', e.target.value)}
                              placeholder="0"
                              className={`w-full pl-1.5 pr-7 py-1 text-xs font-mono rounded border outline-none focus:ring-1 ${proc.processName && !proc.yieldPerHour ? 'border-[#F8C9BB] bg-[#FEF0EB]' : 'border-[#D6D0C8] bg-white'}`} />
                            <span className="absolute right-0.5 top-1 text-[8px] text-[#9C9490]">個/h</span>
                          </div>
                        )}
                        {mode === 'kg' && (
                          <div className="relative">
                            <input type="number" value={proc.kgPrice || ''}
                              onChange={(e) => updateProcessMeta(isNew, proc.index, 'kgPrice', e.target.value)}
                              placeholder="0"
                              className="w-full pl-1.5 pr-9 py-1 text-xs font-mono text-[#1E3A5F] rounded border border-[#93B4D9] bg-white outline-none focus:ring-1" />
                            <span className="absolute right-0.5 top-1 text-[8px] text-[#1E3A5F]">円/kg</span>
                          </div>
                        )}
                        {mode === 'lump' && (
                          <div className="relative">
                            <input type="number" value={proc.lumpSumPrice || ''}
                              onChange={(e) => updateProcessMeta(isNew, proc.index, 'lumpSumPrice', e.target.value)}
                              placeholder="0"
                              className="w-full pl-1.5 pr-9 py-1 text-xs font-mono text-purple-800 rounded border border-purple-300 bg-white outline-none focus:ring-1" />
                            <span className="absolute right-0.5 top-1 text-[8px] text-purple-600">円/lot</span>
                          </div>
                        )}
                        {mode === 'direct' && (
                          <div className="relative">
                            <input type="number" value={proc.directProcessingCost || ''}
                              onChange={(e) => updateProcessMeta(isNew, proc.index, 'directProcessingCost', e.target.value)}
                              placeholder="0"
                              className="w-full pl-1.5 pr-7 py-1 text-xs font-mono text-[#B5451B] font-bold rounded border border-[#F8C9BB] bg-white outline-none focus:ring-1" />
                            <span className="absolute right-0.5 top-1 text-[8px] text-[#B5451B]">円/個</span>
                          </div>
                        )}
                      </td>
                      <td className="py-1 px-1">
                        {mode === 'standard' ? (
                          <div className="relative">
                            <input type="number" value={proc.totalHours || ''}
                              onChange={(e) => updateProcessMeta(isNew, proc.index, 'totalHours', e.target.value)}
                              placeholder="0" step="any"
                              className="w-full pl-1.5 pr-4 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1" />
                            <span className="absolute right-0.5 top-1 text-[8px] text-[#9C9490]">h</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-7 text-[9px] text-[#D6D0C8] bg-[#F7F6F2] rounded border border-[#EEEBE6]">—</div>
                        )}
                      </td>
                      <td className="py-1 px-1">
                        {mode === 'standard' ? (
                          <div className="relative">
                            <input type="number" value={proc.hourlyRate || ''}
                              onChange={(e) => updateProcessRates(isNew, proc.index, 'hourlyRate', e.target.value)}
                              placeholder="0"
                              className={`w-full pl-1.5 pr-7 py-1 text-xs font-mono font-bold rounded border outline-none focus:ring-1 ${fld(isEmptyNum(proc.hourlyRate))}`} />
                            <span className="absolute right-0.5 top-1 text-[8px] text-[#9C9490]">円/h</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-7 text-[9px] text-[#D6D0C8] bg-[#F7F6F2] rounded border border-[#EEEBE6]">—</div>
                        )}
                      </td>
                      <td className="py-1 px-1">
                        {mode === 'standard' ? (
                          <div className="relative">
                            <input type="number" value={proc.actualHourlyRate || ''}
                              onChange={(e) => updateProcessMeta(isNew, proc.index, 'actualHourlyRate', e.target.value)}
                              placeholder="実態"
                              className="w-full pl-1.5 pr-7 py-1 text-xs font-mono text-[#1E3A5F] rounded border border-[#C5D8EE] bg-[#EFF4FD]/30 outline-none focus:ring-1" />
                            <span className="absolute right-0.5 top-1 text-[8px] text-[#1E3A5F]">円/h</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-7 text-[9px] text-[#D6D0C8] bg-[#F7F6F2] rounded border border-[#EEEBE6]">—</div>
                        )}
                      </td>
                      <td className="py-1 px-1">
                        <div className="text-right font-mono font-bold text-[11px] text-[#18130F]">¥{costPerUnit.toFixed(2)}</div>
                        {calc.totalProcessCost > 0 && costPerUnit > 0.01 && (
                          <div className="mt-0.5 h-1 rounded-full overflow-hidden bg-[#F0EDE8]">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, costPerUnit / calc.totalProcessCost * 100).toFixed(1)}%`, background: isNew ? '#1E3A5F' : '#B5451B' }} />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={`flex justify-between text-xs px-3 py-1.5 mt-2 ${colAccentBg} rounded border ${colAccentBorder}`}>
            <span className={`font-bold ${colAccentText}`}>加工費合計</span>
            <span className={`font-mono font-black ${colAccentText}`}>¥{calc.totalProcessCost.toFixed(2)}</span>
          </div>
        </div>

        {/* ── 4. 物流・送料 ── */}
        {sh(Truck, '4. 物流・送料')}
        <div className="px-4 py-3 space-y-2">

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">箱入り数 <span className="text-[#B5451B]">*</span></label>
            <div className="relative w-48 flex-none">
              <input type="number" value={est.logistics.qtyPerBox || ''}
                onChange={(e) => updateLogisticsRates(isNew, 'qtyPerBox', e.target.value)}
                placeholder="10"
                className={`${inp} pr-14 ${fld(isEmptyNum(est.logistics.qtyPerBox))}`} />
              <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490] pointer-events-none">個/箱</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">発送元</label>
            <select value={est.logistics.originPrefecture || ''}
              onChange={(e) => updateLogisticsRates(isNew, 'originPrefecture', e.target.value)}
              className="w-48 flex-none px-2 py-1.5 text-xs rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]">
              <option value="">-- 都道府県 --</option>
              {JAPAN_PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">送付先</label>
            <select value={est.logistics.destinationPrefecture || ''}
              onChange={(e) => updateLogisticsRates(isNew, 'destinationPrefecture', e.target.value)}
              className="w-48 flex-none px-2 py-1.5 text-xs rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]">
              <option value="">-- 都道府県 --</option>
              {JAPAN_PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {boxWeightKg && (
            <div className="text-xs text-[#18130F] flex items-center gap-1 px-1">
              <Package className="w-3.5 h-3.5" />箱重量: <strong className="font-mono">約{boxWeightKg}kg</strong>
            </div>
          )}

          <button onClick={() => handleCalculateShipping(isNew)} disabled={isCalcShipping}
            className="w-full bg-[#1A4A2E] hover:bg-[#215E3A] text-white text-xs font-bold py-1.5 rounded flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer border border-[#2D6B44] transition-colors">
            <Truck className={`w-3.5 h-3.5 ${isCalcShipping ? 'animate-bounce' : ''}`} />
            {isCalcShipping && aiRetryCountdown !== null ? `${aiRetryCountdown}秒後再試行` : isCalcShipping ? 'AI算出中...' : 'AIで送料試算（ヤマト/佐川目安）'}
          </button>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">運賃/箱 <span className="text-[#B5451B]">*</span></label>
            <div className="relative w-48 flex-none">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
              <input type="number" value={est.logistics.freightPerBox || ''}
                onChange={(e) => updateLogisticsRates(isNew, 'freightPerBox', e.target.value)}
                placeholder="送料/箱"
                className={`${inp} pl-6 font-bold ${fld(isEmptyNum(est.logistics.freightPerBox))}`} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">実際運賃/箱</label>
            <div className="relative w-48 flex-none">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#9C9490]">¥</span>
              <input type="number" value={est.logistics.actualFreightPerBox ?? ''}
                onChange={(e) => updateLogisticsRates(isNew, 'actualFreightPerBox', e.target.value)}
                placeholder="実際運賃"
                className={`${inp} pl-6 text-[#1E3A5F] border-[#C5D8EE] bg-[#EFF4FD]/30 focus:border-[#1E3A5F] focus:ring-[#1E3A5F]/15`} />
            </div>
          </div>

          <div className={`flex justify-between text-xs px-3 py-1.5 ${colAccentBg} rounded border ${colAccentBorder}`}>
            <span className={`font-bold ${colAccentText}`}>送料/個</span>
            <span className={`font-mono font-black ${colAccentText}`}>¥{calc.shippingCostPerUnit.toFixed(2)}</span>
          </div>
        </div>

        {/* ── 5. 利益・利管費設定 ── */}
        {sh(BarChart3, '5. 利益・利管費設定')}
        <div className="px-4 py-3 space-y-2.5">

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">
              目標利益率
              <span className="text-[9px] text-[#6B6057] block">外掛け目標</span>
            </label>
            <div className="relative w-36 flex-none">
              <input type="number" value={est.adjustments.targetProfitRate ?? ''}
                onChange={(e) => updateAdjustments(isNew, 'targetProfitRate', e.target.value)}
                placeholder="例: 25"
                className={`${inp} pr-8 border-[#D6D0C8] bg-white focus:border-[#B5451B] focus:ring-[#B5451B]/15`} />
              <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490]">%</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">
              利管費率
              <span className="text-[9px] text-[#6B6057] block">材料+加工に乗算</span>
            </label>
            <div className="relative w-36 flex-none flex items-center gap-1">
              <div className="relative flex-1">
                <input type="number" value={est.adjustments.sgaRatePercent ?? ''}
                  onChange={(e) => updateAdjustments(isNew, 'sgaRatePercent', e.target.value)}
                  placeholder="15" step="0.01"
                  className={`${inp} pr-8 font-bold border-[#D6D0C8] bg-white focus:border-[#B5451B] focus:ring-[#B5451B]/15`} />
                <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490]">%</span>
              </div>
              {est.adjustments.sgaRatePercent !== undefined && (est.adjustments.sgaRatePercent < 5 || est.adjustments.sgaRatePercent > 30) && calc.grandTotalUnitPrice > 0 && (
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">
              客向内掛け率
              <span className="text-[9px] text-[#6B6057] block">架空仕入原価算出</span>
            </label>
            <div className="relative w-36 flex-none">
              <input type="number" value={est.adjustments.targetProfitMarginOff ?? ''}
                onChange={(e) => updateAdjustments(isNew, 'targetProfitMarginOff', e.target.value)}
                placeholder="例: 15"
                className={`${inp} pr-8 border-[#D6D0C8] bg-white focus:border-[#B5451B] focus:ring-[#B5451B]/15`} />
              <span className="absolute right-2 top-1.5 text-[9px] text-[#9C9490]">%</span>
            </div>
          </div>

          <button onClick={() => handleAutoReconcile(isNew)}
            className="w-full bg-[#18130F] hover:bg-[#B5451B] active:bg-[#8A3215] text-white font-black text-xs py-2.5 rounded border border-[#2A2018] hover:border-[#8A3215] flex items-center justify-center gap-2 cursor-pointer transition-all mt-1">
            <Zap className="w-3.5 h-3.5 text-[#F8C9BB]" />
            一発自動整合 — 賃率・利管費を目標売値に逆算
          </button>
        </div>

        {/* ── 利益率ゲージ (外掛け比較) ── */}
        <ProfitGauge
          actualRate={calc.actualTotalCost > 0
            ? ((calc.adjustedSellingPrice - calc.actualTotalCost) / calc.actualTotalCost * 100)
            : 0}
          minRate={est.adjustments.minProfitRate || 0}
          targetRate={est.adjustments.targetProfitRate || 0}
        />

        {/* ── 6. 計算結果 ── */}
        <div className={`p-4 border-t-2 border-[#EEEBE6] ${Math.abs(calc.auditVariance) < 0.1 ? 'bg-[#E8F5EC]/50' : 'bg-[#FEF0EB]/50'}`}>
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
              { label: '直製造原価', val: calc.primeCost },
              { label: `利管費 (${est.adjustments.sgaRatePercent?.toFixed(2) ?? 0}%)`, val: calc.sgaCost },
              { label: '送料/個', val: calc.shippingCostPerUnit },
            ].map(({ label, val }) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-[#18130F]">{label}</span>
                <span className="font-mono font-bold text-[#18130F]">¥{val.toFixed(2)}</span>
              </div>
            ))}

            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-[#18130F] shrink-0 font-bold">調整</span>
              <div className="relative w-28">
                <span className="absolute left-2 top-1 text-[10px] text-[#9C9490]">¥</span>
                <input type="number" value={est.adjustments.otherAdjustment || ''}
                  onChange={(e) => updateAdjustments(isNew, 'otherAdjustment', e.target.value)}
                  placeholder="0"
                  className="w-full pl-5 pr-2 py-1 text-xs font-mono text-right rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
              </div>
            </div>

            <div className="border-t-2 border-[#D6D0C8] pt-2 mt-2 flex justify-between items-baseline">
              <span className="font-black text-[#18130F] text-sm">見積単価</span>
              <span className={`text-2xl font-black font-mono ${isNew ? 'text-[#1E3A5F]' : 'text-[#18130F]'}`}>
                ¥{calc.grandTotalUnitPrice.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs gap-2 pt-2 border-t border-dashed border-[#D6D0C8]">
              <span className="text-[#18130F] shrink-0 font-bold">型費（別途）</span>
              <div className="relative w-28">
                <span className="absolute left-2 top-1 text-[10px] text-[#9C9490]">¥</span>
                <input type="number" value={est.adjustments.toolingCost || ''}
                  onChange={(e) => updateAdjustments(isNew, 'toolingCost', e.target.value)}
                  placeholder="0"
                  className="w-full pl-5 pr-2 py-1 text-xs font-mono text-right rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1 focus:border-[#B5451B]" />
              </div>
            </div>

            {est.adjustments.targetUnitPrice > 0 && (
              <div className="text-xs text-[#18130F] font-bold flex justify-between pt-1 border-t border-[#EEEBE6]">
                <span>目標売値</span>
                <span className="font-mono">¥{est.adjustments.targetUnitPrice.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

      </div>
    );
  };

  // ─── Waterfall Diff ───────────────────────────────────────────────────────────
  const renderDiffBar = () => {
    if (oldCalc.grandTotalUnitPrice <= 0 && newCalc.grandTotalUnitPrice <= 0) return null;

    const dUnit = newCalc.grandTotalUnitPrice - oldCalc.grandTotalUnitPrice;
    const pctUnit = oldCalc.grandTotalUnitPrice > 0 ? (dUnit / oldCalc.grandTotalUnitPrice * 100) : null;

    const components = [
      { label: '材料費/個', o: oldCalc.netMaterialCost, n: newCalc.netMaterialCost, dot: '#B5451B' },
      { label: '加工費合計', o: oldCalc.totalProcessCost, n: newCalc.totalProcessCost, dot: '#1E3A5F' },
      { label: '利管費', o: oldCalc.sgaCost, n: newCalc.sgaCost, dot: '#6B3FA0' },
      { label: '送料/個', o: oldCalc.shippingCostPerUnit, n: newCalc.shippingCostPerUnit, dot: '#1A6B3A' },
    ].filter(c => c.o > 0 || c.n > 0);

    const maxAbsDelta = Math.max(...components.map(c => Math.abs(c.n - c.o)), 0.01);

    const DiffChip = ({ d, base }: { d: number; base: number }) => {
      const p = base > 0.01 ? (d / base * 100) : null;
      const isUp = d > 0.01; const isDn = d < -0.01;
      const cls = isUp
        ? 'text-rose-400 bg-rose-900/30 border-rose-700/50'
        : isDn ? 'text-emerald-400 bg-emerald-900/30 border-emerald-700/50'
        : 'text-[#6B6057] bg-[#1A1510] border-[#3D3228]';
      return (
        <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${cls} whitespace-nowrap`}>
          {d > 0 ? '+' : ''}{d.toFixed(2)}{p !== null ? ` (${p > 0 ? '+' : ''}${p.toFixed(2)}%)` : ''}
        </span>
      );
    };

    return (
      <div className="bg-[#18130F] rounded-lg overflow-hidden border border-[#2D2219]">

        {/* ─ Header */}
        <div className="px-4 py-3.5 border-b border-[#2D2219] flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-[#F8C9BB]" />
            <span className="text-sm font-black text-white tracking-wide">コスト変動ウォーターフォール</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-center">
              <div className="text-[8px] text-[#6B6057] mb-0.5 font-bold uppercase tracking-wider">旧単価</div>
              <div className="text-lg font-black font-mono text-[#9C9490]">
                ¥{Math.round(oldCalc.grandTotalUnitPrice).toLocaleString()}
              </div>
            </div>
            <div className="text-[#3D3228] text-xl font-thin select-none">→</div>
            <div className="text-center">
              <div className="text-[8px] text-[#B5451B] mb-0.5 font-bold uppercase tracking-wider">新単価</div>
              <div className="text-2xl font-black font-mono text-white">
                ¥{Math.round(newCalc.grandTotalUnitPrice).toLocaleString()}
              </div>
            </div>
            <div className={`text-lg font-black font-mono ${dUnit > 0.01 ? 'text-rose-400' : dUnit < -0.01 ? 'text-emerald-400' : 'text-[#6B6057]'}`}>
              {dUnit > 0 ? '+' : ''}{dUnit.toFixed(2)}
              {pctUnit !== null && (
                <span className="text-[11px] ml-1">({pctUnit > 0 ? '+' : ''}{pctUnit.toFixed(2)}%)</span>
              )}
            </div>
          </div>
        </div>

        {/* ─ Waterfall rows */}
        <div className="p-4 space-y-2">
          <div className="text-[9px] font-black text-[#6B6057] uppercase tracking-wider mb-3">コスト内訳の変動</div>
          {components.map(({ label, o, n, dot }) => {
            const delta = n - o;
            const isUp = delta > 0.01;
            const isDn = delta < -0.01;
            const noChange = !isUp && !isDn;
            const barPct = noChange ? 0 : (Math.abs(delta) / maxAbsDelta * 75 + 10);
            const barColor = isUp ? '#EF4444' : '#22C55E';
            const textCls = isUp ? 'text-rose-400' : isDn ? 'text-emerald-400' : 'text-[#4D4540]';
            return (
              <div key={label} className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: dot }} />
                <span className="text-[9px] text-[#9C9490] w-[4.5rem] shrink-0 leading-tight">{label}</span>
                <div className="flex-1 h-5 rounded bg-[#1A1510] overflow-hidden flex items-center">
                  {noChange ? (
                    <div className="w-full flex items-center justify-center">
                      <span className="text-[8px] text-[#3D3228] font-mono">変化なし</span>
                    </div>
                  ) : (
                    <div className="h-full rounded transition-all duration-700 flex items-center px-2"
                      style={{ width: `${barPct.toFixed(1)}%`, background: barColor }}>
                      <span className="text-[8px] font-black text-white/90 whitespace-nowrap">
                        {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="w-28 shrink-0 text-right">
                  <div className={`text-[9px] font-mono font-bold ${textCls}`}>
                    {noChange ? '±0' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}
                    {!noChange && o > 0.01 && (
                      <span className="text-[7px] ml-1 opacity-70">({((delta / o) * 100).toFixed(0)}%)</span>
                    )}
                  </div>
                  <div className="text-[8px] text-[#4D4540] font-mono">¥{o.toFixed(2)} → ¥{n.toFixed(2)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ─ Totals row */}
        <div className="mx-4 mb-3 pt-3 border-t border-[#2D2219] flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[10px] font-black text-[#9C9490] uppercase tracking-wider">御見積単価 差額</span>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span className="text-sm font-mono text-[#9C9490]">¥{oldCalc.grandTotalUnitPrice.toFixed(2)}</span>
            <span className="text-[#3D3228]">→</span>
            <span className="text-sm font-black font-mono text-white">¥{newCalc.grandTotalUnitPrice.toFixed(2)}</span>
            <DiffChip d={dUnit} base={oldCalc.grandTotalUnitPrice} />
          </div>
        </div>

        {/* ─ Profit comparison */}
        {(oldCalc.actualProfitRate !== 0 || newCalc.actualProfitRate !== 0) && (
          <div className="px-4 pb-4 pt-2 border-t border-[#2D2219] flex items-center flex-wrap gap-x-4 gap-y-1.5">
            <span className="text-[9px] font-black text-[#6B6057] uppercase tracking-wider">実利益率 (内掛け)</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#9C9490]">
                旧 <strong className={oldCalc.actualProfitRate >= 0 ? 'text-[#6B9C8A]' : 'text-rose-500'}>{oldCalc.actualProfitRate.toFixed(2)}%</strong>
              </span>
              <span className="text-[#3D3228]">→</span>
              <span className="text-xs font-mono">
                新 <strong className={newCalc.actualProfitRate >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{newCalc.actualProfitRate.toFixed(2)}%</strong>
              </span>
              {(() => {
                const d = newCalc.actualProfitRate - oldCalc.actualProfitRate;
                const isUp = d > 0.05; const isDn = d < -0.05;
                const cls = isUp
                  ? 'text-emerald-400 border-emerald-700/40 bg-emerald-900/20'
                  : isDn ? 'text-rose-400 border-rose-700/40 bg-rose-900/20'
                  : 'text-[#6B6057] border-[#3D3228]';
                return (
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${cls}`}>
                    {d > 0 ? '+' : ''}{d.toFixed(2)}pp
                  </span>
                );
              })()}
            </div>
          </div>
        )}

      </div>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-16">

      {/* ── 過去履歴 ── */}
      {historyScenarios.length > 0 && (
        <div className="p-3 bg-[#FEF0EB] border border-[#F8C9BB] rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <History className="w-3.5 h-3.5 text-[#B5451B] shrink-0" />
            <span className="text-[10px] font-black text-[#B5451B]">この品番の保存済み見積が {historyScenarios.length} 件あります</span>
          </div>
          <div className="space-y-1.5">
            {historyScenarios.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-white rounded px-3 py-2 border border-[#F8C9BB] gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-[#18130F] truncate block">{s.name}</span>
                  <span className="text-[10px] text-[#9C9490]">
                    旧: ¥{s.oldEstimate.adjustments.targetUnitPrice.toLocaleString()} → 新: ¥{s.newEstimate.adjustments.targetUnitPrice.toLocaleString()}
                    {s.updatedAt?.seconds && <span className="ml-2">{new Date(s.updatedAt.seconds * 1000).toLocaleDateString('ja-JP')}</span>}
                  </span>
                </div>
                <button onClick={() => onLoadHistory?.(s.id)}
                  className="shrink-0 text-[10px] font-bold text-[#B5451B] hover:bg-[#FEF0EB] border border-[#D6D0C8] rounded px-2.5 py-1 cursor-pointer transition-all">
                  読み込む
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 2カラム ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
        {renderColumn(false)}
        {renderColumn(true)}
      </div>

      {/* ── 差額サマリー ── */}
      {renderDiffBar()}

      {/* ── 利管費警告 ── */}
      {(oldCalc.grandTotalUnitPrice > 0 || newCalc.grandTotalUnitPrice > 0) &&
        ((oldEstimate.adjustments.sgaRatePercent !== undefined && (oldEstimate.adjustments.sgaRatePercent < 5 || oldEstimate.adjustments.sgaRatePercent > 30)) ||
         (newEstimate.adjustments.sgaRatePercent !== undefined && (newEstimate.adjustments.sgaRatePercent < 5 || newEstimate.adjustments.sgaRatePercent > 30))) && (
        <div className="p-4 bg-rose-950/80 border border-rose-800 text-rose-200 rounded-lg text-[10.5px] leading-relaxed">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-rose-300 block font-black text-xs mb-1">【審議警告】利管費%が不自然な範囲 (5%未満 / 30%超) です</strong>
              賃率調整だけで辻褄を合わせようとしている場合、<strong className="text-white">工程の「出来高」と「段取時間」の前提見直し</strong>を合わせて行うと自然な数値に収まります。
              <span className="block mt-1 text-rose-300">
                現在値: 旧={oldEstimate.adjustments.sgaRatePercent?.toFixed(2)}% / 新={newEstimate.adjustments.sgaRatePercent?.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
