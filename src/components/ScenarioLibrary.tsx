import React, { useState } from 'react';
import { Scenario } from '../types';
import { deleteUserScenario } from '../utils/firestoreService';
import { Search, ArrowLeft, Trash2, FolderOpen, AlertCircle, Plus, BookOpen } from 'lucide-react';

interface Props {
  scenarios: Scenario[];
  onLoad: (id: string) => void;
  onBack: () => void;
  isLoggedIn: boolean;
  onNewSheet: () => void;
}

export const ScenarioLibrary: React.FC<Props> = ({
  scenarios, onLoad, onBack, isLoggedIn, onNewSheet,
}) => {
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = query.trim()
    ? scenarios.filter(s => {
        const q = query.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.newEstimate.partNumber.toLowerCase().includes(q) ||
          (s.newEstimate.partName ?? '').toLowerCase().includes(q) ||
          s.oldEstimate.partNumber.toLowerCase().includes(q)
        );
      })
    : scenarios;

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

  const handleLoad = (id: string) => {
    onLoad(id);
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

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
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
          onClick={onNewSheet}
          className="flex items-center gap-1.5 bg-[#B5451B] hover:bg-[#8A3215] active:bg-[#6B260F] text-white text-xs font-bold px-3 py-2 rounded border border-[#8A3215] cursor-pointer transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新規白紙シート作成</span>
        </button>
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
            {query.trim() ? `${filtered.length} / ${scenarios.length} 件` : `${scenarios.length} 件`}
          </p>

          {filtered.length === 0 ? (
            <div className="bg-white border border-[#D6D0C8] rounded p-10 text-center">
              <FolderOpen className="w-8 h-8 text-[#9C9490] mx-auto mb-3" />
              {scenarios.length === 0 ? (
                <>
                  <p className="text-sm font-bold text-[#18130F] mb-1.5">保存済みシナリオがありません</p>
                  <p className="text-xs text-[#6B6057]">
                    ワークスペースで入力後、「クラウド保存」ボタンで保存してください。
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#6B6057]">「{query}」に一致するシナリオが見つかりません。</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map(scenario => (
                <div
                  key={scenario.id}
                  className="bg-white border border-[#D6D0C8] rounded hover:border-[#F8C9BB] hover:bg-[#FEF0EB] transition-all group"
                >
                  <div className="flex items-center gap-3 p-3 sm:p-4">
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs font-bold text-[#B5451B] bg-[#FEF0EB] group-hover:bg-white px-2 py-0.5 rounded border border-[#F8C9BB] transition-colors">
                          {scenario.newEstimate.partNumber || '品番未設定'}
                        </span>
                        {scenario.comparisonResult && (
                          <span className="text-[9px] font-black bg-[#1E3A5F] text-white px-1.5 py-0.5 rounded uppercase tracking-wider">
                            AI監査済
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
                      <button
                        onClick={() => handleLoad(scenario.id)}
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
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
