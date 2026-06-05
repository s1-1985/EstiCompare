import { useRef, useState, Fragment, type CSSProperties } from 'react';
import { Printer, Download } from 'lucide-react';
import { DetailedEstimate } from '../types';
import { calculateEstimate, CalculatedSection } from '../utils/calculations';

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
  // 標準工程は賃率(円/h)ではなく分単価(円/分)を見積書に記載する
  return `${fmt(proc.hourlyRate / 60, 1)}円/分`;
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
  const named = est.processes.filter(p => p.processName.trim());

  const sectionTitle: CSSProperties = { fontWeight: 'bold', fontSize: 13, color: borderColor, marginBottom: 5, borderBottom: `1.5px solid ${borderColor}`, paddingBottom: 3 };
  const th: CSSProperties = { border: '1px solid #BBB', padding: '5px 6px', fontWeight: 'bold', whiteSpace: 'nowrap' };
  const td: CSSProperties = { border: '1px solid #DDD', padding: '5px 6px', wordBreak: 'break-word' };

  return (
    <div
      className="estimate-block"
      style={{
        border: `2px solid ${borderColor}`,
        borderRadius: 4,
        overflow: 'hidden',
        fontFamily: '"Noto Sans JP", "Meiryo", sans-serif',
        fontSize: 12,
        boxSizing: 'border-box',
        width: '100%',
        pageBreakInside: 'avoid',
      }}
    >
      {/* Block header */}
      <div style={{ background: bgHeader, color: 'white', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', fontSize: 17, letterSpacing: 2 }}>御 見 積 書 【{label}】</span>
        <span style={{ fontSize: 11 }}>作成日: {est.date || '—'}</span>
      </div>

      {/* Part info row — full-width grid */}
      <div style={{ background: bgHeaderLight, padding: '7px 14px', borderBottom: `1px solid ${borderColor}`, display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 1fr 1fr', gap: '3px 16px', fontSize: 12.5 }}>
        <span><strong>品番:</strong> {est.partNumber || '—'}</span>
        <span><strong>品名:</strong> {est.partName || '—'}</span>
        <span><strong>見積基準数:</strong> {fmtInt(est.baseLotSize)} {est.lotUnit}</span>
        <span><strong>完成品重量:</strong> {fmtInt(est.finishedWeightG)} g</span>
      </div>

      <div style={{ display: 'flex', boxSizing: 'border-box' }}>
        {/* Left: Material + Process */}
        <div style={{ flex: 1, minWidth: 0, borderRight: `1px solid #D0D0D0`, boxSizing: 'border-box' }}>

          {/* Material */}
          <div style={{ padding: '7px 12px', borderBottom: '1px solid #D0D0D0' }}>
            <div style={sectionTitle}>■ 材料</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                <tr>
                  <td style={{ color: '#555', paddingRight: 6, whiteSpace: 'nowrap' }}>材質・寸法:</td>
                  <td style={{ fontWeight: 'bold' }}>{est.material.materialName || '—'}</td>
                  <td style={{ color: '#555', padding: '0 6px 0 14px', whiteSpace: 'nowrap' }}>投入重量:</td>
                  <td><strong>{fmtInt(est.material.inputWeightG)}</strong> g</td>
                  <td style={{ color: '#555', padding: '0 6px 0 14px', whiteSpace: 'nowrap' }}>建値:</td>
                  <td><strong>{fmtInt(est.material.basePricePerKg)}</strong> 円/kg</td>
                </tr>
                {/* スクラップ控除が0（スクラップ無し）の場合は見積書に記載しない */}
                {calc.scrapValue > 0 && (
                  <tr>
                    <td style={{ color: '#555', paddingRight: 6, whiteSpace: 'nowrap' }}>スクラップ重量:</td>
                    <td>{fmtInt(est.material.scrapWeightG)} g</td>
                    <td style={{ color: '#555', padding: '0 6px 0 14px', whiteSpace: 'nowrap' }}>スクラップ単価:</td>
                    <td>{fmtInt(est.material.scrapPricePerKg)} 円/kg</td>
                    <td style={{ color: '#555', padding: '0 6px 0 14px', whiteSpace: 'nowrap' }}>スクラップ控除:</td>
                    <td>▲ ¥{fmt(calc.scrapValue)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 5, textAlign: 'right', fontWeight: 'bold', fontSize: 13, color: borderColor }}>
              材料費/個: ¥{fmt(calc.netMaterialCost)}
            </div>
          </div>

          {/* Processes */}
          <div style={{ padding: '7px 12px' }}>
            <div style={sectionTitle}>■ 加工工程</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: bgHeaderLight }}>
                  <th style={{ ...th, textAlign: 'center', width: '7%' }}>No</th>
                  <th style={{ ...th, textAlign: 'left', width: '30%' }}>工程名</th>
                  <th style={{ ...th, textAlign: 'left', width: '31%' }}>作業内容</th>
                  <th style={{ ...th, textAlign: 'right', width: '15%' }}>単価</th>
                  <th style={{ ...th, textAlign: 'right', width: '17%' }}>加工費/個</th>
                </tr>
              </thead>
              <tbody>
                {named.map((proc, i) => (
                  <Fragment key={i}>
                    <tr style={{ background: i % 2 === 0 ? 'white' : '#F9F9F9' }}>
                      <td style={{ ...td, textAlign: 'center' }}>{proc.index}</td>
                      <td style={{ ...td, fontWeight: 'bold' }}>{proc.processName}</td>
                      <td style={{ ...td, color: '#555' }}>{proc.workContent || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{getProcessCostDetail(proc)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 'bold' }}>¥{fmt(calc.processCosts[proc.index - 1] ?? 0)}</td>
                    </tr>
                    {proc.changeReason?.trim() && (
                      <tr style={{ background: '#FFFDF0' }}>
                        <td colSpan={5} style={{ ...td, color: '#8B6914', fontStyle: 'italic', fontSize: 10.5 }}>
                          └ 変動理由: {proc.changeReason}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {named.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...td, textAlign: 'center', color: '#999' }}>工程なし</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Cost summary */}
        <div style={{ width: '33%', flexShrink: 0, padding: '8px 12px', fontSize: 12, boxSizing: 'border-box' }}>
          <div style={sectionTitle}>■ 費用内訳</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              <tr>
                <td style={{ color: '#555', padding: '3px 0' }}>直接材料費</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '3px 0' }}>¥{fmt(calc.netMaterialCost)}</td>
              </tr>
              {calc.processCosts.map((cost, i) => {
                const proc = est.processes[i];
                if (!proc || !proc.processName.trim()) return null;
                return (
                  <tr key={i}>
                    <td style={{ color: '#555', padding: '2px 0', fontSize: 11 }}>　{proc.processName}</td>
                    <td style={{ textAlign: 'right', padding: '2px 0', fontSize: 11 }}>¥{fmt(cost)}</td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: '1px solid #CCC' }}>
                <td style={{ color: '#555', padding: '3px 0' }}>加工費合計</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '3px 0' }}>¥{fmt(calc.totalProcessCost)}</td>
              </tr>
              <tr style={{ borderTop: '2px solid #999' }}>
                <td style={{ padding: '3px 0', fontWeight: 'bold' }}>直製造原価</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '3px 0' }}>¥{fmt(calc.primeCost)}</td>
              </tr>
              <tr>
                {/* 見積書上の利管費率は「利管費 ÷ 直製造原価」(内掛け実効率) で表示。
                    内部が外掛け方式でも、客が金額÷原価で逆算した値と一致させ整合性を保つ。 */}
                <td style={{ color: '#555', padding: '3px 0' }}>利管費 ({(calc.primeCost > 0 ? (calc.sgaCost / calc.primeCost) * 100 : (est.adjustments.sgaRatePercent || 0)).toFixed(1)}%)</td>
                <td style={{ textAlign: 'right', padding: '3px 0' }}>¥{fmt(calc.sgaCost)}</td>
              </tr>
              <tr>
                <td style={{ color: '#555', padding: '3px 0' }}>送料/個</td>
                <td style={{ textAlign: 'right', padding: '3px 0' }}>¥{fmt(calc.shippingCostPerUnit)}</td>
              </tr>
              {est.adjustments.otherAdjustment !== 0 && (
                <tr>
                  <td style={{ color: '#555', padding: '3px 0' }}>その他調整</td>
                  <td style={{ textAlign: 'right', padding: '3px 0' }}>¥{fmt(est.adjustments.otherAdjustment)}</td>
                </tr>
              )}
              <tr style={{ borderTop: '2px solid ' + borderColor, background: bgHeaderLight }}>
                <td style={{ fontWeight: 'bold', padding: '5px 4px', color: borderColor, fontSize: 13 }}>御見積単価</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: 16, padding: '5px 4px', color: borderColor }}>
                  ¥{fmt(calc.grandTotalUnitPrice)}
                </td>
              </tr>
              {est.adjustments.toolingCost > 0 && (
                <tr style={{ borderTop: '1px dashed #AAA' }}>
                  <td style={{ color: '#555', padding: '3px 0', fontSize: 11 }}>型費（別途）</td>
                  <td style={{ textAlign: 'right', padding: '3px 0', fontSize: 11 }}>¥{fmtInt(est.adjustments.toolingCost)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PrintSheet({ oldEstimate, newEstimate }: PrintSheetProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const oldCalc = calculateEstimate(oldEstimate);
  const newCalc = calculateEstimate(newEstimate);

  const handlePrint = () => {
    window.print();
  };

  const handleExcelDownload = async () => {
    if (isExporting) return; // 連打・多重実行を防止
    setIsExporting(true);
    try {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // 表示は小数点第2位まで（Excel セルへの書き込み前に丸める）
    const r2 = (n: number) => Math.round(n * 100) / 100;

    function estimateToRows(label: string, est: DetailedEstimate, calc: CalculatedSection): (string | number)[][] {
      const rows: (string | number)[][] = [];
      rows.push([`御見積書【${label}】`]);
      rows.push(['品番', est.partNumber, '品名', est.partName || '', '見積基準数', est.baseLotSize, est.lotUnit, '完成品重量(g)', est.finishedWeightG]);
      rows.push(['作成日', est.date || '']);
      rows.push([]);

      rows.push(['■ 材料']);
      rows.push(['材質・寸法', '投入重量(g)', '建値(円/kg)', '実際建値(円/kg)', 'スクラップ重量(g)', 'スクラップ単価(円/kg)', 'スクラップ控除(円)', '材料費/個(円)', '変動理由']);
      rows.push([
        est.material.materialName,
        est.material.inputWeightG,
        est.material.basePricePerKg,
        est.material.actualBasePricePerKg ?? '',
        est.material.scrapWeightG,
        est.material.scrapPricePerKg,
        r2(-calc.scrapValue),
        r2(calc.netMaterialCost),
        est.material.changeReason || '',
      ]);
      rows.push([]);

      rows.push(['■ 加工工程']);
      rows.push(['No', '工程名', '作業内容', '計算方式', '賃率(円/h)', '出来高(個/h)', '段取時間(h)', 'kg単価(円/kg)', '一式金額(円)', '直接加工費(円)', '加工費/個(円)', '変動理由']);
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
          r2(calc.processCosts[proc.index - 1] ?? 0),
          proc.changeReason || '',
        ]);
      });
      rows.push([]);

      rows.push(['■ 費用内訳']);
      rows.push(['項目', '金額(円)']);
      rows.push(['直接材料費', r2(calc.netMaterialCost)]);
      rows.push(['加工費合計', r2(calc.totalProcessCost)]);
      rows.push(['直製造原価小計', r2(calc.primeCost)]);
      rows.push([`利管費 (${(calc.primeCost > 0 ? (calc.sgaCost / calc.primeCost) * 100 : (est.adjustments.sgaRatePercent || 0)).toFixed(1)}%)`, r2(calc.sgaCost)]);
      rows.push(['送料/個', r2(calc.shippingCostPerUnit)]);
      if (est.adjustments.otherAdjustment !== 0) {
        rows.push(['その他調整', r2(est.adjustments.otherAdjustment)]);
      }
      rows.push(['御見積単価', r2(calc.grandTotalUnitPrice)]);
      if (est.adjustments.toolingCost > 0) {
        rows.push(['型費（別途）', r2(est.adjustments.toolingCost)]);
      }
      rows.push([]);
      rows.push(['■ 社内参考']);
      rows.push(['実仕入原価', r2(calc.actualTotalCost)]);
      rows.push(['目標売価(外掛け)', r2(calc.requiredSellingPrice)]);
      rows.push(['下限売価(外掛け)', r2(calc.minRequiredSellingPrice)]);
      rows.push(['実利益率(外掛け%)', r2(calc.actualProfitRate)]);
      rows.push(['辻褄差異', r2(calc.auditVariance)]);
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
      { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, wsCombined, '新旧見積書');

    // Sheet: old only
    const wsOld = XLSX.utils.aoa_to_sheet(estimateToRows('旧単価', oldEstimate, oldCalc));
    wsOld['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsOld, '旧単価明細');

    // Sheet: new only
    const wsNew = XLSX.utils.aoa_to_sheet(estimateToRows('新単価', newEstimate, newCalc));
    wsNew['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsNew, '新単価明細');

    // Sheet: comparison summary
    const diffUnitPrice = newCalc.grandTotalUnitPrice - oldCalc.grandTotalUnitPrice;
    const diffPct = oldCalc.grandTotalUnitPrice > 0
      ? (diffUnitPrice / oldCalc.grandTotalUnitPrice) * 100 : 0;

    const summaryRows: (string | number)[][] = [
      ['新旧単価比較サマリー'],
      [],
      ['項目', '旧単価', '新単価', '差額', '変化率(%)'],
      ['御見積単価', r2(oldCalc.grandTotalUnitPrice), r2(newCalc.grandTotalUnitPrice), r2(diffUnitPrice), r2(diffPct)],
      ['材料費/個', r2(oldCalc.netMaterialCost), r2(newCalc.netMaterialCost), r2(newCalc.netMaterialCost - oldCalc.netMaterialCost), r2(oldCalc.netMaterialCost > 0 ? ((newCalc.netMaterialCost - oldCalc.netMaterialCost) / oldCalc.netMaterialCost) * 100 : 0)],
      ['加工費合計', r2(oldCalc.totalProcessCost), r2(newCalc.totalProcessCost), r2(newCalc.totalProcessCost - oldCalc.totalProcessCost), r2(oldCalc.totalProcessCost > 0 ? ((newCalc.totalProcessCost - oldCalc.totalProcessCost) / oldCalc.totalProcessCost) * 100 : 0)],
      ['直製造原価', r2(oldCalc.primeCost), r2(newCalc.primeCost), r2(newCalc.primeCost - oldCalc.primeCost), r2(oldCalc.primeCost > 0 ? ((newCalc.primeCost - oldCalc.primeCost) / oldCalc.primeCost) * 100 : 0)],
      ['利管費', r2(oldCalc.sgaCost), r2(newCalc.sgaCost), r2(newCalc.sgaCost - oldCalc.sgaCost), r2(oldCalc.sgaCost > 0 ? ((newCalc.sgaCost - oldCalc.sgaCost) / oldCalc.sgaCost) * 100 : 0)],
      ['送料/個', r2(oldCalc.shippingCostPerUnit), r2(newCalc.shippingCostPerUnit), r2(newCalc.shippingCostPerUnit - oldCalc.shippingCostPerUnit), r2(oldCalc.shippingCostPerUnit > 0 ? ((newCalc.shippingCostPerUnit - oldCalc.shippingCostPerUnit) / oldCalc.shippingCostPerUnit) * 100 : 0)],
      ['実原価合計', r2(oldCalc.actualTotalCost), r2(newCalc.actualTotalCost), r2(newCalc.actualTotalCost - oldCalc.actualTotalCost), r2(oldCalc.actualTotalCost > 0 ? ((newCalc.actualTotalCost - oldCalc.actualTotalCost) / oldCalc.actualTotalCost) * 100 : 0)],
      ['実利益率(外%)', r2(oldCalc.actualProfitRate), r2(newCalc.actualProfitRate), r2(newCalc.actualProfitRate - oldCalc.actualProfitRate), ''],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, '新旧比較サマリー');

    const partNo = newEstimate.partNumber || oldEstimate.partNumber || '見積書';
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    XLSX.writeFile(wb, `${partNo}_新旧見積比較_${today}.xlsx`);
    } catch (e) {
      console.error('Excel export failed:', e);
      alert('Excelの生成に失敗しました。通信状況を確認して再度お試しください。');
    } finally {
      setIsExporting(false);
    }
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
          disabled={isExporting}
          className="flex items-center gap-2 px-4 py-2 bg-[#1A6B3A] hover:bg-[#145730] text-white text-sm font-bold rounded cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
        >
          <Download className="w-4 h-4" />
          {isExporting ? '生成中...' : 'Excelダウンロード'}
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
        {/* Old estimate — top half */}
        <div style={{ flex: 1 }}>
          <EstimateBlock label="旧単価" est={oldEstimate} calc={oldCalc} tag="old" />
        </div>

        {/* New estimate — bottom half */}
        <div style={{ flex: 1 }}>
          <EstimateBlock label="新単価" est={newEstimate} calc={newCalc} tag="new" />
        </div>
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
          /* インラインの width:210mm/padding を !important で上書きし、印刷可能幅(190mm)に収める＝右の見切れ防止 */
          #print-area {
            position: fixed;
            top: 0;
            left: 0;
            width: 190mm !important;
            max-width: 190mm !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            gap: 6mm !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
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
