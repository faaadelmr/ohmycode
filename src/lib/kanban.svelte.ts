import { browser } from '$app/environment';

export type TaskStatus = 'todo' | 'inprogress' | 'done';

export interface DutyTask {
	id: string;
	title: string;
	files: string[];
	functions: string[];
	status: TaskStatus;
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
		addTask(title: string, files: string[], functions: string[]) {
			const newTask: DutyTask = {
				id: crypto.randomUUID(),
				title,
				files,
				functions,
				status: 'todo',
				createdAt: Date.now()
			};
			tasks.push(newTask);
			save();
		},
		updateTaskStatus(id: string, status: TaskStatus) {
			const task = tasks.find((t) => t.id === id);
			if (task) {
				task.status = status;
				save();
			}
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
