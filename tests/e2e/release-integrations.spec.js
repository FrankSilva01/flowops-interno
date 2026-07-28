import { test, expect } from "@playwright/test";

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

test.describe("release integration evidence", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });
  test.skip(!hasFixtures, "Configure all FLOWOPS_E2E integration fixture variables.");

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Release integration evidence runs once on desktop.");
    await login(page);
  });

  test("@release:production-transition persists a production stage and propagates it to a second session", async ({ browser, page: pageA }) => {
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    let originalNotes;
    let originalUpdatedAt = "";
    let originalCaptured = false;

    try {
      const pageB = await contextB.newPage();
      await login(pageB);
      const original = await pageA.evaluate(async (orderId) => {
        const { state } = await import("/js/core/state.js");
        const { data, error } = await state.supabase
          .from("orders")
          .select("notes,updated_at")
          .eq("organization_id", state.organizationId)
          .eq("id", orderId)
          .single();
        if (error) throw error;
        return data;
      }, fixtures.productionOrderId);
      originalNotes = original.notes;
      originalUpdatedAt = original.updated_at || "";
      originalCaptured = true;

      let originalMetadata;
      try {
        originalMetadata = JSON.parse(originalNotes || "{}");
      } catch {
        throw new Error(`Production fixture ${fixtures.productionOrderId} has invalid order metadata.`);
      }
      if (!originalMetadata || Array.isArray(originalMetadata) || typeof originalMetadata !== "object") {
        throw new Error(`Production fixture ${fixtures.productionOrderId} has invalid order metadata.`);
      }

      const nextStage = originalMetadata.productionStage === "Imprimindo" ? "Em fila" : "Imprimindo";
      const marker = new Date(Date.now() + 1_000).toISOString();
      await pageA.evaluate(async ({ marker, nextStage, orderId, originalMetadata }) => {
        const { state } = await import("/js/core/state.js");
        const { error } = await state.supabase
          .from("orders")
          .update({
            notes: JSON.stringify({ ...originalMetadata, productionStage: nextStage }),
            updated_at: marker,
          })
          .eq("organization_id", state.organizationId)
          .eq("id", orderId);
        if (error) throw error;
      }, { marker, nextStage, orderId: fixtures.productionOrderId, originalMetadata });

      await expect.poll(() => pageB.evaluate(async ({ nextStage, orderId }) => {
        const { state } = await import("/js/core/state.js");
        return state.data.orders.some((item) => String(item.id) === orderId && item.productionStage === nextStage);
      }, { nextStage, orderId: fixtures.productionOrderId }), { timeout: 20_000 }).toBe(true);
    } finally {
      try {
        if (originalCaptured) {
          await pageA.evaluate(async ({ originalNotes, originalUpdatedAt, orderId }) => {
            const { state } = await import("/js/core/state.js");
            const { error } = await state.supabase
              .from("orders")
              .update({ notes: originalNotes, updated_at: originalUpdatedAt })
              .eq("organization_id", state.organizationId)
              .eq("id", orderId);
            if (error) throw error;
          }, { originalNotes, originalUpdatedAt, orderId: fixtures.productionOrderId });
        }
      } finally {
        await contextB.close();
      }
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

  test("@release:realtime-two-session propagates an order update between browser sessions", async ({ browser, page: pageA }) => {
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageB = await contextB.newPage();
    let originalUpdatedAt = "";

    try {
      await login(pageB);
      originalUpdatedAt = await pageA.evaluate(async (orderId) => {
        const { state } = await import("/js/core/state.js");
        const order = state.data.orders.find((item) => String(item.id) === orderId);
        if (!order) throw new Error(`Realtime fixture order ${orderId} not loaded.`);
        return order.updatedAt || "";
      }, fixtures.realtimeOrderId);

      const marker = new Date(Date.now() + 1_000).toISOString();
      await pageA.evaluate(async ({ marker, orderId }) => {
        const { state } = await import("/js/core/state.js");
        const { error } = await state.supabase.from("orders").update({ updated_at: marker }).eq("organization_id", state.organizationId).eq("id", orderId);
        if (error) throw error;
      }, { marker, orderId: fixtures.realtimeOrderId });

      await expect.poll(() => pageB.evaluate(async ({ marker, orderId }) => {
        const { state } = await import("/js/core/state.js");
        return state.data.orders.some((item) => String(item.id) === orderId && item.updatedAt === marker);
      }, { marker, orderId: fixtures.realtimeOrderId }), { timeout: 20_000 }).toBe(true);
    } finally {
      try {
        if (originalUpdatedAt) {
          await pageA.evaluate(async ({ originalUpdatedAt: timestamp, orderId }) => {
            const { state } = await import("/js/core/state.js");
            const { error } = await state.supabase.from("orders").update({ updated_at: timestamp }).eq("organization_id", state.organizationId).eq("id", orderId);
            if (error) throw error;
          }, { originalUpdatedAt, orderId: fixtures.realtimeOrderId });
        }
      } finally {
        await contextB.close();
      }
    }
  });
});
