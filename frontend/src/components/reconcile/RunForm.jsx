import React from 'react';
import { Play, Sparkles, RefreshCw, Layers } from 'lucide-react';

export function RunForm({ cycle, form, onFormChange, onLaunch }) {
  const { selectedPreset, seed, recordCount, splitRatio, targetSplit } = form;

  const updateForm = (patch) => {
    onFormChange((prev) => ({ ...prev, ...patch }));
  };

  const generating = cycle?.generating;
  const running = cycle?.running;
  const statusMessage = cycle?.statusMessage || '';
  const hasResult = Boolean(cycle?.summary);
  const busy = generating || running;

  const presets = [
    {
      id: 'quick',
      title: '🧪 Quick Smoke Test',
      count: 500,
      seed: 42,
      desc: 'Fast 500-record batch for quick pipeline verification (~2s runtime)',
    },
    {
      id: 'demo',
      title: '📊 Standard Demo (Target)',
      count: 2000,
      seed: 42,
      desc: 'Official 2,000-record realistic e-commerce batch with 9 noise patterns',
    },
    {
      id: 'stress',
      title: '🔥 High-Throughput Stress Test',
      count: 10000,
      seed: 42,
      desc: '10,000-record high-volume test to demonstrate RPS throughput scaling',
    },
  ];

  const handleApplyPreset = (preset) => {
    updateForm({
      selectedPreset: preset.id,
      recordCount: preset.count,
      seed: preset.seed,
    });
  };

  const handleGenerateAndRun = () => {
    if (busy) return;
    if (onLaunch) {
      onLaunch({ seed, recordCount, splitRatio, targetSplit });
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
      {/* Preset Selector Card */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Layers size={18} color="var(--accent-cyan)" />
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Dataset Volume & Presets</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {presets.map((p) => {
            const isSelected = selectedPreset === p.id;
            return (
              <div
                key={p.id}
                onClick={() => handleApplyPreset(p)}
                className="app-card"
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--border-focus)' : 'var(--border-subtle)',
                  background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                  boxShadow: isSelected ? '0 0 15px rgba(6, 182, 212, 0.15)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.95rem', color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                    {p.title}
                  </div>
                  <span className="badge badge-fuzzy" style={{ fontSize: '0.7rem' }}>
                    {p.count.toLocaleString()} Orders
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pipeline Config & Launch Card */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Sparkles size={18} color="var(--accent-blue)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Pipeline Execution Controls</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                RNG Seed
              </label>
              <input
                type="number"
                className="input-field"
                style={{ marginTop: '0.25rem' }}
                value={seed}
                onChange={(e) => updateForm({ seed: Number(e.target.value) })}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Evaluation Split
              </label>
              <select
                className="input-field"
                style={{ marginTop: '0.25rem' }}
                value={targetSplit}
                onChange={(e) => updateForm({ targetSplit: e.target.value })}
              >
                <option value="holdout">Held-out Split (20% test)</option>
                <option value="tuning">Tuning Split (80% dev)</option>
                <option value="all">Full Dataset (100%)</option>
              </select>
            </div>
          </div>

          <div style={{ padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Execution Strategy:
            </div>
            Vectorized Tier 1 exact match $\to$ Fee-tolerant Tier 2 fuzzy match $\to$ Contextual Tier 3 AI $\to$ Held-out scoring.
          </div>
        </div>

        <div>
          {statusMessage && (
            <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {(generating || running) && <RefreshCw size={12} className="animate-spin" />}
              {statusMessage}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem' }}
            disabled={busy}
            onClick={handleGenerateAndRun}
          >
            {hasResult && !busy ? <RefreshCw size={16} /> : <Play size={16} />}
            {generating
              ? 'Generating Data...'
              : running
                ? 'Reconciling Records...'
                : hasResult
                  ? 'Rerun cycle'
                  : 'Generate & Launch Reconciliation'}
          </button>
          {hasResult && !busy && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.55rem', textAlign: 'center' }}>
              Results stay until you rerun. Rerun generates a new dataset and replaces this cycle.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
