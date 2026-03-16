import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';

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

	constructor() {}

	public hasCookie(): boolean {
		return this.cookie.length > 0;
	}

	public async login(username: string, password: string): Promise<boolean> {
		try {
			const response = await requestUrl({
				url: 'https://api.ticktick.com/api/v2/user/signon?wc=true&remember=true',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					username,
					password,
				}),
			});

			if (response.status === 200 && response.headers['set-cookie']) {
				// Obsidian's requestUrl normalizes headers to lowercase.
				const setCookieHeader = response.headers['set-cookie'];
				
				if (Array.isArray(setCookieHeader)) {
					this.cookie = setCookieHeader.map(c => {
						const parts = (c || '').split(';');
						return parts[0] ? parts[0] : '';
					}).join('; ');
				} else if (typeof setCookieHeader === 'string') {
					// Sometimes multiple cookies are comma-separated
					const cookies = setCookieHeader.split(',').map(c => {
						if (!c) return '';
						const parts = c.split(';');
						return parts[0] ? parts[0].trim() : '';
					});
					this.cookie = cookies.filter(Boolean).join('; ');
				}
				
				return true;
			}
			return false;
		} catch (error) {
			console.error('TickTick login failed', error);
			return false;
		}
	}

	public async getProjects(): Promise<TickTickProject[]> {
		if (!this.cookie) throw new Error('Not authenticated');

		try {
			const response = await requestUrl({
				url: 'https://api.ticktick.com/api/v2/projects',
				method: 'GET',
				headers: {
					'Cookie': this.cookie,
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
