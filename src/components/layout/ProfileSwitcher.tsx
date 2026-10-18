import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { currentProfile, listProfiles, switchProfile } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";

export function ProfileSwitcher() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: profiles } = useQuery({
    queryKey: QUERY_KEYS.profiles,
    queryFn: listProfiles,
  });
  const { data: current } = useQuery({
    queryKey: QUERY_KEYS.currentProfile,
    queryFn: currentProfile,
  });
  const select = useMutation({
    mutationFn: switchProfile,
    onSuccess: () => {
      setOpen(false);
      // All cached data is profile-scoped — refetch queries and drop
      // mutation state (e.g. delete errors) so nothing from the old
      // profile leaks into the new one.
      void queryClient.resetQueries();
      queryClient.getMutationCache().clear();
    },
  });

  return (
    // Focus container for blur-out close; all interactive descendants are
    // real buttons with their own keyboard handling.
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      {open && (
        <ul
          role="menu"
          aria-label="Profiles"
          className="absolute bottom-full left-0 mb-1 w-full rounded-lg border border-border bg-surface-raised p-1"
        >
          {(profiles ?? []).map((profile) => (
            <li key={profile.id} role="none">
              <button
                type="button"
                role="menuitem"
                aria-current={profile.id === current?.id ? "true" : undefined}
                onClick={() => select.mutate(profile.id)}
                className="w-full cursor-pointer truncate rounded-md px-3 py-2 text-left text-xs font-medium text-text-muted transition-colors duration-150 ease-out hover:bg-surface hover:text-text aria-[current=true]:text-primary"
              >
                {profile.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-transparent bg-surface-raised/40 px-3 py-2 text-text-muted transition-colors duration-150 ease-out hover:border-border hover:bg-surface-raised hover:text-text focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <span className="flex items-center gap-2 truncate">
          <UserRound className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate text-xs font-medium">
            {current?.name ?? "…"}
          </span>
        </span>
      </button>
    </div>
  );
}
