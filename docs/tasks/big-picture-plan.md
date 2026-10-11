# Big picture implementation plan

The below plan is flexible, it should just serve as a mental frame.

1. Create Tauri project: Create the project, add dependencies, test that the setup works (A basic window opens with an Angular material application inside even if it's just a single demo component, dummy tests run - not playwright or cucumber yet, just what comes with Rust and Angular)
2. Add a dummy playwright test and test that it works
3. Add a dummy cucumber test and test that it works
4. Add linters and commit hooks to prevent committing wrongly formatted code or commit messages (Failing tests are allowed, so the hooks shouldn't run tests)
5. Add GitHub action that runs all validations on PR opening, pushing to PR, and pushing to the main branch
6. Clear up dummy tests and demo code from before
7. Create a test-database for use in tests.
8. Add main navigation to frontend (dummy pages are enough for now for backlog, kanban and settings)
9. Add database file selection option to settings page.
10. Add profile entity to db and profile list to the frontend (no need to worry about creation, updating, etc. yet).
11. Add profile creation (no updating, deleting or setting importing yet).
12. Add profile updating (no deletion or setting importing yet).
13. Create task entity in the backend and backlog in the frontend (no creation, editing or deletion, nor filtering and sorting yet, just the entity and reading it to display a basic list in the backlog)
14. Add task creation functionality to the backlog (Categories and series aren't yet available, don't worry about it, mark them as todo in the code and create the task without)
15. Add task deletion functionality to the backlog (The most basic deletion, no need for prompting the user for anything, we don't have repeating tasks yet)
16. Add task editing functionality to the backlog (Again, don't worry about categories or series, mark them as todo)
17. Add category entity to backend and category list to the frontend (similar to what we did with tasks, don't worry about creation, editing, deletion, nor any other business logic, have entities in the db display in the list)
18. Add categories to the tasks in the db (No need to hook up the UI yet, but the backend should allow for adding and removing category relations to tasks)
19. Add category creation to the categories list (No need to add the other places where creation is possible)
20. Add category deletion to the category list. Fully hooked up version. On deletion the associated tasks lose the association.
21. Add category editing to the categories list (No need to add the other places where editing is possible)
22. Add the UI component(s) to task creation and editing for full category handling (Inlcuding the multi-select autocomplete and controls according to the specification)
23. Add repeating tasks to the db and the option to create one to the UI with filling out the repetition schedule on task creation or editing (No need to do any calculations yet, the ability to create a series in the db is enough for now).
24. Add the view modifications to the task details view for repeating tasks (The 2 tabs for notes, the calendar and the user prompt on saving modifications - none of these need to be functional on the backend yet as at this point the series is read-only).
25. Highlight dates in the calendar in the task details view which are supposed to have instances of the series (Still no editing, not even future instances, the calendar shouldn't be clickable yet).
26. Allow editing the entire series including all the properties and notes (No need for the current and future entries only option yet, and no need to allow editing future instances either).
27. Allow editing individual future instances of a series. Only valid dates should be clickable in the calendar (Still no need for the current and all future entries option).
28. Allow editing the current and all future entries of a series.
29. Create week start setting and settings page where it is displayed including the ability to update it.
30. Create the task card component on the frontend (The kanban board isn't necessary yet, an example card can be displayed in it's place until we create the board)
31. Create the kanban board which displays all the information for the current week respecting the week start setting (No drag and drop functionality, nor past and future weeks view option, nor the option to change the layout is necessary yet).
32. Fill the test-database with dummy data for the past 12 weeks
33. Add the option to view past kanban boards (no future kanban boards are necessary, nor the calendar feature yet. Stepping with the arrows is enough).
34. Add the calendar selection option to view past boards (no future boards yet).
35. Add the ability to view future boards via stepping or the calendar.
36. Add the carry-over functionality if not yet added.
37. Add the global threshold setting in the settings page and the ability change it (no need to handle it in the board yet).
38. Handle the global threshold setting in the board.
39. Add per day support to the global threshold in the settings page (no need page to handle it in the board yet).
40. Handle the per day global threshold in the board.
41. Add per category threshold support to the settings (no need to handle it on the board yet).
42. Add per day support for category thresholds (no need for the board to handle it yet).
43. Handle the per day setting of the category thresholds on the board.
44. Add setting import feature to profile updating
45. Add profile deletion with confirmation prompt (Always have a backup when testing)
46. Create user documentation with screenshots if not done yet
