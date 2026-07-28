const requiredCredentials = [
  "FLOWOPS_E2E_EMAIL",
  "FLOWOPS_E2E_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const missingCredentials = requiredCredentials.filter((name) => !process.env[name]?.trim());

if (missingCredentials.length) {
  console.error(`Release blocked: missing required credentials: ${missingCredentials.join(", ")}.`);
  process.exit(1);
}

console.log("Release prerequisites are present.");
