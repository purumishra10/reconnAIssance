import React from 'react';
import { LayoutDashboard, PlayCircle, MessageSquareText, ShieldAlert, FileSearch } from 'lucide-react';

export function Sidebar({ activeTab, onSelectTab, exceptionCount = 0 }) {
  const navItems = [
    { id: 'dashboard', label: 'Overview & Metrics', icon: LayoutDashboard },
    { id: 'reconcile', label: 'Run Reconciliation', icon: PlayCircle },
    { id: 'matches', label: 'Matched Groups', icon: ShieldAlert },
    { id: 'exceptions', label: 'Exceptions & Noise', icon: ShieldAlert, badge: exceptionCount },
    { id: 'qa', label: 'Settlement Q&A', icon: MessageSquareText },
    { id: 'audit', label: 'Audit Trail', icon: FileSearch },
  ];

  return (
    <aside
      className="glass-panel"
      style={{
        width: '240px',
        minHeight: 'calc(100vh - 65px)',
        borderRadius: '0',
        borderLeft: 'none',
        borderBottom: 'none',
        borderTop: 'none',
        padding: '1.25rem 0.85rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}
    >
      <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.05em' }}>
        Navigation
      </div>

      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid',
              borderColor: isActive ? 'var(--border-focus)' : 'transparent',
              background: isActive
                ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.12), rgba(37, 99, 235, 0.12))'
                : 'transparent',
              color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontWeight: isActive ? '600' : '500',
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'var(--bg-tertiary)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <Icon size={18} />
              <span>{item.label}</span>
            </div>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="badge badge-exc" style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem' }}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}

      <div style={{ marginTop: 'auto', padding: '1rem 0.75rem', background: 'var(--bg-tertiary)', borderRadius: '10px', fontSize: '0.75rem' }}>
        <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
          Held-out Split
        </div>
        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>
          Metrics are scored strictly on the untouched test batch per ADR-003.
        </p>
      </div>
    </aside>
  );
}
