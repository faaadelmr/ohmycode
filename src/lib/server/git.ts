import { execFileSync, type ExecFileSyncOptions } from 'child_process';

type GitExecOptions = {
	env?: NodeJS.ProcessEnv;
	maxBuffer?: number;
	timeout?: number;
};

function runGitCommand(args: string[], options: GitExecOptions = {}) {
	return execFileSync('git', args, {
		encoding: 'utf8',
		maxBuffer: options.maxBuffer ?? 1024 * 1024,
		timeout: options.timeout ?? 5000,
		env: options.env,
		stdio: ['ignore', 'pipe', 'pipe']
	} as ExecFileSyncOptions).toString();
}

export function runGit(projectPath: string, args: string[], options: GitExecOptions = {}) {
	return runGitCommand(['-C', projectPath, ...args], options);
}

export function runGlobalGit(args: string[], options: GitExecOptions = {}) {
	return runGitCommand(args, options);
}

export function readGitConfigValue(projectPath: string, key: string) {
	const commands = [
		() => runGlobalGit(['config', '--global', '--get', key]),
		() => runGit(projectPath, ['config', '--get', key])
	];

	for (const command of commands) {
		try {
			const value = command().trim();
			if (value) return value;
		} catch {
			/* try next command */
		}
	}

	return '';
}

export function writeGlobalGitConfig(key: string, value: string) {
	runGlobalGit(['config', '--global', key, value]);
}

export function isInsideWorkTree(projectPath: string) {
	try {
		return runGit(projectPath, ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
	} catch {
		return false;
	}
}

export function getStatusPorcelain(projectPath: string, file?: string) {
	const args = ['status', '--porcelain'];
	if (file) args.push('--', file);
	return runGit(projectPath, args);
}

export function getDiff(projectPath: string, file: string, staged = false) {
	const args = staged ? ['diff', '--cached', '-U3', '--', file] : ['diff', '-U3', '--', file];
	return runGit(projectPath, args, { timeout: 1000, maxBuffer: 1024 * 1024 });
}

export function stageFiles(projectPath: string, files: string[]) {
	runGit(projectPath, ['add', '--', ...files]);
}

export function stageAll(projectPath: string) {
	runGit(projectPath, ['add', '.']);
}

export function unstageFiles(projectPath: string, files: string[]) {
	runGit(projectPath, ['reset', 'HEAD', '--', ...files]);
}

export function unstageAll(projectPath: string) {
	runGit(projectPath, ['reset', 'HEAD', '.']);
}

export function getRecentCommitLines(projectPath: string, count = 3) {
	return runGit(projectPath, ['log', '-n', String(count), '--oneline'])
		.split('\n')
		.filter((line) => line.trim() !== '');
}

export function getShortHead(projectPath: string) {
	return runGit(projectPath, ['rev-parse', '--short', 'HEAD']).trim();
}

export function getFullHead(projectPath: string) {
	return runGit(projectPath, ['rev-parse', 'HEAD']).trim();
}

export function getCurrentBranch(projectPath: string) {
	return runGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
}

export function getLatestCommitField(
	projectPath: string,
	format: string,
	extraArgs: string[] = []
) {
	return runGit(projectPath, ['log', '-n', '1', `--format=${format}`, ...extraArgs]).trim();
}

export function commit(
	projectPath: string,
	messageFile: string,
	files: string[],
	env?: NodeJS.ProcessEnv
) {
	const args = ['commit', '--no-verify', '-F', messageFile];
	if (files.length > 0) args.push('--', ...files);
	return runGit(projectPath, args, { env });
}
