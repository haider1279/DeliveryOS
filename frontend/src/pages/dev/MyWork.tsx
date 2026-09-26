import React, { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Clock, AlertTriangle, Bug, Plus, CheckCircle2, MessageSquare, Send } from 'lucide-react';
import { api } from '../../api/client';
import { MetricCard } from '../../components/ui/MetricCard';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { CommentVisibility, TaskStatus, UserRole } from '@deliveryos/shared';

const TASK_STATUS_OPTIONS: Record<string, TaskStatus[]> = {
  // Developer-owned progress
  [TaskStatus.TODO]:         [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
  [TaskStatus.IN_PROGRESS]:  [TaskStatus.READY_FOR_QA, TaskStatus.CODE_REVIEW, TaskStatus.BLOCKED],
  [TaskStatus.CODE_REVIEW]:  [TaskStatus.READY_FOR_QA, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
  [TaskStatus.BLOCKED]:      [TaskStatus.IN_PROGRESS],
  [TaskStatus.BUG_REPORTED]: [TaskStatus.IN_PROGRESS],
  // QA-owned corridor — these only appear for QA/manager actors
  [TaskStatus.READY_FOR_QA]: [TaskStatus.TESTING, TaskStatus.IN_PROGRESS],
  [TaskStatus.TESTING]:      [TaskStatus.DONE, TaskStatus.BUG_REPORTED],
  // Re-open (managers only in practice)
  [TaskStatus.DONE]:         [TaskStatus.IN_PROGRESS],
  [TaskStatus.CANCELLED]:    [TaskStatus.IN_PROGRESS],
};

/**
 * Returns the status options a specific role may choose from for a given
 * current status. The current status is always included as the first option
 * (so the select renders the current value correctly).
 */
function getStatusOptionsForRole(currentStatus: string, role: UserRole | undefined): string[] {
  if (!role) return [currentStatus];

  const base = TASK_STATUS_OPTIONS[currentStatus] ?? [];

  // QA can only move within the QA corridor; developers cannot enter it.
  if (role === UserRole.DEVELOPER) {
    const devAllowed: TaskStatus[] = [
      TaskStatus.IN_PROGRESS, TaskStatus.CODE_REVIEW,
      TaskStatus.READY_FOR_QA, TaskStatus.BLOCKED,
    ];
    return [currentStatus, ...base.filter((s) => devAllowed.includes(s))];
  }
  if (role === UserRole.QA) {
    const qaAllowed: TaskStatus[] = [
      TaskStatus.TESTING, TaskStatus.DONE, TaskStatus.BUG_REPORTED, TaskStatus.IN_PROGRESS,
    ];
    return [currentStatus, ...base.filter((s) => qaAllowed.includes(s))];
  }
  // Managers see all options for a given state
  return [currentStatus, ...base];
}

export const WorkQueueSection: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [isLoggingTime, setIsLoggingTime] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [note, setNote] = useState('');

  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentsTask, setCommentsTask] = useState<any>(null);
  const [taskDetail, setTaskDetail] = useState<any>(null);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [commentText, setCommentText] = useState('');

  const fetchMyWork = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const res = await api.get<any>('/tasks/my-work');
      setData(res);
    } catch (err: any) {
      console.error(err);
      if (showLoading) setLoadError(err.message || 'Failed to load your assigned work');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyWork(true);
  }, [fetchMyWork]);

  const handleUpdateStatus = async (taskId: string, status: string) => {
    if (updatingTaskId) return;
    setUpdatingTaskId(taskId);
    try {
      await api.patch(`/tasks/${taskId}`, { status });
      toast.success(`Task moved to ${status.replace(/_/g, ' ')}`);
      await fetchMyWork();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update task status');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleLogTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || isLoggingTime) return;
    setIsLoggingTime(true);
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
      toast.success('Time entry logged');
      await fetchMyWork();
    } catch (err: any) {
      toast.error(err.message || 'Failed to log time');
    } finally {
      setIsLoggingTime(false);
    }
  };

  const openTaskComments = async (task: any) => {
    setIsCommentsOpen(true);
    setCommentsTask(task);
    setTaskDetail(task);
    setCommentText('');
    setTaskDetailLoading(true);
    try {
      const detail = await api.get<any>(`/tasks/${task.id}`);
      setTaskDetail(detail);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load task comments');
    } finally {
      setTaskDetailLoading(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentsTask || !commentText.trim() || isAddingComment) return;
    setIsAddingComment(true);
    try {
      await api.post(`/tasks/${commentsTask.id}/comments`, {
        content: commentText.trim(),
        visibility: CommentVisibility.INTERNAL,
      });
      setCommentText('');
      const detail = await api.get<any>(`/tasks/${commentsTask.id}`);
      setTaskDetail(detail);
      toast.success('Comment added');
      void fetchMyWork();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add comment');
    } finally {
      setIsAddingComment(false);
    }
  };

  if (loading && !data) return <LoadingSpinner size="lg" className="h-40" />;

  if (!data && loadError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="text-sm font-semibold text-rose-800">{loadError}</p>
        <button
          type="button"
          onClick={() => fetchMyWork(true)}
          className="mt-4 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const { assignedBugs = [], recentTimeEntries = [], summary = {}, activeTasks = [] } = data || {};
  const visibleTasks = activeTasks.filter(
    (t: any) => t.status !== 'DONE' && t.status !== 'CANCELLED'
  );
  const canUpdateTaskStatus = user?.role !== UserRole.CLIENT;
  const getTaskStatusOptions = (status: string): string[] =>
    getStatusOptionsForRole(status, user?.role as UserRole | undefined);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">My Assigned Work</h2>
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
          Assigned Tasks Queue ({visibleTasks.length})
        </h3>

        {visibleTasks.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="All caught up!"
            description="You have no active tasks currently assigned to you."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleTasks.map((task: any) => (
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
                    disabled={!canUpdateTaskStatus || updatingTaskId !== null}
                    aria-label={`Status for task: ${task.title}`}
                    className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {getTaskStatusOptions(task.status).map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => openTaskComments(task)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Comments ({task._count?.comments || 0})
                  </button>

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

      {recentTimeEntries.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Recent Time Log
          </h3>
          <div className="divide-y divide-slate-100">
            {recentTimeEntries.slice(0, 5).map((entry: any) => (
              <div key={entry.id} className="py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {entry.task?.title || entry.project?.name || 'Work entry'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {entry.project?.name} · {new Date(entry.date).toLocaleDateString()}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-xs font-semibold text-brand-600 shrink-0">
                  <Clock className="h-3.5 w-3.5" />
                  {Math.round(entry.durationMinutes / 6) / 10} hrs
                </span>
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
              disabled={isLoggingTime}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingTime ? 'Saving…' : 'Save Time Entry'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Task Comments Modal */}
      <Modal
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        title={`Comments: ${commentsTask?.title || ''}`}
        maxWidth="xl"
      >
        {taskDetailLoading ? (
          <div className="py-10">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {taskDetail?.project?.code && (
                <span className="text-[10px] font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                  {taskDetail.project.code}
                </span>
              )}
              {taskDetail?.priority && <PriorityBadge priority={taskDetail.priority} />}
              {taskDetail?.status && <StatusBadge status={taskDetail.status} />}
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
                Thread ({taskDetail?.comments?.length || 0})
              </h4>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {(taskDetail?.comments || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No comments yet. Add the first note below.</p>
                ) : (
                  taskDetail.comments.map((c: any) => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold shrink-0">
                        {c.author?.profile?.firstName?.[0] || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-800">
                            {c.author?.profile?.displayName || c.author?.profile?.firstName || c.author?.email}
                          </span>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${
                              c.visibility === CommentVisibility.CLIENT_VISIBLE
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {c.visibility === CommentVisibility.CLIENT_VISIBLE ? 'Client' : 'Internal'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 break-words">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} className="mt-4 flex items-start gap-2">
                <textarea
                  rows={2}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add an internal comment..."
                  className="flex-1 px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || isAddingComment}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-3.5 w-3.5" /> {isAddingComment ? 'Adding…' : 'Add'}
                </button>
              </form>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};