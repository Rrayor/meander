import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { deleteProfile } from "@/api/profiles";
import type { Profile } from "@/api/profiles";
import { serverErrorMessage } from "@/lib/errors";
import {
  CANCEL_BUTTON_LABEL,
  CLOSE_DIALOG_LABEL,
  CLOSE_LABEL,
  DELETE_BUTTON_LABEL,
  DELETE_CONFIRM_INPUT_LABEL,
  DELETE_PROFILE_HEADING,
  DELETE_PROFILE_WARNING,
  DELETE_UNDO_WARNING,
  deleteProfileSentence,
} from "@/lib/labels";

export function DeleteProfileDialog({
  profile,
  onClose,
}: Readonly<{
  profile: Profile;
  onClose: () => void;
}>) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const required = deleteProfileSentence(profile.name);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remove = useMutation({
    mutationFn: () => deleteProfile(profile.id),
    onSuccess: () => {
      // Everything — tasks, categories, settings — is profile-scoped, so
      // a deletion invalidates the entire cache rather than cherry-picking
      // keys.
      void queryClient.invalidateQueries();
      onClose();
    },
  });

  const confirmed = confirmation === required;
  const serverError = serverErrorMessage(remove.error);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={CLOSE_DIALOG_LABEL}
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60"
      />
      <dialog
        open
        aria-labelledby="delete-profile-title"
        className="relative m-0 flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-surface p-6 text-text shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2
            id="delete-profile-title"
            className="font-title text-lg font-semibold text-text"
          >
            {DELETE_PROFILE_HEADING}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={CLOSE_LABEL}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-text">
          {DELETE_PROFILE_WARNING} {DELETE_UNDO_WARNING}
        </p>
        <p className="rounded bg-surface-raised px-3 py-2 font-mono text-sm text-text">
          {required}
        </p>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="delete-profile-confirm"
            className="text-xs font-medium text-text-muted"
          >
            {DELETE_CONFIRM_INPUT_LABEL}
          </label>
          <input
            ref={inputRef}
            id="delete-profile-confirm"
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {serverError && (
          <p role="alert" className="text-sm text-danger">
            {serverError}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-text transition-colors duration-150 ease-out hover:bg-surface-raised focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {CANCEL_BUTTON_LABEL}
          </button>
          <button
            type="button"
            disabled={!confirmed || remove.isPending}
            onClick={() => remove.mutate()}
            className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 ease-out hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-danger disabled:opacity-50"
          >
            {DELETE_BUTTON_LABEL}
          </button>
        </div>
      </dialog>
    </div>
  );
}
