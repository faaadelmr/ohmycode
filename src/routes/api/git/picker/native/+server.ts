import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { execFileSync } from 'child_process';

export const GET: RequestHandler = async () => {
	try {
		// PowerShell script to open the native Windows Folder Browser Dialog
		const psScript = `
			Add-Type -AssemblyName System.Windows.Forms;
			$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;
			$dialog.Description = 'Select Folder';
			$dialog.ShowNewFolderButton = $true;
			$res = $dialog.ShowDialog();
			if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
				Write-Output $dialog.SelectedPath
			}
		`;

		const output = execFileSync('powershell', ['-NoProfile', '-Command', psScript], {
			encoding: 'utf8',
			timeout: 60000 // 1 minute timeout in case the user leaves it open
		}).trim();

		if (output) {
			return json({ success: true, path: output });
		} else {
			return json({ success: false, error: 'User cancelled folder selection' });
		}
	} catch (error) {
		console.error('Native Picker Error:', error);
		return json(
			{
				success: false,
				error: 'Failed to open native folder browser',
				raw: (error as Error).message
			},
			{ status: 500 }
		);
	}
};
