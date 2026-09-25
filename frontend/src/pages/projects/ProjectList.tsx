import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, FolderKanban, Calendar, DollarSign, User, FileText } from 'lucide-react';
import { api } from '../../api/client';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { HealthBadge } from '../../components/ui/HealthBadge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '@deliveryos/shared';
import { ProjectRequests } from '../admin/ProjectRequests';

export const ProjectList: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'projects';
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // New Project Form State
  const [orgs, setOrgs] = useState<any[]>([]);
  const [pms, setPms] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [orgId, setOrgId] = useState('');
  const [pmId, setPmId] = useState('');
  const [budget, setBudget] = useState('50000');
  const [targetDate, setTargetDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      const data = await api.get<any[]>('/projects', {
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setProjects(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [search, statusFilter]);

  const handleOpenCreate = async () => {
    setIsCreateOpen(true);
    try {
      const [orgsData, usersData] = await Promise.all([
        api.get<any>('/organizations').then((r: any) => (Array.isArray(r) ? r : r.orgs || r.data || [])),
        api.get<any>('/users').then((r: any) => (Array.isArray(r) ? r : r.users || r.data || [])),
      ]);
      const approvedOrgs = (orgsData || []).filter((o: any) => !o.qualificationStatus || o.qualificationStatus === 'APPROVED');
      setOrgs(approvedOrgs);
      const eligiblePms = (usersData || []).filter((u: any) => u.role === UserRole.PROJECT_MANAGER);
      setPms(eligiblePms);
      if (approvedOrgs.length > 0) setOrgId(approvedOrgs[0].id);
      if (eligiblePms.length > 0) setPmId(eligiblePms[0].id);
    } catch {
      // ignore
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreating(true);
    try {
      await api.post('/projects', {
        name,
        code: code.toUpperCase(),
        organizationId: orgId,
        projectManagerId: pmId,
        budget: parseFloat(budget) || 0,
        targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
      });
      setIsCreateOpen(false);
      setName('');
      setCode('');
      fetchProjects();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const canCreate =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.ADMIN;

  return (
    <div className="space-y-6">
      {/* Header with Search & New Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Projects</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage all active client deliverables, requirements, tasks, and releases.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        )}
      </div>

      {/* Workspace Tabs for Admin/SuperAdmin */}
      {canCreate && (
        <div className="flex border-b border-slate-200 gap-6">
          <button
            onClick={() => setSearchParams({ tab: 'projects' })}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              currentTab !== 'requests'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FolderKanban className="h-4 w-4" /> Active & Deployed Projects
          </button>
          <button
            onClick={() => setSearchParams({ tab: 'requests' })}
            className={`pb-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              currentTab === 'requests'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText className="h-4 w-4" /> Project Requests
          </button>
        </div>
      )}

      {currentTab === 'requests' && canCreate ? (
        <ProjectRequests />
      ) : (
        <>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search projects by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter projects by status"
          className="w-full sm:w-48 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-brand-500"
        >
          <option value="">All Statuses</option>
          <option value="PLANNING">Planning</option>
          <option value="ACTIVE">Active</option>
          <option value="CLIENT_REVIEW">Client Review</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <LoadingSpinner size="lg" className="h-64" />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects found"
          description="Create your first client delivery project to begin scoping requirements and tasks."
          action={canCreate ? { label: 'Create Project', onClick: handleOpenCreate } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p: any) => (
            <Link
              key={p.id}
              to={`/app/projects/${p.id}`}
              className="group flex flex-col justify-between p-6 rounded-2xl bg-white border border-slate-200 hover:border-brand-400 hover:shadow-md transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                    {p.code}
                  </span>
                  <StatusBadge status={p.status} />
                </div>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                  {p.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1">{p.organization?.name}</p>
                {p.description && (
                  <p className="text-xs text-slate-600 mt-3 line-clamp-2">{p.description}</p>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-500">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    {p.projectManager?.profile?.firstName || 'PM'}
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-slate-800">
                    <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                    {Number(p.budget || 0).toLocaleString()} {p.currency}
                  </span>
                </div>
                {p.targetDate && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Calendar className="h-3 w-3" />
                    Target: {new Date(p.targetDate).toLocaleDateString()}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
        </>
      )}

      {/* Create Project Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create New Project">
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-600">
              {formError}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700">Project Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Mobile App V2"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Project Code (Uppercase)
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. ACM-APP"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono uppercase focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Client Organization
            </label>
            <select
              required
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-brand-500"
            >
              {orgs.map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Project Manager</label>
            <select
              required
              value={pmId}
              onChange={(e) => setPmId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-brand-500"
            >
              {pms.map((pm: any) => (
                <option key={pm.id} value={pm.id}>
                  {pm.profile?.displayName || pm.email}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Budget ($)</label>
              <input
                type="number"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Target Date</label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
