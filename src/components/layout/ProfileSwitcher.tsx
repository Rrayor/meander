import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { useRef, useState } from "react";

import { currentProfile, listProfiles, switchProfile } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";

export function ProfileSwitcher() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.currentProfile,
      });
    },
  });

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      {open && (
        <ul
          role="listbox"
          aria-label="Profiles"
          className="absolute bottom-full left-0 mb-1 w-full rounded-lg border border-border bg-surface-raised p-1"
        >
          {(profiles ?? []).map((profile) => (
            <li
              key={profile.id}
              role="option"
              aria-selected={profile.id === current?.id}
              tabIndex={-1}
              onClick={() => select.mutate(profile.id)}
              className="cursor-pointer truncate rounded-md px-3 py-2 text-xs font-medium text-text-muted transition-colors duration-150 ease-out hover:bg-surface hover:text-text aria-selected:text-primary"
            >
              {profile.name}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        aria-haspopup="listbox"
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
