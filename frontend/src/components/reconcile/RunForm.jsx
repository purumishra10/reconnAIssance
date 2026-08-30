import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { Play, Sparkles, Database, CheckCircle, RefreshCw, Layers, ShieldCheck } from 'lucide-react';

const MAX_POLL_ITERATIONS = 120; // 2 minutes at 1s interval

export function RunForm({ onRunCompleted, onSelectRun }) {
  const [selectedPreset, setSelectedPreset] = useState('demo');
  const [seed, setSeed] = useState(42);
  const [recordCount, setRecordCount] = useState(2000);
  const [splitRatio, setSplitRatio] = useState(0.8);
  const [targetSplit, setTargetSplit] = useState('holdout');

  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [datasetVersion, setDatasetVersion] = useState('ds_2000_seed42');

  const pollIntervalRef = useRef(null);
  const pollCountRef = useRef(0);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

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
    setSelectedPreset(preset.id);
    setRecordCount(preset.count);
    setSeed(preset.seed);
    setDatasetVersion(`ds_${preset.count}_seed${preset.seed}`);
  };

  const handleGenerateAndRun = async () => {
    setGenerating(true);
    setStatusMessage('1/2 Generating synthetic dataset with 9 financial noise patterns...');
    try {
      // 1. Generate Dataset
      const genRes = await api.generateDataset({
        seed: Number(seed),
        record_count: Number(recordCount),
        split_ratio: Number(splitRatio),
      });

      const dsVer = genRes.dataset_version;
      setDatasetVersion(dsVer);

      // 2. Start Reconciliation Pipeline
      setGenerating(false);
      setRunning(true);
      setStatusMessage(`2/2 Executing 3-tier reconciliation on ${targetSplit} split...`);

      const runRes = await api.startReconcileRun({
        dataset_version: dsVer,
        split: targetSplit,
      });

      const runId = runRes.run_id;

      // 3. Poll for completion with max-poll guard and proper cleanup
      pollCountRef.current = 0;
      pollIntervalRef.current = setInterval(async () => {
        pollCountRef.current += 1;

        if (pollCountRef.current >= MAX_POLL_ITERATIONS) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setRunning(false);
          setStatusMessage('Run timed out after 2 minutes. Check the dashboard for status.');
          return;
        }

        try {
          const summary = await api.getRunSummary(runId);
          if (summary.status === 'completed') {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setRunning(false);
            setStatusMessage(`Reconciliation completed successfully! Match rate: ${(summary.match_rate * 100).toFixed(1)}%`);
            if (onRunCompleted) onRunCompleted(runId);
            if (onSelectRun) onSelectRun(runId);
          } else if (summary.status === 'failed') {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setRunning(false);
            setStatusMessage(`Run failed: ${summary.error_message}`);
          }
        } catch (pollErr) {
          console.error('Polling error:', pollErr);
        }
      }, 1000);
    } catch (err) {
      setGenerating(false);
      setRunning(false);
      setStatusMessage(`Error: ${err.message}`);
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
                onChange={(e) => setSeed(Number(e.target.value))}
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
                onChange={(e) => setTargetSplit(e.target.value)}
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
            disabled={generating || running}
            onClick={handleGenerateAndRun}
          >
            <Play size={16} />
            {generating ? 'Generating Data...' : running ? 'Reconciling Records...' : 'Generate & Launch Reconciliation'}
          </button>
        </div>
      </div>
    </div>
  );
}
