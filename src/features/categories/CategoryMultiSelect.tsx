import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";

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
import { Combobox } from "@/shared/ui/Combobox";

interface CategoryMultiSelectProps {
  idPrefix: string;
  selected: Category[];
  onChange: (next: Category[]) => void;
  disabled?: boolean;
}

// The trailing "Create …" row is a list member like any other option —
// keyboard highlight and aria-activedescendant reach it — but it is not a
// real selection: `onValueChange` intercepts it and quick-creates instead.
interface CreateOption {
  readonly create: true;
}
const CREATE_OPTION: CreateOption = { create: true };
type OptionItem = Category | CreateOption;
const isCreateOption = (v: OptionItem): v is CreateOption => "create" in v;

// Base UI's close reason for "an item was picked". Refused in
// onOpenChange — see below.
const ITEM_PRESS_REASON = "item-press";

// Spec: a multivalue autocomplete — the input filters all categories, empty
// input lists everything, and a trailing option creates a new category with
// the typed title (quick-create; color/description editable later from the
// categories view).
export function CategoryMultiSelect({
  idPrefix,
  selected,
  onChange,
  disabled = false,
}: Readonly<CategoryMultiSelectProps>) {
  const queryClient = useQueryClient();
  const chipsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

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
    },
  });

  const needle = unicodeTrim(query).toLowerCase();
  const options = (categories ?? []).filter(
    (c) => needle === "" || c.title.toLowerCase().includes(needle),
  );
  const exactMatch = (categories ?? []).some(
    (c) => c.title.toLowerCase() === needle,
  );
  const canCreate = needle !== "" && !exactMatch;
  const listItems: OptionItem[] = canCreate
    ? [...options, CREATE_OPTION]
    : options;

  const handleValueChange = (next: OptionItem[]) => {
    if (next.some(isCreateOption)) {
      create.mutate({
        title: unicodeTrim(query),
        description: null,
        color: null,
      });
      return;
    }
    onChange(next.filter((v): v is Category => !isCreateOption(v)));
  };

  const error = serverErrorMessage(create.error);

  return (
    <div className="flex flex-col gap-1.5">
      <Combobox.Root<OptionItem, true>
        multiple
        value={selected}
        inputValue={query}
        open={open}
        disabled={disabled}
        // The feature owns the filtering (its own needle plus the
        // synthetic quick-create row), so internal filtering stays off.
        filteredItems={listItems}
        isItemEqualToValue={(a, b) =>
          a === b || (!isCreateOption(a) && !isCreateOption(b) && a.id === b.id)
        }
        itemToStringLabel={(v) => (isCreateOption(v) ? "" : v.title)}
        onOpenChange={(nextOpen, details) => {
          // Multiple-mode parity: picking an item while a filter is typed
          // auto-closes a popup whose input sits outside it — the
          // hand-rolled list stayed open (and kept the query), so this
          // close is refused.
          if (!nextOpen && details.reason === ITEM_PRESS_REASON) return;
          setOpen(nextOpen);
        }}
        onValueChange={handleValueChange}
        onInputValueChange={setQuery}
      >
        <Combobox.Chips ref={chipsRef}>
          {selected.map((category) => {
            const color = category.color ?? DEFAULT_CATEGORY_COLOR;
            return (
              <Combobox.Chip
                key={category.id}
                // Category color only ever tints the chip surface and the
                // dot — names and the remove button keep the text
                // foreground so dark custom colors stay legible.
                style={{ backgroundColor: `${color}26` }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                {category.title}
                <Combobox.ChipRemove
                  aria-label={removeTaskCategoryLabel(category.title)}
                />
              </Combobox.Chip>
            );
          })}
          <Combobox.Input
            id={`${idPrefix}-categories`}
            aria-label={CATEGORY_SEARCH_LABEL}
            placeholder={CATEGORY_SEARCH_LABEL}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              // Skip the internals: with no popup mounted, Base UI's
              // Escape clears input and selection — the hand-rolled
              // control did neither. Dropdown open: close only the
              // dropdown; the stopPropagation keeps a host dialog (e.g.
              // NewTaskDialog) alive. Closed: the key bubbles normally.
              event.preventBaseUIHandler();
              if (open) {
                event.stopPropagation();
                setOpen(false);
              }
            }}
          />
        </Combobox.Chips>
        {open && listItems.length > 0 && (
          <Combobox.Portal>
            <Combobox.Positioner anchor={chipsRef} align="start" sideOffset={4}>
              <Combobox.Popup>
                <Combobox.List>
                  {(item: OptionItem, index: number) =>
                    isCreateOption(item) ? (
                      <Combobox.Item
                        key="create"
                        index={index}
                        value={item}
                        className="justify-start gap-2 font-medium text-primary"
                      >
                        <Plus aria-hidden="true" size={16} />
                        {createCategoryOptionLabel(unicodeTrim(query))}
                      </Combobox.Item>
                    ) : (
                      <Combobox.Item key={item.id} index={index} value={item}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor:
                                item.color ?? DEFAULT_CATEGORY_COLOR,
                            }}
                            aria-hidden="true"
                          />
                          {item.title}
                        </span>
                        <Combobox.ItemIndicator />
                      </Combobox.Item>
                    )
                  }
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        )}
      </Combobox.Root>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
