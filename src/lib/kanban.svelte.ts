import { browser } from '$app/environment';

export interface DutyTask {
	id: string;
	title: string;
	description?: string;
	notes?: string;
	files: string[];
	functions: string[];
	fileDiffs?: Record<string, string>;
	hasSavedDiffs?: boolean;
	diffStats?: { additions: number; deletions: number };
	projectPath?: string;
	gitCommitHash?: string;
	createdAt: number;
	logFolderName?: string;
}

const STORAGE_KEY = 'ohmycode-kanban-tasks';

function summarizeDiffs(fileDiffs?: Record<string, string>) {
	const stats = { additions: 0, deletions: 0 };

	if (!fileDiffs) return stats;

	for (const diff of Object.values(fileDiffs)) {
		diff.split('\n').forEach((line) => {
			if (line.startsWith('+') && !line.startsWith('+++')) stats.additions++;
			if (line.startsWith('-') && !line.startsWith('---')) stats.deletions++;
		});
	}

	return stats;
}

function stripHeavyFields(task: DutyTask): DutyTask {
	const { fileDiffs, ...lightTask } = task;
	return {
		...lightTask,
		hasSavedDiffs: lightTask.hasSavedDiffs ?? Boolean(fileDiffs && Object.keys(fileDiffs).length > 0),
		diffStats: lightTask.diffStats ?? summarizeDiffs(fileDiffs)
	};
}

function createKanbanStore() {
	let tasks = $state<DutyTask[]>([]);

	// Initial load from localStorage
	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const loadedTasks = JSON.parse(stored).map(stripHeavyFields);
				tasks = loadedTasks;
				localStorage.setItem(STORAGE_KEY, JSON.stringify(loadedTasks));
			} catch (e) {
				console.error('Failed to parse stored tasks', e);
			}
		}
	}

	function save() {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.map(stripHeavyFields)));
		}
	}

	return {
		get tasks() {
			return tasks;
		},
		addTask(
			title: string,
			files: string[],
			functions: string[],
			description?: string,
			notes?: string,
			projectPath?: string,
			fileDiffs?: Record<string, string>,
			gitCommitHash?: string
		): DutyTask {
			const newTask: DutyTask = {
				id: crypto.randomUUID(),
				title,
				description,
				notes,
				files,
				functions,
				hasSavedDiffs: Boolean(fileDiffs && Object.keys(fileDiffs).length > 0),
				diffStats: summarizeDiffs(fileDiffs),
				projectPath,
				gitCommitHash,
				createdAt: Date.now()
			};
			tasks.unshift(newTask); // Newest first
			save();
			return newTask;
		},
		async syncToLocal(
			task: DutyTask,
			projectPath: string,
			includeGitCommit?: boolean,
			fileDiffs?: Record<string, string>
		) {
			if (!projectPath) return;
			try {
				const res = await fetch('/api/log/save', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						task: { ...task, fileDiffs },
						projectPath,
						includeGitCommit
					})
				});
				const data = await res.json();
				// Store the generated folder name back into the task so
				// delete and download can locate the exact folder later.
				if (data.success && data.folderName) {
					const idx = tasks.findIndex((t) => t.id === task.id);
					if (idx !== -1) {
						tasks[idx] = {
							...tasks[idx],
							logFolderName: data.folderName,
							hasSavedDiffs: Boolean(data.diffCount) || tasks[idx].hasSavedDiffs
						};
						save();
					}
				}
			} catch (e) {
				console.error('Failed to sync to local disk', e);
			}
		},
		async deleteFromLocal(task: DutyTask) {
			try {
				const res = await fetch('/api/log/delete', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ task })
				});
				return await res.json();
			} catch (e) {
				console.error('Failed to delete from local disk', e);
				return { success: false, error: 'API Connection failed' };
			}
		},
		async undoGitCommit(projectPath: string, commitHash?: string) {
			try {
				const res = await fetch('/api/git', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ projectPath, commitHash })
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

			if (task.projectPath && task.gitCommitHash) {
				const shouldDelete = confirm(
					'Delete this log history?\n\nThis will undo the Git commit created for this log and remove the saved log folder.'
				);
				if (!shouldDelete) return;

				const undoResult = await this.undoGitCommit(task.projectPath, task.gitCommitHash);
				if (!undoResult.success) {
					alert(`Git undo failed: ${undoResult.error || undoResult.raw || 'Unknown error'}`);
					return;
				}
			} else {
				if (!confirm('Delete this log history and remove the saved log folder?')) return;
			}

			const deleteResult = await this.deleteFromLocal(task);
			if (!deleteResult.success) {
				alert(`Log delete failed: ${deleteResult.error || 'Unknown error'}`);
				return;
			}

			const index = tasks.indexOf(task);
			tasks.splice(index, 1);
			save();
		}
	};
}

export const kanbanStore = createKanbanStore();
