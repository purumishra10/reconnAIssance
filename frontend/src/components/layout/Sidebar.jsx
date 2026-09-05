import React from 'react';
import { LayoutDashboard, PlayCircle, MessageSquareText, FileSearch, GitMerge, AlertTriangle } from 'lucide-react';

export function Sidebar({ activeTab, onSelectTab }) {
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'matches', label: 'Matched groups', icon: GitMerge },
    { id: 'exceptions', label: 'Exceptions', icon: AlertTriangle },
    { id: 'reconcile', label: 'Run reconciliation', icon: PlayCircle },
    { id: 'qa', label: 'Settlement Q&A', icon: MessageSquareText },
    { id: 'audit', label: 'Audit trail', icon: FileSearch },
  ];

  return (
    <aside
      style={{
        width: '220px',
        minHeight: 'calc(100vh - 57px)',
        background: 'var(--bg-sidebar)',
        padding: '1.1rem 0.7rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.15rem',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '0.35rem 0.75rem 0.65rem',
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          color: 'rgba(197, 208, 222, 0.55)',
          fontWeight: '600',
          letterSpacing: '0.08em',
        }}
      >
        Workspace
      </div>

      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            className={`nav-item${isActive ? ' active' : ''}`}
            onClick={() => onSelectTab(item.id)}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Icon size={16} strokeWidth={1.75} />
              <span>{item.label}</span>
            </div>
          </button>
        );
      })}

      <div
        style={{
          marginTop: 'auto',
          padding: '0.85rem 0.75rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.72rem',
        }}
      >
        <div style={{ fontWeight: '600', color: '#e8edf4', marginBottom: '0.3rem' }}>Held-out scoring</div>
        <p style={{ color: 'var(--text-on-navy)', lineHeight: '1.45' }}>
          Precision and recall are computed only on the untouched test split.
        </p>
      </div>
    </aside>
  );
}
