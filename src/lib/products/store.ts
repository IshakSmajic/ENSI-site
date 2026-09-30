import "server-only";

import { createSupabaseImageStorage, type ImageStorage } from "@/lib/images/storage";
import { IMAGE_BUCKETS, publicImageUrl } from "@/lib/images/validation";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import type { ProductStore } from "./management";
import { createSupabaseProductStore } from "./supabase-store";

/**
 * Opens the product store with the current request's session (publishable key), so the
 * products RLS policies apply. Pass it to the functions in ./management.ts, which check
 * the staff role before using it.
 */
export async function openProductStore(): Promise<ProductStore> {
  return createSupabaseProductStore(await createClient());
}

/**
 * Opens the product-images bucket with the current request's session, so the
 * storage.objects RLS policies apply. No privileged key.
 */
export async function openProductImageStorage(): Promise<ImageStorage> {
  return createSupabaseImageStorage(await createClient(), IMAGE_BUCKETS.products);
}

/** Public URL of a stored product image, or null for no (or an invalid) path. */
export function productImageUrl(path: string | null): string | null {
  return publicImageUrl(getSupabaseEnv().url, IMAGE_BUCKETS.products, path);
}
