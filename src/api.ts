import { requestUrl, RequestUrlParam, RequestUrlResponse, Notice } from 'obsidian';

export interface TickTickTask {
	id: string;
	projectId: string;
	title: string;
	content: string;
	priority: number; // 0, 1, 3, 5
	status: number; // 0 = uncompleted, 2 = completed
	startDate?: string;
	dueDate?: string;
	timeZone?: string;
	isAllDay?: boolean;
	tags?: string[];
	completedTime?: string;
}

export interface TickTickProject {
	id: string;
	name: string;
	closed: boolean;
}

export class TickTickAPI {
	private cookie: string = '';

	constructor(cookie?: string) {
		if (cookie) {
			this.cookie = cookie;
		}
	}

	public setCookie(cookie: string) {
		this.cookie = cookie;
	}

	public hasCookie(): boolean {
		return this.cookie.length > 0;
	}

	public async loginViaDesktop(): Promise<{ name: string; value: string } | null> {
		return new Promise<{ name: string; value: string } | null>(async (resolve) => {
			let finished = false;
			const settle = (value: { name: string; value: string } | null) => {
				if (finished) return;
				finished = true;
				try {
					tryCleanup();
				} catch { }
				resolve(value);
			};

			let electron: any;
			let BrowserWindow: any;
			try {
				electron = (window as any).require?.('electron');
				BrowserWindow = electron?.remote?.BrowserWindow || electron?.BrowserWindow;
			} catch { }

			if (!BrowserWindow) {
				new Notice('Desktop login is not available in this environment. Are you on mobile?', 5000);
				settle(null);
				return;
			}

			let win: any;
			let pollId: ReturnType<typeof setInterval> | null = null;

			const tryCleanup = () => {
				try {
					if (pollId) {
						clearInterval(pollId);
						pollId = null;
					}
				} catch { }
				try {
					if (win) {
						win.removeAllListeners?.('closed');
						win.removeAllListeners?.('close');
						win.webContents?.removeAllListeners?.('did-finish-load');
						win.webContents?.removeAllListeners?.('did-navigate');
						win.webContents?.removeAllListeners?.('destroyed');
					}
				} catch { }
			};

			const tryGetCookies = async (): Promise<any[] | null> => {
				try {
					if (!win || win.isDestroyed?.()) return null;
					const wc = win.webContents;
					if (!wc || wc.isDestroyed?.()) return null;
					const cookies = await wc.session.cookies.get({ url: `https://ticktick.com/` });
					return cookies ?? null;
				} catch {
					return null;
				}
			};

			try {
				win = new BrowserWindow({
					width: 900,
					height: 680,
					show: true,
					webPreferences: {
						nodeIntegration: false,
						contextIsolation: true,
						webSecurity: true
					}
				});

				win.webContents.on('did-finish-load', async () => {
					try {
						await win.webContents.executeJavaScript(`
							(function () {
								if (document.getElementById('__tts_auth_bar')) return;
								const bar = document.createElement('div');
								bar.id = '__tts_auth_bar';
								bar.style.position = 'fixed';
								bar.style.right = '24px';
								bar.style.bottom = '24px';
								bar.style.display = 'flex';
								bar.style.gap = '8px';
								bar.style.zIndex = '999999';
								bar.style.pointerEvents = 'none';

								const mkBtn = (id, text, bg) => {
									const b = document.createElement('button');
									b.id = id;
									b.textContent = text;
									b.style.pointerEvents = 'auto';
									b.style.padding = '10px 16px';
									b.style.border = 'none';
									b.style.borderRadius = '6px';
									b.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
									b.style.color = '#fff';
									b.style.fontWeight = '600';
									b.style.cursor = 'pointer';
									b.style.background = bg;
									return b;
								};

								const finishBtn = mkBtn('__tts_finish', 'Finish', '#4b8bf4');
								const cancelBtn = mkBtn('__tts_cancel', 'Cancel', '#666');

								finishBtn.onclick = () => { window.__TTS_FINISH = true; };
								cancelBtn.onclick = () => { window.__TTS_CANCEL = true; };

								bar.appendChild(cancelBtn);
								bar.appendChild(finishBtn);
								document.body.appendChild(bar);
							})();
						`);
					} catch { }
				});

				pollId = setInterval(async () => {
					if (!win || win.isDestroyed?.() || finished) return;
					try {
						const flags = await win.webContents.executeJavaScript(`({ f: !!window.__TTS_FINISH, c: !!window.__TTS_CANCEL })`);
						if (flags?.c) {
							tryCleanup();
							try { win.close?.(); } catch { }
							settle(null);
							return;
						}
						if (flags?.f) {
							const cookies = await tryGetCookies();
							const found = cookies ? cookies.find(c => c.name === 't') : null;
							if (!found) {
								new Notice('Could not detect session cookie (t). Are you signed in?', 5000);
								tryCleanup();
								try { win.close?.(); } catch { }
								settle(null);
								return;
							}
							tryCleanup();
							try { win.close?.(); } catch { }
							settle({ name: found.name, value: found.value });
							return;
						}
					} catch { }
				}, 400);

				win.webContents.on('did-navigate', async (_e: any, url: string) => {
					if (finished) return;
					if (!url) return;

					try {
						const inApp = url.includes(`ticktick.com/#/`) || url.includes(`ticktick.com/webapp`);
						if (inApp) {
							const cookies = await tryGetCookies();
							const found = cookies ? cookies.find(c => c.name === 't') : null;
							if (found) {
								tryCleanup();
								try { win.close?.(); } catch { }
								settle({ name: found.name, value: found.value });
							}
						}
					} catch { }
				});

				win.on('close', () => { if (!finished) settle(null); });
				win.on('closed', () => { if (!finished) settle(null); });
				win.webContents.on('destroyed', () => { if (!finished) settle(null); });

				await win.loadURL(`https://ticktick.com/signin`);
				new Notice('Please sign in, then click Finish or Cancel.', 5000);
			} catch (err) {
				console.error("Desktop login failed:", err);
				settle(null);
			}
		});
	}

	public async getProjects(): Promise<TickTickProject[]> {
		if (!this.cookie) throw new Error('Not authenticated');

		try {
			const response = await requestUrl({
				url: 'https://api.ticktick.com/api/v2/projects',
				method: 'GET',
				headers: {
					'Cookie': this.cookie,
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
					'Accept': 'application/json, text/plain, */*',
					'Origin': 'https://ticktick.com',
					'Referer': 'https://ticktick.com/'
				},
			});

			if (response.status === 200) {
				return response.json as TickTickProject[];
			}
			throw new Error(`Failed to fetch projects: ${response.status}`);
		} catch (error) {
			console.error('Failed to get TickTick projects', error);
			throw error;
		}
	}

	/**
	 * Updates the content field of an existing TickTick task.
	 * Uses the batch/task endpoint (same as TickTickSync's updateTask).
	 */
	public async updateTaskContent(task: TickTickTask, newContent: string): Promise<boolean> {
		if (!this.cookie) throw new Error('Not authenticated');
		try {
			const payload = {
				add: [],
				addAttachments: [],
				delete: [],
				deleteAttachments: [],
				updateAttachments: [],
				update: [{
					id: task.id,
					projectId: task.projectId,
					title: task.title,
					content: newContent,
					status: task.status,
					priority: task.priority,
					modifiedTime: new Date().toISOString().replace('Z', '+0000'),
				}]
			};

			// TickTick write endpoints require x-device header (observed in TickTickSync reference)
			const xDevice = JSON.stringify({
				platform: 'web',
				os: 'Windows 10',
				device: 'Chrome 122.0',
				name: '',
				version: 6070,
				id: '6670a1b2c3d4e5f67890ab12',
				channel: 'website',
				campaign: '',
				websocket: ''
			});

			const response = await requestUrl({
				url: 'https://api.ticktick.com/api/v2/batch/task',
				method: 'POST',
				headers: {
					'Cookie': this.cookie,
					'Content-Type': 'application/json',
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
					'Accept': 'application/json, text/plain, */*',
					'Origin': 'https://ticktick.com',
					'Referer': 'https://ticktick.com/',
					'x-device': xDevice,
				},
				body: JSON.stringify(payload),
				throw: false,
			});

			console.log(`[TickTick API] updateTaskContent status: ${response.status}`);
			if (response.status !== 200) {
				try {
					console.error('[TickTick API] Response body:', response.json);
				} catch {
					console.error('[TickTick API] Response text:', response.text);
				}
			}

			return response.status === 200;
		} catch (error) {
			console.error(`Failed to update task content for ${task.id}`, error);
			return false;
		}
	}


	public async getTasksByProjectId(projectId: string): Promise<TickTickTask[]> {
		if (!this.cookie) throw new Error('Not authenticated');

		try {
			// Get uncompleted and completed tasks for the project. 
			// If we need completed tasks we might need another endpoint, but let's try the uncompleted ones first wrapper
			const response = await requestUrl({
				url: `https://api.ticktick.com/api/v2/project/${projectId}/tasks`,
				method: 'GET',
				headers: {
					'Cookie': this.cookie,
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
					'Accept': 'application/json, text/plain, */*',
					'Origin': 'https://ticktick.com',
					'Referer': 'https://ticktick.com/'
				},
			});

			if (response.status === 200) {
				return response.json as TickTickTask[];
			}
			throw new Error(`Failed to fetch tasks for project ${projectId}: ${response.status}`);
		} catch (error) {
			console.error(`Failed to get tasks for project ${projectId}`, error);
			throw error;
		}
	}

	public async getCompletedTasksByProjectId(projectId: string): Promise<TickTickTask[]> {
		if (!this.cookie) throw new Error('Not authenticated');

		try {
			// The completed tasks endpoint
			const response = await requestUrl({
				url: `https://api.ticktick.com/api/v2/project/${projectId}/completed/`,
				method: 'GET',
				headers: {
					'Cookie': this.cookie,
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
					'Accept': 'application/json, text/plain, */*',
					'Origin': 'https://ticktick.com',
					'Referer': 'https://ticktick.com/'
				},
			});

			if (response.status === 200) {
				return response.json as TickTickTask[];
			}
			throw new Error(`Failed to fetch completed tasks for project ${projectId}: ${response.status}`);
		} catch (error) {
			console.error(`Failed to get completed tasks for project ${projectId}`, error);
			throw error;
		}
	}
}
