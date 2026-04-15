import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { RequestHandler } from './$types';
import os from 'os';

const execAsync = promisify(exec);

export const GET: RequestHandler = async () => {
	if (os.platform() !== 'win32') {
		return json({ success: false, error: 'Folder picker only supported on Windows' }, { status: 400 });
	}

	try {
		// The PowerShell script we want to run
		const psScript = `
			$app = New-Object -ComObject Shell.Application
			$folder = $app.BrowseForFolder(0, 'Select Project Folder', 0, 0)
			if ($folder) {
				Write-Output $folder.Self.Path
			}
		`.trim();

		// Base64 encode the script to avoid shell escaping issues
		// PowerShell expects UTF-16LE encoding for EncodedCommand
		const buffer = Buffer.from(psScript, 'utf16le');
		const encodedScript = buffer.toString('base64');
		
		const command = `powershell.exe -NoProfile -EncodedCommand ${encodedScript}`;
		
		const { stdout, stderr } = await execAsync(command);

		if (stderr && stderr.trim()) {
			console.error('PowerShell Error:', stderr);
		}

		const selectedPath = stdout.trim();

		if (!selectedPath) {
			return json({ success: false, error: 'No folder selected or dialog cancelled' });
		}

		return json({
			success: true,
			path: selectedPath
		});
	} catch (error) {
		console.error('Picker Exception:', error);
		return json({ success: false, error: `Picker Error: ${(error as Error).message}` }, { status: 500 });
	}
};
