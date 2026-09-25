import React, { useState, useEffect, useMemo } from 'react';
import {
  Rocket,
  Search,
  Check,
  X,
  AlertCircle,
  Calendar,
  FileText,
  CheckCircle2,
  Layers,
  Info,
  Filter,
} from 'lucide-react';
import { api } from '../../../api/client';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { PriorityBadge } from '../../../components/ui/PriorityBadge';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner';
import { useToast } from '../../../context/ToastContext';
import { ReleaseItemType, RequirementStatus } from '@deliveryos/shared';

interface PlanReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess: () => void;
  initialSelectedReqIds?: string[];
}

const ELIGIBLE_STATUSES = new Set([
  RequirementStatus.COMPLETED,
  RequirementStatus.CLIENT_REVIEW,
  RequirementStatus.QA,
  RequirementStatus.IN_DEVELOPMENT,
]);

export const PlanReleaseModal: React.FC<PlanReleaseModalProps> = ({
  isOpen,
  onClose,
  projectId,
  onSuccess,
  initialSelectedReqIds = [],
}) => {
  const toast = useToast();

  // Form Fields
  const [version, setVersion] = useState('1.0.0');
  const [name, setName] = useState('');
  const [targetDate, setTargetDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [releaseNotes, setReleaseNotes] = useState('');
  const [deploymentNotes, setDeploymentNotes] = useState('');

  // Requirements State
  const [requirements, setRequirements] = useState<any[]>([]);
  const [loadingRequirements, setLoadingRequirements] = useState(false);
  const [selectedReqIds, setSelectedReqIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'eligible' | 'all'>('eligible');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formTouched, setFormTouched] = useState(false);

  // Fetch requirements whenever the modal opens
  useEffect(() => {
    if (!isOpen || !projectId) return;

    let isMounted = true;
    const fetchReqs = async () => {
      setLoadingRequirements(true);
      try {
        const res: any = await api.get('/requirements', {
          projectId,
          pageSize: 100,
        });
        if (isMounted) {
          const list = Array.isArray(res) ? res : res?.items || [];
          setRequirements(list);

          // If initial selected IDs were provided, use them;
          // otherwise, if user opens fresh and eligible requirements exist,
          // leave selection for the user to make explicitly or keep existing.
          if (initialSelectedReqIds.length > 0) {
            setSelectedReqIds(initialSelectedReqIds);
          }
        }
      } catch (err: any) {
        console.error('Failed to load project requirements for release modal', err);
        toast.error('Failed to load project requirements');
      } finally {
        if (isMounted) setLoadingRequirements(false);
      }
    };

    fetchReqs();

    return () => {
      isMounted = false;
    };
  }, [isOpen, projectId]);

  // Reset state when opening or closing
  useEffect(() => {
    if (isOpen) {
      if (initialSelectedReqIds.length > 0) {
        setSelectedReqIds(initialSelectedReqIds);
      }
      setFormTouched(false);
    }
  }, [isOpen, initialSelectedReqIds]);

  // Filtered requirements list based on filterMode & searchQuery
  const filteredRequirements = useMemo(() => {
    return requirements.filter((req) => {
      // 1. Status eligibility filter
      if (filterMode === 'eligible') {
        if (!ELIGIBLE_STATUSES.has(req.status as RequirementStatus)) {
          return false;
        }
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = req.title?.toLowerCase().includes(q);
        const matchesDesc = req.description?.toLowerCase().includes(q);
        const matchesId = req.id?.toLowerCase().includes(q);
        const matchesStatus = req.status?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesId && !matchesStatus) {
          return false;
        }
      }

      return true;
    });
  }, [requirements, filterMode, searchQuery]);

  // Counts for tabs
  const eligibleCount = useMemo(() => {
    return requirements.filter((r) => ELIGIBLE_STATUSES.has(r.status as RequirementStatus)).length;
  }, [requirements]);

  const allCount = requirements.length;

  // Selected requirements details for preview chips
  const selectedRequirements = useMemo(() => {
    const map = new Map(requirements.map((r) => [r.id, r]));
    return selectedReqIds.map((id) => map.get(id)).filter(Boolean);
  }, [selectedReqIds, requirements]);

  // Toggle single requirement
  const toggleRequirement = (reqId: string) => {
    setSelectedReqIds((prev) =>
      prev.includes(reqId) ? prev.filter((id) => id !== reqId) : [...prev, reqId]
    );
  };

  // Select all currently visible filtered requirements
  const handleSelectAllFiltered = () => {
    const visibleIds = filteredRequirements.map((r) => r.id);
    setSelectedReqIds((prev) => {
      const set = new Set([...prev, ...visibleIds]);
      return Array.from(set);
    });
  };

  // Deselect all currently visible filtered requirements
  const handleDeselectAllFiltered = () => {
    const visibleIds = new Set(filteredRequirements.map((r) => r.id));
    setSelectedReqIds((prev) => prev.filter((id) => !visibleIds.has(id)));
  };

  // Validation
  const isVersionValid = /^v?\d+\.\d+\.\d+/.test(version.trim());
  const isNameValid = name.trim().length >= 2;
  const hasSelectedRequirements = selectedReqIds.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormTouched(true);

    if (!isVersionValid) {
      toast.error('Version must follow semantic versioning, e.g. 1.0.0 or v1.0.0');
      return;
    }

    if (!isNameValid) {
      toast.error('Release name must be at least 2 characters');
      return;
    }

    if (!hasSelectedRequirements) {
      toast.error('Select at least one requirement to include in this release');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/releases', {
        projectId,
        version: version.trim(),
        name: name.trim(),
        releaseDate: targetDate ? new Date(targetDate).toISOString() : new Date().toISOString(),
        releaseNotes: releaseNotes.trim() || undefined,
        deploymentNotes: deploymentNotes.trim() || undefined,
        itemIds: selectedReqIds.map((rid) => ({
          itemType: ReleaseItemType.REQUIREMENT,
          requirementId: rid,
        })),
      });

      toast.success(`Release ${version.trim()} planned successfully`);
      onSuccess();
      onClose();
      // Reset form
      setVersion('1.0.0');
      setName('');
      setReleaseNotes('');
      setDeploymentNotes('');
      setSelectedReqIds([]);
      setFormTouched(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to plan release');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Plan New Release" maxWidth="4xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header context info */}
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-600 text-white shrink-0 mt-0.5">
            <Rocket className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-indigo-950">Release Milestone Packaging</h4>
            <p className="text-xs text-indigo-700/90 mt-0.5">
              Select verified or in-progress requirements to package into a versioned release.
              Once planned, track deployment status through to production release.
            </p>
          </div>
        </div>

        {/* 2-Column Grid: Left (Metadata) / Right (Requirements Selection) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Release Details (5 cols) */}
          <div className="lg:col-span-5 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-200 lg:pr-6 pb-6 lg:pb-0">
            <div className="flex items-center gap-2 text-slate-800">
              <Layers className="h-4 w-4 text-brand-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Release Details
              </h4>
            </div>

            {/* Version & Target Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Version <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="1.0.0"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-xs font-mono transition-colors focus:outline-none focus:ring-2 ${
                      formTouched && !isVersionValid
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                        : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                    }`}
                  />
                </div>
                {formTouched && !isVersionValid && (
                  <p className="text-[11px] text-rose-600 mt-1">e.g. 1.0.0 or v2.1.0</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
                  />
                </div>
              </div>
            </div>

            {/* Release Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Release Title / Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. MVP Launch, Sprint 8 Core, Beta Release"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-xs transition-colors focus:outline-none focus:ring-2 ${
                  formTouched && !isNameValid
                    ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200 bg-rose-50/20'
                    : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
                }`}
              />
              {formTouched && !isNameValid && (
                <p className="text-[11px] text-rose-600 mt-1">Must be at least 2 characters</p>
              )}
            </div>

            {/* Release Notes */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Release Notes
                </label>
                <span className="text-[10px] text-slate-400">Client Visible</span>
              </div>
              <textarea
                rows={3}
                placeholder="Describe key features, customer benefits, and changes included in this release..."
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
              />
            </div>

            {/* Deployment Notes */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Deployment Notes
                </label>
                <span className="text-[10px] text-slate-400">Internal Only</span>
              </div>
              <textarea
                rows={2}
                placeholder="Internal rollout steps, migrations, environment variables, dependencies..."
                value={deploymentNotes}
                onChange={(e) => setDeploymentNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
              />
            </div>
          </div>

          {/* RIGHT COLUMN: Scope & Requirement Selection (7 cols) */}
          <div className="lg:col-span-7 space-y-3 flex flex-col h-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Scope Selection
                </h4>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                    selectedReqIds.length > 0
                      ? 'bg-brand-50 text-brand-700 border border-brand-200'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {selectedReqIds.length} Selected
                </span>
              </div>

              {/* Quick Select Actions */}
              {filteredRequirements.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-brand-600 hover:text-brand-800 font-medium hover:underline text-[11px]"
                  >
                    Select All Visible
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllFiltered}
                    className="text-slate-500 hover:text-slate-700 font-medium hover:underline text-[11px]"
                  >
                    Deselect Visible
                  </button>
                </div>
              )}
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setFilterMode('eligible')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      filterMode === 'eligible'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Eligible ({eligibleCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      filterMode === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Requirements ({allCount})
                  </button>
                </div>

                {filterMode === 'eligible' && eligibleCount === 0 && allCount > 0 && (
                  <span className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
                    <Info className="h-3 w-3" /> None ready; view All
                  </span>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search requirements by title, ID, or status..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Selected Requirements Pills (if any) */}
            {selectedRequirements.length > 0 && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 max-h-24 overflow-y-auto">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1.5">
                  <span>Selected Scope ({selectedRequirements.length}):</span>
                  <button
                    type="button"
                    onClick={() => setSelectedReqIds([])}
                    className="text-rose-600 hover:text-rose-800 text-[10px] hover:underline"
                  >
                    Clear All
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedRequirements.map((req) => (
                    <span
                      key={req.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-brand-200 text-brand-800 text-[11px] font-medium rounded-md shadow-2xs group"
                    >
                      <span className="max-w-[180px] truncate">{req.title}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRequirement(req.id);
                        }}
                        className="text-brand-400 hover:text-rose-600 transition-colors"
                        title="Remove from release"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Requirements List Container */}
            <div className="border border-slate-200 rounded-xl overflow-hidden flex-1 flex flex-col min-h-[260px] max-h-[340px]">
              {loadingRequirements ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <LoadingSpinner size="md" />
                  <p className="text-xs text-slate-500 mt-2">Loading project requirements...</p>
                </div>
              ) : filteredRequirements.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-50/50">
                  <AlertCircle className="h-8 w-8 text-slate-400 mb-2" />
                  {filterMode === 'eligible' && eligibleCount === 0 && allCount > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-700">
                        No active/completed requirements found
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                        Requirements are typically eligible once in development, QA, client review,
                        or completed.
                      </p>
                      <button
                        type="button"
                        onClick={() => setFilterMode('all')}
                        className="mt-3 px-3 py-1 bg-white border border-slate-300 rounded-md text-xs font-semibold text-brand-600 hover:bg-brand-50 hover:border-brand-300 shadow-2xs transition-colors"
                      >
                        View All Project Requirements ({allCount})
                      </button>
                    </div>
                  ) : searchQuery ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-700">
                        No requirements match &ldquo;{searchQuery}&rdquo;
                      </p>
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="mt-2 text-xs text-brand-600 hover:underline"
                      >
                        Clear search filter
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold text-slate-700">
                        No requirements found in this project
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Add and approve requirements first before planning a release.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
                  {filteredRequirements.map((req) => {
                    const isChecked = selectedReqIds.includes(req.id);
                    return (
                      <div
                        key={req.id}
                        onClick={() => toggleRequirement(req.id)}
                        className={`p-3 flex items-start gap-3 cursor-pointer transition-colors text-left ${
                          isChecked
                            ? 'bg-brand-50/40 hover:bg-brand-50/70 border-l-4 border-l-brand-600'
                            : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
                        }`}
                      >
                        {/* Custom styled checkbox */}
                        <div className="mt-0.5 shrink-0">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                              isChecked
                                ? 'bg-brand-600 border-brand-600 text-white'
                                : 'border-slate-300 bg-white hover:border-slate-400'
                            }`}
                          >
                            {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-xs text-slate-900 group-hover:text-brand-600">
                              {req.title}
                            </span>
                            {req.currentVersion && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                v{req.currentVersion}
                              </span>
                            )}
                          </div>

                          {req.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 mb-1.5">
                              {req.description}
                            </p>
                          )}

                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={req.status} className="scale-90 origin-left" />
                            {req.priority && (
                              <PriorityBadge
                                priority={req.priority}
                                className="scale-90 origin-left"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Empty selection warning */}
            {formTouched && !hasSelectedRequirements && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 flex items-center gap-2 text-rose-700 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Please select at least one requirement to include in this release.</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            {selectedReqIds.length > 0 ? (
              <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Ready to package {selectedReqIds.length} requirement
                {selectedReqIds.length === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="text-slate-400">No requirements selected</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (formTouched && !hasSelectedRequirements)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" /> Planning...
                </>
              ) : (
                <>
                  <Rocket className="h-3.5 w-3.5" /> Plan Release
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
