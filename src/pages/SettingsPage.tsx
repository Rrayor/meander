import { useQuery } from "@tanstack/react-query";

import { currentProfile } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { currentDatabasePath } from "@/api/settings";
import { DatabaseSection } from "@/features/settings/DatabaseSection";
import { WeekStartSection } from "@/features/settings/WeekStartSection";
import { WorkDaysSection } from "@/features/settings/WorkDaysSection";
import { ProfilesSection } from "@/features/settings/ProfilesSection";

export function SettingsPage() {
  // Profile-scoped sections hold unsaved drafts in local state — keying
  // them to the active profile + database remounts on a context switch so
  // a draft can't leak into another profile (or database).
  const { data: profile } = useQuery({
    queryKey: QUERY_KEYS.currentProfile,
    queryFn: currentProfile,
  });
  const { data: dbPath } = useQuery({
    queryKey: QUERY_KEYS.dbPath,
    queryFn: currentDatabasePath,
  });
  const contextKey = `${dbPath ?? ""}:${profile?.id ?? ""}`;

  return (
    <>
      <header className="flex items-center border-b border-border px-6 py-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          Settings
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex max-w-3xl flex-col gap-8">
          <ProfilesSection />
          <WeekStartSection key={`week-start-${contextKey}`} />
          <WorkDaysSection key={`work-days-${contextKey}`} />
          <DatabaseSection />
        </div>
      </div>
    </>
  );
}
