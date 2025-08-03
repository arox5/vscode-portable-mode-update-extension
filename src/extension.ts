// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const vscodeDir = path.dirname(process.execPath);
//const vscodeDir = "C:\\Temp\\VSCode";

const vscodeLabel = "Visual Studio Code";
const outputChannel = vscode.window.createOutputChannel('Portable mode update');

// set to false, to just create the update script without running it
// set to true, to run the update script automatically after creation
let demoMode = false;
const demoModeMsg = 
	"**************************************************************************\n" +
	"* Demo mode is enabled, update script will not be executed automatically *\n" +
	"**************************************************************************\n";

interface VSCodeRelease {
    tag_name: string;
    assets: Array<{
        name: string;
        browser_download_url: string;
    }>;
}

async function getLatestVSCodeRelease(): Promise<VSCodeRelease> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/microsoft/vscode/releases/latest',
            headers: {
                'User-Agent': 'Portable-mode-update'
            }
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data) as VSCodeRelease;
                    resolve(release);
                } catch (error) {
                    reject(new Error('Error parsing version data: ' + (error instanceof Error ? error.message : String(error))));
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

async function downloadFile(url: string, destinationPath: string, redirectCount = 0): Promise<void> {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            reject(new Error('Too many redirects'));
            return;
        }
        const file = fs.createWriteStream(destinationPath);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect
                const location = response.headers.location;
                if (location) {
                    file.close();
                    fs.unlink(destinationPath, () => {
                        downloadFile(location, destinationPath, redirectCount + 1).then(resolve, reject);
                    });
                    return;
                } else {
                    reject(new Error('Redirect with no location header'));
                    return;
                }
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (error) => {
            fs.unlink(destinationPath, () => {
                reject(error);
            });
        });
    });
}

async function updateVSCode(downloadUrl: string): Promise<void> {
    const downloadPath = path.join(process.env.TEMP || '', 'vscode-portable-mode-update.zip');

    try {
				outputChannel.appendLine(`Downloading update from: ${downloadUrl}`);
				await downloadFile(downloadUrl, downloadPath);
				outputChannel.appendLine(`Download completed: ${downloadPath}`);
				outputChannel.appendLine(``);
        // outputChannel.appendLine(`Creating script...`);
        // outputChannel.appendLine(``);

        // Create update script
        const scriptExt = process.platform === 'win32' ? 'ps1' : 'sh';
        const scriptPath = path.join(process.env.TEMP || '', `vscode-portable-mode-update.${scriptExt}`);
        let scriptContent: string;
        if (process.platform === 'win32') {
            scriptContent = `
$downloadPath = '${downloadPath}'
$vscodeDir = '${vscodeDir}'

Write-Host 'Waiting for VS Code to close...'
$vscodeExePath = Join-Path $vscodeDir "Code.exe"
$vscodeProcess = Get-Process | Where-Object { $_.Path -eq $vscodeExePath } -ErrorAction SilentlyContinue
$waitTime = 0
while ($vscodeProcess -and $waitTime -lt 30) {
    Start-Sleep -Seconds 1
    $waitTime++
    $vscodeProcess = Get-Process | Where-Object { $_.Path -eq $vscodeExePath } -ErrorAction SilentlyContinue
    Write-Host "Waiting for VS Code at $vscodeExePath to close... ($waitTime/30 seconds)"
}

if ($vscodeProcess) {
    Write-Host "VS Code is still running from $vscodeExePath. Please close it manually and press Enter to continue."
    Read-Host
}

$ProgressPreference = 'SilentlyContinue'

Write-Host ''
Write-Host 'Expanding archive...'
Write-Host ' from: ' $downloadPath
Write-Host ' to:   ' $vscodeDir
Expand-Archive -Force $downloadPath $vscodeDir
Write-Host ''
Write-Host 'Deleting archive...'
Write-Host ' from: ' $downloadPath
Remove-Item $downloadPath
Write-Host ''
Write-Host 'Update complete. This process doesn''t restart ${vscodeLabel}, you have to restart it manually.'
Write-Host ''
Write-Host 'Press Enter to close this window.'
Read-Host
            `.trim();
        } else {
            scriptContent = `
#!/bin/bash
sleep 2
downloadPath='${downloadPath}'
vscodeDir='${vscodeDir}'
echo "Expanding archive..."
echo " from: $downloadPath"
echo " to:   $vscodeDir"
unzip -o "$downloadPath" -d "$vscodeDir"
echo ""
echo "Deleting archive..."
echo " from: $downloadPath"
rm "$downloadPath"
echo ""
echo "Update complete. This process doesn't restart ${vscodeLabel}, you have to restart it manually."
echo ""
echo "Press Enter to close this window."
read
            `.trim();
        }

        fs.writeFileSync(scriptPath, scriptContent);
        // outputChannel.show(true);
        outputChannel.appendLine(`Update script file: ${scriptPath}`);
        outputChannel.appendLine(``);

        if (process.platform !== 'win32') {
            fs.chmodSync(scriptPath, '755');
        }

        if( demoMode ) {
            outputChannel.appendLine(`${demoModeMsg}`);
        } else {
            outputChannel.appendLine(`Process update is starting.`);
            outputChannel.appendLine(``);

            // Check Window: Confirm Before Close setting
            const confirmBeforeClose = vscode.workspace.getConfiguration('window').get<string>('confirmBeforeClose', 'keyboardOnly');
            
            if (confirmBeforeClose !== 'never') {
                outputChannel.appendLine(`Note: 'Window: Confirm Before Close' is enabled (${confirmBeforeClose}). Please close VS Code manually after the PowerShell window opens.`);
                outputChannel.appendLine(``);
            }

            // Execute the update script as a detached process and exit VS Code
            if (process.platform === 'win32') {
                const quotedScriptPath = `"${scriptPath}"`;
                
                // Run the update script in a new terminal outside VS Code
                require('child_process').exec(`start powershell.exe -ExecutionPolicy Bypass -File ${quotedScriptPath}`);
                
                // Only attempt automatic close if confirmation is disabled
                if (confirmBeforeClose === 'never') {
                    setTimeout(() => {
                        vscode.commands.executeCommand('workbench.action.closeWindow');
                    }, 1000);
                } else {
                    // Show a message to the user
                    vscode.window.showInformationMessage(
                        'Update script has started in PowerShell. Please close VS Code manually to complete the update.',
                        'Close VS Code Now'
                    ).then(selection => {
                        if (selection === 'Close VS Code Now') {
                            vscode.commands.executeCommand('workbench.action.closeWindow');
                        }
                    });
                }
            } else {
                spawn('bash', [scriptPath], { detached: true, stdio: 'ignore' }).unref();
                
                // For non-Windows, still attempt to close (less likely to have confirmation issues)
                setTimeout(() => {
                    vscode.commands.executeCommand('workbench.action.closeWindow');
                }, 1000);
            }
        }
    } catch (error) {
        throw new Error(`Failed to update ${vscodeLabel}: ${error instanceof Error ? error.message : String(error)}`);        
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "Portable mode update" is now active');

    // Register the command
    context.subscriptions.push(vscode.commands.registerCommand('portable-mode-update.checkVersion', async () => {
        try {
            const currentVersion = vscode.version;
            const release = await getLatestVSCodeRelease();
            const latestVersion = release.tag_name.replace(/^v/, '');
            
            outputChannel.clear();

						// set focus on the output channel
						outputChannel.show(true);

						outputChannel.appendLine(`Portable mode directory: ${vscodeDir}`);
						outputChannel.appendLine(``);

            // take setting from configuration
            demoMode = vscode.workspace.getConfiguration('portable-mode-update').get<boolean>('demoMode', false);

            if (demoMode) {
                outputChannel.appendLine(`${demoModeMsg}`);
            }
            outputChannel.appendLine(`Current ${vscodeLabel} version: ${currentVersion}`);
            outputChannel.appendLine(`Latest available version: ${latestVersion}`);
            outputChannel.appendLine(``);

            if (latestVersion > currentVersion) {
                // Find the Windows ZIP asset
                let downloadUrl: string | undefined;
                const windowsAsset = release.assets.find(asset => 
                    asset.name.endsWith('.zip') && 
                    asset.name.includes('win32-x64')
                );

                if (windowsAsset) {
                    downloadUrl = windowsAsset.browser_download_url;
                } else {
                    // Fallback to official download URL if asset not found
										if (process.platform === 'win32') {
												downloadUrl = vscode.workspace.getConfiguration('portable-mode-update').get<string>('win32DownloadURL', 'https://code.visualstudio.com/sha/download?build=stable&os=win32-x64-archive');
										} else {
												downloadUrl = undefined;
										}
                }

								if (downloadUrl) {
									const response = await vscode.window.showInformationMessage(
											`A new version of ${vscodeLabel} (${latestVersion}) is available. Would you like to update your portable mode installation, available at folder ${vscodeDir}? Clicking 'Yes' will download the update, close ${vscodeLabel} and run the update script.`,
											'Yes', 'No'
									);
									if (response === 'Yes') {
											await updateVSCode(downloadUrl);
									} else {
											outputChannel.appendLine(`Update cancelled.`);
									}
								} else {
                outputChannel.appendLine(`Unable to define a download URL, the platform (${process.platform}) is not supported for automatic updates. Please download the latest version of ${vscodeLabel} manually from the official website.`);
            	}
            } else {
                outputChannel.appendLine(`You are already using the latest version.`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to check ${vscodeLabel} versions: ${error}`);
        }
    }));

    // Check if startup execution is enabled and run the update check automatically on startup
    const startUpEnabled = vscode.workspace.getConfiguration('portable-mode-update').get<boolean>('startUp', true);
    if (startUpEnabled) {
        vscode.commands.executeCommand('portable-mode-update.checkVersion');
    } else {
				outputChannel.appendLine(`The version check during startup is disabled.`);
				outputChannel.appendLine(``);
		}
}

// This method is called when your extension is deactivated
export function deactivate(): void {
    // Clean up resources here if needed
}
