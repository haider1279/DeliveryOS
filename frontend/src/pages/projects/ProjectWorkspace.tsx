import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  FolderKanban,
  FileText,
  CheckSquare,
  Bug,
  Rocket,
  Receipt,
  FileUp,
  Activity,
  Plus,
  Calendar,
  DollarSign,
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  User,
} from 'lucide-react';
import { api } from '../../api/client';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { HealthBadge } from '../../components/ui/HealthBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { UserRole, RequirementStatus, TaskStatus, BugStatus, ReleaseStatus, CommentVisibility } from '@deliveryos/shared';

export const ProjectWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const { user } = useAuth();

  const [project, setProject] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Data states per tab
  const [requirements, setRequirements] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [testCases, setTestCases] = useState<any[]>([]);
  const [bugs, setBugs] = useState<any[]>([]);
  const [releases, setReleases] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [profitability, setProfitability] = useState<any>(null);

  // Modals
  const [isReqModalOpen, setIsReqModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
  const [isEstimateModalOpen, setIsEstimateModalOpen] = useState(false);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Selected item states
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // Form inputs
  const [reqTitle, setReqTitle] = useState('');
  const [reqDesc, setReqDesc] = useState('');
  const [reqCriteria, setReqCriteria] = useState('');
  const [reqPriority, setReqPriority] = useState('MEDIUM');

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [taskEstimatedHours, setTaskEstimatedHours] = useState('8');
  const [taskPriority, setTaskPriority] = useState('MEDIUM');

  const [timeMinutes, setTimeMinutes] = useState('60');
  const [timeNote, setTimeNote] = useState('');

  const [estDevHours, setEstDevHours] = useState('16');
  const [estQaHours, setEstQaHours] = useState('8');
  const [estClientPrice, setEstClientPrice] = useState('2400');

  const [bugTitle, setBugTitle] = useState('');
  const [bugDesc, setBugDesc] = useState('');
  const [bugSteps, setBugSteps] = useState('');
  const [bugExpected, setBugExpected] = useState('');
  const [bugActual, setBugActual] = useState('');
  const [bugSeverity, setBugSeverity] = useState('MEDIUM');

  const [relVersion, setRelVersion] = useState('1.0.0');
  const [relName, setRelName] = useState('MVP Launch');

  const [invNumber, setInvNumber] = useState(`INV-${Date.now().toString().slice(-6)}`);
  const [invAmount, setInvAmount] = useState('5000');
  const [payAmount, setPayAmount] = useState('2500');

  const fetchProjectData = async () => {
    try {
      const [projData, healthData] = await Promise.all([
        api.get<any>(`/projects/${id}`),
        api.get<any>(`/projects/${id}/health`),
      ]);
      setProject(projData);
      setHealth(healthData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTabData = async () => {
    if (!id) return;
    try {
      if (activeTab === 'requirements') {
        const res: any = await api.get('/requirements', { projectId: id });
        setRequirements(res?.items || res || []);
      } else if (activeTab === 'tasks') {
        const res: any = await api.get('/tasks', { projectId: id });
        setTasks(res?.tasks || res || []);
      } else if (activeTab === 'qa') {
        const [tcRes, bugRes]: [any, any] = await Promise.all([
          api.get('/qa/test-cases', { projectId: id }),
          api.get('/qa/bugs', { projectId: id }),
        ]);
        setTestCases(tcRes?.testCases || tcRes || []);
        setBugs(bugRes?.bugs || bugRes || []);
      } else if (activeTab === 'releases') {
        const res: any = await api.get('/releases', { projectId: id });
        setReleases(res?.releases || res || []);
      } else if (activeTab === 'finance') {
        const [invRes, profRes]: [any, any] = await Promise.all([
          api.get('/invoices', { projectId: id }),
          api.get(`/invoices/project/${id}/profitability`),
        ]);
        setInvoices(invRes?.invoices || invRes || []);
        setProfitability(profRes);
      } else if (activeTab === 'files') {
        const res: any = await api.get(`/storage/project/${id}`);
        setFiles(res || []);
      } else if (activeTab === 'activity') {
        const res: any = await api.get(`/projects/${id}/activity`);
        setActivities(res || []);
      }
    } catch (err) {
      console.error('Error fetching tab data', err);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  useEffect(() => {
    fetchTabData();
  }, [id, activeTab]);

  const canManage =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.PROJECT_MANAGER;

  const canViewFinance = canManage;

  const handleCreateRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/requirements', {
        projectId: id,
        title: reqTitle,
        description: reqDesc,
        acceptanceCriteria: reqCriteria,
        priority: reqPriority,
      });
      setIsReqModalOpen(false);
      setReqTitle('');
      setReqDesc('');
      setReqCriteria('');
      fetchTabData();
    } catch (err: any) {
      alert(err.message || 'Failed to create requirement');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/tasks', {
        projectId: id,
        requirementId: selectedReq?.id || undefined,
        title: taskTitle,
        description: taskDesc,
        assigneeId: taskAssigneeId || undefined,
        priority: taskPriority,
        estimatedHours: parseFloat(taskEstimatedHours) || 0,
      });
      setIsTaskModalOpen(false);
      setTaskTitle('');
      setTaskDesc('');
      fetchTabData();
    } catch (err: any) {
      alert(err.message || 'Failed to create task');
    }
  };

  const handleLogTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    try {
      await api.post('/tasks/time-entries', {
        taskId: selectedTask.id,
        date: new Date().toISOString(),
        durationMinutes: parseInt(timeMinutes, 10),
        note: timeNote,
        billable: true,
      });
      setIsTimeModalOpen(false);
      setTimeNote('');
      fetchTabData();
      fetchProjectData();
    } catch (err: any) {
      alert(err.message || 'Failed to log time');
    }
  };

  const handleReportBug = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/qa/bugs', {
        projectId: id,
        title: bugTitle,
        description: bugDesc,
        stepsToReproduce: bugSteps,
        expectedResult: bugExpected,
        actualResult: bugActual,
        severity: bugSeverity,
      });
      setIsBugModalOpen(false);
      setBugTitle('');
      setBugDesc('');
      setBugSteps('');
      setBugExpected('');
      setBugActual('');
      fetchTabData();
    } catch (err: any) {
      alert(err.message || 'Failed to report bug');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus });
      fetchTabData();
    } catch (err: any) {
      alert(err.message || 'Failed to update task status');
    }
  };

  const handleUpdateBugStatus = async (bugId: string, newStatus: string) => {
    try {
      await api.patch(`/qa/bugs/${bugId}/status`, { status: newStatus });
      fetchTabData();
    } catch (err: any) {
      alert(err.message || 'Failed to update bug status');
    }
  };

  if (loading || !project) return <LoadingSpinner size="lg" className="h-64" />;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FolderKanban },
    { id: 'requirements', label: 'Requirements', icon: FileText },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'qa', label: 'QA & Bugs', icon: Bug },
    { id: 'releases', label: 'Releases', icon: Rocket },
    ...(canViewFinance ? [{ id: 'finance', label: 'Finance & Invoices', icon: Receipt }] : []),
    { id: 'files', label: 'Files', icon: FileUp },
    { id: 'activity', label: 'Activity Timeline', icon: Activity },
  ];

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-slate-100 text-slate-700">
                {project.code}
              </span>
              <StatusBadge status={project.status} />
              {health && <HealthBadge status={health.status} />}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{project.name}</h1>
            <p className="text-xs text-slate-500 mt-1">
              Client:{' '}
              <strong className="text-slate-800">{project.organization?.name}</strong> • PM:{' '}
              <strong className="text-slate-800">
                {project.projectManager?.profile?.displayName || project.projectManager?.email}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-slate-400" />
              <span>Budget:</span>
              <strong className="text-slate-900 font-semibold">
                ${Number(project.budget || 0).toLocaleString()}
              </strong>
            </div>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-slate-400" />
              <span>Effort:</span>
              <strong className="text-slate-900 font-semibold">
                {Number(project.actualEffortHours || 0).toFixed(1)} hrs
              </strong>
            </div>
            {project.targetDate && (
              <>
                <div className="h-4 w-px bg-slate-200" />
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span>Target:</span>
                  <strong className="text-slate-900 font-semibold">
                    {new Date(project.targetDate).toLocaleDateString()}
                  </strong>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-6 border-t border-slate-100 pt-4 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSearchParams({ tab: tab.id })}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Contents */}
      {/* 1. OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                Project Summary
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {project.description || 'No detailed description provided yet for this project.'}
              </p>
            </div>

            {/* Health Reasons */}
            {health && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Automated Health Diagnostics
                  </h3>
                  <HealthBadge status={health.status} />
                </div>
                <div className="space-y-2 pt-2">
                  {health.reasons.map((r: string, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 text-xs text-slate-700 border border-slate-100"
                    >
                      <AlertCircle className="h-4 w-4 text-brand-600 flex-shrink-0 mt-0.5" />
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Info */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 space-y-4">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Assigned Team
              </h3>
              <div className="space-y-3">
                {project.members?.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                        {m.user?.profile?.firstName?.[0] || 'U'}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          {m.user?.profile?.displayName || m.user?.email}
                        </p>
                        <p className="text-[10px] text-slate-500">{m.membershipRole}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. REQUIREMENTS TAB */}
      {activeTab === 'requirements' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Scoped Requirements</h3>
            {canManage && (
              <button
                onClick={() => setIsReqModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add Requirement
              </button>
            )}
          </div>

          {requirements.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No requirements scoped"
              description="Define functional requirements to break down into development tasks."
              action={canManage ? { label: 'Add Requirement', onClick: () => setIsReqModalOpen(true) } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {requirements.map((req) => (
                <div
                  key={req.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-mono font-bold text-slate-500">
                          v{req.currentVersion}
                        </span>
                        <StatusBadge status={req.status} />
                        <PriorityBadge priority={req.priority} />
                      </div>
                      <h4 className="text-base font-bold text-slate-900">{req.title}</h4>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600">{req.description}</p>
                  <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-100">
                    <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      Acceptance Criteria
                    </strong>
                    {req.acceptanceCriteria}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. TASKS TAB */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Development Tasks</h3>
            <button
              onClick={() => setIsTaskModalOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
            >
              <Plus className="h-3.5 w-3.5" /> Create Task
            </button>
          </div>

          {tasks.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="No tasks created"
              description="Create development tasks linked to approved requirements."
              action={{ label: 'Create Task', onClick: () => setIsTaskModalOpen(true) }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <PriorityBadge priority={t.priority} />
                      <select
                        value={t.status}
                        onChange={(e) => handleUpdateTaskStatus(t.id, e.target.value)}
                        className="text-[11px] font-semibold bg-slate-50 border border-slate-200 rounded px-2 py-0.5 focus:outline-none"
                      >
                        <option value="TODO">TODO</option>
                        <option value="IN_PROGRESS">IN PROGRESS</option>
                        <option value="BLOCKED">BLOCKED</option>
                        <option value="READY_FOR_QA">READY FOR QA</option>
                        <option value="DONE">DONE</option>
                      </select>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">{t.title}</h4>
                    {t.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Assignee: <strong>{t.assignee?.profile?.firstName || 'Unassigned'}</strong>
                    </span>
                    <button
                      onClick={() => {
                        setSelectedTask(t);
                        setIsTimeModalOpen(true);
                      }}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                    >
                      + Log Time
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. QA & BUGS TAB */}
      {activeTab === 'qa' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Bugs & QA Tickets</h3>
            <button
              onClick={() => setIsBugModalOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700"
            >
              <Plus className="h-3.5 w-3.5" /> Report Bug
            </button>
          </div>

          {bugs.length === 0 ? (
            <EmptyState
              icon={Bug}
              title="No bugs reported"
              description="No open defects found for this project."
              action={{ label: 'Report Bug', onClick: () => setIsBugModalOpen(true) }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bugs.map((bug) => (
                <div
                  key={bug.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <PriorityBadge priority={bug.severity} />
                        <StatusBadge status={bug.status} />
                      </div>
                      <h4 className="text-base font-bold text-slate-900">{bug.title}</h4>
                    </div>
                    <select
                      value={bug.status}
                      onChange={(e) => handleUpdateBugStatus(bug.id, e.target.value)}
                      className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded px-2 py-1"
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="TRIAGED">TRIAGED</option>
                      <option value="IN_PROGRESS">IN PROGRESS</option>
                      <option value="FIXED">FIXED</option>
                      <option value="READY_FOR_RETEST">READY FOR RETEST</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <p>
                      <strong>Actual:</strong> {bug.actualResult}
                    </p>
                    <p>
                      <strong>Expected:</strong> {bug.expectedResult}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. FINANCE & INVOICES TAB */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          {profitability && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80">
                <span className="text-xs font-medium text-slate-500">Collected Revenue</span>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  ${Number(profitability.totalRevenue || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80">
                <span className="text-xs font-medium text-slate-500">Internal Cost</span>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  ${Number(profitability.totalInternalCost || 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-slate-400">
                  {profitability.totalHoursLogged} hrs logged
                </span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80">
                <span className="text-xs font-medium text-slate-500">Net Profit Margin</span>
                <p
                  className={`text-2xl font-bold mt-1 ${
                    profitability.profitMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {profitability.profitMargin}%
                </p>
                <span className="text-[10px] text-slate-400">
                  ${Number(profitability.netProfit || 0).toLocaleString()} net
                </span>
              </div>
            </div>
          )}

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Project Invoices</h3>
            {invoices.length === 0 ? (
              <p className="text-xs text-slate-400">No invoices issued for this project yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <div key={inv.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-900">
                        {inv.invoiceNumber}
                      </span>
                      <span className="text-slate-400 ml-2">
                        Due: {new Date(inv.dueDate).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <strong className="text-slate-900">
                        ${Number(inv.total).toLocaleString()}
                      </strong>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Requirement Modal */}
      <Modal isOpen={isReqModalOpen} onClose={() => setIsReqModalOpen(false)} title="Add Requirement">
        <form onSubmit={handleCreateRequirement} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Title</label>
            <input
              type="text"
              required
              value={reqTitle}
              onChange={(e) => setReqTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Description</label>
            <textarea
              required
              rows={3}
              value={reqDesc}
              onChange={(e) => setReqDesc(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Acceptance Criteria</label>
            <textarea
              required
              rows={2}
              value={reqCriteria}
              onChange={(e) => setReqCriteria(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsReqModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white"
            >
              Save Requirement
            </button>
          </div>
        </form>
      </Modal>

      {/* Task Modal */}
      <Modal isOpen={isTaskModalOpen} onClose={() => setIsTaskModalOpen(false)} title="Create Task">
        <form onSubmit={handleCreateTask} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Title</label>
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Description</label>
            <textarea
              rows={2}
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Estimated Hours</label>
            <input
              type="number"
              min="0"
              value={taskEstimatedHours}
              onChange={(e) => setTaskEstimatedHours(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsTaskModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white"
            >
              Create Task
            </button>
          </div>
        </form>
      </Modal>

      {/* Time Log Modal */}
      <Modal
        isOpen={isTimeModalOpen}
        onClose={() => setIsTimeModalOpen(false)}
        title={`Log Time: ${selectedTask?.title || ''}`}
      >
        <form onSubmit={handleLogTime} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Duration (Minutes)</label>
            <input
              type="number"
              min="1"
              required
              value={timeMinutes}
              onChange={(e) => setTimeMinutes(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Notes</label>
            <textarea
              rows={2}
              value={timeNote}
              onChange={(e) => setTimeNote(e.target.value)}
              placeholder="What was completed?"
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
              Log Time
            </button>
          </div>
        </form>
      </Modal>

      {/* Bug Report Modal */}
      <Modal isOpen={isBugModalOpen} onClose={() => setIsBugModalOpen(false)} title="Report Defect / Bug">
        <form onSubmit={handleReportBug} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Bug Title</label>
            <input
              type="text"
              required
              value={bugTitle}
              onChange={(e) => setBugTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Severity</label>
            <select
              value={bugSeverity}
              onChange={(e) => setBugSeverity(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none"
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Steps to Reproduce</label>
            <textarea
              required
              rows={2}
              value={bugSteps}
              onChange={(e) => setBugSteps(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Expected Result</label>
              <input
                type="text"
                required
                value={bugExpected}
                onChange={(e) => setBugExpected(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Actual Result</label>
              <input
                type="text"
                required
                value={bugActual}
                onChange={(e) => setBugActual(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsBugModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-rose-600 text-white"
            >
              Submit Bug
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
