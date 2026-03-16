import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { TickTickAPI, TickTickTask } from './api';
import type TickTickSyncPlugin from './main';

export class TickTickSync {
	private api: TickTickAPI;

	constructor(private app: App, private plugin: TickTickSyncPlugin) {
		this.api = new TickTickAPI();
	}

	public async sync(): Promise<void> {
		const { cookie, listMappings } = this.plugin.settings;
		
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

			new Notice('TickTick Sync: Syncing tasks...');
			const projects = await this.api.getProjects();
			
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

				// Sync active tasks
				const tasks = await this.api.getTasksByProjectId(projectId);
				for (const task of tasks) {
					await this.createTaskFileIfNotExists(task, folderPath);
				}

				// Sync completed tasks
				const completedTasks = await this.api.getCompletedTasksByProjectId(projectId);
				for (const completedTask of completedTasks) {
					await this.moveTaskToDone(completedTask, folderPath);
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

	private generateFrontmatter(task: TickTickTask): string {
		let fm = '---\n';
		fm += `ticktick_id: ${task.id}\n`;
		fm += `priority: ${task.priority || 0}\n`;
		if (task.startDate) fm += `start_date: ${task.startDate}\n`;
		if (task.dueDate) fm += `due_date: ${task.dueDate}\n`;
		if (task.completedTime) fm += `completed_time: ${task.completedTime}\n`;
		if (task.tags && task.tags.length > 0) {
			fm += `tags:\n${task.tags.map(t => `  - ${t}`).join('\n')}\n`;
		}
		fm += '---\n\n';
		return fm;
	}

	private async createTaskFileIfNotExists(task: TickTickTask, folderPath: string): Promise<void> {
		const fileName = `${this.sanitizeFileName(task.title)}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);
		
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file) {
			// File doesn't exist, create it
			const content = this.generateFrontmatter(task) + (task.content || '');
			await this.app.vault.create(filePath, content);
		}
	}

	private async moveTaskToDone(task: TickTickTask, folderPath: string): Promise<void> {
		const fileName = `${this.sanitizeFileName(task.title)}.md`;
		const activeFilePath = normalizePath(`${folderPath}/${fileName}`);
		
		const file = this.app.vault.getAbstractFileByPath(activeFilePath);
		if (file && file instanceof TFile) {
			// Update frontmatter to include completed_time before moving
			let content = await this.app.vault.read(file);
			if (!content.includes('completed_time:')) {
				content = content.replace('---\n', `---\ncompleted_time: ${task.completedTime || new Date().toISOString()}\n`);
				await this.app.vault.modify(file, content);
			}

			// Found the active file, move it to done
			const dateStr = task.completedTime || new Date().toISOString();
			// Handle ticktick format "2024-03-12T..."
			// Need a small hack if Date parsing fails on ticktick date strings, but standard ISO works.
			let year, month;
			try {
				const date = new Date(dateStr);
				year = date.getFullYear().toString();
				month = (date.getMonth() + 1).toString().padStart(2, '0');
			} catch(e) {
				year = new Date().getFullYear().toString();
				month = (new Date().getMonth() + 1).toString().padStart(2, '0');
			}
			
			const doneFolderBasePath = normalizePath(`${folderPath}/done`);
			const doneFolderYearPath = normalizePath(`${doneFolderBasePath}/${year}`);
			const doneFolderMonthPath = normalizePath(`${doneFolderYearPath}/${month}`);

			await this.ensureFolderExists(doneFolderMonthPath);

			const newFilePath = normalizePath(`${doneFolderMonthPath}/${fileName}`);
			
			const existingDoneFile = this.app.vault.getAbstractFileByPath(newFilePath);
			if (!existingDoneFile) {
				await this.app.fileManager.renameFile(file, newFilePath);
			} else {
				// We'll just delete the active one if it's already in done to prevent dupes hanging around
				await this.app.vault.trash(file, true);
			}
		}
	}
}
