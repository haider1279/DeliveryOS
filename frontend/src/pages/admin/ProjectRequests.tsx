import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  User as UserIcon,
  Calendar,
  DollarSign,
  AlertCircle,
  Loader2,
  Eye,
  Check,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { UserRole, ProjectRequestStatus } from '@deliveryos/shared';

interface ProjectRequestItem {
  id: string;
  name: string;
  description?: string | null;
  budget?: number | null;
  targetDate?: string | null;
  status: ProjectRequestStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  organization?: {
    id: string;
    name: string;
    slug?: string;
  } | null;
  requestedBy?: {
    id: string;
    email: string;
    profile?: {
      firstName?: string;
      lastName?: string;
      displayName?: string;
    } | null;
  } | null;
}

const StatusBadge: React.FC<{ status: ProjectRequestStatus }> = ({ status }) => {
  const map = {
    [ProjectRequestStatus.PENDING]: { label: 'Pending Review', cls: 'bg-amber-100 text-amber-800 border-amber-200', Icon: Clock },
    [ProjectRequestStatus.APPROVED]: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', Icon: CheckCircle2 },
    [ProjectRequestStatus.REJECTED]: { label: 'Rejected', cls: 'bg-rose-100 text-rose-800 border-rose-200', Icon: XCircle },
  };
  const { label, cls, Icon } = map[status] || map[ProjectRequestStatus.PENDING];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
};

export const ProjectRequests: React.FC = () => {
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [requests, setRequests] = useState<ProjectRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [search, setSearch] = useState('');

  // Modal states
  const [selectedRequest, setSelectedRequest] = useState<ProjectRequestItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    request: ProjectRequestItem;
    decision: 'APPROVED' | 'REJECTED';
  } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canManage = user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;

  const fetchRequests = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const queryStatus = activeTab === 'ALL' ? undefined : activeTab;
      const res = await api.get<{ data: ProjectRequestItem[] }>('/projects/requests', {
        ...(queryStatus && { status: queryStatus }),
      });
      // Handle both raw array or { data: Array } response structure
      const items = Array.isArray(res) ? res : (res as any).data || [];
      setRequests(items);
    } catch (err: any) {
      toastError(err.message || 'Failed to load project requests');
    } finally {
      setLoading(false);
    }
  }, [activeTab, toastError]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleDecisionSubmit = async () => {
    if (!confirmModal) return;
    setSubmitting(true);
    try {
      await api.patch(`/projects/requests/${confirmModal.request.id}/decision`, {
        decision: confirmModal.decision,
        notes: decisionNotes ? decisionNotes.trim() : undefined,
      });

      toastSuccess(
        confirmModal.decision === 'APPROVED'
          ? 'Project request approved successfully'
          : 'Project request rejected'
      );

      setConfirmModal(null);
      setShowDetailModal(false);
      setDecisionNotes('');
      fetchRequests(false);
    } catch (err: any) {
      toastError(err.message || 'Failed to process project request decision');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRequests = requests.filter((req) => {
    if (activeTab !== 'ALL' && req.status !== activeTab) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const nameMatch = req.name.toLowerCase().includes(term);
      const orgMatch = req.organization?.name.toLowerCase().includes(term);
      const requesterMatch =
        req.requestedBy?.profile?.displayName?.toLowerCase().includes(term) ||
        req.requestedBy?.email?.toLowerCase().includes(term);
      return nameMatch || orgMatch || requesterMatch;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Project Requests</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review and approve client project requests before official onboarding
          </p>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              {tab === 'PENDING'
                ? 'Pending'
                : tab === 'APPROVED'
                ? 'Approved'
                : tab === 'REJECTED'
                ? 'Rejected'
                : 'All Requests'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search request or organization..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
      </div>

      {/* Request List / Grid */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No project requests found</h3>
          <p className="text-xs text-slate-500 mt-1">
            {activeTab === 'PENDING'
              ? 'There are currently no pending project requests to review.'
              : 'No project requests match the selected filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredRequests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-bold text-slate-900 text-base line-clamp-1">{req.name}</h3>
                  <StatusBadge status={req.status} />
                </div>

                <div className="space-y-2 text-xs text-slate-600 mb-4">
                  {req.organization && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span className="font-medium text-slate-800">{req.organization.name}</span>
                    </div>
                  )}

                  {req.requestedBy && (
                    <div className="flex items-center gap-2">
                      <UserIcon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span>
                        {req.requestedBy.profile?.displayName ||
                          req.requestedBy.profile?.firstName ||
                          req.requestedBy.email}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <span>Requested {new Date(req.createdAt).toLocaleDateString()}</span>
                  </div>

                  {req.budget !== null && req.budget !== undefined && (
                    <div className="flex items-center gap-2 text-slate-700 font-semibold">
                      <DollarSign className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <span>${Number(req.budget).toLocaleString()} USD</span>
                    </div>
                  )}
                </div>

                {req.description && (
                  <p className="text-xs text-slate-500 line-clamp-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    {req.description}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setSelectedRequest(req);
                    setShowDetailModal(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Details
                </button>

                {canManage && req.status === ProjectRequestStatus.PENDING && (
                  <>
                    <button
                      onClick={() => {
                        setSelectedRequest(req);
                        setConfirmModal({ request: req, decision: 'APPROVED' });
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-xs"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setSelectedRequest(req);
                        setConfirmModal({ request: req, decision: 'REJECTED' });
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors shadow-xs"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Details Modal */}
      {selectedRequest && showDetailModal && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedRequest(null);
          }}
          title="Project Request Details"
        >
          <div className="space-y-4 text-xs text-slate-700">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">{selectedRequest.name}</h2>
              <StatusBadge status={selectedRequest.status} />
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
              <div>
                <span className="block text-[10px] text-slate-400 font-medium">Organization</span>
                <span className="font-semibold text-slate-800">
                  {selectedRequest.organization?.name || 'N/A'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium">Requested By</span>
                <span className="font-semibold text-slate-800">
                  {selectedRequest.requestedBy?.profile?.displayName ||
                    selectedRequest.requestedBy?.email ||
                    'N/A'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium">Requested Date</span>
                <span className="font-semibold text-slate-800">
                  {new Date(selectedRequest.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 font-medium">Target Date</span>
                <span className="font-semibold text-slate-800">
                  {selectedRequest.targetDate
                    ? new Date(selectedRequest.targetDate).toLocaleDateString()
                    : 'Not specified'}
                </span>
              </div>
              {selectedRequest.budget !== null && selectedRequest.budget !== undefined && (
                <div>
                  <span className="block text-[10px] text-slate-400 font-medium">Estimated Budget</span>
                  <span className="font-semibold text-slate-900">
                    ${Number(selectedRequest.budget).toLocaleString()} USD
                  </span>
                </div>
              )}
            </div>

            {selectedRequest.description && (
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Description
                </label>
                <p className="bg-white p-3 rounded-xl border border-slate-200 text-slate-700 whitespace-pre-wrap">
                  {selectedRequest.description}
                </p>
              </div>
            )}

            {selectedRequest.notes && (
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Notes
                </label>
                <p className="bg-amber-50/50 p-3 rounded-xl border border-amber-200/60 text-amber-900 whitespace-pre-wrap">
                  {selectedRequest.notes}
                </p>
              </div>
            )}

            {canManage && selectedRequest.status === ProjectRequestStatus.PENDING && (
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setConfirmModal({ request: selectedRequest, decision: 'REJECTED' });
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors"
                >
                  Reject Request
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    setConfirmModal({ request: selectedRequest, decision: 'APPROVED' });
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors"
                >
                  Approve Request
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <Modal
          isOpen={!!confirmModal}
          onClose={() => {
            if (!submitting) {
              setConfirmModal(null);
              setDecisionNotes('');
            }
          }}
          title={
            confirmModal.decision === 'APPROVED'
              ? 'Approve Project Request'
              : 'Reject Project Request'
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <AlertCircle
                className={`h-5 w-5 flex-shrink-0 ${
                  confirmModal.decision === 'APPROVED' ? 'text-emerald-600' : 'text-rose-600'
                }`}
              />
              <div className="text-xs text-slate-700">
                <p className="font-semibold text-slate-900">
                  Are you sure you want to {confirmModal.decision.toLowerCase()} &quot;
                  {confirmModal.request.name}&quot;?
                </p>
                <p className="mt-1 text-slate-500">
                  {confirmModal.decision === 'APPROVED'
                    ? 'This marks the request as Approved. Official project creation can be performed separately from the Projects workspace.'
                    : 'This marks the request as Rejected. The client will see the updated request status.'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Decision Notes (Optional)
              </label>
              <textarea
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="Add any review comments or feedback..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setConfirmModal(null);
                  setDecisionNotes('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDecisionSubmit}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors flex items-center gap-1.5 ${
                  confirmModal.decision === 'APPROVED'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {confirmModal.decision === 'APPROVED' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
