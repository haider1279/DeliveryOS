import React, { useState, useEffect } from 'react';
import { Bug, MessageSquare, Plus, Send, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { BugStatus, CommentVisibility } from '@deliveryos/shared';
import { useAuth } from '../../context/AuthContext';
import { getAvailableBugTransitions } from '../../utils/bug-transitions';

export const QaWorkspace: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [bugs, setBugs] = useState<any[]>([]);
  const [testCases, setTestCases] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'bugs' | 'testcases'>('bugs');

  // Modals
  const [isTestRunModalOpen, setIsTestRunModalOpen] = useState(false);
  const [selectedTestCase, setSelectedTestCase] = useState<any>(null);
  const [runResult, setRunResult] = useState<'PASS' | 'FAIL'>('PASS');
  const [actualResult, setActualResult] = useState('');
  const [runNotes, setRunNotes] = useState('');

  // Create test case modal
  const [isTestCaseModalOpen, setIsTestCaseModalOpen] = useState(false);
  const [tcProjectId, setTcProjectId] = useState('');
  const [tcTitle, setTcTitle] = useState('');
  const [tcSteps, setTcSteps] = useState('');
  const [tcExpected, setTcExpected] = useState('');

  // Bug detail modal
  const [isBugDetailOpen, setIsBugDetailOpen] = useState(false);
  const [bugDetail, setBugDetail] = useState<any>(null);
  const [bugDetailLoading, setBugDetailLoading] = useState(false);
  const [bugComment, setBugComment] = useState('');

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

  useEffect(() => {
    api
      .get<any>('/projects')
      .then((res: any) => setProjects(res || []))
      .catch(() => undefined);
  }, []);

  const handleUpdateBugStatus = async (bugId: string, status: string) => {
    if (!Object.values(BugStatus).includes(status as BugStatus)) return;
    try {
      await api.patch(`/qa/bugs/${bugId}/status`, { status });
      toast.success(`Bug moved to ${status.replace(/_/g, ' ')}`);
      fetchQaData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update bug status');
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
        toast.success('Test run recorded — automated bug spawned and linked to this test case');
      } else {
        toast.success('Test run recorded successfully');
      }

      setIsTestRunModalOpen(false);
      setActualResult('');
      setRunNotes('');
      fetchQaData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record test run');
    }
  };

  const handleCreateTestCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tcProjectId) {
      toast.error('Please select a project');
      return;
    }
    try {
      await api.post('/qa/test-cases', {
        projectId: tcProjectId,
        title: tcTitle,
        steps: tcSteps,
        expectedResult: tcExpected,
      });
      setIsTestCaseModalOpen(false);
      setTcTitle('');
      setTcSteps('');
      setTcExpected('');
      toast.success('Test case created');
      fetchQaData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create test case');
    }
  };

  const openBugDetail = async (bug: any) => {
    setIsBugDetailOpen(true);
    setBugDetail(bug);
    setBugDetailLoading(true);
    try {
      const detail = await api.get<any>(`/qa/bugs/${bug.id}`);
      setBugDetail(detail);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load bug details');
    } finally {
      setBugDetailLoading(false);
    }
  };

  const handleAddBugComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugDetail || !bugComment.trim()) return;
    try {
      await api.post(`/qa/bugs/${bugDetail.id}/comments`, {
        content: bugComment.trim(),
        visibility: CommentVisibility.INTERNAL,
      });
      setBugComment('');
      const detail = await api.get<any>(`/qa/bugs/${bugDetail.id}`);
      setBugDetail(detail);
      toast.success('Comment added');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add comment');
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
                      {(() => {
                        const available = getAvailableBugTransitions(bug.status as BugStatus, user?.role);
                        const canChange = available.length > 1;
                        return (
                          <select
                            value={bug.status}
                            disabled={!canChange}
                            onChange={(e) => handleUpdateBugStatus(bug.id, e.target.value)}
                            aria-label={`Status for bug: ${bug.title}`}
                            className={`text-xs font-semibold rounded-lg px-2 py-1 focus:outline-none ${
                              canChange
                                ? 'bg-slate-50 border border-slate-200 cursor-pointer'
                                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            }`}
                          >
                            {available.map((status) => (
                              <option key={status} value={status}>
                                {status.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                        );
                      })()}
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">{bug.title}</h4>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{bug.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block truncate">
                        Reporter: {bug.reporter?.profile?.firstName || bug.reporter?.email}
                      </span>
                      <span className="block truncate">
                        Assignee: <strong>{bug.assignee?.profile?.firstName || 'Unassigned'}</strong>
                      </span>
                    </div>
                    <button
                      onClick={() => openBugDetail(bug)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 shrink-0"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      View ({bug._count?.comments || 0})
                    </button>
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Test Cases</h3>
            <button
              onClick={() => setIsTestCaseModalOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
            >
              <Plus className="h-3.5 w-3.5" /> Create Test Case
            </button>
          </div>

          {testCases.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No test cases yet"
              description="Define test specifications to automate defect triage on failure."
              action={{ label: 'Create Test Case', onClick: () => setIsTestCaseModalOpen(true) }}
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
            {runResult === 'FAIL' && (
              <p className="mt-2 text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                On failure, an automated bug will be spawned and linked to this test case so it can be tracked to resolution.
              </p>
            )}
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

      {/* Create Test Case Modal */}
      <Modal
        isOpen={isTestCaseModalOpen}
        onClose={() => setIsTestCaseModalOpen(false)}
        title="Create Test Case"
      >
        <form onSubmit={handleCreateTestCase} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Project</label>
            <select
              required
              value={tcProjectId}
              onChange={(e) => setTcProjectId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            >
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Title</label>
            <input
              type="text"
              required
              minLength={3}
              value={tcTitle}
              onChange={(e) => setTcTitle(e.target.value)}
              placeholder="e.g. Verify login persists across sessions"
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Steps</label>
            <textarea
              required
              minLength={5}
              rows={3}
              value={tcSteps}
              onChange={(e) => setTcSteps(e.target.value)}
              placeholder="1. Open app\n2. Log in\n3. Reload page"
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Expected Result</label>
            <textarea
              required
              minLength={3}
              rows={2}
              value={tcExpected}
              onChange={(e) => setTcExpected(e.target.value)}
              placeholder="Session token remains valid after reload"
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsTestCaseModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
            >
              Create Test Case
            </button>
          </div>
        </form>
      </Modal>

      {/* Bug Detail Modal */}
      <Modal
        isOpen={isBugDetailOpen}
        onClose={() => setIsBugDetailOpen(false)}
        title={bugDetail?.title || 'Bug Details'}
        maxWidth="2xl"
      >
        {bugDetailLoading && !bugDetail?.comments ? (
          <div className="py-10">
            <LoadingSpinner size="lg" />
          </div>
        ) : bugDetail ? (
          <div className="space-y-4">
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-2">
              {bugDetail.project?.code && (
                <span className="text-[10px] font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                  {bugDetail.project?.code}
                </span>
              )}
              <PriorityBadge priority={bugDetail.severity} />
              <StatusBadge status={bugDetail.status} />
            </div>

            {/* Description */}
            {bugDetail.description && (
              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700">
                <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Description</strong>
                {bugDetail.description}
              </div>
            )}

            {/* Steps / Expected / Actual */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl">
                <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Steps to Reproduce</strong>
                <span className="text-slate-700 whitespace-pre-line">{bugDetail.stepsToReproduce || '—'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Expected</strong>
                <span className="text-slate-700">{bugDetail.expectedResult || '—'}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Actual</strong>
                <span className="text-slate-700">{bugDetail.actualResult || '—'}</span>
              </div>
            </div>

            {/* Linked entities */}
            {(bugDetail.testCase || bugDetail.task || bugDetail.requirement) && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                {bugDetail.testCase && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold">
                    Test Case: {bugDetail.testCase.title}
                  </span>
                )}
                {bugDetail.task && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                    Task: {bugDetail.task.title}
                  </span>
                )}
                {bugDetail.requirement && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                    Requirement: {bugDetail.requirement.title}
                  </span>
                )}
              </div>
            )}

            {/* People */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 border-t border-slate-100 pt-3">
              <span>
                Reporter: <strong className="text-slate-800">{bugDetail.reporter?.profile?.firstName || bugDetail.reporter?.email}</strong>
              </span>
              <span>
                Assignee:{' '}
                <strong className="text-slate-800">{bugDetail.assignee?.profile?.firstName || 'Unassigned'}</strong>
              </span>
            </div>

            {/* Comments thread */}
            <div className="border-t border-slate-100 pt-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                Comments ({bugDetail.comments?.length || 0})
              </h4>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {(bugDetail.comments || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No comments yet. Add the first note below.</p>
                ) : (
                  bugDetail.comments.map((c: any) => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold shrink-0">
                        {c.author?.profile?.firstName?.[0] || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800">
                            {c.author?.profile?.displayName || c.author?.profile?.firstName || c.author?.email}
                          </span>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${
                              c.visibility === CommentVisibility.CLIENT_VISIBLE
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {c.visibility === CommentVisibility.CLIENT_VISIBLE ? 'Client' : 'Internal'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 break-words">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add comment */}
              <form onSubmit={handleAddBugComment} className="mt-4 flex items-start gap-2">
                <textarea
                  rows={2}
                  value={bugComment}
                  onChange={(e) => setBugComment(e.target.value)}
                  placeholder="Add an internal comment..."
                  className="flex-1 px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={!bugComment.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-3.5 w-3.5" /> Add
                </button>
              </form>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-8 text-center">Unable to load bug details.</p>
        )}
      </Modal>
    </div>
  );
};