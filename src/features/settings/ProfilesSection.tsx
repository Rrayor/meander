import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  MAX_PROFILE_NAME_LENGTH,
  createProfile,
  currentProfile,
  listProfiles,
  importProfileSettings,
  renameProfile,
} from "@/api/profiles";
import type { Profile } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { DeleteProfileDialog } from "@/features/settings/DeleteProfileDialog";
import { ButtonVariant, ComponentSize } from "@/lib/enums";
import {
  CANCEL_BUTTON_LABEL,
  CREATE_PROFILE_LABEL,
  CURRENT_PROFILE_LABEL,
  IMPORT_SETTINGS_LABEL,
  PROFILES_HEADING,
  PROFILES_HEADING_ID,
  PROFILES_HINT,
  PROFILE_NAME_LABEL,
  PROFILE_NAME_REQUIRED_MESSAGE,
  DELETE_BUTTON_LABEL,
  EDIT_BUTTON_LABEL,
  deleteProfileLabel,
  SAVE_BUTTON_LABEL,
  renameProfileLabel,
} from "@/lib/labels";
import { errorMessage, formatDate } from "@/lib/utils";
import { SettingsSection } from "@/shared/patterns/SettingsSection";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";
import { Select } from "@/shared/ui/Select";

export function ProfilesSection() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number>();
  const [draft, setDraft] = useState("");
  const [importSourceId, setImportSourceId] = useState<number>();
  const [deleting, setDeleting] = useState<Profile | undefined>();
  const [validationError, setValidationError] = useState<string>();

  const { data: profiles } = useQuery({
    queryKey: QUERY_KEYS.profiles,
    queryFn: listProfiles,
  });
  const { data: current } = useQuery({
    queryKey: QUERY_KEYS.currentProfile,
    queryFn: currentProfile,
  });
  const create = useMutation({
    mutationFn: createProfile,
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
    },
  });
  const importSettings = useMutation({
    mutationFn: ({ id, sourceId }: { id: number; sourceId: number }) =>
      importProfileSettings(id, sourceId),
    onSuccess: () => {
      // Imported settings touch every profile-scoped query.
      void queryClient.invalidateQueries();
    },
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renameProfile(id, name),
    onSuccess: () => {
      setEditingId(undefined);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.profiles });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.currentProfile,
      });
    },
  });

  const submit = (event: React.SyntheticEvent) => {
    event.preventDefault();
    setValidationError(undefined);
    if (!name.trim()) {
      setValidationError(PROFILE_NAME_REQUIRED_MESSAGE);
      return;
    }
    create.mutate(name);
  };

  const startRename = (profile: { id: number; name: string }) => {
    setValidationError(undefined);
    setImportSourceId(undefined);
    setEditingId(profile.id);
    setDraft(profile.name);
  };

  const cancelRename = () => {
    setImportSourceId(undefined);
    setEditingId(undefined);
  };

  const submitRename = (id: number) => {
    setValidationError(undefined);
    if (!draft.trim()) {
      setValidationError(PROFILE_NAME_REQUIRED_MESSAGE);
      return;
    }
    rename.mutate({ id, name: draft });
    // §404: the import applies on Save like the rename — selecting a
    // source only stages it, so Cancel still discards the choice.
    if (importSourceId != null) {
      importSettings.mutate({ id, sourceId: importSourceId });
      setImportSourceId(undefined);
    }
  };

  const error =
    validationError ??
    (create.error && errorMessage(create.error)) ??
    (rename.error && errorMessage(rename.error)) ??
    (importSettings.error && errorMessage(importSettings.error));

  return (
    <SettingsSection
      title={PROFILES_HEADING}
      id={PROFILES_HEADING_ID}
      description={PROFILES_HINT}
    >
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-1">
          {(profiles ?? []).map((profile) => {
            // The profile being renamed is never offered as an import
            // source — `items` feeds Select.Value the picked label.
            const sourceOptions = (profiles ?? [])
              .filter((p) => p.id !== profile.id)
              .map((p) => ({ value: p.id, label: p.name }));
            return (
              <li
                key={profile.id}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors duration-150 ease-out hover:bg-surface-raised"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {editingId === profile.id ? (
                    <>
                      <Input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(profile.id);
                          if (e.key === "Escape") cancelRename();
                        }}
                        aria-label={renameProfileLabel(profile.name)}
                        // Focus moves into the input when the row enters
                        // edit mode — intentional focus management for
                        // rename.
                        ref={(el) => el?.focus()}
                        maxLength={MAX_PROFILE_NAME_LENGTH}
                        className="w-40 border-primary px-2.5 py-1"
                      />
                      <Button
                        type="button"
                        size={ComponentSize.Sm}
                        onClick={() => submitRename(profile.id)}
                        disabled={rename.isPending}
                        className="shrink-0 px-2.5 py-1 text-xs font-medium"
                      >
                        {SAVE_BUTTON_LABEL}
                      </Button>
                      <Select.Root
                        items={sourceOptions}
                        value={importSourceId ?? null}
                        onValueChange={(sourceId) =>
                          setImportSourceId(sourceId ?? undefined)
                        }
                        disabled={importSettings.isPending}
                      >
                        <Select.Trigger
                          aria-label={IMPORT_SETTINGS_LABEL}
                          className="w-36 px-2 py-1 text-xs"
                        >
                          <Select.Value placeholder={IMPORT_SETTINGS_LABEL} />
                          <Select.Icon />
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Positioner>
                            <Select.Popup>
                              {sourceOptions.map((option) => (
                                <Select.Item
                                  key={option.value}
                                  value={option.value}
                                >
                                  <Select.ItemText>
                                    {option.label}
                                  </Select.ItemText>
                                  <Select.ItemIndicator />
                                </Select.Item>
                              ))}
                            </Select.Popup>
                          </Select.Positioner>
                        </Select.Portal>
                      </Select.Root>
                      <Button
                        type="button"
                        variant={ButtonVariant.Ghost}
                        size={ComponentSize.Sm}
                        onClick={cancelRename}
                        className="shrink-0 px-2 py-1 text-xs hover:bg-transparent"
                      >
                        {CANCEL_BUTTON_LABEL}
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="truncate text-sm font-medium text-text">
                        {profile.name}
                      </span>
                      {profile.id === current?.id && (
                        <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                          {CURRENT_PROFILE_LABEL}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-text-muted">
                    Created {formatDate(profile.created_at)} · Updated{" "}
                    {formatDate(profile.updated_at)}
                  </span>
                  {editingId !== profile.id && (
                    <Button
                      type="button"
                      variant={ButtonVariant.Ghost}
                      size={ComponentSize.Sm}
                      onClick={() => startRename(profile)}
                      className="px-2 py-1 text-xs hover:bg-transparent"
                    >
                      {EDIT_BUTTON_LABEL}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={ButtonVariant.Ghost}
                    size={ComponentSize.Sm}
                    onClick={() => setDeleting(profile)}
                    aria-label={deleteProfileLabel(profile.name)}
                    className="px-2 py-1 text-xs hover:bg-transparent hover:text-danger"
                  >
                    {DELETE_BUTTON_LABEL}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <form onSubmit={submit} className="flex items-center gap-3">
          <label htmlFor="profile-name" className="sr-only">
            {PROFILE_NAME_LABEL}
          </label>
          <Input
            id="profile-name"
            type="text"
            maxLength={MAX_PROFILE_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New profile name"
            className="w-64"
          />
          <Button
            type="submit"
            disabled={create.isPending}
            className="shrink-0"
          >
            {CREATE_PROFILE_LABEL}
          </Button>
        </form>
        {deleting && (
          <DeleteProfileDialog
            profile={deleting}
            onClose={() => setDeleting(undefined)}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
