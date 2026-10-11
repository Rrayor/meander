# Meander

A weekly kanban planner application. The point is to provide flexible planning without strict time boxing.

Main features include:
- A kanban board per week where each day is a column and tasks are the items under them. The board is like a table in that it has rows for the 3 states (Todo, In progress, Done), but those rows are dynamic in height depending on how many items belong to them.
- The board always has a starting column called "Weekly backlog"
- A new board is automatically created every week. Repeating tasks get placed on the new board according to their scheduling. Carry-over tasks will get placed in the weekly backlog.
- Tasks can be configured to repeat on a schedule
- Tasks can be in 3 states: Todo, in progress, done
- Tasks can have notes attached that belong to an instance if the task is a repeating one, but previous (or following) instances' notes can be easily viewed on any instance of a repeating task 
- If the week ends with a task being in an incomplete state the following can happen based on the tasks configuration:
  - If the task is configured to stay on the board until done, it moves to the weekly backlog of the new week's board
  - If the task is configured to be dismissed at the end of the week if incomplete (The default for repeating tasks), it won't get added to the new week's board
  - If the configuration is missing on the task, the user will be asked to choose an action of the above when they open the new week's board
- The application can be configured to start the weeks on any day, but the default week start is Monday.
- Tasks can be scheduled and moved between states via drag and drop or state changing buttons in their details view (where any attached notes can also be viewed)
- Tasks can have duration estimates which are displayed on the cards and the task details. The daily total estimate is also displayed for each day.
- The user can specify global thresholds for time estimates which will result in color coding background tint for the columns. (e.g. 4 hours: blue, 8 hours: green, 12 hours: red). The thresholds and colors are user specified, but some sensible defaults can be provided. Different rules can apply for different days of the week, but by default a single setting is used for all days.
- Categorization and thresholds can go even further: The user can create custom task categories and set thresholds per category (e.g. work, hobbies, familly, rest and relaxation). Categories are displayed on the cards and can have color coded borders attached with user specified colors. A task can have multiple categories (The border becomes a gradient between the category colors and the estimate counts towards every threshold that is set up for the involved categories)
- Actual spent time can be recorded on each task (in the case of repeated tasks, the instances themselves)
- There is a larger backlog feature different from the weekly backlog for tasks that will need to be planned for a week at some point but currently aren't. They are viewable in a separate view in a list. Each list item can be selected to view the details and each has an add to current week button, which adds it to the weekly backlog.
- Each task in the current week can also be moved back to the backlog at any point.
- Multi-profile support: Separate profiles have separate tasks and settings, but there is an option to import/clone another profile's settings

Non-functional requirements:
- Offline desktop application
- Single user at any given time, but supports multiple user profiles
- Modern, accessible, clean UI (WCAG AA)
- Windows, Linux and Mac compatibility
- As fast and small as possible without sacrificing maintainability

Tech stack:
- Tauri application: Rust "backend", Angular frontend
- Angular Material
- SQLite database
- Playwright for e2e testing
- Cucumber for acceptance testing

## Feature specifications

### Task information

Tasks hold the following information (This is not a database schema, just the description of the business entity with some thoughts for non-functional requirements):

Title: What is to be done (Required)
Description: Any details worth mentioning (Optional)
Status: Todo/In progress,/Done (Todo by default)
Repeat schedule: Can be none, which means the task is not to repeat, or a set of repeat options detailed below (Optional)
Carry-over rule (Exact name needs to be refined before implementation. If you're implementing this, come up with the right naming): Defines what should happen when the task is incomplete when the new week is started. If it needs to be moved over or silently discarded. (Optional, if not set the user is prompted to choose at the start of the next week)
Notes: A list of optional notes the user can add to a task or an instance of a repeated task (Optional)
Categories: The task can belong to multiple categories. (Optional)
Estimated time: The time the task is expected to take (Optional)
Spent time: The time spent on the task (Optional)
Audit information: Created at, updated at

**Acceptance Criteria:**
- The above information is stored in the database
- Non-audit information can be set by the user
- Audit information is set automatically
- Required, Optional and default settings from above are followed through in the implementation

### Creating/updating/deleting tasks

Tasks can be created from the kanban view or from the backlog view. They both have a "Create task" button.

When that button is clicked the "Create task" view is shown, where the task information can be filled out (title, description, categories, carry-over rule, estimated time).

The user can also choose to schedule the task (different from scheduling repetition). It should allow to add tasks for future weeks.

The user can also set a schedule for repetition here. If they do, a repeating task will be created.

Carry-over rule defines what should happen if the task is incomplete at the turn of weeks. One option is to discard it, which just means it won't be moved to the new week, but will stay in the past week as historic evidence of the incomplete task. The other option is to carry over the task to the next week, because it needs to be completed at some point. If left empty, the user should be prompted to choose an option at the start of the next week.

In the case of repeating tasks, carry-over rule is set to discard by default, but it can be changed if the user so chooses.

Tasks can be edited or removed in the task detail view detailed below.

When a repeating task instance is edited, the user must choose if they want tot edit the currently edited instance only or the entire series or the currently edited instance and all upcoming instances.

When a repeating task instance is deleted, the same choice has to be made but for deletion.

**Acceptance Criteria:**
- Tasks can be created from the backlog view and the kanban view
- Task can be scheduled for future weeks
- Carry over rule is empty by default
- If the user specifies a schedule for repetition a repeating task will be created
- Carry over rule defaults to discard if the user is creating a repeating task
- For editing and deletion criteria see the task details view entry.

### Estimated time and time spent format

Task duration must be specified in hours and minutes. Both for estimation and spent time.

**Acceptance Criteria:**
- Estimated time can be specified in hours and minutes
- Spent time can be specified in hours and minutes
- There is no minimum, it can be skipped, but if specified it has to be a positive value
- The maximum is 24 hours

### Scheduling task repetition

When creating or editing a task, it should be allowed to set to repeat weekly, monthly, daily and in some more advanced ways described by the following examples:
- The second Monday each month
- The last Friday each month
- Every 3 days
- The last day of the month
- The first workday after the 11th of the month

If a repetition schedule is set that would conflict with the calendar (for example the schedule would require the 31st of a 30 day month), the last valid day before the desired date should be chosen (in the example before the 30th or a 28th/29th in a february).

A start and end date must be set by the user. By default the start date is the current date or the next fitting date (e.g. if the schedule is every Monday, and today is not a Monday, than the start date will default to the next Monday). The end date can ommitted, in which case the task will repeat indefinitely. This is the default.

**Acceptance Criteria:**
- Repetitions can be set when creating or editing a task
- The repetitions work as they are set up by the user
- If the current month is shorter than the expected date, the last valid date is selected in the month
- When the above edge case is a reality, a warning label shows up next to the setting letting the user know, what they should expect
- A start and end date can be specified. The start date defaults based on the described rule
- The end date can be ommitted
- If the end date is ommitted, the task will repeat indefinitely

### Creating/updating/deleting repeating tasks

If a user specifies a schedule for repetition when creating or editing a task, a repeating task will be created starting from the specified start date, and until the specified and date. If the end date is ommitted, the task will repeate indefinitely.

Task instances can be edited or deleted individually, but editing or deleting the series is also possible. See the task details view specification below.

When the user edits an instance of a repeating task, they need to choose if they want to edit the individual instance, the entire series including past and future instances or the currently edited instance and all future instances.

Editing the series means applying the changes to all instances, overwriting any custom individual edits they may had. The same applies to editing the currently edited instance and all future instances. That option only leaves past instances intact.

Instances are created when the user delibiretly wants to edit a future instance (see the task details view specification below) or when the kanban board for a date where an instance should take place is created.

Notes are handled separately from other edits. Notes can be attached to individual instances or the series. See the task details view specification below.

When a user chooses the deletion option in the task details view, they also need to choose if they want to delete the individual instance, the entire series, or the current and future instances (effectively ending the series).

When the entire series is deleted, that affects all past and future instances.

**Acceptance Criteria:**
- Users can specify a schedule on task creation and moficiation with a start and end date
- If a schedule is specified, a series is created
- Instances are created when a user delibiretly edits a future instance or when a kanban board is created for a week, where an instance of the series should be created
- Editing and deleting options are handled according to the task detail view criteria
- Modifying or deleting an instance only affects that specific instance
- Modifying or deleting the series affects all past and future instances
- Modifying or deleteing the current and all upcoming instances only affects the current and future instances leaving past instances intact
- Notes can be attached to the series or individual instances

### Task categories

Tasks can belong to no categories or multiple ones at the same time. Categories of a task show up on their task cards and details view. They can also have assigned colors in which case the task card's border will take up that color. In case the border should take up multiple colors, it is represented by a gradient between the colors.

Categories can be used for filtering and setting up custom time thresholds. Both are detailed below.

**Acceptance Criteria:**
- Categories can be set on tasks
- Categories can be removed from tasks

### Category information

Categories hold the following information (This is not a database schema, just the description of the business entity with some thoughts for non-functional requirements):

- Title: The name of the category (Required)
- Description: Don't forget why you created a category :D (Optional)
- Color: The color to use for the border of associated tasks (Defaults to random color)
- Audit information: Created at, updated at

**Acceptance Criteria:**
- The above information is stored in the database
- Non-audit information can be set by the user
- Audit information is set automatically
- Required, Optional and default settings from above are followed through in the implementation

### Creating/Uodating/Deleting categories

Categories can be created in two ways:

1. There is a "Categories" view available through main navigation which lists all categories. Here, there is a "New Category" button.
2. Each task has a "categories" field available during task creation and in it's details view. The field works as a multivalue autocomplete dropdown. When active it lists all available categories in a dropdown that fit the inputted text. If there is no inputted text, all categories are listed. Here, there is an option to add a new category.

Categories can also be edited from both of the above places. The category list and the task creation/details views. When a category is edited the changes will show for all associated tasks, no matter if they were planned in the past or for future weeks or if they are in the backlog.

The category list view displays the title, the audit information and the count of associated tasks and task series.

The category list view allows for pagination. By default it lists 50 categories per page.

Categories can be removed from tasks at any time, but completely deleting a category is only available from the categories list.

When a category is deleted, it is removed from the category list of all associated tasks.

**Acceptance Criteria:**
- Categories view is available
- Categories can be created, edited and deleted from the categories view
- The category list view displays the title, the audit information and the count of associated tasks and task series
- The category list view allows for pagination. By default it lists 50 categories per page
- Category edits are reflected on all associated tasks
- Category deletion removes the category from associated tasks

### Viewing Task details

Task cards can be clicked on the kanban board or in the backlog. When that happens the task details view opens up, wwhere all the information related to the task is shown (title, description, categories, carry-over rule, notes, estimated time, time spent, audit information, in case of a repeating task, audit information for the series).

The backlog view allows for pagination. By default it displays 50 items on one page.

All the shown information can be editied from this view except for audit information.

From this view, tasks can also be moved to a different date, which doesn't necessarily need to be on the current week. Any date can be used. If it's in the future, when the board including that date is created, the task will be added to the right column.

In case of a repeating task, the other instances in the series can be viewed as well. For future instances, there is a date selector. The dates that are supposed to have an instance are highlighted. If a date is selected in this selector, the future instance can be edited (inlcuding adding or removing notes). In the background an instance for that date is created. When the kanban board including that date is created, the instance is used instead of creating a new instance. Dates that have these "pre-created" instances are highlighted with a different color in the date selector.

Past instances can be viewed, but not edited with the exception of notes. Notes can be modified, added or removed for past instances too.

When saving changes the user can choose to save for the currently edited instance, for all instances (past and future and current) or for the current and upcoming instances. The exception is notes as instance and series notes are differentiated in another way.

Tasks can also be deleted from this view. The same rule applies for deletion as for modification. The user must choose to delete only the currently edited instance, the entire series, or the currently edited instance and upmcoming instances (Effectively ending the series).

Notes are show in 2 tabs. "Current instance" and "Series". All can be added, updated or deleted, the user is expected to make the modifications on the right tab.

**Acceptance Criteria:**
- When clicking a task on a kanban board or in the backlog, the task view opens
- The backlog view allows for pagination. By default it displays 50 items on one page.
- Title, description, categories, notes and audit information is shown in the view
- Tasks can be scheduled for a different date from this view, which doesn't need to be on the current week
- For repeating tasks, the audit information of both the series and the currently viewed instance are shown
- All the information on the page can be edited except for audit information
- In case of a repeating task, future and past instances can be viewed as well
- Past instances can't be edited, only notes on them
- Future instances can be selected from a date selector. The date selector highlights the dates where the instances would take place and only allows selecting those dates
- If a date is selected, the future instance can be edited
- When the kanban board for a week where an edited future instance is present is created, the existing instance is used instead of creating a new one
- When saving changes on an instance, the user can select to:
  - Save changes for the currently edited instance only
  - Save changes for the entire series (future and past instances)
  - Save changes for the current and upcoming instances only
- Tasks can be deleted from this view
- The user must choose to delete only the currently edited instance, the entire series, or the currently edited instance and upmcoming instances (Effectively ending the series)
- Notes aren't affected by the above point
- Notes are displayed in 2 tabs: "Current instance" and "Series". This allows for managing notes for the current instance and notes for the series

### Creating/updating/deleting notes

Notes can be attached to tasks, instances of repeating tasks or series. When viewing an instance of a repeating task, the notes are listed in 2 tabs (Instance notes and series notes). When viewing a task, that's not part of a series, only a single list of notes is presented.

Notes can be added, edited or deleted freely in this view. In the case of repeating tasks, the UI should allow to view all past and future instances, which should allow for adding, editing or deleting notes for those instances.

There is no special rule for upadting or deleting notes. If a series note is updated, it won't affect individual instances, if an instance note is updated, it won't affect the series. If a note is deleted it is simply removed.

**Acceptance Criteria:**
- Notes can be viewed on tasks
- On repeating tasks, the notes are displayed on 2 tabs (instance and series)
- Notes can be edited or deleted freely
- The upper limit on note length is 10, 000 characters (adjustable if causes issues)


### Time estimations and thresholds

Each task can have a time estimate. In case of repeated tasks the owning task can have it's own estimation inherited by the instances, but the instances can override the inherited estimation each. This estimated time counts towards the daily total which is displayed on the kanban board in the column header.

Thresholds can be set up to help the user notice if they planned too much for any given day. The most basic setup is a single global threshold. The user can choose to plan at most X hours of stuff each day (need to sleep some time :D). When the threshold is reached by the estimation total for the day, the background of the column turns to a certain color. The color can be set by the user, but in this most simple case a default red seems sensible.

Thresholds can be set per category too. In this case a per day threshold is set up per category which is also displayed on the kanban board. When a category threshold is reached for a given day, the column background changes to the color set for the threshold. However, in this case the cards belonging to that category will also get a background tint of that color to highlight which items are problematic. For per-category thresholds the colors can also be set by the user but the defaults could be random based on a contrast ratio. (chosen from a predefined set of colors or calculated on the fly to contrast).

If multiple thresholds are reached for a given day, the background of the column will be a gradient between the set colors.

There is another detail to threshold settings and it's relevant for both of the above threshold types: A per week day dimension is also available. E.g. On Sunday the user may have more time available for anything. Or Saturday is hobby day, so the hobby category can have a higher threshold.

**Acceptance Criteria:**
- A global per day estimated time threshold can be set up
- A color can be set for that threshold
- By default the color set for the global per day threshold is red
- When the global threshold is reached the background tint of the column representing the day changes to the given color for that threshold
- Per category thresholds can be set up
- A color can be set for each per category threshold
- By default the colors for per category thresholds are random
- The random colors for per category thresholds are contrasty enough (Either chosen from a predefined set or calculated on the fly)
- When a per category threshold is reached for a day, the background tint for the column representing the day changes to the color of the threshold
- When a per category threshold is reached for a day, the background tint for the cards belonging to the category change to the color of the threshold
- If multiple thresholds are reached at the same time, the bacground tints become a gradient between the colors involved
- The cards background tint gradients only include the colors for the thresholds that are set up for the categories they belong to.
- The day of week for each threshold can also be specified and if it is, it will only account for that day
- If a day of week is not specified for a threshold, it accounts for all days

### Kanban board

The main view of the application. Every week there is a new kanban board for the weekly tasks. The board has 8 columns. A "Weekly Backlog" for tasks that are assigned to the week, but not to a specific day yet, and 7 following for each day of the week. The tasks are placed as cards in their respective columns The view has 3 rows with dynamic height for each state a task could be in (Todo, In Progress, Done). Tasks should be in the right row. The state and the assigned day of each task can be changed by drag and drop, or clicking their cards and setting the values in their details view.

The board displays total estimated and total spent time and the task count for each day and collectively the week. It also displays the start and end dates of the displayed week.

There is a navigation option to step backwards and forwards between weeks and a calendar option which allows for larger jumps. Past boards display the recorded information, future boards only display repeating task instances and pre-scheduled tasks.

**Acceptance Criteria:**
- The kanban board is displayed with 8 columns and 3 dynamic rows
- The 8 columns include the weekly backlog and the 7 days of the week
- The start of the week respects global user settings
- The rows are for the 3 task states (Todo, in progress, done)
- Tasks are displayed as kanban cards in the right column and row
- When clicking a card, the task details view opens (see related specification)
- Tasks can be moved around with drag and drop, their related properties update accordingly
- The board displays the date range for the currently displayed week
- The board displays daily and weekly totals of estimated and spent time
- The board displays daily and weekly task count
- There is a navigation option to move to the previous or next week's boards
- There is a calendar option to choose any week's boards for display
- Past boards display recorded historic information
- Future boards only show currently knowable information: Repeating task instances and pre-scheduled tasks

### Creating weekly boards

This is more of a conceptual term. Given, the start of week and other settings can be modified, boards shouldn't exist as an entity. The application should be date driven. Tasks are scheduled for dates and maybe date ranges if really necessary. Boards are just a view that filter and display a specific date range.

That being said, a new board is shown whenever according to the current settings a new week has started or when the user delibiretly requests a future board for viewing or editing. It is prepopulated with pre-scheduled tasks, instances of repeating tasks and possibly carry-over from the previous week's unfinished tasks (only when there is a new week starting, not when the user just peruses future weeks).

If it's the start of a new week, and not just the user perusing future weeks, carry-over must be handled. Each task has a carry-over setting which defines what should happen if the task is incomplete at the turn of weeks. One option is to discard it, which just means it won't be moved to the new week, but will stay in the past week as historic evidence of the incomplete task. The other option is to carry over the task to the next week, because it needs to be completed at some point. If left empty, the user should be prompted to choose an option at the start of the next week.

All incomplete tasks from past weeks, that are set to carry over should appear in the weekly backlog of the currently viewed week.

**Acceptance Criteria:**
- Weeks are not a technical entity, but a filter for date and possibly date-range driven data - I know it's more of an architectural decision, but it's important to cement to avoid starting off the wrong foot.
- When according to the global settings a new week has started, all incomplete tasks from previous weeks that have carry over set to true are added to the weekly backlog column of the current week's board
- Those incomplete tasks that have the carry over rule set to discard, aren't added to the weekly backlog of the current board
- The user is prompted about those incomplete tasks, that don't have a carry over rule set
- Repeating task instances are auto-populated


### Filtering, searching, sorting and organizing views

Both the backlog and the kanban board should allow for filtering, searching and sorting tasks based on their properties (e.g. title and description contents, categories, creation and update dates, etc.)

The kanban board's strict display rules shouldn't be violated. Any sorting or filtering should respect the columns and rows. Sorting can happen within those bounds.

The kanban board should have a setting for reversing row and column roles. Meaning task status would become columns and days of the week would become rows.

Settings shouldn't include any sorting or filtering features yet, as there aren't many options.

**Acceptance Criteria:**
- The backlog and kanban view allow for filtering and sorting tasks based on their properties
- The kanban boards strict display rules aren't violated by those settings
- The kanban board allows to display task statuses as columns and days of the week as rows if the user so chooses, but it can't be the default
- The settings view doesn't include any sorting or filtering options yet

### Profile information

The application allows for multiple user profiles. Each profile has it's own settings and tasks. The information belonging to a profile:

- Name: the profile name can be any short string (Required)
- Audit information: created at, updated at (Required)

As mentioned, settings and tasks belong to profiles, but it would feel wrong to include those in this list.

**Acceptance Criteria:**
- The above information is stored in the database
- Non-audit information can be set by the user
- Audit information is set automatically
- Required, Optional and default settings from above are followed through in the implementation

### Creating/updateing/deleting profiles

Profiles can be switched from the main navigation, but they can only be created, edited or deleted from the settings.

To create a profile click the "Create profile" button from the profile settings, give a name to your profile and click "create".

To edit a profile, click edit on it's entry in the profile settings page. You can modify the name and import settings from a different profile.

To delete, click the delete button on it's entry in the profile settings. A prompt should pop up asking for confirmation by typing in: "DELETE <profile name> AND ALL ACCOMPANYING DATA". This will delete not just the profile but all related tasks and settings.

**Acceptance Criteria:**
- Profiles can be switched from the main navigation
- Profiles can be edited and deleted from the settings
- Editing a profile allows for changing it's name and importing settings from a different profile
- Deleting prompts the user to type the above text to confirm the deletion
- Deleting a profile removes not just the profile but all accompanying tasks and settings

### Database file selection

The settings page should have an option for selecting the database file to load. This should allow for portability and better testing options. Loading a new file should unload everything currently in memory. It should handle possible compatibility issues gracefully. Ideally it only unloads everything if the chosen file is verified as compatible.

**Acceptance Criteria:**
- The settings page allows for selecting a database file to load
- The application handles incompatibilities gracefully
- The default setting is the default name for the embedded db

## Non-functional requirements

- Offline desktop application
- Single user at any given time, but supports multiple user profiles
- Modern, accessible, clean UI (WCAG AA)
- Windows, Linux and Mac compatibility
- As fast and small as possible without sacrificing maintainability

### Offline desktop application

Meander is to be used on desktop PCs (Windows, Mac and Linux). The database is an embedded SQLite db, no internet connection or external services should be necessary. Keep things local and private.

## Modern, accessible, clean UI

The application should be as easy to use as possible to anyone (Including people with disabilities). Avoid unnecessary clutter, dense information display, inaccessible color usage or navigation options. The minimum accessibility requirement is WCAG AA.

## Performance

Load times on all pages should adhere to the following rule:

- Under 2 seconds: Acceptable
- Under 1 second: Good

We should do our best to reach acceptable levels at least. Good level is desirable, but not at the sacrifice of maintainability.

Drag and drop should feel instant. Visual feedback should be immediate, while the update that happens on drop shouldn't pause user experience or risk inconsistencies. The update should show, that it's loading, but it should be as swift as possible. I'd start with the following rules:

- Visual feedback for drag and drop: Under 100 milliseconds
- Update on drop: Under 500 milliseconds

The rest don't have performance targets yet.

## Documentation

### Developer facing

Lives inside the repo in the `docs` folder as markdown files. It's modularized. It should contain specifications, architectural information, architectural decisions, contribution guidelines, coding guidelines etc.

Use Mermaid diagrams, tables, lists and other structures to keep the documentation easy to read and comprehend.

### User facing

Uses [Starlight](https://starlight.astro.build/) and lives under the `user-guide` folder. Served as a static site on github pages from it's own build directory under that folder.

Use screenshots, diagrams, tables, lists, asides and other tools, to make the documentation easy (and possibly entertaining) to read and comprehend. User documentation should be somewhat engaging, but avoid over-enthusiasm. Keep things as brief as possible without losing important information or making things harder for users.

## Out of scope (for now)

- Grouping tasks by categories
- Showing analytics of task completion rate, estimations vs time spent, etc. (Would be cool though :D)
- Sorting and filtering settings - Could become necessary in the future as the number of options grows