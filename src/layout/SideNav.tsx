import { cn } from "cn";
import { NavLink } from "react-router-dom";

import { ProfileSwitcher } from "@/layout/ProfileSwitcher";
import { NAV_LABEL } from "@/lib/labels";
import { ROUTES } from "@/lib/routes";

export function SideNav() {
  return (
    <aside className="flex h-screen w-56 shrink-0 select-none flex-col justify-between border-r border-border bg-surface p-4">
      <div className="flex flex-col gap-6">
        <div className="px-1 pt-1">
          <span className="text-base font-semibold tracking-tight text-text">
            Meander
          </span>
        </div>
        <nav aria-label={NAV_LABEL} className="flex flex-col gap-1">
          {ROUTES.map(({ path, label, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-primary",
                  isActive
                    ? "bg-surface-raised text-text"
                    : "text-text-muted hover:bg-surface-raised hover:text-text",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px]",
                      isActive && "text-primary",
                    )}
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
        <ProfileSwitcher />
      </div>
    </aside>
  );
}
