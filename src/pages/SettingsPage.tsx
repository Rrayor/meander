import { DatabaseSection } from "@/features/settings/DatabaseSection";
import { WeekStartSection } from "@/features/settings/WeekStartSection";
import { ProfilesSection } from "@/features/settings/ProfilesSection";

export function SettingsPage() {
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
          <WeekStartSection />
          <DatabaseSection />
        </div>
      </div>
    </>
  );
}
