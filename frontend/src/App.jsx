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
import { AlertCircle, RefreshCw, X } from 'lucide-react';

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
        padding: '0.75rem 1.1rem',
        background: '#7f1d1d',
        color: '#fff',
        borderRadius: '6px',
        fontSize: '0.82rem',
        boxShadow: 'var(--shadow-md)',
        animation: 'slideInRight 0.25s ease-out',
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
  const [cycle, setCycle] = useState({
    generating: false,
    running: false,
    statusMessage: '',
    summary: null,
  });
  const [reconcileForm, setReconcileForm] = useState({
    selectedPreset: 'demo',
    seed: 42,
    recordCount: 2000,
    splitRatio: 0.8,
    targetSplit: 'holdout',
  });

  const pollIntervalRef = useRef(null);
  const pollCountRef = useRef(0);
  const cyclePollRef = useRef(null);
  const cyclePollCountRef = useRef(0);

  const stopCyclePoll = () => {
    if (cyclePollRef.current) {
      clearInterval(cyclePollRef.current);
      cyclePollRef.current = null;
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (cyclePollRef.current) {
        clearInterval(cyclePollRef.current);
        cyclePollRef.current = null;
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
  };

  const launchReconcileCycle = async ({ seed, recordCount, splitRatio, targetSplit }) => {
    stopCyclePoll();
    setCycle({
      generating: true,
      running: false,
      statusMessage: '1/2 Generating synthetic ledger, settlement, and bank files…',
      summary: null,
    });

    try {
      const genRes = await api.generateDataset({
        seed: Number(seed),
        record_count: Number(recordCount),
        split_ratio: Number(splitRatio),
      });

      setCycle((prev) => ({
        ...prev,
        generating: false,
        running: true,
        statusMessage: `2/2 Running reconciliation on the ${targetSplit} split…`,
      }));

      const runRes = await api.startReconcileRun({
        dataset_version: genRes.dataset_version,
        split: targetSplit,
      });
      const runId = runRes.run_id;

      cyclePollCountRef.current = 0;
      cyclePollRef.current = setInterval(async () => {
        cyclePollCountRef.current += 1;

        if (cyclePollCountRef.current >= MAX_POLL_ITERATIONS) {
          stopCyclePoll();
          setCycle((prev) => ({
            ...prev,
            generating: false,
            running: false,
            statusMessage: 'Run timed out after 2 minutes. Check the dashboard for status.',
          }));
          return;
        }

        try {
          const sum = await api.getRunSummary(runId);
          if (sum.status === 'completed') {
            stopCyclePoll();
            setCycle({
              generating: false,
              running: false,
              statusMessage: `Run complete. Match rate ${((sum.match_rate || 0) * 100).toFixed(1)}%.`,
              summary: sum,
            });
            await handleRunCompleted(runId);
          } else if (sum.status === 'failed') {
            stopCyclePoll();
            setCycle({
              generating: false,
              running: false,
              statusMessage: `Run failed: ${sum.error_message || 'Unknown error'}`,
              summary: null,
            });
          }
        } catch (pollErr) {
          console.error('Polling error:', pollErr);
        }
      }, 1000);
    } catch (err) {
      stopCyclePoll();
      setCycle({
        generating: false,
        running: false,
        statusMessage: `Error: ${err.message}`,
        summary: null,
      });
    }
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
        <main style={{ flex: 1, padding: '1.35rem 1.75rem', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '1rem', color: 'var(--text-muted)' }}>
              <RefreshCw size={22} className="animate-spin" color="var(--text-muted)" />
              <div style={{ fontSize: '0.875rem' }}>Loading run data…</div>
            </div>
          ) : (
            <>
              {/* Dashboard Overview Tab */}
              {activeTab === 'dashboard' && (
                <div>
                  <div className="page-kicker">Controller</div>
                  <h2 className="page-title">Reconciliation overview</h2>
                  <MetricsRow summary={summary} />
                  <TierBreakdown summary={summary} />
                  <div style={{ marginBottom: '1.5rem' }}>
                    <MatchTable runId={currentRunId} collapsible defaultCollapsed />
                  </div>
                  <div>
                    <ExceptionTable runId={currentRunId} collapsible defaultCollapsed />
                  </div>
                </div>
              )}

              {activeTab === 'matches' && (
                <div>
                  <div className="page-kicker">Worklist</div>
                  <h2 className="page-title">Matched groups</h2>
                  <MatchTable runId={currentRunId} />
                </div>
              )}

              {activeTab === 'exceptions' && (
                <div>
                  <div className="page-kicker">Worklist</div>
                  <h2 className="page-title">Exceptions</h2>
                  <ExceptionTable runId={currentRunId} />
                </div>
              )}

              {/* Run Reconciliation Tab — stay mounted so form + last-run results survive tab switches */}
              <div style={{ display: activeTab === 'reconcile' ? 'block' : 'none' }}>
                <div className="page-kicker">Pipeline</div>
                <h2 className="page-title">Run reconciliation</h2>
                <RunForm
                  cycle={cycle}
                  form={reconcileForm}
                  onFormChange={setReconcileForm}
                  onLaunch={launchReconcileCycle}
                />
                {cycle.summary && (
                  <>
                    <MetricsRow summary={cycle.summary} />
                    <TierBreakdown summary={cycle.summary} />
                  </>
                )}
              </div>

              <div style={{ display: activeTab === 'qa' ? 'block' : 'none' }}>
                <div className="page-kicker">Support</div>
                <ChatPanel runId={currentRunId} />
              </div>

              {activeTab === 'audit' && (
                <div>
                  <div className="page-kicker">Controls</div>
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
