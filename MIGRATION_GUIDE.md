# Migration Guide: Secure IPC Implementation

This guide shows how to update your components to use the new secure IPC system.

## Overview

The app now uses a secure IPC communication system with:
- Context isolation enabled
- No direct Node.js access in renderers
- Whitelisted IPC channels only
- Secure preload script with contextBridge

## Before vs After Examples

### Example 1: Quit App Function

**❌ OLD (Insecure)**
```typescript
const handleQuit = () => {
  const { ipcRenderer } = window.require('electron');
  ipcRenderer.send('quit-app');
};
```

**✅ NEW (Secure)**
```typescript
import { electronBridge } from '../utils/electronBridge';

const handleQuit = () => {
  electronBridge.quitApp();
};
```

### Example 2: Getting App Version

**❌ OLD (Insecure)**
```typescript
const getVersion = async () => {
  const { ipcRenderer } = window.require('electron');
  const version = await ipcRenderer.invoke('get-app-version');
  return version;
};
```

**✅ NEW (Secure)**
```typescript
import { electronBridge } from '../utils/electronBridge';

const getVersion = async () => {
  const version = await electronBridge.getAppVersion();
  return version;
};
```

### Example 3: Opening External Links

**❌ OLD (Insecure)**
```typescript
const openLink = (url: string) => {
  const { shell } = window.require('electron');
  shell.openExternal(url);
};
```

**✅ NEW (Secure)**
```typescript
import { electronBridge } from '../utils/electronBridge';

const openLink = async (url: string) => {
  const result = await electronBridge.openExternalLink(url);
  if (!result.success) {
    console.error('Failed to open link:', result.error);
  }
};
```

### Example 4: Listening to Events

**❌ OLD (Insecure)**
```typescript
useEffect(() => {
  const { ipcRenderer } = window.require('electron');
  
  const handleFocus = () => {
    console.log('Window focused');
  };
  
  ipcRenderer.on('window-focused', handleFocus);
  
  return () => {
    ipcRenderer.removeListener('window-focused', handleFocus);
  };
}, []);
```

**✅ NEW (Secure)**
```typescript
import { electronBridge } from '../utils/electronBridge';

useEffect(() => {
  const unsubscribe = electronBridge.on('window-focused', () => {
    console.log('Window focused');
  });
  
  return () => {
    unsubscribe();
  };
}, []);
```

### Example 5: Window Resizing

**❌ OLD (Insecure)**
```typescript
const resizeWindow = (width: number, height: number) => {
  const { ipcRenderer } = window.require('electron');
  ipcRenderer.send('set-window-size', { width, height, isFullScreen: false });
};
```

**✅ NEW (Secure)**
```typescript
import { electronBridge } from '../utils/electronBridge';

const resizeWindow = (width: number, height: number) => {
  electronBridge.setWindowSize(width, height, false);
};
```

## Step-by-Step Migration

### 1. Remove Direct Electron Imports
Remove all instances of:
```typescript
const { ipcRenderer } = window.require('electron');
const { shell } = window.require('electron');
const electron = window.require('electron');
```

### 2. Import electronBridge
Add to the top of your component files:
```typescript
import { electronBridge } from '../utils/electronBridge';
```

### 3. Update IPC Calls
Replace all IPC calls with electronBridge methods:

| Old Method | New Method |
|------------|------------|
| `ipcRenderer.send('quit-app')` | `electronBridge.quitApp()` |
| `ipcRenderer.send('restart-request')` | `electronBridge.requestRestart()` |
| `ipcRenderer.invoke('get-app-version')` | `electronBridge.getAppVersion()` |
| `ipcRenderer.invoke('get-env-vars')` | `electronBridge.getEnvironmentVars()` |
| `ipcRenderer.send('open-link-in-app', url)` | `electronBridge.openLinkInApp(url)` |
| `shell.openExternal(url)` | `electronBridge.openExternalLink(url)` |

### 4. Update Event Listeners
Replace event listeners with the new pattern that returns an unsubscribe function.

### 5. Handle Browser Environment
The electronBridge automatically handles when the app is running in a browser (for development). It will return safe defaults and log warnings.

## Components to Update

Here's a checklist of components that need updating:

- [ ] `src/components/Header.tsx` - handleQuit, update checking
- [ ] `src/components/Footer.tsx` - external links
- [ ] `src/pages/InstanceDialog.tsx` - restart functionality
- [ ] `src/App.tsx` - window event listeners
- [ ] `src/services/updateService.ts` - update IPC calls
- [ ] `src/services/versionManager.ts` - version retrieval
- [ ] Any other component using `window.require('electron')`

## Testing

After migration, test:
1. All quit/restart functionality
2. External link opening
3. Window resizing
4. Update checking
5. Event listeners (focus/blur)
6. Version display

## Benefits

✅ **Security**: No direct Node.js access from web content
✅ **Validation**: All IPC messages are validated
✅ **Type Safety**: Full TypeScript support
✅ **Maintainability**: Centralized IPC logic
✅ **Future Proof**: Follows Electron best practices