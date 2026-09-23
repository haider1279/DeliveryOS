import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileText,
  Rocket,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  DollarSign,
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
  const [loading, setLoading] = useState(true);

  // Submit Requirement Modal
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');

  // Review Modal
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'CHANGES_REQUESTED'>('APPROVED');
  const [reviewComment, setReviewComment] = useState('');

  const fetchProjectData = async () => {
    try {
      const [pRes, rRes, relRes]: [any, any, any] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get('/requirements', { projectId: id }),
        api.get('/releases', { projectId: id }),
      ]);
      setProject(pRes);
      setRequirements(rRes?.items || rRes || []);
      setReleases(relRes?.releases || relRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  const handleSubmitRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
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

  if (loading || !project) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="font-mono text-xs font-bold text-slate-500 mb-1 inline-block">
            {project.code}
          </span>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{project.name}</h1>
          <p className="text-xs text-slate-500 mt-1">
            Project Lead: {project.projectManager?.profile?.firstName || 'Project Manager'}
          </p>
        </div>

        <button
          onClick={() => setIsSubmitOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all"
        >
          <Plus className="h-4 w-4" /> Request New Feature / Requirement
        </button>
      </div>

      {/* Requirements Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Requirements & Milestone Scope
        </h3>

        {requirements.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No requirements submitted yet"
            description="Submit a feature request or scope item to begin estimation."
            action={{ label: 'Submit Requirement', onClick: () => setIsSubmitOpen(true) }}
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

                  {req.status === 'CLIENT_REVIEW' && (
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

                  {req.status === 'WAITING_FOR_APPROVAL' && (
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

      {/* Releases Section */}
      {releases.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Delivered Releases & Versions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {releases.map((rel) => (
              <div
                key={rel.id}
                className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-xs font-bold">
                    {rel.version}
                  </span>
                  <StatusBadge status={rel.status} />
                </div>
                <h4 className="text-sm font-bold text-slate-900">{rel.name}</h4>
                {rel.releaseNotes && (
                  <p className="text-xs text-slate-500 mt-2">{rel.releaseNotes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit Requirement Modal */}
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

      {/* Client Review Modal */}
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
    </div>
  );
};
