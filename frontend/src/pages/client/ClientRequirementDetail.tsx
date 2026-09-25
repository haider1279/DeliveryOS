import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  History,
  Calendar,
  DollarSign,
  FileText,
  HelpCircle,
  Send,
} from 'lucide-react';
import { api } from '../../api/client';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';

export const ClientRequirementDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [req, setReq] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [decision, setDecision] = useState<'APPROVED' | 'CHANGES_REQUESTED'>('APPROVED');
  const [comment, setComment] = useState('');
  const [isDecisionOpen, setIsDecisionOpen] = useState(false);

  const [clientResponse, setClientResponse] = useState('');
  const [submittingClarification, setSubmittingClarification] = useState(false);

  const fetchData = async () => {
    setLoadError(null);
    try {
      const data = await api.get(`/requirements/${id}`);
      setReq(data);
    } catch (err: any) {
      console.error(err);
      setLoadError(err.message || 'Failed to load this requirement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  if (!req) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
        <p className="text-sm font-semibold text-rose-800">{loadError || 'Requirement not found.'}</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const sentEstimate = (req.estimates || []).find((est: any) => est.status === 'SENT');

  const handleDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sentEstimate) return;
    try {
      await api.post(`/requirements/${id}/approvals`, {
        requirementVersion: req.currentVersion,
        estimateId: sentEstimate.id,
        estimateVersion: sentEstimate.version,
        decision,
        comment,
      });
      setIsDecisionOpen(false);
      setComment('');
      toast.success(decision === 'APPROVED' ? 'Approved — your team has been notified.' : 'Feedback sent to your team.');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit decision');
    }
  };

  const openDecision = (d: 'APPROVED' | 'CHANGES_REQUESTED') => {
    setDecision(d);
    setIsDecisionOpen(true);
  };

  const latestClarification = [...(req?.statusHistory || [])]
    .reverse()
    .find((h: any) => h.toStatus === 'NEEDS_CLARIFICATION');

  const handleSendClarificationResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientResponse.trim()) return;
    setSubmittingClarification(true);
    try {
      await api.post(`/requirements/${id}/transition`, {
        toStatus: 'UNDER_REVIEW',
        comment: clientResponse.trim(),
      });
      toast.success('Clarification response submitted. Your requirement is now under review.');
      setClientResponse('');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit clarification response');
    } finally {
      setSubmittingClarification(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      </div>

      {/* Requirement header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-xs font-bold text-slate-400">v{req.currentVersion}</span>
              <StatusBadge status={req.status} />
              <PriorityBadge priority={req.priority} />
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900">{req.title}</h1>
            <p className="text-xs text-slate-500 mt-1">
              {req.project?.name} • Submitted by{' '}
              {req.submittedBy?.profile?.firstName || req.submittedBy?.email || 'client'}
            </p>
          </div>
          {req.status === 'WAITING_FOR_APPROVAL' && sentEstimate ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => openDecision('CHANGES_REQUESTED')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100"
              >
                <XCircle className="h-3.5 w-3.5" /> Request Changes
              </button>
              <button
                onClick={() => openDecision('APPROVED')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve & Start
              </button>
            </div>
          ) : null}
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">{req.description}</p>
        <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-100">
          <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
            Acceptance Criteria
          </strong>
          {req.acceptanceCriteria}
        </div>
      </div>

      {/* Clarification Card */}
      {req.status === 'NEEDS_CLARIFICATION' && (
        <div className="bg-amber-50/90 border border-amber-200 p-6 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <HelpCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <span>Clarification Requested by Agency</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-100 space-y-1">
            <p className="text-xs font-semibold text-slate-800">Agency PM Question:</p>
            <p className="text-xs text-slate-700 leading-relaxed">
              {latestClarification?.comment || 'The project manager requested additional information before proceeding.'}
            </p>
            {latestClarification?.createdAt && (
              <span className="block text-[10px] text-slate-400 mt-1">
                Requested on {new Date(latestClarification.createdAt).toLocaleString()}
              </span>
            )}
          </div>

          <form onSubmit={handleSendClarificationResponse} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-amber-900 mb-1">
                Your Answer / Clarification
              </label>
              <textarea
                required
                rows={3}
                value={clientResponse}
                onChange={(e) => setClientResponse(e.target.value)}
                placeholder="Provide the requested details or answers here..."
                className="w-full px-3 py-2 rounded-xl border border-amber-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submittingClarification || !clientResponse.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 shadow-sm transition-colors disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {submittingClarification ? 'Submitting...' : 'Send Clarification'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Estimate card */}
      {sentEstimate ? (
        <div className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-indigo-500" /> Proposed Estimate (E{sentEstimate.version})
            </h3>
            <StatusBadge status={sentEstimate.status} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-[10px] uppercase font-bold text-slate-400">Dev Hours</p>
              <p className="text-sm font-bold text-slate-900">{sentEstimate.devHours}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-[10px] uppercase font-bold text-slate-400">QA Hours</p>
              <p className="text-sm font-bold text-slate-900">{sentEstimate.qaHours}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-[10px] uppercase font-bold text-slate-400">Design Hours</p>
              <p className="text-sm font-bold text-slate-900">{sentEstimate.designHours ?? 0}</p>
            </div>
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <p className="text-[10px] uppercase font-bold text-indigo-400">Client Price</p>
              <p className="text-sm font-black text-slate-900">
                ${Number(sentEstimate.clientPrice).toLocaleString()}
              </p>
            </div>
          </div>

          {sentEstimate.proposedDeliveryDate && (
            <p className="text-xs text-slate-600 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              Proposed delivery:{' '}
              <strong>{new Date(sentEstimate.proposedDeliveryDate).toLocaleDateString()}</strong>
            </p>
          )}

          {sentEstimate.assumptions && (
            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-100">
              <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Assumptions
              </strong>
              {sentEstimate.assumptions}
            </div>
          )}
          {sentEstimate.exclusions && (
            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-100">
              <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Exclusions
              </strong>
              {sentEstimate.exclusions}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => openDecision('CHANGES_REQUESTED')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100"
            >
              <XCircle className="h-3.5 w-3.5" /> Request Changes
            </button>
            <button
              onClick={() => openDecision('APPROVED')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve & Start
            </button>
          </div>
        </div>
      ) : null}

      {/* Approval history */}
      {req.approvals?.length ? (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Approval History</h3>
          <div className="space-y-2">
            {req.approvals.map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 text-xs border border-slate-100 rounded-xl p-3">
                <StatusBadge status={a.decision} />
                <div>
                  <p className="text-slate-700">
                    Estimate E{a.estimateVersion} • {new Date(a.decidedAt).toLocaleString()}
                  </p>
                  {a.comment && <p className="text-slate-500 mt-0.5">{a.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Status history */}
      {req.statusHistory?.length ? (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400" /> Progress Timeline
          </h3>
          <div className="space-y-2">
            {req.statusHistory.map((h: any) => (
              <div key={h.id} className="flex items-start gap-3 text-xs">
                <span className="text-slate-400 mt-1">
                  <History className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-slate-700">
                    <span className="font-semibold text-slate-900">{h.fromStatus}</span> →{' '}
                    <span className="font-semibold text-slate-900">{h.toStatus}</span>
                    <span className="text-slate-400 ml-2">{new Date(h.createdAt).toLocaleString()}</span>
                  </p>
                  {h.comment && <p className="text-slate-500 mt-0.5">{h.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon={FileText} title="No activity yet" description="Status updates will appear here as the work progresses." />
      )}

      {/* Decision modal */}
      <Modal
        isOpen={isDecisionOpen}
        onClose={() => {
          setIsDecisionOpen(false);
          setComment('');
        }}
        title={decision === 'APPROVED' ? 'Approve Estimate & Start Work' : 'Request Changes'}
      >
        <form onSubmit={handleDecision} className="space-y-4">
          {decision === 'APPROVED' ? (
            <p className="text-xs text-slate-600">
              Approving E{sentEstimate?.version} for <strong>{req.title}</strong> (v{req.currentVersion})
              confirms the scope and price. Your team will be notified to begin work.
            </p>
          ) : (
            <p className="text-xs text-slate-600">
              Let your team know what needs to change before the work can be approved.
            </p>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700">Comment / Feedback</label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                decision === 'APPROVED'
                  ? 'Optional approval note for the team'
                  : 'Describe the changes you need before approval'
              }
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsDecisionOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white ${
                decision === 'APPROVED'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {decision === 'APPROVED' ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Approval
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5" /> Send Request
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};