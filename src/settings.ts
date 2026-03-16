import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type TickTickSyncPlugin from './main';
import { TickTickAPI, TickTickProject } from './api';

export interface TickTickListMapping {
	listId: string;
	listName: string;
	folder: string;
	tag?: string;
	context?: string;
}

export interface TickTickSyncSettings {
	cookie: string;
	vaultName: string;
	listMappings: TickTickListMapping[];
	// Deprecated, keeping temporarily for migration
	listMapping?: string;
	username?: string; // Deprecated
	password?: string; // Deprecated
}

export const DEFAULT_SETTINGS: TickTickSyncSettings = {
	cookie: '',
	vaultName: '',
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

		if (this.plugin.settings.cookie) {
			containerEl.createEl('div', {
				text: '✅ Logged in to TickTick',
				cls: 'setting-item-description',
				attr: { style: 'color: var(--text-success); margin-bottom: 18px;' }
			});
		} else {
			containerEl.createEl('div', {
				text: '❌ Not logged in',
				cls: 'setting-item-description',
				attr: { style: 'color: var(--text-error); margin-bottom: 18px;' }
			});
		}

		new Setting(containerEl)
			.setName('TickTick Authentication')
			.setDesc('Log in to TickTick securely to fetch your lists for mapping. This will open a browser window.')
			.addButton(button => button
				.setButtonText(this.plugin.settings.cookie ? 'Refresh Login' : 'Log In & Fetch Lists')
				.onClick(async () => {
					button.setButtonText('Authenticating...');
					try {
						const cookie = await this.api.loginViaDesktop();
						if (!cookie || !cookie.value) {
							new Notice('TickTick login cancelled or failed.');
							button.setButtonText(this.plugin.settings.cookie ? 'Refresh Login' : 'Log In & Fetch Lists');
							return;
						}

						// Save the cookie
						this.plugin.settings.cookie = cookie.name + '=' + cookie.value;
						// Clear out old credentials if they exist
						delete this.plugin.settings.username;
						delete this.plugin.settings.password;
						await this.plugin.saveSettings();

						// Test authentication by fetching projects
						button.setButtonText('Fetching lists...');
						this.api.setCookie(this.plugin.settings.cookie);
						this.projects = await this.api.getProjects();

						new Notice(`Fetched ${this.projects.length} lists successfully.`);
						this.renderSettings(); // Re-render to update the mapping dropdowns and login status
					} catch (e) {
						console.error(e);
						new Notice('Error during authentication or fetching lists.');
					} finally {
						// Render settings already resets the button, but just in case
						button.setButtonText(this.plugin.settings.cookie ? 'Refresh Login' : 'Log In & Fetch Lists');
					}
				}));

		new Setting(containerEl)
			.setName('Obsidian vault name')
			.setDesc('The exact name of your Obsidian vault. Used to build the obsidian:// link written back to each TickTick task.')
			.addText(text => text
				.setPlaceholder('e.g. MyVault')
				.setValue(this.plugin.settings.vaultName)
				.onChange(async (value) => {
					this.plugin.settings.vaultName = value.trim();
					await this.plugin.saveSettings();
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
				.addText(text => text
					.setPlaceholder('Tag (added to frontmatter tags)')
					.setValue(mapping.tag || '')
					.onChange(async (val) => {
						mapping.tag = val.trim() || undefined;
						await this.plugin.saveSettings();
					}))
				.addText(text => text
					.setPlaceholder('Context (e.g. work, personal)')
					.setValue(mapping.context || '')
					.onChange(async (val) => {
						mapping.context = val.trim() || undefined;
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
