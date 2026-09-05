import React from 'react';
import { useTheme } from './ThemeProvider';
import { Sun, Moon, Scale, RefreshCw } from 'lucide-react';

export function Header({ runs, currentRunId, onSelectRun, onRefresh, isRefreshing }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      style={{
        background: 'var(--bg-header)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0.7rem 1.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              background: '#0b1f3a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Scale size={16} color="#ffffff" strokeWidth={2} />
          </div>
          <div>
            <h1 style={{ fontSize: '0.95rem', fontWeight: '600', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              reconnAIssance
            </h1>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Ledger · Razorpay settlements · Bank credits
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <label htmlFor="active-run" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
              Run
            </label>
            <select
              id="active-run"
              className="input-field"
              style={{ width: '240px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', fontFamily: 'IBM Plex Mono, monospace' }}
              value={currentRunId || ''}
              onChange={(e) => onSelectRun(e.target.value)}
            >
              {runs && runs.length > 0 ? (
                runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} · {r.split} · {r.status}
                  </option>
                ))
              ) : (
                <option value="">No runs</option>
              )}
            </select>
          </div>

          <button
            className="btn btn-outline"
            style={{ padding: '0.4rem 0.7rem', fontSize: '0.75rem' }}
            onClick={onRefresh}
            title="Refresh current run"
            aria-label="Refresh current run"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            className="btn btn-secondary"
            onClick={toggleTheme}
            style={{ padding: '0.4rem 0.65rem' }}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>
    </header>
  );
}
