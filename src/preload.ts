import { contextBridge, ipcRenderer } from 'electron';

export interface SystemInfo {
  total_memory: number;
  available_memory: number;
  cpu_usage: number;
  cpu_count: number;
}

export interface ServerConfig {
  name: string;
  version: string;
  port: number;
  max_ram: number;
  min_ram: number;
  path: string;
  auto_start: boolean;
}

export interface ServerStatus {
  name: string;
  is_running: boolean;
  players_online: string[];
  cpu_usage: number;
  memory_usage: number;
  uptime: number;
}

export interface ElectronAPI {
  getSystemInfo: () => Promise<SystemInfo>;
  createServer: (config: ServerConfig) => Promise<string>;
  startServer: (serverName: string) => Promise<string>;
  stopServer: (serverName: string) => Promise<string>;
  deleteServer: (serverName: string) => Promise<string>;
  getServerStatus: (serverName: string) => Promise<ServerStatus>;
  sendCommand: (serverName: string, command: string) => Promise<string>;
  getConsoleOutput: (serverName: string) => Promise<string[]>;
  clearConsoleOutput: (serverName: string) => Promise<void>;
  onConsoleOutput: (callback: (serverName: string, lines: string[]) => void) => void;
  removeConsoleOutputListener: () => void;
  getLocalIP: () => Promise<string>;
  selectFolder: () => Promise<string | null>;
  getDefaultServerPath: () => Promise<string>;
  getSavedServers: () => Promise<ServerConfig[]>;
  getServerSettings: (serverName: string) => Promise<ServerConfig>;
  updateServerSettings: (serverName: string, config: ServerConfig) => Promise<string>;
  restartServer: (serverName: string) => Promise<string>;
  cleanupServers: () => Promise<string>;
  getBannedPlayers: (serverName: string) => Promise<any[]>;
  unbanPlayer: (serverName: string, playerName: string) => Promise<string>;
  kickPlayer: (serverName: string, playerName: string, reason?: string) => Promise<string>;
  // Whitelist management
  getWhitelist: (serverName: string) => Promise<{ enabled: boolean; enforce: boolean; players: string[] }>;
  addToWhitelist: (serverName: string, playerName: string) => Promise<string>;
  removeFromWhitelist: (serverName: string, playerName: string) => Promise<string>;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  createServer: (config: ServerConfig) => ipcRenderer.invoke('create-server', config),
  startServer: (serverName: string) => ipcRenderer.invoke('start-server', serverName),
  stopServer: (serverName: string) => ipcRenderer.invoke('stop-server', serverName),
  deleteServer: (serverName: string) => ipcRenderer.invoke('delete-server', serverName),
  getServerStatus: (serverName: string) => ipcRenderer.invoke('get-server-status', serverName),
  sendCommand: (serverName: string, command: string) => ipcRenderer.invoke('send-command', serverName, command),
  getConsoleOutput: (serverName: string) => ipcRenderer.invoke('get-console-output', serverName),
  clearConsoleOutput: (serverName: string) => ipcRenderer.invoke('clear-console-output', serverName),
  onConsoleOutput: (callback: (serverName: string, lines: string[]) => void) => {
    ipcRenderer.on('console-output', (event, serverName, lines) => callback(serverName, lines));
  },
  removeConsoleOutputListener: () => {
    ipcRenderer.removeAllListeners('console-output');
  },
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getDefaultServerPath: () => ipcRenderer.invoke('get-default-server-path'),
  getSavedServers: () => ipcRenderer.invoke('get-saved-servers'),
  getServerSettings: (serverName: string) => ipcRenderer.invoke('get-server-settings', serverName),
  updateServerSettings: (serverName: string, config: ServerConfig) => ipcRenderer.invoke('update-server-settings', serverName, config),
  restartServer: (serverName: string) => ipcRenderer.invoke('restart-server', serverName),
  cleanupServers: () => ipcRenderer.invoke('cleanup-servers'),
  getBannedPlayers: (serverName: string) => ipcRenderer.invoke('get-banned-players', serverName),
  unbanPlayer: (serverName: string, playerName: string) => ipcRenderer.invoke('unban-player', serverName, playerName),
  kickPlayer: (serverName: string, playerName: string, reason?: string) => ipcRenderer.invoke('kick-player', serverName, playerName, reason),
  getWhitelist: (serverName: string) => ipcRenderer.invoke('get-whitelist', serverName),
  addToWhitelist: (serverName: string, playerName: string) => ipcRenderer.invoke('add-to-whitelist', serverName, playerName),
  removeFromWhitelist: (serverName: string, playerName: string) => ipcRenderer.invoke('remove-from-whitelist', serverName, playerName)
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
