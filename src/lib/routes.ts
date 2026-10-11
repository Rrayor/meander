import { Inbox, Kanban, Settings } from "lucide-react";

// Relative imports: test runners (Playwright, WebdriverIO) compile this module
// without Vite, so the "@/" alias isn't available to them.
import { BacklogPage } from "../pages/BacklogPage";
import { BoardPage } from "../pages/BoardPage";
import { SettingsPage } from "../pages/SettingsPage";

export const ROUTES = [
  { path: "/", label: "Board", icon: Kanban, end: true, Component: BoardPage },
  {
    path: "/backlog",
    label: "Backlog",
    icon: Inbox,
    end: false,
    Component: BacklogPage,
  },
  {
    path: "/settings",
    label: "Settings",
    icon: Settings,
    end: false,
    Component: SettingsPage,
  },
] as const;
