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
  async createFileAsset(_input: RegisterFileInput, _actor: AuthenticatedUser) {
    throw AppError.forbidden('File uploads are disabled in DeliveryOS');
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