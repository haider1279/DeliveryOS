import React, { useState, useEffect } from 'react';
import { ShieldCheck, Search } from 'lucide-react';
import { api } from '../../api/client';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAudit = async () => {
      try {
        const res: any = await api.get('/audit');
        setLogs(res || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAudit();
  }, []);

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">System Audit Log</h2>
        <p className="text-xs text-slate-500 mt-1">
          Append-only immutable record of all security-sensitive events, approvals, and actions.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">Timestamp</th>
                <th className="px-6 py-3.5">Actor</th>
                <th className="px-6 py-3.5">Action</th>
                <th className="px-6 py-3.5">Target Entity</th>
                <th className="px-6 py-3.5">Metadata / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80">
                  <td className="px-6 py-3.5 whitespace-nowrap text-slate-400 text-[11px] font-mono">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-3.5 font-bold text-slate-900">
                    {log.actor?.profile?.displayName || log.actor?.email}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-slate-700">
                    {log.entityType} ({log.entityId?.slice(0, 8)}...)
                  </td>
                  <td className="px-6 py-3.5 text-slate-500 font-mono text-[11px]">
                    {log.metadata ? JSON.stringify(log.metadata) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
