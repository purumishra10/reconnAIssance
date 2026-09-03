import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';

export function MatchTable({ runId, collapsible = false, defaultCollapsed = false }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tierFilter, setTierFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const pageSize = 20;

  useEffect(() => {
    if (!runId) return;
    if (collapsible && collapsed) return;
    loadMatches();
  }, [runId, tierFilter, page, collapsed, collapsible]);

  const loadMatches = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (tierFilter) params.tier = tierFilter;
      const res = await api.getMatches(runId, params);
      setMatches(res.results || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load matches:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredMatches = matches.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const matchesReason = m.reason?.toLowerCase().includes(q);
    const matchesMember = m.members?.some(
      (mem) => mem.normalized_ref?.toLowerCase().includes(q) || mem.batch_id?.toLowerCase().includes(q)
    );
    return matchesReason || matchesMember;
  });

  const getTierBadge = (tier) => {
    switch (tier) {
      case 'exact':
        return <span className="badge badge-exact">Exact Tier 1</span>;
      case 'fuzzy':
        return <span className="badge badge-fuzzy">Fuzzy Tier 2</span>;
      case 'ai_assisted':
        return <span className="badge badge-ai">AI Tier 3</span>;
      default:
        return <span className="badge">{tier}</span>;
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={() => collapsible && setCollapsed((v) => !v)}
          aria-expanded={collapsible ? !collapsed : true}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.55rem',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: collapsible ? 'pointer' : 'default',
            textAlign: 'left',
            color: 'inherit',
          }}
        >
          {collapsible && (
            collapsed ? <ChevronRight size={18} color="var(--text-muted)" style={{ marginTop: '2px' }} /> : <ChevronDown size={18} color="var(--accent-cyan)" style={{ marginTop: '2px' }} />
          )}
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Matched Groups & 3-Way Reconciliations</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {collapsed
                ? `${total} paired groups across ledger, Razorpay settlements, and bank credits — expand to inspect`
                : 'Successfully paired records across Merchant Sales Ledger, Razorpay Settlement Reports, and Bank Credits'}
            </p>
          </div>
        </button>

        {!collapsed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Search */}
          <div style={{ position: 'relative', width: '200px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search reference / UTR..."
              className="input-field"
              style={{ paddingLeft: '2rem', fontSize: '0.8rem', padding: '0.45rem 0.5rem 0.45rem 2rem' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Tier Filter */}
          <select
            className="input-field"
            style={{ width: '150px', fontSize: '0.8rem', padding: '0.45rem 0.65rem' }}
            value={tierFilter}
            onChange={(e) => {
              setTierFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Tiers</option>
            <option value="exact">Tier 1: Exact</option>
            <option value="fuzzy">Tier 2: Fuzzy</option>
            <option value="ai_assisted">Tier 3: AI</option>
          </select>
        </div>
        )}
      </div>

      {collapsed ? null : (
      <>
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th>Reference / Entities</th>
              <th>Matching Tier</th>
              <th>Confidence</th>
              <th>Resolution Reason & Fee Logic</th>
              <th>Matched Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Loading matched records...
                </td>
              </tr>
            ) : filteredMatches.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No match groups found matching criteria.
                </td>
              </tr>
            ) : (
              filteredMatches.map((group) => {
                const isExpanded = expandedGroupId === group.group_id;
                const ledgerMember = group.members?.find((m) => m.role === 'ledger_entry');
                const settleMember = group.members?.find((m) => m.role === 'settlement_entry');
                const bankMember = group.members?.find((m) => m.role === 'bank_entry');

                return (
                  <React.Fragment key={group.group_id}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedGroupId(isExpanded ? null : group.group_id)}
                    >
                      <td>
                        {isExpanded ? <ChevronDown size={16} color="var(--accent-cyan)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span style={{ fontWeight: '600', fontFamily: 'JetBrains Mono', fontSize: '0.85rem' }}>
                            {ledgerMember?.normalized_ref?.toUpperCase() || group.group_id.slice(0, 10)}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {settleMember?.batch_id || 'Direct Settlement'} · {group.members?.length || 2} entries linked
                          </span>
                        </div>
                      </td>
                      <td>{getTierBadge(group.tier)}</td>
                      <td>
                        <span style={{ fontWeight: '700', color: group.confidence >= 0.9 ? 'var(--accent-emerald)' : 'var(--accent-cyan)' }}>
                          {(group.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td style={{ maxWidth: '400px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {group.reason}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {group.created_at ? new Date(group.created_at).toLocaleTimeString() : 'N/A'}
                      </td>
                    </tr>

                    {/* Expanded Drawer Row */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg-tertiary)', padding: '1rem 1.5rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                              Multi-Source Linked Transaction Entries (Group: {group.group_id})
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                              {/* Ledger Card */}
                              {ledgerMember && (
                                <div className="app-card" style={{ background: 'var(--bg-secondary)', padding: '0.75rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                    <span className="badge badge-exact" style={{ fontSize: '0.65rem' }}>Sales Ledger</span>
                                    <span style={{ fontWeight: '700', color: 'var(--accent-emerald)' }}>₹{ledgerMember.amount_rupees}</span>
                                  </div>
                                  <div style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono' }}>{ledgerMember.normalized_ref}</div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                    Date: {ledgerMember.event_date} · Method: {ledgerMember.details?.payment_method || 'online'}
                                  </div>
                                </div>
                              )}

                              {/* Settlement Card */}
                              {settleMember && (
                                <div className="app-card" style={{ background: 'var(--bg-secondary)', padding: '0.75rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                    <span className="badge badge-fuzzy" style={{ fontSize: '0.65rem' }}>Razorpay Payout</span>
                                    <span style={{ fontWeight: '700', color: 'var(--accent-cyan)' }}>₹{settleMember.amount_rupees}</span>
                                  </div>
                                  <div style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono' }}>{settleMember.normalized_ref}</div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                    Batch: {settleMember.batch_id} · Net (after 2% fee + 18% GST)
                                  </div>
                                </div>
                              )}

                              {/* Bank Card */}
                              {bankMember ? (
                                <div className="app-card" style={{ background: 'var(--bg-secondary)', padding: '0.75rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                    <span className="badge badge-ai" style={{ fontSize: '0.65rem' }}>Bank Credit</span>
                                    <span style={{ fontWeight: '700', color: 'var(--accent-indigo)' }}>₹{bankMember.amount_rupees}</span>
                                  </div>
                                  <div style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono' }}>{bankMember.normalized_ref}</div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                    Narration: {bankMember.details?.narration || 'Settlement credit batch'}
                                  </div>
                                </div>
                              ) : (
                                <div className="app-card" style={{ background: 'var(--bg-secondary)', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                  Bank credit line bundled with batch
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <div>
          Showing {filteredMatches.length} of {total} match groups
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span style={{ alignSelf: 'center', fontWeight: '600' }}>Page {page}</span>
          <button
            className="btn btn-outline"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
            disabled={page * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
