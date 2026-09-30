// In-memory stand-ins for Supabase used by the product tests (not a test file itself: the
// `npm test` glob only matches *.test.ts). No network, no real database.

import type { ImageStorage, ImageStorageError, ImageStorageResult } from "../../src/lib/images/storage.ts";
import type { ValidImage } from "../../src/lib/images/validation.ts";
import type {
  ProductDetails,
  ProductFlag,
  ProductInput,
  ProductStore,
  StoreResult,
} from "../../src/lib/products/management.ts";

type Failure = { code?: string; status?: number };
type Method = keyof ProductStore;

/**
 * products table with the unique slug constraint. Records every call so tests can assert
 * that callers without a staff role never reach the store.
 */
export class FakeStore implements ProductStore {
  products = new Map<string, ProductDetails>();
  calls: Method[] = [];
  failures: Partial<Record<Method, Failure>> = {};
  nextId = 100;
  /** Runs inside setImagePath before the compare-and-set, to simulate a concurrent change. */
  beforeSetImagePath?: () => void;

  add(id: string, input: ProductInput, imagePath: string | null = null) {
    this.products.set(id, this.toDetails(id, input, imagePath));
  }

  private toDetails(id: string, input: ProductInput, imagePath: string | null): ProductDetails {
    return {
      id,
      name: input.name,
      slug: input.slug,
      description: input.description,
      category: input.category,
      price: input.price === null ? null : Number(input.price),
      isAvailable: input.isAvailable,
      isFeatured: input.isFeatured,
      imagePath,
      updatedAt: "2026-09-30T00:00:00Z",
    };
  }

  private slugTaken(slug: string, exceptId?: string) {
    return [...this.products.values()].some((p) => p.slug === slug && p.id !== exceptId);
  }

  private run<T>(method: Method, body: () => StoreResult<T>): Promise<StoreResult<T>> {
    this.calls.push(method);
    const failure = this.failures[method];
    return Promise.resolve(failure ? { ok: false, error: failure } : body());
  }

  list() {
    return this.run("list", () => ({ ok: true, value: [...this.products.values()] }));
  }
  get(id: string) {
    return this.run("get", () => ({
      ok: true,
      value: this.products.has(id) ? { ...this.products.get(id)! } : null,
    }));
  }
  insert(input: ProductInput) {
    return this.run<{ id: string }>("insert", () => {
      if (this.slugTaken(input.slug)) return { ok: false, error: { code: "23505", status: 409 } };
      const id = `20000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`;
      this.add(id, input);
      return { ok: true, value: { id } };
    });
  }
  update(id: string, input: ProductInput) {
    return this.run<boolean>("update", () => {
      const existing = this.products.get(id);
      if (!existing) return { ok: true, value: false };
      if (this.slugTaken(input.slug, id)) return { ok: false, error: { code: "23505", status: 409 } };
      this.add(id, input, existing.imagePath);
      return { ok: true, value: true };
    });
  }
  setFlag(id: string, flag: ProductFlag, value: boolean) {
    return this.run("setFlag", () => {
      const product = this.products.get(id);
      if (!product) return { ok: true, value: null };
      if (flag === "is_available") product.isAvailable = value;
      else product.isFeatured = value;
      return { ok: true, value: { name: product.name } };
    });
  }
  setImagePath(id: string, path: string | null, expected: string | null) {
    return this.run<boolean>("setImagePath", () => {
      this.beforeSetImagePath?.();
      const product = this.products.get(id);
      if (!product || product.imagePath !== expected) return { ok: true, value: false };
      product.imagePath = path;
      return { ok: true, value: true };
    });
  }
  remove(id: string) {
    return this.run("remove", () => {
      const product = this.products.get(id);
      this.products.delete(id);
      return {
        ok: true,
        value: product ? { name: product.name, imagePath: product.imagePath } : null,
      };
    });
  }
}

type StorageMethod = keyof ImageStorage;

/** One Storage bucket: object path -> content type. Missing objects are not an error. */
export class FakeImageStorage implements ImageStorage {
  objects = new Map<string, string>();
  calls: [StorageMethod, ...unknown[]][] = [];
  failures: Partial<Record<StorageMethod, ImageStorageError>> = {};

  private run<T>(
    call: [StorageMethod, ...unknown[]],
    body: () => T,
  ): Promise<ImageStorageResult<T>> {
    this.calls.push(call);
    const failure = this.failures[call[0]];
    return Promise.resolve(failure ? { ok: false, error: failure } : { ok: true, value: body() });
  }

  upload(path: string, image: ValidImage) {
    return this.run(["upload", path, image.contentType], () => {
      if (this.objects.has(path)) throw new Error("upload must never overwrite");
      this.objects.set(path, image.contentType);
      return null;
    });
  }
  remove(paths: string[]) {
    return this.run(["remove", [...paths]], () => paths.filter((path) => this.objects.delete(path)));
  }
  list(folder: string) {
    return this.run(["list", folder], () =>
      [...this.objects.keys()].filter((path) => path.startsWith(`${folder}/`)),
    );
  }
}
