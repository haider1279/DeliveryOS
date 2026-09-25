import { prisma } from '../../config/prisma';
import { AppError } from '../../errors/AppError';
import { auditService } from '../../services/audit.service';
import { requireProjectAccess, assertProjectWritable } from '../../services/project-access.service';
import { FileVisibility, UserRole, AuthenticatedUser, RegisterFileInput } from '@deliveryos/shared';
import { config } from '../../config';

// Internal-only files must never resolve to a public object URL.
// When Supabase is configured, INTERNAL files go through the authenticated
// /api/storage/raw/:key proxy (signed redirect); otherwise the local proxy
// returns 501 NOT_IMPLEMENTED rather than leaking a public URL.
export class StorageService {
  async createFileAsset(input: RegisterFileInput, actor: AuthenticatedUser) {
    throw AppError.forbidden('File uploads are disabled in DeliveryOS');

    if (input.projectId) {
      await assertProjectWritable(actor, input.projectId);
    }

    // Resolve the project only when one is supplied — never fall back to
    // matching an arbitrary project.
    const project = input.projectId
      ? await prisma.project.findFirst({
          where: { id: input.projectId, deletedAt: null },
          select: { id: true, organizationId: true },
        })
      : null;

    if (input.projectId && !project) {
      throw AppError.notFound('Project not found');
    }

    // The referenced organization must match the project's organization.
    if (project && project.organizationId !== input.organizationId) {
      throw AppError.badRequest('Organization does not match the project');
    }

    // Org-scoped uploads (no project): the uploading staff member must belong
    // to the target organization (SUPER_ADMIN may act across tenants).
    if (!project && actor.role !== UserRole.SUPER_ADMIN) {
      if (actor.organizationId !== input.organizationId) {
        throw AppError.forbidden('You cannot upload files to an organization you do not belong to');
      }
    }

    // When a project-scoped entity is referenced, it must exist in this project.
    const relatedEntityId = input.relatedEntityId;

    if (!project) {
      // Org-scoped uploads cannot reference project-scoped entities.
      if (['REQUIREMENT', 'TASK', 'BUG', 'TEST_RUN'].includes(input.relatedEntityType)) {
        throw AppError.badRequest('Project-scoped entities require a project id');
      }
    } else {
      let valid = false;
      switch (input.relatedEntityType) {
        case 'REQUIREMENT':
          valid = (await prisma.requirement.count({
            where: { id: relatedEntityId, projectId: project.id, deletedAt: null },
          })) === 1;
          break;
        case 'TASK':
          valid = (await prisma.task.count({
            where: { id: relatedEntityId, projectId: project.id, deletedAt: null },
          })) === 1;
          break;
        case 'BUG':
          valid = (await prisma.bug.count({
            where: { id: relatedEntityId, projectId: project.id },
          })) === 1;
          break;
        case 'TEST_RUN':
          valid = (await prisma.testRun.count({
            where: { id: relatedEntityId, testCase: { projectId: project.id } },
          })) === 1;
          break;
        default:
          // PROJECT / DOCUMENT / GENERAL: the referenced entity is the project itself.
          valid = relatedEntityId === project.id;
          break;
      }
      if (!valid) {
        throw AppError.badRequest('Referenced entity does not exist in this project');
      }
    }

    const asset = await prisma.fileAsset.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: relatedEntityId,
        storageKey: input.storageKey,
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        visibility: input.visibility ?? FileVisibility.INTERNAL,
        uploadedById: actor.id,
      },
      include: {
        uploadedBy: { include: { profile: true } },
      },
    });

    await auditService.log({
      actorId: actor.id,
      action: 'FILE_UPLOADED',
      entityType: 'FileAsset',
      entityId: asset.id,
      metadata: { filename: asset.originalFilename, size: asset.sizeBytes },
    });

    return asset;
  }

  async getFileAsset(id: string, actor: AuthenticatedUser) {
    const file = await prisma.fileAsset.findFirst({
      where: { id, deletedAt: null },
      include: { uploadedBy: { include: { profile: true } } },
    });
    if (!file) throw AppError.notFound('File not found');

    await this.assertFileAccess(file, actor);

    return file;
  }

  async listFiles(projectId: string, actor: AuthenticatedUser) {
    await requireProjectAccess(actor, projectId);

    const where: any = { projectId, deletedAt: null };
    if (actor.role === UserRole.CLIENT) {
      where.organizationId = actor.organizationId;
      where.visibility = FileVisibility.CLIENT_VISIBLE;
    }

    return prisma.fileAsset.findMany({
      where,
      include: { uploadedBy: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Access rule for a single asset (used by get + the raw download proxy). */
  async assertFileAccess(
    file: { organizationId: string; projectId: string | null; visibility: string },
    actor: AuthenticatedUser
  ): Promise<void> {
    if (actor.role === UserRole.CLIENT) {
      if (file.organizationId !== actor.organizationId) {
        throw AppError.notFound('File not found');
      }
      if (file.visibility !== FileVisibility.CLIENT_VISIBLE) {
        throw AppError.forbidden('File is marked as internal only');
      }
      return;
    }

    // Internal staff: project-level access required (admins bypass).
    if (file.projectId) {
      await requireProjectAccess(actor, file.projectId);
      return;
    }

    // Org-scoped files (no project): staff must belong to the file's
    // organization; SUPER_ADMIN may act across tenants.
    if (actor.role !== UserRole.SUPER_ADMIN && file.organizationId !== actor.organizationId) {
      throw AppError.forbidden('You do not belong to the organization this file belongs to');
    }
  }

  /**
   * Resolves an asset by storage key for the authenticated raw-download proxy.
   */
  async requireRawAccessByKey(storageKey: string, actor: AuthenticatedUser) {
    const file = await prisma.fileAsset.findFirst({
      where: { storageKey, deletedAt: null },
    });
    if (!file) throw AppError.notFound('File not found');
    await this.assertFileAccess(file, actor);
    return file;
  }

  /**
   * Produces a signed download URL. Returns null when Supabase is not
   * available/configured so callers never emit an invalid or public URL.
   * (Requires the Supabase server SDK; left unverified when not configured.)
   */
  getSignedDownloadUrl(_storageKey: string): string | null {
    return null;
  }

  /**
   * Internal files never receive a public URL.
   * - CLIENT_VISIBLE + supabase configured -> public object URL.
   * - Otherwise -> authenticated raw proxy path (signed redirect when configured).
   */
  getDownloadUrl(storageKey: string, visibility: FileVisibility): string | null {
    if (config.supabase.url && visibility === FileVisibility.CLIENT_VISIBLE) {
      return `${config.supabase.url}/storage/v1/object/public/${config.supabase.storageBucket}/${storageKey}`;
    }
    if (config.supabase.url) {
      return `/api/storage/raw/${encodeURIComponent(storageKey)}`;
    }
    return null;
  }
}

export const storageService = new StorageService();