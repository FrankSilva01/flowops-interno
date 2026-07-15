import { adminClient } from "./marketplace.ts";

export type MarketplaceDocumentArchiveInput = {
  organizationId: string;
  marketplace: string;
  externalOrderId: string;
  internalOrderId?: string | null;
  documentType: string;
  externalDocumentId?: string | null;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
  rawPayload?: unknown;
};

export async function archiveMarketplaceDocument(input: MarketplaceDocumentArchiveInput) {
  const supabase = adminClient();
  const checksum = await sha256Hex(input.bytes);
  const { data: current, error: currentError } = await supabase
    .from("marketplace_documents")
    .select("version,checksum_sha256,storage_path")
    .eq("organization_id", input.organizationId)
    .eq("marketplace", input.marketplace)
    .eq("external_order_id", input.externalOrderId)
    .eq("document_type", input.documentType)
    .maybeSingle();
  if (currentError) throw currentError;
  if (current?.checksum_sha256 === checksum && current.storage_path) {
    return {
      storage_path: current.storage_path,
      size_bytes: input.bytes.byteLength,
      checksum_sha256: checksum,
      version: Number(current.version || 1),
      verified_at: new Date().toISOString(),
    };
  }

  const version = Number(current?.version || 0) + 1;
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const storagePath = `${input.organizationId}/${normalizePath(input.marketplace)}/${input.externalOrderId}/v${version}-${checksum.slice(0, 12)}/${safeName}`;
  const { error: storageError } = await supabase.storage.from("marketplace-documents").upload(
    storagePath,
    new Blob([input.bytes], { type: input.mimeType }),
    { contentType: input.mimeType, upsert: false },
  );
  if (storageError && !String(storageError.message || "").toLowerCase().includes("already exists")) throw storageError;
  const { error: versionError } = await supabase.from("marketplace_document_versions").upsert({
    organization_id: input.organizationId,
    marketplace: input.marketplace,
    external_order_id: input.externalOrderId,
    internal_order_id: input.internalOrderId || null,
    document_type: input.documentType,
    version,
    storage_path: storagePath,
    file_name: input.fileName,
    mime_type: input.mimeType,
    size_bytes: input.bytes.byteLength,
    checksum_sha256: checksum,
    external_document_id: input.externalDocumentId || null,
    source: "mercado-livre",
    raw_payload: input.rawPayload || null,
  }, { onConflict: "organization_id,marketplace,external_order_id,document_type,version" });
  if (versionError) throw versionError;
  return {
    storage_path: storagePath,
    size_bytes: input.bytes.byteLength,
    checksum_sha256: checksum,
    version,
    verified_at: new Date().toISOString(),
  };
}

export async function recordMarketplaceDocumentDownload(input: {
  organizationId: string;
  actorEmail: string;
  externalOrderId: string;
  internalOrderId?: string | null;
  documentType: string;
  source: "marketplace" | "private-cache";
  checksum?: string | null;
}) {
  await adminClient().from("audit_events").insert({
    organization_id: input.organizationId,
    actor_email: input.actorEmail,
    action: "marketplace_document_download",
    entity_type: "marketplace_document",
    entity_id: `${input.externalOrderId}:${input.documentType}`,
    order_code: input.internalOrderId || null,
    source: "marketplace",
    metadata: {
      external_order_id: input.externalOrderId,
      document_type: input.documentType,
      document_source: input.source,
      checksum_sha256: input.checksum || null,
    },
  });
}

export async function verifyMarketplaceDocument(bytes: ArrayBuffer, expectedChecksum?: string | null) {
  if (!expectedChecksum) return true;
  return await sha256Hex(bytes) === expectedChecksum;
}

export async function adoptCachedMarketplaceDocument(input: {
  organizationId: string;
  marketplace: string;
  externalOrderId: string;
  internalOrderId?: string | null;
  documentType: string;
  storagePath: string;
  fileName: string;
  mimeType?: string | null;
  version?: number | null;
  bytes: ArrayBuffer;
}) {
  const supabase = adminClient();
  const checksum = await sha256Hex(input.bytes);
  const version = Number(input.version || 1);
  await supabase.from("marketplace_document_versions").upsert({
    organization_id: input.organizationId,
    marketplace: input.marketplace,
    external_order_id: input.externalOrderId,
    internal_order_id: input.internalOrderId || null,
    document_type: input.documentType,
    version,
    storage_path: input.storagePath,
    file_name: input.fileName,
    mime_type: input.mimeType || "application/octet-stream",
    size_bytes: input.bytes.byteLength,
    checksum_sha256: checksum,
    source: "flowops-legacy-cache",
  }, { onConflict: "organization_id,marketplace,external_order_id,document_type,version" });
  await supabase.from("marketplace_documents").update({
    checksum_sha256: checksum,
    version,
    size_bytes: input.bytes.byteLength,
    verified_at: new Date().toISOString(),
  }).eq("organization_id", input.organizationId)
    .eq("marketplace", input.marketplace)
    .eq("external_order_id", input.externalOrderId)
    .eq("document_type", input.documentType);
  return checksum;
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizePath(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
}
