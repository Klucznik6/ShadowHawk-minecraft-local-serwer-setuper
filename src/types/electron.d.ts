// Electron API types for renderer process
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
  // Whitelist management
  getWhitelist: (serverName: string) => Promise<{ enabled: boolean; enforce: boolean; players: string[] }>;
  addToWhitelist: (serverName: string, playerName: string) => Promise<string>;
  removeFromWhitelist: (serverName: string, playerName: string) => Promise<string>;
  // Bans and kicks
  getBannedPlayers: (serverName: string) => Promise<string[]>;
  unbanPlayer: (serverName: string, playerName: string) => Promise<string>;
  kickPlayer: (serverName: string, playerName: string, reason?: string) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
