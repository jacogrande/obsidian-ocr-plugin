# Notebook Scanner

An Obsidian plugin that converts photos of handwritten notebook pages into organized, searchable markdown notes using LLM vision.

## Features

- **Upload or Capture**: Upload photos from your device or capture directly from your camera on mobile
- **Batch Processing**: Upload multiple pages at once - the backend processes them asynchronously
- **Automatic Organization**: Notes are automatically titled, tagged, and formatted based on content
- **Background Sync**: Completed notes sync automatically to your vault
- **Queue Management**: View processing status, retry failed jobs, and manage your queue
- **Mobile-First Design**: Touch-friendly UI optimized for iOS and Android

## Requirements

- Obsidian 1.0.0 or later
- A running instance of the Notebook Scanner backend service

## Installation

### From Source

1. Clone this repository into your vault's plugins folder:
   ```bash
   cd /path/to/your/vault/.obsidian/plugins
   git clone https://github.com/your-repo/notebook-scanner.git
   cd notebook-scanner
   npm install
   npm run build
   ```

2. Enable the plugin in Obsidian Settings > Community Plugins

### Manual Installation

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
2. Create a folder called `notebook-scanner` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into this folder
4. Enable the plugin in Obsidian Settings > Community Plugins

## Setup

On first launch, the plugin will guide you through setup:

1. **Service URL**: Enter the URL of your Notebook Scanner backend
2. **API Key**: Enter your API key for authentication
3. **Test Connection**: Verify everything is working

You can re-run the setup wizard anytime via the command palette: `Notebook Scanner: Setup Wizard`

## Usage

### Uploading Images

1. Click the notebook icon in the ribbon, or use the command `Notebook Scanner: Upload Images`
2. Drag and drop images, click to browse, or tap "Take Photo" on mobile
3. Click "Upload" to send images for processing
4. View the queue to track progress

### Viewing the Queue

Use `Notebook Scanner: View Queue` or click the status bar to see:
- **Pending**: Waiting to be processed
- **Processing**: Currently being analyzed
- **Completed**: Ready and synced to your vault
- **Failed**: Error occurred (tap to retry)

### Syncing Notes

Notes sync automatically in the background. You can also:
- Use `Notebook Scanner: Sync Now` to manually sync
- Click completed jobs in the queue to open the created note

## Commands

| Command | Description |
|---------|-------------|
| Upload Images | Open the upload modal |
| View Queue | Show processing queue |
| Sync Now | Manually sync completed jobs |
| Setup Wizard | Re-run initial configuration |
| Open Settings | Jump to plugin settings |

## Settings

| Setting | Description |
|---------|-------------|
| Service URL | Backend service endpoint |
| API Key | Authentication key |
| Output Folder | Where to save created notes (default: `Notebook Notes`) |
| Note Template | Customize note format with placeholders |
| Auto Sync | Enable background polling (default: on) |
| Poll Interval | How often to check for updates (default: 30s) |
| Notify on Sync | Show notification when notes sync |
| Keep Local Copy | Save uploaded images to vault |
| Attachment Folder | Where to save local image copies |

### Note Template Placeholders

| Placeholder | Description |
|-------------|-------------|
| `{{title}}` | Auto-generated title |
| `{{content}}` | Extracted note content |
| `{{tags}}` | Generated tags |
| `{{date}}` | Processing date |
| `{{source}}` | Original filename |

## Status Bar

The status bar shows current sync status:
- **Ready**: No pending jobs
- **3 pending**: Jobs waiting to process
- **Syncing...**: Currently syncing (shows progress for batches)
- **Paused - tap to resume**: Sync stopped due to errors (tap to retry)

## Development

```bash
# Install dependencies
npm install

# Build for development (with watch)
npm run dev

# Build for production
npm run build

# Deploy to local vault (edit deploy.sh first)
./deploy.sh
```

## Architecture

The plugin uses a client-server architecture:

1. **Plugin (Client)**: Handles UI, uploads images, polls for results
2. **Backend (Server)**: Processes images with LLM vision, extracts content

This separation allows:
- Heavy processing off-device
- Consistent results across platforms
- Background processing while you work

## License

MIT
