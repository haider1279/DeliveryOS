import React, { useState, useEffect } from 'react';
import { CheckSquare, Clock, AlertTriangle, Bug, Plus, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';
import { MetricCard } from '../../components/ui/MetricCard';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';

export const MyWork: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [note, setNote] = useState('');

  const fetchMyWork = async () => {
    try {
      const res = await api.get<any>('/tasks/my-work');
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyWork();
  }, []);

  const handleUpdateStatus = async (taskId: string, status: string) => {
    try {
      await api.patch(`/tasks/${taskId}`, { status });
      fetchMyWork();
    } catch (err: any) {
      alert(err.message || 'Failed to update task status');
    }
  };

  const handleLogTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    try {
      await api.post('/tasks/time-entries', {
        taskId: selectedTask.id,
        date: new Date().toISOString(),
        durationMinutes: parseInt(durationMinutes, 10),
        note,
        billable: true,
      });
      setIsTimeModalOpen(false);
      setNote('');
      fetchMyWork();
    } catch (err: any) {
      alert(err.message || 'Failed to log time');
    }
  };

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  const { activeTasks = [], assignedBugs = [], recentTimeEntries = [], summary = {} } = data || {};

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">My Work Dashboard</h2>
        <p className="text-xs text-slate-500 mt-1">
          Your personal queue of assigned tasks, due milestones, open defects, and logged time.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          label="Active Tasks"
          value={summary.totalActive ?? 0}
          icon={CheckSquare}
        />
        <MetricCard
          label="Overdue"
          value={summary.overdueCount ?? 0}
          icon={AlertTriangle}
          className={summary.overdueCount > 0 ? 'border-rose-300 bg-rose-50/20' : ''}
        />
        <MetricCard
          label="Due Soon"
          value={summary.dueSoonCount ?? 0}
          icon={Clock}
        />
        <MetricCard
          label="Blocked"
          value={summary.blockedCount ?? 0}
          icon={AlertTriangle}
        />
        <MetricCard
          label="Assigned Bugs"
          value={summary.bugCount ?? 0}
          icon={Bug}
        />
      </div>

      {/* Active Tasks Table/Card List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Assigned Tasks Queue ({activeTasks.length})
        </h3>

        {activeTasks.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="All caught up!"
            description="You have no active tasks currently assigned to you."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {activeTasks.map((task: any) => (
              <div key={task.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                      {task.project?.code}
                    </span>
                    <PriorityBadge priority={task.priority} />
                    {task.dueDate && (
                      <span className="text-[11px] text-slate-400">
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">{task.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{task.project?.name}</p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={task.status}
                    onChange={(e) => handleUpdateStatus(task.id, e.target.value)}
                    className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none"
                  >
                    <option value="TODO">TODO</option>
                    <option value="IN_PROGRESS">IN PROGRESS</option>
                    <option value="BLOCKED">BLOCKED</option>
                    <option value="READY_FOR_QA">READY FOR QA</option>
                    <option value="DONE">DONE</option>
                  </select>

                  <button
                    onClick={() => {
                      setSelectedTask(task);
                      setIsTimeModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Log Time
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assigned Bugs Section */}
      {assignedBugs.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Assigned Bugs ({assignedBugs.length})
          </h3>
          <div className="divide-y divide-slate-100">
            {assignedBugs.map((bug: any) => (
              <div key={bug.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                      {bug.project?.code}
                    </span>
                    <PriorityBadge priority={bug.severity} />
                    <StatusBadge status={bug.status} />
                  </div>
                  <h4 className="text-xs font-bold text-slate-900">{bug.title}</h4>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time Log Modal */}
      <Modal
        isOpen={isTimeModalOpen}
        onClose={() => setIsTimeModalOpen(false)}
        title={`Log Work: ${selectedTask?.title || ''}`}
      >
        <form onSubmit={handleLogTime} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Duration (Minutes)</label>
            <input
              type="number"
              min="1"
              required
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Work Completed Note</label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Summary of commit, PR, or debug notes"
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsTimeModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white"
            >
              Save Time Entry
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
