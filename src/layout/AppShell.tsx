import { Outlet } from "react-router-dom";

import { SideNav } from "@/layout/SideNav";

export function AppShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <SideNav />
      <main className="flex h-screen flex-1 flex-col overflow-hidden bg-background">
        <Outlet />
      </main>
    </div>
  );
}
