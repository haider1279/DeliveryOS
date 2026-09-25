import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { notificationService, activityService } from '../../services/notification.service';
import { requireProjectAccess, getAccessibleProjectIds, assertProjectWritable } from '../../services/project-access.service';
import { syncProjectStatus } from '../projects/project.service';
import {
  UserRole,
  InvoiceStatus,
  ProjectStatus,
  CommentVisibility,
  NotificationType,
  AuthenticatedUser,
  CreateInvoiceInput,
  RecordPaymentInput,
  PaginationQueryInput,
} from '@deliveryos/shared';

const BILLING_ROLES = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER];

export class InvoiceService {
  /**
   * Creates a draft invoice with items and computes subtotal and total.
   */
  async createInvoice(input: CreateInvoiceInput, actor: AuthenticatedUser) {
    if (!BILLING_ROLES.includes(actor.role)) {
      throw AppError.forbidden('You do not have permission to create invoices');
    }

    await assertProjectWritable(actor, input.projectId);

    const project = await prisma.project.findFirst({
      where: { id: input.projectId, organizationId: input.organizationId, deletedAt: null },
    });
    if (!project) {
      throw AppError.notFound('Project or organization match not found');
    }

    // Check invoice number uniqueness
    const existing = await prisma.invoice.findUnique({
      where: { invoiceNumber: input.invoiceNumber },
    });
    if (existing) {
      throw AppError.conflict(`Invoice number "${input.invoiceNumber}" is already in use`);
    }

    // Calculate subtotal from line items
    let subtotal = 0;
    const itemsData = input.items.map((item) => {
      const amount = Number((item.quantity * item.unitPrice).toFixed(2));
      subtotal += amount;
      return {
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount,
      };
    });

    const discount = input.discount || 0;
    const tax = input.tax || 0;
    const total = Number(Math.max(0, subtotal - discount + tax).toFixed(2));

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        invoiceNumber: input.invoiceNumber,
        status: InvoiceStatus.DRAFT,
        subtotal,
        discount,
        tax,
        total,
        currency: input.currency || 'USD',
        issuedDate: new Date(input.issuedDate),
        dueDate: new Date(input.dueDate),
        notes: input.notes || null,
        items: {
          create: itemsData,
        },
      },
      include: {
        items: true,
        project: { select: { id: true, name: true, code: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'INVOICE_CREATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber, total: invoice.total },
    });

    return invoice;
  }

  /**
   * Issues an invoice, moving status from DRAFT to ISSUED and notifying the client.
   */
  async issueInvoice(id: string, actor: AuthenticatedUser) {
    if (!BILLING_ROLES.includes(actor.role)) {
      throw AppError.forbidden('You do not have permission to issue invoices');
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: { project: true, organization: true },
    });
    if (!invoice) throw AppError.notFound('Invoice not found');

    await requireProjectAccess(actor, invoice.projectId);

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw AppError.badRequest(`Cannot issue invoice in status: ${invoice.status}`);
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.ISSUED },
      include: { items: true, project: true, organization: true },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'INVOICE_ISSUED',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber },
    });

    await activityService.log({
      projectId: invoice.projectId,
      actorId: actor.id,
      type: 'INVOICE_ISSUED',
      message: `Invoice ${invoice.invoiceNumber} ($${invoice.total}) issued to ${invoice.organization.name}`,
      visibility: CommentVisibility.CLIENT_VISIBLE,
      entityType: 'Invoice',
      entityId: invoice.id,
    });

    // Notify client users
    const clientUsers = await prisma.user.findMany({
      where: {
        organizationId: invoice.organizationId,
        role: UserRole.CLIENT,
        status: 'ACTIVE',
      },
    });

    for (const client of clientUsers) {
      await notificationService.notify({
        userId: client.id,
        type: NotificationType.INVOICE_ISSUED,
        title: 'New Invoice Issued',
        message: `Invoice ${invoice.invoiceNumber} for $${invoice.total} has been issued. Due on ${invoice.dueDate.toISOString().split('T')[0]}.`,
        entityType: 'Invoice',
        entityId: invoice.id,
        linkUrl: `/portal/invoices`,
      });
    }

    return updated;
  }

  /**
   * Records a payment against an invoice and recalculates invoice status.
   * Rejects payments that would overpay the outstanding balance.
   */
  async recordPayment(input: RecordPaymentInput, actor: AuthenticatedUser) {
    if (!BILLING_ROLES.includes(actor.role)) {
      throw AppError.forbidden('You do not have permission to record payments');
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: input.invoiceId, deletedAt: null },
      include: { payments: true, project: true },
    });
    if (!invoice) throw AppError.notFound('Invoice not found');

    await requireProjectAccess(actor, invoice.projectId);

    if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.VOID) {
      throw AppError.badRequest(`Cannot record payment on an invoice in ${invoice.status} status`);
    }

    const totalPaidSoFar = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const invoiceTotal = Number(invoice.total);
    const outstanding = Number((invoiceTotal - totalPaidSoFar).toFixed(2));

    if (input.amount > outstanding + 0.005) {
      throw AppError.badRequest(
        `Payment exceeds the outstanding balance of ${outstanding.toFixed(2)} (${invoice.currency})`
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Serialize concurrent payments: lock the invoice row for update so two
      // simultaneous payments cannot both pass the outstanding-balance check.
      await tx.$executeRaw`SELECT id FROM "Invoice" WHERE id = ${input.invoiceId} FOR UPDATE`;

      const lockedInvoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, deletedAt: null },
        include: { payments: true },
      });
      if (!lockedInvoice) throw AppError.notFound('Invoice not found');
      if (lockedInvoice.status === InvoiceStatus.DRAFT || lockedInvoice.status === InvoiceStatus.VOID) {
        throw AppError.badRequest(`Cannot record payment on an invoice in ${lockedInvoice.status} status`);
      }

      const lockedTotal = Number(lockedInvoice.total);
      const paidSoFar = lockedInvoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const lockedOutstanding = Number((lockedTotal - paidSoFar).toFixed(2));

      if (input.amount > lockedOutstanding + 0.005) {
        throw AppError.badRequest(
          `Payment exceeds the outstanding balance of ${lockedOutstanding.toFixed(2)} (${lockedInvoice.currency})`
        );
      }

      // 1. Create Payment record
      const payment = await tx.payment.create({
        data: {
          invoiceId: input.invoiceId,
          amount: input.amount,
          paymentDate: new Date(input.paymentDate),
          method: input.method || 'BANK_TRANSFER',
          reference: input.reference || null,
          recordedById: actor.id,
          notes: input.notes || null,
        },
      });

      // 2. Compute new status
      const totalPaid = paidSoFar + input.amount;
      let newStatus = lockedInvoice.status;
      if (totalPaid >= lockedTotal) {
        newStatus = InvoiceStatus.PAID;
      } else if (totalPaid > 0) {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: input.invoiceId },
        data: { status: newStatus },
        include: { payments: true, items: true },
      });

      await syncProjectStatus(invoice.projectId, tx);

      return { payment, invoice: updatedInvoice, totalPaid, remaining: Math.max(0, lockedTotal - totalPaid) };
    });

    await auditService.log({
      actorId: actor.id,
      action: 'PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: result.payment.id,
      metadata: {
        invoiceId: invoice.id,
        amount: input.amount,
        newInvoiceStatus: result.invoice.status,
      },
    });

    if (result.invoice.status === InvoiceStatus.PAID) {
      await activityService.log({
        projectId: invoice.projectId,
        actorId: actor.id,
        type: 'INVOICE_PAID',
        message: `Invoice ${invoice.invoiceNumber} paid in full ($${invoice.total})`,
        visibility: CommentVisibility.CLIENT_VISIBLE,
        entityType: 'Invoice',
        entityId: invoice.id,
      });

      // Notify PM
      await notificationService.notify({
        userId: invoice.project.projectManagerId,
        type: NotificationType.INVOICE_PAID,
        title: 'Invoice Paid in Full',
        message: `Invoice ${invoice.invoiceNumber} was paid in full ($${invoice.total}).`,
        entityType: 'Invoice',
        entityId: invoice.id,
        linkUrl: `/app/projects/${invoice.projectId}?tab=finance`,
      });
    }

    return result;
  }

  /**
   * Retrieves an invoice by ID with strict tenant isolation.
   * PMs may only access invoices for projects they are assigned to.
   */
  async getInvoiceById(id: string, actor: AuthenticatedUser) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: true,
        payments: {
          include: { recordedBy: { include: { profile: true } } },
          orderBy: { paymentDate: 'desc' },
        },
        project: { select: { id: true, name: true, code: true } },
        organization: true,
      },
    });

    if (!invoice) throw AppError.notFound('Invoice not found');

    // Tenant isolation: client can only see their org's invoices
    if (actor.role === UserRole.CLIENT && invoice.organizationId !== actor.organizationId) {
      throw AppError.notFound('Invoice not found');
    }

    // Role isolation: developers/QA/BD cannot view invoices
    if (actor.role === UserRole.DEVELOPER || actor.role === UserRole.QA || actor.role === UserRole.BD) {
      throw AppError.forbidden('You do not have permission to view billing invoices');
    }

    // PMs (and any internal staff) must have project-level access.
    await requireProjectAccess(actor, invoice.projectId);

    const totalPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const balanceDue = Number(Math.max(0, Number(invoice.total) - totalPaid).toFixed(2));

    return { ...invoice, totalPaid, balanceDue };
  }

  /**
   * Lists invoices with pagination and filters, scoped to accessible projects.
   */
  async listInvoices(query: PaginationQueryInput, actor: AuthenticatedUser) {
    // Developers, QA & BD cannot access billing
    if (actor.role === UserRole.DEVELOPER || actor.role === UserRole.QA || actor.role === UserRole.BD) {
      throw AppError.forbidden('You do not have permission to view invoices');
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 25;
    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };

    // Tenant isolation: clients only see their own organization's invoices (no drafts)
    if (actor.role === UserRole.CLIENT) {
      where.organizationId = actor.organizationId;
      where.status = { not: InvoiceStatus.DRAFT };
    } else {
      // Internal staff (PM) must scope to their accessible project set.
      const accessible = await getAccessibleProjectIds(actor);
      if (query.organizationId) where.organizationId = query.organizationId;
      if (query.projectId) {
        if (accessible === null || accessible.includes(query.projectId)) {
          where.projectId = query.projectId;
        } else {
          where.projectId = '__no_access__';
        }
      } else if (accessible !== null) {
        where.projectId = { in: accessible };
      }
    }

    if (query.status) where.status = query.status;

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          project: { select: { id: true, name: true, code: true } },
          organization: { select: { id: true, name: true } },
          payments: { select: { amount: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.invoice.count({ where }),
    ]);

    const formattedInvoices = invoices.map((inv) => {
      const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      return {
        ...inv,
        totalPaid: paid,
        balanceDue: Number(Math.max(0, Number(inv.total) - paid).toFixed(2)),
      };
    });

    return { invoices: formattedInvoices, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * Computes project profitability (PM: assigned projects only; internal data).
   * Revenue = Sum of all PAID invoice totals
   * Cost = Sum of all time entry hours * default internal cost rate ($45/hr)
   * Profit = Revenue - Cost
   */
  async computeProjectProfitability(projectId: string, actor: AuthenticatedUser, hourlyCostRate: number = 45) {
    await requireProjectAccess(actor, projectId);

    const [paidInvoices, timeEntries, project] = await Promise.all([
      prisma.invoice.findMany({
        where: { projectId, status: InvoiceStatus.PAID, deletedAt: null },
      }),
      prisma.timeEntry.findMany({
        where: { projectId },
      }),
      prisma.project.findUnique({
        where: { id: projectId },
      }),
    ]);

    if (!project) throw AppError.notFound('Project not found');

    const totalRevenue = paidInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const totalMinutesLogged = timeEntries.reduce((sum, te) => sum + te.durationMinutes, 0);
    const totalHoursLogged = Number((totalMinutesLogged / 60).toFixed(2));
    const totalInternalCost = Number((totalHoursLogged * hourlyCostRate).toFixed(2));
    const netProfit = Number((totalRevenue - totalInternalCost).toFixed(2));
    const profitMargin = totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(1)) : 0;

    return {
      projectId,
      projectName: project.name,
      totalRevenue,
      totalHoursLogged,
      hourlyCostRate,
      totalInternalCost,
      netProfit,
      profitMargin,
      currency: project.currency,
    };
  }
}

export const invoiceService = new InvoiceService();
