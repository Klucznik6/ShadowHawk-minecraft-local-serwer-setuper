"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = require("path");
const child_process_1 = require("child_process");
const si = __importStar(require("systeminformation"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const pidusage = require('pidusage');
// Keep track of server processes
const serverProcesses = new Map();
const serverStatuses = new Map();
const serverStartTimes = new Map();
const serverPids = new Map();
const serverTunnels = new Map();
const serverUpnpMappings = new Map();
const serverConsoleOutputs = new Map();
// Smart port selection for better compatibility
const MINECRAFT_PORT_RANGES = {
    // Alternative Minecraft ports (less likely to conflict)
    preferred: [25566, 25567, 25568, 25569, 25570],
    // Gaming-friendly ports (commonly open on routers)
    gaming: [19132, 19133, 19134, 7777, 7778, 7779],
    // High-range ports (usually unrestricted)
    highRange: [30000, 30001, 30002, 30003, 30004, 30005],
    // Standard Minecraft (if all else fails)
    standard: [25565]
};
// Gracefully stop a server and wait for exit
async function stopServerGracefully(serverName, timeoutMs = 12000) {
    return new Promise((resolve) => {
        const serverProcess = serverProcesses.get(serverName);
        if (!serverProcess) {
            return resolve();
        }
        try {
            // Send stop command
            serverProcess.stdin?.write('stop\n');
        }
        catch (e) {
            // ignore
        }
        let finished = false;
        const cleanup = () => {
            if (finished)
                return;
            finished = true;
            serverProcesses.delete(serverName);
            serverStartTimes.delete(serverName);
            serverPids.delete(serverName);
            resolve();
        };
        // Resolve on exit
        serverProcess.once('exit', () => cleanup());
        // Force kill if needed
        setTimeout(() => {
            if (!finished) {
                try {
                    serverProcess.kill('SIGTERM');
                }
                catch { }
                cleanup();
            }
        }, timeoutMs);
    });
}
// Check if a port is available for use
async function isPortAvailable(port, host = '0.0.0.0') {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        server.listen(port, host, () => {
            server.once('close', () => {
                resolve(true);
            });
            server.close();
        });
        server.on('error', () => {
            resolve(false);
        });
    });
}
// Find the best available port for a new server
async function findAvailablePort() {
    console.log('🔍 Scanning for available ports...');
    // Check all port ranges in order of preference
    const allPorts = [
        ...MINECRAFT_PORT_RANGES.preferred,
        ...MINECRAFT_PORT_RANGES.gaming,
        ...MINECRAFT_PORT_RANGES.highRange,
        ...MINECRAFT_PORT_RANGES.standard
    ];
    for (const port of allPorts) {
        console.log(`   Checking port ${port}...`);
        if (await isPortAvailable(port)) {
            console.log(`✅ Found available port: ${port}`);
            return port;
        }
    }
    // Fallback: find any available port in high range
    for (let port = 30000; port <= 65535; port++) {
        if (await isPortAvailable(port)) {
            console.log(`✅ Found fallback port: ${port}`);
            return port;
        }
    }
    throw new Error('No available ports found');
}
let mainWindow;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: (0, path_1.join)(__dirname, 'preload.js')
        },
        icon: (0, path_1.join)(__dirname, '../public/icon.png'),
        titleBarStyle: 'default',
        show: false
    });
    // Load the renderer HTML
    mainWindow.loadFile((0, path_1.join)(__dirname, '../renderer/index.html'));
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        if (process.env.NODE_ENV === 'development') {
            mainWindow.webContents.openDevTools();
        }
    });
    mainWindow.on('closed', () => {
        electron_1.app.quit();
    });
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// Default server root folder (e.g., Documents/ShadowHawk Servers)
function getDefaultServerRoot() {
    const docs = electron_1.app.getPath('documents');
    return path.join(docs, 'ShadowHawk Servers');
}
electron_1.ipcMain.handle('get-default-server-path', async () => {
    try {
        const root = getDefaultServerRoot();
        if (!fs.existsSync(root)) {
            fs.mkdirSync(root, { recursive: true });
        }
        return root;
    }
    catch (error) {
        console.error('Error ensuring default server path:', error);
        // Fallback to userData if Documents is not available
        const fallback = path.join(electron_1.app.getPath('userData'), 'servers');
        try {
            if (!fs.existsSync(fallback))
                fs.mkdirSync(fallback, { recursive: true });
        }
        catch { }
        return fallback;
    }
});
// IPC Handlers
electron_1.ipcMain.handle('get-system-info', async () => {
    try {
        const mem = await si.mem();
        const cpu = await si.currentLoad();
        const cpuInfo = await si.cpu();
        return {
            total_memory: Math.round(mem.total / (1024 * 1024 * 1024)),
            available_memory: Math.round(mem.available / (1024 * 1024 * 1024)),
            cpu_usage: Math.round(cpu.currentLoad),
            cpu_count: cpuInfo.cores
        };
    }
    catch (error) {
        console.error('Error getting system info:', error);
        throw new Error(`Failed to get system info: ${error}`);
    }
});
electron_1.ipcMain.handle('create-server', async (event, config) => {
    try {
        console.log(`🚀 Creating server: ${config.name}`);
        // Default path if not provided
        if (!config.path || !config.path.trim()) {
            config.path = getDefaultServerRoot();
        }
        // Create server directory
        const serverPath = path.join(config.path, config.name);
        if (!fs.existsSync(serverPath)) {
            fs.mkdirSync(serverPath, { recursive: true });
        }
        // Find available port
        const availablePort = await findAvailablePort();
        config.port = availablePort;
        // Set default CPU cores if not specified (use all available cores)
        if (!config.cpu_cores || config.cpu_cores <= 0) {
            const cpuInfo = await si.cpu();
            config.cpu_cores = cpuInfo.cores;
            console.log(`🔧 Setting default CPU cores to ${config.cpu_cores} for ${config.name}`);
        }
        // Resolve version (handle 'latest') and download server jar if missing
        const { id: resolvedVersion, url: resolvedUrl } = await resolveServerVersionAndUrl(config.version);
        config.version = resolvedVersion;
        const jarPath = path.join(serverPath, `minecraft_server.${resolvedVersion}.jar`);
        if (!fs.existsSync(jarPath)) {
            console.log(`📥 Downloading Minecraft ${resolvedVersion}...`);
            await downloadMinecraftServerJar(resolvedUrl, jarPath);
        }
        // Create server.properties file with comprehensive settings
        const settings = config.settings || {};
        const serverProperties = `#Minecraft server properties\n#Generated by ShadowHawk Server Manager - ${new Date().toISOString()}\n\n# Network\nserver-ip=\nserver-port=${config.port}\nonline-mode=${settings.online_mode !== false}\nprevent-proxy-connections=${settings.prevent_proxy_connections || false}\nnetwork-compression-threshold=${settings.network_compression_threshold ?? 256}\nuse-native-transport=${settings.use_native_transport !== false}\n\n# Players\nmax-players=${settings.max_players ?? 20}\nwhite-list=${settings.white_list || false}\nenforce-whitelist=${settings.enforce_whitelist || false}\nplayer-idle-timeout=0\n\n# World\nlevel-name=${settings.level_name || 'world'}\nlevel-seed=${settings.level_seed || ''}\nlevel-type=${settings.level_type || 'minecraft\\:normal'}\nmax-world-size=29999984\nspawn-protection=${settings.spawn_protection ?? 16}\n\n# Gameplay\ngamemode=${settings.gamemode || 'survival'}\ndifficulty=${settings.difficulty || 'normal'}\nhardcore=${settings.hardcore || false}\nforce-gamemode=false\npvp=${settings.pvp !== false}\nallow-flight=${settings.allow_flight || false}\n\n# Generation\ngenerate-structures=${settings.generate_structures !== false}\nspawn-monsters=${settings.spawn_monsters !== false}\nspawn-animals=${settings.spawn_animals !== false}\nspawn-npcs=${settings.spawn_npcs !== false}\n\n# Performance\nview-distance=${settings.view_distance ?? 10}\nsimulation-distance=${settings.simulation_distance ?? 10}\nentity-broadcast-range-percentage=100\nmax-tick-time=${settings.max_tick_time ?? 60000}\nsync-chunk-writes=${settings.sync_chunk_writes !== false}\n\n# Info\nmotd=${settings.motd || `Welcome to ${config.name}!`}\nenable-status=${settings.enable_status !== false}\nhide-online-players=${settings.hide_online_players || false}\n\n# Commands & Permissions\nenable-command-block=${settings.enable_command_block || false}\nfunction-permission-level=${settings.function_permission_level ?? 2}\nop-permission-level=${settings.op_permission_level ?? 4}\n\n# RCON\nenable-rcon=${settings.enable_rcon !== false}\nrcon.port=${config.port + 1}\nrcon.password=shadowhawk123\nbroadcast-console-to-ops=${settings.broadcast_console_to_ops !== false}\nbroadcast-rcon-to-ops=${settings.broadcast_rcon_to_ops !== false}\n\n# Misc\nallow-nether=true\nenable-query=false\nquery.port=${config.port}\nrequire-resource-pack=false\nenable-jmx-monitoring=${settings.enable_jmx_monitoring || false}`.trim();
        fs.writeFileSync(path.join(serverPath, 'server.properties'), serverProperties);
        // Create whitelist.json if whitelist is enabled (write empty list if none provided)
        if (settings.white_list) {
            const players = Array.isArray(config.whitelist) ? config.whitelist : [];
            console.log(`📜 Whitelist enabled. Players to add: ${players.length}`);
            const whitelistData = players.map(name => ({ uuid: '', name }));
            fs.writeFileSync(path.join(serverPath, 'whitelist.json'), JSON.stringify(whitelistData, null, 2));
        }
        else {
            console.log('📜 Whitelist disabled at creation');
        }
        // Create ops.json if operators provided
        if (config.operators && config.operators.length > 0) {
            console.log(`👑 Operators to add: ${config.operators.length}`);
            const opsData = config.operators.map(name => ({ uuid: '', name, level: settings.op_permission_level ?? 4, bypassesPlayerLimit: true }));
            fs.writeFileSync(path.join(serverPath, 'ops.json'), JSON.stringify(opsData, null, 2));
        }
        else {
            console.log('👑 No operators provided at creation');
        }
        // Accept EULA
        fs.writeFileSync(path.join(serverPath, 'eula.txt'), 'eula=true');
        // Save server config
        const configPath = path.join(serverPath, 'shadowhawk-config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        // Also save to central registry
        await addServerToRegistry(config);
        console.log(`✅ Server "${config.name}" created successfully on port ${config.port}`);
        return `Server "${config.name}" created successfully on port ${config.port}`;
    }
    catch (error) {
        console.error('Error creating server:', error);
        throw new Error(`Failed to create server: ${error}`);
    }
});
async function startServerInternal(serverName) {
    if (serverProcesses.has(serverName)) {
        return `Server "${serverName}" is already running`;
    }
    console.log(`🎮 Starting server: ${serverName}`);
    // Load server config
    const servers = await getSavedServers();
    const server = servers.find(s => s.name === serverName);
    if (!server) {
        throw new Error(`Server "${serverName}" not found`);
    }
    const serverPath = path.join(server.path, server.name);
    const jarPath = path.join(serverPath, `minecraft_server.${server.version}.jar`);
    if (!fs.existsSync(jarPath)) {
        throw new Error(`Server jar not found: ${jarPath}`);
    }
    // Start the server process with CPU affinity control
    const javaArgs = [
        `-Xms${server.min_ram}M`,
        `-Xmx${server.max_ram}M`,
        '-jar',
        jarPath,
        'nogui'
    ];
    // Start the Java process normally first
    console.log(`🎮 Starting ${serverName} with Java arguments: ${javaArgs.join(' ')}`);
    const serverProcess = (0, child_process_1.spawn)('java', javaArgs, {
        cwd: serverPath,
        stdio: ['pipe', 'pipe', 'pipe']
    });
    // After startup, bootstrap whitelist and ops by issuing server commands
    let bootstrapScheduled = false;
    const scheduleBootstrap = () => {
        if (bootstrapScheduled)
            return;
        bootstrapScheduled = true;
        setTimeout(async () => {
            try {
                // Reload config to get latest settings and players
                const cfgFile = path.join(serverPath, 'shadowhawk-config.json');
                let cfg = null;
                try {
                    cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
                }
                catch { }
                const settings = cfg?.settings || {};
                // Ensure whitelist state
                if (settings.white_list) {
                    serverProcess.stdin?.write(`whitelist on\n`);
                    const players = Array.isArray(cfg?.whitelist) ? cfg.whitelist : [];
                    for (const p of players) {
                        if (p && typeof p === 'string') {
                            serverProcess.stdin?.write(`whitelist add ${p}\n`);
                        }
                    }
                    // Ensure server reloads any file-based whitelist state written at creation
                    serverProcess.stdin?.write(`whitelist reload\n`);
                }
                // Ensure operators
                const ops = Array.isArray(cfg?.operators) ? cfg.operators : [];
                for (const op of ops) {
                    if (op && typeof op === 'string') {
                        serverProcess.stdin?.write(`op ${op}\n`);
                    }
                }
            }
            catch (e) {
                console.error('Bootstrap commands failed:', e);
            }
        }, 1500); // run shortly after server reports ready
    };
    // If CPU core count is specified, set CPU affinity after the process starts
    if (server.cpu_cores && server.cpu_cores > 0 && serverProcess.pid) {
        console.log(`🔧 Setting CPU affinity to ${server.cpu_cores} cores for ${serverName} (PID: ${serverProcess.pid})`);
        // Get system CPU count to validate
        const systemInfo = await si.cpu();
        const maxCores = systemInfo.cores;
        const allocatedCores = Math.min(server.cpu_cores, maxCores);
        // Create CPU affinity mask (e.g., for 2 cores: "3" which is binary 11, for 6 cores: "3F" which is binary 111111)
        const affinityMask = (Math.pow(2, allocatedCores) - 1).toString(16);
        // Use PowerShell to set CPU affinity
        const affinityCommand = `powershell -Command "Get-Process -Id ${serverProcess.pid} | ForEach-Object { $_.ProcessorAffinity = 0x${affinityMask} }"`;
        console.log(`🎯 Setting CPU Affinity: ${affinityCommand}`);
        // Wait a moment for the process to fully start, then set affinity
        setTimeout(() => {
            const { exec } = require('child_process');
            exec(affinityCommand, (error) => {
                if (error) {
                    console.error(`CPU Affinity Error: ${error}`);
                }
                else {
                    console.log(`✅ CPU affinity set successfully for ${serverName} (${allocatedCores} cores)`);
                }
            });
        }, 2000); // Wait 2 seconds for process to stabilize
    }
    serverProcesses.set(serverName, serverProcess);
    serverStartTimes.set(serverName, Date.now());
    // Store process ID for resource monitoring
    if (serverProcess.pid) {
        serverPids.set(serverName, serverProcess.pid);
    }
    serverProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log(`[${serverName}] ${output}`);
        // Store console output for retrieval
        if (!serverConsoleOutputs.has(serverName)) {
            serverConsoleOutputs.set(serverName, []);
        }
        const consoleLines = serverConsoleOutputs.get(serverName);
        const lines = output.split('\n').filter((line) => line.trim());
        consoleLines.push(...lines);
        // Keep only last 1000 lines to prevent memory issues
        if (consoleLines.length > 1000) {
            consoleLines.splice(0, consoleLines.length - 1000);
        }
        // Send real-time console output to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('console-output', serverName, lines);
        }
        // Detect server ready state ("Done" line) and schedule bootstrap once
        if (/\bDone \(/.test(output)) {
            scheduleBootstrap();
        }
    });
    serverProcess.stderr?.on('data', (data) => {
        const errorOutput = data.toString();
        console.error(`[${serverName}] ERROR: ${errorOutput}`);
        // Store error output in console
        if (!serverConsoleOutputs.has(serverName)) {
            serverConsoleOutputs.set(serverName, []);
        }
        const consoleLines = serverConsoleOutputs.get(serverName);
        const lines = errorOutput.split('\n').filter((line) => line.trim()).map((line) => `[ERROR] ${line}`);
        consoleLines.push(...lines);
        // Keep only last 1000 lines to prevent memory issues
        if (consoleLines.length > 1000) {
            consoleLines.splice(0, consoleLines.length - 1000);
        }
        // Send real-time error output to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('console-output', serverName, lines);
        }
    });
    serverProcess.on('exit', (code) => {
        console.log(`Server "${serverName}" exited with code ${code}`);
        serverProcesses.delete(serverName);
        serverStartTimes.delete(serverName);
        serverPids.delete(serverName);
    });
    console.log(`✅ Server "${serverName}" started successfully`);
    return `Server "${serverName}" started successfully on port ${server.port}`;
}
electron_1.ipcMain.handle('start-server', async (event, serverName) => {
    try {
        return await startServerInternal(serverName);
    }
    catch (error) {
        console.error('Error starting server:', error);
        throw new Error(`Failed to start server: ${error}`);
    }
});
electron_1.ipcMain.handle('stop-server', async (event, serverName) => {
    try {
        const serverProcess = serverProcesses.get(serverName);
        if (!serverProcess) {
            return `Server "${serverName}" is not running`;
        }
        console.log(`🛑 Stopping server: ${serverName}`);
        // Send stop command to server
        serverProcess.stdin?.write('stop\n');
        // Force kill after 10 seconds if not stopped gracefully
        setTimeout(() => {
            if (serverProcesses.has(serverName)) {
                serverProcess.kill('SIGTERM');
                serverProcesses.delete(serverName);
                serverStartTimes.delete(serverName);
                serverPids.delete(serverName);
            }
        }, 10000);
        return `Server "${serverName}" stop command sent`;
    }
    catch (error) {
        console.error('Error stopping server:', error);
        throw new Error(`Failed to stop server: ${error}`);
    }
});
electron_1.ipcMain.handle('get-server-status', async (event, serverName) => {
    try {
        const isRunning = serverProcesses.has(serverName);
        const startTime = serverStartTimes.get(serverName) || 0;
        const uptime = isRunning ? Math.floor((Date.now() - startTime) / 1000) : 0;
        // Get resource usage if server is running
        const resources = isRunning ? await getServerResourceUsage(serverName) : { cpu: 0, memory: 0 };
        // Get online players if server is running
        let playersOnline = [];
        if (isRunning) {
            playersOnline = await getOnlinePlayers(serverName);
        }
        return {
            name: serverName,
            is_running: isRunning,
            players_online: playersOnline,
            cpu_usage: resources.cpu,
            memory_usage: resources.memory,
            uptime: uptime
        };
    }
    catch (error) {
        console.error('Error getting server status:', error);
        throw new Error(`Failed to get server status: ${error}`);
    }
});
electron_1.ipcMain.handle('send-command', async (event, serverName, command) => {
    try {
        const serverProcess = serverProcesses.get(serverName);
        if (!serverProcess) {
            throw new Error(`Server "${serverName}" is not running`);
        }
        // Send command to server stdin
        serverProcess.stdin?.write(`${command}\n`);
        // Add command to console output for display (show what user typed)
        if (!serverConsoleOutputs.has(serverName)) {
            serverConsoleOutputs.set(serverName, []);
        }
        const consoleLines = serverConsoleOutputs.get(serverName);
        consoleLines.push(`> ${command}`);
        // Send to renderer for real-time display
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('console-output', serverName, [`> ${command}`]);
        }
        console.log(`Sent command '${command}' to server '${serverName}'`);
        return `Command '${command}' sent to server '${serverName}'`;
    }
    catch (error) {
        console.error('Error sending command:', error);
        throw new Error(`Failed to send command: ${error}`);
    }
});
electron_1.ipcMain.handle('get-console-output', async (event, serverName) => {
    try {
        return serverConsoleOutputs.get(serverName) || [];
    }
    catch (error) {
        console.error('Error getting console output:', error);
        return [];
    }
});
electron_1.ipcMain.handle('clear-console-output', async (event, serverName) => {
    try {
        serverConsoleOutputs.set(serverName, []);
    }
    catch (error) {
        console.error('Error clearing console output:', error);
    }
});
electron_1.ipcMain.handle('get-local-ip', async () => {
    try {
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        for (const name of Object.keys(nets)) {
            for (const net of nets[name] || []) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return 'localhost';
    }
    catch (error) {
        console.error('Error getting local IP:', error);
        return 'localhost';
    }
});
electron_1.ipcMain.handle('select-folder', async () => {
    try {
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Select Server Directory'
        });
        return result.canceled ? null : result.filePaths[0];
    }
    catch (error) {
        console.error('Error selecting folder:', error);
        return null;
    }
});
electron_1.ipcMain.handle('get-saved-servers', async () => {
    return getSavedServers();
});
// Settings management
electron_1.ipcMain.handle('get-server-settings', async (event, serverName) => {
    const servers = await getSavedServers();
    const server = servers.find(s => s.name === serverName);
    if (!server) {
        throw new Error(`Server "${serverName}" not found`);
    }
    return server;
});
electron_1.ipcMain.handle('update-server-settings', async (event, serverName, updatedConfig) => {
    try {
        const servers = await getSavedServers();
        const existing = servers.find(s => s.name === serverName);
        if (!existing) {
            throw new Error(`Server "${serverName}" not found`);
        }
        // Merge minimal fields to preserve path/name defaults
        const merged = {
            ...existing,
            ...updatedConfig,
            name: existing.name, // don't allow renaming via this API
            path: existing.path,
        };
        const serverPath = path.join(merged.path, merged.name);
        // Rewrite server.properties with current settings similar to create-server
        const settings = merged.settings || {};
        const serverProperties = `#Minecraft server properties\n#Updated by ShadowHawk Server Manager - ${new Date().toISOString()}\n\n# Network\nserver-ip=\nserver-port=${merged.port}\nonline-mode=${settings.online_mode !== false}\nprevent-proxy-connections=${settings.prevent_proxy_connections || false}\nnetwork-compression-threshold=${settings.network_compression_threshold ?? 256}\nuse-native-transport=${settings.use_native_transport !== false}\n\n# Players\nmax-players=${settings.max_players ?? 20}\nwhite-list=${settings.white_list || false}\nenforce-whitelist=${settings.enforce_whitelist || false}\nplayer-idle-timeout=0\n\n# World\nlevel-name=${settings.level_name || 'world'}\nlevel-seed=${settings.level_seed || ''}\nlevel-type=${settings.level_type || 'minecraft\\:normal'}\nmax-world-size=29999984\nspawn-protection=${settings.spawn_protection ?? 16}\n\n# Gameplay\ngamemode=${settings.gamemode || 'survival'}\ndifficulty=${settings.difficulty || 'normal'}\nhardcore=${settings.hardcore || false}\nforce-gamemode=false\npvp=${settings.pvp !== false}\nallow-flight=${settings.allow_flight || false}\n\n# Generation\ngenerate-structures=${settings.generate_structures !== false}\nspawn-monsters=${settings.spawn_monsters !== false}\nspawn-animals=${settings.spawn_animals !== false}\nspawn-npcs=${settings.spawn_npcs !== false}\n\n# Performance\nview-distance=${settings.view_distance ?? 10}\nsimulation-distance=${settings.simulation_distance ?? 10}\nentity-broadcast-range-percentage=100\nmax-tick-time=${settings.max_tick_time ?? 60000}\nsync-chunk-writes=${settings.sync_chunk_writes !== false}\n\n# Info\nmotd=${settings.motd || `Welcome to ${merged.name}!`}\nenable-status=${settings.enable_status !== false}\nhide-online-players=${settings.hide_online_players || false}\n\n# Commands & Permissions\nenable-command-block=${settings.enable_command_block || false}\nfunction-permission-level=${settings.function_permission_level ?? 2}\nop-permission-level=${settings.op_permission_level ?? 4}\n\n# RCON\nenable-rcon=${settings.enable_rcon !== false}\nrcon.port=${merged.port + 1}\nrcon.password=shadowhawk123\nbroadcast-console-to-ops=${settings.broadcast_console_to_ops !== false}\nbroadcast-rcon-to-ops=${settings.broadcast_rcon_to_ops !== false}\n\n# Misc\nallow-nether=true\nenable-query=false\nquery.port=${merged.port}\nrequire-resource-pack=false\nenable-jmx-monitoring=${settings.enable_jmx_monitoring || false}`.trim();
        fs.writeFileSync(path.join(serverPath, 'server.properties'), serverProperties);
        // Update whitelist.json (write empty list if enabling with no players)
        if (settings.white_list) {
            const players = Array.isArray(merged.whitelist) ? merged.whitelist : [];
            const whitelistData = players.map(name => ({ uuid: '', name }));
            fs.writeFileSync(path.join(serverPath, 'whitelist.json'), JSON.stringify(whitelistData, null, 2));
        }
        else {
            // If disabled, remove file to avoid confusion
            const wlPath = path.join(serverPath, 'whitelist.json');
            if (fs.existsSync(wlPath))
                fs.unlinkSync(wlPath);
        }
        // Update ops.json
        if (merged.operators && merged.operators.length > 0) {
            const opsData = merged.operators.map(name => ({ uuid: '', name, level: settings.op_permission_level ?? 4, bypassesPlayerLimit: true }));
            fs.writeFileSync(path.join(serverPath, 'ops.json'), JSON.stringify(opsData, null, 2));
        }
        else {
            const opsPath = path.join(serverPath, 'ops.json');
            if (fs.existsSync(opsPath))
                fs.unlinkSync(opsPath);
        }
        // Persist config and registry
        fs.writeFileSync(path.join(serverPath, 'shadowhawk-config.json'), JSON.stringify(merged, null, 2));
        await addServerToRegistry(merged);
        return `Server "${serverName}" settings updated`;
    }
    catch (error) {
        console.error('Error updating server settings:', error);
        throw new Error(`Failed to update server settings: ${error}`);
    }
});
electron_1.ipcMain.handle('restart-server', async (event, serverName) => {
    try {
        const wasRunning = serverProcesses.has(serverName);
        if (wasRunning) {
            await stopServerGracefully(serverName);
        }
        // Start again using internal helper
        const startMsg = await startServerInternal(serverName);
        return startMsg.replace('started successfully', 'restarted successfully');
    }
    catch (error) {
        console.error('Error restarting server:', error);
        throw new Error(`Failed to restart server: ${error}`);
    }
});
electron_1.ipcMain.handle('cleanup-servers', async () => {
    try {
        const userDataPath = electron_1.app.getPath('userData');
        const registryPath = path.join(userDataPath, 'server-registry.json');
        if (!fs.existsSync(registryPath)) {
            return 'No registry to clean';
        }
        let registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        const before = (registry.servers || []).length;
        registry.servers = (registry.servers || []).filter((s) => {
            const cfgPath = path.join(s.path, s.name, 'shadowhawk-config.json');
            return fs.existsSync(cfgPath);
        });
        const after = registry.servers.length;
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
        return `Cleaned registry: ${before - after} stale entries removed`;
    }
    catch (error) {
        console.error('Error cleaning up servers:', error);
        throw new Error(`Failed to cleanup servers: ${error}`);
    }
});
electron_1.ipcMain.handle('delete-server', async (event, serverName) => {
    try {
        // Stop server if running
        if (serverProcesses.has(serverName)) {
            await electron_1.ipcMain.emit('stop-server', event, serverName);
        }
        // Find and remove server directory
        const servers = await getSavedServers();
        const server = servers.find(s => s.name === serverName);
        if (server) {
            const serverPath = path.join(server.path, server.name);
            if (fs.existsSync(serverPath)) {
                fs.rmSync(serverPath, { recursive: true, force: true });
            }
        }
        // Remove from registry
        await removeServerFromRegistry(serverName);
        return `Server "${serverName}" deleted successfully`;
    }
    catch (error) {
        console.error('Error deleting server:', error);
        throw new Error(`Failed to delete server: ${error}`);
    }
});
// Banned players management
electron_1.ipcMain.handle('get-banned-players', async (event, serverName) => {
    try {
        const servers = await getSavedServers();
        const server = servers.find(s => s.name === serverName);
        if (!server) {
            throw new Error(`Server "${serverName}" not found`);
        }
        const serverPath = path.join(server.path, server.name);
        const bannedPlayersPath = path.join(serverPath, 'banned-players.json');
        if (!fs.existsSync(bannedPlayersPath)) {
            console.log(`No banned-players.json found for server ${serverName}`);
            return [];
        }
        const bannedData = JSON.parse(fs.readFileSync(bannedPlayersPath, 'utf8'));
        // Extract just the player names from the banned players data
        const bannedPlayers = bannedData.map((entry) => entry.name || entry.uuid || 'Unknown');
        console.log(`Found ${bannedPlayers.length} banned players for server ${serverName}:`, bannedPlayers);
        return bannedPlayers;
    }
    catch (error) {
        console.error('Error getting banned players:', error);
        throw new Error(`Failed to get banned players: ${error}`);
    }
});
electron_1.ipcMain.handle('unban-player', async (event, serverName, playerName) => {
    try {
        const servers = await getSavedServers();
        const server = servers.find(s => s.name === serverName);
        if (!server) {
            throw new Error(`Server "${serverName}" not found`);
        }
        const serverPath = path.join(server.path, server.name);
        const bannedPlayersPath = path.join(serverPath, 'banned-players.json');
        if (!fs.existsSync(bannedPlayersPath)) {
            return `No banned players file found for server "${serverName}"`;
        }
        // Read current banned players
        const bannedData = JSON.parse(fs.readFileSync(bannedPlayersPath, 'utf8'));
        // Filter out the player to unban
        const updatedBannedData = bannedData.filter((entry) => entry.name !== playerName && entry.uuid !== playerName);
        // Write the updated banned players file
        fs.writeFileSync(bannedPlayersPath, JSON.stringify(updatedBannedData, null, 2));
        // If server is running, send unban command
        if (serverProcesses.has(serverName)) {
            const process = serverProcesses.get(serverName);
            if (process && !process.killed) {
                process.stdin?.write(`pardon ${playerName}\n`);
                console.log(`Sent pardon command for ${playerName} to server ${serverName}`);
            }
        }
        return `Successfully unbanned player "${playerName}" from server "${serverName}"`;
    }
    catch (error) {
        console.error('Error unbanning player:', error);
        throw new Error(`Failed to unban player: ${error}`);
    }
});
// Kick player from server
electron_1.ipcMain.handle('kick-player', async (event, serverName, playerName, reason) => {
    try {
        console.log(`Kicking player ${playerName} from server ${serverName}${reason ? ` with reason: ${reason}` : ''}`);
        // Check if server is running
        if (!serverProcesses.has(serverName)) {
            throw new Error(`Server "${serverName}" is not running`);
        }
        const process = serverProcesses.get(serverName);
        if (!process || process.killed) {
            throw new Error(`Server "${serverName}" process is not available`);
        }
        // Send kick command to server
        const kickCommand = reason
            ? `kick ${playerName} ${reason}`
            : `kick ${playerName}`;
        process.stdin?.write(`${kickCommand}\n`);
        console.log(`Sent kick command to server ${serverName}: ${kickCommand}`);
        return `Successfully kicked player "${playerName}" from server "${serverName}"${reason ? ` (Reason: ${reason})` : ''}`;
    }
    catch (error) {
        console.error('Error kicking player:', error);
        throw new Error(`Failed to kick player: ${error}`);
    }
});
// Helper functions
async function getSavedServers() {
    try {
        const userDataPath = electron_1.app.getPath('userData');
        const registryPath = path.join(userDataPath, 'server-registry.json');
        if (!fs.existsSync(registryPath)) {
            return [];
        }
        const registryData = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        const servers = [];
        // Validate that each server still exists
        for (const serverInfo of registryData.servers || []) {
            const configPath = path.join(serverInfo.path, serverInfo.name, 'shadowhawk-config.json');
            if (fs.existsSync(configPath)) {
                try {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    servers.push(config);
                }
                catch (error) {
                    console.warn(`Failed to load config for server ${serverInfo.name}:`, error);
                }
            }
        }
        return servers;
    }
    catch (error) {
        console.error('Error getting saved servers:', error);
        return [];
    }
}
async function addServerToRegistry(config) {
    try {
        const userDataPath = electron_1.app.getPath('userData');
        const registryPath = path.join(userDataPath, 'server-registry.json');
        let registry = { servers: [] };
        if (fs.existsSync(registryPath)) {
            try {
                registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            }
            catch (error) {
                console.warn('Failed to read server registry, creating new one');
            }
        }
        // Remove existing entry if it exists (for updates)
        registry.servers = registry.servers.filter((s) => s.name !== config.name);
        // Add the new server
        registry.servers.push({
            name: config.name,
            path: config.path,
            version: config.version,
            port: config.port
        });
        // Ensure userData directory exists
        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    }
    catch (error) {
        console.error('Error adding server to registry:', error);
    }
}
async function removeServerFromRegistry(serverName) {
    try {
        const userDataPath = electron_1.app.getPath('userData');
        const registryPath = path.join(userDataPath, 'server-registry.json');
        if (!fs.existsSync(registryPath)) {
            return;
        }
        let registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        registry.servers = registry.servers.filter((s) => s.name !== serverName);
        fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    }
    catch (error) {
        console.error('Error removing server from registry:', error);
    }
}
// Helpers: server config path and properties parsing/writing
function getServerPaths(config) {
    const serverPath = path.join(config.path, config.name);
    return {
        serverPath,
        propertiesPath: path.join(serverPath, 'server.properties'),
        whitelistPath: path.join(serverPath, 'whitelist.json'),
        configPath: path.join(serverPath, 'shadowhawk-config.json'),
    };
}
function parseProperties(content) {
    const result = {};
    content.split(/\r?\n/).forEach(line => {
        if (!line || line.startsWith('#'))
            return;
        const idx = line.indexOf('=');
        if (idx > -1) {
            const key = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            result[key] = value;
        }
    });
    return result;
}
function serializeProperties(props, header) {
    const lines = [];
    if (header)
        lines.push(header);
    Object.keys(props).forEach(k => {
        lines.push(`${k}=${props[k]}`);
    });
    return lines.join('\n');
}
async function loadServerConfigByName(serverName) {
    const servers = await getSavedServers();
    const server = servers.find(s => s.name === serverName);
    if (!server)
        throw new Error(`Server "${serverName}" not found`);
    return server;
}
// Whitelist IPC
electron_1.ipcMain.handle('get-whitelist', async (event, serverName) => {
    try {
        const server = await loadServerConfigByName(serverName);
        const { propertiesPath, whitelistPath } = getServerPaths(server);
        let enabled = false;
        let enforce = false;
        if (fs.existsSync(propertiesPath)) {
            const txt = fs.readFileSync(propertiesPath, 'utf8');
            const props = parseProperties(txt);
            enabled = (props['white-list'] || 'false') === 'true';
            enforce = (props['enforce-whitelist'] || 'false') === 'true';
        }
        else if (server.settings) {
            enabled = !!server.settings.white_list;
            enforce = !!server.settings.enforce_whitelist;
        }
        let players = [];
        if (fs.existsSync(whitelistPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
                players = Array.isArray(data) ? data.map((e) => e?.name).filter(Boolean) : [];
            }
            catch { }
        }
        return { enabled, enforce, players };
    }
    catch (error) {
        console.error('get-whitelist error:', error);
        throw error;
    }
});
electron_1.ipcMain.handle('add-to-whitelist', async (event, serverName, playerName) => {
    try {
        const server = await loadServerConfigByName(serverName);
        const { serverPath, whitelistPath, propertiesPath, configPath } = getServerPaths(server);
        if (!fs.existsSync(serverPath))
            fs.mkdirSync(serverPath, { recursive: true });
        // Ensure whitelist enabled in properties and config
        let props = null;
        if (fs.existsSync(propertiesPath)) {
            const content = fs.readFileSync(propertiesPath, 'utf8');
            props = parseProperties(content);
            props['white-list'] = 'true';
            if (!props['enforce-whitelist'])
                props['enforce-whitelist'] = 'false';
            const header = `#Minecraft server properties\n#Updated ${new Date().toISOString()}`;
            fs.writeFileSync(propertiesPath, serializeProperties(props, header));
        }
        // Update JSON config
        try {
            if (fs.existsSync(configPath)) {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                cfg.settings = cfg.settings || {};
                cfg.settings.white_list = true;
                fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
                await addServerToRegistry(cfg);
            }
        }
        catch { }
        // Read current whitelist
        let list = [];
        if (fs.existsSync(whitelistPath)) {
            try {
                list = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
            }
            catch {
                list = [];
            }
        }
        if (!Array.isArray(list))
            list = [];
        if (!list.find((e) => (e?.name || '').toLowerCase() === playerName.toLowerCase())) {
            list.push({ uuid: '', name: playerName });
            fs.writeFileSync(whitelistPath, JSON.stringify(list, null, 2));
        }
        // If running, apply immediately
        const proc = serverProcesses.get(serverName);
        if (proc && !proc.killed) {
            proc.stdin?.write(`whitelist add ${playerName}\n`);
        }
        return `Added ${playerName} to whitelist`;
    }
    catch (error) {
        console.error('add-to-whitelist error:', error);
        throw new Error(`Failed to add to whitelist: ${error}`);
    }
});
electron_1.ipcMain.handle('remove-from-whitelist', async (event, serverName, playerName) => {
    try {
        const server = await loadServerConfigByName(serverName);
        const { whitelistPath } = getServerPaths(server);
        let list = [];
        if (fs.existsSync(whitelistPath)) {
            try {
                list = JSON.parse(fs.readFileSync(whitelistPath, 'utf8'));
            }
            catch {
                list = [];
            }
        }
        const before = list.length;
        list = list.filter((e) => (e?.name || '').toLowerCase() !== playerName.toLowerCase());
        if (list.length !== before) {
            fs.writeFileSync(whitelistPath, JSON.stringify(list, null, 2));
        }
        const proc = serverProcesses.get(serverName);
        if (proc && !proc.killed) {
            proc.stdin?.write(`whitelist remove ${playerName}\n`);
        }
        return `Removed ${playerName} from whitelist`;
    }
    catch (error) {
        console.error('remove-from-whitelist error:', error);
        throw new Error(`Failed to remove from whitelist: ${error}`);
    }
});
async function downloadMinecraftServerJar(url, outputPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath);
        https.get(url, (response) => {
            if (response.statusCode && response.statusCode >= 400) {
                reject(new Error(`Download failed with status ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
            file.on('error', (error) => {
                fs.unlink(outputPath, () => { });
                reject(error);
            });
        }).on('error', reject);
    });
}
async function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                return;
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}
async function resolveServerVersionAndUrl(version) {
    const manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
    const manifest = await fetchJson(manifestUrl);
    const latestId = manifest?.latest?.release;
    // Prefer explicit known latest if provided by UI request
    const preferredLatest = '1.21.8';
    const targetId = version === 'latest' ? (preferredLatest || latestId) : version;
    if (!targetId) {
        throw new Error('Could not determine latest Minecraft version');
    }
    const entry = (manifest?.versions || []).find((v) => v.id === targetId);
    if (!entry) {
        throw new Error(`Unsupported Minecraft version: ${version}`);
    }
    const versionMeta = await fetchJson(entry.url);
    const serverUrl = versionMeta?.downloads?.server?.url;
    if (!serverUrl) {
        throw new Error(`Server download not available for version ${targetId}`);
    }
    return { id: targetId, url: serverUrl };
}
// Get online players from a Minecraft server
async function getOnlinePlayers(serverName) {
    try {
        const serverProcess = serverProcesses.get(serverName);
        if (!serverProcess || serverProcess.killed) {
            return [];
        }
        // Check if we have recent console output containing player information
        const consoleOutput = serverConsoleOutputs.get(serverName) || [];
        // Look for recent player list information in console output
        // Search through last 50 lines for player join/leave messages
        const recentLines = consoleOutput.slice(-50);
        const onlinePlayers = new Set();
        for (const line of recentLines) {
            // Look for player joined messages: "[timestamp] [Server thread/INFO]: PlayerName joined the game"
            const joinMatch = line.match(/\[.*?\]: (\w+) joined the game/);
            if (joinMatch) {
                onlinePlayers.add(joinMatch[1]);
            }
            // Look for player left messages: "[timestamp] [Server thread/INFO]: PlayerName left the game"
            const leftMatch = line.match(/\[.*?\]: (\w+) left the game/);
            if (leftMatch) {
                onlinePlayers.delete(leftMatch[1]);
            }
            // Look for explicit list command responses
            const listMatch = line.match(/There are \d+ of a max of \d+ players online:?\s*(.*)?/i);
            if (listMatch) {
                onlinePlayers.clear(); // Clear and use this authoritative list
                const playersString = listMatch[1];
                if (playersString && playersString.trim()) {
                    const players = playersString.split(',')
                        .map(name => name.trim())
                        .filter(name => name.length > 0);
                    players.forEach(player => onlinePlayers.add(player));
                }
                break; // Use the most recent list command result
            }
        }
        const result = Array.from(onlinePlayers);
        console.log(`[${serverName}] Online players from console analysis:`, result);
        return result;
    }
    catch (error) {
        console.error(`[${serverName}] Error getting online players:`, error);
        return [];
    }
}
// Get resource usage for a specific server process
async function getServerResourceUsage(serverName) {
    try {
        const pid = serverPids.get(serverName);
        if (!pid) {
            console.log(`[${serverName}] No PID found for resource monitoring`);
            return { cpu: 0, memory: 0 };
        }
        console.log(`[${serverName}] Monitoring PID: ${pid}`);
        // Approach 1: Use pidusage (most reliable for cross-platform process monitoring)
        try {
            const stats = await pidusage(pid);
            const memoryMB = Math.round(stats.memory / (1024 * 1024)); // Convert bytes to MB
            const cpuPercent = Math.min(100, Math.round(stats.cpu)); // Cap CPU at 100%
            console.log(`[${serverName}] PidUsage Method - CPU: ${cpuPercent}%, Memory: ${memoryMB}MB (${stats.memory} bytes)`);
            // pidusage is very reliable, so if it returns data, use it
            if (stats.memory > 0) {
                return { cpu: cpuPercent, memory: memoryMB };
            }
        }
        catch (error) {
            console.error(`[${serverName}] PidUsage method failed:`, error);
        }
        // Approach 2: Use Windows tasklist command for more accurate memory reading
        try {
            const { exec } = require('child_process');
            const result = await new Promise((resolve, reject) => {
                exec(`tasklist /FI "PID eq ${pid}" /FO CSV`, (error, stdout, stderr) => {
                    if (error)
                        reject(error);
                    else
                        resolve(stdout);
                });
            });
            // Parse tasklist output (CSV format)
            const lines = result.split('\n');
            if (lines.length >= 2) {
                const dataLine = lines[1];
                const columns = dataLine.split(',').map(col => col.replace(/"/g, ''));
                if (columns.length >= 5) {
                    const memoryStr = columns[4]; // Memory Usage column
                    const memoryKB = parseInt(memoryStr.replace(/[,\s]/g, ''));
                    const memoryMB = Math.round(memoryKB / 1024);
                    console.log(`[${serverName}] Tasklist Method - Memory: ${memoryMB}MB (${memoryKB}KB)`);
                    if (memoryMB > 0) {
                        return { cpu: 0, memory: memoryMB }; // CPU from tasklist is less reliable, keep it 0
                    }
                }
            }
        }
        catch (error) {
            console.error(`[${serverName}] Tasklist method failed:`, error);
        }
        // Approach 3: Use systeminformation (fallback)
        try {
            const processes = await si.processes();
            const serverProcess = processes.list.find(proc => proc.pid === pid);
            if (serverProcess) {
                const memoryMB = Math.round((serverProcess.memRss || 0) / (1024 * 1024));
                const cpuPercent = Math.min(100, Math.round(serverProcess.cpu || 0)); // Cap CPU at 100%
                console.log(`[${serverName}] SI Method - CPU: ${cpuPercent}%, Memory: ${memoryMB}MB (RSS: ${serverProcess.memRss}, VSZ: ${serverProcess.memVsz})`);
                // If we got reasonable values, return them
                if (memoryMB > 0) {
                    return { cpu: cpuPercent, memory: memoryMB };
                }
            }
        }
        catch (error) {
            console.error(`[${serverName}] SI method failed:`, error);
        }
        console.log(`[${serverName}] All memory monitoring methods failed, returning 0`);
        return { cpu: 0, memory: 0 };
    }
    catch (error) {
        console.error(`Error getting resource usage for ${serverName}:`, error);
        return { cpu: 0, memory: 0 };
    }
}
//# sourceMappingURL=main.js.map