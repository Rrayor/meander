interface DeleteButtonProps {
  /** Accessible name — pass a label built by a lib/labels helper. */
  label: string;
  onDelete: () => void;
  disabled?: boolean;
}

// Delete affordance shared by list rows. Always rendered muted rather than
// hidden-until-hover — an invisible control can't be discovered by keyboard
// or touch users.
export function DeleteButton({
  label,
  onDelete,
  disabled,
}: Readonly<DeleteButtonProps>) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
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
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" x2="10" y1="11" y2="17" />
        <line x1="14" x2="14" y1="11" y2="17" />
      </svg>
    </button>
  );
}
