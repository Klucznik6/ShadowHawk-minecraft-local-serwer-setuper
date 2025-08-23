import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // System info
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  
  // Server management
  createServer: (config: any) => ipcRenderer.invoke('create-server', config),
  startServer: (serverName: string) => ipcRenderer.invoke('start-server', serverName),
  stopServer: (serverName: string) => ipcRenderer.invoke('stop-server', serverName),
  deleteServer: (serverName: string) => ipcRenderer.invoke('delete-server', serverName),
  getServerStatus: (serverName: string) => ipcRenderer.invoke('get-server-status', serverName),
  getSavedServers: () => ipcRenderer.invoke('get-saved-servers'),
  
  // Console functionality
  sendCommand: (serverName: string, command: string) => ipcRenderer.invoke('send-command', serverName, command),
  getConsoleOutput: (serverName: string) => ipcRenderer.invoke('get-console-output', serverName),
  clearConsoleOutput: (serverName: string) => ipcRenderer.invoke('clear-console-output', serverName),
  onConsoleOutput: (callback: (serverName: string, lines: string[]) => void) => {
    ipcRenderer.on('console-output', (event, serverName, lines) => callback(serverName, lines));
  },
  removeConsoleOutputListener: () => {
    ipcRenderer.removeAllListeners('console-output');
  },
  
  // Player management
  getBannedPlayers: (serverName: string) => ipcRenderer.invoke('get-banned-players', serverName),
  unbanPlayer: (serverName: string, playerName: string) => ipcRenderer.invoke('unban-player', serverName, playerName),
  
  // Utilities
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  selectFolder: () => ipcRenderer.invoke('select-folder')
});
