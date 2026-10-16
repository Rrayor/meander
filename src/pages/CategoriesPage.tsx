import { useQuery } from "@tanstack/react-query";

import { listCategories } from "@/api/categories";
import { QUERY_KEYS } from "@/api/queryKeys";
import {
  CATEGORIES_HEADING,
  CATEGORIES_SUBTITLE,
  EMPTY_CATEGORIES_MESSAGE,
  categoryCreatedLabel,
} from "@/lib/labels";
import { errorMessage, formatDate } from "@/lib/utils";

// Categories without a color yet get a neutral dot; stored colors are hex
// values applied inline since they are data, not theme tokens.
const UNCOLORED = "var(--color-text-muted)";

export function CategoriesPage() {
  const { data: categories, error } = useQuery({
    queryKey: QUERY_KEYS.categories,
    queryFn: listCategories,
  });

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
        {error && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(error)}
          </p>
        )}
        {categories?.length === 0 && (
          <p className="py-12 text-center text-sm text-text-muted">
            {EMPTY_CATEGORIES_MESSAGE}
          </p>
        )}
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {categories?.map((category) => (
            <li key={category.id} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: category.color ?? UNCOLORED }}
              />
              <span className="flex-1 text-sm text-text">{category.title}</span>
              <span className="text-xs text-text-muted">
                {categoryCreatedLabel(formatDate(category.created_at))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
