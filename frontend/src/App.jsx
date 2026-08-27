import React, { useState, useEffect } from 'react';
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
import { Sparkles, Activity, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

export function App() {
  const [runs, setRuns] = useState([]);
  const [currentRunId, setCurrentRunId] = useState('');
  const [summary, setSummary] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    if (currentRunId) {
      loadRunSummary(currentRunId);
    }
  }, [currentRunId]);

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

      // Poll until ready
      const poll = setInterval(async () => {
        const sum = await api.getRunSummary(newRunId);
        if (sum.status === 'completed') {
          clearInterval(poll);
          const updatedRuns = await api.listRuns();
          setRuns(updatedRuns.results || []);
          setCurrentRunId(newRunId);
        }
      }, 1000);
    } catch (e) {
      console.error('Initial generation error:', e);
    }
  };

  const loadRunSummary = async (runId) => {
    setIsRefreshing(true);
    try {
      const data = await api.getRunSummary(runId);
      setSummary(data);
    } catch (err) {
      console.error('Failed to load run summary:', err);
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
          exceptionCount={summary?.exception_count || 0}
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

              {/* Matched Groups Tab */}
              {activeTab === 'matches' && (
                <div>
                  <MatchTable runId={currentRunId} />
                </div>
              )}

              {/* Exceptions Tab */}
              {activeTab === 'exceptions' && (
                <div>
                  <ExceptionTable runId={currentRunId} />
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
