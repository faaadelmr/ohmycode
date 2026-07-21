import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const homeDir = os.homedir();

if (os.platform() === 'win32') {
	const omcDir = path.join(homeDir, '.ohmycode');
	if (!fs.existsSync(omcDir)) {
		fs.mkdirSync(omcDir, { recursive: true });
	}

	const vbsPath = path.join(omcDir, 'ohmycode-silent.vbs');
	const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
	const cmdPath = path.join(appData, 'npm', 'ohmycode.cmd');

	const vbsContent = `Set WshShell = CreateObject("WScript.Shell")\nWshShell.Run """${cmdPath}""", 0, False\n`;
	fs.writeFileSync(vbsPath, vbsContent);

	exec(
		`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "ohmycode" /t REG_SZ /d "wscript.exe \\"${vbsPath}\\"" /f`,
		(err) => {
			if (err) {
				console.warn('Failed to register ohmycode in startup registry:', err.message);
			} else {
				console.log('ohmycode successfully registered for Windows Startup.');
			}
		}
	);
} else if (os.platform() === 'linux') {
	const linuxAutostartDir = path.join(homeDir, '.config', 'autostart');
	try {
		if (!fs.existsSync(linuxAutostartDir)) {
			fs.mkdirSync(linuxAutostartDir, { recursive: true });
		}
		const desktopPath = path.join(linuxAutostartDir, 'ohmycode.desktop');
		const desktopContent = `[Desktop Entry]
Type=Application
Name=OhMyCode
Exec=ohmycode
X-GNOME-Autostart-enabled=true
Terminal=false
`;
		fs.writeFileSync(desktopPath, desktopContent);
		console.log('ohmycode successfully registered for Linux Startup (Desktop autostart).');
	} catch (err) {
		console.warn('Failed to register ohmycode in Linux autostart:', err.message);
	}
} else if (os.platform() === 'darwin') {
	const launchAgentsDir = path.join(homeDir, 'Library', 'LaunchAgents');
	try {
		if (!fs.existsSync(launchAgentsDir)) {
			fs.mkdirSync(launchAgentsDir, { recursive: true });
		}
		const plistPath = path.join(launchAgentsDir, 'com.ohmycode.startup.plist');
		const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ohmycode.startup</string>
    <key>ProgramArguments</key>
    <array>
        <string>bash</string>
        <string>-c</string>
        <string>ohmycode</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
`;
		fs.writeFileSync(plistPath, plistContent);
		console.log('ohmycode successfully registered for macOS Startup (Launch Agent).');
	} catch (err) {
		console.warn('Failed to register ohmycode in macOS LaunchAgents:', err.message);
	}
}
