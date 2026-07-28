import { defineConfig, devices } from "@playwright/test";

const localHost = "127.0.0.1";
const localPort = 4317;
const localBaseUrl = `http://${localHost}:${localPort}`;
const remoteBaseUrl = process.env.FLOWOPS_REMOTE_E2E_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: remoteBaseUrl || localBaseUrl,
    trace: "retain-on-failure",
  },
  webServer: remoteBaseUrl ? undefined : {
    command: "node server.js",
    env: { HOST: localHost, PORT: String(localPort) },
    reuseExistingServer: false,
    timeout: 30_000,
    url: `${localBaseUrl}/`,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
});
