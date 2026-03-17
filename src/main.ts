import { Plugin } from 'obsidian';
import { TickTickSyncSettings, DEFAULT_SETTINGS, TickTickSettingTab } from './settings';
import { TickTickSync } from './sync';

export default class TickTickSyncPlugin extends Plugin {
	settings: TickTickSyncSettings;
	private syncIntervalId: number | null = null;

	async onload() {
		await this.loadSettings();

		// Add a ribbon icon placeholder
		this.addRibbonIcon('list-checks', 'TickTick Sync', () => {
			this.triggerSync();
		});

		// Add the command pallete trigger
		this.addCommand({
			id: 'sync-ticktick-tasks',
			name: 'Sync TickTick Tasks',
			callback: () => {
				this.triggerSync();
			}
		});

		// Add the settings tab
		this.addSettingTab(new TickTickSettingTab(this.app, this));

		// Setup auto sync
		this.setupAutoSync();
	}

	onunload() {
		this.clearAutoSync();
	}

	triggerSync() {
		const sync = new TickTickSync(this.app, this);
		sync.sync();
	}

	setupAutoSync() {
		this.clearAutoSync();

		if (this.settings.autoSync && this.settings.syncInterval >= 1) {
			const intervalMs = this.settings.syncInterval * 60 * 1000;
			this.syncIntervalId = window.setInterval(() => {
				this.triggerSync();
			}, intervalMs);
			this.registerInterval(this.syncIntervalId);
			console.log(`TickTick Sync: Auto-sync configured for every ${this.settings.syncInterval} minutes.`);
		}
	}

	clearAutoSync() {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
			console.log('TickTick Sync: Auto-sync disabled.');
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		
		// Migration from string mapping to array mapping
		if (this.settings.listMapping && (!this.settings.listMappings || this.settings.listMappings.length === 0)) {
			console.log('TickTick Sync: Migrating list mapping settings format');
			const mappings = this.settings.listMapping.split('\n')
				.map(line => line.trim())
				.filter(line => line.includes('->'))
				.map(line => {
					const parts = line.split('->');
					return {
						listId: '',
						listName: (parts[0] || '').trim(),
						folder: (parts[1] || '').trim()
					};
				});
			this.settings.listMappings = mappings;
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
