import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, Shield, UserX, UserCheck, Link2, Copy, Check, Building2 } from 'lucide-react';
import { api } from '../../api/client';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { UserRole, OrganizationQualificationStatus } from '@deliveryos/shared';

type PeopleSection = 'team' | 'clients';

const INTERNAL_ROLE_OPTIONS = [
  UserRole.DEVELOPER,
  UserRole.QA,
  UserRole.PROJECT_MANAGER,
  UserRole.BD,
  UserRole.ADMIN,
];

export const TeamManagement: React.FC<{ section?: PeopleSection }> = ({ section = 'team' }) => {
  const isClientsSection = section === 'clients';
  const { user: actor } = useAuth();
  const canManageRoles =
    actor?.role === UserRole.SUPER_ADMIN || actor?.role === UserRole.ADMIN;
  const [users, setUsers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // Invite form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<string>(isClientsSection ? UserRole.CLIENT : UserRole.DEVELOPER);
  const [organizationId, setOrganizationId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [inviteResult, setInviteResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const fetchUsers = async () => {
    try {
      const [usersRes, orgsRes]: [any, any] = await Promise.all([
        api.get('/users'),
        isClientsSection ? api.get('/organizations', { pageSize: 100 }) : Promise.resolve(null),
      ]);
      const allUsers: any[] = usersRes?.users || usersRes || [];
      setUsers(
        isClientsSection
          ? allUsers.filter((u: any) => u.role === UserRole.CLIENT)
          : allUsers.filter((u: any) => u.role !== UserRole.CLIENT)
      );
      const allOrgs: any[] = orgsRes?.orgs || orgsRes || [];
      const approvedOrgs = allOrgs.filter(
        (o: any) => o.qualificationStatus === OrganizationQualificationStatus.APPROVED || !o.qualificationStatus
      );
      setOrgs(approvedOrgs);
      if (approvedOrgs.length > 0 && !organizationId) {
        setOrganizationId(approvedOrgs[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [isClientsSection]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === UserRole.CLIENT && !organizationId) {
      toast.error('Please select an organization for the client account');
      return;
    }
    try {
      const result = await api.post('/users/invite', {
        email,
        firstName,
        lastName,
        role,
        organizationId: role === UserRole.CLIENT ? organizationId : undefined,
        jobTitle: jobTitle || undefined,
      });
      setIsInviteOpen(false);
      setEmail('');
      setFirstName('');
      setLastName('');
      setRole(isClientsSection ? UserRole.CLIENT : UserRole.DEVELOPER);
      setJobTitle('');
      setInviteResult(result);
      toast.success('Invitation created — share the one-time link.');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to invite user');
    }
  };

  const handleCopyLink = async () => {
    if (!inviteResult?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteResult.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select and copy the link manually.');
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
    try {
      await api.patch(`/users/${userId}/status`, { status: nextStatus });
      toast.success(nextStatus === 'ACTIVE' ? 'User activated.' : 'User deactivated.');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to change status');
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/users/${userId}/role`, { role: newRole });
      toast.success('System role updated.');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role');
      fetchUsers();
    }
  };

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {isClientsSection ? 'Clients' : 'Team'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {isClientsSection
              ? 'Manage client accounts and their approved organizations.'
              : 'Manage internal DeliveryOS team members, system roles, and account status.'}
          </p>
        </div>
        <button
          onClick={() => {
            if (isClientsSection && orgs.length > 0 && !organizationId) setOrganizationId(orgs[0].id);
            setIsInviteOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" /> {isClientsSection ? 'Invite Client' : 'Invite Team Member'}
        </button>
      </div>

      {isClientsSection && orgs.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <Building2 className="h-4 w-4 text-brand-600" />
              Client organizations
            </div>
            <Link to="/app/leads" className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Manage pipeline
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {orgs.map((o: any) => (
              <span key={o.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-600">
                {o.name}
                {o._count?.users !== undefined && (
                  <span className="ml-1 text-slate-400">{o._count.users} user{o._count.users === 1 ? '' : 's'}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3.5">User</th>
                <th className="px-6 py-3.5">System Role</th>
                <th className="px-6 py-3.5">Organization</th>
                <th className="px-6 py-3.5">Account Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80">
                  <td className="px-6 py-3.5">
                    <span className="font-bold text-slate-900">
                      {u.profile?.displayName || `${u.profile?.firstName || ''} ${u.profile?.lastName || ''}`.trim() || u.email}
                    </span>
                    <span className="block text-[11px] text-slate-400">{u.email}</span>
                  </td>
                  <td className="px-6 py-3.5">
                    {canManageRoles &&
                    actor?.id !== u.id &&
                    !(u.role === UserRole.SUPER_ADMIN && actor?.role === UserRole.ADMIN) ? (
                      <select
                        value={u.role}
                        onChange={(e) => handleChangeRole(u.id, e.target.value)}
                        aria-label={`Change role for ${u.email}`}
                        className="px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-bold uppercase text-slate-700 bg-white focus:outline-none focus:border-brand-500"
                      >
                        {[
                          ...(isClientsSection ? [UserRole.CLIENT] : INTERNAL_ROLE_OPTIONS),
                        ].map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-slate-600">{u.organization?.name || 'Agency Core'}</td>
                  <td className="px-6 py-3.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        u.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700'
                          : u.status === 'INVITED'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      onClick={() => handleToggleStatus(u.id, u.status)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                        u.status === 'ACTIVE'
                          ? 'text-rose-600 hover:bg-rose-50'
                          : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title={isClientsSection ? 'Invite Client' : 'Invite Team Member'}
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">First Name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Last Name</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
          </div>
          {isClientsSection ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700">Account Type</label>
              <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                CLIENT
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700">System Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
              >
                {INTERNAL_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Organization selector for CLIENT role */}
          {role === UserRole.CLIENT && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Client Organization <span className="text-rose-500">*</span>
              </label>
              {orgs.length === 0 ? (
                <p className="mt-1 text-xs text-amber-600">
                  No approved client organizations found. Please approve a prospect or create an organization first.
                </p>
              ) : (
                <select
                  required
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:border-brand-500"
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.slug})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">Job Title (Optional)</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Lead Engineer / Product Owner"
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsInviteOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 cursor-pointer"
            >
              Send Invitation
            </button>
          </div>
        </form>
      </Modal>

      {/* Invite Link Modal (one-time token) */}
      <Modal
        isOpen={!!inviteResult}
        onClose={() => setInviteResult(null)}
        title="Invitation Ready"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            <strong className="text-slate-800">
              {inviteResult?.user?.profile?.firstName || inviteResult?.user?.email}
            </strong>{' '}
            has been invited. Share this <strong>one-time link</strong> — it expires on{' '}
            {inviteResult?.inviteTokenExpiresAt
              ? new Date(inviteResult.inviteTokenExpiresAt).toLocaleDateString()
              : 'in 7 days'}{' '}
            and can only be used once.
          </p>
          <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <Link2 className="h-4 w-4 text-brand-600 flex-shrink-0" />
            <span className="flex-1 text-[11px] text-slate-600 break-all font-mono">{inviteResult?.inviteUrl}</span>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setInviteResult(null)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy Invite Link'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
