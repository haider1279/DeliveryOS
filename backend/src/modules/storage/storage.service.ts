import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { FileVisibility, UserRole } from '@deliveryos/shared';
import { config } from '../../config';

export class StorageService {
  async createFileAsset(
    data: {
      organizationId: string;
      projectId?: string;
      relatedEntityType: string;
      relatedEntityId: string;
      storageKey: string;
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
      visibility?: FileVisibility;
    },
    uploadedById: string
  ) {
    const asset = await prisma.fileAsset.create({
      data: {
        organizationId: data.organizationId,
        projectId: data.projectId || null,
        relatedEntityType: data.relatedEntityType,
        relatedEntityId: data.relatedEntityId,
        storageKey: data.storageKey,
        originalFilename: data.originalFilename,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        visibility: data.visibility || FileVisibility.INTERNAL,
        uploadedById,
      },
      include: {
        uploadedBy: { include: { profile: true } },
      },
    });

    await auditService.log({
      actorId: uploadedById,
      action: 'FILE_UPLOADED',
      entityType: 'FileAsset',
      entityId: asset.id,
      metadata: { filename: asset.originalFilename, size: asset.sizeBytes },
    });

    return asset;
  }

  async getFileAsset(id: string, userRole: UserRole, userOrgId?: string | null) {
    const file = await prisma.fileAsset.findFirst({
      where: { id, deletedAt: null },
      include: { uploadedBy: { include: { profile: true } } },
    });
    if (!file) throw AppError.notFound('File not found');

    if (userRole === UserRole.CLIENT) {
      if (file.organizationId !== userOrgId) {
        throw AppError.notFound('File not found');
      }
      if (file.visibility !== FileVisibility.CLIENT_VISIBLE) {
        throw AppError.forbidden('File is marked as internal only');
      }
    }

    return file;
  }

  async listFiles(projectId: string, userRole: UserRole, userOrgId?: string | null) {
    const where: any = { projectId, deletedAt: null };

    if (userRole === UserRole.CLIENT) {
      where.organizationId = userOrgId;
      where.visibility = FileVisibility.CLIENT_VISIBLE;
    }

    return prisma.fileAsset.findMany({
      where,
      include: { uploadedBy: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  getDownloadUrl(storageKey: string): string {
    if (config.supabase.url) {
      return `${config.supabase.url}/storage/v1/object/public/${config.supabase.storageBucket}/${storageKey}`;
    }
    return `/api/storage/raw/${storageKey}`;
  }
}

export const storageService = new StorageService();
