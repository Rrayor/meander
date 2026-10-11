# Troubleshooting

Environment- and tooling-specific issues that don't belong in the feature docs.

## Stitch MCP

### `upload_design_md` returns "Request contains an invalid argument"

**Symptom:** Calling the `upload_design_md` MCP tool fails with
`Request contains an invalid argument`, whether `projectId` is passed as the
bare ID or the full `projects/{id}` resource name — even though those are the
only two required parameters.

**Workaround:** Upload `DESIGN.md` (or images/HTML) with the upload script
from the `upload-to-stitch` skill instead. It posts the file to the Stitch API
directly, bypassing the MCP tool:

```bash
python3 <plugin-dir>/skills/upload-to-stitch/scripts/upload_to_stitch.py \
  --project-id <PROJECT_ID> \
  --file-path .stitch/DESIGN.md \
  --api-key <API_KEY> \
  --generated-by devin
```

The plugin dir is under
`~/.local/share/devin/cli/plugins/cache/github.com_google-labs-code_stitch-skills_plugins_stitch-design-*/`.
The API key is the `X-Goog-Api-Key` header in
`.devin/mcp_config.local.json`.

After the upload returns a `screenInstances` entry, finish setup with the
`create_design_system_from_design_md` MCP tool — that tool works.

_Observed 2026-10-11 during milestone 2 (step 9)._

## WebdriverIO / tauri-driver

### "Direct eval HTTP error: 404 Not Found" warnings during smoke tests

**Symptom:** `npm run test:smoke` works, but the tauri-service logs repeated
warnings: `Failed to get window states: Error: Direct eval HTTP error: 404`.

**Status:** Cosmetic on Fedora with the `webkitgtk6.0` WebKitWebDriver driving
our webkit2gtk-4.1 webview — window-state inspection calls aren't supported by
the driver, but element queries and clicks work fine. If commands themselves
start failing (not just warnings), suspect a real protocol/build mismatch —
see `docs/testing.md` for the `tauri/custom-protocol` build requirement.
