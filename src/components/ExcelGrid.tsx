import React, { useState } from 'react';

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
import { DetailedEstimate, ProcessRow, ProcessCalcMode, Scenario } from '../types';
import { calculateEstimate } from '../utils/calculations';
import { apiPost } from '../utils/apiClient';
import {
  Settings2,
  Sparkles, TrendingUp, Coins,
  History, Truck, Copy, Package,
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

export const ProfitGauge: React.FC<{
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
        <span className="text-[9px] font-black text-[#3A3028] uppercase tracking-wider">実利益率ゲージ</span>
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
        <span className="text-[#3A3028] ml-auto">実態 <strong style={{ color }}>{actualRate.toFixed(2)}%</strong></span>
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
  const [slideRate, setSlideRate] = useState<string>('');
  const [aiModal, setAiModal] = useState<{ label: string; status: 'loading' | 'success' | 'error'; message?: string } | null>(null);

  const showAiResult = (label: string, status: 'success' | 'error', message?: string) => {
    setAiModal({ label, status, message });
    setTimeout(() => setAiModal(null), status === 'success' ? 2500 : 4000);
  };

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleInferProcessParams = async (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const setLoading = isNew ? setIsInferringNew : setIsInferringOld;
    setAiModal({ label: 'AI工程パラメータ推定中...', status: 'loading' });
    try {
      setLoading(true);
      const response = await apiPost('/api/infer-process-params', {
        processes: est.processes.filter(p => !p.isDirectInput && p.processName),
        partNumber: est.partNumber,
      }, { onRetryCountdown: setAiRetryCountdown });
      const { results } = await response.json();
      if (!results || !Array.isArray(results)) {
        showAiResult('AI工程パラメータ推定', 'error', '結果データが取得できませんでした');
        return;
      }
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
      showAiResult('AI工程パラメータ推定', 'success', `${filtered.length}工程を推定・設定しました`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '通信エラー';
      showAiResult('AI工程パラメータ推定', 'error', `${msg}\n※ログインが必要な機能です`);
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
    setAiModal({ label: 'AI送料算出中...', status: 'loading' });
    try {
      setLoading(true);
      const response = await apiPost('/api/calculate-shipping', { weightKg: boxWeightKg, qtyPerBox, originPrefecture, destinationPrefecture }, { onRetryCountdown: setAiRetryCountdown });
      const data = await response.json();
      if (data.estimatedFreightPerBox > 0) {
        setter({ ...est, logistics: { ...est.logistics, freightPerBox: Math.round(data.estimatedFreightPerBox) } });
        showAiResult('AI送料算出', 'success', `¥${Math.round(data.estimatedFreightPerBox).toLocaleString()}/箱${data.basis ? `\n${data.basis}` : ''}\n※推定値。実際の送料で修正してください`);
      } else {
        showAiResult('AI送料算出', 'error', '送料が算出できませんでした');
      }
    } catch (err) {
      showAiResult('AI送料算出', 'error', err instanceof Error ? err.message : '通信エラー');
    } finally { setLoading(false); }
  };

  const handleGetScrapPrice = async (isNew: boolean) => {
    const est = isNew ? newEstimate : oldEstimate;
    const setter = isNew ? onChangeNew : onChangeOld;
    const setLoading = isNew ? setIsGettingScrapNew : setIsGettingScrapOld;
    const materialName = est.material.materialName || newEstimate.material.materialName;
    if (!materialName.trim()) { alert('共通諸元で材質・規格を入力してください。'); return; }
    setAiModal({ label: 'AIスクラップ単価確認中...', status: 'loading' });
    try {
      setLoading(true);
      const response = await apiPost('/api/get-scrap-price', { materialName }, { onRetryCountdown: setAiRetryCountdown });
      const data = await response.json();
      if (data.estimatedScrapPricePerKg > 0) {
        setter({ ...est, material: { ...est.material, scrapPricePerKg: data.estimatedScrapPricePerKg } });
        showAiResult('AIスクラップ単価', 'success', `¥${data.estimatedScrapPricePerKg.toLocaleString()}/kg${data.basis ? `\n${data.basis}` : ''}\n※推定値`);
      } else {
        showAiResult('AIスクラップ単価', 'error', '単価が取得できませんでした');
      }
    } catch (err) {
      showAiResult('AIスクラップ単価', 'error', err instanceof Error ? err.message : '通信エラー');
    } finally { setLoading(false); }
  };

  const updateProcessMeta = (isNew: boolean, index: number, key: keyof ProcessRow, value: any) => {
    const numericKeys = ['totalHours','yieldPerHour','actualHourlyRate','directProcessingCost','actualDirectProcessingCost','lumpSumPrice','actualLumpSumPrice','kgPrice','actualKgPrice'];
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
    // 全内訳転記: material/processes/logistics/SGA設定はコピーするが、
    // 目標単価・仕入実費・ロック状態はコピー先の値を維持する
    const keepAdj = (dest: typeof oldEstimate['adjustments'], src: typeof oldEstimate['adjustments']) => ({
      ...src,
      targetUnitPrice: dest.targetUnitPrice,
      actualPurchasePrice: dest.actualPurchasePrice,
      targetPriceLocked: dest.targetPriceLocked,
    });
    if (fromNew) {
      onChangeOld({ ...oldEstimate, material: { ...newEstimate.material }, processes: newEstimate.processes.map(p => ({ ...p })), logistics: { ...newEstimate.logistics }, adjustments: keepAdj(oldEstimate.adjustments, newEstimate.adjustments) });
    } else {
      onChangeNew({ ...newEstimate, material: { ...oldEstimate.material }, processes: oldEstimate.processes.map(p => ({ ...p })), logistics: { ...oldEstimate.logistics }, adjustments: keepAdj(newEstimate.adjustments, oldEstimate.adjustments) });
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

  const updateAdjustments = (isNew: boolean, key: 'targetProfitRate' | 'minProfitRate' | 'targetProfitMarginOff' | 'targetUnitPrice' | 'actualPurchasePrice' | 'sgaRatePercent' | 'sgaFixedAdjustment' | 'toolingCost' | 'otherAdjustment', value: any) => {
    const parsed = parseFloat(value);
    const val = isNaN(parsed) ? 0 : parsed;
    if (key === 'targetProfitRate') {
      // 目標利益率は両列共通ルールとして同期
      onChangeOld({ ...oldEstimate, adjustments: { ...oldEstimate.adjustments, [key]: val as any } });
      onChangeNew({ ...newEstimate, adjustments: { ...newEstimate.adjustments, [key]: val as any } });
    } else {
      // minProfitRate・その他はすべて列ごとに独立
      const target = isNew ? newEstimate : oldEstimate;
      const setter = isNew ? onChangeNew : onChangeOld;
      setter({ ...target, adjustments: { ...target.adjustments, [key]: val as any } });
    }
  };

  // A: 旧からスライド率一括転記
  const handleSlideFromOld = () => {
    const rate = parseFloat(slideRate);
    if (isNaN(rate)) { alert('スライド率を数値で入力してください (例: 5 → +5%)'); return; }
    const m = 1 + rate / 100;
    onChangeNew({
      ...newEstimate,
      baseLotSize: oldEstimate.baseLotSize,
      material: {
        ...oldEstimate.material,
        basePricePerKg: parseFloat((oldEstimate.material.basePricePerKg * m).toFixed(2)),
        actualBasePricePerKg: oldEstimate.material.actualBasePricePerKg != null
          ? parseFloat((oldEstimate.material.actualBasePricePerKg * m).toFixed(2)) : undefined,
      },
      processes: oldEstimate.processes.map(p => ({
        ...p,
        hourlyRate: p.hourlyRate ? Math.round(p.hourlyRate * m / 100) * 100 : 0,
        actualHourlyRate: p.actualHourlyRate != null
          ? Math.round(p.actualHourlyRate * m / 100) * 100 : undefined,
        directProcessingCost: p.directProcessingCost
          ? parseFloat((p.directProcessingCost * m).toFixed(2)) : 0,
        kgPrice: p.kgPrice ? parseFloat((p.kgPrice * m).toFixed(2)) : 0,
        lumpSumPrice: p.lumpSumPrice != null
          ? parseFloat((p.lumpSumPrice * m).toFixed(2)) : undefined,
      })),
      logistics: {
        ...oldEstimate.logistics,
        freightPerBox: Math.round(oldEstimate.logistics.freightPerBox * m),
        actualFreightPerBox: oldEstimate.logistics.actualFreightPerBox != null
          ? Math.round(oldEstimate.logistics.actualFreightPerBox * m) : undefined,
      },
    });
  };

  // ─── Style helpers ────────────────────────────────────────────────────────────
  const isEmptyStr = (v: string | undefined) => !v || v.trim() === '';
  const isEmptyNum = (v: number | undefined | null) => !v || v === 0;
  const fld = (empty: boolean) => empty
    ? 'bg-[#FEF0EB] border-[#F8C9BB] focus:border-[#B5451B] focus:ring-[#B5451B]/15'
    : 'bg-white border-[#D6D0C8] focus:border-[#B5451B] focus:ring-[#B5451B]/15';
  const inp = 'w-full px-2.5 py-1.5 text-xs font-mono rounded border outline-none focus:ring-1 transition-all';

  const modeLabel: Record<string, string> = { standard: '加工費', kg: 'kg単価', lump: '一式', direct: '直数字' };
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
          <div className={`flex items-center gap-1.5 mt-2 ${!isNew ? 'invisible pointer-events-none' : ''}`}>
              <div className="relative flex-1">
                <input
                  type="number"
                  value={slideRate}
                  onChange={(e) => setSlideRate(e.target.value)}
                  placeholder="スライド率 例: 5"
                  step="0.1"
                  className="w-full px-2.5 py-1.5 pr-7 text-xs font-mono rounded border border-white/30 bg-white/10 text-white placeholder-white/40 outline-none focus:border-white/60"
                />
                <span className="absolute right-2 top-1.5 text-[9px] text-white/60 pointer-events-none">%</span>
              </div>
              <button
                onClick={handleSlideFromOld}
                className="shrink-0 text-[10px] font-black px-2 py-1.5 rounded border border-white/40 bg-white/20 hover:bg-white/30 text-white flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
              >
                旧からスライド転記
              </button>
            </div>
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
            <span className="absolute right-2 top-1.5 text-[9px] text-[#3A3028] pointer-events-none">個/Lot</span>
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
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">
              仕入れ実費
              <span className="text-[9px] text-[#6B6057] block font-normal">整合チェック用</span>
            </label>
            <div className="relative w-48 flex-none">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#3A3028]">¥</span>
              <input type="number" value={est.adjustments.actualPurchasePrice || ''}
                onChange={(e) => updateAdjustments(isNew, 'actualPurchasePrice', e.target.value)}
                placeholder="実際の仕入れ単価"
                className={`${inp} pl-6 text-[#1E3A5F] border-[#C5D8EE] bg-[#EFF4FD]/30 focus:border-[#1E3A5F] focus:ring-[#1E3A5F]/15`} />
            </div>
          </div>
          {/* C: 架空仕入原価・逆算パネル */}
          {est.adjustments.targetProfitMarginOff > 0 && calc.suggestedPurchasePriceForClient > 0 && (
            <div className={`p-2 rounded border text-[10px] space-y-1 ${colAccentBg} ${colAccentBorder}`}>
              <div className="text-[9px] font-black text-[#3A3028] uppercase tracking-wide mb-1">架空仕入原価（客先提出用）</div>
              <div className="flex justify-between items-baseline">
                <span className="text-[#18130F]">提出用仕入原価</span>
                <span className={`font-mono font-black text-sm ${colAccentText}`}>
                  ¥{Math.round(calc.suggestedPurchasePriceForClient).toLocaleString()}
                </span>
              </div>
              {calc.makeupGapAmount > 0.5 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-[#6B6057]">積み上げ不足（ゲタ）</span>
                  <span className="font-mono font-black text-sm text-amber-700">
                    +¥{Math.round(calc.makeupGapAmount).toLocaleString()}
                  </span>
                </div>
              )}
              {calc.makeupGapAmount <= 0.5 && (
                <div className="text-[9px] text-emerald-700 font-black">✓ 積み上げ充足</div>
              )}
            </div>
          )}
        </div>

        {/* ── 2. 材料 ── */}
        {sh(TrendingUp, '2. 材料')}
        <div className="px-4 py-3 space-y-2">

          {/* 実際建値（仕入）を先に表示 */}
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">実際建値（仕入）</label>
            <div className="relative w-48 flex-none">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#3A3028]">¥</span>
              <input type="number" value={est.material.actualBasePricePerKg ?? ''}
                onChange={(e) => updateMaterialPrice(isNew, 'actualBasePricePerKg', e.target.value)}
                placeholder="仕入建値/kg"
                className={`${inp} pl-6 pr-14 text-[#1E3A5F] border-[#C5D8EE] bg-[#EFF4FD]/30 focus:border-[#1E3A5F] focus:ring-[#1E3A5F]/15`} />
              <span className="absolute right-2 top-1.5 text-[9px] text-[#3A3028] pointer-events-none">円/kg</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">建値（客先）<span className="text-[#B5451B]">*</span></label>
            <div className="relative w-48 flex-none">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#3A3028]">¥</span>
              <input type="number" value={est.material.basePricePerKg || ''}
                onChange={(e) => updateMaterialPrice(isNew, 'basePricePerKg', e.target.value)}
                placeholder="建値/kg"
                className={`${inp} pl-6 pr-14 font-bold ${fld(isEmptyNum(est.material.basePricePerKg))}`} />
              <span className="absolute right-2 top-1.5 text-[9px] text-[#3A3028] pointer-events-none">円/kg</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">スクラップ量</label>
            <div className="relative w-48 flex-none">
              <input type="number" value={est.material.scrapWeightG || ''}
                onChange={(e) => updateMaterialPrice(isNew, 'scrapWeightG', e.target.value)}
                placeholder="0"
                className={`${inp} pr-8 border-[#D6D0C8] bg-white focus:border-[#B5451B] focus:ring-[#B5451B]/15`} />
              <span className="absolute right-2 top-1.5 text-[9px] text-[#3A3028] pointer-events-none">g</span>
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
                <span className="absolute left-2.5 top-1.5 text-[10px] text-[#3A3028]">¥</span>
                <input type="number" value={est.material.scrapPricePerKg || ''}
                  onChange={(e) => updateMaterialPrice(isNew, 'scrapPricePerKg', e.target.value)}
                  placeholder="0"
                  className={`${inp} pl-6 pr-14 border-[#D6D0C8] bg-white focus:border-[#B5451B] focus:ring-[#B5451B]/15`} />
                <span className="absolute right-2 top-1.5 text-[9px] text-[#3A3028] pointer-events-none">円/kg</span>
              </div>
            </div>
          </div>

          <div className={`flex justify-between text-xs px-3 py-1.5 ${colAccentBg} rounded border ${colAccentBorder}`}>
            <span className={`font-bold ${colAccentText}`}>材料費/個</span>
            <span className={`font-mono font-black ${colAccentText}`}>¥{calc.netMaterialCost.toFixed(2)}</span>
          </div>

          {/* D: 材料変動理由 */}
          <input
            type="text"
            value={est.material.changeReason || ''}
            onChange={(e) => {
              const target = isNew ? newEstimate : oldEstimate;
              const setter = isNew ? onChangeNew : onChangeOld;
              setter({ ...target, material: { ...target.material, changeReason: e.target.value } });
            }}
            placeholder="材料変動理由（任意）"
            className="w-full px-2 py-0.5 text-[10px] text-[#6B6057] italic bg-amber-50/50 border border-amber-200/50 rounded outline-none focus:border-amber-300"
          />
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
                  <th className="py-1.5 px-1.5 text-left" style={{minWidth: 50, maxWidth: 63}}>工程名</th>
                  <th className="py-1.5 px-1 text-center w-10">種別</th>
                  <th className="py-1.5 px-1 text-right w-28">出来高<Tooltip text="1時間に何個加工できるか。サイクルタイム = 3600÷出来高(秒/個)。" /></th>
                  <th className="py-1.5 px-1 text-right w-20">段取(h)<Tooltip text="段取時間の合計(h)。1個当たり段取費用 = 段取時間 ÷ ロットサイズ × 賃率。" /></th>
                  <th className="py-1.5 px-1 text-right w-28 text-[#B5451B]">客提示賃率<Tooltip text="1時間当たりの加工費単価。客提示用（架空）の値。実際賃率と異なる場合は下の「実態賃率」に入力。" /></th>
                  <th className="py-1.5 px-1 text-right w-28 text-[#1E3A5F]">実態賃率</th>
                  <th className="py-1.5 px-1 text-right w-20">加工費<Tooltip text="サイクル費用＋段取費用。サイクル費用 = 賃率 ÷ 出来高。段取費用 = 賃率 × 段取時間 ÷ ロットサイズ。" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEBE6]">
                {est.processes.map((proc, i) => {
                  const mode = getCalcMode(proc);
                  const costPerUnit = calc.processCosts[i] ?? 0;
                  // Cross-column reference (for new column only)
                  const oldProc = isNew ? oldEstimate.processes.find(p => p.index === proc.index) : null;
                  const hasBothNames = isNew && oldProc && proc.processName.trim() && oldProc.processName.trim();
                  const yieldMismatch = hasBothNames && Math.abs((proc.yieldPerHour || 0) - (oldProc!.yieldPerHour || 0)) > 0.001;
                  const hoursMismatch = hasBothNames && Math.abs((proc.totalHours || 0) - (oldProc!.totalHours || 0)) > 0.001;
                  const rateRatio = hasBothNames && (oldProc!.hourlyRate || 0) > 0 && (proc.hourlyRate || 0) > 0
                    ? (proc.hourlyRate || 0) / (oldProc!.hourlyRate || 0) : null;
                  return (
                    <React.Fragment key={proc.index}>
                    <tr className="hover:bg-[#FAFAF8]">
                      <td className="py-1 px-1 text-center text-[9px] text-[#3A3028] font-mono">#{proc.index}</td>
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
                              className={`no-spin w-full pl-1.5 pr-7 py-1 text-xs font-mono rounded border outline-none focus:ring-1 ${proc.processName && !proc.yieldPerHour ? 'border-[#F8C9BB] bg-[#FEF0EB]' : 'border-[#D6D0C8] bg-white'}`} />
                            <span className="absolute right-0.5 top-1 text-[8px] text-[#3A3028]">個/h</span>
                          </div>
                        )}
                        {isNew && oldProc && mode === 'standard' && (
                          <div className={`text-[8px] mt-0.5 font-mono ${yieldMismatch ? 'text-rose-600 font-black' : 'text-[#3A3028]'}`}>
                            旧:{oldProc.yieldPerHour || '—'}{yieldMismatch && ' ⚠ 不一致'}
                          </div>
                        )}
                        {mode === 'kg' && (
                          <div>
                            <div className="text-[8px] text-[#B5451B] font-bold mb-0.5">客提示</div>
                            <div className="relative">
                              <input type="number" value={proc.kgPrice || ''}
                                onChange={(e) => updateProcessMeta(isNew, proc.index, 'kgPrice', e.target.value)}
                                placeholder="0"
                                className="w-full pl-1.5 pr-9 py-1 text-xs font-mono text-[#1E3A5F] font-bold rounded border border-[#93B4D9] bg-white outline-none focus:ring-1" />
                              <span className="absolute right-0.5 top-1 text-[8px] text-[#1E3A5F]">円/kg</span>
                            </div>
                          </div>
                        )}
                        {mode === 'lump' && (
                          <div>
                            <div className="text-[8px] text-[#B5451B] font-bold mb-0.5">客提示</div>
                            <div className="relative">
                              <input type="number" value={proc.lumpSumPrice || ''}
                                onChange={(e) => updateProcessMeta(isNew, proc.index, 'lumpSumPrice', e.target.value)}
                                placeholder="0"
                                className="w-full pl-1.5 pr-9 py-1 text-xs font-mono text-purple-800 font-bold rounded border border-purple-300 bg-white outline-none focus:ring-1" />
                              <span className="absolute right-0.5 top-1 text-[8px] text-purple-600">円/lot</span>
                            </div>
                          </div>
                        )}
                        {mode === 'direct' && (
                          <div>
                            <div className="text-[8px] text-[#B5451B] font-bold mb-0.5">客提示</div>
                            <div className="relative">
                              <input type="number" value={proc.directProcessingCost || ''}
                                onChange={(e) => updateProcessMeta(isNew, proc.index, 'directProcessingCost', e.target.value)}
                                placeholder="0"
                                className="w-full pl-1.5 pr-7 py-1 text-xs font-mono text-[#B5451B] font-bold rounded border border-[#F8C9BB] bg-white outline-none focus:ring-1" />
                              <span className="absolute right-0.5 top-1 text-[8px] text-[#B5451B]">円/個</span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-1 px-1">
                        {mode === 'standard' ? (
                          <div className="relative">
                            <input type="number" value={proc.totalHours || ''}
                              onChange={(e) => updateProcessMeta(isNew, proc.index, 'totalHours', e.target.value)}
                              placeholder="0" step="any"
                              className="no-spin w-full pl-1.5 pr-4 py-1 text-xs font-mono rounded border border-[#D6D0C8] bg-white outline-none focus:ring-1" />
                            <span className="absolute right-0.5 top-1 text-[8px] text-[#3A3028]">h</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-7 text-[9px] text-[#D6D0C8] bg-[#F7F6F2] rounded border border-[#EEEBE6]">—</div>
                        )}
                        {mode === 'standard' && (proc.totalHours || 0) > 0 && (
                          <div className="text-[8px] mt-0.5 font-mono text-[#3A3028]">
                            {Math.round((proc.totalHours || 0) * 60)}分
                          </div>
                        )}
                        {isNew && oldProc && mode === 'standard' && (
                          <div className={`text-[8px] mt-0.5 font-mono ${hoursMismatch ? 'text-rose-600 font-black' : 'text-[#3A3028]'}`}>
                            旧:{oldProc.totalHours || '—'}{hoursMismatch && ' ⚠ 不一致'}
                          </div>
                        )}
                      </td>
                      <td className="py-1 px-1">
                        {mode === 'standard' ? (
                          <div className="relative">
                            <input type="number" value={proc.hourlyRate || ''}
                              onChange={(e) => updateProcessRates(isNew, proc.index, 'hourlyRate', e.target.value)}
                              placeholder="0"
                              className={`no-spin w-full pl-1.5 pr-7 py-1 text-xs font-mono font-bold rounded border outline-none focus:ring-1 ${fld(isEmptyNum(proc.hourlyRate))}`} />
                            <span className="absolute right-0.5 top-1 text-[8px] text-[#3A3028]">円/h</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-7 text-[9px] text-[#D6D0C8] bg-[#F7F6F2] rounded border border-[#EEEBE6]">—</div>
                        )}
                        {mode === 'standard' && (proc.hourlyRate || 0) > 0 && (
                          <div className="text-[8px] mt-0.5 font-mono text-[#B5451B]">
                            {((proc.hourlyRate || 0) / 60).toFixed(1)}円/分
                          </div>
                        )}
                        {isNew && oldProc && mode === 'standard' && (oldProc.hourlyRate || 0) > 0 && (
                          <div className="text-[8px] mt-0.5 font-mono flex items-center gap-1">
                            <span className="text-[#3A3028]">旧:{oldProc.hourlyRate?.toLocaleString()}</span>
                            {rateRatio !== null && rateRatio > 1.5 && (
                              <span className={`px-0.5 rounded font-black ${rateRatio > 3 ? 'bg-rose-100 text-rose-700' : rateRatio > 2 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-50 text-yellow-700'}`}>
                                ×{rateRatio.toFixed(1)}{rateRatio > 3 ? ' ⚠' : ''}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-1 px-1">
                        {mode === 'standard' ? (
                          <div className="relative">
                            <input type="number" value={proc.actualHourlyRate || ''}
                              onChange={(e) => updateProcessMeta(isNew, proc.index, 'actualHourlyRate', e.target.value)}
                              placeholder="実態"
                              className="no-spin w-full pl-1.5 pr-7 py-1 text-xs font-mono text-[#1E3A5F] rounded border border-[#C5D8EE] bg-[#EFF4FD]/30 outline-none focus:ring-1" />
                            <span className="absolute right-0.5 top-1 text-[8px] text-[#1E3A5F]">円/h</span>
                          </div>
                        ) : mode === 'kg' ? (
                          <div className="space-y-0.5">
                            <div className="relative">
                              <input type="number" value={proc.actualKgPrice ?? ''}
                                onChange={(e) => updateProcessMeta(isNew, proc.index, 'actualKgPrice', e.target.value)}
                                placeholder="実態"
                                className="w-full pl-1.5 pr-9 py-1 text-xs font-mono text-[#1E3A5F] rounded border border-[#C5D8EE] bg-[#EFF4FD]/30 outline-none focus:ring-1" />
                              <span className="absolute right-0.5 top-1 text-[8px] text-[#1E3A5F]">実/kg</span>
                            </div>
                          </div>
                        ) : mode === 'lump' ? (
                          <div className="space-y-0.5">
                            <div className="relative">
                              <input type="number" value={proc.actualLumpSumPrice ?? ''}
                                onChange={(e) => updateProcessMeta(isNew, proc.index, 'actualLumpSumPrice', e.target.value)}
                                placeholder="実態"
                                className="w-full pl-1.5 pr-9 py-1 text-xs font-mono text-[#1E3A5F] rounded border border-[#C5D8EE] bg-[#EFF4FD]/30 outline-none focus:ring-1" />
                              <span className="absolute right-0.5 top-1 text-[8px] text-[#1E3A5F]">実/lot</span>
                            </div>
                          </div>
                        ) : mode === 'direct' ? (
                          <div className="space-y-0.5">
                            <div className="relative">
                              <input type="number" value={proc.actualDirectProcessingCost ?? ''}
                                onChange={(e) => updateProcessMeta(isNew, proc.index, 'actualDirectProcessingCost', e.target.value)}
                                placeholder="実態"
                                className="w-full pl-1.5 pr-7 py-1 text-xs font-mono text-[#1E3A5F] rounded border border-[#C5D8EE] bg-[#EFF4FD]/30 outline-none focus:ring-1" />
                              <span className="absolute right-0.5 top-1 text-[8px] text-[#1E3A5F]">実/個</span>
                            </div>
                          </div>
                        ) : null}
                        {mode === 'standard' && (proc.actualHourlyRate || proc.hourlyRate || 0) > 0 && (
                          <div className="text-[8px] mt-0.5 font-mono text-[#1E3A5F]">
                            {(((proc.actualHourlyRate ?? proc.hourlyRate) || 0) / 60).toFixed(1)}円/分
                          </div>
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
                    {/* D: 変動理由メモ */}
                    {proc.processName.trim() && (
                      <tr className="bg-amber-50/40">
                        <td colSpan={8} className="px-2 pb-1.5 pt-0">
                          <input
                            type="text"
                            value={proc.changeReason || ''}
                            onChange={(e) => updateProcessMeta(isNew, proc.index, 'changeReason', e.target.value)}
                            placeholder="変動理由（任意）"
                            className="w-full px-2 py-0.5 text-[10px] text-[#6B6057] italic bg-amber-50/50 border border-amber-200/50 rounded outline-none focus:border-amber-300"
                          />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
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
              <span className="absolute right-2 top-1.5 text-[9px] text-[#3A3028] pointer-events-none">個/箱</span>
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
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#3A3028]">¥</span>
              <input type="number" value={est.logistics.freightPerBox || ''}
                onChange={(e) => updateLogisticsRates(isNew, 'freightPerBox', e.target.value)}
                placeholder="送料/箱"
                className={`${inp} pl-6 font-bold ${fld(isEmptyNum(est.logistics.freightPerBox))}`} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-[#18130F] shrink-0">実際運賃/箱</label>
            <div className="relative w-48 flex-none">
              <span className="absolute left-2.5 top-1.5 text-[10px] text-[#3A3028]">¥</span>
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

      </div>
    );
  };

  // ─── Waterfall removed ───────────────────────────────────────────────────────
  const renderDiffBar = () => null;

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 pb-16">

      {/* ── AI modal overlay ── */}
      {aiModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" style={{ pointerEvents: 'all' }}>
          <div className="bg-white rounded-xl shadow-2xl border border-[#D6D0C8] px-8 py-7 min-w-[280px] max-w-sm text-center">
            {aiModal.status === 'loading' ? (
              <>
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="w-6 h-6 border-[3px] border-[#B5451B]/30 border-t-[#B5451B] rounded-full animate-spin" />
                  <span className="font-black text-sm text-[#18130F]">{aiModal.label}</span>
                </div>
                {aiRetryCountdown !== null && (
                  <p className="text-[10px] text-[#3A3028] mt-1">{aiRetryCountdown}秒後に再試行します...</p>
                )}
                <p className="text-[10px] text-[#3A3028] mt-2">処理中は他の操作をお待ちください</p>
              </>
            ) : aiModal.status === 'success' ? (
              <>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                    <span className="text-emerald-700 text-lg font-black">✓</span>
                  </div>
                  <span className="font-black text-sm text-emerald-700">{aiModal.label} 完了</span>
                </div>
                {aiModal.message && <p className="text-xs text-[#6B6057] whitespace-pre-line">{aiModal.message}</p>}
              </>
            ) : (
              <>
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center">
                    <span className="text-rose-700 text-lg font-black">✗</span>
                  </div>
                  <span className="font-black text-sm text-rose-700">{aiModal.label} 失敗</span>
                </div>
                {aiModal.message && <p className="text-xs text-[#6B6057] whitespace-pre-line">{aiModal.message}</p>}
                <button
                  onClick={() => setAiModal(null)}
                  className="mt-4 px-5 py-1.5 bg-[#18130F] hover:bg-[#B5451B] text-white text-xs font-bold rounded cursor-pointer transition-colors"
                >
                  閉じる
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
                  <span className="text-[10px] text-[#3A3028]">
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


    </div>
  );
};
