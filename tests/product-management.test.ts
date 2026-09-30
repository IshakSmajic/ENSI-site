// Unit tests for staff product management (src/lib/products/). Run with `npm test`.
//
// An in-memory ProductStore stands in for Supabase (products table with the unique slug
// constraint). It records every call so the tests can assert that callers without a staff
// role never reach the store. No network, no real database.

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  PRODUCT_FIELDS,
  PRODUCT_MESSAGES,
  authorizeStaff,
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  parseProductForm,
  parseProductId,
  productNotice,
  setProductFlag,
  slugify,
  updateProduct,
  type ProductAccess,
  type ProductDetails,
  type ProductFlag,
  type ProductInput,
  type ProductStore,
  type RawProductFields,
  type StoreResult,
} from "../src/lib/products/management.ts";
import { createSupabaseProductStore } from "../src/lib/products/supabase-store.ts";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000002";
const TEA_ID = "10000000-0000-4000-8000-000000000001";
const BALM_ID = "10000000-0000-4000-8000-000000000002";
const MISSING_ID = "10000000-0000-4000-8000-0000000000ff";

const owner: ProductAccess = { status: "staff", user: { id: OWNER_ID, role: "owner" } };
const employee: ProductAccess = { status: "staff", user: { id: EMPLOYEE_ID, role: "employee" } };
const staff: [string, ProductAccess][] = [
  ["owner", owner],
  ["employee", employee],
];
const nonStaff: [string, ProductAccess, string][] = [
  ["anonymous", { status: "anonymous" }, PRODUCT_MESSAGES.signedOut],
  ["authenticated without a role", { status: "unauthorized" }, PRODUCT_MESSAGES.notStaff],
  ["role lookup failed", { status: "unavailable" }, PRODUCT_MESSAGES.unavailable],
];

type Failure = { code?: string; status?: number };
type Method = keyof ProductStore;

class FakeStore implements ProductStore {
  products = new Map<string, ProductDetails>();
  calls: Method[] = [];
  failures: Partial<Record<Method, Failure>> = {};
  nextId = 100;

  add(id: string, input: ProductInput) {
    this.products.set(id, this.toDetails(id, input));
  }

  private toDetails(id: string, input: ProductInput): ProductDetails {
    return {
      id,
      name: input.name,
      slug: input.slug,
      description: input.description,
      category: input.category,
      price: input.price === null ? null : Number(input.price),
      isAvailable: input.isAvailable,
      isFeatured: input.isFeatured,
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
    return this.run("get", () => ({ ok: true, value: this.products.get(id) ?? null }));
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
      if (!this.products.has(id)) return { ok: true, value: false };
      if (this.slugTaken(input.slug, id)) return { ok: false, error: { code: "23505", status: 409 } };
      this.add(id, input);
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
  remove(id: string) {
    return this.run("remove", () => {
      const product = this.products.get(id);
      this.products.delete(id);
      return { ok: true, value: product ? { name: product.name } : null };
    });
  }
}

const TEA: ProductInput = {
  name: "Chamomile Tea",
  slug: "chamomile-tea",
  description: "Dried chamomile flowers.",
  category: "Teas",
  price: "6.50",
  isAvailable: true,
  isFeatured: true,
};
const BALM: ProductInput = { ...TEA, name: "Herbal Balm", slug: "herbal-balm", isFeatured: false };

function form(overrides: RawProductFields = {}): RawProductFields {
  return {
    name: "Peppermint Oil",
    slug: "",
    description: "",
    category: "Oils",
    price: "9.90",
    is_available: "on",
    is_featured: null,
    ...overrides,
  };
}

let store: FakeStore;

beforeEach(() => {
  store = new FakeStore();
  store.add(TEA_ID, TEA);
  store.add(BALM_ID, BALM);
});

describe("authorizeStaff", () => {
  it("allows owners and employees only", () => {
    for (const [name, access] of staff) {
      assert.deepEqual(authorizeStaff(access), { ok: true }, name);
    }
    for (const [name, access, error] of nonStaff) {
      assert.deepEqual(authorizeStaff(access), { ok: false, error }, name);
    }
  });
});

describe("callers without a staff role", () => {
  for (const [name, access, error] of nonStaff) {
    it(`${name}: cannot read or change products and never reach the store`, async () => {
      assert.deepEqual(await listProducts(access, store), { ok: false, error });
      assert.deepEqual(await getProduct(access, store, TEA_ID), { ok: false, error });

      const created = await createProduct(access, store, form());
      assert.equal(created.ok, false);
      assert.equal(!created.ok && created.error, error);

      const updated = await updateProduct(access, store, TEA_ID, form({ name: "Hacked" }));
      assert.equal(!updated.ok && updated.error, error);

      assert.deepEqual(await setProductFlag(access, store, TEA_ID, "available", "false"), {
        ok: false,
        error,
      });
      assert.deepEqual(await setProductFlag(access, store, TEA_ID, "featured", "false"), {
        ok: false,
        error,
      });
      assert.deepEqual(await deleteProduct(access, store, TEA_ID), { ok: false, error });

      assert.deepEqual(store.calls, []);
      assert.equal(store.products.size, 2);
      assert.equal(store.products.get(TEA_ID)?.name, "Chamomile Tea");
      assert.equal(store.products.get(TEA_ID)?.isAvailable, true);
      assert.equal(store.products.get(TEA_ID)?.isFeatured, true);
    });
  }
});

describe("staff product management", () => {
  for (const [name, access] of staff) {
    it(`${name}: can list, create, edit, toggle and delete`, async () => {
      const list = await listProducts(access, store);
      assert.equal(list.ok && list.products.length, 2);

      const created = await createProduct(access, store, form());
      assert.ok(created.ok);
      const id = created.id;
      assert.equal(store.products.get(id)?.slug, "peppermint-oil");

      const updated = await updateProduct(access, store, id, form({ name: "Peppermint Oil 10 ml", slug: "peppermint-oil" }));
      assert.deepEqual(updated, { ok: true, id });
      assert.equal(store.products.get(id)?.name, "Peppermint Oil 10 ml");

      assert.equal((await setProductFlag(access, store, id, "featured", "true")).ok, true);
      assert.equal(store.products.get(id)?.isFeatured, true);

      assert.deepEqual(await deleteProduct(access, store, id), {
        ok: true,
        message: "“Peppermint Oil 10 ml” was deleted.",
      });
      assert.equal(store.products.has(id), false);
    });
  }
});

describe("listProducts", () => {
  it("returns an empty catalogue", async () => {
    store.products.clear();
    assert.deepEqual(await listProducts(employee, store), { ok: true, products: [] });
  });

  it("reports a read failure with a fixed message", async () => {
    store.failures.list = { code: "PGRST000", status: 503 };
    assert.deepEqual(await listProducts(employee, store), {
      ok: false,
      error: PRODUCT_MESSAGES.loadFailed,
    });
  });
});

describe("getProduct", () => {
  it("loads an existing product", async () => {
    const result = await getProduct(employee, store, TEA_ID.toUpperCase());
    assert.equal(result.ok && result.product.slug, "chamomile-tea");
  });

  it("refuses malformed ids without querying", async () => {
    for (const id of ["", "1", "not-a-uuid", `${TEA_ID}x`, "' or 1=1 --", null, undefined, 42]) {
      assert.deepEqual(await getProduct(employee, store, id), {
        ok: false,
        error: PRODUCT_MESSAGES.notFound,
      });
    }
    assert.deepEqual(store.calls, []);
  });

  it("reports a missing product and read failures", async () => {
    assert.deepEqual(await getProduct(employee, store, MISSING_ID), {
      ok: false,
      error: PRODUCT_MESSAGES.notFound,
    });
    store.failures.get = { code: "PGRST000" };
    assert.deepEqual(await getProduct(employee, store, TEA_ID), {
      ok: false,
      error: PRODUCT_MESSAGES.loadOneFailed,
    });
  });
});

describe("createProduct", () => {
  it("creates a product with normalized values", async () => {
    const result = await createProduct(
      employee,
      store,
      form({
        name: "  Kamilica   čaj  ",
        category: "  Teas ",
        description: "  Line one\r\nLine two  ",
        price: "6,5",
        is_available: null,
        is_featured: "on",
      }),
    );
    assert.ok(result.ok);
    assert.deepEqual(store.products.get(result.id), {
      id: result.id,
      name: "Kamilica čaj",
      slug: "kamilica-caj",
      description: "Line one\nLine two",
      category: "Teas",
      price: 6.5,
      isAvailable: false,
      isFeatured: true,
      updatedAt: "2026-09-30T00:00:00Z",
    });
  });

  it("stores empty optional fields as null", async () => {
    const result = await createProduct(employee, store, form({ category: " ", price: "", description: "\n" }));
    assert.ok(result.ok);
    const product = store.products.get(result.id);
    assert.equal(product?.category, null);
    assert.equal(product?.price, null);
    assert.equal(product?.description, null);
  });

  it("rejects missing and invalid required values without writing", async () => {
    const result = await createProduct(employee, store, form({ name: "   ", slug: "Bad Slug!", price: "-1" }));
    assert.equal(result.ok, false);
    assert.ok(!result.ok);
    assert.equal(result.error, PRODUCT_MESSAGES.invalidForm);
    assert.deepEqual(result.fieldErrors, {
      name: PRODUCT_MESSAGES.nameRequired,
      slug: PRODUCT_MESSAGES.slugInvalid,
      price: PRODUCT_MESSAGES.priceInvalid,
    });
    // The submitted values come back so the form can show them again.
    assert.equal(result.values.slug, "Bad Slug!");
    assert.deepEqual(store.calls, []);
  });

  it("refuses a duplicate slug (typed or generated) with a field error", async () => {
    for (const fields of [form({ slug: "chamomile-tea" }), form({ name: "Chamomile Tea", slug: "" })]) {
      const result = await createProduct(employee, store, fields);
      assert.ok(!result.ok);
      assert.deepEqual(result.fieldErrors, { slug: PRODUCT_MESSAGES.slugTaken });
    }
    assert.equal(store.products.size, 2);
  });

  it("maps database failures to fixed messages", async () => {
    store.failures.insert = { code: "42501", status: 403 };
    let result = await createProduct(employee, store, form());
    assert.ok(!result.ok);
    assert.equal(result.error, PRODUCT_MESSAGES.notPermitted);

    store.failures.insert = { code: "XX000", status: 500 };
    result = await createProduct(employee, store, form());
    assert.ok(!result.ok);
    assert.equal(result.error, PRODUCT_MESSAGES.saveFailed);
  });
});

describe("updateProduct", () => {
  it("updates an existing product", async () => {
    const result = await updateProduct(owner, store, TEA_ID, form({ name: "Chamomile Tea 50 g", slug: "chamomile-tea" }));
    assert.deepEqual(result, { ok: true, id: TEA_ID });
    assert.equal(store.products.get(TEA_ID)?.name, "Chamomile Tea 50 g");
    assert.equal(store.products.get(TEA_ID)?.slug, "chamomile-tea");
  });

  it("refuses an invalid product id without writing", async () => {
    for (const id of ["nope", "", null, `${TEA_ID};`]) {
      const result = await updateProduct(owner, store, id, form());
      assert.ok(!result.ok);
      assert.equal(result.error, PRODUCT_MESSAGES.invalidProduct);
    }
    assert.deepEqual(store.calls, []);
  });

  it("reports a product that does not exist", async () => {
    const result = await updateProduct(owner, store, MISSING_ID, form());
    assert.ok(!result.ok);
    assert.equal(result.error, PRODUCT_MESSAGES.notFound);
    assert.equal(store.products.size, 2);
  });

  it("rejects invalid field values without writing", async () => {
    const result = await updateProduct(owner, store, TEA_ID, form({ name: "x".repeat(121), price: "1.234" }));
    assert.ok(!result.ok);
    assert.deepEqual(Object.keys(result.fieldErrors).sort(), ["name", "price"]);
    assert.deepEqual(store.calls, []);
  });

  it("refuses a slug used by another product", async () => {
    const result = await updateProduct(owner, store, TEA_ID, form({ slug: "herbal-balm" }));
    assert.ok(!result.ok);
    assert.deepEqual(result.fieldErrors, { slug: PRODUCT_MESSAGES.slugTaken });
    assert.equal(store.products.get(TEA_ID)?.slug, "chamomile-tea");
  });
});

describe("setProductFlag", () => {
  it("sets availability", async () => {
    assert.deepEqual(await setProductFlag(employee, store, TEA_ID, "available", "false"), {
      ok: true,
      message: "“Chamomile Tea” is now unavailable.",
    });
    assert.equal(store.products.get(TEA_ID)?.isAvailable, false);
    assert.equal((await setProductFlag(employee, store, TEA_ID, "available", "true")).ok, true);
    assert.equal(store.products.get(TEA_ID)?.isAvailable, true);
  });

  it("sets featured status, idempotently", async () => {
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await setProductFlag(employee, store, BALM_ID, "featured", "true"), {
        ok: true,
        message: "“Herbal Balm” is now featured.",
      });
      assert.equal(store.products.get(BALM_ID)?.isFeatured, true);
    }
    assert.equal((await setProductFlag(employee, store, BALM_ID, "featured", "false")).ok, true);
    assert.equal(store.products.get(BALM_ID)?.isFeatured, false);
  });

  it("refuses unknown flags, values and ids without writing", async () => {
    const cases: [unknown, unknown, unknown, string][] = [
      [TEA_ID, "is_available", "true", PRODUCT_MESSAGES.invalidFlag],
      [TEA_ID, "name", "true", PRODUCT_MESSAGES.invalidFlag],
      [TEA_ID, "__proto__", "true", PRODUCT_MESSAGES.invalidFlag],
      [TEA_ID, "available", "yes", PRODUCT_MESSAGES.invalidFlag],
      [TEA_ID, "featured", null, PRODUCT_MESSAGES.invalidFlag],
      ["x", "available", "true", PRODUCT_MESSAGES.invalidProduct],
    ];
    for (const [id, flag, value, error] of cases) {
      assert.deepEqual(await setProductFlag(employee, store, id, flag, value), { ok: false, error });
    }
    assert.deepEqual(store.calls, []);
  });

  it("reports missing products and failures", async () => {
    assert.deepEqual(await setProductFlag(employee, store, MISSING_ID, "available", "true"), {
      ok: false,
      error: PRODUCT_MESSAGES.notFound,
    });
    store.failures.setFlag = { code: "42501" };
    assert.deepEqual(await setProductFlag(employee, store, TEA_ID, "available", "true"), {
      ok: false,
      error: PRODUCT_MESSAGES.notPermitted,
    });
    store.failures.setFlag = { code: "08006" };
    assert.deepEqual(await setProductFlag(employee, store, TEA_ID, "available", "true"), {
      ok: false,
      error: PRODUCT_MESSAGES.updateFailed,
    });
  });
});

describe("deleteProduct", () => {
  it("deletes only the named product", async () => {
    assert.deepEqual(await deleteProduct(owner, store, BALM_ID), {
      ok: true,
      message: "“Herbal Balm” was deleted.",
    });
    assert.deepEqual([...store.products.keys()], [TEA_ID]);
  });

  it("refuses invalid and missing targets", async () => {
    assert.deepEqual(await deleteProduct(owner, store, "*"), {
      ok: false,
      error: PRODUCT_MESSAGES.invalidProduct,
    });
    assert.deepEqual(store.calls, []);
    assert.deepEqual(await deleteProduct(owner, store, MISSING_ID), {
      ok: false,
      error: PRODUCT_MESSAGES.notFound,
    });
    assert.equal(store.products.size, 2);
  });

  it("maps failures to fixed messages", async () => {
    store.failures.remove = { status: 401 };
    assert.deepEqual(await deleteProduct(owner, store, TEA_ID), {
      ok: false,
      error: PRODUCT_MESSAGES.notPermitted,
    });
    store.failures.remove = { code: "57014" };
    assert.deepEqual(await deleteProduct(owner, store, TEA_ID), {
      ok: false,
      error: PRODUCT_MESSAGES.deleteFailed,
    });
    assert.equal(store.products.size, 2);
  });
});

describe("input parsing", () => {
  it("builds slugs from names", () => {
    assert.equal(slugify("Chamomile Tea"), "chamomile-tea");
    assert.equal(slugify("  Kamilica čaj (100 g) "), "kamilica-caj-100-g");
    assert.equal(slugify("Đumbir & Šipak — Æther"), "dumbir-sipak-aether");
    assert.equal(slugify("---"), "");
    assert.equal(slugify("茶"), "");
    const long = slugify("a ".repeat(200));
    assert.ok(long.length <= 100 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(long));
  });

  it("validates typed slugs like the database constraint", () => {
    for (const slug of ["chamomile-tea", "CHAMOMILE-TEA", " tea-2 "]) {
      assert.equal(parseProductForm(form({ slug })).ok, true, slug);
    }
    for (const slug of ["tea--2", "-tea", "tea-", "tea_2", "tea 2", "čaj", "a".repeat(101)]) {
      assert.equal(parseProductForm(form({ slug })).ok, false, slug);
    }
  });

  it("needs a slug when none can be generated from the name", () => {
    const result = parseProductForm(form({ name: "茶", slug: "" }));
    assert.deepEqual(result, { ok: false, fieldErrors: { slug: PRODUCT_MESSAGES.slugFromNameFailed } });
  });

  it("validates prices", () => {
    const valid: [string, string | null][] = [
      ["0", "0.00"],
      ["6.5", "6.50"],
      ["6,50", "6.50"],
      ["007.1", "7.10"],
      ["99999999.99", "99999999.99"],
      [" ", null],
    ];
    for (const [price, stored] of valid) {
      const result = parseProductForm(form({ price }));
      assert.ok(result.ok, price);
      assert.equal(result.input.price, stored, price);
    }
    for (const price of ["-1", "1.234", "100000000", "1e3", "abc", "1.", ".5", "1,000.00", "NaN", "Infinity"]) {
      assert.equal(parseProductForm(form({ price })).ok, false, price);
    }
  });

  it("enforces length limits", () => {
    assert.equal(parseProductForm(form({ category: "c".repeat(61) })).ok, false);
    assert.equal(parseProductForm(form({ description: "d".repeat(5001) })).ok, false);
    assert.equal(parseProductForm(form({ description: "d".repeat(5000) })).ok, true);
  });

  it("treats only a checked checkbox as true", () => {
    for (const value of ["true", "1", "false", "", null, undefined]) {
      const result = parseProductForm(form({ is_available: value, is_featured: value }));
      assert.ok(result.ok);
      assert.equal(result.input.isAvailable, false, String(value));
      assert.equal(result.input.isFeatured, false, String(value));
    }
  });

  it("ignores non-string (file) values", () => {
    const result = parseProductForm(form({ name: new Blob(["x"]) }));
    assert.deepEqual(result, { ok: false, fieldErrors: { name: PRODUCT_MESSAGES.nameRequired } });
  });

  it("accepts only UUIDs as product ids", () => {
    assert.equal(parseProductId(TEA_ID.toUpperCase()), TEA_ID);
    assert.equal(parseProductId("not-a-uuid"), null);
  });

  it("renders only known notices", () => {
    assert.equal(productNotice("created"), "Product created.");
    assert.equal(productNotice("updated"), "Product saved.");
    for (const code of ["<script>", "toString", "__proto__", "", undefined, ["created"]]) {
      assert.equal(productNotice(code), null);
    }
  });

  it("reads only the whitelisted form fields", () => {
    assert.deepEqual([...PRODUCT_FIELDS].sort(), [
      "category",
      "description",
      "is_available",
      "is_featured",
      "name",
      "price",
      "slug",
    ]);
  });
});

// Stand-in for the Supabase client parts the adapter uses. Each query resolves to `result`.
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of ["select", "insert", "update", "delete", "eq", "order"]) {
    chain[name] = (...args) => (calls.push([name, ...args]), chain);
  }
  chain.maybeSingle = async () => (calls.push(["maybeSingle"]), result);
  chain.single = async () => (calls.push(["single"]), result);
  chain.then = (resolve: unknown) => Promise.resolve(result).then(resolve as (v: unknown) => unknown);
  const client = {
    from: (table: string) => (calls.push(["from", table]), chain),
  };
  return { client: client as unknown as Parameters<typeof createSupabaseProductStore>[0], calls };
}

describe("createSupabaseProductStore", () => {
  const ROW = {
    id: TEA_ID,
    name: "Chamomile Tea",
    slug: "chamomile-tea",
    description: "Dried chamomile flowers.",
    category: "Teas",
    price: 6.5,
    is_available: true,
    is_featured: false,
    updated_at: "2026-09-30T00:00:00Z",
    image_url: "https://example.com/x.png",
  };

  it("inserts only the whitelisted columns", async () => {
    // Even if extra properties sneak into the input object, they are not written.
    const parsed = parseProductForm({ ...form(), id: MISSING_ID, image_url: "x", created_at: "1999" } as RawProductFields);
    assert.ok(parsed.ok);
    const { client, calls } = fakeClient({ data: { id: TEA_ID }, error: null });
    assert.deepEqual(await createSupabaseProductStore(client).insert(parsed.input), {
      ok: true,
      value: { id: TEA_ID },
    });
    assert.deepEqual(calls, [
      ["from", "products"],
      [
        "insert",
        {
          name: "Peppermint Oil",
          slug: "peppermint-oil",
          description: null,
          category: "Oils",
          price: "9.90",
          is_available: true,
          is_featured: false,
        },
      ],
      ["select", "id"],
      ["single"],
    ]);
  });

  it("updates by id and reports whether a row changed", async () => {
    let fake = fakeClient({ data: [{ id: TEA_ID }], error: null });
    assert.deepEqual(await createSupabaseProductStore(fake.client).update(TEA_ID, TEA), { ok: true, value: true });
    assert.deepEqual(fake.calls.slice(2), [
      ["eq", "id", TEA_ID],
      ["select", "id"],
    ]);
    // RLS-filtered or missing rows: no error, no rows.
    fake = fakeClient({ data: [], error: null });
    assert.deepEqual(await createSupabaseProductStore(fake.client).update(TEA_ID, TEA), { ok: true, value: false });
  });

  it("sets exactly one flag column", async () => {
    const { client, calls } = fakeClient({ data: [{ name: "Chamomile Tea" }], error: null });
    const result = await createSupabaseProductStore(client).setFlag(TEA_ID, "is_featured", true);
    assert.deepEqual(result, { ok: true, value: { name: "Chamomile Tea" } });
    assert.deepEqual(calls, [
      ["from", "products"],
      ["update", { is_featured: true }],
      ["eq", "id", TEA_ID],
      ["select", "name"],
    ]);
  });

  it("deletes by id only", async () => {
    let fake = fakeClient({ data: [{ name: "Chamomile Tea" }], error: null });
    assert.deepEqual(await createSupabaseProductStore(fake.client).remove(TEA_ID), {
      ok: true,
      value: { name: "Chamomile Tea" },
    });
    assert.deepEqual(fake.calls, [
      ["from", "products"],
      ["delete"],
      ["eq", "id", TEA_ID],
      ["select", "name"],
    ]);
    fake = fakeClient({ data: [], error: null });
    assert.deepEqual(await createSupabaseProductStore(fake.client).remove(TEA_ID), { ok: true, value: null });
  });

  it("maps rows and ignores columns it does not manage", async () => {
    let fake = fakeClient({ data: ROW, error: null });
    assert.deepEqual(await createSupabaseProductStore(fake.client).get(TEA_ID), {
      ok: true,
      value: {
        id: TEA_ID,
        name: "Chamomile Tea",
        slug: "chamomile-tea",
        description: "Dried chamomile flowers.",
        category: "Teas",
        price: 6.5,
        isAvailable: true,
        isFeatured: false,
        updatedAt: "2026-09-30T00:00:00Z",
      },
    });
    fake = fakeClient({ data: [{ ...ROW, price: null, category: null }], error: null });
    const list = await createSupabaseProductStore(fake.client).list();
    assert.ok(list.ok);
    assert.equal(list.value[0].price, null);
    assert.equal(list.value[0].category, null);
    fake = fakeClient({ data: null, error: null });
    assert.deepEqual(await createSupabaseProductStore(fake.client).get(MISSING_ID), { ok: true, value: null });
  });

  it("keeps only the error code/status, never messages or details", async () => {
    const { client } = fakeClient({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "products_slug_key"',
        details: "Key (slug)=(chamomile-tea) already exists.",
        hint: null,
        status: 409,
      },
    });
    assert.deepEqual(await createSupabaseProductStore(client).insert(TEA), {
      ok: false,
      error: { code: "23505", status: 409 },
    });
  });
});
