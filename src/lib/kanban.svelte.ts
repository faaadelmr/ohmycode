import { browser } from '$app/environment';

export interface DutyTask {
	id: string;
	title: string;
	description?: string;
	notes?: string;
	files: string[];
	functions: string[];
	projectPath?: string;
	createdAt: number;
}

const STORAGE_KEY = 'ohmycode-kanban-tasks';

function createKanbanStore() {
	let tasks = $state<DutyTask[]>([]);

	// Initial load from localStorage
	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				tasks = JSON.parse(stored);
			} catch (e) {
				console.error('Failed to parse stored tasks', e);
			}
		}
	}

	function save() {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
		}
	}

	return {
		get tasks() {
			return tasks;
		},
		addTask(title: string, files: string[], functions: string[], description?: string, notes?: string, projectPath?: string): DutyTask {
			const newTask: DutyTask = {
				id: crypto.randomUUID(),
				title,
				description,
				notes,
				files,
				functions,
				projectPath,
				createdAt: Date.now()
			};
			tasks.unshift(newTask); // Newest first
			save();
			return newTask;
		},
		async syncToLocal(task: DutyTask, projectPath: string) {
			if (!projectPath) return;
			try {
				await fetch('/api/log/save', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ task, projectPath })
				});
			} catch (e) {
				console.error('Failed to sync to local disk', e);
			}
		},
		async deleteFromLocal(task: DutyTask) {
			try {
				await fetch('/api/log/delete', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ task })
				});
			} catch (e) {
				console.error('Failed to delete from local disk', e);
			}
		},
		removeTask(id: string) {
			const task = tasks.find((t) => t.id === id);
			if (task) {
				this.deleteFromLocal(task);
				const index = tasks.indexOf(task);
				tasks.splice(index, 1);
				save();
			}
		}
	};
}

export const kanbanStore = createKanbanStore();
