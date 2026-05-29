import React from 'react';
import { createPortal } from 'react-dom';

// ─── Tooltip component ────────────────────────────────────────────────────────
// ヘルプ用の「?」アイコン。吹き出しは Portal で <body> 直下に fixed 配置するため、
// 祖先の overflow:hidden / truncate / スクロール領域でクリップされない。
// デスクトップ: ホバーで表示。 モバイル/タッチ: タップでトグル表示（hover非対応端末対策）。
export const Tooltip = ({ text }: { text: string }) => {
  const [show, setShow] = React.useState(false);
  const [pos, setPos] = React.useState<{ x: number; y: number; below: boolean } | null>(null);
  const ref = React.useRef<HTMLSpanElement>(null);

  const open = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 160; // 画面上部の指標ストリップ等では下側に出す
    const x = Math.min(Math.max(r.left + r.width / 2, 116), window.innerWidth - 116);
    setPos({ x, y: below ? r.bottom + 6 : r.top - 6, below });
    setShow(true);
  }, []);

  React.useEffect(() => {
    if (!show) return;
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setShow(false);
    };
    const onScroll = () => setShow(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShow(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('keydown', onKey);
    };
  }, [show]);

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label="説明を表示"
      className="relative z-30 inline-flex shrink-0 align-middle cursor-help text-[#9C9490] text-[9px] border border-[#9C9490] rounded-full w-3.5 h-3.5 items-center justify-center leading-none ml-0.5 select-none hover:text-[#B5451B] hover:border-[#B5451B] transition-colors"
      onMouseEnter={open}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); show ? setShow(false) : open(); }}
    >
      <span className="pointer-events-none">?</span>
      {show && pos && createPortal(
        <span
          className="fixed z-[10000] w-56 max-w-[80vw] bg-[#18130F] text-white text-[10px] rounded p-2 shadow-xl whitespace-pre-wrap leading-relaxed pointer-events-none"
          style={{
            left: pos.x,
            top: pos.y,
            transform: `translateX(-50%) ${pos.below ? '' : 'translateY(-100%)'}`,
          }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
};

export default Tooltip;
