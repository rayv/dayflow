# DayFlow

A three-panel productivity layout for [Obsidian](https://obsidian.md) that brings your calendar, meetings, and to-dos together in one view.

![Obsidian](https://img.shields.io/badge/Obsidian-1.0.0+-blueviolet)

## Features

### Left Sidebar

- **Calendar** — Monthly calendar with day-by-day navigation. Color-coded dots indicate which days have daily notes, one-off meetings, or recurring meetings. Weekday-only view by default with an option to show weekends.
- **Daily Note** — Shows the H1 heading outline of the daily note for the selected date. Click a heading to jump to it. If no daily note exists, a button appears to create one.
- **One-Off Meetings** — Lists meeting notes for the selected date. Create new meeting notes with the `+` button.
- **Recurring Meetings** — Shows recurring meetings that have an entry for the selected date. Add entries to existing recurring meetings or create new ones with the `+` button.

### Right Sidebar

- **To-Do Items** — Aggregates all `- [ ]` checkboxes across your vault into a single panel. Check off items directly from the sidebar. Items are grouped by source note (e.g. "2026-03-02 Daily", "2026-03-02 John Smith") and sorted by date. Collapsible sections and a toggle to show/hide completed tasks.

### General

- Toggle the entire layout on or off with a single click (ribbon icon) or command palette (`Toggle DayFlow`).
- Layout is automatically restored when Obsidian restarts.
- Live refresh — the to-do sidebar updates as you type.

## Vault Structure

DayFlow expects the following folder structure:

```
vault/
  Daily Notes/
    2026-03-01.md
    2026-03-02.md
  meetings/
    2026-03-01/
      John Smith.md
      Project Kickoff.md
    2026-03-02/
      Design Review.md
    recurring/
      Team Standup.md
      1-on-1 with Manager.md
```

- **Daily notes** are stored in `Daily Notes/` with filenames in `YYYY-MM-DD.md` format.
- **One-off meeting notes** are stored in `meetings/YYYY-MM-DD/<name>.md`.
- **Recurring meeting notes** are stored in `meetings/recurring/<topic>.md`. Each entry is marked with an H1 heading in `M/D/YYYY` format (e.g. `# 3/2/2026`).

## Installation

### From Community Plugins

1. Open **Settings** > **Community plugins** in Obsidian.
2. Click **Browse** and search for **DayFlow**.
3. Click **Install**, then **Enable**.

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/your-username/dayflow/releases/latest).
2. Create a folder at `<vault>/.obsidian/plugins/dayflow/`.
3. Place the downloaded files into that folder.
4. Restart Obsidian and enable **DayFlow** in **Settings** > **Community plugins**.

## Usage

1. Click the **layout dashboard** icon in the left ribbon, or run **Toggle DayFlow** from the command palette.
2. The three-panel layout opens: left sidebar, center editor, right sidebar.
3. Click a day on the calendar to load its daily note and see that day's meetings.
4. Use the `+` buttons to create new meeting notes or recurring meeting entries.
5. Check off to-do items directly from the right sidebar — changes are written back to the source file.

## Development

```bash
# Install dependencies
npm install

# Build for development (watch mode)
npm run dev

# Build for production
npm run build
```

The build outputs `main.js` to the project root. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder to test.

## License

[MIT](LICENSE)
