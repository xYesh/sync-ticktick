import { App, PluginSettingTab, Setting } from 'obsidian';
import type TickTickSyncPlugin from './main';

export interface TickTickSyncSettings {
	username: string;
	password: string;
	listMapping: string; 
}

export const DEFAULT_SETTINGS: TickTickSyncSettings = {
	username: '',
	password: '',
	listMapping: 'Inbox -> ticktick_inbox\nWork -> ticktick_work', // Format: TickTick List -> Obsidian Folder
};

export class TickTickSettingTab extends PluginSettingTab {
	plugin: TickTickSyncPlugin;

	constructor(app: App, plugin: TickTickSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'TickTick Sync Settings' });

		new Setting(containerEl)
			.setName('TickTick Username')
			.setDesc('Your TickTick account email/username')
			.addText(text => text
				.setPlaceholder('Enter your username')
				.setValue(this.plugin.settings.username)
				.onChange(async (value) => {
					this.plugin.settings.username = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('TickTick Password')
			.setDesc('Your TickTick account password')
			.addText(text => text
				.setPlaceholder('Enter your password')
				.setValue(this.plugin.settings.password)
				.onChange(async (value) => {
					this.plugin.settings.password = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('List Mappings')
			.setDesc('Map TickTick lists to Obsidian folders. Format: TickTick List Name -> Obsidian Folder Path (one per line).')
			.addTextArea(text => text
				.setPlaceholder('Inbox -> ticktick_inbox')
				.setValue(this.plugin.settings.listMapping)
				.onChange(async (value) => {
					this.plugin.settings.listMapping = value;
					await this.plugin.saveSettings();
				}));
	}
}
