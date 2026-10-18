import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_CATEGORY_COLOR,
  deleteCategory,
  listCategories,
} from "@/api/categories";
import type { Category } from "@/api/categories";
import { currentProfile } from "@/api/profiles";
import { QUERY_KEYS } from "@/api/queryKeys";
import { DeleteButton } from "@/components/DeleteButton";
import { EditButton } from "@/components/EditButton";
import { CategoryDialog } from "@/features/categories/CategoryDialog";
import {
  ADD_CATEGORY_LABEL,
  CATEGORIES_HEADING,
  CATEGORIES_SUBTITLE,
  EMPTY_CATEGORIES_MESSAGE,
  categoryCreatedLabel,
  deleteCategoryLabel,
  editCategoryLabel,
} from "@/lib/labels";
import { errorMessage, formatDate } from "@/lib/utils";

// A NULL color means "no pick" — the same default the backend stores on
// create. Stored colors are hex values applied inline since they are data,
// not theme tokens.
const UNCOLORED = DEFAULT_CATEGORY_COLOR;

export function CategoriesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category>();
  const queryClient = useQueryClient();
  const { data: categories, error } = useQuery({
    queryKey: QUERY_KEYS.categories,
    queryFn: listCategories,
  });
  const del = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories }),
  });
  const { data: profile } = useQuery({
    queryKey: QUERY_KEYS.currentProfile,
    queryFn: currentProfile,
  });
  // A failed delete belongs to the profile it ran under — clear the
  // mutation on a switch so the alert can't leak across. Only a
  // transition between two resolved ids counts: the first profile load
  // must not clear an error raised while it was still pending.
  const { reset: resetDelete } = del;
  const lastProfileId = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (profile?.id == null) return;
    if (
      lastProfileId.current !== undefined &&
      lastProfileId.current !== profile.id
    ) {
      resetDelete();
      // An open editor is bound to the old profile's category — submitting
      // it now would hit the scoped update as CategoryNotFound.
      setEditing(undefined);
    }
    lastProfileId.current = profile.id;
  }, [profile?.id, resetDelete]);

  return (
    <>
      <header className="flex items-center border-b border-border px-6 py-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">
            {CATEGORIES_HEADING}
          </h1>
          <p className="text-sm text-text-muted">{CATEGORIES_SUBTITLE}</p>
        </div>
      </header>
      <section className="flex-1 overflow-y-auto p-6">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary transition-colors duration-150 ease-out hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {ADD_CATEGORY_LABEL}
          </button>
        </div>
        {(error ?? del.error) && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(error ?? del.error!)}
          </p>
        )}
        {categories?.length === 0 && (
          <p className="py-12 text-center text-sm text-text-muted">
            {EMPTY_CATEGORIES_MESSAGE}
          </p>
        )}
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {categories?.map((category) => (
            <li
              key={category.id}
              className="group flex items-center gap-3 px-4 py-3"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color ?? UNCOLORED }}
              />
              <span className="flex-1 text-sm text-text">{category.title}</span>
              <span className="text-xs text-text-muted">
                {categoryCreatedLabel(formatDate(category.created_at))}
              </span>
              <EditButton
                label={editCategoryLabel(category.title)}
                onEdit={() => setEditing(category)}
              />
              <DeleteButton
                label={deleteCategoryLabel(category.title)}
                disabled={del.isPending}
                onDelete={() => del.mutate(category.id)}
              />
            </li>
          ))}
        </ul>
      </section>
      {dialogOpen && <CategoryDialog onClose={() => setDialogOpen(false)} />}
      {editing && (
        <CategoryDialog
          category={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
