"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // System info
    getSystemInfo: function () { return electron_1.ipcRenderer.invoke('get-system-info'); },
    // Server management
    createServer: function (config) { return electron_1.ipcRenderer.invoke('create-server', config); },
    startServer: function (serverName) { return electron_1.ipcRenderer.invoke('start-server', serverName); },
    stopServer: function (serverName) { return electron_1.ipcRenderer.invoke('stop-server', serverName); },
    deleteServer: function (serverName) { return electron_1.ipcRenderer.invoke('delete-server', serverName); },
    getServerStatus: function (serverName) { return electron_1.ipcRenderer.invoke('get-server-status', serverName); },
    getSavedServers: function () { return electron_1.ipcRenderer.invoke('get-saved-servers'); },
    // Console functionality
    sendCommand: function (serverName, command) { return electron_1.ipcRenderer.invoke('send-command', serverName, command); },
    getConsoleOutput: function (serverName) { return electron_1.ipcRenderer.invoke('get-console-output', serverName); },
    clearConsoleOutput: function (serverName) { return electron_1.ipcRenderer.invoke('clear-console-output', serverName); },
    onConsoleOutput: function (callback) {
        electron_1.ipcRenderer.on('console-output', function (event, serverName, lines) { return callback(serverName, lines); });
    },
    removeConsoleOutputListener: function () {
        electron_1.ipcRenderer.removeAllListeners('console-output');
    },
    // Player management
    getBannedPlayers: function (serverName) { return electron_1.ipcRenderer.invoke('get-banned-players', serverName); },
    unbanPlayer: function (serverName, playerName) { return electron_1.ipcRenderer.invoke('unban-player', serverName, playerName); },
    // Utilities
    getLocalIP: function () { return electron_1.ipcRenderer.invoke('get-local-ip'); },
    selectFolder: function () { return electron_1.ipcRenderer.invoke('select-folder'); }
});
