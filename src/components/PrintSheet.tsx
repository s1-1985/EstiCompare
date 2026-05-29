import { useRef, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { Printer, Download } from 'lucide-react';
import { DetailedEstimate } from '../types';
import { calculateEstimate, CalculatedSection, rateFromCostSell } from '../utils/calculations';

interface PrintSheetProps {
  oldEstimate: DetailedEstimate;
  newEstimate: DetailedEstimate;
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString('ja-JP', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('ja-JP');
}

function getModeLabel(proc: import('../types').ProcessRow): string {
  const mode = proc.calcMode || (proc.isDirectInput ? 'direct' : proc.kgPrice > 0 ? 'kg' : 'standard');
  if (mode === 'kg') return 'kg単価';
  if (mode === 'lump') return '一式';
  if (mode === 'direct') return '直接入力';
  return '標準';
}

function getProcessCostDetail(proc: import('../types').ProcessRow): string {
  const mode = proc.calcMode || (proc.isDirectInput ? 'direct' : proc.kgPrice > 0 ? 'kg' : 'standard');
  if (mode === 'kg') return `${fmtInt(proc.kgPrice)}円/kg`;
  if (mode === 'lump') return `一式${fmtInt(proc.lumpSumPrice || 0)}円`;
  if (mode === 'direct') return `${fmt(proc.directProcessingCost)}円/個`;
  return `${fmtInt(proc.hourlyRate)}円/h`;
}

interface EstimateBlockProps {
  label: string;
  est: DetailedEstimate;
  calc: CalculatedSection;
  tag: 'old' | 'new';
}

function EstimateBlock({ label, est, calc, tag }: EstimateBlockProps) {
  const bgHeader = tag === 'old' ? '#2A4A7F' : '#1A6B3A';
  const bgHeaderLight = tag === 'old' ? '#EBF0FA' : '#E8F5EC';
  const borderColor = tag === 'old' ? '#2A4A7F' : '#1A6B3A';

  return (
    <div
      className="estimate-block"
      style={{
        border: `2px solid ${borderColor}`,
        borderRadius: 4,
        overflow: 'hidden',
        fontFamily: '"Noto Sans JP", "Meiryo", sans-serif',
        fontSize: 10,
        pageBreakInside: 'avoid',
      }}
    >
      {/* Block header */}
      <div style={{ background: bgHeader, color: 'white', padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', fontSize: 12 }}>御 見 積 書 【{label}】</span>
        <span style={{ fontSize: 10 }}>作成日: {est.date || '—'}</span>
      </div>

      {/* Part info row */}
      <div style={{ background: bgHeaderLight, padding: '4px 10px', display: 'flex', gap: 24, flexWrap: 'wrap', borderBottom: `1px solid ${borderColor}` }}>
        <span><strong>品番:</strong> {est.partNumber || '—'}</span>
        {est.partName && <span><strong>品名:</strong> {est.partName}</span>}
        <span><strong>見積基準数:</strong> {fmtInt(est.baseLotSize)} {est.lotUnit}</span>
        <span><strong>完成品重量:</strong> {fmtInt(est.finishedWeightG)} g</span>
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {/* Left: Material + Process */}
        <div style={{ flex: 1, minWidth: 0, borderRight: `1px solid #D0D0D0` }}>

          {/* Material */}
          <div style={{ padding: '4px 8px', borderBottom: '1px solid #D0D0D0' }}>
            <div style={{ fontWeight: 'bold', fontSize: 10, color: borderColor, marginBottom: 3, borderBottom: `1px solid ${borderColor}`, paddingBottom: 2 }}>
              ■ 材料
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <tbody>
                <tr>
                  <td style={{ color: '#555', paddingRight: 6, whiteSpace: 'nowrap' }}>材質・寸法:</td>
                  <td style={{ fontWeight: 'bold' }}>{est.material.materialName || '—'}</td>
                  <td style={{ color: '#555', paddingRight: 6, paddingLeft: 12, whiteSpace: 'nowrap' }}>投入重量:</td>
                  <td><strong>{fmtInt(est.material.inputWeightG)}</strong> g</td>
                  <td style={{ color: '#555', paddingRight: 6, paddingLeft: 12, whiteSpace: 'nowrap' }}>建値:</td>
                  <td><strong>{fmtInt(est.material.basePricePerKg)}</strong> 円/kg</td>
                </tr>
                <tr>
                  <td style={{ color: '#555', paddingRight: 6, whiteSpace: 'nowrap' }}>スクラップ重量:</td>
                  <td>{fmtInt(est.material.scrapWeightG)} g</td>
                  <td style={{ color: '#555', paddingRight: 6, paddingLeft: 12, whiteSpace: 'nowrap' }}>スクラップ単価:</td>
                  <td>{fmtInt(est.material.scrapPricePerKg)} 円/kg</td>
                  <td style={{ color: '#555', paddingRight: 6, paddingLeft: 12, whiteSpace: 'nowrap' }}>スクラップ控除:</td>
                  <td>▲ ¥{fmt(calc.scrapValue)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 3, textAlign: 'right', fontWeight: 'bold', color: borderColor }}>
              材料費/個: ¥{fmt(calc.netMaterialCost)}
            </div>
          </div>

          {/* Processes */}
          <div style={{ padding: '4px 8px' }}>
            <div style={{ fontWeight: 'bold', fontSize: 10, color: borderColor, marginBottom: 3, borderBottom: `1px solid ${borderColor}`, paddingBottom: 2 }}>
              ■ 加工工程
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
              <thead>
                <tr style={{ background: bgHeaderLight }}>
                  <th style={{ border: '1px solid #CCC', padding: '2px 4px', textAlign: 'center', width: 20 }}>No</th>
                  <th style={{ border: '1px solid #CCC', padding: '2px 4px', textAlign: 'left' }}>工程名</th>
                  <th style={{ border: '1px solid #CCC', padding: '2px 4px', textAlign: 'left' }}>作業内容</th>
                  <th style={{ border: '1px solid #CCC', padding: '2px 4px', textAlign: 'center' }}>計算方式</th>
                  <th style={{ border: '1px solid #CCC', padding: '2px 4px', textAlign: 'right' }}>単価</th>
                  <th style={{ border: '1px solid #CCC', padding: '2px 4px', textAlign: 'right' }}>加工費/個</th>
                </tr>
              </thead>
              <tbody>
                {est.processes.filter(p => p.processName.trim()).map((proc, i) => (
                  <Fragment key={i}>
                    <tr style={{ background: i % 2 === 0 ? 'white' : '#F9F9F9' }}>
                      <td style={{ border: '1px solid #CCC', padding: '2px 4px', textAlign: 'center' }}>{proc.index}</td>
                      <td style={{ border: '1px solid #CCC', padding: '2px 4px' }}>{proc.processName}</td>
                      <td style={{ border: '1px solid #CCC', padding: '2px 4px', color: '#555' }}>{proc.workContent || '—'}</td>
                      <td style={{ border: '1px solid #CCC', padding: '2px 4px', textAlign: 'center' }}>{getModeLabel(proc)}</td>
                      <td style={{ border: '1px solid #CCC', padding: '2px 4px', textAlign: 'right' }}>{getProcessCostDetail(proc)}</td>
                      <td style={{ border: '1px solid #CCC', padding: '2px 4px', textAlign: 'right', fontWeight: 'bold' }}>¥{fmt(calc.processCosts[proc.index - 1] ?? 0)}</td>
                    </tr>
                    {proc.changeReason?.trim() && (
                      <tr style={{ background: '#FFFDF0' }}>
                        <td colSpan={6} style={{ border: '1px solid #CCC', padding: '1px 8px', color: '#8B6914', fontSize: 9, fontStyle: 'italic' }}>
                          └ 変動理由: {proc.changeReason}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {est.processes.filter(p => p.processName.trim()).length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ border: '1px solid #CCC', padding: '4px', textAlign: 'center', color: '#999' }}>工程なし</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Cost summary */}
        <div style={{ width: 180, flexShrink: 0, padding: '6px 8px', fontSize: 10 }}>
          <div style={{ fontWeight: 'bold', fontSize: 10, color: borderColor, marginBottom: 4, borderBottom: `1px solid ${borderColor}`, paddingBottom: 2 }}>
            ■ 費用内訳
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <tbody>
              <tr>
                <td style={{ color: '#555', padding: '2px 0' }}>直接材料費</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '2px 0' }}>¥{fmt(calc.netMaterialCost)}</td>
              </tr>
              {calc.processCosts.map((cost, i) => {
                const proc = est.processes[i];
                if (!proc || !proc.processName.trim()) return null;
                return (
                  <tr key={i}>
                    <td style={{ color: '#555', padding: '1px 0', fontSize: 9 }}>　{proc.processName}</td>
                    <td style={{ textAlign: 'right', padding: '1px 0', fontSize: 9 }}>¥{fmt(cost)}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '1px solid #CCC' }}>
                <td style={{ color: '#555', padding: '2px 0' }}>加工費合計</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '2px 0' }}>¥{fmt(calc.totalProcessCost)}</td>
              </tr>
              <tr style={{ borderTop: '2px solid #999' }}>
                <td style={{ padding: '2px 0' }}>直製造原価</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '2px 0' }}>¥{fmt(calc.primeCost)}</td>
              </tr>
              <tr>
                <td style={{ color: '#555', padding: '2px 0' }}>利管費 ({est.adjustments.sgaRatePercent}%)</td>
                <td style={{ textAlign: 'right', padding: '2px 0' }}>¥{fmt(calc.sgaCost)}</td>
              </tr>
              <tr>
                <td style={{ color: '#555', padding: '2px 0' }}>送料/個</td>
                <td style={{ textAlign: 'right', padding: '2px 0' }}>¥{fmt(calc.shippingCostPerUnit)}</td>
              </tr>
              {est.adjustments.otherAdjustment !== 0 && (
                <tr>
                  <td style={{ color: '#555', padding: '2px 0' }}>その他調整</td>
                  <td style={{ textAlign: 'right', padding: '2px 0' }}>¥{fmt(est.adjustments.otherAdjustment)}</td>
                </tr>
              )}
              <tr style={{ borderTop: '2px solid ' + borderColor, background: bgHeaderLight }}>
                <td style={{ fontWeight: 'bold', padding: '3px 0', color: borderColor }}>御見積単価</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 13, padding: '3px 0', color: borderColor }}>
                  ¥{fmt(calc.grandTotalUnitPrice)}
                </td>
              </tr>
              {est.adjustments.toolingCost > 0 && (
                <tr style={{ borderTop: '1px dashed #AAA' }}>
                  <td style={{ color: '#555', padding: '2px 0', fontSize: 9 }}>型費（別途）</td>
                  <td style={{ textAlign: 'right', padding: '2px 0', fontSize: 9 }}>¥{fmtInt(est.adjustments.toolingCost)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Margin info */}
          <div style={{ marginTop: 8, borderTop: '1px solid #E0E0E0', paddingTop: 4 }}>
            <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>【社内参考】</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
              <tbody>
                <tr>
                  <td style={{ color: '#777' }}>実原価</td>
                  <td style={{ textAlign: 'right' }}>¥{fmt(calc.actualTotalCost)}</td>
                </tr>
                <tr>
                  <td style={{ color: '#777' }}>目標売価</td>
                  <td style={{ textAlign: 'right' }}>¥{fmt(calc.requiredSellingPrice)}</td>
                </tr>
                <tr>
                  <td style={{ color: '#777' }}>実利益率(外)</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: calc.actualProfitRate >= 0 ? '#1A6B3A' : '#B5451B' }}>
                    {fmt(calc.actualProfitRate)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildChecklist(oldEstimate: DetailedEstimate, newEstimate: DetailedEstimate, oldCalc: CalculatedSection, newCalc: CalculatedSection) {
  const oldPurchase = oldEstimate.adjustments.actualPurchasePrice > 0
    ? oldEstimate.adjustments.actualPurchasePrice : oldCalc.grandTotalUnitPrice;
  const oldSell = oldEstimate.adjustments.targetUnitPrice || 0;
  const oldMarkup = (oldSell > 0 && oldPurchase > 0) ? rateFromCostSell(oldPurchase, oldSell, 'markup') : null; // 外掛け

  const newPurchase = newEstimate.adjustments.actualPurchasePrice > 0
    ? newEstimate.adjustments.actualPurchasePrice : newCalc.grandTotalUnitPrice;
  const newSell = newEstimate.adjustments.targetUnitPrice || 0;
  const newMarkup = (newSell > 0 && newPurchase > 0) ? rateFromCostSell(newPurchase, newSell, 'markup') : null; // 外掛け

  const oldMarginOff = oldEstimate.adjustments.targetProfitMarginOff || 0;
  const newMarginOff = newEstimate.adjustments.targetProfitMarginOff || 0;

  const hasChangeReason =
    !!newEstimate.material.changeReason?.trim() ||
    !!oldEstimate.material.changeReason?.trim() ||
    newEstimate.processes.some(p => p.processName.trim() && p.changeReason?.trim()) ||
    oldEstimate.processes.some(p => p.processName.trim() && p.changeReason?.trim());

  return [
    {
      label: '旧単価: 社内外掛け ≥ 25%',
      ok: oldMarkup !== null && oldMarkup >= 25,
      na: oldMarkup === null,
      detail: oldMarkup !== null ? `${oldMarkup.toFixed(2)}%` : 'データ不足',
    },
    {
      label: '新単価: 社内外掛け ≥ 25%',
      ok: newMarkup !== null && newMarkup >= 25,
      na: newMarkup === null,
      detail: newMarkup !== null ? `${newMarkup.toFixed(2)}%` : 'データ不足',
    },
    {
      label: '旧単価: 客先内掛け ≤ 15%',
      ok: oldMarginOff > 0 && oldMarginOff <= 15,
      na: oldMarginOff === 0,
      detail: oldMarginOff > 0 ? `${oldMarginOff}%` : '未設定',
    },
    {
      label: '新単価: 客先内掛け ≤ 15%',
      ok: newMarginOff > 0 && newMarginOff <= 15,
      na: newMarginOff === 0,
      detail: newMarginOff > 0 ? `${newMarginOff}%` : '未設定',
    },
    {
      label: '変動理由の記載（工程/材料）',
      ok: hasChangeReason,
      na: false,
      detail: hasChangeReason ? '記載あり' : '未記載',
    },
  ];
}

export function PrintSheet({ oldEstimate, newEstimate }: PrintSheetProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const oldCalc = calculateEstimate(oldEstimate);
  const newCalc = calculateEstimate(newEstimate);

  const handlePrint = () => {
    window.print();
  };

  const handleExcelDownload = () => {
    const wb = XLSX.utils.book_new();

    function estimateToRows(label: string, est: DetailedEstimate, calc: CalculatedSection): (string | number)[][] {
      const rows: (string | number)[][] = [];
      rows.push([`御見積書【${label}】`]);
      rows.push(['品番', est.partNumber, '品名', est.partName || '', '見積基準数', est.baseLotSize, est.lotUnit, '完成品重量(g)', est.finishedWeightG]);
      rows.push(['作成日', est.date || '']);
      rows.push([]);

      rows.push(['■ 材料']);
      rows.push(['材質・寸法', '投入重量(g)', '建値(円/kg)', '実際建値(円/kg)', 'スクラップ重量(g)', 'スクラップ単価(円/kg)', 'スクラップ控除(円)', '材料費/個(円)']);
      rows.push([
        est.material.materialName,
        est.material.inputWeightG,
        est.material.basePricePerKg,
        est.material.actualBasePricePerKg ?? '',
        est.material.scrapWeightG,
        est.material.scrapPricePerKg,
        -calc.scrapValue,
        calc.netMaterialCost,
      ]);
      rows.push([]);

      rows.push(['■ 加工工程']);
      rows.push(['No', '工程名', '作業内容', '計算方式', '賃率(円/h)', '出来高(個/h)', '段取時間(h)', 'kg単価(円/kg)', '一式金額(円)', '直接加工費(円)', '加工費/個(円)']);
      est.processes.filter(p => p.processName.trim()).forEach((proc) => {
        const mode = proc.calcMode || (proc.isDirectInput ? 'direct' : proc.kgPrice > 0 ? 'kg' : 'standard');
        rows.push([
          proc.index,
          proc.processName,
          proc.workContent || '',
          getModeLabel(proc),
          mode === 'standard' ? proc.hourlyRate : '',
          mode === 'standard' ? proc.yieldPerHour : '',
          mode === 'standard' ? proc.totalHours : '',
          mode === 'kg' ? proc.kgPrice : '',
          mode === 'lump' ? (proc.lumpSumPrice ?? '') : '',
          mode === 'direct' ? proc.directProcessingCost : '',
          calc.processCosts[proc.index - 1] ?? 0,
        ]);
      });
      rows.push([]);

      rows.push(['■ 費用内訳']);
      rows.push(['項目', '金額(円)']);
      rows.push(['直接材料費', calc.netMaterialCost]);
      rows.push(['加工費合計', calc.totalProcessCost]);
      rows.push(['直製造原価小計', calc.primeCost]);
      rows.push([`利管費 (${est.adjustments.sgaRatePercent}%)`, calc.sgaCost]);
      rows.push(['送料/個', calc.shippingCostPerUnit]);
      if (est.adjustments.otherAdjustment !== 0) {
        rows.push(['その他調整', est.adjustments.otherAdjustment]);
      }
      rows.push(['御見積単価', calc.grandTotalUnitPrice]);
      if (est.adjustments.toolingCost > 0) {
        rows.push(['型費（別途）', est.adjustments.toolingCost]);
      }
      rows.push([]);
      rows.push(['■ 社内参考']);
      rows.push(['実仕入原価', calc.actualTotalCost]);
      rows.push(['目標売価(外掛け)', calc.requiredSellingPrice]);
      rows.push(['下限売価(外掛け)', calc.minRequiredSellingPrice]);
      rows.push(['実利益率(外掛け%)', calc.actualProfitRate]);
      rows.push(['辻褄差異', calc.auditVariance]);
      rows.push([]);

      return rows;
    }

    const oldRows = estimateToRows('旧単価', oldEstimate, oldCalc);
    const newRows = estimateToRows('新単価', newEstimate, newCalc);

    // Sheet: combined old+new
    const combinedRows = [
      ...oldRows,
      ['─────────────────────────────────────────────────────────────────────'],
      ...newRows,
    ];
    const wsCombined = XLSX.utils.aoa_to_sheet(combinedRows);
    wsCombined['!cols'] = [
      { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 14 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, wsCombined, '新旧見積書');

    // Sheet: old only
    const wsOld = XLSX.utils.aoa_to_sheet(estimateToRows('旧単価', oldEstimate, oldCalc));
    wsOld['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsOld, '旧単価明細');

    // Sheet: new only
    const wsNew = XLSX.utils.aoa_to_sheet(estimateToRows('新単価', newEstimate, newCalc));
    wsNew['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsNew, '新単価明細');

    // Sheet: comparison summary
    const diffUnitPrice = newCalc.grandTotalUnitPrice - oldCalc.grandTotalUnitPrice;
    const diffPct = oldCalc.grandTotalUnitPrice > 0
      ? (diffUnitPrice / oldCalc.grandTotalUnitPrice) * 100 : 0;

    const summaryRows: (string | number)[][] = [
      ['新旧単価比較サマリー'],
      [],
      ['項目', '旧単価', '新単価', '差額', '変化率(%)'],
      ['御見積単価', oldCalc.grandTotalUnitPrice, newCalc.grandTotalUnitPrice, diffUnitPrice, diffPct],
      ['材料費/個', oldCalc.netMaterialCost, newCalc.netMaterialCost, newCalc.netMaterialCost - oldCalc.netMaterialCost, oldCalc.netMaterialCost > 0 ? ((newCalc.netMaterialCost - oldCalc.netMaterialCost) / oldCalc.netMaterialCost) * 100 : 0],
      ['加工費合計', oldCalc.totalProcessCost, newCalc.totalProcessCost, newCalc.totalProcessCost - oldCalc.totalProcessCost, oldCalc.totalProcessCost > 0 ? ((newCalc.totalProcessCost - oldCalc.totalProcessCost) / oldCalc.totalProcessCost) * 100 : 0],
      ['直製造原価', oldCalc.primeCost, newCalc.primeCost, newCalc.primeCost - oldCalc.primeCost, oldCalc.primeCost > 0 ? ((newCalc.primeCost - oldCalc.primeCost) / oldCalc.primeCost) * 100 : 0],
      ['利管費', oldCalc.sgaCost, newCalc.sgaCost, newCalc.sgaCost - oldCalc.sgaCost, oldCalc.sgaCost > 0 ? ((newCalc.sgaCost - oldCalc.sgaCost) / oldCalc.sgaCost) * 100 : 0],
      ['送料/個', oldCalc.shippingCostPerUnit, newCalc.shippingCostPerUnit, newCalc.shippingCostPerUnit - oldCalc.shippingCostPerUnit, oldCalc.shippingCostPerUnit > 0 ? ((newCalc.shippingCostPerUnit - oldCalc.shippingCostPerUnit) / oldCalc.shippingCostPerUnit) * 100 : 0],
      ['実原価合計', oldCalc.actualTotalCost, newCalc.actualTotalCost, newCalc.actualTotalCost - oldCalc.actualTotalCost, oldCalc.actualTotalCost > 0 ? ((newCalc.actualTotalCost - oldCalc.actualTotalCost) / oldCalc.actualTotalCost) * 100 : 0],
      ['実利益率(外%)', oldCalc.actualProfitRate, newCalc.actualProfitRate, newCalc.actualProfitRate - oldCalc.actualProfitRate, ''],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, '新旧比較サマリー');

    const partNo = newEstimate.partNumber || oldEstimate.partNumber || '見積書';
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    XLSX.writeFile(wb, `${partNo}_新旧見積比較_${today}.xlsx`);
  };

  return (
    <div className="min-h-full">
      {/* Print controls - hidden in print */}
      <div className="no-print mb-4 flex items-center gap-3 p-3 bg-white border border-[#D6D0C8] rounded">
        <div className="text-sm font-bold text-[#18130F]">Sheet3: 見積書 印刷・出力</div>
        <div className="flex-1" />
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-[#2A4A7F] hover:bg-[#1E3560] text-white text-sm font-bold rounded cursor-pointer transition-colors"
        >
          <Printer className="w-4 h-4" />
          印刷 (A4縦)
        </button>
        <button
          onClick={handleExcelDownload}
          className="flex items-center gap-2 px-4 py-2 bg-[#1A6B3A] hover:bg-[#145730] text-white text-sm font-bold rounded cursor-pointer transition-colors"
        >
          <Download className="w-4 h-4" />
          Excelダウンロード
        </button>
      </div>

      {/* A4 print area */}
      <div
        ref={printRef}
        id="print-area"
        className="print-area bg-white"
        style={{
          width: '210mm',
          minHeight: '297mm',
          margin: '0 auto',
          padding: '10mm 12mm',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '8mm',
          boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
        }}
      >
        {/* Page title */}
        <div className="no-print" style={{ textAlign: 'center', fontSize: 11, color: '#666', marginBottom: 2 }}>
          ▼ A4縦 プレビュー（上半分: 旧単価 / 下半分: 新単価）
        </div>

        {/* Old estimate — top half */}
        <div style={{ flex: 1 }}>
          <EstimateBlock label="旧単価" est={oldEstimate} calc={oldCalc} tag="old" />
        </div>

        {/* Separator */}
        <div style={{ borderTop: '2px dashed #CCC', margin: '2mm 0', position: 'relative' }}>
          <span
            className="no-print"
            style={{
              position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)',
              background: '#F7F6F2', padding: '0 8px', fontSize: 10, color: '#999'
            }}
          >
            ─── 切り取り線 / 改ページ ───
          </span>
        </div>

        {/* New estimate — bottom half */}
        <div style={{ flex: 1 }}>
          <EstimateBlock label="新単価" est={newEstimate} calc={newCalc} tag="new" />
        </div>

        {/* E: 客先提出前チェックリスト */}
        {(() => {
          const checks = buildChecklist(oldEstimate, newEstimate, oldCalc, newCalc);
          const allOk = checks.filter(c => !c.na).every(c => c.ok);
          return (
            <div style={{ border: `2px solid ${allOk ? '#1A6B3A' : '#B5451B'}`, borderRadius: 4, overflow: 'hidden', fontFamily: '"Noto Sans JP", "Meiryo", sans-serif', fontSize: 10 }}>
              <div style={{ background: allOk ? '#1A6B3A' : '#B5451B', color: 'white', padding: '4px 10px', fontWeight: 'bold', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{allOk ? '✓' : '⚠'}</span>
                <span>客先提出前チェックリスト</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 'normal', opacity: 0.8 }}>
                  {checks.filter(c => !c.na && c.ok).length}/{checks.filter(c => !c.na).length} 項目クリア
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                <tbody>
                  {checks.map((chk, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #EEEEEE', background: chk.na ? '#F9F9F9' : chk.ok ? '#F0FAF4' : '#FEF0EB' }}>
                      <td style={{ padding: '3px 8px', width: 22, textAlign: 'center', fontSize: 12 }}>
                        {chk.na ? '—' : chk.ok ? '✅' : '❌'}
                      </td>
                      <td style={{ padding: '3px 6px', fontWeight: chk.ok || chk.na ? 'normal' : 'bold', color: chk.na ? '#999' : chk.ok ? '#1A6B3A' : '#B5451B' }}>
                        {chk.label}
                      </td>
                      <td style={{ padding: '3px 8px', textAlign: 'right', fontFamily: 'monospace', color: chk.na ? '#999' : chk.ok ? '#1A6B3A' : '#B5451B' }}>
                        {chk.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 10mm;
          }
          body * {
            visibility: hidden;
          }
          #print-area,
          #print-area * {
            visibility: visible;
          }
          #print-area {
            position: fixed;
            top: 0;
            left: 0;
            width: 190mm;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }
          .no-print {
            display: none !important;
          }
          .estimate-block {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
