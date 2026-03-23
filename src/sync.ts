import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { TickTickAPI, TickTickTask } from './api';
import type TickTickSyncPlugin from './main';
import type { TickTickListMapping } from './settings';

export class TickTickSync {
	private api: TickTickAPI;

	constructor(private app: App, private plugin: TickTickSyncPlugin) {
		this.api = new TickTickAPI();
	}

	/** Builds the obsidian:// URI for the given folder + file name */
	private buildObsidianUri(vaultName: string, filePath: string): string {
		// filePath here is the vault-relative path without .md extension
		return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(filePath)}`;
	}

	public async sync(): Promise<void> {
		const { cookie, listMappings, vaultName } = this.plugin.settings;

		if (!cookie) {
			new Notice('TickTick Sync: Not logged in. Please log in via settings.');
			return;
		}

		if (!listMappings || listMappings.length === 0) {
			new Notice('TickTick Sync: List mappings not configured.');
			return;
		}

		try {
			// Apply the stored cookie directly to the API
			this.api.setCookie(cookie);

			console.log('[TickTick Sync] Starting sync. Vault name:', vaultName || '(not set)');
			console.log('[TickTick Sync] Active mappings:', listMappings.length);

			new Notice('TickTick Sync: Syncing tasks...');
			const projects = await this.api.getProjects();
			console.log('[TickTick Sync] Fetched projects:', projects.map(p => `${p.name} (${p.id})`));

			// Parse mappings: "TickTick Name -> Obsidian Folder"
			for (const mapping of listMappings) {
				// Fallback to name match if we don't have listId but have listName
				let project = mapping.listId
					? projects.find(p => p.id === mapping.listId)
					: projects.find(p => p.name.toLowerCase() === (mapping.listName || '').toLowerCase());

				let projectId = '';

				if (!project && (mapping.listName || '').toLowerCase() === 'inbox') {
					projectId = 'inbox'; // Inbox is often implicitly 'inbox' depending on API
				} else if (project) {
					projectId = project.id;
				}

				if (!projectId) {
					console.warn(`TickTick project not found for mapping: ${mapping.listName || mapping.listId}`);
					continue;
				}

				const folderPath = normalizePath(mapping.folder);
				await this.ensureFolderExists(folderPath);

				// Sync active tasks — filter out completed ones (status 2) the API may include
				const allTasks = await this.api.getTasksByProjectId(projectId);
				const tasks = allTasks.filter(t => t.status !== 2);
				console.log(`[TickTick Sync] Project "${mapping.listName || projectId}": ${tasks.length} active tasks (${allTasks.length - tasks.length} completed filtered out)`);
				for (const task of tasks) {
					await this.createOrUpdateTaskFile(task, folderPath, vaultName, mapping);
				}

				// Sync completed tasks
				const completedTasks = await this.api.getCompletedTasksByProjectId(projectId);
				for (const completedTask of completedTasks) {
					await this.moveTaskToDone(completedTask, folderPath, vaultName);
				}
			}

			new Notice('TickTick Sync: Completed successfully!');
		} catch (error) {
			console.error('TickTick sync error:', error);
			new Notice('TickTick Sync error. Check console for details.');
		}
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			// recursively create if needed
			const parts = folderPath.split('/');
			let currentPath = '';
			for (const part of parts) {
				if (!part) continue;
				currentPath = currentPath === '' ? part : `${currentPath}/${part}`;
				const currentFolder = this.app.vault.getAbstractFileByPath(currentPath);
				if (!currentFolder) {
					await this.app.vault.createFolder(currentPath);
				}
			}
		} else if (!(folder instanceof TFolder)) {
			console.warn(`Path exists but is not a folder: ${folderPath}`);
		}
	}

	private sanitizeFileName(name: string): string {
		return name.replace(/[\\/:"*?<>|]/g, '_').trim();
	}

	/**
	 * Maps TickTick numeric priority to a human-readable label.
	 * TickTick uses: 0 = None, 1 = Low, 3 = Medium, 5 = High
	 */
	private priorityToLabel(priority: number): string {
		switch (priority) {
			case 5: return 'High';
			case 3: return 'Medium';
			case 1: return 'Low';
			default: return 'None';
		}
	}

	/**
	 * Formats an ISO / TickTick date string into a timezone-aware
	 * `YYYY-MM-DD HH:mm` string.  Falls back to the local timezone
	 * when the task carries no `timeZone` info.
	 */
	private formatDateWithTimezone(dateStr: string, timeZone?: string): string {
		try {
			const date = new Date(dateStr);
			if (isNaN(date.getTime())) return dateStr; // unparseable → pass through

			const opts: Intl.DateTimeFormatOptions = {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
				...(timeZone ? { timeZone } : {}),
			};

			// Build parts map for reliable ordering
			const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(date);
			const p: Record<string, string> = {};
			for (const { type, value } of parts) p[type] = value;

			return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
		} catch {
			return dateStr; // safety fallback
		}
	}

	private generateFrontmatter(task: TickTickTask, mapping?: TickTickListMapping): string {
		const fields = this.plugin.settings.fieldMappings;
		let fm = '---\n';
		fm += `${fields.source}: 'TickTick'\n`;
		fm += `${fields.ticktickId}: ${task.id}\n`;
		fm += `${fields.ticktickUrl}: https://ticktick.com/webapp/#p/${task.projectId}/tasks/${task.id}\n`;
		if (mapping?.listName) fm += `${fields.ticktickList}: ${mapping.listName}\n`;
		fm += `${fields.status}: "${task.status === 2 ? 'done' : 'in-progress'}"\n`;
		fm += `${fields.priority}: ${this.priorityToLabel(task.priority || 0)}\n`;

		if (task.startDate) fm += `${fields.startDate}: ${this.formatDateWithTimezone(task.startDate, task.timeZone)}\n`;
		if (task.dueDate) fm += `${fields.dueDate}: ${this.formatDateWithTimezone(task.dueDate, task.timeZone)}\n`;
		if (task.completedTime) fm += `${fields.completedTime}: ${this.formatDateWithTimezone(task.completedTime, task.timeZone)}\n`;

		// Merge TickTick tags with the global tag and the per-list tag from settings
		const globalTag = this.plugin.settings.globalTag;
		const allTags: string[] = [...(task.tags || [])];
		if (globalTag && !allTags.includes(globalTag)) {
			allTags.push(globalTag);
		}
		if (mapping?.tag && !allTags.includes(mapping.tag)) {
			allTags.push(mapping.tag);
		}
		if (allTags.length > 0) {
			fm += `${fields.tags}:\n${allTags.map(t => `  - ${t}`).join('\n')}\n`;
		}

		if (mapping?.context) {
			fm += `${fields.context}: ${mapping.context}\n`;
		}

		fm += '---\n\n';
		return fm;
	}

	private getFileBody(fileContent: string): string {
		if (fileContent.startsWith('---')) {
			const closeIdx = fileContent.indexOf('\n---', 3);
			if (closeIdx !== -1) {
				return fileContent.slice(closeIdx + 4).trimStart();
			}
		}
		return fileContent.trimStart();
	}

	/**
	 * Updates the YAML frontmatter of an existing file with fresh data from TickTick,
	 * preserving any custom fields the user has added.
	 */
	private async refreshFrontmatter(file: TFile, task: TickTickTask, mapping?: TickTickListMapping): Promise<void> {
		const fields = this.plugin.settings.fieldMappings;
		await this.app.fileManager.processFrontMatter(file, (fm: any) => {
			fm[fields.source] = 'TickTick';
			fm[fields.ticktickId] = task.id;
			fm[fields.ticktickUrl] = `https://ticktick.com/webapp/#p/${task.projectId}/tasks/${task.id}`;

			if (mapping?.listName) {
				fm[fields.ticktickList] = mapping.listName;
			}

			fm[fields.status] = task.status === 2 ? 'done' : 'in-progress';
			fm[fields.priority] = this.priorityToLabel(task.priority || 0);

			if (task.startDate) fm[fields.startDate] = this.formatDateWithTimezone(task.startDate, task.timeZone);
			if (task.dueDate) fm[fields.dueDate] = this.formatDateWithTimezone(task.dueDate, task.timeZone);
			if (task.completedTime) fm[fields.completedTime] = this.formatDateWithTimezone(task.completedTime, task.timeZone);

			// Safely merge tags
			const globalTag = this.plugin.settings.globalTag;
			const existingTags: string[] = Array.isArray(fm[fields.tags]) ? fm[fields.tags] : [];
			const taskTags: string[] = task.tags || [];

			const allTags = new Set([...existingTags, ...taskTags]);
			if (globalTag) allTags.add(globalTag);
			if (mapping?.tag) allTags.add(mapping.tag);

			if (allTags.size > 0) {
				fm[fields.tags] = Array.from(allTags);
			}

			if (mapping?.context) {
				fm[fields.context] = mapping.context;
			}
		});

		console.log(`[TickTick Sync] Refreshed frontmatter: ${file.path}`);
	}

	private findFileByTickTickId(taskId: string): TFile | null {
		const allFiles = this.app.vault.getMarkdownFiles();
		const fields = this.plugin.settings.fieldMappings;
		for (const file of allFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter?.[fields.ticktickId] === taskId) {
				return file;
			}
		}
		return null;
	}

	private async createOrUpdateTaskFile(task: TickTickTask, folderPath: string, vaultName?: string, mapping?: TickTickListMapping): Promise<void> {
		const expectedFileName = `${this.sanitizeFileName(task.title)}.md`;
		const targetFilePath = normalizePath(`${folderPath}/${expectedFileName}`);

		let file = this.findFileByTickTickId(task.id);

		// Fallback to path if not found by ID (e.g. metadataCache not updated yet for brand new files)
		if (!file) {
			const byPath = this.app.vault.getAbstractFileByPath(targetFilePath);
			if (byPath instanceof TFile) file = byPath;
		}

		let obsidianBody = '';
		let fileMtime = 0;

		if (!file) {
			console.log(`[TickTick Sync] Creating file: ${targetFilePath}`);
			obsidianBody = (task.content || '').trim();
			const content = this.generateFrontmatter(task, mapping) + obsidianBody;
			file = await this.app.vault.create(targetFilePath, content);
			// New file: acts as if modified just now
			fileMtime = Date.now();
		} else {
			// Rename file if title changed
			if (file.name !== expectedFileName) {
				const newFilePath = normalizePath(`${file.parent?.path || folderPath}/${expectedFileName}`);
				const existingTarget = this.app.vault.getAbstractFileByPath(newFilePath);
				if (!existingTarget) {
					console.log(`[TickTick Sync] Renaming file from ${file.name} to ${expectedFileName}`);
					await this.app.fileManager.renameFile(file, newFilePath);
				}
			}

			fileMtime = file.stat.mtime;

			// Update the frontmatter in the existing file with the latest values from TickTick
			await this.refreshFrontmatter(file, task, mapping);

			// Read the file structure to get the user's obsidian content body
			const existing = await this.app.vault.read(file);
			obsidianBody = this.getFileBody(existing);
		}

		// Write Obsidian URI & content back to the TickTick task
		if (!vaultName) {
			console.warn('[TickTick Sync] Vault name not set — skipping URI write-back for task:', task.title);
			return;
		}

		const finalFilePath = file.path;
		const vaultRelativePath = finalFilePath.endsWith('.md') ? finalFilePath.slice(0, -3) : finalFilePath;
		const obsidianUri = this.buildObsidianUri(vaultName, vaultRelativePath);
		const obsidianLink = `[📝 Open note in Obsidian](${obsidianUri})`;

		let taskModifiedMs = 0;
		if (task.modifiedTime) {
			const parsed = new Date(task.modifiedTime).getTime();
			if (!isNaN(parsed)) {
				taskModifiedMs = parsed;
			}
		}

		const hasLink = (task.content || '').includes('obsidian://');
		const needsInitialLink = !hasLink;
		const isObsidianNewer = fileMtime > taskModifiedMs;
		const shouldSyncBody = mapping?.syncBody === true;

		if (needsInitialLink || (shouldSyncBody && isObsidianNewer)) {
			console.log(`[TickTick Sync] Writing Obsidian URI & content to task "${task.title}"`);

			let baseContent = '';
			if (shouldSyncBody) {
				baseContent = obsidianBody;
			} else {
				baseContent = task.content || '';
			}

			const contentToSync = `${obsidianLink}\n\n${baseContent}`.trim();

			const ok = await this.api.updateTaskContent(task, contentToSync);
			if (ok) {
				console.log(`[TickTick Sync] ✅ Updated task "${task.title}" in TickTick.`);
			} else {
				console.error(`[TickTick Sync] ❌ Failed to update task "${task.title}" in TickTick.`);
			}
		} else {
			console.log(`[TickTick Sync] Task "${task.title}" already up to date in TickTick.`);
		}
	}

	private async moveTaskToDone(task: TickTickTask, folderPath: string, vaultName?: string): Promise<void> {
		const expectedFileName = `${this.sanitizeFileName(task.title)}.md`;

		let file = this.findFileByTickTickId(task.id);
		if (!file) {
			const activeFilePath = normalizePath(`${folderPath}/${expectedFileName}`);
			const byPath = this.app.vault.getAbstractFileByPath(activeFilePath);
			if (byPath instanceof TFile) file = byPath;
		}

		if (file) {
			const fields = this.plugin.settings.fieldMappings;
			// Update frontmatter to include completed_time and status to done before moving
			await this.app.fileManager.processFrontMatter(file, (fm: any) => {
				fm[fields.status] = 'done';
				if (!fm[fields.completedTime]) {
					const timeToUse = task.completedTime || new Date().toISOString();
					fm[fields.completedTime] = this.formatDateWithTimezone(timeToUse, task.timeZone);
				}
			});

			// Found the active file, move it to done
			const dateStr = task.completedTime || new Date().toISOString();
			// Handle ticktick format "2024-03-12T..."
			// Need a small hack if Date parsing fails on ticktick date strings, but standard ISO works.
			let year, month;
			try {
				const date = new Date(dateStr);
				year = date.getFullYear().toString();
				month = (date.getMonth() + 1).toString().padStart(2, '0');
			} catch (e) {
				year = new Date().getFullYear().toString();
				month = (new Date().getMonth() + 1).toString().padStart(2, '0');
			}

			const doneFolderBasePath = normalizePath(`${folderPath}/done`);
			const doneFolderYearPath = normalizePath(`${doneFolderBasePath}/${year}`);
			const doneFolderMonthPath = normalizePath(`${doneFolderYearPath}/${month}`);

			await this.ensureFolderExists(doneFolderMonthPath);

			const newFilePath = normalizePath(`${doneFolderMonthPath}/${expectedFileName}`);

			const existingDoneFile = this.app.vault.getAbstractFileByPath(newFilePath);
			if (!existingDoneFile) {
				await this.app.fileManager.renameFile(file, newFilePath);

				if (vaultName) {
					const vaultRelativePath = newFilePath.endsWith('.md') ? newFilePath.slice(0, -3) : newFilePath;
					const newObsidianUri = this.buildObsidianUri(vaultName, vaultRelativePath);
					const newObsidianLink = `[📝 Open note in Obsidian](${newObsidianUri})`;

					let contentToUpdate = task.content || '';
					const mdLinkRegex = /\[📝 Open note in Obsidian\]\(obsidian:\/\/.*?\)/g;
					const rawLinkRegex = /obsidian:\/\/open\?vault=[^&\s]+&file=[^\s)]+/g;

					if (contentToUpdate.match(mdLinkRegex)) {
						contentToUpdate = contentToUpdate.replace(mdLinkRegex, newObsidianLink);
					} else if (contentToUpdate.match(rawLinkRegex)) {
						contentToUpdate = contentToUpdate.replace(rawLinkRegex, newObsidianUri);
					} else {
						contentToUpdate = `${newObsidianLink}\n\n${contentToUpdate}`.trim();
					}

					const ok = await this.api.updateTaskContent(task, contentToUpdate);
					if (ok) {
						console.log(`[TickTick Sync] ✅ Updated done task "${task.title}" with new Obsidian URI.`);
					} else {
						console.error(`[TickTick Sync] ❌ Failed to update done task "${task.title}" in TickTick.`);
					}
				}
			} else {
				// We'll just delete the active one if it's already in done to prevent dupes hanging around
				await this.app.vault.trash(file, true);
			}
		}
	}
}
