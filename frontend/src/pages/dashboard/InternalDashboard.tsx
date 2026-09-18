import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban,
  CheckSquare,
  Bug,
  Receipt,
  ArrowUpRight,
  ArrowRight,
  TrendingUp,
  Plus,
} from 'lucide-react';
import { api } from '../../api/client';
import { MetricCard } from '../../components/ui/MetricCard';
import { HealthBadge } from '../../components/ui/HealthBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '@deliveryos/shared';

export const InternalDashboard: React.FC = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const canViewFinance =
          user?.role === UserRole.SUPER_ADMIN ||
          user?.role === UserRole.ADMIN ||
          user?.role === UserRole.PROJECT_MANAGER;

        const [projRes, summaryRes] = await Promise.all([
          api.get<any[]>('/projects', { pageSize: 6 }),
          canViewFinance ? api.get<any>('/reports/summary').catch(() => null) : null,
        ]);

        setProjects(projRes || []);
        setSummary(summaryRes);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  const isDev = user?.role === UserRole.DEVELOPER;
  const isQA = user?.role === UserRole.QA;

  return (
    <div className="space-y-8">
      {/* Welcome Hero */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Welcome back, {user?.profile?.firstName || 'Team Member'} 👋
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Here is the current delivery health, active milestones, and team activity overview.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isDev ? (
            <Link
              to="/app/my-work"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all"
            >
              <CheckSquare className="h-4 w-4" /> Go to My Work
            </Link>
          ) : isQA ? (
            <Link
              to="/app/qa"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all"
            >
              <Bug className="h-4 w-4" /> QA Workspace
            </Link>
          ) : (
            <Link
              to="/app/projects"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all"
            >
              <Plus className="h-4 w-4" /> View All Projects
            </Link>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <MetricCard
            label="Active Projects"
            value={summary.activeProjectsCount ?? projects.length}
            icon={FolderKanban}
            subtitle="Engagements in delivery"
          />
          <MetricCard
            label="Open Tasks"
            value={summary.openTasksCount ?? 0}
            icon={CheckSquare}
            subtitle="Across all sprint boards"
          />
          <MetricCard
            label="Active Bugs"
            value={summary.openBugsCount ?? 0}
            icon={Bug}
            subtitle="Pending resolution or retest"
          />
          <MetricCard
            label="Total Collected"
            value={`$${Number(summary.totalCollectedAmount || 0).toLocaleString()}`}
            icon={Receipt}
            subtitle={`$${Number(summary.outstandingAmount || 0).toLocaleString()} outstanding`}
          />
        </div>
      )}

      {/* Projects Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Active Project Workspaces
          </h3>
          <Link
            to="/app/projects"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.slice(0, 6).map((p) => (
            <Link
              key={p.id}
              to={`/app/projects/${p.id}`}
              className="group block p-5 rounded-2xl bg-white border border-slate-200 hover:border-brand-300 hover:shadow-md transition-all relative overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 mb-2">
                    {p.code}
                  </span>
                  <h4 className="text-base font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                    {p.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {p.organization?.name || 'Internal'}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>PM: {p.projectManager?.profile?.firstName || 'Unassigned'}</span>
                <span className="font-semibold text-slate-700">
                  {p.currency} {Number(p.budget || 0).toLocaleString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};
