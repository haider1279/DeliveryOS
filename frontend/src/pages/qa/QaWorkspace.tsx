import React, { useState, useEffect } from 'react';
import { Bug, CheckCircle2, XCircle, Plus, Search, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';

export const QaWorkspace: React.FC = () => {
  const [bugs, setBugs] = useState<any[]>([]);
  const [testCases, setTestCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'bugs' | 'testcases'>('bugs');

  // Modals
  const [isTestRunModalOpen, setIsTestRunModalOpen] = useState(false);
  const [selectedTestCase, setSelectedTestCase] = useState<any>(null);
  const [runResult, setRunResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [actualResult, setActualResult] = useState('');
  const [runNotes, setRunNotes] = useState('');

  const fetchQaData = async () => {
    try {
      const [bugRes, tcRes]: [any, any] = await Promise.all([
        api.get('/qa/bugs'),
        api.get('/qa/test-cases'),
      ]);
      setBugs(bugRes?.bugs || bugRes || []);
      setTestCases(tcRes?.testCases || tcRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQaData();
  }, []);

  const handleUpdateBugStatus = async (bugId: string, status: string) => {
    try {
      await api.patch(`/qa/bugs/${bugId}/status`, { status });
      fetchQaData();
    } catch (err: any) {
      alert(err.message || 'Failed to update bug status');
    }
  };

  const handleExecuteRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTestCase) return;
    try {
      const res: any = await api.post('/qa/test-runs', {
        testCaseId: selectedTestCase.id,
        result: runResult,
        actualResult: actualResult || (runResult === 'PASS' ? 'Test passed successfully' : 'Test failed'),
        notes: runNotes,
      });

      if (res?.spawnedBugId) {
        alert('Test failed: An automated Bug was spawned and linked to this test case!');
      }

      setIsTestRunModalOpen(false);
      setActualResult('');
      setRunNotes('');
      fetchQaData();
    } catch (err: any) {
      alert(err.message || 'Failed to record test run');
    }
  };

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">QA & Bug Tracker</h2>
          <p className="text-xs text-slate-500 mt-1">
            Execute verification test runs, manage active defects, and trigger retests.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('bugs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'bugs' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            Bugs & Defects ({bugs.length})
          </button>
          <button
            onClick={() => setActiveTab('testcases')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'testcases' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            Test Cases ({testCases.length})
          </button>
        </div>
      </div>

      {/* Bugs Tab */}
      {activeTab === 'bugs' && (
        <div className="space-y-4">
          {bugs.length === 0 ? (
            <EmptyState
              icon={Bug}
              title="No bugs reported"
              description="All systems are nominal with no recorded open defects."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bugs.map((bug) => (
                <div
                  key={bug.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                          {bug.project?.code}
                        </span>
                        <PriorityBadge priority={bug.severity} />
                        <StatusBadge status={bug.status} />
                      </div>
                      <select
                        value={bug.status}
                        onChange={(e) => handleUpdateBugStatus(bug.id, e.target.value)}
                        className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="TRIAGED">TRIAGED</option>
                        <option value="IN_PROGRESS">IN PROGRESS</option>
                        <option value="FIXED">FIXED</option>
                        <option value="READY_FOR_RETEST">READY FOR RETEST</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">{bug.title}</h4>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{bug.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                    <span>
                      Reporter: {bug.reporter?.profile?.firstName || bug.reporter?.email}
                    </span>
                    <span>
                      Assignee:{' '}
                      <strong>{bug.assignee?.profile?.firstName || 'Unassigned'}</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Test Cases Tab */}
      {activeTab === 'testcases' && (
        <div className="space-y-4">
          {testCases.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No test cases yet"
              description="Define test specifications inside project workspaces."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {testCases.map((tc) => (
                <div
                  key={tc.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600 mb-1 inline-block">
                        Test Spec
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">{tc.title}</h4>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedTestCase(tc);
                        setIsTestRunModalOpen(true);
                      }}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100"
                    >
                      Execute Run
                    </button>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
                    <p>
                      <strong>Steps:</strong> {tc.steps}
                    </p>
                    <p>
                      <strong>Expected:</strong> {tc.expectedResult}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Execute Test Run Modal */}
      <Modal
        isOpen={isTestRunModalOpen}
        onClose={() => setIsTestRunModalOpen(false)}
        title={`Execute Test: ${selectedTestCase?.title || ''}`}
      >
        <form onSubmit={handleExecuteRun} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Result</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="radio"
                  name="runResult"
                  value="PASS"
                  checked={runResult === 'PASS'}
                  onChange={() => setRunResult('PASS')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-emerald-700">PASS</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="radio"
                  name="runResult"
                  value="FAIL"
                  checked={runResult === 'FAIL'}
                  onChange={() => setRunResult('FAIL')}
                  className="text-rose-600 focus:ring-rose-500"
                />
                <span className="text-rose-700">FAIL (Auto-spawns Bug)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">Actual Result</label>
            <textarea
              required
              rows={2}
              value={actualResult}
              onChange={(e) => setActualResult(e.target.value)}
              placeholder="Observed behavior during run"
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsTestRunModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-3 py-1.5 rounded text-xs font-semibold text-white ${
                runResult === 'PASS' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              Submit Test Run
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
