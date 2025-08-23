"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI = {
    getSystemInfo: () => electron_1.ipcRenderer.invoke('get-system-info'),
    createServer: (config) => electron_1.ipcRenderer.invoke('create-server', config),
    startServer: (serverName) => electron_1.ipcRenderer.invoke('start-server', serverName),
    stopServer: (serverName) => electron_1.ipcRenderer.invoke('stop-server', serverName),
    deleteServer: (serverName) => electron_1.ipcRenderer.invoke('delete-server', serverName),
    getServerStatus: (serverName) => electron_1.ipcRenderer.invoke('get-server-status', serverName),
    sendCommand: (serverName, command) => electron_1.ipcRenderer.invoke('send-command', serverName, command),
    getConsoleOutput: (serverName) => electron_1.ipcRenderer.invoke('get-console-output', serverName),
    clearConsoleOutput: (serverName) => electron_1.ipcRenderer.invoke('clear-console-output', serverName),
    onConsoleOutput: (callback) => {
        electron_1.ipcRenderer.on('console-output', (event, serverName, lines) => callback(serverName, lines));
    },
    removeConsoleOutputListener: () => {
        electron_1.ipcRenderer.removeAllListeners('console-output');
    },
    getLocalIP: () => electron_1.ipcRenderer.invoke('get-local-ip'),
    selectFolder: () => electron_1.ipcRenderer.invoke('select-folder'),
    getDefaultServerPath: () => electron_1.ipcRenderer.invoke('get-default-server-path'),
    getSavedServers: () => electron_1.ipcRenderer.invoke('get-saved-servers'),
    getServerSettings: (serverName) => electron_1.ipcRenderer.invoke('get-server-settings', serverName),
    updateServerSettings: (serverName, config) => electron_1.ipcRenderer.invoke('update-server-settings', serverName, config),
    restartServer: (serverName) => electron_1.ipcRenderer.invoke('restart-server', serverName),
    cleanupServers: () => electron_1.ipcRenderer.invoke('cleanup-servers'),
    getBannedPlayers: (serverName) => electron_1.ipcRenderer.invoke('get-banned-players', serverName),
    unbanPlayer: (serverName, playerName) => electron_1.ipcRenderer.invoke('unban-player', serverName, playerName),
    kickPlayer: (serverName, playerName, reason) => electron_1.ipcRenderer.invoke('kick-player', serverName, playerName, reason),
    getWhitelist: (serverName) => electron_1.ipcRenderer.invoke('get-whitelist', serverName),
    addToWhitelist: (serverName, playerName) => electron_1.ipcRenderer.invoke('add-to-whitelist', serverName, playerName),
    removeFromWhitelist: (serverName, playerName) => electron_1.ipcRenderer.invoke('remove-from-whitelist', serverName, playerName)
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronAPI);
//# sourceMappingURL=preload.js.map