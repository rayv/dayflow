# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

DayFlow is an **Obsidian plugin** — a TypeScript project bundled via esbuild into a single `main.js` file that Obsidian loads at runtime. There is no test suite. The Obsidian API (`obsidian` package) is external to the bundle and available only inside a running Obsidian instance.

## Commands

```bash
npm install          # install dependencies
npm run dev          # watch mode — rebuilds dist/main.js on every save
npm run build        # type-check + production build
```

To test changes: copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` into the vault's `.obsidian/plugins/dayflow/` folder, then reload the plugin in Obsidian. In dev mode, only `dist/main.js` needs to be copied after each save.

## Architecture

### Entry Point

`src/main.ts` — `DayFlowPlugin extends Plugin`. This is the only class Obsidian instantiates. It:
- Registers the three view types and wires up all inter-view callbacks
- Handles vault/workspace events and debounced refresh (300 ms)
- Owns all file creation/modification logic (daily notes, meeting notes, recurring meetings)

### Three View Types

| Constant | File | Purpose |
|---|---|---|
| `VIEW_TYPE_LEFT_SIDEBAR` | `LeftSidebarView.ts` | Calendar + daily outline + meetings panels |
| `VIEW_TYPE_RIGHT_SIDEBAR` | `RightSidebarView.ts` | Aggregated to-do list across vault |
| `VIEW_TYPE_FULL_DAY_FLOW` | `FullDayFlowView.ts` | Full rendered content for a single day (daily note + meetings) |

Views are Obsidian `ItemView` subclasses. They receive all cross-view actions as callbacks injected by the plugin constructor — views never call plugin methods directly.

### Left Sidebar Sub-Widgets

`LeftSidebarView` composes four widgets, each managing its own DOM subtree:
- `CalendarWidget` — monthly grid with dot indicators per day
- `DailyOutline` — H1 headings from the daily note for the selected date
- `MeetingsPanel` — one-off meeting files in `meetings/YYYY-MM-DD/`
- `RecurringPanel` — recurring meeting files in `meetings/recurring/` that have an entry for the selected date

### To-Do Extraction

`src/utils/todoExtractor.ts` — `extractTodos(app)` scans all markdown files under `Daily Notes/` and `meetings/`. For the active editor it reads the live buffer (not the vault cache) so to-dos update as you type. Supports priority markers (`!!!`/`!!`/`!` prefix) and due dates (`📅 YYYY-MM-DD` or `due:YYYY-MM-DD`).

### Vault Structure Convention (hard-coded paths)

All paths are in `src/utils/dateUtils.ts`:
- Daily notes: `Daily Notes/YYYY-MM-DD.md`
- One-off meetings: `meetings/YYYY-MM-DD/<name>.md`
- Recurring meetings: `meetings/recurring/<topic>.md` — entries are H1 headings in `M/D/YYYY` format

### Styles

`styles.css` in the project root — all CSS classes use the `rays-` prefix.

### Settings

`src/settings.ts` — `DayFlowSettings` interface, `DEFAULT_SETTINGS`, and `DayFlowSettingTab`. Persisted via Obsidian's `loadData()`/`saveData()`. Current settings:
- `defaultCalendarView: "week" | "month"` — controls whether `WeekStripWidget` or `CalendarWidget` is shown (mutually exclusive). Changing this calls `plugin.reloadDayFlow()` (deactivate + reactivate).
- `showWeekends: boolean` — applied live via `plugin.applyShowWeekends()` without reloading.

`LeftSidebarView` receives settings via a `LeftSidebarConfig` object (last constructor param). It owns `showWeekends` as local state; changes are written back to settings via `onShowWeekendsChange` callback. The weekend toggle is exposed in the plugin's Settings tab (`DayFlowSettingTab` in `src/settings.ts`) and applied live via `plugin.applyShowWeekends()` without reloading.

### Types

`src/types.ts` — `TodoItem` (the main data transfer type), `DateChangeEvent`, and the three view type string constants.
