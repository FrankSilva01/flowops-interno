const stagingRequested = new URLSearchParams(window.location.search).get("env") === "staging"
  || window.location.hostname.includes("flowops-staging");

const productionConfig = {
  SUPABASE_URL: "https://djvrhvzjvnyensbobtby.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqdnJodnpqdm55ZW5zYm9idGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MzU3OTEsImV4cCI6MjA5NjIxMTc5MX0.wZtYdiZ7foUwtutoISaudcoQcIpYYtn3WsykxNmbLr4",
  MERCADO_PAGO_SUBSCRIPTIONS_URL: "https://djvrhvzjvnyensbobtby.functions.supabase.co/mercadopago-subscriptions",
  MERCADO_PAGO_PUBLIC_KEY: "APP_USR-73647550-3282-4fec-82f7-a47dff590816",
  ADMIN_EMAIL: "frankalves333@gmail.com",
  ADMIN_NAME: "Franklin",
  COMPANY_NAME: "3D.AFT",
  ORGANIZATION_ID: "00000000-0000-0000-0000-000000000001",
  REQUIRE_APPROVAL: true,
  APPROVED_EMAILS: ["frankalves333@gmail.com"]
};

const stagingConfig = {
  SUPABASE_URL: "https://dirweeevuheunurnxans.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_XyuRZOUSFoWGAzzE8vhi_g_0EXnIaVK",
  FUNCTIONS_URL: "https://dirweeevuheunurnxans.supabase.co/functions/v1",
  MERCADO_PAGO_SUBSCRIPTIONS_URL: "https://dirweeevuheunurnxans.supabase.co/functions/v1/mercadopago-subscriptions",
  MERCADO_PAGO_PUBLIC_KEY: "",
  ADMIN_EMAIL: "",
  ADMIN_NAME: "Equipe QA",
  COMPANY_NAME: "FlowOps Staging",
  ORGANIZATION_ID: "",
  REQUIRE_APPROVAL: false,
  APPROVED_EMAILS: [],
  ENVIRONMENT: "staging"
};

window.SUPABASE_CONFIG = stagingRequested ? stagingConfig : { ...productionConfig, ENVIRONMENT: "production" };
