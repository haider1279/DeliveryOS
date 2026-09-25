import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileText,
  Rocket,
  Plus,
  CheckCircle2,
  AlertCircle,
  Calendar,
  DollarSign,
  HelpCircle,
  Bug,
  ShieldCheck,
  Activity,
  Layers,
  Sparkles,
} from 'lucide-react';
import { api } from '../../api/client';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';

export const ClientProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [project, setProject] = useState<any>(null);
  const [requirements, setRequirements] = useState<any[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [bugs, setBugs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Submit Requirement Modal (Pre-deployment only)
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');

  // Review Modal (Pre-deployment only)
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'CHANGES_REQUESTED'>('APPROVED');
  const [reviewComment, setReviewComment] = useState('');

  // Bug Report Modal (Client defect / warranty reporting)
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [bugSeverity, setBugSeverity] = useState('MEDIUM');
  const [bugSteps, setBugSteps] = useState('');
  const [bugExpected, setBugExpected] = useState('');
  const [bugActual, setBugActual] = useState('');
  const [bugReqId, setBugReqId] = useState('');
  const [submittingBug, setSubmittingBug] = useState(false);

  const fetchProjectData = async () => {
    setLoadError(null);
    try {
      const [pRes, rRes, relRes, bugRes]: [any, any, any, any] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get('/requirements', { projectId: id }),
        api.get('/releases', { projectId: id }),
        api.get('/qa/bugs', { projectId: id }).catch(() => ({ bugs: [] })),
      ]);
      setProject(pRes);
      setRequirements(rRes?.items || rRes || []);
      setReleases(relRes?.releases || relRes || []);
      setBugs(bugRes?.bugs || bugRes || []);
    } catch (err: any) {
      console.error(err);
      setLoadError(err.message || 'Failed to load this project');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  const isDeployed =
    project?.status === 'COMPLETED' ||
    releases.some((r: any) => r.status === 'DEPLOYED');

  const deployedReleases = releases.filter((r: any) => r.status === 'DEPLOYED');
  const latestRelease = deployedReleases[0] || releases[0];

  const handleSubmitRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDeployed) {
      toast.error('Cannot submit new requirements to a completed or deployed project.');
      return;
    }
    try {
      await api.post('/requirements', {
        projectId: id,
        title,
        description,
        acceptanceCriteria,
        priority: 'MEDIUM',
      });
      setIsSubmitOpen(false);
      setTitle('');
      setDescription('');
      setAcceptanceCriteria('');
      toast.success('Requirement submitted to the project manager.');
      fetchProjectData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit requirement');
    }
  };

  const handleClientReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReq) return;
    if (isDeployed) {
      toast.error('Requirements cannot be reviewed on a completed or deployed project.');
      return;
    }
    try {
      await api.post(`/releases/requirements/${selectedReq.id}/review`, {
        requirementVersion: selectedReq.currentVersion,
        decision: reviewDecision,
        comment: reviewComment,
      });
      setIsReviewOpen(false);
      setReviewComment('');
      toast.success(reviewDecision === 'APPROVED' ? 'Milestone approved — great work!' : 'Revisions requested.');
      fetchProjectData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit review');
    }
  };

  const handleReportBug = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingBug(true);
    try {
      await api.post('/qa/bugs', {
        projectId: id,
        title: bugTitle,
        description: bugDescription,
        severity: bugSeverity,
        stepsToReproduce: bugSteps,
        expectedResult: bugExpected,
        actualResult: bugActual,
        requirementId: bugReqId || undefined,
      });
      setIsBugModalOpen(false);
      setBugTitle('');
      setBugDescription('');
      setBugSteps('');
      setBugExpected('');
      setBugActual('');
      setBugReqId('');
      toast.success('Warranty defect reported to QA and engineering team.');
      fetchProjectData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit bug report');
    } finally {
      setSubmittingBug(false);
    }
  };

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  if (!project) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
        <p className="text-sm font-semibold text-rose-800">{loadError || 'Project not found.'}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchProjectData();
            }}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Try again
          </button>
          <Link
            to="/portal/projects"
            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Back to projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-bold text-slate-500">
              {project.code}
            </span>
            <StatusBadge status={project.status} />
            {project.status === 'COMPLETED' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Live in Production
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{project.name}</h1>
          <p className="text-xs text-slate-500 mt-1">
            Project Lead: {project.projectManager?.profile?.firstName || 'Project Manager'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isDeployed ? (
            <button
              onClick={() => setIsBugModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-600/20 transition-all"
            >
              <Bug className="h-4 w-4" /> Report Production Bug / Issue
            </button>
          ) : (
            <button
              onClick={() => setIsSubmitOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all"
            >
              <Plus className="h-4 w-4" /> Request New Feature / Requirement
            </button>
          )}
        </div>
      </div>

      {/* Post-Deployment Operational Overview Card (When Deployed) */}
      {isDeployed && (
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-7 rounded-2xl shadow-xl border border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-900/60 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Deployed & Operational
                </span>
                {latestRelease && (
                  <span className="font-mono text-xs font-bold bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-md border border-indigo-500/30">
                    Release {latestRelease.version}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white pt-1">
                Project Shipped & Maintenance Active
              </h2>
              <p className="text-xs text-slate-300">
                This project has officially launched into production. Active delivery planning is completed and post-launch warranty support is enabled.
              </p>
            </div>

            {latestRelease?.deployedAt && (
              <div className="text-right sm:border-l sm:border-indigo-900/60 sm:pl-6 shrink-0">
                <span className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Deployment Date</span>
                <span className="text-sm font-bold text-white">
                  {new Date(latestRelease.deployedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Operational Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-300">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <span className="text-2xl font-black text-white">{requirements.length}</span>
                <span className="block text-xs text-slate-300 font-medium">Delivered Requirements</span>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-500/20 text-indigo-300">
                <Rocket className="h-5 w-5" />
              </div>
              <div>
                <span className="text-2xl font-black text-white">{deployedReleases.length || 1}</span>
                <span className="block text-xs text-slate-300 font-medium">Production Releases</span>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-rose-500/20 text-rose-300">
                <Bug className="h-5 w-5" />
              </div>
              <div>
                <span className="text-2xl font-black text-white">{bugs.length}</span>
                <span className="block text-xs text-slate-300 font-medium">Reported Warranty Issues</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delivered Releases & Release Notes */}
      {releases.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Rocket className="h-4 w-4 text-indigo-600" />
              Delivered Releases & Versions
            </h3>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
              {releases.length} Release{releases.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {releases.map((rel) => (
              <div
                key={rel.id}
                className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono text-xs font-bold border border-indigo-100">
                    {rel.version}
                  </span>
                  <StatusBadge status={rel.status} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{rel.name}</h4>
                  {rel.deployedAt && (
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Shipped {new Date(rel.deployedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {rel.releaseNotes && (
                  <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-100">
                    <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      Release Notes
                    </strong>
                    {rel.releaseNotes}
                  </div>
                )}
                {rel.items && rel.items.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                    <span className="block text-[10px] uppercase font-bold text-slate-400">Included Scope</span>
                    {rel.items.map((item: any) => (
                      <div key={item.id} className="flex items-center gap-1.5 text-slate-700">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span className="truncate">{item.requirement?.title || item.bug?.title || item.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Post-Deployment Support & Reported Bugs Section */}
      {isDeployed && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Bug className="h-4 w-4 text-rose-600" />
                Post-Deployment Defect & Warranty Reports
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Issues reported post-launch are monitored and triaged by our engineering and QA teams.
              </p>
            </div>
            <button
              onClick={() => setIsBugModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-all shrink-0"
            >
              <Plus className="h-3.5 w-3.5" /> Report Issue
            </button>
          </div>

          {bugs.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white border border-slate-200/80 text-center space-y-2 shadow-xs">
              <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800">All Systems Nominal</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                No active warranty defects or bugs reported for this deployment. If you notice any unexpected behavior, please report it.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bugs.map((bug) => (
                <div
                  key={bug.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PriorityBadge priority={bug.severity} />
                      <StatusBadge status={bug.status} />
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {new Date(bug.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{bug.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">{bug.description}</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1 text-slate-700 border border-slate-100">
                    <div>
                      <strong className="text-[10px] uppercase font-bold text-slate-400">Expected: </strong>
                      <span>{bug.expectedResult || '—'}</span>
                    </div>
                    <div>
                      <strong className="text-[10px] uppercase font-bold text-slate-400">Actual: </strong>
                      <span>{bug.actualResult || '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delivered / Planned Scope Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-600" />
          {isDeployed ? 'Delivered Features & Requirements' : 'Requirements & Milestone Scope'}
        </h3>

        {requirements.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No requirements recorded"
            description={
              isDeployed
                ? 'No requirements were formally attached to this project.'
                : 'Submit a feature request or scope item to begin estimation.'
            }
            action={!isDeployed ? { label: 'Submit Requirement', onClick: () => setIsSubmitOpen(true) } : undefined}
          />
        ) : (
          <div className="space-y-4">
            {requirements.map((req) => (
              <div
                key={req.id}
                className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono font-bold text-slate-400">
                        v{req.currentVersion}
                      </span>
                      <StatusBadge status={req.status} />
                    </div>
                    <h4 className="text-base font-bold text-slate-900">{req.title}</h4>
                  </div>

                  {/* Pre-deployment client actions only */}
                  {!isDeployed && req.status === 'CLIENT_REVIEW' && (
                    <button
                      onClick={() => {
                        setSelectedReq(req);
                        setIsReviewOpen(true);
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                    >
                      Review & Approve Delivery
                    </button>
                  )}

                  {!isDeployed && req.status === 'NEEDS_CLARIFICATION' && (
                    <Link
                      to={`/portal/requirements/${req.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                    >
                      <HelpCircle className="h-3.5 w-3.5" /> Respond to Clarification
                    </Link>
                  )}

                  {!isDeployed && req.status === 'WAITING_FOR_APPROVAL' && (
                    <Link
                      to={`/portal/requirements/${req.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    >
                      <DollarSign className="h-3.5 w-3.5" /> Review Estimate
                    </Link>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{req.description}</p>
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-100">
                  <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Acceptance Criteria
                  </strong>
                  {req.acceptanceCriteria}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit Requirement Modal (Pre-deployment only) */}
      {!isDeployed && (
        <Modal
          isOpen={isSubmitOpen}
          onClose={() => setIsSubmitOpen(false)}
          title="Submit New Feature Request"
        >
          <form onSubmit={handleSubmitRequirement} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Feature Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Export orders to CSV"
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Detailed Description
              </label>
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain the workflow, user experience, and business goal"
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Acceptance Criteria
              </label>
              <textarea
                required
                rows={2}
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                placeholder="What must be true for this feature to be approved?"
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setIsSubmitOpen(false)}
                className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Submit to PM
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Client Review Modal (Pre-deployment only) */}
      {!isDeployed && (
        <Modal
          isOpen={isReviewOpen}
          onClose={() => setIsReviewOpen(false)}
          title={`Review Milestone: ${selectedReq?.title || ''}`}
        >
          <form onSubmit={handleClientReview} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Your Decision</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="reviewDecision"
                    value="APPROVED"
                    checked={reviewDecision === 'APPROVED'}
                    onChange={() => setReviewDecision('APPROVED')}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-emerald-700">Approve & Complete</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="reviewDecision"
                    value="CHANGES_REQUESTED"
                    checked={reviewDecision === 'CHANGES_REQUESTED'}
                    onChange={() => setReviewDecision('CHANGES_REQUESTED')}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span className="text-rose-700">Request Revisions</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Feedback / Notes</label>
              <textarea
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Any comments, QA feedback, or approval sign-off note"
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`px-3 py-1.5 rounded text-xs font-semibold text-white ${
                  reviewDecision === 'APPROVED' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Submit Decision
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Report Bug / Defect Modal (Available Post-Deployment) */}
      <Modal
        isOpen={isBugModalOpen}
        onClose={() => setIsBugModalOpen(false)}
        title="Report Production Defect / Issue"
      >
        <form onSubmit={handleReportBug} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Issue Title *</label>
            <input
              type="text"
              required
              value={bugTitle}
              onChange={(e) => setBugTitle(e.target.value)}
              placeholder="e.g. Checkout button unresponsive on mobile Safari"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
            <textarea
              required
              rows={2}
              minLength={5}
              value={bugDescription}
              onChange={(e) => setBugDescription(e.target.value)}
              placeholder="Briefly describe the issue and when it occurs"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-rose-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Severity</label>
              <select
                value={bugSeverity}
                onChange={(e) => setBugSeverity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-rose-500"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Linked Feature</label>
              <select
                value={bugReqId}
                onChange={(e) => setBugReqId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-rose-500"
              >
                <option value="">(None / General)</option>
                {requirements.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Steps to Reproduce *</label>
            <textarea
              required
              rows={3}
              value={bugSteps}
              onChange={(e) => setBugSteps(e.target.value)}
              placeholder="1. Navigate to /checkout&#10;2. Click place order&#10;3. Page remains stuck"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-rose-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Behavior *</label>
              <textarea
                required
                rows={2}
                value={bugExpected}
                onChange={(e) => setBugExpected(e.target.value)}
                placeholder="Order confirmation receipt displays"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Actual Result *</label>
              <textarea
                required
                rows={2}
                value={bugActual}
                onChange={(e) => setBugActual(e.target.value)}
                placeholder="Spinning loader freezes indefinitely"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsBugModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingBug}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {submittingBug ? 'Reporting…' : 'Submit Defect Report'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
