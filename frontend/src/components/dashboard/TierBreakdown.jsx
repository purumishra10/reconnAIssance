import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CheckCheck, Sparkles, Filter, AlertCircle } from 'lucide-react';

export function TierBreakdown({ summary }) {
  if (!summary) return null;

  const exactCount = summary.tier_breakdown?.exact || 0;
  const fuzzyCount = summary.tier_breakdown?.fuzzy || 0;
  const aiCount = summary.tier_breakdown?.ai_assisted || 0;
  const excCount = summary.exception_count || 0;
  const total = exactCount + fuzzyCount + aiCount + excCount || 1;

  const data = [
    { name: 'Tier 1: Exact Match', value: exactCount, color: '#10b981' },
    { name: 'Tier 2: Fuzzy & Tolerant', value: fuzzyCount, color: '#06b6d4' },
    { name: 'Tier 3: AI-Assisted', value: aiCount, color: '#a855f7' },
    { name: 'Unresolved Exceptions', value: excCount, color: '#f43f5e' },
  ].filter((d) => d.value > 0);

  const tiers = [
    {
      title: 'Tier 1: Exact Match',
      desc: 'Deterministic key joins on normalized order references',
      count: exactCount,
      pct: ((exactCount / total) * 100).toFixed(1),
      badgeClass: 'badge-exact',
      icon: CheckCheck,
      color: '#10b981',
    },
    {
      title: 'Tier 2: Fuzzy Match',
      desc: 'Fee/tax-tolerant amount windows, Levenshtein edit distance & T+2 date drift',
      count: fuzzyCount,
      pct: ((fuzzyCount / total) * 100).toFixed(1),
      badgeClass: 'badge-fuzzy',
      icon: Filter,
      color: '#06b6d4',
    },
    {
      title: 'Tier 3: AI-Assisted',
      desc: 'Contextual LLM reasoning on remaining ambiguous edge-cases',
      count: aiCount,
      pct: ((aiCount / total) * 100).toFixed(1),
      badgeClass: 'badge-ai',
      icon: Sparkles,
      color: '#a855f7',
    },
    {
      title: 'Exceptions Flagged',
      desc: 'Unmatched rows categorized with diagnostic failure reasons',
      count: excCount,
      pct: ((excCount / total) * 100).toFixed(1),
      badgeClass: 'badge-exc',
      icon: AlertCircle,
      color: '#f43f5e',
    },
  ];

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>3-Tier Pipeline Cascading Breakdown</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Resolution distribution across deterministic exact matching, fuzzy tolerances, and AI reasoning
          </p>
        </div>
        <span className="badge badge-fuzzy" style={{ fontSize: '0.75rem' }}>
          ADR-001 Enforced
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '1.5rem', alignItems: 'center' }}>
        {/* Recharts Donut */}
        <div style={{ height: '220px', position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                paddingAngle={4}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border-subtle)',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-md)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: '1.4rem', fontWeight: '800', fontFamily: 'Outfit', color: 'var(--text-primary)' }}>
              {total}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Decisions
            </div>
          </div>
        </div>

        {/* Tier Cards Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {tiers.map((t, idx) => {
            const Icon = t.icon;
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: `${t.color}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: t.color,
                    }}
                  >
                    <Icon size={14} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {t.title}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {t.desc}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span className={`badge ${t.badgeClass}`} style={{ fontSize: '0.75rem' }}>
                    {t.count} ({t.pct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
