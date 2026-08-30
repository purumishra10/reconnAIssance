import React, { useState, useEffect, useRef } from 'react';
import { api } from './services/api';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MetricsRow } from './components/dashboard/MetricsRow';
import { TierBreakdown } from './components/dashboard/TierBreakdown';
import { MatchTable } from './components/dashboard/MatchTable';
import { ExceptionTable } from './components/dashboard/ExceptionTable';
import { RunForm } from './components/reconcile/RunForm';
import { ChatPanel } from './components/qa/ChatPanel';
import { AuditInspector } from './components/audit/AuditInspector';
import { Sparkles, Activity, CheckCircle, AlertCircle, RefreshCw, X } from 'lucide-react';

const MAX_POLL_ITERATIONS = 120; // 2 minutes at 1s interval

// Simple toast notification component for API errors
function Toast({ message, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '0.65rem',
        padding: '0.85rem 1.25rem',
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))',
        color: '#fff',
        borderRadius: '12px',
        fontSize: '0.85rem',
        boxShadow: '0 8px 32px rgba(239, 68, 68, 0.35)',
        backdropFilter: 'blur(8px)',
        animation: 'slideInRight 0.3s ease-out',
        maxWidth: '420px',
      }}
    >
      <AlertCircle size={18} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          opacity: 0.7,
        }}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function App() {
  const [runs, setRuns] = useState([]);
  const [currentRunId, setCurrentRunId] = useState('');
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toasts, setToasts] = useState([]);

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

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    if (currentRunId) {
      loadRunSummary(currentRunId);
    }
  }, [currentRunId]);

  const addToast = (message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message }]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const initApp = async () => {
    setLoading(true);
    try {
      const res = await api.listRuns();
      const runList = res.results || [];
      setRuns(runList);

      if (runList.length > 0) {
        setCurrentRunId(runList[0].id);
      } else {
        // Auto-generate first demo dataset and run if DB is fresh
        console.log('No runs found. Initializing demo run...');
        await generateInitialRun();
      }
    } catch (err) {
      console.error('Initialization error:', err);
      addToast(`Initialization failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const generateInitialRun = async () => {
    try {
      const genRes = await api.generateDataset({
        seed: 42,
        record_count: 2000,
        split_ratio: 0.8,
      });
      const runRes = await api.startReconcileRun({
        dataset_version: genRes.dataset_version,
        split: 'holdout',
      });
      const newRunId = runRes.run_id;

      // Poll until ready with max-poll guard
      pollCountRef.current = 0;
      pollIntervalRef.current = setInterval(async () => {
        pollCountRef.current += 1;

        if (pollCountRef.current >= MAX_POLL_ITERATIONS) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          addToast('Initial run timed out after 2 minutes. Please refresh to check status.');
          return;
        }

        try {
          const sum = await api.getRunSummary(newRunId);
          if (sum.status === 'completed') {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            const updatedRuns = await api.listRuns();
            setRuns(updatedRuns.results || []);
            setCurrentRunId(newRunId);
          } else if (sum.status === 'failed') {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            addToast(`Initial run failed: ${sum.error_message || 'Unknown error'}`);
          }
        } catch (pollErr) {
          console.error('Polling error:', pollErr);
        }
      }, 1000);
    } catch (e) {
      console.error('Initial generation error:', e);
      addToast(`Initial generation failed: ${e.message}`);
    }
  };

  const loadRunSummary = async (runId) => {
    setIsRefreshing(true);
    try {
      const data = await api.getRunSummary(runId);
      setSummary(data);
    } catch (err) {
      console.error('Failed to load run summary:', err);
      addToast(`Failed to load run summary: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRunCompleted = async (runId) => {
    const res = await api.listRuns();
    setRuns(res.results || []);
    setCurrentRunId(runId);
    setActiveTab('dashboard');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Toast Notifications */}
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} onClose={() => removeToast(t.id)} />
      ))}

      {/* Top Header */}
      <Header
        runs={runs}
        currentRunId={currentRunId}
        onSelectRun={(id) => setCurrentRunId(id)}
        onRefresh={() => loadRunSummary(currentRunId)}
        isRefreshing={isRefreshing}
      />

      {/* Main Layout Container */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
        />

        {/* Content View Area */}
        <main style={{ flex: 1, padding: '1.5rem 2rem', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '1rem', color: 'var(--text-muted)' }}>
              <RefreshCw size={32} className="animate-spin" color="var(--accent-cyan)" />
              <div style={{ fontSize: '0.95rem' }}>Bootstrapping reconnAIssance multi-tier financial pipeline...</div>
            </div>
          ) : (
            <>
              {/* Dashboard Overview Tab */}
              {activeTab === 'dashboard' && (
                <div>
                  <MetricsRow summary={summary} />
                  <TierBreakdown summary={summary} />
                  <div style={{ marginBottom: '1.5rem' }}>
                    <MatchTable runId={currentRunId} />
                  </div>
                  <div>
                    <ExceptionTable runId={currentRunId} />
                  </div>
                </div>
              )}

              {/* Run Reconciliation Tab */}
              {activeTab === 'reconcile' && (
                <div>
                  <RunForm
                    onRunCompleted={handleRunCompleted}
                    onSelectRun={(id) => setCurrentRunId(id)}
                  />
                  {summary && (
                    <>
                      <MetricsRow summary={summary} />
                      <TierBreakdown summary={summary} />
                    </>
                  )}
                </div>
              )}

              {/* Settlement Q&A Tab */}
              {activeTab === 'qa' && (
                <div>
                  <ChatPanel runId={currentRunId} />
                </div>
              )}

              {/* Full Audit Trail Tab */}
              {activeTab === 'audit' && (
                <div>
                  <AuditInspector runId={currentRunId} />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
