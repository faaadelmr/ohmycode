import { browser } from '$app/environment';

export interface DutyTask {
	id: string;
	title: string;
	description?: string;
	notes?: string;
	files: string[];
	functions: string[];
	fileDiffs?: Record<string, string>;
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
		addTask(title: string, files: string[], functions: string[], description?: string, notes?: string, projectPath?: string, fileDiffs?: Record<string, string>): DutyTask {
			const newTask: DutyTask = {
				id: crypto.randomUUID(),
				title,
				description,
				notes,
				files,
				functions,
				fileDiffs,
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
		async undoGitCommit(projectPath: string) {
			try {
				const res = await fetch('/api/git', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ projectPath })
				});
				return await res.json();
			} catch (e) {
				console.error('Failed to undo git commit', e);
				return { success: false, error: 'API Connection failed' };
			}
		},
		async removeTask(id: string) {
			const task = tasks.find((t) => t.id === id);
			if (!task) return;

			// 1. If Git undo is needed, do it FIRST
			if (task.projectPath) {
				const shouldUndoGit = confirm('Do you also want to UNDO the last Git commit associated with this task?\n\n(This will perform a git reset --soft HEAD~1)');
				
				if (shouldUndoGit) {
					const res = await this.undoGitCommit(task.projectPath);
					if (!res.success) {
						const proceed = confirm(`Git Undo Failed: ${res.error}\n\nDo you still want to delete the log entry anyway?`);
						if (!proceed) return; // User cancelled the whole deletion
					}
				}
			} else {
				// Standard confirmation for non-project tasks
				if (!confirm('Are you sure you want to delete this duty?')) return;
			}

			// 2. ONLY if step 1 succeeded or was skipped, proceed to delete from disk and state
			await this.deleteFromLocal(task);
			const index = tasks.indexOf(task);
			tasks.splice(index, 1);
			save();
		}
	};
}

export const kanbanStore = createKanbanStore();
