import { useState } from "react";

import {
  NOTES_EMPTY_MESSAGE,
  NOTES_TAB_INSTANCE_LABEL,
  NOTES_TAB_SERIES_LABEL,
} from "@/lib/labels";

const TABS = [
  { id: "instance", label: NOTES_TAB_INSTANCE_LABEL },
  { id: "series", label: NOTES_TAB_SERIES_LABEL },
] as const;

export function NotesTabs() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("instance");
  const activeTab = TABS.find((t) => t.id === active)!;

  return (
    <div>
      <div role="tablist" className="flex gap-4 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`notes-panel-${tab.id}`}
            id={`notes-tab-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${
              active === tab.id
                ? "border-primary font-medium text-primary"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`notes-panel-${activeTab.id}`}
        aria-labelledby={`notes-tab-${activeTab.id}`}
        className="py-3"
      >
        <p className="text-sm text-text-muted italic">{NOTES_EMPTY_MESSAGE}</p>
      </div>
    </div>
  );
}
