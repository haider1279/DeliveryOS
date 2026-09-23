import { Request, Response, NextFunction } from 'express';
import { storageService } from './storage.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import type { FileVisibility } from '@deliveryos/shared';

export class StorageController {
  async registerUpload(req: Request, res: Response, next: NextFunction) {
    try {
      const asset = await storageService.createFileAsset(req.body, req.user!);
      sendCreated(res, asset, 'File asset registered successfully');
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const file = await storageService.getFileAsset(id, req.user!);
      const downloadUrl = storageService.getDownloadUrl(file.storageKey, file.visibility as FileVisibility);
      sendSuccess(res, { data: { ...file, downloadUrl } });
    } catch (err) {
      next(err);
    }
  }

  async listProjectFiles(req: Request, res: Response, next: NextFunction) {
    try {
      const projectId = String(req.params.projectId);
      const files = await storageService.listFiles(projectId, req.user!);
      const withUrls = files.map((f) => ({
        ...f,
        downloadUrl: storageService.getDownloadUrl(f.storageKey, f.visibility as FileVisibility),
      }));
      sendSuccess(res, { data: withUrls });
    } catch (err) {
      next(err);
    }
  }

  async proxyDownload(req: Request, res: Response, next: NextFunction) {
    try {
      const storageKey = decodeURIComponent(String(req.params.storageKey));
      const file = await storageService.requireRawAccessByKey(storageKey, req.user!);
      const url = storageService.getSignedDownloadUrl(file.storageKey);
      if (!url) {
        // Supabase is not configured in this environment; the file bytes
        // cannot be served. Do not fabricate a public URL.
        res.status(501).json({
          success: false,
          error: { code: 'NOT_IMPLEMENTED', message: 'Object storage is not configured in this environment' },
        });
        return;
      }
      res.redirect(302, url);
    } catch (err) {
      next(err);
    }
  }
}

export const storageController = new StorageController();