import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  MAX_PROFILE_NAME_LENGTH,
  createProfile,
  currentProfile,
  listProfiles,
  renameProfile,
} from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";

const formatDate = (iso: string) =>
  new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

export function ProfilesSection() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number>();
  const [draft, setDraft] = useState("");
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
      setValidationError("Profile name is required");
      return;
    }
    create.mutate(name);
  };

  const startRename = (profile: { id: number; name: string }) => {
    setValidationError(undefined);
    setEditingId(profile.id);
    setDraft(profile.name);
  };

  const submitRename = (id: number) => {
    setValidationError(undefined);
    if (!draft.trim()) {
      setValidationError("Profile name is required");
      return;
    }
    rename.mutate({ id, name: draft });
  };

  const error =
    validationError ??
    (create.error && errorMessage(create.error)) ??
    (rename.error && errorMessage(rename.error));

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
              {editingId === profile.id ? (
                <>
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(profile.id);
                      if (e.key === "Escape") setEditingId(undefined);
                    }}
                    aria-label={`Rename ${profile.name}`}
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
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(undefined)}
                    className="shrink-0 px-2 py-1 text-xs text-text-muted transition-colors duration-150 ease-out hover:text-text focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="truncate text-sm font-medium text-text">
                    {profile.name}
                  </span>
                  {profile.id === current?.id && (
                    <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                      Current
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
                  Rename
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex items-center gap-3">
        <label htmlFor="profile-name" className="sr-only">
          Profile name
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
          Create profile
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
