import { useRef, useState } from "react";

import {
  NOTES_EMPTY_MESSAGE,
  NOTES_TAB_INSTANCE_LABEL,
  NOTES_TAB_SERIES_LABEL,
} from "@/lib/labels";

const TABS = [
  { id: "instance", label: NOTES_TAB_INSTANCE_LABEL },
  { id: "series", label: NOTES_TAB_SERIES_LABEL },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function NotesTabs() {
  const [active, setActive] = useState<TabId>("instance");
  const refs = useRef(new Map<TabId, HTMLButtonElement>());

  // APG tabs: arrow keys move focus and activate the focused tab.
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    setActive(next.id);
    refs.current.get(next.id)?.focus();
  };

  return (
    <div>
      <div role="tablist" className="flex gap-4 border-b border-border">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
            }}
            aria-selected={active === tab.id}
            aria-controls={`notes-panel-${tab.id}`}
            id={`notes-tab-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
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
      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`notes-panel-${tab.id}`}
          aria-labelledby={`notes-tab-${tab.id}`}
          hidden={active !== tab.id}
          className="py-3"
        >
          <p className="text-sm text-text-muted italic">
            {NOTES_EMPTY_MESSAGE}
          </p>
        </div>
      ))}
    </div>
  );
}
