import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";

import {
  DEFAULT_CATEGORY_COLOR,
  createCategory,
  listCategories,
} from "@/api/categories";
import type { Category } from "@/api/categories";
import { QUERY_KEYS } from "@/api/queryKeys";
import { serverErrorMessage } from "@/lib/errors";
import {
  CATEGORY_SEARCH_LABEL,
  createCategoryOptionLabel,
  removeTaskCategoryLabel,
} from "@/lib/labels";
import { unicodeTrim } from "@/lib/utils";

interface CategoryMultiSelectProps {
  idPrefix: string;
  selected: Category[];
  onChange: (next: Category[]) => void;
}

// Spec: a multivalue autocomplete — the input filters all categories, empty
// input lists everything, and a trailing option creates a new category with
// the typed title (quick-create; color/description editable later from the
// categories view).
export function CategoryMultiSelect({
  idPrefix,
  selected,
  onChange,
}: Readonly<CategoryMultiSelectProps>) {
  const queryClient = useQueryClient();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Lazy: fetching on mount would make every host dialog issue the query
  // even when the optional field is never touched.
  const { data: categories } = useQuery({
    queryKey: QUERY_KEYS.categories,
    queryFn: listCategories,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: createCategory,
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories });
      onChange([...selected, created]);
      setQuery("");
      setActiveIndex(-1);
    },
  });

  const selectedIds = new Set(selected.map((c) => c.id));
  const needle = unicodeTrim(query).toLowerCase();
  const options = (categories ?? []).filter(
    (c) => needle === "" || c.title.toLowerCase().includes(needle),
  );
  const exactMatch = (categories ?? []).some(
    (c) => c.title.toLowerCase() === needle,
  );
  const canCreate = needle !== "" && !exactMatch;
  const optionCount = options.length + (canCreate ? 1 : 0);

  const toggle = (category: Category) => {
    onChange(
      selectedIds.has(category.id)
        ? selected.filter((c) => c.id !== category.id)
        : [...selected, category],
    );
  };

  const optionId = (index: number) => `${idPrefix}-option-${index}`;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (open) {
        // Closing the dropdown shouldn't dismiss the whole task dialog.
        e.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => {
        const next =
          e.key === "ArrowDown"
            ? (i + 1) % Math.max(optionCount, 1)
            : (i - 1 + optionCount) % Math.max(optionCount, 1);
        return next;
      });
      return;
    }
    if (e.key === "Backspace" && query === "" && selected.length > 0) {
      // Token-field convention: Backspace on an empty input removes the
      // last chip.
      onChange(selected.slice(0, -1));
      return;
    }
    if (e.key === "Enter" && open && activeIndex >= 0) {
      e.preventDefault();
      if (activeIndex < options.length) {
        const option = options[activeIndex];
        if (option) toggle(option);
      } else {
        create.mutate({
          title: unicodeTrim(query),
          description: null,
          color: null,
        });
      }
    }
  };

  const error = serverErrorMessage(create.error);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        {/* Token field: chips live inside the same bordered box as the
            input — the whole surface focuses the input on click. Keyboard
            users Tab straight into the input, so the wrapper is
            pointer-only by design. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click-to-focus convenience; the real control is the combobox inside */}
        <div
          className="flex min-h-[42px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface-raised p-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary"
          onClick={() => inputRef.current?.focus()}
        >
          {selected.map((category) => {
            const color = category.color ?? DEFAULT_CATEGORY_COLOR;
            return (
              <span
                key={category.id}
                className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `${color}26`,
                  color,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                {category.title}
                <button
                  type="button"
                  aria-label={removeTaskCategoryLabel(category.title)}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(category);
                  }}
                  className="flex items-center justify-center hover:opacity-75 focus:outline-none"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            id={`${idPrefix}-categories`}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={
              activeIndex >= 0 ? optionId(activeIndex) : undefined
            }
            aria-autocomplete="list"
            aria-label={CATEGORY_SEARCH_LABEL}
            placeholder={CATEGORY_SEARCH_LABEL}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className="min-w-[120px] flex-1 border-0 bg-transparent p-0 text-sm text-text outline-none placeholder:text-text-muted/60 focus:outline-none focus:ring-0"
          />
        </div>
        {open && optionCount > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-multiselectable="true"
            className="absolute z-10 mt-1 flex w-full flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl"
          >
            {options.map((category, index) => {
              const isSelected = selectedIds.has(category.id);
              return (
                <li
                  key={category.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  // mousedown precedes blur, so selection works before the
                  // input's onBlur closes the list.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    toggle(category);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm text-text transition-colors hover:bg-surface ${
                    index === activeIndex ? "bg-surface" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          category.color ?? DEFAULT_CATEGORY_COLOR,
                      }}
                      aria-hidden="true"
                    />
                    {category.title}
                  </span>
                  {isSelected && (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-primary"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </li>
              );
            })}
            {canCreate && (
              <li
                id={optionId(options.length)}
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  create.mutate({
                    title: unicodeTrim(query),
                    description: null,
                    color: null,
                  });
                }}
                onMouseEnter={() => setActiveIndex(options.length)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface ${
                  activeIndex === options.length ? "bg-surface" : ""
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {createCategoryOptionLabel(unicodeTrim(query))}
              </li>
            )}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
