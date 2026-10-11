import { Inbox, Kanban, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Board", icon: Kanban, end: true },
  { to: "/backlog", label: "Backlog", icon: Inbox, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

export function SideNav() {
  return (
    <aside className="flex h-screen w-56 shrink-0 select-none flex-col justify-between border-r border-border bg-surface p-4">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-1 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight text-text">
              Meander
            </span>
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
              title="Offline"
            />
          </div>
          <span className="text-xs font-medium tracking-tight text-text-muted">
            Offline
          </span>
        </div>
        <nav aria-label="Main Navigation" className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-primary ${
                  isActive
                    ? "bg-surface-raised text-text"
                    : "text-text-muted hover:bg-surface-raised hover:text-text"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`h-[18px] w-[18px] ${isActive ? "text-primary" : ""}`}
                    aria-hidden
                  />
                  <span className={isActive ? "font-medium" : ""}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-transparent bg-surface-raised/40 px-3 py-2 text-text-muted transition-colors duration-150 ease-out hover:border-border hover:bg-surface-raised hover:text-text focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <span className="flex items-center gap-2 truncate">
            <Inbox className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate text-xs font-medium">Default</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
