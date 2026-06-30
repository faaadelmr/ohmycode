import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import { runGit } from '$lib/server/git';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { projectPath } = await request.json();

		if (!projectPath || !fs.existsSync(projectPath)) {
			return json({ success: false, error: 'Valid project path is required' }, { status: 400 });
		}

		try {
			// Run git push with a 30-second timeout
			const output = runGit(projectPath, ['push'], { timeout: 30000 });
			return json({ success: true, output });
		} catch (err) {
			const error = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
			return json(
				{
					success: false,
					error: 'Git push failed.',
					raw: error.stdout?.toString() || error.stderr?.toString() || error.message
				},
				{ status: 400 }
			);
		}
	} catch (error) {
		console.error('Git Push API Error:', error);
		return json({ success: false, error: (error as Error).message }, { status: 500 });
	}
};
