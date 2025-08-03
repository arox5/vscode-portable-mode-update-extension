# portable-mode-update

A VS Code extension to check for updates and automatically update your portable VS Code installation.

## Features

- Check your current VS Code version and the latest available version from GitHub
- If a new version is available, download and update your portable VS Code automatically
- Supports Windows (PowerShell) and Linux/macOS (Bash)
- Shows progress and logs in the VS Code Output panel

## Usage

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run `Portable mode update`
3. If an update is available, follow the prompts to update your portable VS Code

## Requirements

- For Windows: PowerShell must be available
- For Linux/macOS: Bash and curl must be available
- The extension works best with portable VS Code installations

## Configuration

You can control whether the update script is executed automatically using the `demoMode` setting:

- Open VS Code settings (`Ctrl+,` or `Cmd+,`)
- Search for `Portable Mode Update: Demo Mode`
- If enabled, the extension will only create the update script and will not execute it automatically (for demo/testing purposes).
- If disabled (default), the update script will run after creation and update your portable VS Code installation.

Alternatively, add this to your `settings.json`:

```json
"portable-mode-update.demoMode": false
```

## Packaging and Sharing

To create a `.vsix` package for sharing:

1. Install dependencies: `npm install`
2. Run: `npm run vsce:package`
3. Share the generated `.vsix` file

Note: `@vscode/vsce` is included as a dev dependency, so no global installation is required.

To install the extension from a `.vsix` file:

```
code --install-extension portable-mode-update-<version>.vsix
```

## Known Issues

- The update script does not restart VS Code automatically after updating. Please restart manually.
- Only portable installations are supported for automatic update.

## Release Notes

### 0.0.1
- Initial release: check, download, and update portable VS Code

---

**Enjoy using portable-mode-update!**
