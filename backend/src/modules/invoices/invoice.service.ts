import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { notificationService, activityService } from '../../services/notification.service';
import {
  UserRole,
  InvoiceStatus,
  CommentVisibility,
  NotificationType,
  CreateInvoiceInput,
  RecordPaymentInput,
  PaginationQueryInput,
} from '@deliveryos/shared';

export class InvoiceService {
  /**
   * Creates a draft invoice with items and computes subtotal and total.
   */
  async createInvoice(input: CreateInvoiceInput, creatorId: string) {
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
      actorId: creatorId,
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
  async issueInvoice(id: string, actorId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: { project: true, organization: true },
    });
    if (!invoice) throw AppError.notFound('Invoice not found');

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw AppError.badRequest(`Cannot issue invoice in status: ${invoice.status}`);
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.ISSUED },
      include: { items: true, project: true, organization: true },
    });

    await auditService.log({
      actorId,
      action: 'INVOICE_ISSUED',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber },
    });

    await activityService.log({
      projectId: invoice.projectId,
      actorId,
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
        linkUrl: `/portal/invoices/${invoice.id}`,
      });
    }

    return updated;
  }

  /**
   * Records a payment against an invoice and recalculates invoice status.
   */
  async recordPayment(input: RecordPaymentInput, recordedById: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: input.invoiceId, deletedAt: null },
      include: { payments: true, project: true },
    });
    if (!invoice) throw AppError.notFound('Invoice not found');

    if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.VOID) {
      throw AppError.badRequest(`Cannot record payment on an invoice in ${invoice.status} status`);
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Payment record
      const payment = await tx.payment.create({
        data: {
          invoiceId: input.invoiceId,
          amount: input.amount,
          paymentDate: new Date(input.paymentDate),
          method: input.method || 'BANK_TRANSFER',
          reference: input.reference || null,
          recordedById,
          notes: input.notes || null,
        },
      });

      // 2. Sum all payments including new one
      const allPayments = await tx.payment.findMany({
        where: { invoiceId: input.invoiceId },
      });
      const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const invoiceTotal = Number(invoice.total);

      // 3. Compute new status
      let newStatus = invoice.status;
      if (totalPaid >= invoiceTotal) {
        newStatus = 'PAID';
      } else if (totalPaid > 0) {
        newStatus = 'PARTIALLY_PAID';
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: input.invoiceId },
        data: { status: newStatus },
        include: { payments: true, items: true },
      });

      return { payment, invoice: updatedInvoice, totalPaid, remaining: Math.max(0, invoiceTotal - totalPaid) };
    });

    await auditService.log({
      actorId: recordedById,
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
        actorId: recordedById,
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
   */
  async getInvoiceById(id: string, userRole: UserRole, userOrgId?: string | null) {
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
    if (userRole === UserRole.CLIENT && invoice.organizationId !== userOrgId) {
      throw AppError.notFound('Invoice not found');
    }

    // Role isolation: developers/QA cannot view invoices
    if (userRole === UserRole.DEVELOPER || userRole === UserRole.QA) {
      throw AppError.forbidden('You do not have permission to view billing invoices');
    }

    const totalPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const balanceDue = Number(Math.max(0, Number(invoice.total) - totalPaid).toFixed(2));

    return { ...invoice, totalPaid, balanceDue };
  }

  /**
   * Lists invoices with pagination and filters.
   */
  async listInvoices(query: PaginationQueryInput, userRole: UserRole, userOrgId?: string | null) {
    // Developers & QA cannot access billing
    if (userRole === UserRole.DEVELOPER || userRole === UserRole.QA) {
      throw AppError.forbidden('You do not have permission to view invoices');
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 25;
    const skip = (page - 1) * pageSize;

    const where: any = { deletedAt: null };

    // Tenant isolation: clients only see their own organization's invoices
    if (userRole === UserRole.CLIENT) {
      where.organizationId = userOrgId;
      // Clients do not see internal DRAFT invoices
      where.status = { not: InvoiceStatus.DRAFT };
    } else {
      if (query.organizationId) where.organizationId = query.organizationId;
      if (query.projectId) where.projectId = query.projectId;
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
   * Computes project profitability:
   * Revenue = Sum of all PAID invoice totals
   * Cost = Sum of all time entry hours * default internal cost rate ($45/hr)
   * Profit = Revenue - Cost
   */
  async computeProjectProfitability(projectId: string, hourlyCostRate: number = 45) {
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
