import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Receipt,
  Wallet,
} from 'lucide-react';
import { api } from '../../api/client';
import { MetricCard } from '../../components/ui/MetricCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAuth } from '../../context/AuthContext';

const formatMoney = (value: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
};
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

export const ClientDashboard: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [projectResult, invoiceResult, requestResult] = await Promise.allSettled([
        api.get<any[]>('/projects', { pageSize: 100 }),
        api.get<any[]>('/invoices', { pageSize: 100 }),
        api.get<any[]>('/projects/requests'),
      ]);

      const failedSections: string[] = [];
      if (projectResult.status === 'rejected') failedSections.push('projects');
      if (invoiceResult.status === 'rejected') failedSections.push('invoices');
      if (requestResult.status === 'rejected') failedSections.push('requests');

      setProjects(
        projectResult.status === 'fulfilled' && Array.isArray(projectResult.value)
          ? projectResult.value
          : []
      );
      setInvoices(
        invoiceResult.status === 'fulfilled' && Array.isArray(invoiceResult.value)
          ? invoiceResult.value
          : []
      );
      setRequests(
        requestResult.status === 'fulfilled' && Array.isArray(requestResult.value)
          ? requestResult.value
          : []
      );
      setLoadError(
        failedSections.length === 0
          ? null
          : failedSections.length === 3
            ? 'We could not load your dashboard data. Please try again.'
            : `Some dashboard sections could not be loaded: ${failedSections.join(', ')}.`
      );
    } catch (err) {
      console.error('Failed to load client dashboard data', err);
      setLoadError('We could not load your dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  const activeProjects = projects.filter(
    (project) => !['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(project.status)
  );
  const pendingRequests = requests.filter((request) => request.status === 'PENDING');
  const visibleInvoices = invoices.filter(
    (invoice) => !['DRAFT', 'VOID'].includes(invoice.status)
  );
  const balanceByCurrency = visibleInvoices.reduce((totals, invoice) => {
    const balance = Number(invoice.balanceDue ?? 0);
    if (balance <= 0) return totals;
    const currency = invoice.currency || 'USD';
    totals[currency] = (totals[currency] || 0) + balance;
    return totals;
  }, {} as Record<string, number>);
  const balanceEntries = Object.entries(balanceByCurrency);
  const outstandingBalanceLabel =
    balanceEntries.length === 0
      ? formatMoney(0)
      : balanceEntries.length === 1
        ? formatMoney(Number(balanceEntries[0][1]), balanceEntries[0][0])
        : `${balanceEntries.length} currencies`;
  const nextDueInvoice = visibleInvoices
    .filter((invoice) => Number(invoice.balanceDue ?? 0) > 0 && invoice.dueDate)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  if (loadError && projects.length === 0 && invoices.length === 0 && requests.length === 0) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
        <p className="mt-3 text-sm font-semibold text-rose-800">{loadError}</p>
        <button
          type="button"
          onClick={() => fetchDashboard()}
          className="mt-4 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600">
            <LayoutDashboard className="h-4 w-4" /> Client dashboard
          </h3>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Welcome back, {user?.profile?.firstName || 'there'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Track delivery progress, review requests, and keep an eye on your account balance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/portal/projects"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            <FolderKanban className="h-4 w-4" /> Browse projects
          </Link>
          <Link
            to="/portal/invoices"
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
          >
            <Receipt className="h-4 w-4" /> View billing
          </Link>
        </div>
      </section>

      {loadError && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => fetchDashboard()}
            className="self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-800 hover:bg-amber-100 sm:self-auto"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active Projects"
          value={activeProjects.length}
          icon={FolderKanban}
          subtitle="Currently in delivery"
        />
        <MetricCard
          label="Pending Requests"
          value={pendingRequests.length}
          icon={FileText}
          subtitle="Awaiting agency review"
        />
        <MetricCard
          label="Outstanding Balance"
          value={outstandingBalanceLabel}
          icon={Wallet}
          subtitle="Across issued invoices"
        />
        <MetricCard
          label="Next Payment Due"
          value={nextDueInvoice ? formatDate(nextDueInvoice.dueDate) : '—'}
          icon={CalendarDays}
          subtitle={nextDueInvoice?.invoiceNumber || 'No payment due'}
        />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Recent Projects</h3>
            <p className="mt-1 text-xs text-slate-500">The latest delivery work connected to your organization.</p>
          </div>
          <Link
            to="/portal/projects"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {activeProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
            <FolderKanban className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">No active projects yet</p>
            <p className="mt-1 text-xs text-slate-400">Your agency team will share updates here as delivery begins.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {activeProjects.slice(0, 3).map((project) => (
              <Link
                key={project.id}
                to={`/portal/projects/${project.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-indigo-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                    {project.code}
                  </span>
                  <StatusBadge status={project.status} />
                </div>
                <h4 className="mt-4 text-base font-bold text-slate-900 group-hover:text-indigo-600">
                  {project.name}
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  {project.projectManager?.profile?.firstName ? `PM: ${project.projectManager.profile.firstName}` : 'Your delivery team'}
                </p>
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Target {formatDate(project.targetDate)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-indigo-500 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Billing Snapshot</h3>
              <p className="mt-1 text-xs text-slate-500">Recent invoices and balances.</p>
            </div>
            <Link to="/portal/invoices" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
              View all
            </Link>
          </div>
          {visibleInvoices.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No invoices are available yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleInvoices.slice(0, 4).map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-800">{invoice.invoiceNumber}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{invoice.project?.name || 'Project invoice'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-800">{formatMoney(Number(invoice.balanceDue ?? 0), invoice.currency || 'USD')}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">Due {formatDate(invoice.dueDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Project Requests</h3>
              <p className="mt-1 text-xs text-slate-500">Requests submitted for your organization.</p>
            </div>
            <Link to="/portal/projects" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
              Manage
            </Link>
          </div>
          {requests.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No project requests have been submitted.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.slice(0, 4).map((request) => (
                <div key={request.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-800">{request.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">Submitted {formatDate(request.createdAt)}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        Your project data is securely scoped to {user?.organization?.name || 'your organization'}.
      </div>
    </div>
  );
};
