import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type TickTickSyncPlugin from './main';
import { TickTickAPI, TickTickProject } from './api';

export interface TickTickListMapping {
	listId: string;
	listName: string;
	folder: string;
}

export interface TickTickSyncSettings {
	username: string;
	password: string;
	listMappings: TickTickListMapping[];
	// Deprecated, keeping temporarily for migration
	listMapping?: string; 
}

export const DEFAULT_SETTINGS: TickTickSyncSettings = {
	username: '',
	password: '',
	listMappings: [],
};

export class TickTickSettingTab extends PluginSettingTab {
	plugin: TickTickSyncPlugin;
	private projects: TickTickProject[] = [];
	private api: TickTickAPI;

	constructor(app: App, plugin: TickTickSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.api = new TickTickAPI();
	}

	display(): void {
		this.renderSettings();
	}

	private renderSettings(): void {
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
				})).settingEl.querySelector('input')?.setAttribute('type', 'password');

		new Setting(containerEl)
			.setName('Fetch TickTick Lists')
			.setDesc('Log in to TickTick and fetch your lists for mapping')
			.addButton(button => button
				.setButtonText('Fetch Lists')
				.onClick(async () => {
					button.setButtonText('Fetching...');
					try {
						const loggedIn = await this.api.login(this.plugin.settings.username, this.plugin.settings.password);
						if (!loggedIn) {
							new Notice('TickTick login failed. Check credentials.');
							button.setButtonText('Fetch Lists');
							return;
						}
						this.projects = await this.api.getProjects();
						new Notice(`Fetched ${this.projects.length} lists successfully.`);
						this.renderSettings(); // Re-render to update the mapping dropdowns
					} catch (e) {
						console.error(e);
						new Notice('Error fetching lists.');
					} finally {
						button.setButtonText('Fetch Lists');
					}
				}));

		containerEl.createEl('h3', { text: 'List Mappings' });

		this.plugin.settings.listMappings.forEach((mapping, index) => {
			const setting = new Setting(containerEl)
				.setName(`Mapping #${index + 1}`)
				.addDropdown(dropdown => {
					// Add default option if empty listId
					dropdown.addOption('', 'Select a TickTick list');
					
					// Add fetched projects to dropdown options
					this.projects.forEach(project => {
						dropdown.addOption(project.id, project.name);
					});

					// If we haven't fetched projects but have a saved mapping listName,
					// ensure the saved name displays even if we don't have the full list
					if (mapping.listId && !this.projects.find(p => p.id === mapping.listId)) {
						dropdown.addOption(mapping.listId, mapping.listName || mapping.listId);
					}

					dropdown.setValue(mapping.listId);
					dropdown.onChange(async (val) => {
						mapping.listId = val;
						const proj = this.projects.find(p => p.id === val);
						if (proj) {
							mapping.listName = proj.name;
						}
						await this.plugin.saveSettings();
					});
				})
				.addText(text => text
					.setPlaceholder('Obsidian Folder (e.g. ticktick/inbox)')
					.setValue(mapping.folder)
					.onChange(async (val) => {
						mapping.folder = val;
						await this.plugin.saveSettings();
					}))
				.addExtraButton(btn => btn
					.setIcon('trash')
					.setTooltip('Remove mapping')
					.onClick(async () => {
						this.plugin.settings.listMappings.splice(index, 1);
						await this.plugin.saveSettings();
						this.renderSettings();
					}));

			// Adding some styling directly to mimic side-by-side inputs
			setting.controlEl.style.justifyContent = 'flex-start';
			setting.infoEl.style.flex = '0 0 auto';
			setting.infoEl.style.marginRight = '20px';
		});

		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('Add Mapping')
				.onClick(async () => {
					this.plugin.settings.listMappings.push({
						listId: '',
						listName: '',
						folder: ''
					});
					await this.plugin.saveSettings();
					this.renderSettings();
				}));
	}
}
