import React from 'react';
import { useTheme } from './ThemeProvider';
import { Sun, Moon, Sparkles, ShieldCheck, Activity, RefreshCw } from 'lucide-react';

export function Header({ runs, currentRunId, onSelectRun, onRefresh, isRefreshing }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="glass-panel" style={{ borderRadius: '0', borderLeft: 'none', borderRight: 'none', borderTop: 'none', padding: '0.85rem 1.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logo and Tagline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)',
            }}
          >
            <Sparkles size={20} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em' }}>
              reconn<span style={{ color: 'var(--accent-cyan)' }}>AI</span>ssance
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Multi-Source Financial Reconciliation Agent & Settlement Controller
            </p>
          </div>
        </div>

        {/* Controls: Run Selector, Refresh, Theme Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Run Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>
              Active Run:
            </span>
            <select
              className="input-field"
              style={{ width: '220px', padding: '0.45rem 0.65rem', fontSize: '0.8rem' }}
              value={currentRunId || ''}
              onChange={(e) => onSelectRun(e.target.value)}
            >
              {runs && runs.length > 0 ? (
                runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} ({r.split} · {r.status})
                  </option>
                ))
              ) : (
                <option value="">No runs available</option>
              )}
            </select>
          </div>

          {/* Refresh button */}
          <button
            className="btn btn-outline"
            style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
            onClick={onRefresh}
            title="Refresh current run state"
            aria-label="Refresh current run state"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          {/* Theme Toggle Button */}
          <button
            className="btn btn-secondary"
            onClick={toggleTheme}
            style={{ padding: '0.45rem 0.75rem', borderRadius: '8px' }}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={16} color="var(--accent-amber)" /> : <Moon size={16} color="var(--accent-blue)" />}
            <span style={{ fontSize: '0.75rem' }}>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
