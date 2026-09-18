import { Request, Response, NextFunction } from 'express';
import { storageService } from './storage.service';
import { sendSuccess, sendCreated } from '../../utils/response';

export class StorageController {
  async registerUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const asset = await storageService.createFileAsset(req.body, req.user!.id);
      sendCreated(res, asset, 'File asset registered successfully');
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const file = await storageService.getFileAsset(
        id,
        req.user!.role,
        req.user!.organizationId
      );
      const downloadUrl = storageService.getDownloadUrl(file.storageKey);
      sendSuccess(res, { data: { ...file, downloadUrl } });
    } catch (err) {
      next(err);
    }
  }

  async listProjectFiles(req: Request, res: Response, next: NextFunction) {
    try {
      const projectId = String(req.params.projectId);
      const files = await storageService.listFiles(
        projectId,
        req.user!.role,
        req.user!.organizationId
      );
      sendSuccess(res, { data: files });
    } catch (err) {
      next(err);
    }
  }
}

export const storageController = new StorageController();
