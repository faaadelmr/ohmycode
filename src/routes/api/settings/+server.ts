import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSettings, saveSettings, getLogsRoot, getDefaultLogsRoot } from '$lib/server/settings';
import fs from 'fs';

export const GET: RequestHandler = async () => {
	try {
		const settings = getSettings();
		const logsRoot = getLogsRoot();
		const defaultLogsRoot = getDefaultLogsRoot();
		return json({
			success: true,
			settings,
			logsRoot,
			defaultLogsRoot
		});
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { logStoragePath } = body;

		// Validate path if provided
		if (logStoragePath?.trim()) {
			if (!fs.existsSync(logStoragePath.trim())) {
				// Try to create the directory
				try {
					fs.mkdirSync(logStoragePath.trim(), { recursive: true });
				} catch {
					return json(
						{ success: false, error: 'Path does not exist and could not be created' },
						{ status: 400 }
					);
				}
			}
		}

		const current = getSettings();
		saveSettings({ ...current, logStoragePath: logStoragePath?.trim() || undefined });

		return json({ success: true, logsRoot: getLogsRoot() });
	} catch (error) {
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
