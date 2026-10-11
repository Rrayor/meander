export const config = {
  runner: "local",
  specs: ["./tests/smoke/**/*.ts"],
  maxInstances: 1,

  services: [
    [
      "@wdio/tauri-service",
      {
        // cargo-installed tauri-driver + system WebKitWebDriver.
        // Release binary, self-contained: requires `npm run build` plus
        // `cargo build --release --features tauri/custom-protocol` —
        // without the feature the webview loads devUrl instead of dist/.
        driverProvider: "external",
        appBinaryPath: "./src-tauri/target/release/meander",
      },
    ],
  ],

  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: "./src-tauri/target/release/meander",
      },
    },
  ],

  logLevel: "info",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
};
