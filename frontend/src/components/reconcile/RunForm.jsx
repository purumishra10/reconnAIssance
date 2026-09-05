import React from 'react';
import { Play, RefreshCw, Layers, SlidersHorizontal } from 'lucide-react';

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
      title: 'Smoke',
      count: 500,
      seed: 42,
      desc: '500 orders. Use this to verify the pipeline quickly.',
    },
    {
      id: 'demo',
      title: 'Standard',
      count: 2000,
      seed: 42,
      desc: '2,000 orders with T+2 lag, MDR/GST, and nine noise patterns.',
    },
    {
      id: 'stress',
      title: 'High volume',
      count: 10000,
      seed: 42,
      desc: '10,000 orders for throughput measurement.',
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
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem', marginBottom: '1.15rem' }}>
      <div className="glass-panel" style={{ padding: '1.15rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
          <Layers size={16} color="var(--text-secondary)" />
          <h3 style={{ fontSize: '0.95rem', fontWeight: '600' }}>Dataset size</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {presets.map((p) => {
            const isSelected = selectedPreset === p.id;
            return (
              <div
                key={p.id}
                onClick={() => handleApplyPreset(p)}
                className="app-card"
                style={{
                  cursor: 'pointer',
                  padding: '0.85rem 1rem',
                  borderColor: isSelected ? 'var(--border-focus)' : 'var(--border-subtle)',
                  background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                  <div style={{ fontWeight: '600', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                    {p.title}
                  </div>
                  <span className="badge badge-fuzzy" style={{ fontSize: '0.65rem', textTransform: 'none', letterSpacing: 0 }}>
                    {p.count.toLocaleString()} orders
                  </span>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
            <SlidersHorizontal size={16} color="var(--text-secondary)" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: '600' }}>Run controls</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                RNG seed
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
              <label style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Evaluation split
              </label>
              <select
                className="input-field"
                style={{ marginTop: '0.25rem' }}
                value={targetSplit}
                onChange={(e) => updateForm({ targetSplit: e.target.value })}
              >
                <option value="holdout">Held-out (20% test)</option>
                <option value="tuning">Tuning (80% dev)</option>
                <option value="all">Full dataset</option>
              </select>
            </div>
          </div>

          <div style={{ padding: '0.7rem 0.8rem', background: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1.1rem', lineHeight: 1.5 }}>
            <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
              Sequence
            </div>
            Exact match → fee-tolerant fuzzy match → model-assisted remainder → held-out scoring.
          </div>
        </div>

        <div>
          {statusMessage && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {(generating || running) && <RefreshCw size={12} className="animate-spin" />}
              {statusMessage}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.7rem' }}
            disabled={busy}
            onClick={handleGenerateAndRun}
          >
            {hasResult && !busy ? <RefreshCw size={15} /> : <Play size={15} />}
            {generating
              ? 'Generating dataset…'
              : running
                ? 'Reconciling…'
                : hasResult
                  ? 'Rerun cycle'
                  : 'Generate and run'}
          </button>
          {hasResult && !busy && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', textAlign: 'center' }}>
              On-screen results stay until you rerun. Rerun writes a new dataset and replaces this cycle.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
