import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Calendar, ArrowRight, User, Plus, Clock, FileText, DollarSign } from 'lucide-react';
import { api } from '../../api/client';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';

interface ProjectRequestItem {
  id: string;
  name: string;
  description?: string;
  budget?: number;
  targetDate?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  notes?: string;
  createdAt: string;
}

export const ClientProjects: React.FC = () => {
  const toast = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [requests, setRequests] = useState<ProjectRequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    budget: '',
    targetDate: '',
    notes: '',
  });

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [projectsData, requestsData] = await Promise.all([
        api.get<any[]>('/projects').catch(() => []),
        api.get<any>('/projects/requests').catch(() => []),
      ]);
      setProjects(projectsData || []);
      const reqList = Array.isArray(requestsData) ? requestsData : requestsData?.data || [];
      setRequests(reqList);
    } catch (err: any) {
      console.error(err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // The platform has no realtime transport, so an admin approval performed in
  // another session would otherwise leave this tab stale until a manual
  // reload. Refetching when the tab regains focus keeps the request status and
  // the resulting project current without forcing the client to refresh.
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') fetchData(false);
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [fetchData]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/projects/requests', {
        name: form.name,
        description: form.description || undefined,
        budget: form.budget ? parseFloat(form.budget) : undefined,
        targetDate: form.targetDate ? new Date(form.targetDate).toISOString() : undefined,
        notes: form.notes || undefined,
      });
      toast.success('Project request submitted successfully! An administrator will review your request.');
      setIsRequestOpen(false);
      setForm({ name: '', description: '', budget: '', targetDate: '', notes: '' });
      fetchData(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit project request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Your Active Projects</h2>
          <p className="text-xs text-slate-500 mt-1">
            Track development milestones, review and approve estimates, and inspect deliverables.
          </p>
        </div>
        <button
          onClick={() => setIsRequestOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" /> Request New Project
        </button>
      </div>

      {/* Active & Deployed Projects */}
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects assigned"
          description="Your team does not currently have any active or deployed projects."
        />
      ) : (
        <div className="space-y-8">
          {/* Active Delivery Projects */}
          {projects.filter((p) => p.status !== 'COMPLETED').length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                In-Progress Delivery
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects
                  .filter((p) => p.status !== 'COMPLETED')
                  .map((p) => (
                    <Link
                      key={p.id}
                      to={`/portal/projects/${p.id}`}
                      className="group flex flex-col justify-between p-6 rounded-2xl bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {p.code}
                          </span>
                          <StatusBadge status={p.status} />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {p.name}
                        </h3>
                        {p.description && (
                          <p className="text-xs text-slate-500 mt-2 line-clamp-2">{p.description}</p>
                        )}
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          PM: {p.projectManager?.profile?.firstName || 'Lead'}
                        </span>
                        <span className="flex items-center gap-1 text-indigo-600 font-semibold group-hover:translate-x-1 transition-transform">
                          Delivery Portal <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          )}

          {/* Deployed & Completed Projects */}
          {projects.filter((p) => p.status === 'COMPLETED').length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Deployed & Operational Systems
                </h3>
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  Production Active
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects
                  .filter((p) => p.status === 'COMPLETED')
                  .map((p) => (
                    <Link
                      key={p.id}
                      to={`/portal/projects/${p.id}`}
                      className="group flex flex-col justify-between p-6 rounded-2xl bg-white border border-emerald-200/80 hover:border-emerald-400 hover:shadow-lg transition-all"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {p.code}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Deployed
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                          {p.name}
                        </h3>
                        {p.description && (
                          <p className="text-xs text-slate-500 mt-2 line-clamp-2">{p.description}</p>
                        )}
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span className="text-slate-400 text-[11px]">
                          Maintenance & Defect Support
                        </span>
                        <span className="flex items-center gap-1 text-emerald-600 font-semibold group-hover:translate-x-1 transition-transform">
                          Live Portal <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submitted Requests Section */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Project Requests</h3>
            <p className="text-xs text-slate-500">
              Submitted project requests pending review by agency administrators.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
            {requests.length}
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-slate-400 text-xs">
            <FileText className="h-6 w-6 mx-auto mb-2 opacity-50" />
            No project requests submitted yet. Use the button above to request a new project.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {requests.map((r) => (
              <div key={r.id} className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-900">{r.name}</h4>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    r.status === 'APPROVED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : r.status === 'REJECTED'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    <Clock className="h-3 w-3" />
                    {r.status}
                  </span>
                </div>
                {r.description && <p className="text-xs text-slate-500 line-clamp-2">{r.description}</p>}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  {r.budget && (
                    <span className="flex items-center gap-1 font-semibold text-slate-700">
                      <DollarSign className="h-3 w-3" /> ${Number(r.budget).toLocaleString()}
                    </span>
                  )}
                  <span>Submitted {new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit Project Request Modal */}
      <Modal isOpen={isRequestOpen} onClose={() => setIsRequestOpen(false)} title="Request New Project">
        <form onSubmit={handleSubmitRequest} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Project Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Mobile E-Commerce Redesign"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Provide a high-level overview of the target project requirements…"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Budget ($)</label>
              <input
                type="number"
                min="0"
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                placeholder="25000"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Launch Date</label>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Additional Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Any specific constraints, timeline preferences, or links…"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsRequestOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
