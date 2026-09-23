import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Building2,
  Mail,
  Phone,
  MapPin,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { UserRole, OrganizationQualificationStatus } from '@deliveryos/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Org {
  id: string;
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone?: string;
  city?: string;
  country?: string;
  notes?: string;
  qualificationStatus: OrganizationQualificationStatus;
  qualificationNotes?: string;
  qualifiedAt?: string;
  createdAt: string;
  _count?: { projects: number; users: number };
}

// ---------------------------------------------------------------------------
// Pill component
// ---------------------------------------------------------------------------
const StatusPill: React.FC<{ status: OrganizationQualificationStatus }> = ({ status }) => {
  const map: Record<OrganizationQualificationStatus, { label: string; cls: string; Icon: React.ElementType }> = {
    PROSPECT: { label: 'Prospect', cls: 'bg-amber-100 text-amber-700 border-amber-200', Icon: Clock },
    APPROVED: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
    REJECTED: { label: 'Rejected', cls: 'bg-rose-100 text-rose-700 border-rose-200', Icon: XCircle },
  };
  const { label, cls, Icon } = map[status] ?? map.PROSPECT;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Org Card
// ---------------------------------------------------------------------------
const OrgCard: React.FC<{
  org: Org;
  canQualify: boolean;
  onQualify: (org: Org, decision: 'APPROVED' | 'REJECTED') => void;
}> = ({ org, canQualify, onQualify }) => (
  <div className="group bg-white border border-slate-200 rounded-2xl p-5 hover:border-brand-300 hover:shadow-md transition-all">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-900 truncate">{org.name}</h3>
        </div>
        <StatusPill status={org.qualificationStatus} />
      </div>
    </div>

    <div className="mt-3 space-y-1 text-xs text-slate-500">
      <div className="flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{org.contactEmail}</span>
      </div>
      {org.contactPhone && (
        <div className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{org.contactPhone}</span>
        </div>
      )}
      {(org.city || org.country) && (
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{[org.city, org.country].filter(Boolean).join(', ')}</span>
        </div>
      )}
    </div>

    {org.notes && (
      <p className="mt-3 text-xs text-slate-400 line-clamp-2 border-t border-slate-100 pt-2">
        {org.notes}
      </p>
    )}

    {org.qualificationNotes && org.qualificationStatus !== 'PROSPECT' && (
      <p className="mt-2 text-xs text-slate-400 italic line-clamp-2">
        Note: {org.qualificationNotes}
      </p>
    )}

    {/* Action buttons — only on PROSPECT cards for eligible roles */}
    {canQualify && org.qualificationStatus === OrganizationQualificationStatus.PROSPECT && (
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
        <button
          onClick={() => onQualify(org, 'APPROVED')}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Approve
        </button>
        <button
          onClick={() => onQualify(org, 'REJECTED')}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
        >
          <XCircle className="h-3.5 w-3.5" /> Reject
        </button>
      </div>
    )}

    {/* Stats footer for approved clients */}
    {org.qualificationStatus === OrganizationQualificationStatus.APPROVED && org._count && (
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
        <span>{org._count.projects} project{org._count.projects !== 1 ? 's' : ''}</span>
        <span>{org._count.users} user{org._count.users !== 1 ? 's' : ''}</span>
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export const BDLeads: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const canCreate = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BD].includes(user?.role as UserRole);
  const canQualify = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BD].includes(user?.role as UserRole);

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Create prospect form
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    contactEmail: '',
    contactPhone: '',
    city: '',
    country: '',
    notes: '',
  });

  // Qualify modal
  const [qualifyTarget, setQualifyTarget] = useState<{ org: Org; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [qualifyNotes, setQualifyNotes] = useState('');
  const [qualifying, setQualifying] = useState(false);

  const fetchOrgs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<any>('/organizations', { pageSize: 100, search: search || undefined });
      const orgList = Array.isArray(res) ? res : res?.orgs || res?.data || [];
      setOrgs(orgList);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(fetchOrgs, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetchOrgs]);

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setForm((f) => ({ ...f, name, slug }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/organizations', {
        ...form,
        // BD creates PROSPECT; ADMIN/SUPER_ADMIN with no explicit status also PROSPECT in this form
        qualificationStatus: OrganizationQualificationStatus.PROSPECT,
      });
      toast.success(`Prospect "${form.name}" added to the pipeline.`);
      setCreateOpen(false);
      setForm({ name: '', slug: '', contactEmail: '', contactPhone: '', city: '', country: '', notes: '' });
      fetchOrgs();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create prospect');
    } finally {
      setCreating(false);
    }
  };

  const handleQualify = (org: Org, decision: 'APPROVED' | 'REJECTED') => {
    setQualifyTarget({ org, decision });
    setQualifyNotes('');
  };

  const submitQualify = async () => {
    if (!qualifyTarget) return;
    setQualifying(true);
    try {
      await api.patch(`/organizations/${qualifyTarget.org.id}/qualify`, {
        decision: qualifyTarget.decision,
        notes: qualifyNotes || undefined,
      });
      toast.success(
        qualifyTarget.decision === 'APPROVED'
          ? `${qualifyTarget.org.name} approved — ready for onboarding.`
          : `${qualifyTarget.org.name} marked as rejected.`
      );
      setQualifyTarget(null);
      fetchOrgs();
    } catch (err: any) {
      toast.error(err.message || 'Qualification update failed');
    } finally {
      setQualifying(false);
    }
  };

  // Partition orgs
  const prospects = orgs.filter((o) => o.qualificationStatus === OrganizationQualificationStatus.PROSPECT);
  const approved = orgs.filter((o) => o.qualificationStatus === OrganizationQualificationStatus.APPROVED);
  const rejected = orgs.filter((o) => o.qualificationStatus === OrganizationQualificationStatus.REJECTED);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Clients &amp; Leads</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage the client acquisition pipeline — from prospect to onboarded client.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search organizations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 w-52"
            />
          </div>
          {canCreate && (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all"
            >
              <Plus className="h-4 w-4" /> Add Prospect
            </button>
          )}
        </div>
      </div>

      {/* Pipeline stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Prospects', count: prospects.length, cls: 'bg-amber-50 border-amber-200 text-amber-700', Icon: Clock },
          { label: 'Approved', count: approved.length, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', Icon: CheckCircle2 },
          { label: 'Rejected', count: rejected.length, cls: 'bg-rose-50 border-rose-200 text-rose-700', Icon: XCircle },
        ].map(({ label, count, cls, Icon }) => (
          <div key={label} className={`flex items-center gap-3 p-4 rounded-2xl border ${cls}`}>
            <Icon className="h-5 w-5 opacity-70" />
            <div>
              <p className="text-2xl font-bold leading-none">{count}</p>
              <p className="text-[11px] font-medium mt-0.5 opacity-80">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner size="lg" className="h-48" />
      ) : (
        <>
          {/* PROSPECTS Section */}
          <Section
            title="Prospects"
            subtitle="Leads awaiting a qualification decision"
            count={prospects.length}
            emptyMessage="No prospects in the pipeline. Add one with the button above."
            emptyIcon={Clock}
          >
            {prospects.map((org) => (
              <OrgCard key={org.id} org={org} canQualify={canQualify} onQualify={handleQualify} />
            ))}
          </Section>

          {/* APPROVED Section */}
          <Section
            title="Approved Clients"
            subtitle="Qualified and handed off to admin for onboarding"
            count={approved.length}
            emptyMessage="No approved clients yet."
            emptyIcon={CheckCircle2}
          >
            {approved.map((org) => (
              <OrgCard key={org.id} org={org} canQualify={canQualify} onQualify={handleQualify} />
            ))}
          </Section>

          {/* REJECTED Section */}
          {rejected.length > 0 && (
            <Section
              title="Rejected"
              subtitle="Leads declined in the qualification pipeline"
              count={rejected.length}
              emptyMessage=""
              emptyIcon={XCircle}
            >
              {rejected.map((org) => (
                <OrgCard key={org.id} org={org} canQualify={canQualify} onQualify={handleQualify} />
              ))}
            </Section>
          )}
        </>
      )}

      {/* Create Prospect Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add New Prospect">
        <form onSubmit={handleCreate} className="space-y-4">
          <Field label="Company Name *">
            <input
              required
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Acme Startup Inc."
              className={inputCls}
            />
          </Field>
          <Field label="Slug *">
            <input
              required
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="acme-startup-inc"
              pattern="^[a-z0-9-]+$"
              title="Lowercase letters, numbers and hyphens only"
              className={inputCls}
            />
          </Field>
          <Field label="Contact Email *">
            <input
              required
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              placeholder="contact@company.com"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                placeholder="+1-555-0000"
                className={inputCls}
              />
            </Field>
            <Field label="City">
              <input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="San Francisco"
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Country">
            <input
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              placeholder="USA"
              className={inputCls}
            />
          </Field>
          <Field label="Notes / BD Context">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="How did you find this lead? What are they looking for?"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </Field>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="flex-1 px-4 py-2 rounded-xl text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Add to Pipeline
            </button>
          </div>
        </form>
      </Modal>

      {/* Qualify Confirmation Modal */}
      <Modal
        isOpen={!!qualifyTarget}
        onClose={() => setQualifyTarget(null)}
        title={qualifyTarget?.decision === 'APPROVED' ? 'Approve Client' : 'Reject Lead'}
      >
        {qualifyTarget && (
          <div className="space-y-4">
            <div className={`flex items-start gap-3 p-3 rounded-xl ${
              qualifyTarget.decision === 'APPROVED'
                ? 'bg-emerald-50 border border-emerald-200'
                : 'bg-rose-50 border border-rose-200'
            }`}>
              <AlertCircle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                qualifyTarget.decision === 'APPROVED' ? 'text-emerald-600' : 'text-rose-600'
              }`} />
              <div className="text-xs">
                <p className="font-semibold text-slate-800">{qualifyTarget.org.name}</p>
                {qualifyTarget.decision === 'APPROVED' ? (
                  <p className="text-slate-600 mt-0.5">
                    Approving this prospect will hand them off to an administrator for full onboarding.
                  </p>
                ) : (
                  <p className="text-slate-600 mt-0.5">
                    This lead will be marked as rejected and removed from the active pipeline.
                  </p>
                )}
              </div>
            </div>

            <Field label="Decision Notes (optional)">
              <textarea
                value={qualifyNotes}
                onChange={(e) => setQualifyNotes(e.target.value)}
                placeholder="Reason for this decision…"
                rows={3}
                className={`${inputCls} resize-none`}
              />
            </Field>

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => setQualifyTarget(null)}
                className="flex-1 px-4 py-2 rounded-xl text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitQualify}
                disabled={qualifying}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-colors ${
                  qualifyTarget.decision === 'APPROVED'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {qualifying && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm {qualifyTarget.decision === 'APPROVED' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const inputCls =
  'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition-colors';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <label className="text-xs font-semibold text-slate-600">{label}</label>
    {children}
  </div>
);

const Section: React.FC<{
  title: string;
  subtitle: string;
  count: number;
  emptyMessage: string;
  emptyIcon: React.ElementType;
  children?: React.ReactNode;
}> = ({ title, subtitle, count, emptyMessage, emptyIcon: EmptyIcon, children }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-3">
      <div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      <span className="ml-auto text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
        {count}
      </span>
    </div>
    {count === 0 ? (
      <div className="flex flex-col items-center justify-center gap-2 py-10 rounded-2xl bg-white border border-dashed border-slate-200 text-slate-400">
        <EmptyIcon className="h-8 w-8 opacity-40" />
        <p className="text-xs">{emptyMessage}</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{children}</div>
    )}
  </div>
);
