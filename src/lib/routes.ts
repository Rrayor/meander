import { Inbox, Kanban, Settings, Tag } from "lucide-react";

import { BacklogPage } from "@/pages/BacklogPage";
import { BoardPage } from "@/pages/BoardPage";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { SettingsPage } from "@/pages/SettingsPage";

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
    path: "/categories",
    label: "Categories",
    icon: Tag,
    end: false,
    Component: CategoriesPage,
  },
  {
    path: "/settings",
    label: "Settings",
    icon: Settings,
    end: false,
    Component: SettingsPage,
  },
] as const;
