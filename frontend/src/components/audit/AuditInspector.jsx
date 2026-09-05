import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Search } from 'lucide-react';

export function AuditInspector({ runId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tierFilter, setTierFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const pageSize = 50;

  useEffect(() => {
    if (!runId) return;
    loadAuditLogs();
  }, [runId, tierFilter, actionFilter, page]);

  const loadAuditLogs = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (tierFilter) params.tier = tierFilter;
      if (actionFilter) params.action = actionFilter;
      const res = await api.getAuditLog(runId, params);
      setLogs(res.results || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((l) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      l.reason?.toLowerCase().includes(q) ||
      l.canonical_transaction_id?.toLowerCase().includes(q) ||
      l.tier?.toLowerCase().includes(q) ||
      l.action?.toLowerCase().includes(q)
    );
  });

  const getTierBadge = (tier) => {
    switch (tier) {
      case 'exact':
        return <span className="badge badge-exact">Exact</span>;
      case 'fuzzy':
        return <span className="badge badge-fuzzy">Fuzzy</span>;
      case 'ai_assisted':
        return <span className="badge badge-ai">AI Assisted</span>;
      case 'evaluation':
        return <span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>Evaluation</span>;
      default:
        return <span className="badge">{tier}</span>;
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'matched':
        return <span style={{ color: 'var(--accent-emerald)', fontWeight: '600' }}>Matched</span>;
      case 'rejected':
        return <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>Rejected</span>;
      case 'flagged_exception':
        return <span style={{ color: 'var(--accent-rose)', fontWeight: '600' }}>Flagged Exception</span>;
      case 'scored':
        return <span style={{ color: 'var(--accent-amber)', fontWeight: '600' }}>Scored</span>;
      default:
        return <span>{action}</span>;
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: '600' }}>Audit trail</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Decision history for this run — match, reject, or flag, with the recorded reason
          </p>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ position: 'relative', width: '200px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search audit trail..."
              className="input-field"
              style={{ paddingLeft: '2rem', fontSize: '0.8rem', padding: '0.45rem 0.5rem 0.45rem 2rem' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="input-field"
            style={{ width: '130px', fontSize: '0.8rem', padding: '0.45rem 0.65rem' }}
            value={tierFilter}
            onChange={(e) => {
              setTierFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Tiers</option>
            <option value="exact">Exact</option>
            <option value="fuzzy">Fuzzy</option>
            <option value="ai_assisted">AI Assisted</option>
            <option value="evaluation">Evaluation</option>
          </select>

          <select
            className="input-field"
            style={{ width: '150px', fontSize: '0.8rem', padding: '0.45rem 0.65rem' }}
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Actions</option>
            <option value="matched">Matched</option>
            <option value="rejected">Rejected</option>
            <option value="flagged_exception">Exceptions</option>
            <option value="scored">Scored</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>ID</th>
              <th>Tier</th>
              <th>Action</th>
              <th>Confidence</th>
              <th>Reason</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Loading audit logs...
                </td>
              </tr>
            ) : filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No audit log records found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    #{log.id}
                  </td>
                  <td>{getTierBadge(log.tier)}</td>
                  <td>{getActionBadge(log.action)}</td>
                  <td>
                    {log.confidence !== null && log.confidence !== undefined ? (
                      <span style={{ fontWeight: '600' }}>{(log.confidence * 100).toFixed(0)}%</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ maxWidth: '450px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    <div>{log.reason}</div>
                    {log.raw_llm_response_json && (
                      <details style={{ marginTop: '0.35rem', fontSize: '0.7rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <summary>Raw model response</summary>
                        <pre style={{ background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '6px', marginTop: '0.25rem', overflowX: 'auto' }}>
                          {log.raw_llm_response_json}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {log.created_at ? new Date(log.created_at).toLocaleTimeString() : 'N/A'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <div>
          Showing {filteredLogs.length} of {total} audit log records
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
    </div>
  );
}
