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
  History,
  Paperclip,
  Wallet,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { api } from '../../api/client';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { HealthBadge } from '../../components/ui/HealthBadge';
import { PriorityBadge } from '../../components/ui/PriorityBadge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { UserRole, RequirementStatus, TaskStatus, BugStatus, ReleaseStatus, CommentVisibility, ReleaseItemType } from '@deliveryos/shared';

export const ProjectWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const { user } = useAuth();
  const toast = useToast();

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
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isAssignDevModalOpen, setIsAssignDevModalOpen] = useState(false);

  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedAddUserId, setSelectedAddUserId] = useState('');
  const [selectedMembershipRole, setSelectedMembershipRole] = useState('DEVELOPER');
  const [submittingMember, setSubmittingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const [eligibleDevelopers, setEligibleDevelopers] = useState<any[]>([]);
  const [loadingEligibleDevs, setLoadingEligibleDevs] = useState(false);
  const [selectedDevId, setSelectedDevId] = useState('');
  const [submittingDev, setSubmittingDev] = useState(false);
  const [removingDevId, setRemovingDevId] = useState<string | null>(null);

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
  const [taskRequirementId, setTaskRequirementId] = useState('');
  const [taskEstimatedHours, setTaskEstimatedHours] = useState('8');
  const [taskPriority, setTaskPriority] = useState('MEDIUM');

  const [timeMinutes, setTimeMinutes] = useState('60');
  const [timeNote, setTimeNote] = useState('');

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

  // Estimate modal state
  const [estimateReqId, setEstimateReqId] = useState<string | null>(null);
  const [estDevHours, setEstDevHours] = useState('16');
  const [estQaHours, setEstQaHours] = useState('8');
  const [estDesignHours, setEstDesignHours] = useState('0');
  const [estCost, setEstCost] = useState('0');
  const [estClientPrice, setEstClientPrice] = useState('2400');
  const [estAssumptions, setEstAssumptions] = useState('');
  const [estExclusions, setEstExclusions] = useState('');
  const [estNotes, setEstNotes] = useState('');
  const [estDelivery, setEstDelivery] = useState('');

  // Ask Clarification modal state
  const [isAskClarificationOpen, setIsAskClarificationOpen] = useState(false);
  const [clarificationReqId, setClarificationReqId] = useState<string | null>(null);
  const [clarificationText, setClarificationText] = useState('');

  // Release modal state
  const [relSelectedReqs, setRelSelectedReqs] = useState<string[]>([]);
  const [relReleaseNotes, setRelReleaseNotes] = useState('');
  const [relDeploymentNotes, setRelDeploymentNotes] = useState('');

  // Invoice / payment modal state
  const [invNotes, setInvNotes] = useState('');
  const [invTax, setInvTax] = useState('0');
  const [invDiscount, setInvDiscount] = useState('0');
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER');
  const [payReference, setPayReference] = useState('');

  // Expanded requirement detail (estimates + status history)
  const [expandedReqId, setExpandedReqId] = useState<string | null>(null);
  const [reqDetail, setReqDetail] = useState<any>(null);
  const [reqDetailLoading, setReqDetailLoading] = useState(false);

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

  const fetchAvailableUsers = async () => {
    setLoadingUsers(true);
    try {
      const res: any = await api.get('/users', { pageSize: 100 });
      setAvailableUsers(res?.users || res || []);
    } catch (err) {
      console.error('Failed to fetch users', err);
      toast.error('Failed to load user list');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAddUserId) {
      toast.error('Please select a user to add');
      return;
    }
    setSubmittingMember(true);
    try {
      await api.post(`/projects/${id}/members`, {
        userId: selectedAddUserId,
        membershipRole: selectedMembershipRole,
      });
      toast.success('Team member added successfully');
      setSelectedAddUserId('');
      fetchProjectData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add team member');
    } finally {
      setSubmittingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setRemovingMemberId(userId);
    try {
      const res: any = await api.delete(`/projects/${id}/members/${userId}`);
      if (res?.openTasksNeedingReassignment?.length > 0) {
        toast.success(`Member removed. Note: ${res.openTasksNeedingReassignment.length} active task(s) now need reassignment.`);
      } else {
        toast.success('Team member removed');
      }
      fetchProjectData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove team member');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const fetchEligibleDevelopers = async () => {
    setLoadingEligibleDevs(true);
    try {
      const res: any = await api.get(`/projects/${id}/eligible-developers`);
      const devs = Array.isArray(res) ? res : (res?.data || []);
      setEligibleDevelopers(devs.filter((d: any) => d.role === UserRole.DEVELOPER));
    } catch (err) {
      console.error('Failed to fetch eligible developers', err);
      toast.error('Failed to load eligible developers list');
    } finally {
      setLoadingEligibleDevs(false);
    }
  };

  const handleAssignDeveloper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevId) {
      toast.error('Please select a developer to assign');
      return;
    }
    setSubmittingDev(true);
    try {
      await api.post(`/projects/${id}/members`, {
        userId: selectedDevId,
        membershipRole: 'DEVELOPER',
      });
      toast.success('Developer assigned to project successfully');
      setSelectedDevId('');
      fetchProjectData();
      fetchEligibleDevelopers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign developer');
    } finally {
      setSubmittingDev(false);
    }
  };

  const handleRemoveDeveloper = async (userId: string) => {
    setRemovingDevId(userId);
    try {
      const res: any = await api.delete(`/projects/${id}/members/${userId}`);
      if (res?.openTasksNeedingReassignment?.length > 0) {
        toast.success(`Developer removed. ${res.openTasksNeedingReassignment.length} active task(s) now need reassignment.`);
      } else {
        toast.success('Developer removed from project');
      }
      fetchProjectData();
      fetchEligibleDevelopers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove developer');
    } finally {
      setRemovingDevId(null);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  useEffect(() => {
    fetchTabData();
  }, [id, activeTab]);

  // Auto-expand the requirement referenced by a notification link (?requirementId=...)
  useEffect(() => {
    const reqId = searchParams.get('requirementId');
    if (!reqId) return;
    if (expandedReqId === reqId) return;
    const target = requirements.find((r) => r.id === reqId);
    if (target) {
      toggleReqDetail(reqId);
      setSearchParams(
        { tab: 'requirements' },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements, searchParams]);

  // Scroll to the item referenced by a deep link (taskId / bugId / requirementId)
  useEffect(() => {
    const targetId =
      searchParams.get('taskId') ||
      searchParams.get('bugId') ||
      searchParams.get('requirementId');
    if (!targetId) return;
    const id = (searchParams.get('taskId') && `task-${searchParams.get('taskId')}`) ||
      (searchParams.get('bugId') && `bug-${searchParams.get('bugId')}`) ||
      (searchParams.get('requirementId') && `req-${searchParams.get('requirementId')}`);
    const el = id ? document.getElementById(id) : null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-brand-300');
      setTimeout(() => el.classList.remove('ring-2', 'ring-brand-300'), 2000);
    }
  }, [searchParams, requirements, tasks, bugs, activeTab]);

  const canManage =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.PROJECT_MANAGER;

  const isProjectApprovedInternalStage =
    project?.status && !['ARCHIVED', 'CANCELLED'].includes(project.status);

  const canAssignDevelopers = canManage && isProjectApprovedInternalStage;

  const canViewFinance = canManage;

  // QA cannot create/edit development tasks (backend enforces this too).
  const canCreateTask =
    canManage || user?.role === UserRole.DEVELOPER;
  const canUpdateTask = canCreateTask;

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
      toast.success('Requirement created');
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create requirement');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/tasks', {
        projectId: id,
        requirementId: selectedReq?.id || taskRequirementId || undefined,
        title: taskTitle,
        description: taskDesc,
        assigneeId: taskAssigneeId || undefined,
        priority: taskPriority,
        estimatedHours: parseFloat(taskEstimatedHours) || 0,
      });
      setIsTaskModalOpen(false);
      setTaskTitle('');
      setTaskDesc('');
      setTaskAssigneeId('');
      setTaskRequirementId('');
      toast.success('Task created');
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create task');
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
      toast.success('Time logged');
      fetchTabData();
      fetchProjectData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to log time');
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
      toast.success('Bug reported');
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to report bug');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus });
      toast.success(`Task moved to ${newStatus}`);
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update task status');
    }
  };

  const handleUpdateBugStatus = async (bugId: string, newStatus: string) => {
    try {
      await api.patch(`/qa/bugs/${bugId}/status`, { status: newStatus });
      toast.success(`Bug moved to ${newStatus}`);
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update bug status');
    }
  };

  // ---- Requirement workflow ----

  const toggleReqDetail = async (reqId: string) => {
    const next = expandedReqId === reqId ? null : reqId;
    setExpandedReqId(next);
    if (next) {
      setReqDetailLoading(true);
      try {
        const detail: any = await api.get(`/requirements/${reqId}`);
        setReqDetail(detail);
      } catch (err: any) {
        toast.error(err.message || 'Failed to load requirement detail');
      } finally {
        setReqDetailLoading(false);
      }
    } else {
      setReqDetail(null);
    }
  };

  const handleRequirementTransition = async (reqId: string, toStatus: string, comment?: string) => {
    try {
      await api.post(`/requirements/${reqId}/transition`, { toStatus, ...(comment ? { comment } : {}) });
      toast.success(`Requirement moved to ${toStatus}`);
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update requirement status');
    }
  };

  const openAskClarification = (reqId: string) => {
    setClarificationReqId(reqId);
    setClarificationText('');
    setIsAskClarificationOpen(true);
  };

  const handleSendClarificationRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarificationReqId || !clarificationText.trim()) return;
    try {
      await handleRequirementTransition(
        clarificationReqId,
        RequirementStatus.NEEDS_CLARIFICATION,
        clarificationText.trim()
      );
      setIsAskClarificationOpen(false);
      setClarificationText('');
      setClarificationReqId(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send clarification request');
    }
  };

  const openEstimateModal = (reqId: string) => {
    setEstimateReqId(reqId);
    setIsEstimateModalOpen(true);
  };

  const handleCreateEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estimateReqId) return;
    try {
      await api.post(`/requirements/${estimateReqId}/estimates`, {
        devHours: parseFloat(estDevHours) || 0,
        qaHours: parseFloat(estQaHours) || 0,
        designHours: parseFloat(estDesignHours) || 0,
        estimatedCost: parseFloat(estCost) || 0,
        clientPrice: parseFloat(estClientPrice) || 0,
        proposedDeliveryDate: estDelivery ? new Date(estDelivery).toISOString() : null,
        assumptions: estAssumptions || undefined,
        exclusions: estExclusions || undefined,
        notes: estNotes || undefined,
      });
      setIsEstimateModalOpen(false);
      setEstimateReqId(null);
      setEstAssumptions('');
      setEstExclusions('');
      setEstNotes('');
      setEstDelivery('');
      toast.success('Estimate created. Send it once reviewed.');
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create estimate');
    }
  };

  const handleSendEstimate = async (reqId: string, estimateId: string) => {
    try {
      await api.post(`/requirements/${reqId}/estimates/${estimateId}/send`);
      toast.success('Estimate sent to client for approval');
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send estimate');
    }
  };

  // ---- Releases ----

  const openReleaseModal = (reqIds: string[]) => {
    setRelSelectedReqs(reqIds || []);
    setIsReleaseModalOpen(true);
  };

  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (relSelectedReqs.length === 0) {
      toast.error('Select at least one requirement to include in this release');
      return;
    }
    try {
      await api.post('/releases', {
        projectId: id,
        version: relVersion,
        name: relName,
        releaseDate: new Date().toISOString(),
        releaseNotes: relReleaseNotes || undefined,
        deploymentNotes: relDeploymentNotes || undefined,
        itemIds: relSelectedReqs.map((rid) => ({
          itemType: ReleaseItemType.REQUIREMENT,
          requirementId: rid,
        })),
      });
      setIsReleaseModalOpen(false);
      setRelVersion('1.0.0');
      setRelName('MVP Launch');
      setRelReleaseNotes('');
      setRelDeploymentNotes('');
      setRelSelectedReqs([]);
      toast.success('Release planned');
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to plan release');
    }
  };

  const handleReleaseStatus = async (releaseId: string, status: string) => {
    try {
      await api.patch(`/releases/${releaseId}/status`, { status });
      toast.success(`Release marked ${status}`);
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update release');
    }
  };

  // ---- Finance ----

  const openInvoiceModal = () => {
    setInvNumber(`INV-${Date.now().toString().slice(-6)}`);
    setIsInvoiceModalOpen(true);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const amount = parseFloat(invAmount) || 0;
      await api.post('/invoices', {
        organizationId: project.organizationId,
        projectId: id,
        invoiceNumber: invNumber,
        issuedDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        currency: 'USD',
        discount: parseFloat(invDiscount) || 0,
        tax: parseFloat(invTax) || 0,
        notes: invNotes || undefined,
        items: [{ description: `Project work: ${project.name}`, quantity: 1, unitPrice: amount }],
      });
      setIsInvoiceModalOpen(false);
      setInvNotes('');
      toast.success('Draft invoice created');
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create invoice');
    }
  };

  const handleIssueInvoice = async (invoiceId: string) => {
    try {
      await api.post(`/invoices/${invoiceId}/issue`);
      toast.success('Invoice issued and client notified');
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to issue invoice');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      await api.post(`/invoices/${selectedInvoice.id}/payments`, {
        invoiceId: selectedInvoice.id,
        amount: parseFloat(payAmount) || 0,
        paymentDate: new Date().toISOString(),
        method: payMethod,
        reference: payReference || undefined,
      });
      setIsPaymentModalOpen(false);
      setPayAmount('0');
      setPayReference('');
      toast.success('Payment recorded');
      fetchTabData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
    }
  };

  if (loading || !project) return <LoadingSpinner size="lg" className="h-64" />;

  // Requirement workflow actions for the internal workspace (clients review in
  // the portal). Mirrors the backend REQUIREMENT_TRANSITIONS map.
  const getRequirementActions = (req: any) => {
    const r = user?.role as UserRole;
    const has = (...roles: UserRole[]) => roles.includes(r);
    const canManage = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER].includes(r);
    const trans = (to: string) => ({
      label: `→ ${to.replace(/_/g, ' ')}`,
      onClick: () => handleRequirementTransition(req.id, to),
    });

    switch (req.status as RequirementStatus) {
      case RequirementStatus.DRAFT:
        return [];
      case RequirementStatus.SUBMITTED:
        if (canManage)
          return [
            trans(RequirementStatus.UNDER_REVIEW),
            { label: 'Ask Clarification', onClick: () => openAskClarification(req.id) },
            { label: 'Cancel', onClick: () => handleRequirementTransition(req.id, RequirementStatus.CANCELLED) },
          ];
        return [];
      case RequirementStatus.UNDER_REVIEW:
        if (canManage)
          return [
            trans(RequirementStatus.ESTIMATING),
            { label: 'Ask Clarification', onClick: () => openAskClarification(req.id) },
            { label: 'Cancel', onClick: () => handleRequirementTransition(req.id, RequirementStatus.CANCELLED) },
          ];
        return [];
      case RequirementStatus.NEEDS_CLARIFICATION:
        if (canManage)
          return [
            trans(RequirementStatus.UNDER_REVIEW),
            { label: 'Cancel', onClick: () => handleRequirementTransition(req.id, RequirementStatus.CANCELLED) },
          ];
        return [];
      case RequirementStatus.ESTIMATING:
        if (canManage) return [{ label: 'Create Estimate', onClick: () => openEstimateModal(req.id) }];
        return [];
      case RequirementStatus.WAITING_FOR_APPROVAL:
        if (canManage)
          return [
            { label: 'Ask Clarification', onClick: () => openAskClarification(req.id) },
            { label: 'Cancel', onClick: () => handleRequirementTransition(req.id, RequirementStatus.CANCELLED) },
          ];
        return [];
      case RequirementStatus.APPROVED:
        if (canManage) return [trans(RequirementStatus.IN_DEVELOPMENT)];
        return [];
      case RequirementStatus.IN_DEVELOPMENT:
        if (has(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.DEVELOPER, UserRole.QA))
          return [trans(RequirementStatus.QA)];
        return [];
      case RequirementStatus.QA:
        if (has(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QA))
          return [trans(RequirementStatus.CLIENT_REVIEW)];
        return [];
      case RequirementStatus.CLIENT_REVIEW:
        if (canManage)
          return [{ label: 'Send Back for Revisions', onClick: () => handleRequirementTransition(req.id, RequirementStatus.IN_DEVELOPMENT) }];
        return [];
      case RequirementStatus.REJECTED:
        if (canManage) return [trans(RequirementStatus.SUBMITTED)];
        return [];
      default:
        return [];
    }
  };

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
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Assigned Developers
                </h3>
                {canAssignDevelopers && (
                  <button
                    type="button"
                    onClick={() => {
                      fetchEligibleDevelopers();
                      setIsAssignDevModalOpen(true);
                    }}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1"
                  >
                    + Assign Developers
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {(!project.members || project.members.filter((m: any) => !m.leftAt && (m.membershipRole === 'DEVELOPER' || m.user?.role === 'DEVELOPER')).length === 0) ? (
                  <p className="text-xs text-slate-400 italic">No developers assigned to this project yet.</p>
                ) : (
                  project.members.filter((m: any) => !m.leftAt && (m.membershipRole === 'DEVELOPER' || m.user?.role === 'DEVELOPER')).map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold border border-brand-200">
                          {m.user?.profile?.firstName?.[0] || 'D'}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">
                            {m.user?.profile?.displayName || m.user?.email}
                          </p>
                          <p className="text-[10px] text-slate-500">Developer</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Assigned Team
                </h3>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => {
                      fetchAvailableUsers();
                      setIsTeamModalOpen(true);
                    }}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1"
                  >
                    + Manage
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {(!project.members || project.members.filter((m: any) => !m.leftAt).length === 0) ? (
                  <p className="text-xs text-slate-400 italic">No team members assigned yet.</p>
                ) : (
                  project.members.filter((m: any) => !m.leftAt).map((m: any) => (
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
                  ))
                )}
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
              {requirements.map((req) => {
                const actions = getRequirementActions(req);
                const isExpanded = expandedReqId === req.id;
                return (
                  <div
                    key={req.id}
                    id={`req-${req.id}`}
                    className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[11px] font-mono font-bold text-slate-500">
                            v{req.currentVersion}
                          </span>
                          <StatusBadge status={req.status} />
                          <PriorityBadge priority={req.priority} />
                        </div>
                        <h4 className="text-base font-bold text-slate-900">{req.title}</h4>
                      </div>
                      <button
                        onClick={() => toggleReqDetail(req.id)}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {isExpanded ? 'Hide detail' : 'Estimate & history'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600">{req.description}</p>
                    <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-100">
                      <strong className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                        Acceptance Criteria
                      </strong>
                      {req.acceptanceCriteria}
                    </div>

                    {/* Workflow actions */}
                    {actions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {actions.map((a) => (
                          <button
                            key={a.label}
                            onClick={a.onClick}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {req.status === RequirementStatus.WAITING_FOR_APPROVAL && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        Waiting for the client to approve the estimate in the portal.
                      </p>
                    )}

                    {/* Expandable detail: estimates + history */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 pt-3 space-y-4">
                        {reqDetailLoading ? (
                          <LoadingSpinner size="sm" className="py-4" />
                        ) : reqDetail?.id === req.id ? (
                          <>
                            {reqDetail.estimates?.length ? (
                              <div>
                                <h5 className="text-[10px] uppercase font-bold text-slate-400 mb-2">
                                  Estimates ({reqDetail.estimates.length})
                                </h5>
                                <div className="space-y-2">
                                  {reqDetail.estimates.map((est: any) => (
                                    <div
                                      key={est.id}
                                      className="flex items-center justify-between text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex-wrap gap-2"
                                    >
                                      <div className="text-slate-700">
                                        <span className="font-mono font-bold">E{est.version}</span>
                                        <span className="mx-2">
                                          {est.devHours}dev / {est.qaHours}qa
                                        </span>
                                        <span className="font-semibold text-slate-900">
                                          ${Number(est.clientPrice).toLocaleString()}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <StatusBadge status={est.status} />
                                        {est.status === 'DRAFT' && canManage && (
                                          <button
                                            onClick={() => handleSendEstimate(req.id, est.id)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                                          >
                                            <Send className="h-3 w-3" /> Send for Approval
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400">No estimates yet.</p>
                            )}

                            {reqDetail.statusHistory?.length ? (
                              <div>
                                <h5 className="text-[10px] uppercase font-bold text-slate-400 mb-2">
                                  Status History
                                </h5>
                                <div className="space-y-2">
                                  {reqDetail.statusHistory.map((h: any) => (
                                    <div key={h.id} className="flex items-start gap-2 text-xs">
                                      <History className="h-3.5 w-3.5 text-slate-300 mt-0.5" />
                                      <div className="text-slate-600">
                                        <span className="font-semibold text-slate-800">
                                          {h.fromStatus} → {h.toStatus}
                                        </span>
                                        <span className="text-slate-400 ml-2">
                                          {new Date(h.createdAt).toLocaleString()}
                                        </span>
                                        {h.comment && <div className="text-slate-500">{h.comment}</div>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. TASKS TAB */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Development Tasks</h3>
            {canCreateTask && (
              <button
                onClick={() => setIsTaskModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
              >
                <Plus className="h-3.5 w-3.5" /> Create Task
              </button>
            )}
          </div>

          {tasks.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="No tasks created"
              description="Create development tasks linked to approved requirements."
              {...(canCreateTask
                ? { action: { label: 'Create Task', onClick: () => setIsTaskModalOpen(true) } }
                : {})}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  id={`task-${t.id}`}
                  className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <PriorityBadge priority={t.priority} />
                      {canUpdateTask ? (
                        <select
                          value={t.status}
                          onChange={(e) => handleUpdateTaskStatus(t.id, e.target.value)}
                          aria-label={`Status for task: ${t.title}`}
                          className="text-[11px] font-semibold bg-slate-50 border border-slate-200 rounded px-2 py-0.5 focus:outline-none"
                        >
                          <option value="TODO">TODO</option>
                          <option value="IN_PROGRESS">IN PROGRESS</option>
                          <option value="CODE_REVIEW">CODE REVIEW</option>
                          <option value="BLOCKED">BLOCKED</option>
                          <option value="READY_FOR_QA">READY FOR QA</option>
                          <option value="DONE">DONE</option>
                        </select>
                      ) : (
                        <StatusBadge status={t.status} />
                      )}
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
                  id={`bug-${bug.id}`}
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
                      aria-label={`Status for bug: ${bug.title}`}
                      className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded px-2 py-1"
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="TRIAGED">TRIAGED</option>
                      <option value="IN_PROGRESS">IN PROGRESS</option>
                      <option value="FIXED">FIXED</option>
                      <option value="READY_FOR_RETEST">READY FOR RETEST</option>
                      <option value="REOPENED">REOPENED</option>
                      <option value="WONT_FIX">WON&apos;T FIX</option>
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

      {/* 5. RELEASES TAB */}
      {activeTab === 'releases' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Release Planning</h3>
            {canManage && (
              <button
                onClick={() => openReleaseModal(requirements.filter((r) => r.status === 'COMPLETED' || r.status === 'CLIENT_REVIEW' || r.status === 'QA' || r.status === 'IN_DEVELOPMENT').map((r) => r.id))}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
              >
                <Plus className="h-3.5 w-3.5" /> Plan Release
              </button>
            )}
          </div>

          {releases.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title="No releases planned"
              description="Group completed work into versioned releases."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {releases.map((rel) => {
                const actions: { label: string; status: string }[] = [];
                if (canManage) {
                  const nextBy: any = {
                    [ReleaseStatus.PLANNED]: [
                      { label: 'Start', status: ReleaseStatus.IN_PROGRESS },
                      { label: 'Cancel', status: ReleaseStatus.CANCELLED },
                    ],
                    [ReleaseStatus.IN_PROGRESS]: [
                      { label: 'Mark Ready', status: ReleaseStatus.READY },
                      { label: 'Cancel', status: ReleaseStatus.CANCELLED },
                    ],
                    [ReleaseStatus.READY]: [
                      { label: 'Deploy', status: ReleaseStatus.DEPLOYED },
                      { label: 'Cancel', status: ReleaseStatus.CANCELLED },
                    ],
                    [ReleaseStatus.DEPLOYED]: [{ label: 'Roll Back', status: ReleaseStatus.ROLLED_BACK }],
                    [ReleaseStatus.ROLLED_BACK]: [{ label: 'Re-plan', status: ReleaseStatus.PLANNED }],
                    [ReleaseStatus.CANCELLED]: [{ label: 'Re-plan', status: ReleaseStatus.PLANNED }],
                  };
                  actions.push(...(nextBy[rel.status] || []));
                }
                return (
                  <div
                    key={rel.id}
                    className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                            {rel.version}
                          </span>
                          <StatusBadge status={rel.status} />
                        </div>
                        <h4 className="text-base font-bold text-slate-900">{rel.name}</h4>
                      </div>
                    </div>
                    {rel.releaseNotes && (
                      <p className="text-xs text-slate-500">{rel.releaseNotes}</p>
                    )}
                    {rel.items?.length > 0 && (
                      <div className="space-y-1">
                        {rel.items.map((item: any) => (
                          <div key={item.id} className="text-[11px] text-slate-600 flex items-center gap-2">
                            <FileText className="h-3 w-3 text-slate-300" />
                            <span>
                              {item.requirement ? item.requirement.title
                                : item.bug ? `[Bug] ${item.bug.title}`
                                : item.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {actions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {actions.map((a) => (
                          <button
                            key={a.status}
                            onClick={() => handleReleaseStatus(rel.id, a.status)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 6. FILES TAB */}
      {activeTab === 'files' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Project Files</h3>
          {files.length === 0 ? (
            <EmptyState
              icon={FileUp}
              title="No files uploaded"
              description="Documents, evidence, and attachments for this project appear here."
            />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100">
              {files.map((f) => (
                <div key={f.id} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Paperclip className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {f.originalFilename}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {f.mimeType} • {(f.sizeBytes / 1024).toFixed(1)} KB •{' '}
                        {f.uploadedBy?.profile?.displayName || f.uploadedBy?.email || 'Unknown'}{' '}
                        • {new Date(f.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={f.visibility} />
                    {f.downloadUrl ? (
                      <a
                        href={f.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400" title="Object storage is not configured in this environment">
                        Download unavailable
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7. ACTIVITY TIMELINE TAB */}
      {activeTab === 'activity' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Activity Timeline</h3>
          {activities.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Project activity — status changes, comments, and workflow events — appears here."
            />
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100">
              {activities.map((a: any) => (
                <div key={a.id} className="px-5 py-3.5 flex items-start gap-3">
                  <Activity className="h-4 w-4 text-brand-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-700">{a.message}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {a.actor?.profile?.displayName || a.actor?.email || 'System'} •{' '}
                      {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={a.visibility} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 8. FINANCE & INVOICES TAB */}
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Project Invoices</h3>
              <button
                onClick={openInvoiceModal}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700"
              >
                <Plus className="h-3.5 w-3.5" /> New Invoice
              </button>
            </div>
            {invoices.length === 0 ? (
              <p className="text-xs text-slate-400">No invoices issued for this project yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <div key={inv.id} className="py-3 flex items-center justify-between text-xs gap-3 flex-wrap">
                    <div>
                      <span className="font-mono font-bold text-slate-900">
                        {inv.invoiceNumber}
                      </span>
                      <span className="text-slate-400 ml-2">
                        Due: {new Date(inv.dueDate).toLocaleDateString()}
                      </span>
                      <span className="text-slate-400 ml-2">
                        Paid: ${Number(inv.totalPaid ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <strong className="text-slate-900">
                        ${Number(inv.total).toLocaleString()}
                      </strong>
                      <StatusBadge status={inv.status} />
                      {inv.status === 'DRAFT' ? (
                        <button
                          onClick={() => handleIssueInvoice(inv.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        >
                          Issue & Notify
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setPayAmount('0');
                            setIsPaymentModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                        >
                          <Wallet className="h-3 w-3" /> Record Payment
                        </button>
                      )}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Assignee</label>
              {(() => {
                const activeMembers = project.members?.filter((m: any) => !m.leftAt) || [];
                const eligibleAssignees = activeMembers.filter((m: any) => {
                  if (user?.role === UserRole.PROJECT_MANAGER) {
                    return m.user?.role === UserRole.DEVELOPER || m.membershipRole === 'DEVELOPER';
                  }
                  return true;
                });
                return (
                  <div>
                    <select
                      value={taskAssigneeId}
                      onChange={(e) => setTaskAssigneeId(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none"
                    >
                      <option value="">
                        {eligibleAssignees.length === 0 ? 'No eligible developers on project' : 'Unassigned'}
                      </option>
                      {eligibleAssignees.map((m: any) => (
                        <option key={m.id} value={m.user?.id}>
                          {m.user?.profile?.displayName || m.user?.email}
                        </option>
                      ))}
                    </select>
                    {eligibleAssignees.length === 0 && canAssignDevelopers && (
                      <button
                        type="button"
                        onClick={() => {
                          fetchEligibleDevelopers();
                          setIsAssignDevModalOpen(true);
                        }}
                        className="mt-1.5 text-[11px] font-semibold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1"
                      >
                        + Assign developers to project
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Priority</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Linked Requirement</label>
            <select
              value={taskRequirementId}
              onChange={(e) => setTaskRequirementId(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none"
            >
              <option value="">None</option>
              {requirements.map((req) => (
                <option key={req.id} value={req.id}>
                  [v{req.currentVersion}] {req.title}
                </option>
              ))}
            </select>
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

      {/* Estimate Modal */}
      <Modal
        isOpen={isEstimateModalOpen}
        onClose={() => {
          setIsEstimateModalOpen(false);
          setEstimateReqId(null);
        }}
        title="Create Estimate"
      >
        <form onSubmit={handleCreateEstimate} className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Dev Hours</label>
              <input
                type="number"
                min="0"
                value={estDevHours}
                onChange={(e) => setEstDevHours(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">QA Hours</label>
              <input
                type="number"
                min="0"
                value={estQaHours}
                onChange={(e) => setEstQaHours(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Design Hours</label>
              <input
                type="number"
                min="0"
                value={estDesignHours}
                onChange={(e) => setEstDesignHours(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Client Price ($)</label>
              <input
                type="number"
                min="0"
                value={estClientPrice}
                onChange={(e) => setEstClientPrice(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Internal Cost ($)</label>
              <input
                type="number"
                min="0"
                value={estCost}
                onChange={(e) => setEstCost(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Proposed Delivery Date</label>
            <input
              type="date"
              value={estDelivery}
              onChange={(e) => setEstDelivery(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Assumptions</label>
            <textarea
              rows={2}
              value={estAssumptions}
              onChange={(e) => setEstAssumptions(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Exclusions</label>
            <textarea
              rows={2}
              value={estExclusions}
              onChange={(e) => setEstExclusions(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => {
                setIsEstimateModalOpen(false);
                setEstimateReqId(null);
              }}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white"
            >
              Save Estimate
            </button>
          </div>
        </form>
      </Modal>

      {/* Release Modal */}
      <Modal
        isOpen={isReleaseModalOpen}
        onClose={() => setIsReleaseModalOpen(false)}
        title="Plan New Release"
      >
        <form onSubmit={handleCreateRelease} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Version</label>
              <input
                type="text"
                placeholder="1.0.0"
                value={relVersion}
                onChange={(e) => setRelVersion(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Name</label>
              <input
                type="text"
                value={relName}
                onChange={(e) => setRelName(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Items (select requirements to include)</label>
            <div className="mt-1 max-h-40 overflow-y-auto border rounded-lg divide-y divide-slate-100">
              {requirements.map((req) => {
                const checked = relSelectedReqs.includes(req.id);
                return (
                  <label
                    key={req.id}
                    className={`flex items-start gap-2 px-3 py-2 cursor-pointer text-xs ${
                      checked ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setRelSelectedReqs((prev) =>
                          checked ? prev.filter((x) => x !== req.id) : [...prev, req.id]
                        )
                      }
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-700">
                      <StatusBadge status={req.status} />{' '}
                      <span className="font-semibold">[v{req.currentVersion}] {req.title}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Release Notes</label>
            <textarea
              rows={2}
              value={relReleaseNotes}
              onChange={(e) => setRelReleaseNotes(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Deployment Notes</label>
            <textarea
              rows={2}
              value={relDeploymentNotes}
              onChange={(e) => setRelDeploymentNotes(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsReleaseModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white"
            >
              Plan Release
            </button>
          </div>
        </form>
      </Modal>

      {/* Invoice Modal */}
      <Modal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        title="Create Invoice"
      >
        <form onSubmit={handleCreateInvoice} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Invoice Number</label>
              <input
                type="text"
                value={invNumber}
                onChange={(e) => setInvNumber(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Total Amount ($)</label>
              <input
                type="number"
                min="0"
                value={invAmount}
                onChange={(e) => setInvAmount(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Tax %</label>
              <input
                type="number"
                min="0"
                value={invTax}
                onChange={(e) => setInvTax(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Discount %</label>
              <input
                type="number"
                min="0"
                value={invDiscount}
                onChange={(e) => setInvDiscount(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Notes</label>
            <textarea
              rows={2}
              value={invNotes}
              onChange={(e) => setInvNotes(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsInvoiceModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white"
            >
              Create Draft
            </button>
          </div>
        </form>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Record Payment: ${selectedInvoice?.invoiceNumber || ''}`}
      >
        <form onSubmit={handleRecordPayment} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Amount ($)</label>
            <input
              type="number"
              min="0.01"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Method</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            >
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="CASH">Cash</option>
              <option value="CHECK">Check</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Reference</label>
            <input
              type="text"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white"
            >
              <Wallet className="h-3.5 w-3.5" /> Record Payment
            </button>
          </div>
        </form>
      </Modal>

      {/* Ask Clarification Modal */}
      <Modal
        isOpen={isAskClarificationOpen}
        onClose={() => setIsAskClarificationOpen(false)}
        title="Ask Clarification from Client"
      >
        <form onSubmit={handleSendClarificationRequest} className="space-y-4">
          <p className="text-xs text-slate-600">
            Specify what details or questions the client needs to answer before this requirement can proceed.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Clarification Question / Message</label>
            <textarea
              required
              rows={4}
              value={clarificationText}
              onChange={(e) => setClarificationText(e.target.value)}
              placeholder="Describe the clarification needed from the client..."
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsAskClarificationOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!clarificationText.trim()}
              className="px-3.5 py-1.5 rounded text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Send Clarification Request
            </button>
          </div>
        </form>
      </Modal>
      {/* Assign Developers Modal */}
      <Modal
        isOpen={isAssignDevModalOpen}
        onClose={() => setIsAssignDevModalOpen(false)}
        title="Assign Developers to Project"
      >
        <div className="space-y-6">
          {/* Currently Assigned Developers */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Currently Assigned Developers ({project?.members?.filter((m: any) => !m.leftAt && (m.membershipRole === 'DEVELOPER' || m.user?.role === 'DEVELOPER')).length || 0})
            </h4>
            {(!project?.members || project.members.filter((m: any) => !m.leftAt && (m.membershipRole === 'DEVELOPER' || m.user?.role === 'DEVELOPER')).length === 0) ? (
              <p className="text-xs text-slate-500 italic">No developers assigned to this project yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                {project.members.filter((m: any) => !m.leftAt && (m.membershipRole === 'DEVELOPER' || m.user?.role === 'DEVELOPER')).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-white hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold border border-brand-200">
                        {m.user?.profile?.firstName?.[0] || 'D'}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          {m.user?.profile?.displayName || m.user?.email}
                        </p>
                        <p className="text-[10px] text-slate-500">Developer</p>
                      </div>
                    </div>
                    {canAssignDevelopers && (
                      <button
                        type="button"
                        onClick={() => handleRemoveDeveloper(m.user?.id || m.userId)}
                        disabled={removingDevId === (m.user?.id || m.userId)}
                        className="px-2.5 py-1 rounded text-[11px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors disabled:opacity-50"
                      >
                        {removingDevId === (m.user?.id || m.userId) ? 'Removing...' : 'Remove Developer'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Assign Eligible Developer Form */}
          {canAssignDevelopers && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Assign Eligible Developer
              </h4>
              <form onSubmit={handleAssignDeveloper} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Select Developer</label>
                  {loadingEligibleDevs ? (
                    <p className="text-xs text-slate-500 py-2">Loading eligible developers...</p>
                  ) : eligibleDevelopers.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2 italic">No unassigned developers available for assignment.</p>
                  ) : (
                    <select
                      value={selectedDevId}
                      onChange={(e) => setSelectedDevId(e.target.value)}
                      required
                      className="mt-1 w-full px-3 py-2 rounded-lg border text-xs bg-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="">-- Choose a developer --</option>
                      {eligibleDevelopers.map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.profile?.displayName || d.email}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={submittingDev || !selectedDevId}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {submittingDev ? 'Assigning...' : 'Assign Developer'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </Modal>

      {/* Manage Team Modal */}
      <Modal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
        title="Manage Project Team"
      >
        <div className="space-y-6">
          {/* Current Active Team Members */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Current Project Members ({project?.members?.filter((m: any) => !m.leftAt).length || 0})
            </h4>
            {(!project?.members || project.members.filter((m: any) => !m.leftAt).length === 0) ? (
              <p className="text-xs text-slate-500 italic">No active members on this project yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                {project.members.filter((m: any) => !m.leftAt).map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-white hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700 text-xs font-bold border border-brand-200">
                        {m.user?.profile?.firstName?.[0] || 'U'}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-900">
                          {m.user?.profile?.displayName || m.user?.email}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Role: <span className="font-semibold text-slate-700">{m.membershipRole}</span> ({m.user?.role})
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(m.user?.id || m.userId)}
                        disabled={removingMemberId === (m.user?.id || m.userId)}
                        className="px-2.5 py-1 rounded text-[11px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors disabled:opacity-50"
                      >
                        {removingMemberId === (m.user?.id || m.userId) ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Team Member Section */}
          {canManage && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Add New Team Member
              </h4>
              <form onSubmit={handleAddMember} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Select User</label>
                  {loadingUsers ? (
                    <p className="text-xs text-slate-500 py-2">Loading eligible users...</p>
                  ) : (
                    <select
                      value={selectedAddUserId}
                      onChange={(e) => setSelectedAddUserId(e.target.value)}
                      required
                      className="mt-1 w-full px-3 py-2 rounded-lg border text-xs bg-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="">-- Choose a user --</option>
                      {availableUsers
                        .filter((u: any) => u.status === 'ACTIVE' && u.role !== UserRole.CLIENT)
                        .filter((u: any) => !project?.members?.some((m: any) => !m.leftAt && (m.userId === u.id || m.user?.id === u.id)))
                        .map((u: any) => (
                          <option key={u.id} value={u.id}>
                            {u.profile?.displayName || u.email} ({u.role})
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Project Membership Role</label>
                  <select
                    value={selectedMembershipRole}
                    onChange={(e) => setSelectedMembershipRole(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border text-xs bg-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="DEVELOPER">DEVELOPER</option>
                    <option value="QA">QA</option>
                    <option value="PROJECT_MANAGER">PROJECT_MANAGER</option>
                  </select>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={submittingMember || !selectedAddUserId}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                  >
                    {submittingMember ? 'Adding...' : 'Add to Project'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
