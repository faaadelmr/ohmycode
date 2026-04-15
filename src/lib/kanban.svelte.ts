import { browser } from '$app/environment';

export interface DutyTask {
	id: string;
	title: string;
	description?: string;
	notes?: string;
	files: string[];
	functions: string[];
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
		addTask(title: string, files: string[], functions: string[], description?: string, notes?: string) {
			const newTask: DutyTask = {
				id: crypto.randomUUID(),
				title,
				description,
				notes,
				files,
				functions,
				createdAt: Date.now()
			};
			tasks.unshift(newTask); // Newest first
			save();
		},
		removeTask(id: string) {
			const index = tasks.findIndex((t) => t.id === id);
			if (index !== -1) {
				tasks.splice(index, 1);
				save();
			}
		}
	};
}

export const kanbanStore = createKanbanStore();
