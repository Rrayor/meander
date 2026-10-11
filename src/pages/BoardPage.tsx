export function BoardPage() {
  return (
    <>
      <header className="flex items-center border-b border-border px-6 py-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          Board
        </h1>
      </header>
      <section className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-text-muted">
          Your weekly board will appear here.
        </p>
      </section>
    </>
  );
}
