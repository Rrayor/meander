import { createHashRouter } from "react-router-dom";

import { AppShell } from "@/layout/AppShell";
import { ROUTES } from "@/lib/routes";

// Hash router: Tauri production builds serve the app from a custom protocol
// and can't resolve deep links like /backlog.
export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: ROUTES.map(({ path, end, Component }) =>
      end
        ? { index: true, element: <Component /> }
        : { path, element: <Component /> },
    ),
  },
]);
