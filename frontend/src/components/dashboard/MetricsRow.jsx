import React from 'react';
import { Target, CheckCircle2, Gauge, AlertTriangle } from 'lucide-react';

export function MetricsRow({ summary }) {
  if (!summary) return null;

  const matchRatePct = ((summary.match_rate || 0) * 100).toFixed(1);
  const precisionPct = ((summary.precision || 0) * 100).toFixed(1);
  const recallPct = ((summary.recall || 0) * 100).toFixed(1);
  const throughputRps = (summary.throughput_rps || 0).toFixed(1);
  const exceptionCount = summary.exception_count || 0;
  const totalRecords = summary.record_count || 0;

  const metrics = [
    {
      title: 'Match rate',
      value: `${matchRatePct}%`,
      subtitle: `${totalRecords - exceptionCount} / ${totalRecords} resolved`,
      icon: CheckCircle2,
      color: 'var(--accent-emerald)',
    },
    {
      title: 'Precision',
      value: `${precisionPct}%`,
      subtitle: 'Held-out true matches / system matches',
      icon: Target,
      color: 'var(--accent-blue)',
    },
    {
      title: 'Recall',
      value: `${recallPct}%`,
      subtitle: 'Held-out found / expected matches',
      icon: Target,
      color: 'var(--accent-blue)',
    },
    {
      title: 'Throughput',
      value: `${throughputRps}`,
      suffix: ' rps',
      subtitle: 'End-to-end pipeline',
      icon: Gauge,
      color: 'var(--accent-amber)',
    },
    {
      title: 'Exceptions',
      value: exceptionCount,
      subtitle: 'Unresolved after all tiers',
      icon: AlertTriangle,
      color: 'var(--accent-rose)',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.15rem',
      }}
    >
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div
            key={m.title}
            className="app-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '0.9rem 1rem',
              borderLeft: `3px solid ${m.color}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.55rem' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {m.title}
              </span>
              <Icon size={15} color={m.color} strokeWidth={1.75} />
            </div>
            <div className="tabular" style={{ fontSize: '1.45rem', fontWeight: '600', lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              {m.value}
              {m.suffix && <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>{m.suffix}</span>}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>{m.subtitle}</div>
          </div>
        );
      })}
    </div>
  );
}
