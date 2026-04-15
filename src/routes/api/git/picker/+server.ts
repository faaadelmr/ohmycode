import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const GET: RequestHandler = async ({ url }) => {
	// Get path from query, default to User Home or Current Dir
	let targetPath = url.searchParams.get('path') || os.homedir();

	try {
		// Resolve potential relative paths (~ or .)
		if (targetPath.startsWith('~')) {
			targetPath = path.join(os.homedir(), targetPath.slice(1));
		}

		// List only directories
		const entries = fs.readdirSync(targetPath, { withFileTypes: true });
		const directories = entries
			.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
			.map(entry => entry.name)
			.sort((a, b) => a.localeCompare(b));

		return json({
			success: true,
			currentPath: path.resolve(targetPath),
			parentPath: path.dirname(path.resolve(targetPath)),
			directories,
			sep: path.sep // Return OS separator (\ for win, / for others)
		});
	} catch (error) {
		return json({ 
			success: false, 
			error: 'Access Denied or Folder Not Found',
			currentPath: targetPath 
		});
	}
};
