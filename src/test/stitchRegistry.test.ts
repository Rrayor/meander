// The Stitch workflow requires every saved design asset to be registered in
// .stitch/metadata.json — a skipped entry once let an implemented screen
// silently disappear from the registry.
const designFiles = Object.keys(
  import.meta.glob("../../.stitch/designs/*"),
).map((path) => path.replace("../../.stitch/", ""));

const metadata = import.meta.glob("../../.stitch/metadata.json", {
  eager: true,
  import: "default",
})["../../.stitch/metadata.json"] as {
  screens: {
    id: string;
    title: string;
    files: string[];
    implemented: boolean;
  }[];
};

test("every saved design file is referenced by a registered screen", () => {
  const registered = new Set(metadata.screens.flatMap((s) => s.files));
  const unregistered = designFiles.filter((f) => !registered.has(f));

  expect(unregistered).toEqual([]);
});

test("every registered file exists on disk", () => {
  const onDisk = new Set(designFiles);
  const missing = metadata.screens
    .flatMap((s) => s.files.map((f) => [s.title, f] as const))
    .filter(([, f]) => !onDisk.has(f));

  expect(missing).toEqual([]);
});

test("registered screens carry the required fields", () => {
  for (const screen of metadata.screens) {
    expect(screen.id, `${screen.title} is missing an id`).toBeTruthy();
    expect(screen.title, `screen ${screen.id} is missing a title`).toBeTruthy();
    expect(
      screen.files.length,
      `${screen.title} registers no files`,
    ).toBeGreaterThan(0);
    expect(
      typeof screen.implemented,
      `${screen.title} is missing the implemented flag`,
    ).toBe("boolean");
  }
});
