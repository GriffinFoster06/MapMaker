// Preload (sandboxed, contextIsolation on): exposes three functions and nothing else. No Node, no ipcRenderer, no paths.
import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type DesktopApi, type SaveKind } from './ipc';

const api: DesktopApi = {
  saveFile: (kind: SaveKind, suggestedName: string, data: Uint8Array) => ipcRenderer.invoke(CHANNELS.save, kind, suggestedName, data),
  openWorld: () => ipcRenderer.invoke(CHANNELS.open),
  info: () => ipcRenderer.invoke(CHANNELS.info),
};
contextBridge.exposeInMainWorld('mapmakerDesktop', api);
