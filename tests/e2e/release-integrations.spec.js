import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { runReversibleEvidence } from "../../scripts/playwright-release-evidence-core.mjs";

const CLEANUP_TIMEOUT_MS = 30_000;

const fixtures = {
  email: process.env.FLOWOPS_E2E_EMAIL,
  password: process.env.FLOWOPS_E2E_PASSWORD,
  marketplaceItemId: process.env.FLOWOPS_E2E_MARKETPLACE_ITEM_ID,
  marketplaceOrderId: process.env.FLOWOPS_E2E_MARKETPLACE_ORDER_ID,
  productionOrderId: process.env.FLOWOPS_E2E_REALTIME_ORDER_ID,
  logisticsOrderId: process.env.FLOWOPS_E2E_LOGISTICS_ORDER_ID,
  trackingToken: process.env.FLOWOPS_E2E_TRACKING_TOKEN,
  realtimeOrderId: process.env.FLOWOPS_E2E_REALTIME_ORDER_ID,
};

const hasFixtures = Object.values(fixtures).every(Boolean);

async function login(page) {
  await page.goto("/");
  await page.locator("#onlineEmail").fill(fixtures.email || "");
  await page.locator("#onlinePassword").fill(fixtures.password || "");
  await page.locator("#onlineLoginForm").getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("#appView")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_500);
}

async function appContext(page) {
  return page.evaluate(async () => {
    const { state } = await import("/js/core/state.js");
    const { data, error } = await state.supabase.auth.getSession();
    if (error || !data.session) throw error || new Error("Authenticated Supabase session unavailable.");
    return {
      anonKey: state.supabase.supabaseKey,
      organizationId: state.organizationId,
      supabaseUrl: state.supabase.supabaseUrl,
      token: data.session.access_token,
    };
  });
}

function parsePersistedOrder(row, orderId) {
  let metadata;
  try {
    metadata = JSON.parse(row?.notes || "{}");
  } catch {
    throw new Error(`Release fixture ${orderId} has invalid order metadata.`);
  }
  if (!row?.id || !metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    throw new Error(`Release fixture ${orderId} has invalid persisted data.`);
  }
  return {
    id: String(row.id),
    notes: row.notes ?? null,
    updatedAt: row.updated_at || "",
    metadata,
    stage: metadata.productionStage || "",
    internalNotes: metadata.internalNotes || "",
  };
}

async function readPersistedOrder(page, orderId) {
  const row = await page.evaluate(async (id) => {
    const { state } = await import("/js/core/state.js");
    const { data, error } = await state.supabase
      .from("orders")
      .select("id,notes,updated_at")
      .eq("organization_id", state.organizationId)
      .eq("id", id)
      .single();
    if (error || !data) throw error || new Error(`Release fixture ${id} was not found.`);
    return data;
  }, orderId);
  return parsePersistedOrder(row, orderId);
}

async function updatePersistedOrder(page, { expected, notes, orderId, updatedAt }) {
  const row = await page.evaluate(async ({ expected, notes, orderId, updatedAt }) => {
    const { state } = await import("/js/core/state.js");
    let query = state.supabase
      .from("orders")
      .update({ notes, updated_at: updatedAt })
      .eq("organization_id", state.organizationId)
      .eq("id", orderId)
      .eq("updated_at", expected.updatedAt);
    query = expected.notes === null ? query.is("notes", null) : query.eq("notes", expected.notes);
    const { data, error } = await query.select("id,notes,updated_at").single();
    if (error || !data) throw error || new Error(`Order ${orderId} update affected no row.`);
    return data;
  }, { expected, notes, orderId, updatedAt });
  return parsePersistedOrder(row, orderId);
}

async function restorePersistedOrder(page, { orderId, snapshot }) {
  const current = await readPersistedOrder(page, orderId);
  const alreadyOriginal = current.notes === snapshot.notes && current.updatedAt === snapshot.updatedAt;
  const isOwnMutation = current.notes === snapshot.mutationNotes;
  if (!alreadyOriginal && !isOwnMutation) {
    throw new Error(`Order ${orderId} changed outside release evidence; restoration refused.`);
  }
  return updatePersistedOrder(page, {
    expected: current,
    notes: snapshot.notes,
    orderId,
    updatedAt: snapshot.updatedAt,
  });
}

async function verifyPersistedRestoration(page, { orderId, restored, snapshot }) {
  expect(restored.id).toBe(snapshot.id);
  expect(restored.notes).toBe(snapshot.notes);
  expect(restored.updatedAt).toBe(snapshot.updatedAt);
  expect(restored.stage).toBe(snapshot.stage);

  const persisted = await readPersistedOrder(page, orderId);
  expect(persisted.notes).toBe(snapshot.notes);
  expect(persisted.updatedAt).toBe(snapshot.updatedAt);
  expect(persisted.stage).toBe(snapshot.stage);
  expect(persisted.internalNotes).toBe(snapshot.internalNotes);
}

test.describe("release integration evidence", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });
  test.skip(!hasFixtures, "Configure all FLOWOPS_E2E integration fixture variables.");

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Release integration evidence runs once on desktop.");
    await login(page);
  });

  test("@release:production-transition persists a production stage and propagates it to a second session", async ({ browser, page: pageA }, testInfo) => {
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const runMarker = `release-evidence-${randomUUID()}`;

    try {
      const pageB = await contextB.newPage();
      await login(pageB);
      await runReversibleEvidence({
        cleanupTimeoutMs: CLEANUP_TIMEOUT_MS,
        onCleanupStart: (cleanupTimeoutMs) => testInfo.setTimeout(testInfo.timeout + cleanupTimeoutMs),
        capture: async () => {
          const snapshot = await readPersistedOrder(pageA, fixtures.productionOrderId);
          if (!snapshot.updatedAt) throw new Error(`Production fixture ${fixtures.productionOrderId} has no updated_at baseline.`);
          const nextStage = snapshot.stage === "Imprimindo" ? "Em fila" : "Imprimindo";
          return {
            ...snapshot,
            nextStage,
            mutationNotes: JSON.stringify({
              ...snapshot.metadata,
              productionStage: nextStage,
              internalNotes: `${snapshot.internalNotes}\n[${runMarker}]`.trim(),
            }),
          };
        },
        verifyBaseline: async (snapshot) => {
          await expect.poll(() => pageB.evaluate(async ({ orderId, runMarker, snapshot }) => {
            const { state } = await import("/js/core/state.js");
            const item = state.data.orders.find((order) => String(order.id) === orderId);
            return Boolean(item
              && item.productionStage === snapshot.stage
              && item.updatedAt === snapshot.updatedAt
              && !item.internalNotes.includes(runMarker));
          }, { orderId: fixtures.productionOrderId, runMarker, snapshot }), { timeout: 20_000 }).toBe(true);
        },
        mutate: async (snapshot) => updatePersistedOrder(pageA, {
          expected: snapshot,
          notes: snapshot.mutationNotes,
          orderId: fixtures.productionOrderId,
          updatedAt: new Date().toISOString(),
        }),
        verifyMutation: async (snapshot, mutation) => {
          expect(mutation.stage).toBe(snapshot.nextStage);
          expect(mutation.internalNotes).toContain(runMarker);
          await expect.poll(() => pageB.evaluate(async ({ mutation, orderId, runMarker }) => {
            const { state } = await import("/js/core/state.js");
            const item = state.data.orders.find((order) => String(order.id) === orderId);
            return Boolean(item
              && item.productionStage === mutation.stage
              && item.updatedAt === mutation.updatedAt
              && item.internalNotes.includes(runMarker));
          }, { mutation, orderId: fixtures.productionOrderId, runMarker }), { timeout: 20_000 }).toBe(true);
        },
        restore: async (snapshot) => restorePersistedOrder(pageA, {
          orderId: fixtures.productionOrderId,
          snapshot,
        }),
        verifyRestoration: async (snapshot, restored) => verifyPersistedRestoration(pageA, {
          orderId: fixtures.productionOrderId,
          restored,
          snapshot,
        }),
      });
    } finally {
      await contextB.close();
    }
  });

  test("@release:marketplace-sync synchronizes Mercado Livre listings and imports", async ({ page }) => {
    const evidence = await page.evaluate(async ({ expectedItemId, expectedOrderId }) => {
      const { state } = await import("/js/core/state.js");
      const { data: sessionData } = await state.supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const endpoint = `${state.supabase.supabaseUrl}/functions/v1/marketplace-sync?marketplace=ml&action=sync`;
      const response = await fetch(endpoint, {
        headers: {
          apikey: state.supabase.supabaseKey,
          Authorization: `Bearer ${token}`,
        },
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || `marketplace-sync returned ${response.status}`);

      const [{ data: listings, error: listingError }, { data: links, error: linkError }, { data: logs, error: logError }] = await Promise.all([
        state.supabase.from("marketplace_listings").select("external_id").eq("organization_id", state.organizationId).eq("external_id", expectedItemId),
        state.supabase.from("marketplace_order_links").select("external_order_id,internal_order_id").eq("organization_id", state.organizationId).eq("external_order_id", expectedOrderId),
        state.supabase.from("marketplace_sync_log").select("kind,status,external_order_id,created_at").eq("organization_id", state.organizationId).in("kind", ["manual-sync", "sync-products"]).order("created_at", { ascending: false }).limit(10),
      ]);
      if (listingError || linkError || logError) throw listingError || linkError || logError;
      return {
        failedCount: Number(body.failed_count || 0),
        importedOrderIds: (body.imported || []).map((item) => String(item.external_order_id)),
        listingFound: listings?.some((item) => String(item.external_id) === expectedItemId),
        orderLinkFound: links?.some((item) => String(item.external_order_id) === expectedOrderId && item.internal_order_id),
        successfulSyncLogged: logs?.some((item) => item.status === "success"),
      };
    }, {
      expectedItemId: fixtures.marketplaceItemId,
      expectedOrderId: fixtures.marketplaceOrderId,
    });

    expect(evidence.failedCount).toBe(0);
    expect(evidence.importedOrderIds).toContain(fixtures.marketplaceOrderId);
    expect(evidence.listingFound).toBe(true);
    expect(evidence.orderLinkFound).toBe(true);
    expect(evidence.successfulSyncLogged).toBe(true);
  });

  test("@release:logistics-automation retains marketplace logistics and automatic events", async ({ page }) => {
    const evidence = await page.evaluate(async (orderId) => {
      const { state } = await import("/js/core/state.js");
      const [{ data: logistics, error: logisticsError }, { data: events, error: eventsError }] = await Promise.all([
        state.supabase.from("order_logistics").select("*").eq("organization_id", state.organizationId).eq("order_id", orderId),
        state.supabase.from("logistics_events").select("*").eq("organization_id", state.organizationId).eq("order_id", orderId).order("occurred_at", { ascending: false }),
      ]);
      if (logisticsError || eventsError) throw logisticsError || eventsError;
      return { organizationId: state.organizationId, logistics: logistics || [], events: events || [] };
    }, fixtures.logisticsOrderId);

    expect(evidence.logistics).toHaveLength(1);
    expect(evidence.logistics[0].status).toBeTruthy();
    expect(evidence.logistics[0].tracking_code).toBeTruthy();
    expect(evidence.logistics.every((item) => String(item.organization_id) === evidence.organizationId)).toBe(true);
    expect(evidence.events.length).toBeGreaterThan(0);
    expect(evidence.events.every((item) => String(item.organization_id) === evidence.organizationId)).toBe(true);
    expect(evidence.events.some((event) => /mercado|marketplace|webhook|automat/i.test(`${event.source || ""} ${event.message || ""}`))).toBe(true);
  });

  test("@release:public-tracking returns the seeded logistics timeline without authentication", async ({ page, request }) => {
    const context = await appContext(page);
    const response = await request.get(`${context.supabaseUrl}/functions/v1/public-tracking?token=${encodeURIComponent(fixtures.trackingToken)}`, {
      headers: { apikey: context.anonKey },
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(String(body.id)).toBe(fixtures.logisticsOrderId);
    expect(body.logistics?.tracking_code).toBeTruthy();
    expect(body.events?.length).toBeGreaterThan(0);
  });

  test("@release:realtime-two-session propagates an order update between browser sessions", async ({ browser, page: pageA }, testInfo) => {
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const runMarker = `release-evidence-${randomUUID()}`;

    try {
      const pageB = await contextB.newPage();
      await login(pageB);
      await runReversibleEvidence({
        cleanupTimeoutMs: CLEANUP_TIMEOUT_MS,
        onCleanupStart: (cleanupTimeoutMs) => testInfo.setTimeout(testInfo.timeout + cleanupTimeoutMs),
        capture: async () => {
          const snapshot = await readPersistedOrder(pageA, fixtures.realtimeOrderId);
          if (!snapshot.updatedAt) throw new Error(`Realtime fixture ${fixtures.realtimeOrderId} has no updated_at baseline.`);
          return {
            ...snapshot,
            mutationNotes: JSON.stringify({
              ...snapshot.metadata,
              internalNotes: `${snapshot.internalNotes}\n[${runMarker}]`.trim(),
            }),
          };
        },
        verifyBaseline: async (snapshot) => {
          await expect.poll(() => pageB.evaluate(async ({ orderId, runMarker, snapshot }) => {
            const { state } = await import("/js/core/state.js");
            const item = state.data.orders.find((order) => String(order.id) === orderId);
            return Boolean(item
              && item.productionStage === snapshot.stage
              && item.updatedAt === snapshot.updatedAt
              && !item.internalNotes.includes(runMarker));
          }, { orderId: fixtures.realtimeOrderId, runMarker, snapshot }), { timeout: 20_000 }).toBe(true);
        },
        mutate: async (snapshot) => updatePersistedOrder(pageA, {
          expected: snapshot,
          notes: snapshot.mutationNotes,
          orderId: fixtures.realtimeOrderId,
          updatedAt: new Date().toISOString(),
        }),
        verifyMutation: async (_snapshot, mutation) => {
          expect(mutation.internalNotes).toContain(runMarker);
          await expect.poll(() => pageB.evaluate(async ({ mutation, orderId, runMarker }) => {
            const { state } = await import("/js/core/state.js");
            const item = state.data.orders.find((order) => String(order.id) === orderId);
            return Boolean(item
              && item.updatedAt === mutation.updatedAt
              && item.internalNotes.includes(runMarker));
          }, { mutation, orderId: fixtures.realtimeOrderId, runMarker }), { timeout: 20_000 }).toBe(true);
        },
        restore: async (snapshot) => restorePersistedOrder(pageA, {
          orderId: fixtures.realtimeOrderId,
          snapshot,
        }),
        verifyRestoration: async (snapshot, restored) => verifyPersistedRestoration(pageA, {
          orderId: fixtures.realtimeOrderId,
          restored,
          snapshot,
        }),
      });
    } finally {
      await contextB.close();
    }
  });
});
