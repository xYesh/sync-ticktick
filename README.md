# Sync TickTick

An Obsidian community plugin that syncs your TickTick tasks into your vault as individual Markdown notes with rich YAML frontmatter.

## Features

### One-way task sync (TickTick → Obsidian)

Each active task in your mapped TickTick lists becomes a Markdown file in the folder you choose. The plugin creates the file if it doesn't exist, and on subsequent syncs only refreshes the frontmatter — **your note body is never overwritten**.

### Rich YAML frontmatter

Every synced note includes structured metadata you can query with Dataview or any other plugin:

```yaml
---
ticktick_id: 69b788cfebcdf5000000030f
ticktick_url: https://ticktick.com/webapp/#p/69b7811aebcdf50000000071/tasks/69b788cfebcdf5000000030f
ticktick_list: work
status: in-progress
priority: High
start_date: 2026-03-10 09:00
due_date: 2026-03-15 17:00
tags:
  - work
  - urgent
context: work
---
```

| Field | Source |
|---|---|
| `ticktick_id` | Unique TickTick task ID |
| `ticktick_url` | Direct link to the task in TickTick's web app |
| `ticktick_list` | Name of the TickTick list mapped to this folder |
| `status` | `in-progress` or `done` |
| `priority` | `High`, `Medium`, `Low`, or `None` (mapped from TickTick's numeric values) |
| `start_date` / `due_date` | Formatted with the task's timezone as `YYYY-MM-DD HH:mm` |
| `completed_time` | Added when a task is marked complete |
| `tags` | Merged from TickTick task tags + the per-mapping tag + global tag you configure |
| `context` | Custom context label set per list mapping (e.g. `work`, `personal`) |

### Obsidian link in TickTick

On first sync, the plugin prepends an `obsidian://` deep link to the task's content in TickTick so you can jump straight from TickTick to the corresponding note. Existing task content is preserved — the link is added only once. When a task is completed and moved to the archive folder, the plugin also automatically updates this link in TickTick to point to the new archive location.

### Completed task archiving

When a task is marked complete in TickTick, the plugin moves its note into a `done/YYYY/MM/` subfolder under the mapped folder, keeping your active workspace clean while retaining a dated archive. It also updates the `status` to `done` and populates the `completed_time`.

### Automatic background sync

Configure the plugin to automatically sync your tasks every X minutes in the background, ensuring your Obsidian vault is always up-to-date with your TickTick account.

### Flexible list mappings

Map any number of TickTick lists to Obsidian folders. Each mapping supports:

- **TickTick list** — selected from a dropdown after logging in.
- **Obsidian folder** — vault-relative path where task notes are created (auto-created if missing).
- **Tag** — an extra tag appended to the note's frontmatter `tags` array.
- **Context** — a freeform label written as the `context` frontmatter field.

### Desktop browser login

Authentication is handled by opening a TickTick sign-in window directly inside Obsidian's desktop app. No API keys or passwords are stored — only the session cookie.

## Getting started

### Installation

1. Clone or download this repository into your vault's plugin folder:
   ```
   <Vault>/.obsidian/plugins/sync-ticktick/
   ```
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```
3. Reload Obsidian, then enable **Sync TickTick** in **Settings → Community plugins**.

### Configuration

1. Open **Settings → Sync TickTick**.
2. Click **Log In & Fetch Lists** — a browser window opens for you to sign in to TickTick.
3. Set your **Obsidian vault name** (used to build `obsidian://` links written back to TickTick).
4. Add one or more **list mappings**:
   - Select a TickTick list from the dropdown.
   - Enter the Obsidian folder path (e.g. `tasks/work`).
   - Optionally set a tag and/or context.
5. (Optional) Enable **Auto-Sync** and set your preferred sync interval.
6. Click the **checkmark ribbon icon** or run the **Sync TickTick Tasks** command from the command palette to force a sync.

## How syncing works

| Scenario | What happens |
|---|---|
| **New task** | A Markdown file is created with frontmatter + task content. An `obsidian://` link is written back to the TickTick task. |
| **Existing task** | Only the YAML frontmatter is refreshed. Your note body is untouched. |
| **Completed task** | The note is moved to `<folder>/done/YYYY/MM/`. Frontmatter `status` changes to `done`. The `obsidian://` link in TickTick is updated. If a copy already exists there, the active file is trashed to avoid duplicates. |
| **TickTick task content** | Never overwritten after the initial `obsidian://` link is added, except to update the link if the note moves. |

## Development

```bash
# Watch mode (rebuilds on save)
npm run dev

# Production build
npm run build
```

## Requirements

- Obsidian **v0.15.0+**
- Desktop only (uses Electron's `BrowserWindow` for authentication)
