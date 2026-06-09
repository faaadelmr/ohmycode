import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSettings, saveSettings, getLogsRoot, getDefaultLogsRoot } from '$lib/server/settings';
import fs from 'fs';
import { readGitConfigValue, writeGlobalGitConfig } from '$lib/server/git';

export const GET: RequestHandler = async () => {
	try {
		const settings = getSettings();
		const logsRoot = getLogsRoot();
		const defaultLogsRoot = getDefaultLogsRoot();
		const globalAuthorName = readGitConfigValue(process.cwd(), 'user.name');
		const globalAuthorEmail = readGitConfigValue(process.cwd(), 'user.email');
		return json({
			success: true,
			settings,
			logsRoot,
			defaultLogsRoot,
			gitAuthor: {
				name: settings.gitAuthorName ?? globalAuthorName,
				email: settings.gitAuthorEmail ?? globalAuthorEmail,
				globalName: globalAuthorName,
				globalEmail: globalAuthorEmail,
				updateGlobal: settings.updateGlobalGitAuthor ?? false
			}
		});
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { logStoragePath, gitAuthorName, gitAuthorEmail, updateGlobalGitAuthor } = body;

		const hasLogStoragePath = Object.prototype.hasOwnProperty.call(body, 'logStoragePath');
		const nextLogStoragePath =
			typeof logStoragePath === 'string' ? logStoragePath.trim() : '';

		// Validate path if provided
		if (hasLogStoragePath && nextLogStoragePath) {
			if (!fs.existsSync(nextLogStoragePath)) {
				// Try to create the directory
				try {
					fs.mkdirSync(nextLogStoragePath, { recursive: true });
				} catch {
					return json(
						{ success: false, error: 'Path does not exist and could not be created' },
						{ status: 400 }
					);
				}
			}
		}

		const current = getSettings();
		let nextSettings = current;
		if (hasLogStoragePath) {
			nextSettings = { ...nextSettings, logStoragePath: nextLogStoragePath || undefined };
		}

		const hasGitAuthorName = Object.prototype.hasOwnProperty.call(body, 'gitAuthorName');
		const hasGitAuthorEmail = Object.prototype.hasOwnProperty.call(body, 'gitAuthorEmail');
		const hasUpdateGlobalGitAuthor = Object.prototype.hasOwnProperty.call(
			body,
			'updateGlobalGitAuthor'
		);
		const nextGitAuthorName =
			typeof gitAuthorName === 'string' ? gitAuthorName.trim() : current.gitAuthorName;
		const nextGitAuthorEmail =
			typeof gitAuthorEmail === 'string' ? gitAuthorEmail.trim() : current.gitAuthorEmail;
		const shouldUpdateGlobal =
			typeof updateGlobalGitAuthor === 'boolean'
				? updateGlobalGitAuthor
				: current.updateGlobalGitAuthor ?? false;

		if (hasGitAuthorName || hasGitAuthorEmail || hasUpdateGlobalGitAuthor) {
			nextSettings = {
				...nextSettings,
				gitAuthorName: nextGitAuthorName || undefined,
				gitAuthorEmail: nextGitAuthorEmail || undefined,
				updateGlobalGitAuthor: shouldUpdateGlobal
			};

			if (shouldUpdateGlobal && nextGitAuthorName) {
				writeGlobalGitConfig('user.name', nextGitAuthorName);
			}

			if (shouldUpdateGlobal && nextGitAuthorEmail) {
				writeGlobalGitConfig('user.email', nextGitAuthorEmail);
			}
		}

		saveSettings(nextSettings);

		const globalAuthorName = readGitConfigValue(process.cwd(), 'user.name');
		const globalAuthorEmail = readGitConfigValue(process.cwd(), 'user.email');

		return json({
			success: true,
			logsRoot: getLogsRoot(),
			gitAuthor: {
				name: nextSettings.gitAuthorName ?? globalAuthorName,
				email: nextSettings.gitAuthorEmail ?? globalAuthorEmail,
				globalName: globalAuthorName,
				globalEmail: globalAuthorEmail,
				updateGlobal: nextSettings.updateGlobalGitAuthor ?? false
			}
		});
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
