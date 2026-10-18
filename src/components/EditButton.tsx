interface EditButtonProps {
  /** Accessible name — pass a label built by a lib/labels helper. */
  label: string;
  onEdit: () => void;
  disabled?: boolean;
}

// Edit affordance shared by list rows. Rendered muted rather than
// hidden-until-hover — an invisible control can't be discovered by
// keyboard or touch users.
export function EditButton({
  label,
  onEdit,
  disabled,
}: Readonly<EditButtonProps>) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      className="rounded p-1 text-text-muted transition-colors duration-150 ease-out hover:bg-surface hover:text-text focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    </button>
  );
}
