import React, { useState } from 'react';
import { Scenario, ScenarioKind } from '../types';
import { deleteUserScenario, saveScenarioAnalysis } from '../utils/firestoreService';
import { apiPost } from '../utils/apiClient';
import { Search, ArrowLeft, Trash2, FolderOpen, AlertCircle, Plus, BookOpen, Sparkles, X, ChevronDown, ChevronUp, FileSpreadsheet, Layers, Layers3 } from 'lucide-react';

interface Props {
  scenarios: Scenario[];
  onLoad: (id: string) => void;
  onBack: () => void;
  isLoggedIn: boolean;
  onNew: (kind: ScenarioKind) => void;
}

const KIND_META: Record<ScenarioKind, { label: string; Icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }> = {
  compare:  { label: '新旧比較',     Icon: FileSpreadsheet, color: '#B5451B', bg: '#FEF0EB', border: '#F8C9BB' },
  multilot: { label: '複数Lot見積',  Icon: Layers,          color: '#1E3A5F', bg: '#EFF4FD', border: '#B8CCE8' },
  batch:    { label: '複数品番',     Icon: Layers3,         color: '#1E3A5F', bg: '#EFF4FD', border: '#B8CCE8' },
};
const KIND_ORDER: ScenarioKind[] = ['compare', 'multilot', 'batch'];

export const ScenarioLibrary: React.FC<Props> = ({
  scenarios, onLoad, onBack, isLoggedIn, onNew,
}) => {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<ScenarioKind>('compare');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisModal, setAnalysisModal] = useState<{ scenario: Scenario; text: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const kindOf = (s: Scenario): ScenarioKind => s.kind || 'compare';
  const counts: Record<ScenarioKind, number> = {
    compare: scenarios.filter((s) => kindOf(s) === 'compare').length,
    multilot: scenarios.filter((s) => kindOf(s) === 'multilot').length,
    batch: scenarios.filter((s) => kindOf(s) === 'batch').length,
  };

  const inTab = scenarios.filter((s) => kindOf(s) === tab);
  const filtered = query.trim()
    ? inTab.filter(s => {
        const q = query.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.newEstimate.partNumber.toLowerCase().includes(q) ||
          (s.newEstimate.partName ?? '').toLowerCase().includes(q) ||
          s.oldEstimate.partNumber.toLowerCase().includes(q)
        );
      })
    : inTab;

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`「${name}」を削除しますか？この操作は取り消せません。`)) return;
    setDeletingId(id);
    try {
      await deleteUserScenario(id);
    } catch {
      alert('削除に失敗しました。再度お試しください。');
    } finally {
      setDeletingId(null);
    }
  };

  const handleAnalyze = async (scenario: Scenario) => {
    setAnalyzingId(scenario.id);
    try {
      const res = await apiPost('/api/analyze-scenario', { scenario });
      const data = await res.json();
      const text: string = data.analysis || '分析結果を取得できませんでした。';
      try {
        await saveScenarioAnalysis(scenario.id, text);
      } catch { /* 保存失敗は無視してモーダルは表示 */ }
      setAnalysisModal({ scenario, text });
    } catch (e: any) {
      alert(`AI分析に失敗しました。\n${e?.message || '通信エラー'}`);
    } finally {
      setAnalyzingId(null);
    }
  };

  const formatDate = (ts: any): string => {
    if (!ts) return '—';
    try {
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date.toLocaleDateString('ja-JP', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  const subInfo = (s: Scenario): string => {
    const k = kindOf(s);
    if (k === 'multilot') return `${s.quantityPatterns?.length ?? 0} Lot`;
    if (k === 'batch') return `${s.batchParts?.length ?? 0} 品番`;
    return s.comparisonResult ? 'AI監査済' : '新旧比較';
  };

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-bold text-[#6B6057] hover:text-[#B5451B] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>ワークスペースに戻る</span>
          </button>
          <span className="text-[#D6D0C8] select-none">/</span>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#B5451B]" />
            <h2 className="text-sm font-black text-[#18130F]">マイ見積ライブラリ</h2>
          </div>
        </div>
        <button
          onClick={() => onNew(tab)}
          className="flex items-center gap-1.5 bg-[#B5451B] hover:bg-[#8A3215] active:bg-[#6B260F] text-white text-xs font-bold px-3 py-2 rounded border border-[#8A3215] cursor-pointer transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新規作成（{KIND_META[tab].label}）</span>
        </button>
      </div>

      {/* Feature tabs */}
      <div className="flex items-stretch gap-1 mb-4 border-b border-[#E8E4DF]">
        {KIND_ORDER.map((k) => {
          const m = KIND_META[k];
          const active = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-black border-b-2 -mb-px cursor-pointer transition-all ${
                active
                  ? 'border-b-[#B5451B] text-[#B5451B]'
                  : 'border-b-transparent text-[#9C9490] hover:text-[#6B6057]'
              }`}
            >
              <m.Icon className="w-3.5 h-3.5" />
              <span>{m.label}</span>
              <span className={`text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none ${active ? 'bg-[#B5451B] text-white' : 'bg-[#EEEBE6] text-[#6B6057]'}`}>
                {counts[k]}
              </span>
            </button>
          );
        })}
      </div>

      {!isLoggedIn ? (
        <div className="bg-white border border-[#D6D0C8] rounded p-10 text-center">
          <AlertCircle className="w-8 h-8 text-[#9C9490] mx-auto mb-3" />
          <p className="text-sm font-bold text-[#18130F] mb-1.5">ログインが必要です</p>
          <p className="text-xs text-[#6B6057] leading-relaxed">
            右上のボタンからGoogleアカウントでサインインすると、<br className="hidden sm:inline" />
            見積シナリオを保存・管理できます。
          </p>
        </div>
      ) : (
        <>
          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-[#9C9490] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="品番・品名・シナリオ名で検索..."
              className="w-full bg-white border border-[#D6D0C8] rounded pl-9 pr-4 py-2.5 text-xs font-sans focus:outline-none focus:border-[#B5451B] focus:ring-1 focus:ring-[#B5451B]/30 transition-colors"
            />
          </div>

          <p className="text-[10px] text-[#9C9490] font-bold tracking-wider mb-3">
            {query.trim() ? `${filtered.length} / ${inTab.length} 件` : `${inTab.length} 件`}
          </p>

          {filtered.length === 0 ? (
            <div className="bg-white border border-[#D6D0C8] rounded p-10 text-center">
              <FolderOpen className="w-8 h-8 text-[#9C9490] mx-auto mb-3" />
              {inTab.length === 0 ? (
                <>
                  <p className="text-sm font-bold text-[#18130F] mb-1.5">{KIND_META[tab].label}の保存データがありません</p>
                  <p className="text-xs text-[#6B6057]">
                    {KIND_META[tab].label}で入力後、「保存」ボタンでクラウドに保存してください。
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#6B6057]">「{query}」に一致するシナリオが見つかりません。</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map(scenario => {
                const k = kindOf(scenario);
                const m = KIND_META[k];
                return (
                <div
                  key={scenario.id}
                  className="bg-white border border-[#D6D0C8] rounded hover:border-[#F8C9BB] transition-all group"
                >
                  <div className="flex items-center gap-3 p-3 sm:p-4">
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider inline-flex items-center gap-1" style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}>
                          <m.Icon className="w-2.5 h-2.5" />{m.label}
                        </span>
                        <span className="font-mono text-xs font-bold text-[#B5451B] bg-[#FEF0EB] group-hover:bg-[#FEF8F5] px-2 py-0.5 rounded border border-[#F8C9BB] transition-colors">
                          {scenario.newEstimate.partNumber || '品番未設定'}
                        </span>
                        <span className="text-[9px] font-bold text-[#6B6057] bg-[#F0EDE8] px-1.5 py-0.5 rounded">
                          {subInfo(scenario)}
                        </span>
                        {scenario.aiAnalysis && (
                          <span className="text-[9px] font-black bg-purple-700 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">
                            AI分析済
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-[#18130F] truncate mb-0.5">{scenario.name}</p>
                      <p className="text-[10px] text-[#9C9490] font-mono">
                        更新: {formatDate(scenario.updatedAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* AI分析は新旧比較のみ */}
                      {k === 'compare' && (
                        <button
                          onClick={() => scenario.aiAnalysis
                            ? setAnalysisModal({ scenario, text: scenario.aiAnalysis })
                            : handleAnalyze(scenario)
                          }
                          disabled={analyzingId === scenario.id}
                          title={scenario.aiAnalysis ? '保存済みAI分析を表示' : 'AIでこのシナリオを分析'}
                          className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded border cursor-pointer transition-all disabled:opacity-50 ${
                            scenario.aiAnalysis
                              ? 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100'
                              : 'bg-[#18130F] text-white border-[#2D2219] hover:bg-[#2D2219]'
                          }`}
                        >
                          <Sparkles className={`w-3 h-3 ${analyzingId === scenario.id ? 'animate-spin' : ''}`} />
                          {analyzingId === scenario.id ? '分析中...' : scenario.aiAnalysis ? '分析済み' : 'AI分析'}
                        </button>
                      )}
                      <button
                        onClick={() => onLoad(scenario.id)}
                        className="text-xs font-bold text-white bg-[#B5451B] hover:bg-[#8A3215] active:bg-[#6B260F] px-3 py-1.5 rounded border border-[#8A3215] transition-all cursor-pointer whitespace-nowrap"
                      >
                        読み込む
                      </button>
                      <button
                        onClick={() => handleDelete(scenario.id, scenario.name)}
                        disabled={deletingId === scenario.id}
                        className="p-1.5 text-[#C4BDB7] hover:text-red-500 hover:bg-red-50 rounded transition-all cursor-pointer disabled:opacity-40"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 既存AI分析の折りたたみプレビュー */}
                  {scenario.aiAnalysis && (
                    <div className="border-t border-[#F0EDE8]">
                      <button
                        onClick={() => setExpandedId(expandedId === scenario.id ? null : scenario.id)}
                        className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] text-purple-700 font-bold hover:bg-purple-50 transition-colors cursor-pointer"
                      >
                        <span>AI分析メモ（クリックで展開）</span>
                        {expandedId === scenario.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {expandedId === scenario.id && (
                        <div className="px-4 pb-3 text-[11px] text-[#3A3028] leading-relaxed whitespace-pre-wrap bg-purple-50/40">
                          {scenario.aiAnalysis}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* AI分析モーダル */}
      {analysisModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-[#D6D0C8] w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-[#E8E4DF]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-black text-[#18130F]">AI分析レポート</span>
                </div>
                <p className="text-[11px] text-[#6B6057] font-mono truncate max-w-sm">
                  {analysisModal.scenario.name} / {analysisModal.scenario.newEstimate.partNumber}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAnalyze(analysisModal.scenario)}
                  disabled={analyzingId === analysisModal.scenario.id}
                  className="flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-300 px-2.5 py-1 rounded cursor-pointer transition-colors disabled:opacity-50"
                >
                  <Sparkles className={`w-3 h-3 ${analyzingId === analysisModal.scenario.id ? 'animate-spin' : ''}`} />
                  {analyzingId === analysisModal.scenario.id ? '再分析中...' : '再分析'}
                </button>
                <button
                  onClick={() => setAnalysisModal(null)}
                  className="p-1.5 text-[#9C9490] hover:text-[#18130F] hover:bg-[#F0EDE8] rounded cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="text-[12px] text-[#18130F] leading-relaxed whitespace-pre-wrap">
                {analysisModal.text}
              </div>
            </div>
            {/* Footer */}
            <div className="px-6 py-3 border-t border-[#E8E4DF] bg-[#FAFAF8] rounded-b-xl">
              <p className="text-[9px] text-[#9C9490]">
                この分析結果はFirestoreに保存されます。次回は「分析済み」ボタンから即時表示できます。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
