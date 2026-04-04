import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type TickTickSyncPlugin from './main';
import { TickTickAPI, TickTickProject } from './api';

export interface TickTickListMapping {
	listId: string;
	listName: string;
	folder: string;
	tag?: string;
	context?: string;
	syncBody?: boolean;
	reverseSync?: boolean;
	localCopy?: boolean;
}

export interface TickTickFieldMappings {
	source: string;
	ticktickId: string;
	ticktickUrl: string;
	ticktickList: string;
	status: string;
	priority: string;
	startDate: string;
	dueDate: string;
	completedTime: string;
	tags: string;
	context: string;
}

export interface TickTickSyncSettings {
	cookie: string;
	vaultName: string;
	globalTag: string;
	listMappings: TickTickListMapping[];
	autoSync: boolean;
	syncInterval: number;
	fieldMappings: TickTickFieldMappings;

	// Deprecated, keeping temporarily for migration
	listMapping?: string;
	username?: string; // Deprecated
	password?: string; // Deprecated
}

export const DEFAULT_SETTINGS: TickTickSyncSettings = {
	cookie: '',
	vaultName: '',
	globalTag: '',
	listMappings: [],
	autoSync: false,
	syncInterval: 15,
	fieldMappings: {
		source: 'source',
		ticktickId: 'ticktick_id',
		ticktickUrl: 'ticktick_url',
		ticktickList: 'ticktick_list',
		status: 'status',
		priority: 'priority',
		startDate: 'start_date',
		dueDate: 'due_date',
		completedTime: 'completed_time',
		tags: 'tags',
		context: 'context',
	},
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

		new Setting(containerEl)
			.setName('Global tag')
			.setDesc('A tag added to every synced task, regardless of which list it belongs to.')
			.addText(text => text
				.setPlaceholder('e.g. ticktick')
				.setValue(this.plugin.settings.globalTag)
				.onChange(async (value) => {
					this.plugin.settings.globalTag = value.trim();
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
					.setPlaceholder('Obsidian Folder')
					.setValue(mapping.folder)
					.onChange(async (val) => {
						mapping.folder = val;
						await this.plugin.saveSettings();
					}))
				.addText(text => {
					text.inputEl.style.width = '100px';
					return text
						.setPlaceholder('Tag')
						.setValue(mapping.tag || '')
						.onChange(async (val) => {
							mapping.tag = val.trim() || undefined;
							await this.plugin.saveSettings();
						});
				})
				.addText(text => {
					text.inputEl.style.width = '100px';
					return text
						.setPlaceholder('Context')
						.setValue(mapping.context || '')
						.onChange(async (val) => {
							mapping.context = val.trim() || undefined;
							await this.plugin.saveSettings();
						});
				})
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
			setting.settingEl.style.borderBottom = 'none';
			setting.settingEl.style.paddingBottom = '0';

			const strategySetting = new Setting(containerEl)
				.setName('└─ Sync Strategy')
				.setDesc('Choose how tasks and notes synchronize for this list mapping.')
				.addDropdown(dropdown => dropdown
					.addOption('default', 'Default (Frontmatter Only)')
					.addOption('syncBody', 'Split Source (TickTick Frontmatter, Obsidian Body)')
					.addOption('reverseSync', 'Reverse Sync (Obsidian as Source of Truth)')
					.addOption('localCopy', 'Local Copy (TickTick as Source of Truth)')
					.setValue(
						mapping.localCopy ? 'localCopy' :
						mapping.reverseSync ? 'reverseSync' :
						mapping.syncBody ? 'syncBody' : 'default'
					)
					.onChange(async (val) => {
						mapping.syncBody = val === 'syncBody';
						mapping.reverseSync = val === 'reverseSync';
						mapping.localCopy = val === 'localCopy';
						await this.plugin.saveSettings();
					}));
			
			strategySetting.settingEl.style.paddingTop = '10px';
		});

		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('Add Mapping')
				.onClick(async () => {
					this.plugin.settings.listMappings.push({
						listId: '',
						listName: '',
						folder: '',
						syncBody: false,
						reverseSync: false,
						localCopy: false
					});
					await this.plugin.saveSettings();
					this.renderSettings();
				}));

		containerEl.createEl('h3', { text: 'Auto Sync' });

		new Setting(containerEl)
			.setName('Enable Auto-Sync')
			.setDesc('Automatically sync tasks in the background.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSync)
				.onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
					this.plugin.setupAutoSync();
				}));

		new Setting(containerEl)
			.setName('Sync Interval')
			.setDesc('How often to sync in minutes (minimum 1 minute).')
			.addText(text => text
				.setPlaceholder('15')
				.setValue(String(this.plugin.settings.syncInterval))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 1) {
						this.plugin.settings.syncInterval = num;
						await this.plugin.saveSettings();
						this.plugin.setupAutoSync();
					}
				}));

		containerEl.createEl('h3', { text: 'Field Mappings' });

		const createFieldMappingSetting = (name: string, desc: string, key: keyof TickTickFieldMappings, defaultVal: string) => {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addText(text => text
					.setPlaceholder(defaultVal)
					.setValue(this.plugin.settings.fieldMappings[key])
					.onChange(async (val) => {
						this.plugin.settings.fieldMappings[key] = val.trim() || defaultVal;
						await this.plugin.saveSettings();
					}));
		};

		createFieldMappingSetting('Source Field', 'Frontmatter property for the source (e.g. "TickTick").', 'source', 'source');
		createFieldMappingSetting('TickTick ID Field', 'Frontmatter property for the task ID.', 'ticktickId', 'ticktick_id');
		createFieldMappingSetting('TickTick URL Field', 'Frontmatter property for the task URL.', 'ticktickUrl', 'ticktick_url');
		createFieldMappingSetting('TickTick List Field', 'Frontmatter property for the TickTick list name.', 'ticktickList', 'ticktick_list');
		createFieldMappingSetting('Status Field', 'Frontmatter property for status (in-progress or done).', 'status', 'status');
		createFieldMappingSetting('Priority Field', 'Frontmatter property for priority.', 'priority', 'priority');
		createFieldMappingSetting('Start Date Field', 'Frontmatter property for the start date.', 'startDate', 'start_date');
		createFieldMappingSetting('Due Date Field', 'Frontmatter property for the due date.', 'dueDate', 'due_date');
		createFieldMappingSetting('Completed Time Field', 'Frontmatter property for the completion time.', 'completedTime', 'completed_time');
		createFieldMappingSetting('Tags Field', 'Frontmatter property for tags.', 'tags', 'tags');
		createFieldMappingSetting('Context Field', 'Frontmatter property for the context mapping.', 'context', 'context');
	}
}
