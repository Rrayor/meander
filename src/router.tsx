import { createHashRouter } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { BacklogPage } from "@/pages/BacklogPage";
import { BoardPage } from "@/pages/BoardPage";
import { SettingsPage } from "@/pages/SettingsPage";

// Hash router: Tauri production builds serve the app from a custom protocol
// and can't resolve deep links like /backlog.
export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <BoardPage /> },
      { path: "backlog", element: <BacklogPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
