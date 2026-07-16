const supabaseUrl = (process.env.FLOWOPS_SUPABASE_URL || "https://djvrhvzjvnyensbobtby.supabase.co").replace(/\/$/, "");
const anonKey = process.env.FLOWOPS_SUPABASE_ANON_KEY;
const credentials = [1, 2].map((index) => ({
  email: process.env[`FLOWOPS_RLS_USER_${index}_EMAIL`],
  password: process.env[`FLOWOPS_RLS_USER_${index}_PASSWORD`],
}));
if (!anonKey || credentials.some((item) => !item.email || !item.password)) {
  throw new Error("Configure FLOWOPS_SUPABASE_ANON_KEY e as credenciais FLOWOPS_RLS_USER_1/2_EMAIL/PASSWORD.");
}

async function authenticate({ email, password }) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Falha ao autenticar ${email}: ${data.error_description || data.msg || response.status}`);
  return { email, token: data.access_token };
}

async function rest(user, path) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: { apikey: anonKey, Authorization: `Bearer ${user.token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.message || response.status}`);
  return data;
}

const users = await Promise.all(credentials.map(authenticate));
for (const user of users) {
  const memberships = await rest(user, `organization_members?select=organization_id,user_email,status&user_email=eq.${encodeURIComponent(user.email)}&status=eq.active`);
  if (memberships.length !== 1) throw new Error(`${user.email} precisa pertencer a exatamente uma empresa ativa para o teste.`);
  user.organizationId = memberships[0].organization_id;
}
if (users[0].organizationId === users[1].organizationId) throw new Error("Os dois usuários de auditoria pertencem à mesma empresa.");

const tables = ["orders", "cash_entries", "materials", "marketplace_listings", "marketplace_order_links", "fiscal_documents", "purchase_invoices", "sales_invoices", "integration_jobs"];
for (const user of users) {
  const foreignOrg = users.find((candidate) => candidate !== user).organizationId;
  for (const table of tables) {
    const visible = await rest(user, `${table}?select=organization_id&limit=1000`);
    if (visible.some((row) => row.organization_id !== user.organizationId)) throw new Error(`${table}: ${user.email} visualizou dados de outro tenant.`);
    const foreignRows = await rest(user, `${table}?select=organization_id&organization_id=eq.${foreignOrg}&limit=1`);
    if (foreignRows.length) throw new Error(`${table}: filtro explícito expôs o tenant ${foreignOrg}.`);
  }
}
console.log(`RLS validado em ${tables.length} tabelas para dois tenants distintos.`);
