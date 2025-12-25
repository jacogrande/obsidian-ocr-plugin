# Manual Testing Guide - Notebook Scanner

This guide covers manual testing procedures for the Notebook Scanner Obsidian plugin, with focus on the camera capture feature.

---

## Prerequisites

### Build the Plugin

```bash
cd /Users/jackson/Code/projects/notebook-scanner
npm install
npm run build
```

### Install in Obsidian

1. Create plugin folder:

   ```bash
   mkdir -p /path/to/your/vault/.obsidian/plugins/notebook-scanner
   ```

2. Copy build artifacts:

   ```bash
   cp main.js manifest.json styles.css /path/to/your/vault/.obsidian/plugins/notebook-scanner/
   ```

3. In Obsidian:
   - Open Settings > Community plugins
   - Disable Restricted Mode if prompted
   - Find "Notebook Scanner" and enable it

### Test Devices

- **iOS**: iPhone or iPad with Obsidian app installed
- **Android**: Android device with Obsidian app installed
- **Desktop**: macOS, Windows, or Linux with Obsidian desktop app

---

## Test Cases

### 1. Camera Button Visibility

#### TC1.1: Camera button shows on mobile only

| Platform | Expected Result                             |
| -------- | ------------------------------------------- |
| iOS      | "Take Photo" button visible below drop zone |
| Android  | "Take Photo" button visible below drop zone |
| Desktop  | "Take Photo" button NOT visible             |

**Steps:**

1. Open Obsidian on each platform
2. Configure plugin with service URL and API key (or skip onboarding)
3. Open Upload Modal (ribbon icon or command palette > "Upload Images")
4. Observe UI below the drop zone

---

### 2. Camera Capture (iOS)

#### TC2.1: Camera launches on iOS

**Steps:**

1. Open Upload Modal on iOS device
2. Tap "Take Photo" button
3. **Expected:** Native iOS camera app opens directly (not photo picker)

#### TC2.2: Photo captured and added to list

**Steps:**

1. Complete TC2.1
2. Take a photo using the camera
3. Tap "Use Photo" (or equivalent iOS confirmation)
4. **Expected:**
   - Modal returns to view
   - Photo appears in file list with pending status
   - File size displayed correctly

#### TC2.3: Camera cancelled

**Steps:**

1. Open Upload Modal on iOS
2. Tap "Take Photo"
3. Cancel/close the camera without taking a photo
4. **Expected:** Modal remains open, no file added

#### TC2.4: Multiple photos

**Steps:**

1. Take a photo using "Take Photo" button
2. Tap "Take Photo" again
3. Take another photo
4. **Expected:** Both photos appear in file list

---

### 3. Camera Capture (Android)

#### TC3.1: Camera launches on Android

**Steps:**

1. Open Upload Modal on Android device
2. Tap "Take Photo" button
3. **Expected:** Camera app opens (behavior may vary by device)

> **Note:** Some Android devices may show a chooser between Camera and Files. This is device-dependent behavior.

#### TC3.2: Photo captured and added to list

**Steps:**

1. Take a photo after TC3.1
2. Confirm the photo
3. **Expected:** Photo appears in file list

---

### 4. File Picker (All Platforms)

#### TC4.1: Drop zone still works

**Steps:**

1. Open Upload Modal
2. Tap/click the drop zone area (not the camera button)
3. **Expected:** File picker opens allowing image selection

#### TC4.2: Drag and drop works (Desktop)

**Steps:**

1. Open Upload Modal on desktop
2. Drag image file(s) from Finder/Explorer onto drop zone
3. **Expected:** Files added to list

---

### 5. Upload Flow with Camera Photos

#### TC5.1: Upload camera photo

**Steps:**

1. Take a photo using "Take Photo" button
2. Tap "Upload (1)" button
3. **Expected:**
   - Progress bar shows upload progress
   - Success state shown after completion
   - Modal closes automatically
   - Status bar updates

#### TC5.2: Upload mixed sources

**Steps:**

1. Take a photo using camera button
2. Add another image via file picker (tap drop zone)
3. Upload both
4. **Expected:** Both files upload successfully

---

### 6. Validation

#### TC6.1: Large file from camera

**Steps:**

1. Take a high-resolution photo (ensure it's under 10MB)
2. **Expected:** File accepted and uploadable

#### TC6.2: File too large

**Steps:**

1. If possible, take a photo > 10MB (may require specific camera settings)
2. **Expected:** Error message displayed, file marked with error status

---

### 7. Edge Cases

#### TC7.1: Camera permission denied

**Steps:**

1. Revoke camera permission for Obsidian in device settings
2. Tap "Take Photo"
3. **Expected:** System permission prompt or graceful error

#### TC7.2: Upload while camera is open

**Steps:**

1. Open camera via "Take Photo"
2. (If possible) try to interact with modal
3. **Expected:** No crash, modal waits for camera response

#### TC7.3: Rapid camera button taps

**Steps:**

1. Quickly tap "Take Photo" multiple times
2. **Expected:** Only one camera instance opens

---

### 8. Accessibility

#### TC8.1: VoiceOver/TalkBack

**Steps:**

1. Enable screen reader (VoiceOver on iOS, TalkBack on Android)
2. Navigate to camera button
3. **Expected:** Button announced as actionable element

#### TC8.2: Reduced motion

**Steps:**

1. Enable "Reduce Motion" in device accessibility settings
2. Open Upload Modal, take photo
3. **Expected:** No animations on button press

---

## Fallback Behavior

If the `capture` attribute is not supported by Obsidian's webview:

| Scenario | Expected Fallback                       |
| -------- | --------------------------------------- |
| iOS      | May show photo picker instead of camera |
| Android  | May show chooser (Camera/Files)         |

This is acceptable graceful degradation - users can still select photos.

---

## Known Limitations

1. **iOS photo naming**: iOS may name photos generically (e.g., "image.png"). The plugin handles this by prepending timestamps.

2. **HEIC format**: Photos taken on iOS are often HEIC format. The plugin supports HEIC uploads.

3. **Android variance**: Camera behavior varies significantly across Android devices and OS versions.

4. **Desktop hidden**: The camera button intentionally does not appear on desktop as webcam capture is not the intended use case.

---

## Reporting Issues

When reporting issues, include:

- Device model and OS version
- Obsidian version (Settings > About)
- Plugin version
- Steps to reproduce
- Screenshots/screen recordings if possible
- Console logs (Settings > Community plugins > Notebook Scanner > Open console)
