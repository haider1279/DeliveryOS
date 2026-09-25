import React, { useState, useEffect } from 'react';
import { Receipt, Plus, DollarSign, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../api/client';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../context/ToastContext';

export const InvoiceList: React.FC = () => {
  const toast = useToast();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  // New Invoice Form State
  const [orgId, setOrgId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [invNumber, setInvNumber] = useState(`INV-${Date.now().toString().slice(-6)}`);
  const [dueDate, setDueDate] = useState('');
  const [desc, setDesc] = useState('Software Engineering & Milestone Delivery');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('5000');

  // Record Payment Form State
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');

  const fetchInvoices = async () => {
    try {
      const res: any = await api.get('/invoices');
      setInvoices(res?.invoices || res || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleOpenCreate = async () => {
    setIsCreateOpen(true);
    try {
      const [pRes, oRes]: [any, any] = await Promise.all([
        api.get('/projects'),
        api.get('/organizations').then((r: any) => r.orgs || r || []),
      ]);
      setProjects(pRes || []);
      setOrgs(oRes || []);
      if (pRes?.length > 0) {
        setProjectId(pRes[0].id);
        setOrgId(pRes[0].organizationId);
      }
    } catch {
      // ignore
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/invoices', {
        organizationId: orgId,
        projectId,
        invoiceNumber: invNumber,
        issuedDate: new Date().toISOString(),
        dueDate: dueDate ? new Date(dueDate).toISOString() : new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
        items: [
          {
            description: desc,
            quantity: parseFloat(quantity) || 1,
            unitPrice: parseFloat(unitPrice) || 0,
          },
        ],
      });
      setIsCreateOpen(false);
      toast.success('Invoice draft created.');
      fetchInvoices();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create invoice');
    }
  };

  const handleIssue = async (invoiceId: string) => {
    try {
      await api.post(`/invoices/${invoiceId}/issue`);
      toast.success('Invoice issued and client notified.');
      fetchInvoices();
    } catch (err: any) {
      toast.error(err.message || 'Failed to issue invoice');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    try {
      const parsedAmount = parseFloat(payAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        toast.error('Please enter a valid payment amount greater than zero');
        return;
      }
      await api.post(`/invoices/${selectedInvoice.id}/payments`, {
        invoiceId: selectedInvoice.id,
        amount: parsedAmount,
        paymentDate: new Date().toISOString(),
        reference: payRef,
      });
      setIsPayOpen(false);
      setPayAmount('');
      setPayRef('');
      toast.success('Payment recorded.');
      fetchInvoices();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
    }
  };

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Invoices & Billing</h2>
          <p className="text-xs text-slate-500 mt-1">
            Issue client invoices, track incoming payments, and compute revenue.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 shadow-sm transition-all"
        >
          <Plus className="h-4 w-4" /> Create Invoice
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No invoices issued"
            description="Create an invoice for completed milestones or retainer hours."
            action={{ label: 'Create Invoice', onClick: handleOpenCreate }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3.5">Invoice #</th>
                  <th className="px-6 py-3.5">Project / Client</th>
                  <th className="px-6 py-3.5">Total Amount</th>
                  <th className="px-6 py-3.5">Balance Due</th>
                  <th className="px-6 py-3.5">Due Date</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-900 font-semibold">{inv.project?.name}</div>
                      <div className="text-[11px] text-slate-400">{inv.organization?.name}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">
                      ${Number(inv.total).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-700">
                      ${Number(inv.balanceDue ?? inv.total).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {new Date(inv.dueDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {inv.status === 'DRAFT' && (
                        <button
                          onClick={() => handleIssue(inv.id)}
                          className="px-2.5 py-1 rounded bg-brand-50 text-brand-700 font-semibold hover:bg-brand-100"
                        >
                          Issue
                        </button>
                      )}
                      {inv.status !== 'PAID' && inv.status !== 'VOID' && inv.status !== 'DRAFT' && (
                        <button
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setPayAmount(
                              Number(inv.balanceDue ?? inv.total).toFixed(2)
                            );
                            setIsPayOpen(true);
                          }}
                          className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100"
                        >
                          Record Payment
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create New Invoice">
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Invoice Number</label>
            <input
              type="text"
              required
              value={invNumber}
              onChange={(e) => setInvNumber(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs font-mono focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Project</label>
            <select
              value={projectId}
              onChange={(e) => {
                const pid = e.target.value;
                setProjectId(pid);
                const proj = projects.find((p) => p.id === pid);
                if (proj) setOrgId(proj.organizationId);
              }}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.organization?.name})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Quantity (Units/Hours)</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Unit Price ($)</label>
              <input
                type="number"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-brand-600 text-white"
            >
              Create Draft Invoice
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        isOpen={isPayOpen}
        onClose={() => setIsPayOpen(false)}
        title={`Record Payment for ${selectedInvoice?.invoiceNumber || ''}`}
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700">Amount ($)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="e.g. 500.00"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700">Reference / Check #</label>
            <input
              type="text"
              placeholder="e.g. Wire TX-99201"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={() => setIsPayOpen(false)}
              className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 rounded text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Confirm Payment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
