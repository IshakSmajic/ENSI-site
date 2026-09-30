// ProductStore backed by the request's user-scoped Supabase client (publishable key + the
// caller's session), so every query is subject to the products RLS policies. No privileged
// key is involved.
//
// Only the error code/status of a failure is kept; messages and SQL details never leave
// this file. Writes list their columns explicitly (never a spread of user input).
//
// Kept free of Next.js and "@/" imports so it runs under `npm test`.

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ProductDetails,
  ProductInput,
  ProductStore,
  ProductSummary,
  StoreError,
  StoreResult,
} from "./management";

type Client = Pick<SupabaseClient, "from">;

const SUMMARY_COLUMNS = "id, name, slug, category, price, is_available, is_featured, updated_at";
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, description`;

function ok<T>(value: T): StoreResult<T> {
  return { ok: true, value };
}

function fail(error: { code?: unknown; status?: unknown }): { ok: false; error: StoreError } {
  return {
    ok: false,
    error: {
      code: typeof error.code === "string" ? error.code : undefined,
      status: typeof error.status === "number" ? error.status : undefined,
    },
  };
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// PostgREST returns numeric columns as JSON numbers; accept strings too.
function nullablePrice(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const price = Number(value);
  return Number.isFinite(price) ? price : null;
}

function toSummary(row: Record<string, unknown>): ProductSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    category: nullableText(row.category),
    price: nullablePrice(row.price),
    isAvailable: row.is_available === true,
    isFeatured: row.is_featured === true,
    updatedAt: String(row.updated_at),
  };
}

function toDetails(row: Record<string, unknown>): ProductDetails {
  return { ...toSummary(row), description: nullableText(row.description) };
}

// The complete set of columns staff may write. id, image_url (Milestone 8) and the
// timestamps are left to the database.
function toRow(input: ProductInput) {
  return {
    name: input.name,
    slug: input.slug,
    description: input.description,
    category: input.category,
    price: input.price,
    is_available: input.isAvailable,
    is_featured: input.isFeatured,
  };
}

function firstName(data: unknown): { name: string } | null {
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  return row ? { name: String(row.name) } : null;
}

export function createSupabaseProductStore(client: Client): ProductStore {
  return {
    async list() {
      const { data, error } = await client
        .from("products")
        .select(SUMMARY_COLUMNS)
        .order("name", { ascending: true })
        .order("id", { ascending: true });
      if (error) {
        return fail(error);
      }
      return ok(((data ?? []) as Record<string, unknown>[]).map(toSummary));
    },

    async get(id) {
      const { data, error } = await client
        .from("products")
        .select(DETAIL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        return fail(error);
      }
      return ok(data ? toDetails(data as Record<string, unknown>) : null);
    },

    async insert(input) {
      const { data, error } = await client
        .from("products")
        .insert(toRow(input))
        .select("id")
        .single();
      if (error) {
        return fail(error);
      }
      return ok({ id: String((data as Record<string, unknown>).id) });
    },

    // An UPDATE/DELETE that RLS filters out affects no rows instead of failing, so each
    // write returns the affected rows and "no row" is reported to the caller.
    async update(id, input) {
      const { data, error } = await client
        .from("products")
        .update(toRow(input))
        .eq("id", id)
        .select("id");
      return error ? fail(error) : ok(Array.isArray(data) && data.length > 0);
    },

    async setFlag(id, flag, value) {
      const change = flag === "is_available" ? { is_available: value } : { is_featured: value };
      const { data, error } = await client
        .from("products")
        .update(change)
        .eq("id", id)
        .select("name");
      return error ? fail(error) : ok(firstName(data));
    },

    async remove(id) {
      const { data, error } = await client
        .from("products")
        .delete()
        .eq("id", id)
        .select("name");
      return error ? fail(error) : ok(firstName(data));
    },
  };
}
