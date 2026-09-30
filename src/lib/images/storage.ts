// Image storage port and its Supabase Storage adapter.
//
// The adapter is always created for one fixed bucket (IMAGE_BUCKETS) with the request's
// user-scoped client (publishable key + the caller's session), so the storage.objects RLS
// policies (private.is_staff()) decide every upload, listing and delete. No privileged key
// is involved. Bucket names and object paths come from server code, never from a form.
//
// Only a status/code of a failure is kept; Storage messages never leave this file.
//
// Kept free of Next.js and "@/" imports so it runs under `npm test`.

import type { SupabaseClient } from "@supabase/supabase-js";

import { imageFolder, isImageObjectPath, type ImageBucket, type ValidImage } from "./validation.ts";

/** Storage error details kept for decisions and logs; never shown to the user. */
export type ImageStorageError = { status?: number; code?: string };

export type ImageStorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ImageStorageError };

export interface ImageStorage {
  /** Creates a new object; never overwrites an existing one. */
  upload(path: string, image: ValidImage): Promise<ImageStorageResult<null>>;
  /** Deletes objects. Missing objects are not an error. Returns the paths actually removed. */
  remove(paths: string[]): Promise<ImageStorageResult<string[]>>;
  /** Paths of the objects directly inside `folder`. */
  list(folder: string): Promise<ImageStorageResult<string[]>>;
}

// Object names never repeat (a new image gets a new name), so caching never serves a stale
// version. One day bounds how long a removed image may still be served from caches.
const CACHE_SECONDS = "86400";
const LIST_LIMIT = 100;

type Client = Pick<SupabaseClient, "storage">;

function fail(error: unknown): { ok: false; error: ImageStorageError } {
  const details = (typeof error === "object" && error !== null ? error : {}) as {
    status?: unknown;
    statusCode?: unknown;
  };
  return {
    ok: false,
    error: {
      status: typeof details.status === "number" ? details.status : undefined,
      code: typeof details.statusCode === "string" ? details.statusCode : undefined,
    },
  };
}

export function createSupabaseImageStorage(client: Client, bucket: ImageBucket): ImageStorage {
  const files = () => client.storage.from(bucket);

  return {
    async upload(path, image) {
      try {
        const { error } = await files().upload(path, image.bytes, {
          contentType: image.contentType,
          cacheControl: CACHE_SECONDS,
          upsert: false,
        });
        return error ? fail(error) : { ok: true, value: null };
      } catch (error) {
        return fail(error);
      }
    },

    async remove(paths) {
      if (paths.length === 0) {
        return { ok: true, value: [] };
      }
      try {
        const { data, error } = await files().remove(paths);
        if (error) {
          return fail(error);
        }
        return { ok: true, value: (data ?? []).map((object) => String(object.name)) };
      } catch (error) {
        return fail(error);
      }
    },

    async list(folder) {
      try {
        const { data, error } = await files().list(folder, { limit: LIST_LIMIT });
        if (error) {
          return fail(error);
        }
        return { ok: true, value: (data ?? []).map((object) => `${folder}/${object.name}`) };
      } catch (error) {
        return fail(error);
      }
    },
  };
}

export function isStoragePermissionError(error: ImageStorageError): boolean {
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.code === "401" ||
    error.code === "403" ||
    error.code === "42501"
  );
}

/**
 * Internal failure categories. Logged with the object path and error status/code only:
 * never tokens, keys or raw Storage messages.
 */
export type ImageIssue =
  | "upload_failed"
  | "reference_update_failed"
  | "orphaned_upload"
  | "old_image_cleanup_failed"
  | "owner_cleanup_failed";

export const imageIssueLog = {
  report(issue: ImageIssue, detail: { path?: string; folder?: string; error?: ImageStorageError }) {
    console.error(`[images] ${issue}`, detail);
  },
};

/**
 * Deletes every image of a deleted row (product or event): the stored path plus anything
 * else in the row's folder, such as leftovers of an earlier failed replacement. Targets are
 * derived from the trusted id and the stored path, and only paths inside the row's own
 * folder are ever deleted. The folder sweep is best effort (failures are logged); the
 * result says whether the stored image is gone.
 */
export async function removeOwnerImages(
  storage: ImageStorage,
  ownerId: string,
  storedPath: string | null,
): Promise<boolean> {
  const folder = imageFolder(ownerId);
  if (!folder) {
    return false;
  }

  const targets = new Set<string>();
  if (isImageObjectPath(storedPath, folder)) {
    targets.add(storedPath);
  }

  const listed = await storage.list(folder);
  if (listed.ok) {
    for (const path of listed.value) {
      if (isImageObjectPath(path, folder)) {
        targets.add(path);
      }
    }
  } else {
    imageIssueLog.report("owner_cleanup_failed", { folder, error: listed.error });
  }

  if (targets.size === 0) {
    return true;
  }

  const removed = await storage.remove([...targets]);
  if (!removed.ok) {
    imageIssueLog.report("owner_cleanup_failed", { folder, error: removed.error });
    return false;
  }
  return true;
}
