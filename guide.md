# Obsidian Plugin Development for iOS

A comprehensive guide to developing Obsidian plugins that work on iOS devices.

## Requirements

### Development Environment

- **Node.js**: v16 or higher
- **TypeScript**: Recommended for type safety
- **Bundler**: esbuild (default), Rollup, or Webpack

### Setup

```bash
# Clone the sample plugin
git clone https://github.com/obsidianmd/obsidian-sample-plugin
cd obsidian-sample-plugin
npm install
npm run dev  # Watch mode for development
npm run build  # Production build
npm run lint  # Check for code issues
```

### Key Files

| File | Purpose |
|------|---------|
| `main.ts` | Plugin source code |
| `manifest.json` | Plugin metadata, version, compatibility flags |
| `styles.css` | Optional styling |
| `esbuild.config.mjs` | Build configuration |

---

## iOS-Specific Considerations

### Critical Limitations

#### 1. No Node.js or Electron APIs

These APIs are **not available** on mobile and will cause your plugin to crash:

```typescript
// DO NOT USE ON MOBILE
require('fs')        // Node filesystem
require('crypto')    // Node crypto
require('buffer')    // Node buffer
require('electron')  // Electron APIs
require('path')      // Node path
```

#### 2. No Regex Lookbehind

iOS Safari does not support lookbehind assertions in regular expressions:

```typescript
// DOES NOT WORK ON iOS
const regex = /(?<=prefix)content/;

// WORKAROUND: Use capture groups instead
const regex = /(prefix)(content)/;
```

#### 3. No Direct Filesystem Access

Use Obsidian's Vault API instead of Node's `fs` module:

```typescript
// WRONG - Node.js (crashes on mobile)
import * as fs from 'fs';
fs.readFileSync('/path/to/file');

// CORRECT - Obsidian API (works everywhere)
const file = this.app.vault.getAbstractFileByPath('path/to/file.md');
if (file instanceof TFile) {
  const content = await this.app.vault.read(file);
}
```

### What Works on iOS

- Browser-compatible JavaScript/TypeScript
- Obsidian's APIs: `Vault`, `Workspace`, `MetadataCache`, `App`
- Standard Web APIs: `fetch`, `localStorage`, `IndexedDB`
- Web Crypto API (instead of Node crypto)
- Browser-compatible npm packages

---

## Platform Detection

Use the `Platform` API for conditional logic:

```typescript
import { Platform } from "obsidian";

// Check specific platforms
if (Platform.isIosApp) {
  // iOS-specific code
}

if (Platform.isAndroidApp) {
  // Android-specific code
}

if (Platform.isMobile) {
  // Any mobile platform (iOS or Android)
}

if (Platform.isDesktop) {
  // Desktop only (Windows, macOS, Linux)
}
```

### Example: Platform-Specific Features

```typescript
async function encryptData(data: string): Promise<string> {
  if (Platform.isDesktop) {
    // Use Node crypto on desktop
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  } else {
    // Use Web Crypto API on mobile
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
```

---

## Testing for iOS

### Desktop Emulation (Quick Testing)

You can emulate mobile behavior directly from the Developer Console:

```javascript
// Open Developer Tools: Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows/Linux)

// Enable mobile emulation
this.app.emulateMobile(true);

// Disable mobile emulation
this.app.emulateMobile(false);

// Toggle mobile emulation
this.app.emulateMobile(!this.app.isMobile);
```

> **Note**: This emulates the mobile UI and sets `Platform.isMobile` to true, but does not replicate iOS JavaScript engine limitations (like missing lookbehind support).

### On-Device Testing

1. Build your plugin:
   ```bash
   npm run build
   ```

2. Copy these files to your vault's plugin folder:
   ```
   YourVault/.obsidian/plugins/your-plugin-id/
   ├── main.js
   ├── manifest.json
   └── styles.css (if applicable)
   ```

3. Sync the vault to iOS using one of:
   - Obsidian Sync
   - iCloud Drive
   - Working Copy (Git)

4. On iOS, go to **Settings → Community Plugins** and enable your plugin

### Debugging on iOS

Unlike Android, iOS doesn't have easy remote debugging access. Options include:

1. **Console logging**: Use `console.log()` and check for errors in plugin behavior
2. **Notice API**: Display debug info using Obsidian's notice system:
   ```typescript
   new Notice(`Debug: ${variableToInspect}`);
   ```
3. **Test on desktop emulation first**: Catch most issues before deploying to device

---

## manifest.json Configuration

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin Name",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "A brief description of your plugin",
  "author": "Your Name",
  "authorUrl": "https://your-website.com",
  "isDesktopOnly": false
}
```

### Key Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (lowercase, hyphens allowed) |
| `minAppVersion` | Minimum Obsidian version required |
| `isDesktopOnly` | Set to `true` if plugin requires Node.js/Electron APIs |

---

## Best Practices for iOS Compatibility

### 1. Use Obsidian's Vault API for File Operations

```typescript
// Reading files
const content = await this.app.vault.read(file);
const cachedContent = await this.app.vault.cachedRead(file);

// Writing files
await this.app.vault.modify(file, newContent);
await this.app.vault.create('path/to/new-file.md', content);

// Deleting files
await this.app.vault.delete(file);
await this.app.vault.trash(file, true); // Move to system trash
```

### 2. Use Browser-Compatible Crypto

```typescript
// Instead of Node's crypto, use Web Crypto API
async function generateHash(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
```

Or use a browser-compatible library like `crypto-js`:
```bash
npm install crypto-js
```

### 3. Avoid Lookbehind Regex

```typescript
// Instead of lookbehind
const badRegex = /(?<=\[\[).*?(?=\]\])/g;

// Use capture groups
const goodRegex = /\[\[(.*?)\]\]/g;
let match;
while ((match = goodRegex.exec(text)) !== null) {
  const innerContent = match[1]; // The captured group
}
```

### 4. Test Mobile Emulation Early

Add mobile testing to your development workflow from the start, not as an afterthought.

### 5. Bundle All Dependencies

Ensure your bundler (esbuild) packages all dependencies into a single `main.js` file. External requires will fail on mobile.

### 6. Handle Missing APIs Gracefully

```typescript
function safeRequire(module: string): any | null {
  try {
    return require(module);
  } catch {
    return null;
  }
}

const fs = safeRequire('fs');
if (fs) {
  // Desktop-only functionality
} else {
  // Mobile fallback
}
```

---

## Common Patterns

### Settings with Mobile Support

```typescript
interface MyPluginSettings {
  setting1: string;
  enableFeatureX: boolean;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  setting1: 'default',
  enableFeatureX: true
};

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new MySettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
```

### Mobile-Aware Commands

```typescript
this.addCommand({
  id: 'my-command',
  name: 'My Command',
  checkCallback: (checking: boolean) => {
    // Optionally hide command on mobile
    if (Platform.isMobile && !this.settings.enableOnMobile) {
      return false;
    }

    if (!checking) {
      this.executeCommand();
    }
    return true;
  }
});
```

---

## Resources

- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) - Official starter template
- [Official Developer Documentation](https://docs.obsidian.md/Plugins/Getting+started/Mobile+development) - Mobile development guide
- [Plugin Developer Docs - Mobile Testing](https://marcusolsson.github.io/obsidian-plugin-docs/testing/mobile-devices) - Testing procedures
- [Forum: Getting Plugins Working on Mobile](https://forum.obsidian.md/t/getting-my-plugin-working-on-mobile-devices/29816) - Community discussion
- [Mobile-Compatible Plugins List](https://publish.obsidian.md/hub/02+-+Community+Expansions/02.01+Plugins+by+Category/Mobile-compatible+plugins) - Reference implementations
- [Obsidian API Types](https://www.npmjs.com/package/obsidian) - TypeScript definitions
