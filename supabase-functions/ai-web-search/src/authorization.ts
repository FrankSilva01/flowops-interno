type SupabaseAdmin = {
  auth: { getUser: (token: string) => Promise<{ data: any; error: any }> };
  from: (table: string) => any;
};

export class OrganizationAuthorizationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OrganizationAuthorizationError";
    this.status = status;
  }
}

export async function authorizeOrganizationRequest(
  req: Request,
  organizationId: string,
  supabase: SupabaseAdmin,
) {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) throw new OrganizationAuthorizationError("autenticacao obrigatoria", 401);
  if (!organizationId) throw new OrganizationAuthorizationError("organization_id obrigatorio", 400);

  const { data, error } = await supabase.auth.getUser(token);
  const email = String(data?.user?.email || "").trim().toLowerCase();
  if (error || !email) throw new OrganizationAuthorizationError("sessao invalida", 401);

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id,role,status")
    .eq("organization_id", organizationId)
    .eq("user_email", email)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new OrganizationAuthorizationError("usuario sem acesso a esta empresa", 403);

  return { email, organizationId, role: String(membership.role || "") };
}
