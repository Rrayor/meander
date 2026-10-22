import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// The default 1s async timeout flakes when the pre-commit gate runs vitest
// alongside the heavier linters — give queries/waitFors real headroom.
configure({ asyncUtilTimeout: 10_000 });
