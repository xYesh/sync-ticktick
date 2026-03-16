import { Plugin } from 'obsidian';
import { TickTickSyncSettings, DEFAULT_SETTINGS, TickTickSettingTab } from './settings';
import { TickTickSync } from './sync';

export default class TickTickSyncPlugin extends Plugin {
	settings: TickTickSyncSettings;

	async onload() {
		await this.loadSettings();

		// Add a ribbon icon placeholder
		this.addRibbonIcon('list-checks', 'TickTick Sync', () => {
			const sync = new TickTickSync(this.app, this);
			sync.sync();
		});

		// Add the command pallete trigger
		this.addCommand({
			id: 'sync-ticktick-tasks',
			name: 'Sync TickTick Tasks',
			callback: () => {
				const sync = new TickTickSync(this.app, this);
				sync.sync();
			}
		});

		// Add the settings tab
		this.addSettingTab(new TickTickSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
