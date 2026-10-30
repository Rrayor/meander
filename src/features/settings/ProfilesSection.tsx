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
import { QUERY_KEYS } from "@/api/queryKeys";
import {
  CANCEL_BUTTON_LABEL,
  CREATE_PROFILE_LABEL,
  CURRENT_PROFILE_LABEL,
  IMPORT_SETTINGS_LABEL,
  PROFILES_HEADING,
  PROFILE_NAME_LABEL,
  PROFILE_NAME_REQUIRED_MESSAGE,
  EDIT_BUTTON_LABEL,
  SAVE_BUTTON_LABEL,
  renameProfileLabel,
} from "@/lib/labels";
import { errorMessage, formatDate } from "@/lib/utils";

export function ProfilesSection() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number>();
  const [draft, setDraft] = useState("");
  const [importSourceId, setImportSourceId] = useState<number>();
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
    <section aria-labelledby="profiles-heading" className="flex flex-col gap-3">
      <h2
        id="profiles-heading"
        className="text-sm font-medium tracking-tight text-text"
      >
        {PROFILES_HEADING}
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
              {editingId === profile.id ? (
                <>
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(profile.id);
                      if (e.key === "Escape") cancelRename();
                    }}
                    aria-label={renameProfileLabel(profile.name)}
                    // Focus moves into the input when the row enters edit
                    // mode — intentional focus management for rename.
                    ref={(el) => el?.focus()}
                    maxLength={MAX_PROFILE_NAME_LENGTH}
                    className="w-40 rounded-md border border-primary bg-surface-raised px-2.5 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => submitRename(profile.id)}
                    disabled={rename.isPending}
                    className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-on-primary transition-colors duration-150 ease-out hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    {SAVE_BUTTON_LABEL}
                  </button>
                  <select
                    aria-label={IMPORT_SETTINGS_LABEL}
                    disabled={importSettings.isPending}
                    defaultValue=""
                    onChange={(e) => {
                      const sourceId = Number(e.target.value);
                      if (sourceId) setImportSourceId(sourceId);
                    }}
                    className="w-36 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs text-text focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="" disabled>
                      {IMPORT_SETTINGS_LABEL}
                    </option>
                    {(profiles ?? [])
                      .filter((p) => p.id !== profile.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={cancelRename}
                    className="shrink-0 px-2 py-1 text-xs text-text-muted transition-colors duration-150 ease-out hover:text-text focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {CANCEL_BUTTON_LABEL}
                  </button>
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
                <button
                  type="button"
                  onClick={() => startRename(profile)}
                  className="text-xs font-medium text-text-muted transition-colors duration-150 ease-out hover:text-text focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {EDIT_BUTTON_LABEL}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex items-center gap-3">
        <label htmlFor="profile-name" className="sr-only">
          {PROFILE_NAME_LABEL}
        </label>
        <input
          id="profile-name"
          type="text"
          maxLength={MAX_PROFILE_NAME_LENGTH}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New profile name"
          className="w-64 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 ease-out hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        >
          {CREATE_PROFILE_LABEL}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
