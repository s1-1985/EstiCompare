import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState { hasError: boolean; }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('React ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: 'sans-serif', background: '#F7F6F2', color: '#18130F', padding: '2rem',
        }}>
          <div style={{
            background: 'white', border: '1px solid #D6D0C8', borderRadius: '4px',
            padding: '2rem', maxWidth: '480px', width: '100%', textAlign: 'center',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 'bold' }}>
              表示エラーが発生しました
            </h2>
            <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#6B6057' }}>
              ブラウザの翻訳機能をオフにしてから、ページを再読み込みしてください。
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#B5451B', color: 'white', border: 'none',
                borderRadius: '4px', padding: '0.625rem 1.5rem',
                fontWeight: 'bold', cursor: 'pointer', fontSize: '0.875rem',
              }}
            >
              ページを再読み込み
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
