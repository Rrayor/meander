import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The release binary stores its database next to the executable and reads
// config from XDG_CONFIG_HOME. The sandbox is created once in onPrepare —
// the launcher-only hook — and points the app at a temp copy of the binary
// plus a temp config dir, so smoke writes (categories, profiles) never
// touch the developer's real data.
let sandboxDir: string | undefined;

export const config = {
  runner: "local",
  specs: ["./tests/smoke/**/*.ts"],
  maxInstances: 1,

  onPrepare: (
    _config: unknown,
    capabilities: { "tauri:options"?: { application?: string } }[],
  ) => {
    sandboxDir = mkdtempSync(join(tmpdir(), "meander-smoke-"));
    const appBinary = join(sandboxDir, "meander");
    cpSync("./src-tauri/target/release/meander", appBinary);
    process.env.XDG_CONFIG_HOME = join(sandboxDir, "config");
    const tauriOptions = capabilities[0]?.["tauri:options"];
    if (tauriOptions) tauriOptions.application = appBinary;
    const service = config.services[0][1] as { appBinaryPath?: string };
    service.appBinaryPath = appBinary;
  },

  onComplete: () => {
    if (sandboxDir) rmSync(sandboxDir, { recursive: true, force: true });
  },

  services: [
    [
      "@wdio/tauri-service",
      {
        // cargo-installed tauri-driver + system WebKitWebDriver.
        // Release binary, self-contained: requires `npm run build` plus
        // `cargo build --release --features tauri/custom-protocol` —
        // without the feature the webview loads devUrl instead of dist/.
        // appBinaryPath is injected by onPrepare to point at the sandbox copy.
        driverProvider: "external",
        appBinaryPath: "",
      },
    ],
  ],

  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        // application is injected by onPrepare to point at the sandbox copy.
        application: "",
      },
    },
  ],

  logLevel: "info",
  // A crashed worker (e.g. tauri-service's patchBrowserExecute racing the
  // session handshake) fails the whole spec; retrying gets a fresh session.
  specFileRetries: 2,
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
};
