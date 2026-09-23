import { Request, Response, NextFunction } from 'express';
import { invoiceService } from './invoice.service';
import { sendSuccess, sendCreated, buildPaginationMeta } from '../../utils/response';

export class InvoiceController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await invoiceService.createInvoice(req.body, req.user!);
      sendCreated(res, invoice, 'Invoice created successfully');
    } catch (err) {
      next(err);
    }
  }

  async issue(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const invoice = await invoiceService.issueInvoice(id, req.user!);
      sendSuccess(res, { data: invoice, message: 'Invoice issued successfully' });
    } catch (err) {
      next(err);
    }
  }

  async recordPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await invoiceService.recordPayment(req.body, req.user!);
      sendCreated(res, result, 'Payment recorded successfully');
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const invoice = await invoiceService.getInvoiceById(id, req.user!);
      sendSuccess(res, { data: invoice });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await invoiceService.listInvoices(req.query as any, req.user!);
      sendSuccess(res, {
        data: result.invoices,
        meta: buildPaginationMeta(result.page, result.pageSize, result.total),
      });
    } catch (err) {
      next(err);
    }
  }

  async getProfitability(req: Request, res: Response, next: NextFunction) {
    try {
      const projectId = String(req.params.projectId);
      const result = await invoiceService.computeProjectProfitability(projectId, req.user!);
      sendSuccess(res, { data: result });
    } catch (err) {
      next(err);
    }
  }
}

export const invoiceController = new InvoiceController();
