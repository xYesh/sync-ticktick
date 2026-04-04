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
| `status` | `in-progress` or `done` (Note: TickTick "Won't do" tasks are also successfully archived as `done`) |
| `priority` | `High`, `Medium`, `Low`, or `None` (mapped from TickTick's numeric values) |
| `start_date` / `due_date` | Formatted with the task's timezone as `YYYY-MM-DD HH:mm` |
| `completed_time` | Added when a task is marked complete |
| `tags` | Merged from TickTick task tags + the per-mapping tag + global tag you configure |
| `context` | Custom context label set per list mapping (e.g. `work`, `personal`) |

### Obsidian link in TickTick

On first sync, the plugin prepends an `obsidian://` deep link to the task's content in TickTick so you can jump straight from TickTick to the corresponding note. Existing task content is preserved — the link is added only once. When a task is completed and moved to the archive folder, the plugin also automatically updates this link in TickTick to point to the new archive location.

### Sync Note Body (Optional)

You can enable **Sync Note Body** on a per-list basis. When enabled, any changes made to the note body in Obsidian will be synced back and overwrite the TickTick task description, provided the local note was modified more recently than the TickTick task.


### Reverse Sync (Obsidian → TickTick)

You can enable **Reverse Sync** on a per-list basis. When enabled, your Obsidian vault becomes the **absolute Single Source of Truth** for that list mapping.

- **Creating properties:** During a reverse sync, the plugin automatically ensures that every synced Markdown file has all the frontmatter fields ready to edit (e.g., `start_date`, `due_date`, `completed_time` set to `null`). You can fill these in, and the plugin will seamlessly propagate them to TickTick.
- **Tasks vs Notes:** By default, new notes create standard Tasks in TickTick. However, if you set `TickTick_Type: Note` in the note's frontmatter, it will be automatically created as a Note inside TickTick.
- **Conflict Resolution:** In Reverse Sync mode, *any changes made in TickTick since the last sync will be overwritten* by the metadata and content present in your Obsidian file.

### Completed task archiving

When a task is marked complete (or "Won't do") in TickTick, the plugin moves its existing active note into a `done/YYYY/MM/` subfolder under the mapped folder, keeping your workspace clean while retaining a dated archive. It also updates the `status` to `done` and populates the `completed_time`.

#### Archive Conflict Flow
If a note with the exact same name already exists in the `done` folder, the plugin safely resolves the collision by appending a unique timestamp suffix (e.g., `Task Name_1711234567.md`) to the newly archived note. **Your files are never deleted or silently overwritten**, guaranteeing that both the existing archived note and the newly completed note are securely preserved side-by-side in your vault.

> **Note**: The plugin ONLY archives tasks that were previously synced as active. Tasks that are created and completed entirely within TickTick before syncing will be ignored, preventing your vault from being cluttered with unnecessary historical notes!

### Automatic background sync

Configure the plugin to automatically sync your tasks every X minutes in the background, ensuring your Obsidian vault is always up-to-date with your TickTick account.

### Flexible list mappings

Map any number of TickTick lists to Obsidian folders. Each mapping supports:

- **TickTick list** — selected from a dropdown after logging in.
- **Obsidian folder** — vault-relative path where task notes are created (auto-created if missing).
- **Tag** — an extra tag appended to the note's frontmatter `tags` array.
- **Context** — a freeform label written as the `context` frontmatter field.
- **Sync Strategy** — defines how tasks and notes synchronize. Choose between:
  - *Default:* One-way task sync that only refreshes YAML frontmatter locally.
  - *Split Source:* Uses TickTick as the absolute truth for frontmatter properties, and Obsidian as the source of truth for the body description.
  - *Reverse Sync:* Treats Obsidian as the absolute source of truth, pushing all states back up.
  - *Local Copy:* Treats TickTick as the absolute source of truth, pulling state and overwriting local changes.

### Desktop browser login

Authentication is handled by opening a TickTick sign-in window directly inside Obsidian's desktop app. No API keys or passwords are stored — only the session cookie.

## Getting started

### Installation

#### Using BRAT (Recommended)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin from the Community Plugins under Obsidian settings.
2. Enable BRAT.
3. Open the command palette and run the command **BRAT: Add a beta plugin for testing**.
4. Paste the URL of this GitHub repository.
5. Click **Add Plugin**.
6. Switch on **Sync TickTick** in **Settings → Community plugins**.

#### Manual Installation

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
| **Completed task** | The active note is moved to `<folder>/done/YYYY/MM/`. Frontmatter `status` changes to `done`. If a duplicate note already exists in the done folder, the active file is preserved under a unique timestamped name. Only active notes are archived (tasks closed strictly within TickTick without being synced are skipped). |
| **TickTick task content** | If "Sync Note Body" is disabled (default), it is never overwritten after the initial `obsidian://` link is added. If enabled, the task description gets overwritten by the Obsidian note body whenever the note has been modified more recently than the task. |

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
