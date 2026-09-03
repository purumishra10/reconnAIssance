import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Label, Tooltip, Sector } from 'recharts';
import { CheckCheck, Sparkles, Filter, AlertCircle, ArrowRight, Layers } from 'lucide-react';

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '0.5rem 0.75rem',
        fontSize: '0.8rem',
        color: 'var(--text-primary)',
        boxShadow: 'var(--shadow-md)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontWeight: 600, color: item.payload.color }}>{item.name}</div>
      <div style={{ color: 'var(--text-secondary)' }}>{item.value} decisions</div>
    </div>
  );
}

function InactiveSector(props) {
  return <Sector {...props} stroke="none" />;
}

export function TierBreakdown({ summary }) {
  if (!summary) return null;

  const exactCount = summary.tier_breakdown?.exact || 0;
  const fuzzyCount = summary.tier_breakdown?.fuzzy || 0;
  const aiCount = summary.tier_breakdown?.ai_assisted || 0;
  const excCount = summary.exception_count || 0;
  const total = exactCount + fuzzyCount + aiCount + excCount || 1;
  const matched = exactCount + fuzzyCount + aiCount;
  const recordCount = summary.record_count || total;
  const matchRatePct = ((summary.match_rate || matched / total) * 100).toFixed(1);
  const precisionPct = ((summary.precision || 0) * 100).toFixed(1);
  const recallPct = ((summary.recall || 0) * 100).toFixed(1);

  const data = [
    { name: 'Tier 1: Exact Match', value: exactCount, color: '#10b981' },
    { name: 'Tier 2: Fuzzy & Tolerant', value: fuzzyCount, color: '#06b6d4' },
    { name: 'Tier 3: AI-Assisted', value: aiCount, color: '#a855f7' },
    { name: 'Unresolved Exceptions', value: excCount, color: '#f43f5e' },
  ].filter((d) => d.value > 0);

  const stages = [
    {
      title: 'Tier 1: Exact Match',
      subtitle: 'Deterministic join',
      desc: 'Normalized order IDs, UTRs, and batch keys must match exactly. Highest throughput, no amount tolerance.',
      method: 'Vector equality on canonical refs',
      count: exactCount,
      remainingBefore: total,
      remainingAfter: total - exactCount,
      badgeClass: 'badge-exact',
      icon: CheckCheck,
      color: '#10b981',
    },
    {
      title: 'Tier 2: Fuzzy & Fee-Tolerant',
      subtitle: 'Passed downstream from Tier 1',
      desc: '2% MDR + 18% GST amount windows, ±5 day settlement lag, and Levenshtein similarity ≥ 80% on noisy refs.',
      method: 'rapidfuzz + fee-aware paise math',
      count: fuzzyCount,
      remainingBefore: total - exactCount,
      remainingAfter: total - exactCount - fuzzyCount,
      badgeClass: 'badge-fuzzy',
      icon: Filter,
      color: '#06b6d4',
    },
    {
      title: 'Tier 3: AI-Assisted',
      subtitle: 'Ambiguous remainder only',
      desc: 'LLM scores leftover many-to-one bundles, split settlements, and OCR/narration drift with cited confidence.',
      method: 'Structured JSON inference',
      count: aiCount,
      remainingBefore: total - exactCount - fuzzyCount,
      remainingAfter: excCount,
      badgeClass: 'badge-ai',
      icon: Sparkles,
      color: '#a855f7',
    },
    {
      title: 'Exceptions Flagged',
      subtitle: 'Unresolved after all tiers',
      desc: 'AMOUNT_MISMATCH, NO_COUNTERPART_FOUND, DUPLICATE_SUSPECTED — exported as an inspectable exception list.',
      method: 'Reason-code classifier',
      count: excCount,
      remainingBefore: excCount,
      remainingAfter: 0,
      badgeClass: 'badge-exc',
      icon: AlertCircle,
      color: '#f43f5e',
    },
  ];

  return (
    <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>3-Tier Pipeline Cascading Breakdown</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Each tier only sees what the previous one left unmatched — {recordCount} source records, {total} decisions
          </p>
        </div>
        <span className="badge badge-fuzzy" style={{ fontSize: '0.75rem' }}>
          ADR-001 Enforced
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.9fr) 1.4fr', gap: '1.5rem', alignItems: 'center', marginBottom: '1.35rem' }}>
        <div style={{ height: '240px', position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={62}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                isAnimationActive={false}
                activeShape={InactiveSector}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke="none"
                    style={{ outline: 'none', cursor: 'default' }}
                    tabIndex={-1}
                  />
                ))}
                <Label
                  position="center"
                  content={({ viewBox }) => {
                    const { cx, cy } = viewBox || {};
                    if (cx == null || cy == null) return null;
                    return (
                      <g>
                        <text
                          x={cx}
                          y={cy - 8}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="var(--text-primary)"
                          fontSize={22}
                          fontWeight={800}
                          fontFamily="Outfit, Inter, sans-serif"
                        >
                          {total}
                        </text>
                        <text
                          x={cx}
                          y={cy + 12}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="var(--text-muted)"
                          fontSize={10}
                          fontWeight={600}
                          letterSpacing="0.08em"
                          fontFamily="Inter, sans-serif"
                        >
                          DECISIONS
                        </text>
                      </g>
                    );
                  }}
                />
              </Pie>
              <Tooltip
                content={<DonutTooltip />}
                offset={20}
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ outline: 'none', zIndex: 2 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.55rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <Layers size={14} />
            Funnel remaining after each stage
          </div>
          <div style={{ display: 'flex', height: '14px', borderRadius: '999px', overflow: 'hidden', background: 'var(--bg-tertiary)', marginBottom: '1rem', border: '1px solid var(--border-subtle)' }}>
            {data.map((d) => (
              <div
                key={d.name}
                title={`${d.name}: ${d.value}`}
                style={{ width: `${(d.value / total) * 100}%`, background: d.color, minWidth: d.value > 0 ? '4px' : 0 }}
              />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.65rem', marginBottom: '1rem' }}>
            {[
              { label: 'Resolved', value: `${matched} (${matchRatePct}%)`, color: 'var(--accent-emerald)' },
              { label: 'Precision', value: `${precisionPct}%`, color: 'var(--accent-cyan)' },
              { label: 'Recall', value: `${recallPct}%`, color: 'var(--accent-blue)' },
            ].map((stat) => (
              <div key={stat.label} style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{stat.label}</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, fontFamily: 'Outfit', color: stat.color, marginTop: '0.15rem' }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            Cascade starts with <strong style={{ color: 'var(--text-primary)' }}>{total}</strong> unmatched decisions.
            Tier 1 absorbs <strong style={{ color: '#10b981' }}>{((exactCount / total) * 100).toFixed(1)}%</strong>,
            Tier 2 takes <strong style={{ color: '#06b6d4' }}>{((fuzzyCount / Math.max(total - exactCount, 1)) * 100).toFixed(1)}%</strong> of the remainder,
            Tier 3 resolves <strong style={{ color: '#a855f7' }}>{((aiCount / Math.max(total - exactCount - fuzzyCount, 1)) * 100).toFixed(1)}%</strong> of what is still ambiguous,
            leaving <strong style={{ color: '#f43f5e' }}>{excCount}</strong> honest exceptions.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.75rem' }}>
        {stages.map((t, idx) => {
          const Icon = t.icon;
          const ofRemaining = t.remainingBefore > 0 ? ((t.count / t.remainingBefore) * 100).toFixed(1) : '0.0';
          const ofTotal = ((t.count / total) * 100).toFixed(1);
          return (
            <div
              key={t.title}
              style={{
                padding: '0.9rem',
                borderRadius: '10px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '7px',
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
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.title}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t.subtitle}</div>
                  </div>
                </div>
                {idx < stages.length - 1 && <ArrowRight size={14} color="var(--text-muted)" />}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span className={`badge ${t.badgeClass}`} style={{ fontSize: '0.75rem' }}>
                  {t.count} ({ofTotal}%)
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {ofRemaining}% of remaining
                </span>
              </div>

              <div style={{ height: '6px', borderRadius: '99px', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ width: `${ofRemaining}%`, height: '100%', background: t.color, borderRadius: '99px' }} />
              </div>

              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: 0 }}>{t.desc}</p>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                In: {t.remainingBefore} · Out unmatched: {t.remainingAfter} · {t.method}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
