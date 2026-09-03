import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Search, Download, ChevronDown, ChevronRight } from 'lucide-react';

export function ExceptionTable({ runId, collapsible = false, defaultCollapsed = false }) {
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reasonFilter, setReasonFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const pageSize = 20;

  useEffect(() => {
    if (!runId) return;
    if (collapsible && collapsed) return;
    loadExceptions();
  }, [runId, reasonFilter, page, collapsed, collapsible]);

  const loadExceptions = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (reasonFilter) params.reason_code = reasonFilter;
      const res = await api.getExceptions(runId, params);
      setExceptions(res.results || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error('Failed to load exceptions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (!runId) return;
    setExporting(true);
    try {
      const blob = await api.exportExceptionsCsv(runId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reconnaissance_exceptions_${runId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV Export failed:', err);
      alert('Failed to export CSV: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const filteredExceptions = exceptions.filter((exc) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      exc.normalized_ref?.toLowerCase().includes(q) ||
      exc.reason_code?.toLowerCase().includes(q) ||
      exc.reason_text?.toLowerCase().includes(q)
    );
  });

  const getReasonBadge = (code) => {
    switch (code) {
      case 'AMOUNT_MISMATCH':
        return <span className="badge badge-exc" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>Amount Mismatch</span>;
      case 'DUPLICATE_SUSPECTED':
        return <span className="badge badge-ai">Duplicate Row</span>;
      case 'NO_COUNTERPART_FOUND':
        return <span className="badge badge-exc">Missing Counterpart</span>;
      default:
        return <span className="badge badge-exc">{code}</span>;
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
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Honest Exception List & Noise Diagnostics</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {collapsed
                ? `${total} unresolved discrepancies — expand or open the Exception List section`
                : 'Unresolved discrepancies categorized with actionable reasons for finance operations teams'}
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
              placeholder="Search ref or reason..."
              className="input-field"
              style={{ paddingLeft: '2rem', fontSize: '0.8rem', padding: '0.45rem 0.5rem 0.45rem 2rem' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Reason Code Filter */}
          <select
            className="input-field"
            style={{ width: '190px', fontSize: '0.8rem', padding: '0.45rem 0.65rem' }}
            value={reasonFilter}
            onChange={(e) => {
              setReasonFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Reason Codes</option>
            <option value="NO_COUNTERPART_FOUND">Missing Counterpart</option>
            <option value="AMOUNT_MISMATCH">Amount Mismatch</option>
            <option value="DUPLICATE_SUSPECTED">Duplicate Suspected</option>
          </select>

          {/* Export CSV Button (FR-9) */}
          <button
            className="btn btn-primary"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
            onClick={handleExportCsv}
            disabled={exporting || total === 0}
          >
            <Download size={14} />
            {exporting ? 'Exporting...' : 'Export CSV (FR-9)'}
          </button>
        </div>
        )}
      </div>

      {collapsed ? null : (
      <>
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Reference ID</th>
              <th>Amount (₹)</th>
              <th>Event Date</th>
              <th>Reason Category</th>
              <th>Diagnostic Detail & Financial Root Cause</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  Loading exceptions...
                </td>
              </tr>
            ) : filteredExceptions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No exceptions found.
                </td>
              </tr>
            ) : (
              filteredExceptions.map((exc) => (
                <tr key={exc.exception_id}>
                  <td>
                    <span className="badge badge-fuzzy" style={{ textTransform: 'capitalize' }}>
                      {exc.source}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: '600', fontFamily: 'JetBrains Mono', fontSize: '0.85rem' }}>
                      {exc.normalized_ref?.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                      ₹{exc.amount_rupees}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {exc.event_date}
                  </td>
                  <td>{getReasonBadge(exc.reason_code)}</td>
                  <td style={{ maxWidth: '420px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {exc.reason_text}
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
          Showing {filteredExceptions.length} of {total} unresolved exceptions
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
