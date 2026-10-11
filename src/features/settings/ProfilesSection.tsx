import { useQuery } from "@tanstack/react-query";

import { currentProfile, listProfiles } from "@/api/profiles";

const formatDate = (iso: string) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

export function ProfilesSection() {
  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: listProfiles,
  });
  const { data: current } = useQuery({
    queryKey: ["current-profile"],
    queryFn: currentProfile,
  });

  return (
    <section aria-labelledby="profiles-heading" className="flex flex-col gap-3">
      <h2
        id="profiles-heading"
        className="text-sm font-medium tracking-tight text-text"
      >
        Profiles
      </h2>
      <p className="text-sm text-text-muted">
        Each profile has its own tasks and settings.
      </p>
      <ul className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-1">
        {(profiles ?? []).map((profile) => (
          <li
            key={profile.id}
            className="flex items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors duration-150 ease-out hover:bg-surface-raised"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-text">
                {profile.name}
              </span>
              {profile.id === current?.id && (
                <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                  Current
                </span>
              )}
            </div>
            <span className="shrink-0 text-xs text-text-muted">
              Created {formatDate(profile.created_at)} · Updated{" "}
              {formatDate(profile.updated_at)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
