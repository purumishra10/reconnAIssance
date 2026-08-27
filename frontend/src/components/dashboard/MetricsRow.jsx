import React from 'react';
import { Target, CheckCircle2, Zap, AlertTriangle, Database } from 'lucide-react';

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
      title: 'Match Rate',
      value: `${matchRatePct}%`,
      subtitle: `${totalRecords - exceptionCount} / ${totalRecords} resolved`,
      icon: CheckCircle2,
      color: 'var(--accent-emerald)',
      glow: 'rgba(16, 185, 129, 0.15)',
    },
    {
      title: 'Precision (Held-out)',
      value: `${precisionPct}%`,
      subtitle: 'True matches / System matches',
      icon: Target,
      color: 'var(--accent-cyan)',
      glow: 'rgba(6, 182, 212, 0.15)',
    },
    {
      title: 'Recall (Held-out)',
      value: `${recallPct}%`,
      subtitle: 'Found / Expected matches',
      icon: Target,
      color: 'var(--accent-blue)',
      glow: 'rgba(59, 130, 246, 0.15)',
    },
    {
      title: 'Throughput',
      value: `${throughputRps} rps`,
      subtitle: 'End-to-end multi-tier pipeline',
      icon: Zap,
      color: 'var(--accent-amber)',
      glow: 'rgba(245, 158, 11, 0.15)',
    },
    {
      title: 'Exceptions Flagged',
      value: exceptionCount,
      subtitle: 'Inspectable noise/unmatched',
      icon: AlertTriangle,
      color: 'var(--accent-rose)',
      glow: 'rgba(244, 63, 94, 0.15)',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}
    >
      {metrics.map((m, idx) => {
        const Icon = m.icon;
        return (
          <div
            key={idx}
            className="app-card animate-fade-in"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Subtle glow border */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: m.color,
                boxShadow: `0 0 10px ${m.color}`,
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {m.title}
              </span>
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '8px',
                  background: m.glow,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: m.color,
                }}
              >
                <Icon size={16} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', fontFamily: 'Outfit', color: 'var(--text-primary)', lineHeight: '1.1' }}>
                {m.value}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                {m.subtitle}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
