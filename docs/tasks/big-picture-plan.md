# Big picture implementation plan

The below plan is flexible, it should just serve as a mental frame.

1. Create Tauri project: Create the project, add dependencies, test that the setup works (A basic window opens with a React + shadcn/ui application inside even if it's just a single demo component, dummy tests run - not playwright or cucumber yet, just what comes with Rust and the frontend toolchain)
2. Add a dummy playwright test running against the frontend dev server (Tauri API layer mocked) and test that it works
3. Add a dummy cucumber-rs test running against the backend and test that it works
4. Add a dummy @wdio/tauri-service smoke test (embedded webdriver provider) and test that it works
5. Add linters and commit hooks to prevent committing wrongly formatted code or commit messages (Failing tests are allowed, so the hooks shouldn't run tests)
6. Add GitHub action that runs all validations on PR opening, pushing to PR, and pushing to the main branch
7. Clear up dummy tests and demo code from before
8. Create a test-database for use in tests.
9. Add main navigation to frontend (dummy pages are enough for now for backlog, kanban and settings)
10. Add database file selection option to settings page.
11. Add profile entity to db and profile list to the frontend (no need to worry about creation, updating, etc. yet).
12. Add profile creation (no updating, deleting or setting importing yet).
13. Add profile switching to the main navigation
14. Add profile updating (no deletion or setting importing yet).
15. Create task entity in the backend and backlog in the frontend (no creation, editing or deletion, nor filtering and sorting yet, just the entity and reading it to display a basic list in the backlog)
16. Add task creation functionality to the backlog (Categories and series aren't yet available, don't worry about it, mark them as todo in the code and create the task without)
17. Add task deletion functionality to the backlog (The most basic deletion, no need for prompting the user for anything, we don't have repeating tasks yet)
18. Add task editing functionality to the backlog (Again, don't worry about categories or series, mark them as todo)
19. Add category entity to backend and category list to the frontend (similar to what we did with tasks, don't worry about creation, editing, deletion, nor any other business logic, have entities in the db display in the list)
20. Add categories to the tasks in the db (No need to hook up the UI yet, but the backend should allow for adding and removing category relations to tasks)
21. Add category creation to the categories list (No need to add the other places where creation is possible)
22. Add category deletion to the category list. Fully hooked up version. On deletion the associated tasks lose the association.
23. Add category editing to the categories list (No need to add the other places where editing is possible)
24. Add the UI component(s) to task creation and editing for full category handling (Inlcuding the multi-select autocomplete and controls according to the specification)
25. Add repeating tasks to the db and the option to create one to the UI with filling out the repetition schedule on task creation or editing (No need to do any calculations yet, the ability to create a series in the db is enough for now).
26. Add the view modifications to the task details view for repeating tasks (The 2 tabs for notes, the calendar and the user prompt on saving modifications - none of these need to be functional on the backend yet as at this point the series is read-only).
27. Highlight dates in the calendar in the task details view which are supposed to have instances of the series (Still no editing, not even future instances, the calendar shouldn't be clickable yet).
28. Allow editing the entire series including all the properties and notes (No need for the current and future entries only option yet, and no need to allow editing future instances either).
29. Allow editing individual future instances of a series. Only valid dates should be clickable in the calendar (Still no need for the current and all future entries option).
30. Allow editing the current and all future entries of a series.
31. Create week start setting and settings page where it is displayed including the ability to update it. Open decision: weekly recurrence interval anchoring currently uses a fixed Monday internal convention (`mondayOf` in `src/lib/recurrence.ts`, `weekday_index`/anchor in `src-tauri/src/series.rs`). For `interval_weeks >= 2` a picked weekday can sit in the seam between the internal and configured week boundary and land a week later than a user expects. Decide whether the anchor stays fixed, follows the configured week start, or counts from the start date — then update both implementations together. Display order must rotate a derived copy; `WEEKDAY_OPTIONS` is canonical Monday-first and must not be reordered (guard test exists).
32. Create work day setting (which days of the week count as work days for repetition scheduling, default Monday-Friday) and add it to the settings page
33. Create the task card component on the frontend (The kanban board isn't necessary yet, an example card can be displayed in it's place until we create the board)
34. Create the kanban board which displays all the information for the current week respecting the week start setting (No drag and drop functionality, nor past and future weeks view option, nor the option to change the layout is necessary yet).
35. Fill the test-database with dummy data for the past 12 weeks
36. Add the option to view past kanban boards (no future kanban boards are necessary, nor the calendar feature yet. Stepping with the arrows is enough).
37. Add the calendar selection option to view past boards (no future boards yet).
38. Add the ability to view future boards via stepping or the calendar.
39. Add the carry-over functionality if not yet added.
40. Add the global threshold setting in the settings page and the ability change it (no need to handle it in the board yet).
41. Handle the global threshold setting in the board.
42. Add per day support to the global threshold in the settings page (no need page to handle it in the board yet).
43. Handle the per day global threshold in the board.
44. Add per category threshold support to the settings (no need to handle it on the board yet).
45. Add per day support for category thresholds (no need for the board to handle it yet).
46. Handle the per day setting of the category thresholds on the board.
47. Add setting import feature to profile updating
48. Add profile deletion with confirmation prompt (Always have a backup when testing)

The following steps cover the remaining specification features that weren't itemized above:

49. Add the "Create task" entry point to the kanban view (Creation already exists in the backlog)
50. Add the "add to current week" action to backlog items and the option to move board tasks back to the backlog
51. Add pagination to the backlog and category list views (50 items per page by default)
52. Add scheduling a task for an arbitrary date from the task details view
53. Add drag and drop to the kanban board for moving tasks between days, states and the weekly backlog (Respect the responsiveness targets in the specification)
54. Add filtering, searching and sorting to the backlog and kanban board
55. Add the option to display task statuses as columns and days of the week as rows on the kanban board
56. Create user documentation with screenshots if not done yet
