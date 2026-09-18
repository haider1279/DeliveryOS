import React, { useState, useEffect } from 'react';
import { BarChart3, Users, DollarSign, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';
import { MetricCard } from '../../components/ui/MetricCard';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const ReportsDashboard: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [workload, setWorkload] = useState<any[]>([]);
  const [qa, setQa] = useState<any>(null);
  const [financials, setFinancials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const [sRes, wRes, qRes, fRes] = await Promise.all([
          api.get('/reports/summary'),
          api.get<any[]>('/reports/workload'),
          api.get('/reports/qa'),
          api.get<any[]>('/reports/financials'),
        ]);
        setSummary(sRes);
        setWorkload(wRes || []);
        setQa(qRes);
        setFinancials(fRes || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Executive Analytics & Reports</h2>
        <p className="text-xs text-slate-500 mt-1">
          Agency operational performance, developer workload velocity, QA pass rates, and project margins.
        </p>
      </div>

      {/* Top Metrics */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Invoiced"
            value={`$${Number(summary.totalInvoicedAmount || 0).toLocaleString()}`}
            icon={DollarSign}
          />
          <MetricCard
            label="Collected Revenue"
            value={`$${Number(summary.totalCollectedAmount || 0).toLocaleString()}`}
            icon={DollarSign}
            className="border-emerald-200 bg-emerald-50/20"
          />
          <MetricCard
            label="QA Pass Rate"
            value={`${qa?.passRatePercentage || 100}%`}
            icon={ShieldCheck}
            subtitle={`${qa?.totalTestRuns || 0} executed runs`}
          />
          <MetricCard
            label="Outstanding Receivables"
            value={`$${Number(summary.outstandingAmount || 0).toLocaleString()}`}
            icon={DollarSign}
          />
        </div>
      )}

      {/* Developer Workload */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Developer Workload & Velocity (Past 30 Days)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Team Member</th>
                <th className="px-6 py-3.5">Active Tasks</th>
                <th className="px-6 py-3.5">Completed Tasks</th>
                <th className="px-6 py-3.5">Hours (Past 30 Days)</th>
                <th className="px-6 py-3.5">Total Hours Logged</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {workload.map((w) => (
                <tr key={w.userId} className="hover:bg-slate-50/80">
                  <td className="px-6 py-3.5">
                    <span className="font-bold text-slate-900">{w.name}</span>
                    <span className="block text-[10px] text-slate-400">{w.role}</span>
                  </td>
                  <td className="px-6 py-3.5 font-semibold text-slate-800">{w.activeTasksCount}</td>
                  <td className="px-6 py-3.5 text-emerald-600 font-semibold">{w.completedTasksCount}</td>
                  <td className="px-6 py-3.5 font-bold text-brand-600">{w.hoursLoggedPast30Days} hrs</td>
                  <td className="px-6 py-3.5 text-slate-700">{w.totalHoursLogged} hrs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Project Financials Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Project Financials & Collections
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Project</th>
                <th className="px-6 py-3.5">Client</th>
                <th className="px-6 py-3.5">Total Invoiced</th>
                <th className="px-6 py-3.5">Collected</th>
                <th className="px-6 py-3.5">Outstanding Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {financials.map((f) => (
                <tr key={f.projectId} className="hover:bg-slate-50/80">
                  <td className="px-6 py-3.5 font-bold text-slate-900">
                    {f.projectName}{' '}
                    <span className="text-[10px] font-mono text-slate-400">({f.projectCode})</span>
                  </td>
                  <td className="px-6 py-3.5">{f.organizationName}</td>
                  <td className="px-6 py-3.5 font-bold text-slate-900">${f.totalInvoiced.toLocaleString()}</td>
                  <td className="px-6 py-3.5 text-emerald-600 font-semibold">${f.totalCollected.toLocaleString()}</td>
                  <td className="px-6 py-3.5 text-rose-600 font-semibold">${f.outstanding.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
