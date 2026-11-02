import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRef, useState } from "react";

import { deleteProfile } from "@/api/profiles";
import type { Profile } from "@/api/profiles";
import { serverErrorMessage } from "@/lib/errors";
import { ButtonVariant } from "@/lib/enums";
import {
  CANCEL_BUTTON_LABEL,
  CLOSE_LABEL,
  DELETE_BUTTON_LABEL,
  DELETE_CONFIRM_INPUT_LABEL,
  DELETE_PROFILE_HEADING,
  DELETE_PROFILE_WARNING,
  DELETE_UNDO_WARNING,
  deleteProfileSentence,
} from "@/lib/labels";
import { Button } from "@/shared/ui/Button";
import { Dialog } from "@/shared/ui/Dialog";
import { Field } from "@/shared/ui/Field";
import { IconButton } from "@/shared/ui/IconButton";
import { Input } from "@/shared/ui/Input";

// Composed on Dialog parts rather than ConfirmDialog: the legacy surface
// dismissed on outside press (a real button covering the backdrop), and
// AlertDialog — which ConfirmDialog is built on — never does. Per the
// design doc's per-call-site rule, parity wins. Escape dismissal, the
// focus trap, and focus return now come from the Base UI parts, so the
// hand-rolled keydown listener and the imperative focus effect are gone;
// `initialFocus` lands focus in the confirmation input instead. The
// chrome (max-w-md gap-4 popup, title + icon close header row,
// justify-end footer) mirrors the ConfirmDialog recipe.

interface DeleteProfileDialogProps {
  profile: Profile;
  onClose(): void;
}

export function DeleteProfileDialog({
  profile,
  onClose,
}: Readonly<DeleteProfileDialogProps>) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const required = deleteProfileSentence(profile.name);

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

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Viewport>
          <Dialog.Backdrop />
          <Dialog.Popup className="max-w-md gap-4" initialFocus={inputRef}>
            <div className="flex items-center justify-between">
              <Dialog.Title>{DELETE_PROFILE_HEADING}</Dialog.Title>
              <Dialog.Close
                render={<IconButton icon={X} label={CLOSE_LABEL} />}
              />
            </div>
            {/* The warning keeps the source's full-contrast `text-text`,
                not the muted description recipe. */}
            <Dialog.Description className="text-text">
              {DELETE_PROFILE_WARNING} {DELETE_UNDO_WARNING}
            </Dialog.Description>
            <p className="rounded bg-surface-raised px-3 py-2 font-mono text-sm text-text">
              {required}
            </p>
            <Field.Root>
              <Field.Label>{DELETE_CONFIRM_INPUT_LABEL}</Field.Label>
              <Field.Control
                render={<Input />}
                ref={inputRef}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field.Root>
            {serverError && (
              <p role="alert" className="text-sm text-danger">
                {serverError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Dialog.Close
                render={
                  <Button type="button" variant={ButtonVariant.Secondary}>
                    {CANCEL_BUTTON_LABEL}
                  </Button>
                }
              />
              <Button
                type="button"
                variant={ButtonVariant.Danger}
                disabled={!confirmed || remove.isPending}
                onClick={() => remove.mutate()}
              >
                {DELETE_BUTTON_LABEL}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
