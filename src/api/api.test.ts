import { COMMANDS } from "@/api/commands";
import {
  createProfile,
  currentProfile,
  listProfiles,
  renameProfile,
  switchProfile,
} from "@/api/profiles";
import { currentDatabasePath, selectDatabaseFile } from "@/api/settings";
import { createTask, listTasks, moveTask } from "@/api/tasks";
import { transport } from "@/api/transport";

describe("api command wiring", () => {
  const invoke = vi.spyOn(transport, "invoke").mockResolvedValue(undefined);

  beforeEach(() => invoke.mockClear());

  it("calls each command with the expected name and args", async () => {
    await listTasks();
    expect(invoke).toHaveBeenLastCalledWith(COMMANDS.listTasks);

    const input = {
      title: "t",
      description: null,
      estimated_minutes: null,
      carry_over_rule: null,
      series: null,
    };
    await createTask(input);
    expect(invoke).toHaveBeenLastCalledWith(COMMANDS.createTask, { input });

    await moveTask(3, null, 7);
    expect(invoke).toHaveBeenLastCalledWith(COMMANDS.moveTask, {
      taskId: 3,
      beforeId: null,
      afterId: 7,
    });

    await listProfiles();
    expect(invoke).toHaveBeenLastCalledWith(COMMANDS.listProfiles);
    await currentProfile();
    expect(invoke).toHaveBeenLastCalledWith(COMMANDS.currentProfile);
    await createProfile("Work");
    expect(invoke).toHaveBeenLastCalledWith(COMMANDS.createProfile, {
      name: "Work",
    });
    await renameProfile(2, "Home");
    expect(invoke).toHaveBeenLastCalledWith(COMMANDS.renameProfile, {
      id: 2,
      name: "Home",
    });
    await switchProfile(2);
    expect(invoke).toHaveBeenLastCalledWith(COMMANDS.switchProfile, { id: 2 });

    await currentDatabasePath();
    expect(invoke).toHaveBeenLastCalledWith(COMMANDS.currentDbPath);
    await selectDatabaseFile("/tmp/x.db");
    expect(invoke).toHaveBeenLastCalledWith(COMMANDS.selectDatabaseFile, {
      path: "/tmp/x.db",
    });
  });
});
