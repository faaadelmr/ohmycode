import { json } from '@sveltejs/kit';
import { execSync } from 'child_process';
import type { RequestHandler } from './$types';
import path from 'path';
import fs from 'fs';
import os from 'os';

export const GET: RequestHandler = async ({ url }) => {
	const targetPath = url.searchParams.get('path') || process.cwd();

	if (!fs.existsSync(targetPath)) {
		return json({ success: false, error: 'Directory does not exist' }, { status: 400 });
	}

	try {
		try {
			execSync(`git -C "${targetPath}" rev-parse --is-inside-work-tree`, { stdio: 'ignore' });
		} catch (e) {
			return json({ success: false, error: 'Not a git repository' }, { status: 400 });
		}

		// git status --porcelain=v1
		// Column 1: Index status (Staged)
		// Column 2: Working Tree status (Unstaged)
		const statusOutput = execSync(`git -C "${targetPath}" status --porcelain`).toString();
		
		const lines = statusOutput.split('\n').filter(line => line.trim() !== '');
		
		const stagedFiles: any[] = [];
		const unstagedFiles: any[] = [];

		lines.forEach(line => {
			const x = line[0]; // Staged
			const y = line[1]; // Unstaged
			const filePath = line.slice(3).replace(/"/g, '').trim();
			
			// Common helper to parse type
			const getType = (code: string) => {
				if (code === 'A' || code === '?') return 'Added';
				if (code === 'D') return 'Deleted';
				if (code === 'R') return 'Renamed';
				if (code === 'M') return 'Modified';
				return 'Modified';
			};

			// 1. If it has STAGED changes (X is not space or ?)
			if (x !== ' ' && x !== '?') {
				stagedFiles.push({
					file: filePath,
					status: x,
					type: getType(x),
					isStaged: true
				});
			}

			// 2. If it has UNSTAGED changes (Y is not space) or is UNTRACKED (X and Y are ??)
			if (y !== ' ' || (x === '?' && (y as string) === '?')) {
				unstagedFiles.push({
					file: filePath,
					status: y === '?' ? '?' : y,
					type: getType(y === ' ' ? x : y), // Fallback to X if Y is space (for new files)
					isStaged: false
				});
			}
		});

		const getDirectoryDiff = (dirPath: string, relativeRoot: string, depth = 0): { diff: string; additions: number } => {
			let diff = '';
			let additions = 0;

			// Prevent deep recursive scans or heap overflows on huge folders
			if (depth > 4) return { diff, additions };

			try {
				const items = fs.readdirSync(dirPath);
				for (const item of items) {
					// Ignore common massive build artifacts and dependency folders
					if ([
						'.git', 'node_modules', '.svelte-kit', 'dist', 'build', 
						'.vscode', 'out', 'target', 'vendor', '.gradle', '.idea', 'bin', 'obj'
					].includes(item)) {
						continue;
					}
					
					const fullPath = path.join(dirPath, item);
					const relPath = path.join(relativeRoot, item);
					const stat = fs.lstatSync(fullPath);

					if (stat.isDirectory()) {
						const sub = getDirectoryDiff(fullPath, relPath, depth + 1);
						diff += sub.diff;
						additions += sub.additions;
					} else if (stat.isFile()) {
						try {
							// Skip reading huge text files
							if (stat.size > 200 * 1024) continue;

							const content = fs.readFileSync(fullPath, 'utf8');
							const dLines = content.split('\n');
							diff += `\n--- ${relPath} ---\n`;
							diff += dLines.map((l) => `+${l}`).join('\n') + '\n';
							additions += dLines.length;
						} catch (e) {}
					}
				}
			} catch (e) {}
			return { diff, additions };
		};

		const processSuggestion = (change: any) => {
			let functions: string[] = [];
			let diffData = '';
			let diffStats = { additions: 0, deletions: 0 };

			const fullPath = path.resolve(targetPath, change.file);

			if (change.type !== 'Deleted') {
				try {
					// 1. Skip generating massive diff strings for huge/ignored files to prevent heavy CPU lags on big projects
					const isHugeFile = (() => {
						try {
							const stats = fs.statSync(fullPath);
							return stats.isFile() && stats.size > 250 * 1024; // > 250KB is considered huge for active diff parsing
						} catch { return false; }
					})();

					if (isHugeFile) {
						diffData = "File diff skipped (File too large)";
						return {
							...change,
							functions: [],
							diff: diffData,
							stats: { additions: 0, deletions: 0 }
						};
					}

					let diffCmd = change.isStaged
						? `git -C "${targetPath}" diff --cached -U3 "${change.file}"`
						: `git -C "${targetPath}" diff -U3 "${change.file}"`;

					if (
						change.status === '?' ||
						change.status === '??' ||
						(change.isStaged && change.status === 'A')
					) {
						if (fs.existsSync(fullPath)) {
							const stat = fs.lstatSync(fullPath);
							if (stat.isDirectory()) {
								const dirDiff = getDirectoryDiff(fullPath, change.file);
								diffData = dirDiff.diff || 'New empty directory';
								diffStats.additions = dirDiff.additions;
							} else {
								const content = fs.readFileSync(fullPath, 'utf8');
								const dLines = content.split('\n');
								// Only include the first 1000 lines of massive new files to avoid bloating client DOMs
								diffData = dLines.slice(0, 1000).map((l) => `+${l}`).join('\n');
								if (dLines.length > 1000) {
									diffData += '\n... [Diff truncated to 1000 lines] ...\n';
								}
								diffStats.additions = dLines.length;

								if (
									fullPath.endsWith('.ts') ||
									fullPath.endsWith('.js') ||
									fullPath.endsWith('.svelte')
								) {
									const functionMatches = content.match(
										/function\s+(\w+)|const\s+(\w+)\s*=\s*(\(.*?\)|.*?)\s*=>/g
									);
									if (functionMatches) {
										functions = functionMatches
											.map((m) => m.match(/(?:function\s+|const\s+)(\w+)/)?.[1])
											.filter(
												(n) =>
													n &&
													![
														'onMount',
														'onDestroy',
														'$state',
														'$derived',
														'$props',
														'$effect'
													].includes(n)
											) as string[];
									}
								}
							}
						}
					} else {
						// For standard diffs
						try {
							// Optimize execSync with limits
							diffData = execSync(diffCmd, { timeout: 350, maxBuffer: 1024 * 1024 }).toString();
							const dLines = diffData.split('\n');
							dLines.forEach((l) => {
								if (l.startsWith('+') && !l.startsWith('+++')) diffStats.additions++;
								if (l.startsWith('-') && !l.startsWith('---')) diffStats.deletions++;
							});

							dLines
								.filter((l) => l.startsWith('@@'))
								.forEach((header) => {
									const match = header.match(/@@.*@@\s+(?:.*?\s+)?(\w+)/);
									if (match && match[1] && !/^\d+$/.test(match[1])) functions.push(match[1]);
								});

							dLines
								.filter((l) => l.startsWith('+') && !l.startsWith('+++'))
								.forEach((l) => {
									const fMatch = l.match(/(?:function\s+|const\s+)(\w+)\s*=?\s*(?:\(|=)/);
									if (fMatch && fMatch[1]) functions.push(fMatch[1]);
								});
						} catch (e) {}
					}
				} catch (e) {}
			}

			return {
				...change,
				functions: [...new Set(functions)].filter((f) => f && f.length > 2).slice(0, 8),
				diff: diffData,
				stats: diffStats
			};
		};

		const suggestions = unstagedFiles.map(processSuggestion);
		const stagedChanges = stagedFiles.map(processSuggestion);

		let recentCommits: string[] = [];
		try {
			const logOutput = execSync(`git -C "${targetPath}" log -n 3 --oneline`).toString();
			recentCommits = logOutput.split('\n').filter((l) => l.trim() !== '');
		} catch (e) {}

		return json({
			success: true,
			path: targetPath,
			suggestions,
			stagedChanges,
			recentCommits
		});
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const { projectPath, file, stage, all } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		let cmd = '';
		if (all) {
			cmd = stage ? `git -C "${projectPath}" add .` : `git -C "${projectPath}" reset HEAD .`;
		} else {
			if (!file) {
				return json({ success: false, error: 'File is required' }, { status: 400 });
			}
			cmd = stage ? `git -C "${projectPath}" add "${file}"` : `git -C "${projectPath}" reset HEAD "${file}"`;
		}

		try {
			execSync(cmd);
			return json({ success: true });
		} catch (err: any) {
			return json(
				{
					success: false,
					error: `Git command failed`,
					raw: err.stdout?.toString() || err.message
				},
				{ status: 400 }
			);
		}
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { projectPath, message, files } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		if (!message || message.trim() === '') {
			return json({ success: false, error: 'Commit message is required' }, { status: 400 });
		}

		if (files && files.length > 0) {
			const stageCmd = `git -C "${projectPath}" add ${files.map((f: string) => `"${f}"`).join(' ')}`;
			execSync(stageCmd);
		} else {
			const status = execSync(`git -C "${projectPath}" status --porcelain`).toString();
			const hasStaged = /^[MADR]/.test(status);
			if (!hasStaged) {
				execSync(`git -C "${projectPath}" add .`);
			}
		}

		const tempMsgFile = path.join(os.tmpdir(), `ohmycode_commit_${Date.now()}.txt`);
		fs.writeFileSync(tempMsgFile, message, 'utf8');
		
		const filesArgs =
			files && files.length > 0 ? `-- ${files.map((f: string) => `"${f}"`).join(' ')}` : '';

		try {
			const commitOutput = execSync(
				`git -C "${projectPath}" commit --allow-empty --no-verify -F "${tempMsgFile}" ${filesArgs}`
			).toString();
			fs.unlinkSync(tempMsgFile);
			return json({ success: true, output: commitOutput });
		} catch (commitErr: any) {
			if (fs.existsSync(tempMsgFile)) fs.unlinkSync(tempMsgFile);
			return json(
				{
					success: false,
					error: 'Git commit failed.',
					raw: commitErr.stdout?.toString() || commitErr.message
				},
				{ status: 400 }
			);
		}
	} catch (error) {
		console.error('Git Commit API Error:', error);
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	try {
		const { projectPath } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		const undoCmd = `git -C "${projectPath}" reset --soft HEAD~1`;
		
		try {
			const output = execSync(undoCmd).toString();
			return json({ success: true, output });
		} catch (err: any) {
			return json({
				success: false,
				error: 'Failed to undo commit.',
				raw: err.stdout?.toString() || err.message
			}, { status: 400 });
		}
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
