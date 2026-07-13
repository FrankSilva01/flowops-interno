type SupabaseAdmin = {
  auth: { getUser: (token: string) => Promise<{ data: any; error: any }> };
  from: (table: string) => any;
};

const EDITOR_ROLES = new Set(["administrador", "admin", "owner", "edicao", "edição", "editor"]);
const ADMIN_ROLES = new Set(["administrador", "admin", "owner"]);

export type OrgAccess = {
  email: string;
  organizationId: string;
  role: string;
};

function normalizeRole(role: unknown) {
  return String(role || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function requireAuthenticatedUser(req: Request, supabase: SupabaseAdmin) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Autenticacao obrigatoria.");
  const { data, error } = await supabase.auth.getUser(token);
  const email = String(data?.user?.email || "").toLowerCase();
  if (error || !email) throw new Error("Sessao invalida.");
  return { email, user: data.user };
}

export async function requireOrgMember(
  req: Request,
  supabase: SupabaseAdmin,
  organizationIdInput = "",
): Promise<OrgAccess> {
  const user = await requireAuthenticatedUser(req, supabase);
  const requestedOrganization = organizationIdInput || new URL(req.url).searchParams.get("organization_id") || "";
  let query = supabase
    .from("organization_members")
    .select("organization_id,role,status")
    .eq("user_email", user.email)
    .eq("status", "active")
    .limit(1);
  if (requestedOrganization) query = query.eq("organization_id", requestedOrganization);
  const { data, error } = await query;
  if (error) throw error;
  const membership = data?.[0];
  if (!membership?.organization_id) throw new Error("Usuario sem acesso a esta empresa.");
  return {
    email: user.email,
    organizationId: membership.organization_id,
    role: normalizeRole(membership.role),
  };
}

export async function requireOrgEditor(
  req: Request,
  supabase: SupabaseAdmin,
  organizationIdInput = "",
) {
  const access = await requireOrgMember(req, supabase, organizationIdInput);
  if (!EDITOR_ROLES.has(access.role)) throw new Error("Permissao de edicao obrigatoria.");
  return access;
}

export async function requireOrgAdmin(
  req: Request,
  supabase: SupabaseAdmin,
  organizationIdInput = "",
) {
  const access = await requireOrgMember(req, supabase, organizationIdInput);
  if (!ADMIN_ROLES.has(access.role)) throw new Error("Permissao de administrador obrigatoria.");
  return access;
}

export async function requirePlatformAdmin(req: Request, supabase: SupabaseAdmin) {
  const user = await requireAuthenticatedUser(req, supabase);
  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_email,role")
    .eq("user_email", user.email)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Apenas admin master pode executar esta acao.");
  return { email: user.email, role: String(data.role || "admin").toLowerCase() };
}
