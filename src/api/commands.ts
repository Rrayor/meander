// Tauri command names shared by the API layer and test stubs — the single
// source of truth so a rename can't drift between code and mocks.
export const COMMANDS = {
  currentDbPath: "current_db_path",
  selectDatabaseFile: "select_database_file",
  listProfiles: "list_profiles",
  currentProfile: "current_profile",
  createProfile: "create_profile",
  renameProfile: "rename_profile",
  switchProfile: "switch_profile",
  // tauri-plugin-dialog's invoke channel (plugin protocol, not ours)
  dialogOpen: "plugin:dialog|open",
} as const;
