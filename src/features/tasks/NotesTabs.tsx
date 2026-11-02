import { NoteList } from "@/features/tasks/NoteList";
import { NotesTab } from "@/lib/enums";
import { NOTES_TAB_INSTANCE_LABEL, NOTES_TAB_SERIES_LABEL } from "@/lib/labels";
import { Tabs } from "@/shared/ui/Tabs";

const TABS = [
  { id: NotesTab.Instance, label: NOTES_TAB_INSTANCE_LABEL },
  { id: NotesTab.Series, label: NOTES_TAB_SERIES_LABEL },
] as const;

// The instance/series note tabs on a series task's details view. APG
// tab semantics (roving tabindex, arrow-key move-and-activate, linked
// panels) come from the shared Tabs parts; `activateOnFocus` keeps the
// source behavior where arrows switch the tab, and `keepMounted` keeps
// the inactive panel's NoteList alive so a typed draft isn't dropped by
// a tab round-trip.
export function NotesTabs({
  taskId,
  seriesId,
}: Readonly<{
  taskId: number;
  seriesId: number;
}>) {
  return (
    <Tabs.Root defaultValue={NotesTab.Instance}>
      <Tabs.List activateOnFocus>
        {TABS.map((tab) => (
          <Tabs.Tab key={tab.id} value={tab.id}>
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {TABS.map((tab) => (
        <Tabs.Panel key={tab.id} value={tab.id} keepMounted>
          {/* Keyed by the target id: switching to another instance remounts
              the list, so a draft or inline edit can never be saved against
              the newly selected instance. */}
          <NoteList
            key={tab.id === NotesTab.Instance ? taskId : seriesId}
            target={tab.id === NotesTab.Instance ? { taskId } : { seriesId }}
          />
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
