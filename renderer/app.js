// Global variables
let servers = [];
let currentConsoleServer = null;
let systemInfo = null;

// DOM Elements
const cpuUsageElement = document.getElementById('cpuUsage');
const cpuCoresElement = document.getElementById('cpuCores');
const memUsageElement = document.getElementById('memUsage');
const memAvailableElement = document.getElementById('memAvailable');
const availableMemoryElement = document.getElementById('availableMemory');
const serversGrid = document.getElementById('serversGrid');
const emptyState = document.getElementById('emptyState');
const createServerModal = document.getElementById('createServerModal');
const consoleModal = document.getElementById('consoleModal');
const loadingOverlay = document.getElementById('loadingOverlay');

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    console.log('App initialized at:', new Date().toISOString());
    console.log('JavaScript file loaded with kick function');
    console.log('window.electronAPI available:', !!window.electronAPI);
    
    if (!window.electronAPI) {
        console.error('electronAPI not available!');
        showNotification('Electron API not available - please restart the app', 'error');
        return;
    }
    
    // Debug: Check if kickPlayer function is available
    console.log('Available electronAPI methods:', Object.keys(window.electronAPI));
    console.log('kickPlayer function available:', typeof window.electronAPI.kickPlayer === 'function');
    
    // Load system info
    await updateSystemInfo();
    
    // Load servers
    await loadServers();
    
    // Set up event listeners
    setupEventListeners();
    
    // Update system info every 5 seconds
    setInterval(updateSystemInfo, 5000);
    
    // Update server statuses every 3 seconds
    setInterval(updateServerStatuses, 3000);
});

// Event listeners
function setupEventListeners() {
    // Toolbar buttons
    document.getElementById('createServerBtn').addEventListener('click', showCreateServerModal);
    document.getElementById('refreshBtn').addEventListener('click', loadServers);
    document.getElementById('settingsBtn').addEventListener('click', () => {
        // TODO: Implement settings modal
        alert('Settings coming soon!');
    });
    
    // CPU Cores slider
    const cpuCoresSlider = document.getElementById('cpuCores');
    const cpuCoresValue = document.getElementById('cpuCoresValue');
    
    cpuCoresSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const maxCores = parseInt(e.target.max);
        
        if (value >= maxCores) {
            cpuCoresValue.textContent = 'All Available';
        } else {
            cpuCoresValue.textContent = `${value} Core${value > 1 ? 's' : ''}`;
        }
    });
    
    // Modal close events
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            hideAllModals();
        }
    });
    
    // ESC key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideAllModals();
        }
        // Debug shortcut: Ctrl+K to test kick API
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            testKickAPI();
            // Test with a fake kick if there are servers
            if (servers.length > 0) {
                console.log('Testing kick with first server...');
                testKickFunction();
            }
        }
    });
    
    // Command input (use keydown only to avoid double-fire with keypress)
    const commandInput = document.getElementById('commandInput');
    
    // MOTD character counter
    const motdInput = document.getElementById('motd');
    if (motdInput) {
        motdInput.addEventListener('input', (e) => {
            const remaining = 59 - e.target.value.length;
            if (remaining < 0) {
                e.target.value = e.target.value.substring(0, 59);
            }
        });
    }
    
    // Update MOTD placeholder based on server name
    const serverNameInput = document.getElementById('serverName');
    if (serverNameInput) {
        serverNameInput.addEventListener('input', (e) => {
            const motdInput = document.getElementById('motd');
            if (motdInput && !motdInput.value) {
                motdInput.placeholder = `Welcome to ${e.target.value || 'my server'}!`;
            }
        });
    }
    
    // Whitelist input enter key
    const whitelistInput = document.getElementById('whitelistPlayer');
    if (whitelistInput) {
        whitelistInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addWhitelistPlayer();
            }
        });
    }
    // Whitelist input in details view
    const detailsWhitelistInput = document.getElementById('whitelistInput');
    if (detailsWhitelistInput) {
        detailsWhitelistInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addToWhitelist();
            }
        });
    }
    
    // Server ops input enter key
    const serverOpInput = document.getElementById('serverOp');
    if (serverOpInput) {
        serverOpInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addServerOp();
            }
        });
    }
    commandInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendCommand();
        } else if (e.key === 'ArrowDown') {
            selectNextHint();
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            selectPrevHint();
            e.preventDefault();
        } else if (e.key === 'Tab') {
            if (selectedHintIndex >= 0) {
                applySelectedHint();
                e.preventDefault();
            }
        } else if (e.key === 'Escape') {
            hideCommandHints();
        }
    });
    
    commandInput.addEventListener('input', (e) => {
        showCommandHints(e.target.value);
    });
    
    // Hide hints when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.command-input-container')) {
            hideCommandHints();
        }
    });
    
    // Initialize command hints
    initializeCommandHints();
}

// System info functions
async function updateSystemInfo() {
    try {
        systemInfo = await window.electronAPI.getSystemInfo();
        
        // Update CPU usage and cores
        if (cpuUsageElement) {
            cpuUsageElement.textContent = `${systemInfo.cpu_usage}%`;
        }
        if (cpuCoresElement) {
            cpuCoresElement.textContent = `${systemInfo.cpu_count} cores available`;
        }
        
        // Update memory usage
        const usedMemory = systemInfo.total_memory - systemInfo.available_memory;
        if (memUsageElement) {
            memUsageElement.textContent = `${usedMemory.toFixed(1)} GB / ${systemInfo.total_memory} GB`;
        }
        if (memAvailableElement) {
            memAvailableElement.innerHTML = `${systemInfo.available_memory.toFixed(1)} GB Free for servers`;
        }
        if (availableMemoryElement) {
            availableMemoryElement.textContent = `${systemInfo.available_memory.toFixed(1)} GB`;
        }
    } catch (error) {
        console.error('Error updating system info:', error);
        if (cpuUsageElement) cpuUsageElement.textContent = '--';
        if (memUsageElement) memUsageElement.textContent = 'Error';
    }
}

// Server management functions
async function loadServers() {
    try {
        console.log('Starting to load servers...');
        showLoading();
        
        console.log('Calling window.electronAPI.getSavedServers()...');
        servers = await window.electronAPI.getSavedServers();
        console.log('Received servers:', servers);
        
        renderServers();
        await updateServerStatuses();
    } catch (error) {
        console.error('Error loading servers:', error);
        showNotification('Error loading servers: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderServers() {
    console.log('renderServers called with servers:', servers);
    serversGrid.innerHTML = '';
    
    if (servers.length === 0) {
        console.log('No servers found, showing empty state');
        emptyState.style.display = 'block';
        return;
    }
    
    console.log('Rendering', servers.length, 'servers');
    emptyState.style.display = 'none';
    
    servers.forEach(server => {
        console.log('Creating card for server:', server.name);
        const serverCard = createServerCard(server);
        serversGrid.appendChild(serverCard);
    });
}

function createServerCard(server) {
    const card = document.createElement('div');
    card.className = 'server-card';
    card.setAttribute('data-server', server.name);
    
    const isRunning = server.status?.is_running || false;
    if (isRunning) {
        card.classList.add('running');
    }
    
    card.innerHTML = `
        <div class="server-header">
            <div class="server-info">
                <div class="server-name">${escapeHtml(server.name)}</div>
                <div class="server-version">Minecraft ${server.version}</div>
            </div>
            <div class="server-status ${isRunning ? 'running' : 'stopped'}">
                <div class="status-indicator"></div>
                <span>${isRunning ? 'RUNNING' : 'STOPPED'}</span>
            </div>
        </div>
        
        <div class="server-stats">
            <div class="stat-row">
                <div class="stat-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="3" y="11" width="18" height="10" rx="2" stroke="currentColor" stroke-width="2"/>
                        <circle cx="12" cy="16" r="1" fill="currentColor"/>
                        <path d="M7 11V7A5 5 0 0 1 17 7V11" stroke="currentColor" stroke-width="2"/>
                    </svg>
                    <div class="stat-info">
                        <span class="stat-label">PORT</span>
                        <span class="stat-value">${server.port}</span>
                    </div>
                </div>
                <div class="stat-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="3" y="6" width="18" height="11" rx="2" stroke="currentColor" stroke-width="2"/>
                        <path d="M7 10H17V14H7V10Z" fill="currentColor"/>
                    </svg>
                    <div class="stat-info">
                        <span class="stat-label">RAM</span>
                        <span class="stat-value">${server.status?.memory_usage || 0}MB</span>
                    </div>
                </div>
            </div>
            <div class="stat-row">
                <div class="stat-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="4" y="4" width="6" height="6" rx="1" fill="currentColor"/>
                        <rect x="14" y="4" width="6" height="6" rx="1" fill="currentColor"/>
                        <rect x="4" y="14" width="6" height="6" rx="1" fill="currentColor"/>
                        <rect x="14" y="14" width="6" height="6" rx="1" fill="currentColor"/>
                    </svg>
                    <div class="stat-info">
                        <span class="stat-label">CPU</span>
                        <span class="stat-value">${server.status?.cpu_usage || 0}%</span>
                    </div>
                </div>
                <div class="stat-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 21V19H7V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M7 19V5A2 2 0 0 1 9 3H15A2 2 0 0 1 17 5V19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M9 9H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M9 13H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <div class="stat-info">
                        <span class="stat-label">PLAYERS</span>
                        <span class="stat-value">${server.status?.players_online?.length || 0}</span>
                    </div>
                </div>
            </div>
            <div class="stat-row">
                <div class="stat-item full-width">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                        <polyline points="12,6 12,12 16,14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <div class="stat-info">
                        <span class="stat-label">UPTIME</span>
                        <span class="stat-value">${formatUptime(server.status?.uptime || 0)}</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="server-actions">
            ${isRunning ? 
                `<button class="btn btn-danger action-btn" onclick="stopServer('${server.name}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="6" y="4" width="4" height="16" fill="currentColor"/>
                        <rect x="14" y="4" width="4" height="16" fill="currentColor"/>
                    </svg>
                    Stop
                </button>` :
                `<button class="btn btn-success action-btn" onclick="startServer('${server.name}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <polygon points="5,3 19,12 5,21" fill="currentColor"/>
                    </svg>
                    Start
                </button>`
            }
            <button class="btn btn-secondary action-btn" onclick="showConsole('${server.name}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="2"/>
                    <path d="M6 8L10 12L6 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M14 16H18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                Console
            </button>
            <button class="btn btn-secondary action-btn" onclick="copyServerAddress('${server.name}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
                    <path d="M5 15H4A2 2 0 0 1 2 13V4A2 2 0 0 1 4 2H13A2 2 0 0 1 15 4V5" stroke="currentColor" stroke-width="2"/>
                </svg>
                Copy IP
            </button>
            <button class="btn btn-danger action-btn" onclick="deleteServer('${server.name}')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2"/>
                    <path d="M19 6V20A2 2 0 0 1 17 20H7A2 2 0 0 1 5 20V6M8 6V4A2 2 0 0 1 10 4H14A2 2 0 0 1 16 4V6" stroke="currentColor" stroke-width="2"/>
                    <line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="2"/>
                    <line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="2"/>
                </svg>
                Delete
            </button>
        </div>
    `;
    
    // Add click handler to show server details (but not on buttons)
    card.addEventListener('click', (e) => {
        // Don't trigger if clicking on buttons
        if (!e.target.closest('.action-btn')) {
            showServerDetails(server.name);
        }
    });
    
    // Add cursor pointer style
    card.style.cursor = 'pointer';
    
    return card;
}

async function updateServerStatuses() {
    for (const server of servers) {
        try {
            const status = await window.electronAPI.getServerStatus(server.name);
            server.status = status;
        } catch (error) {
            console.error(`Error getting status for server ${server.name}:`, error);
            server.status = {
                name: server.name,
                is_running: false,
                players_online: [],
                cpu_usage: 0,
                memory_usage: 0,
                uptime: 0
            };
        }
    }
    
    renderServers();
    
    // Update server details if modal is open (safe updates only)
    if (currentDetailsServer) {
        const server = servers.find(s => s.name === currentDetailsServer);
        if (server) {
            updateServerOverview(server);
            // Update charts
            updateResourceCharts(server);
            
            // Update online players list in real-time
            updateOnlinePlayersLive(server);
            
            // Refresh banned players list periodically (every 5th update to avoid spam)
            if (Math.random() < 0.2) { // 20% chance per update = roughly every 15 seconds
                const bannedElement = document.getElementById('bannedPlayersList');
                if (bannedElement) {
                    updateBannedPlayers(currentDetailsServer, bannedElement).catch(console.error);
                }
            }
        }
    }
}

// Server actions
async function startServer(serverName) {
    try {
        showLoading();
        const result = await window.electronAPI.startServer(serverName);
        showNotification(result, 'success');
        await loadServers();
    } catch (error) {
        console.error('Error starting server:', error);
        showNotification(`Error starting server: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function stopServer(serverName) {
    try {
        showLoading();
        const result = await window.electronAPI.stopServer(serverName);
        showNotification(result, 'success');
        await loadServers();
    } catch (error) {
        console.error('Error stopping server:', error);
        showNotification(`Error stopping server: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function deleteServer(serverName) {
    if (!confirm(`Are you sure you want to delete "${serverName}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        showLoading();
        const result = await window.electronAPI.deleteServer(serverName);
        showNotification(result, 'success');
        await loadServers();
    } catch (error) {
        console.error('Error deleting server:', error);
        showNotification(`Error deleting server: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function copyServerAddress(serverName) {
    try {
        const localIP = await window.electronAPI.getLocalIP();
        const server = servers.find(s => s.name === serverName);
        if (!server) {
            throw new Error('Server not found');
        }
        
        const address = `${localIP}:${server.port}`;
        
        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(address);
            showNotification(`Copied to clipboard: ${address}`, 'success');
        } else {
            // Fallback method for older browsers or restricted contexts
            const textArea = document.createElement('textarea');
            textArea.value = address;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showNotification(`Copied to clipboard: ${address}`, 'success');
        }
    } catch (error) {
        console.error('Error copying address:', error);
        showNotification(`Error copying server address: ${error.message}`, 'error');
    }
}

// Modal functions

function hideCreateServerModal() {
    createServerModal.classList.remove('show');
    // Ensure it's fully hidden even if shown via inline style
    if (createServerModal && createServerModal.style) {
        createServerModal.style.display = 'none';
    }
    document.getElementById('createServerForm').reset();
}

function hideAllModals() {
    createServerModal.classList.remove('show');
    if (createServerModal && createServerModal.style) {
        createServerModal.style.display = 'none';
    }
    const consoleModal = document.getElementById('consoleModal');
    if (consoleModal) {
        consoleModal.classList.remove('show');
    }
    const serverDetailsModal = document.getElementById('serverDetailsModal');
    if (serverDetailsModal) {
        serverDetailsModal.classList.remove('show');
    }
}

// Tab switching functionality
function switchConfigTab(evt, tabName) {
    // Hide all tab contents
    const tabContents = document.getElementsByClassName('config-tab-content');
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].classList.remove('active');
    }
    
    // Remove active class from all tabs
    const tabs = document.getElementsByClassName('config-tab');
    for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
    }
    
    // Show the selected tab content and mark tab as active
    document.getElementById(tabName).classList.add('active');
    evt.currentTarget.classList.add('active');
}

// Whitelist management
let whitelistedPlayers = [];
let serverOps = [];

function addWhitelistPlayer() {
    const input = document.getElementById('whitelistPlayer');
    const username = input.value.trim();
    
    if (!username) return;
    if (whitelistedPlayers.includes(username)) {
        showNotification('Player already in whitelist', 'warning');
        return;
    }
    
    whitelistedPlayers.push(username);
    input.value = '';
    updateWhitelistDisplay();
}

function removeWhitelistPlayer(username) {
    whitelistedPlayers = whitelistedPlayers.filter(p => p !== username);
    updateWhitelistDisplay();
}

function updateWhitelistDisplay() {
    const container = document.getElementById('whitelistPlayers');
    if (whitelistedPlayers.length === 0) {
        container.innerHTML = '<small class="text-muted">No players added yet. Add usernames above.</small>';
    } else {
        container.innerHTML = whitelistedPlayers.map(player => 
            `<span class="player-tag">
                ${player}
                <button class="remove-player" onclick="removeWhitelistPlayer('${player}')" title="Remove player">×</button>
            </span>`
        ).join('');
    }
}

function addServerOp() {
    const input = document.getElementById('serverOp');
    const username = input.value.trim();
    
    if (!username) return;
    if (serverOps.includes(username)) {
        showNotification('Player already an admin', 'warning');
        return;
    }
    
    serverOps.push(username);
    input.value = '';
    updateServerOpsDisplay();
}

function removeServerOp(username) {
    serverOps = serverOps.filter(p => p !== username);
    updateServerOpsDisplay();
}

function updateServerOpsDisplay() {
    const container = document.getElementById('serverOps');
    if (serverOps.length === 0) {
        container.innerHTML = '<small class="text-muted">No admins added yet. Add usernames above.</small>';
    } else {
        container.innerHTML = serverOps.map(player => 
            `<span class="player-tag">
                ${player}
                <button class="remove-player" onclick="removeServerOp('${player}')" title="Remove admin">×</button>
            </span>`
        ).join('');
    }
}

// Whitelist toggle functionality
function toggleWhitelistSection() {
    const whitelistEnabled = document.getElementById('whitelistEnabled').checked;
    const whitelistSection = document.getElementById('whitelistSection');
    whitelistSection.style.display = whitelistEnabled ? 'block' : 'none';
}

// Create server form
async function selectServerPath() {
    try {
        const path = await window.electronAPI.selectFolder();
        if (path) {
            document.getElementById('serverPath').value = path;
        }
    } catch (error) {
        console.error('Error selecting path:', error);
        showNotification('Error selecting folder', 'error');
    }
}

async function createServer() {
    try {
        const form = document.getElementById('createServerForm');
        
        // Collect all configuration data from all tabs
        const config = {
            // Basic settings
            name: document.getElementById('serverName').value.trim(),
            version: document.getElementById('serverVersion').value,
            port: 0, // Will be assigned automatically
            min_ram: parseInt(document.getElementById('minRam').value),
            max_ram: parseInt(document.getElementById('maxRam').value),
            cpu_cores: parseInt(document.getElementById('cpuCores').value),
            path: document.getElementById('serverPath').value,
            auto_start: document.getElementById('autoStart').checked,
            
            // Advanced server settings
            settings: {
                // World settings
                level_name: document.getElementById('worldName')?.value || 'world',
                motd: document.getElementById('motd')?.value || `Welcome to ${document.getElementById('serverName').value.trim()}!`,
                gamemode: document.getElementById('gamemode')?.value || 'survival',
                difficulty: document.getElementById('difficulty')?.value || 'normal',
                level_seed: document.getElementById('levelSeed')?.value || '',
                level_type: document.getElementById('levelType')?.value || 'minecraft:normal',
                view_distance: parseInt(document.getElementById('viewDistance')?.value) || 10,
                spawn_protection: parseInt(document.getElementById('spawnProtection')?.value) || 16,
                
                // Gameplay settings
                hardcore: document.getElementById('hardcore')?.checked || false,
                pvp: document.getElementById('pvp')?.checked !== false, // Default true
                spawn_monsters: document.getElementById('spawnMonsters')?.checked !== false, // Default true
                spawn_animals: document.getElementById('spawnAnimals')?.checked !== false, // Default true
                spawn_npcs: document.getElementById('spawnNpcs')?.checked !== false, // Default true
                generate_structures: document.getElementById('generateStructures')?.checked !== false, // Default true
                allow_flight: document.getElementById('allowFlight')?.checked || false,
                enable_command_block: document.getElementById('enableCommandBlock')?.checked || false,
                
                // Player management
                max_players: parseInt(document.getElementById('maxPlayers')?.value) || 20,
                online_mode: document.getElementById('onlineMode')?.checked !== false, // Default true
                white_list: document.getElementById('whitelistEnabled')?.checked || false,
                enforce_whitelist: document.getElementById('enforceWhitelist')?.checked || false,
                
                // Advanced settings
                enable_rcon: document.getElementById('enableRcon')?.checked !== false, // Default true
                network_compression_threshold: parseInt(document.getElementById('networkCompressionThreshold')?.value) || 256,
                max_tick_time: parseInt(document.getElementById('maxTickTime')?.value) || 60000,
                hide_online_players: document.getElementById('hideOnlinePlayers')?.checked || false,
                prevent_proxy_connections: document.getElementById('preventProxyConnections')?.checked || false,
                use_native_transport: document.getElementById('useNativeTransport')?.checked !== false, // Default true
                enable_jmx_monitoring: document.getElementById('enableJmxMonitoring')?.checked || false,
                sync_chunk_writes: document.getElementById('syncChunkWrites')?.checked !== false, // Default true
                enable_status: document.getElementById('enableStatus')?.checked !== false, // Default true
                broadcast_console_to_ops: document.getElementById('broadcastConsoleToOps')?.checked !== false, // Default true
                broadcast_rcon_to_ops: document.getElementById('broadcastRconToOps')?.checked !== false, // Default true
                function_permission_level: parseInt(document.getElementById('functionPermissionLevel')?.value) || 2,
                op_permission_level: parseInt(document.getElementById('opPermissionLevel')?.value) || 4
            },
            
            // Whitelist and ops
            whitelist: whitelistedPlayers,
            operators: serverOps
        };
        
        // Validation
        if (!config.name) {
            showNotification('Please enter a server name', 'error');
            return;
        }
        
        if (!config.path) {
            if (window.electronAPI && typeof window.electronAPI.getDefaultServerPath === 'function') {
                config.path = await window.electronAPI.getDefaultServerPath();
                const input = document.getElementById('serverPath');
                if (input) input.value = config.path;
            } else {
                showNotification('Please select a server directory', 'error');
                return;
            }
        }
        
        if (config.min_ram >= config.max_ram) {
            showNotification('Max RAM must be greater than Min RAM', 'error');
            return;
        }
        
        // Check if server name already exists
        if (servers.some(s => s.name === config.name)) {
            showNotification('A server with this name already exists', 'error');
            return;
        }
        
        showLoading();
        const result = await window.electronAPI.createServer(config);
        showNotification(result, 'success');
        hideCreateServerModal();
        await loadServers();
        
        // Reset form for next time
        resetCreateServerForm();
        
    } catch (error) {
        console.error('Error creating server:', error);
        showNotification(`Error creating server: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

function resetCreateServerForm() {
    // Reset all form fields
    document.getElementById('createServerForm').reset();
    
    // Reset arrays
    whitelistedPlayers = [];
    serverOps = [];
    updateWhitelistDisplay();
    updateServerOpsDisplay();
    
    // Reset to first tab
    document.querySelector('.config-tab.active')?.classList.remove('active');
    document.querySelector('.config-tab-content.active')?.classList.remove('active');
    document.querySelector('.config-tab').classList.add('active');
    document.getElementById('basicTab').classList.add('active');
    
    // Reset whitelist section visibility
    document.getElementById('whitelistSection').style.display = 'none';
}

// Enhanced modal functions
function showCreateServerModal() {
    // Use the same class-based show as other modals for consistency
    if (createServerModal && createServerModal.style) {
        createServerModal.style.display = 'flex';
    }
    createServerModal.classList.add('show');
    // Reset form first
    resetCreateServerForm();
    // Initialize CPU cores slider with system info
    if (systemInfo) {
        const cpuCoresSlider = document.getElementById('cpuCores');
        const cpuCoresValue = document.getElementById('cpuCoresValue');
        if (cpuCoresSlider && cpuCoresValue) {
            cpuCoresSlider.max = systemInfo.cpu_count;
            cpuCoresSlider.value = systemInfo.cpu_count;
            cpuCoresValue.textContent = 'All Available';
        }
    }
    
    // Set up event listeners for dynamic elements
    const whitelistCheckbox = document.getElementById('whitelistEnabled');
    if (whitelistCheckbox) {
        whitelistCheckbox.addEventListener('change', toggleWhitelistSection);
    }
    
    // Set default values
    document.getElementById('maxRam').value = 4096; // 4GB default
    document.getElementById('motd').placeholder = `Welcome to ${document.getElementById('serverName').value || 'my server'}!`;
    // Prefill default server path if empty
    if (window.electronAPI && typeof window.electronAPI.getDefaultServerPath === 'function') {
        const pathInput = document.getElementById('serverPath');
        if (pathInput && !pathInput.value) {
            window.electronAPI.getDefaultServerPath().then(p => {
                if (pathInput && !pathInput.value) pathInput.value = p;
            }).catch(console.error);
        }
    }
}

// Console functions

// Utility functions
function showLoading() {
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}

function showNotification(message, type = 'info') {
    // Simple notification system - you could enhance this with a proper toast library
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#ff416c' : type === 'success' ? '#38ef7d' : '#4facfe'};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        z-index: 3000;
        max-width: 400px;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        font-weight: 600;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

function formatUptime(seconds) {
    if (seconds === 0) return '0s';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Add notification animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Console functionality
function showConsole(serverName) {
    console.log('showConsole called with serverName:', serverName);
    
    if (!serverName) {
        console.error('showConsole called with null/undefined serverName');
        showNotification('Error: No server specified', 'error');
        return;
    }
    
    currentConsoleServer = serverName;
    const consoleTitle = document.getElementById('consoleTitle');
    const consoleOutput = document.getElementById('consoleOutput');
    const consoleModal = document.getElementById('consoleModal');
    const commandInput = document.getElementById('commandInput');
    const sendCommandBtn = document.getElementById('sendCommandBtn');
    
    if (consoleTitle) {
        consoleTitle.textContent = `${serverName} - Console`;
    }
    
    if (consoleOutput) {
        consoleOutput.innerHTML = '<div class="console-line">Loading console output...</div>';
    }
    
    // Check if server is running to enable/disable input
    const server = servers.find(s => s.name === serverName);
    const isRunning = server?.status?.is_running || false;
    
    if (commandInput) {
        commandInput.disabled = !isRunning;
        commandInput.placeholder = isRunning ? 'Enter command...' : 'Server must be running to send commands';
    }
    
    if (sendCommandBtn) {
        sendCommandBtn.disabled = !isRunning;
    }
    
    // Load existing console output
    loadConsoleOutput(serverName);
    
    // Set up real-time console updates
    setupConsoleListener();
    
    if (consoleModal) {
        consoleModal.classList.add('show');
    }
}

function hideConsoleModal() {
    const consoleModal = document.getElementById('consoleModal');
    if (consoleModal) {
        consoleModal.classList.remove('show');
    }
    
    // Remove console listener when closing
    if (window.electronAPI && window.electronAPI.removeConsoleOutputListener) {
        window.electronAPI.removeConsoleOutputListener();
    }
    
    currentConsoleServer = null;
}

async function loadConsoleOutput(serverName) {
    try {
        const lines = await window.electronAPI.getConsoleOutput(serverName);
        const consoleOutput = document.getElementById('consoleOutput');
        
        if (consoleOutput && lines.length > 0) {
            consoleOutput.innerHTML = lines.map(line => 
                `<div class="console-line ${line.startsWith('[ERROR]') ? 'error' : line.startsWith('>') ? 'command' : 'info'}">${escapeHtml(line)}</div>`
            ).join('');
            
            // Scroll to bottom
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        } else if (consoleOutput) {
            consoleOutput.innerHTML = '<div class="console-line info">No console output yet. Start the server to see logs.</div>';
        }
    } catch (error) {
        console.error('Error loading console output:', error);
        const consoleOutput = document.getElementById('consoleOutput');
        if (consoleOutput) {
            consoleOutput.innerHTML = '<div class="console-line error">Error loading console output</div>';
        }
    }
}

function setupConsoleListener() {
    if (window.electronAPI && window.electronAPI.onConsoleOutput) {
        // Ensure we don't double-subscribe
        if (window.electronAPI.removeConsoleOutputListener) {
            window.electronAPI.removeConsoleOutputListener();
        }
        window.electronAPI.onConsoleOutput((serverName, lines) => {
            // Only update if this is the currently viewed server
            if (serverName === currentConsoleServer) {
                const consoleOutput = document.getElementById('consoleOutput');
                if (consoleOutput && lines.length > 0) {
                    const newLines = lines.map(line => 
                        `<div class="console-line ${line.startsWith('[ERROR]') ? 'error' : line.startsWith('>') ? 'command' : 'info'}">${escapeHtml(line)}</div>`
                    ).join('');
                    
                    consoleOutput.innerHTML += newLines;
                    
                    // Scroll to bottom
                    consoleOutput.scrollTop = consoleOutput.scrollHeight;
                }
            }
        });
    }
}

async function sendCommand() {
    const commandInput = document.getElementById('commandInput');
    const command = commandInput?.value?.trim();
    
    if (!command || !currentConsoleServer) {
        return;
    }
    
    try {
        await window.electronAPI.sendCommand(currentConsoleServer, command);
        commandInput.value = '';
        
        // The command output will be received through the console listener
    } catch (error) {
        console.error('Error sending command:', error);
        showNotification(`Error sending command: ${error.message}`, 'error');
    }
}

async function clearConsole() {
    if (!currentConsoleServer) {
        return;
    }
    
    try {
        await window.electronAPI.clearConsoleOutput(currentConsoleServer);
        const consoleOutput = document.getElementById('consoleOutput');
        if (consoleOutput) {
            consoleOutput.innerHTML = '<div class="console-line info">Console cleared</div>';
        }
    } catch (error) {
        console.error('Error clearing console:', error);
        showNotification(`Error clearing console: ${error.message}`, 'error');
    }
}

// Handle Enter key in command input
document.addEventListener('DOMContentLoaded', () => {
    const commandInput = document.getElementById('commandInput');
    if (commandInput) {
        // Enter key handler already exists in init() function, no need to duplicate
    }
});

// Command hints system
let minecraftCommands = [];
let selectedHintIndex = -1;

function initializeCommandHints() {
    minecraftCommands = [
        // Player management
        { name: '/ban', description: 'Ban a player from the server', syntax: '/ban <player> [reason]' },
        { name: '/kick', description: 'Kick a player from the server', syntax: '/kick <player> [reason]' },
        { name: '/op', description: 'Give operator status to a player', syntax: '/op <player>' },
        { name: '/deop', description: 'Remove operator status from a player', syntax: '/deop <player>' },
        { name: '/pardon', description: 'Unban a player', syntax: '/pardon <player>' },
        { name: '/whitelist', description: 'Manage server whitelist', syntax: '/whitelist <add|remove|list|on|off> [player]' },
        
        // World management
        { name: '/tp', description: 'Teleport players', syntax: '/tp <player> [target] or /tp <x> <y> <z>' },
        { name: '/gamemode', description: 'Change player gamemode', syntax: '/gamemode <survival|creative|adventure|spectator> [player]' },
        { name: '/time', description: 'Change world time', syntax: '/time <set|add> <value>' },
        { name: '/weather', description: 'Change weather', syntax: '/weather <clear|rain|thunder> [duration]' },
        { name: '/difficulty', description: 'Set world difficulty', syntax: '/difficulty <peaceful|easy|normal|hard>' },
        { name: '/gamerule', description: 'Change game rules', syntax: '/gamerule <rule> [value]' },
        
        // Server management
        { name: '/stop', description: 'Stop the server', syntax: '/stop' },
        { name: '/save-all', description: 'Save all chunks', syntax: '/save-all' },
        { name: '/save-on', description: 'Enable automatic saving', syntax: '/save-on' },
        { name: '/save-off', description: 'Disable automatic saving', syntax: '/save-off' },
        { name: '/list', description: 'List online players', syntax: '/list' },
        { name: '/reload', description: 'Reload server configuration', syntax: '/reload' },
        
        // Items and blocks
        { name: '/give', description: 'Give items to player', syntax: '/give <player> <item> [amount]' },
        { name: '/clear', description: 'Clear player inventory', syntax: '/clear [player] [item] [count]' },
        { name: '/fill', description: 'Fill area with blocks', syntax: '/fill <x1> <y1> <z1> <x2> <y2> <z2> <block>' },
        { name: '/setblock', description: 'Place a block', syntax: '/setblock <x> <y> <z> <block>' },
        
        // Effects and attributes
        { name: '/effect', description: 'Apply status effects', syntax: '/effect <give|clear> <player> [effect] [duration] [amplifier]' },
        { name: '/enchant', description: 'Enchant player item', syntax: '/enchant <player> <enchantment> [level]' },
        { name: '/xp', description: 'Give experience points', syntax: '/xp <amount> [player]' },
        
        // Information commands
        { name: '/help', description: 'Show help information', syntax: '/help [command]' },
        { name: '/seed', description: 'Show world seed', syntax: '/seed' },
        { name: '/version', description: 'Show server version', syntax: '/version' },
        
        // Common non-slash commands
        { name: 'say', description: 'Send message to all players', syntax: 'say <message>' },
        { name: 'tell', description: 'Send private message', syntax: 'tell <player> <message>' },
        { name: 'me', description: 'Send action message', syntax: 'me <action>' }
    ];
}

function showCommandHints(input) {
    const hintsContainer = document.getElementById('commandHints');
    if (!hintsContainer || !input.trim()) {
        hideCommandHints();
        return;
    }
    
    const query = input.toLowerCase();
    const matchingCommands = minecraftCommands.filter(cmd => 
        cmd.name.toLowerCase().includes(query) || 
        cmd.description.toLowerCase().includes(query)
    );
    
    if (matchingCommands.length === 0) {
        hideCommandHints();
        return;
    }
    
    hintsContainer.innerHTML = matchingCommands.slice(0, 8).map((cmd, index) => `
        <div class="command-hint" data-index="${index}" onclick="applyHint('${cmd.name}')">
            <div class="command-hint-name">${cmd.name}</div>
            <div class="command-hint-description">${cmd.description}</div>
            <div class="command-hint-syntax">${cmd.syntax}</div>
        </div>
    `).join('');
    
    hintsContainer.style.display = 'block';
    selectedHintIndex = -1;
}

function hideCommandHints() {
    const hintsContainer = document.getElementById('commandHints');
    if (hintsContainer) {
        hintsContainer.style.display = 'none';
        selectedHintIndex = -1;
    }
}

function selectNextHint() {
    const hints = document.querySelectorAll('.command-hint');
    if (hints.length === 0) return;
    
    if (selectedHintIndex >= 0) {
        hints[selectedHintIndex].classList.remove('selected');
    }
    
    selectedHintIndex = (selectedHintIndex + 1) % hints.length;
    hints[selectedHintIndex].classList.add('selected');
    hints[selectedHintIndex].scrollIntoView({ block: 'nearest' });
}

function selectPrevHint() {
    const hints = document.querySelectorAll('.command-hint');
    if (hints.length === 0) return;
    
    if (selectedHintIndex >= 0) {
        hints[selectedHintIndex].classList.remove('selected');
    }
    
    selectedHintIndex = selectedHintIndex <= 0 ? hints.length - 1 : selectedHintIndex - 1;
    hints[selectedHintIndex].classList.add('selected');
    hints[selectedHintIndex].scrollIntoView({ block: 'nearest' });
}

function applySelectedHint() {
    const hints = document.querySelectorAll('.command-hint');
    if (selectedHintIndex >= 0 && hints[selectedHintIndex]) {
        const commandName = hints[selectedHintIndex].querySelector('.command-hint-name').textContent;
        applyHint(commandName);
    }
}

function applyHint(commandName) {
    const commandInput = document.getElementById('commandInput');
    if (commandInput) {
        commandInput.value = commandName + ' ';
        commandInput.focus();
        hideCommandHints();
    }
}

// Server Details functionality
let currentDetailsServer = null;
let cpuChart = null;
let memoryChart = null;

function showServerDetails(serverName) {
    console.log('showServerDetails called with serverName:', serverName);
    currentDetailsServer = serverName;
    console.log('currentDetailsServer set to:', currentDetailsServer);
    
    const modal = document.getElementById('serverDetailsModal');
    const title = document.getElementById('serverDetailsTitle');
    
    if (title) {
        title.textContent = `${serverName} - Server Details`;
    }
    
    // Load server data
    loadServerDetails(serverName);
    
    if (modal) {
        modal.classList.add('show');
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        
        // Simple approach - just set scroll position and prevent background scroll
        setTimeout(() => {
            modal.scrollTop = 0;
        }, 50);
    }
}

function hideServerDetailsModal() {
    const modal = document.getElementById('serverDetailsModal');
    if (modal) {
        modal.classList.remove('show');
        // Restore body scroll
        document.body.style.overflow = '';
    }
    currentDetailsServer = null;
    
    // Cleanup charts
    if (cpuChart) {
        cpuChart.destroy();
        cpuChart = null;
    }
    if (memoryChart) {
        memoryChart.destroy();
        memoryChart = null;
    }
}

async function loadServerDetails(serverName) {
    try {
        // Get server info
        const server = servers.find(s => s.name === serverName);
        if (!server) return;
        
        // Update basic info
        updateServerOverview(server);
        
        // Update players
        await updatePlayersInfo(serverName);
        
    // Populate editable settings
    populateDetailsSettings(server);

    // Initialize or update charts
        initializeResourceCharts(server);
        
    } catch (error) {
        console.error('Error loading server details:', error);
    }
}

function updateServerOverview(server) {
    const statusElement = document.getElementById('detailsStatus');
    const uptimeElement = document.getElementById('detailsUptime');
    const versionElement = document.getElementById('detailsVersion');
    
    const isRunning = server.status?.is_running || false;
    
    if (statusElement) {
        statusElement.textContent = isRunning ? 'RUNNING' : 'STOPPED';
        statusElement.className = `server-status-badge ${isRunning ? 'running' : 'stopped'}`;
    }
    
    if (uptimeElement) {
        uptimeElement.textContent = formatUptime(server.status?.uptime || 0);
    }
    
    if (versionElement) {
        versionElement.textContent = server.version;
    }
}

function populateDetailsSettings(server) {
    try {
        const motdEl = document.getElementById('detailsMotd');
        const maxPlayersEl = document.getElementById('detailsMaxPlayers');
    const viewDistanceEl = document.getElementById('detailsViewDistance');
    const simDistanceEl = document.getElementById('detailsSimulationDistance');
        const onlineModeEl = document.getElementById('detailsOnlineMode');
        const wlEnabledEl = document.getElementById('detailsWhitelistEnabled');
        const enforceEl = document.getElementById('detailsEnforceWhitelist');

        const s = server.settings || {};
        if (motdEl) motdEl.value = s.motd || '';
        if (maxPlayersEl) maxPlayersEl.value = (s.max_players ?? 20);
    if (viewDistanceEl) viewDistanceEl.value = (s.view_distance ?? 10);
    if (simDistanceEl) simDistanceEl.value = (s.simulation_distance ?? 10);
        if (onlineModeEl) onlineModeEl.checked = (s.online_mode !== false);
        if (wlEnabledEl) wlEnabledEl.checked = !!s.white_list;
        if (enforceEl) enforceEl.checked = !!s.enforce_whitelist;
    } catch (e) {
        console.error('populateDetailsSettings failed:', e);
    }
}

async function saveDetailsSettings() {
    try {
        if (!currentDetailsServer) return;
        const server = servers.find(s => s.name === currentDetailsServer);
        if (!server) return;

        const motd = document.getElementById('detailsMotd')?.value || '';
        const maxPlayers = parseInt(document.getElementById('detailsMaxPlayers')?.value || '20', 10);
    const viewDistance = parseInt(document.getElementById('detailsViewDistance')?.value || '10', 10);
    const simulationDistance = parseInt(document.getElementById('detailsSimulationDistance')?.value || '10', 10);
        const onlineMode = !!document.getElementById('detailsOnlineMode')?.checked;
        const whiteList = !!document.getElementById('detailsWhitelistEnabled')?.checked;
        const enforceWhitelist = !!document.getElementById('detailsEnforceWhitelist')?.checked;

        const updated = { ...server };
        updated.settings = { ...(server.settings || {}) };
        updated.settings.motd = motd;
        updated.settings.max_players = isNaN(maxPlayers) ? 20 : maxPlayers;
    updated.settings.view_distance = isNaN(viewDistance) ? 10 : viewDistance;
    updated.settings.simulation_distance = isNaN(simulationDistance) ? 10 : simulationDistance;
        updated.settings.online_mode = onlineMode;
        updated.settings.white_list = whiteList;
        updated.settings.enforce_whitelist = enforceWhitelist;

        showLoading();
        const msg = await window.electronAPI.updateServerSettings(currentDetailsServer, updated);
        showNotification(msg || 'Settings saved', 'success');

        // Apply whitelist toggles at runtime when possible (enforce requires restart)
        const isRunning = server.status?.is_running;
        const prevSettings = server.settings || {};
        const onlineModeChanged = onlineMode !== (prevSettings.online_mode !== false);
        const enforceChanged = enforceWhitelist !== !!prevSettings.enforce_whitelist;
    const motdChanged = motd !== (prevSettings.motd || '');
    const maxPlayersChanged = (isNaN(maxPlayers) ? 20 : maxPlayers) !== (prevSettings.max_players ?? 20);
    const viewDistanceChanged = (isNaN(viewDistance) ? 10 : viewDistance) !== (prevSettings.view_distance ?? 10);
    const simDistanceChanged = (isNaN(simulationDistance) ? 10 : simulationDistance) !== (prevSettings.simulation_distance ?? 10);

        if (isRunning && window.electronAPI && typeof window.electronAPI.sendCommand === 'function') {
            if (whiteList && !prevSettings.white_list) {
                await window.electronAPI.sendCommand(currentDetailsServer, 'whitelist on');
                await window.electronAPI.sendCommand(currentDetailsServer, 'whitelist reload');
            } else if (!whiteList && !!prevSettings.white_list) {
                await window.electronAPI.sendCommand(currentDetailsServer, 'whitelist off');
            } else if (whiteList) {
                // If still enabled, at least reload to pick up file changes
                await window.electronAPI.sendCommand(currentDetailsServer, 'whitelist reload');
            }

            if (enforceChanged) {
                showNotification('Enforce-whitelist change will apply after restart.', 'info');
            }
            if (onlineModeChanged || motdChanged || maxPlayersChanged || viewDistanceChanged || simDistanceChanged) {
                showNotification('Some settings require a server restart to take effect (online-mode, MOTD, max/simulation/view distance).', 'info');
            }
        } else if (
            whiteList !== !!prevSettings.white_list ||
            enforceChanged || onlineModeChanged || motdChanged || maxPlayersChanged || viewDistanceChanged || simDistanceChanged
        ) {
            showNotification('Changes will apply after restart.', 'info');
        }

        // Refresh UI
        await refreshWhitelist(currentDetailsServer);
        await loadServers();
        // Keep the modal open; update overview and charts from refreshed data
        const refreshed = servers.find(s => s.name === currentDetailsServer);
        if (refreshed) {
            updateServerOverview(refreshed);
            updateResourceCharts(refreshed);
        }
    } catch (e) {
        console.error('Save settings failed:', e);
        showNotification('Failed to save settings: ' + (e.message || e), 'error');
    } finally {
        hideLoading();
    }
}

async function updatePlayersInfo(serverName) {
    try {
        const server = servers.find(s => s.name === serverName);
        if (!server) return;
        
        // Update player count
        const playerCountElement = document.getElementById('playerCount');
        const onlineCount = server.status?.players_online?.length || 0;
        if (playerCountElement) {
            playerCountElement.textContent = `(${onlineCount} online)`;
        }
        
        // Update online players list
        const onlinePlayersElement = document.getElementById('onlinePlayersList');
        if (onlinePlayersElement) {
            if (onlineCount === 0) {
                onlinePlayersElement.innerHTML = '<div class="empty-players">No players online</div>';
            } else {
                onlinePlayersElement.innerHTML = server.status.players_online.map(player => `
                    <div class="player-item">
                        <span class="player-name">${escapeHtml(player)}</span>
                        <div class="player-actions">
                            <button class="btn btn-danger btn-sm" onclick="kickPlayer('${serverName}', '${player}')">Kick</button>
                        </div>
                    </div>
                `).join('');
            }
        }
        
    // Load whitelist and banned players from server
    await refreshWhitelist(serverName);
    const bannedElement = document.getElementById('bannedPlayersList');
        
    // Load banned players
    await updateBannedPlayers(serverName, bannedElement);
        
    } catch (error) {
        console.error('Error updating players info:', error);
    }
}

// Refresh whitelist UI and status
async function refreshWhitelist(nameOverride) {
    try {
        const name = nameOverride || currentDetailsServer;
        const whitelistElement = document.getElementById('whitelistPlayersList');
        const statusEl = document.getElementById('whitelistStatus');
        const enforceEl = document.getElementById('enforceStatus');
        if (!name || !whitelistElement) return;
        if (!window.electronAPI || typeof window.electronAPI.getWhitelist !== 'function') return;

        const wl = await window.electronAPI.getWhitelist(name);
        // Status badges
        if (statusEl) {
            statusEl.textContent = wl.enabled ? 'Enabled' : 'Disabled';
            statusEl.className = 'status-indicator ' + (wl.enabled ? 'healthy' : '');
        }
        if (enforceEl) {
            enforceEl.textContent = wl.enforce ? 'Enforced' : 'Not enforced';
            enforceEl.className = 'status-indicator ' + (wl.enforce ? 'healthy' : '');
        }

        // Players list
        if (!wl.enabled) {
            whitelistElement.innerHTML = '<div class="empty-players">Whitelist disabled</div>';
        } else if (!wl.players || wl.players.length === 0) {
            whitelistElement.innerHTML = '<div class="empty-players">No players in whitelist</div>';
        } else {
            whitelistElement.innerHTML = wl.players.map(player => `
                <div class="player-item">
                    <span class="player-name">${escapeHtml(player)}</span>
                    <div class="player-actions">
                        <button class="btn btn-danger btn-sm" onclick="removeFromWhitelist('${name}', '${player}')">Remove</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error('Failed to refresh whitelist:', e);
        const whitelistElement = document.getElementById('whitelistPlayersList');
        if (whitelistElement) {
            whitelistElement.innerHTML = '<div class="empty-players error">Error loading whitelist</div>';
        }
    }
}

// Live update function for online players (more efficient, no full reload)
function updateOnlinePlayersLive(server) {
    try {
        // Update player count
        const playerCountElement = document.getElementById('playerCount');
        const onlineCount = server.status?.players_online?.length || 0;
        if (playerCountElement) {
            playerCountElement.textContent = `(${onlineCount} online)`;
        }
        
        // Update online players list efficiently
        const onlinePlayersElement = document.getElementById('onlinePlayersList');
        if (onlinePlayersElement) {
            const currentPlayers = server.status?.players_online || [];
            
            // Get current displayed players to avoid unnecessary DOM updates
            const currentDisplayed = Array.from(onlinePlayersElement.querySelectorAll('.player-name'))
                .map(el => el.textContent.trim());
            
            // Only update if the player list actually changed
            const playersChanged = currentPlayers.length !== currentDisplayed.length ||
                !currentPlayers.every(player => currentDisplayed.includes(player));
            
            if (playersChanged) {
                if (currentPlayers.length === 0) {
                    onlinePlayersElement.innerHTML = '<div class="empty-players">No players online</div>';
                } else {
                    onlinePlayersElement.innerHTML = currentPlayers.map(player => `
                        <div class="player-item">
                            <span class="player-name">${escapeHtml(player)}</span>
                            <div class="player-actions">
                                <button class="btn btn-danger btn-sm" onclick="kickPlayer('${server.name}', '${player}')">Kick</button>
                            </div>
                        </div>
                    `).join('');
                }
            }
        }
        
    } catch (error) {
        console.error('Error updating online players live:', error);
    }
}

async function updateBannedPlayers(serverName, bannedElement) {
    try {
        if (!bannedElement) {
            console.log('No banned element found');
            return;
        }
        
        // Check if electronAPI is available
        if (!window.electronAPI) {
            throw new Error('electronAPI not available');
        }
        
        // Check if getBannedPlayers function exists
        if (typeof window.electronAPI.getBannedPlayers !== 'function') {
            console.log('Available electronAPI methods:', Object.keys(window.electronAPI));
            throw new Error('getBannedPlayers function not available. Available methods: ' + Object.keys(window.electronAPI).join(', '));
        }
        
        console.log('Fetching banned players for server:', serverName);
        const bannedPlayers = await window.electronAPI.getBannedPlayers(serverName);
        console.log('Banned players received:', bannedPlayers);
        
        if (bannedPlayers.length === 0) {
            bannedElement.innerHTML = '<div class="empty-players">No banned players</div>';
        } else {
            bannedElement.innerHTML = bannedPlayers.map(playerName => `
                <div class="player-item">
                    <span class="player-name">${escapeHtml(playerName)}</span>
                    <div class="player-actions">
                        <button class="btn btn-success btn-sm" onclick="unbanPlayer('${serverName}', '${playerName}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                            </svg>
                            Unban
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading banned players:', error);
        if (bannedElement) {
            bannedElement.innerHTML = '<div class="empty-players error">Error loading banned players: ' + error.message + '</div>';
        }
    }
}

function initializeResourceCharts(server) {
    // Only initialize charts if they don't already exist
    if (cpuChart || memoryChart) {
        // Charts already exist, just update the data
        updateResourceCharts(server);
        return;
    }
    
    // CPU Chart
    const cpuCanvas = document.getElementById('cpuChart');
    const memoryCanvas = document.getElementById('memoryChart');
    
    if (cpuCanvas && typeof Chart !== 'undefined') {
        const cpuUsage = server.status?.cpu_usage || 0;
        
        cpuChart = new Chart(cpuCanvas, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [cpuUsage, 100 - cpuUsage],
                    backgroundColor: ['#4f46e5', 'rgba(255, 255, 255, 0.1)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: true,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                cutout: '80%',
                interaction: {
                    events: []
                }
            },
            plugins: [{
                id: 'centerText',
                beforeDraw: function(chart) {
                    const ctx = chart.ctx;
                    const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
                    const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;
                    
                    // Get current CPU usage from chart data
                    const currentCpuUsage = chart.data.datasets[0].data[0] || 0;
                    
                    ctx.save();
                    ctx.font = 'bold 16px Arial';
                    ctx.fillStyle = '#f1f5f9';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`${Math.round(currentCpuUsage)}%`, centerX, centerY);
                    ctx.restore();
                }
            }]
        });
    } else {
        // Fallback if Chart.js not available
        if (cpuCanvas) {
            const ctx = cpuCanvas.getContext('2d');
            const cpuUsage = server.status?.cpu_usage || 0;
            drawSimpleChart(ctx, cpuUsage, '#4f46e5');
        }
    }
    
    if (memoryCanvas && typeof Chart !== 'undefined') {
        const memoryUsage = server.status?.memory_usage || 0;
        const maxMemory = server.maxRam || 2048;
        const memoryPercent = (memoryUsage / maxMemory) * 100;
        
        memoryChart = new Chart(memoryCanvas, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [memoryPercent, 100 - memoryPercent],
                    backgroundColor: ['#06b6d4', 'rgba(255, 255, 255, 0.1)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: false,
                maintainAspectRatio: true,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                cutout: '80%',
                interaction: {
                    events: []
                }
            },
            plugins: [{
                id: 'centerText',
                beforeDraw: function(chart) {
                    const ctx = chart.ctx;
                    const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
                    const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;
                    
                    // Get current memory usage percentage from chart data
                    const currentMemoryPercent = chart.data.datasets[0].data[0] || 0;
                    
                    ctx.save();
                    ctx.font = 'bold 16px Arial';
                    ctx.fillStyle = '#f1f5f9';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`${Math.round(currentMemoryPercent)}%`, centerX, centerY);
                    ctx.restore();
                }
            }]
        });
    } else {
        // Fallback if Chart.js not available
        if (memoryCanvas) {
            const ctx = memoryCanvas.getContext('2d');
            const memoryUsage = server.status?.memory_usage || 0;
            const maxMemory = server.maxRam || 2048;
            const memoryPercent = (memoryUsage / maxMemory) * 100;
            drawSimpleChart(ctx, memoryPercent, '#06b6d4');
        }
    }
}

function drawSimpleChart(ctx, percentage, color) {
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;
    
    // Clear canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Draw background circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 8;
    ctx.stroke();
    
    // Draw percentage arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, (-Math.PI / 2) + (2 * Math.PI * percentage / 100));
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.stroke();
    
    // Draw percentage text
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(percentage)}%`, centerX, centerY + 5);
}

function updateResourceCharts(server) {
    // Update CPU chart data
    if (cpuChart && server.status) {
        const cpuUsage = server.status.cpu_usage || 0;
        cpuChart.data.datasets[0].data = [cpuUsage, 100 - cpuUsage];
        cpuChart.update('none'); // Update without animation to prevent performance issues
    }
    
    // Update Memory chart data
    if (memoryChart && server.status) {
        const memoryUsage = server.status.memory_usage || 0;
        const maxMemory = server.maxRam || 2048;
        const memoryPercent = (memoryUsage / maxMemory) * 100;
        memoryChart.data.datasets[0].data = [memoryPercent, 100 - memoryPercent];
        memoryChart.update('none'); // Update without animation to prevent performance issues
    }
}

// Server Details Actions
function showConsoleFromDetails() {
    console.log('showConsoleFromDetails called');
    console.log('currentDetailsServer value:', currentDetailsServer);
    
    if (currentDetailsServer) {
        const serverName = currentDetailsServer; // Store the server name before hiding modal
        console.log('Opening console for server:', serverName);
        hideServerDetailsModal(); // This will set currentDetailsServer to null
        // Add a small delay to ensure modal is hidden before opening console
        setTimeout(() => {
            showConsole(serverName); // Use the stored server name
        }, 100);
    } else {
        console.error('No server selected in details view');
        console.log('Available servers:', servers.map(s => s.name));
        showNotification('No server selected', 'error');
    }
}

function restartServerFromDetails() {
    if (currentDetailsServer) {
        const name = currentDetailsServer;
        showNotification(`Restarting ${name}...`, 'info');
        if (window.electronAPI && typeof window.electronAPI.restartServer === 'function') {
            window.electronAPI.restartServer(name)
                .then(msg => {
                    showNotification(msg || `Restarted ${name}`, 'success');
                    // Refresh status shortly after restart
                    setTimeout(() => {
                        refreshServerList();
                        updateServerDetails(name);
                    }, 2000);
                })
                .catch(err => {
                    console.error('Restart failed:', err);
                    showNotification(`Restart failed: ${err.message || err}`, 'error');
                });
        } else {
            showNotification('Restart is not available in this build', 'error');
        }
    }
}

function backupServerFromDetails() {
    if (currentDetailsServer) {
        // TODO: Implement backup functionality
        showNotification(`Creating backup for ${currentDetailsServer}...`, 'info');
    }
}

function stopServerFromDetails() {
    if (currentDetailsServer) {
        stopServer(currentDetailsServer);
        hideServerDetailsModal();
    }
}

function addToWhitelist() {
    const input = document.getElementById('whitelistInput');
    const playerName = input?.value?.trim();
    
    if (!playerName || !currentDetailsServer) {
        return;
    }
    if (!window.electronAPI || typeof window.electronAPI.addToWhitelist !== 'function') {
        showNotification('Whitelist not available', 'error');
        return;
    }
    showLoading();
    window.electronAPI.addToWhitelist(currentDetailsServer, playerName)
        .then(msg => {
            showNotification(msg, 'success');
            input.value = '';
            // Refresh whitelist section
            refreshWhitelist(currentDetailsServer);
            const bannedElement = document.getElementById('bannedPlayersList');
            if (bannedElement) updateBannedPlayers(currentDetailsServer, bannedElement).catch(console.error);
        })
        .catch(err => {
            showNotification(`Failed to add: ${err.message || err}`, 'error');
        })
        .finally(() => hideLoading());
}

function removeFromWhitelist(serverName, playerName) {
    if (!window.electronAPI || typeof window.electronAPI.removeFromWhitelist !== 'function') {
        showNotification('Whitelist not available', 'error');
        return;
    }
    const confirmed = confirm(`Remove ${playerName} from whitelist?`);
    if (!confirmed) return;
    showLoading();
    window.electronAPI.removeFromWhitelist(serverName, playerName)
        .then(msg => {
            showNotification(msg, 'success');
            if (currentDetailsServer === serverName) {
                refreshWhitelist(serverName);
            }
        })
        .catch(err => {
            showNotification(`Failed to remove: ${err.message || err}`, 'error');
        })
        .finally(() => hideLoading());
}

function kickPlayer(serverName, playerName) {
    console.log('kickPlayer called with:', serverName, playerName);
    console.log('Function type:', typeof window.electronAPI.kickPlayer);
    
    // Check if the API is available
    if (!window.electronAPI) {
        console.error('electronAPI not available');
        showNotification('Error: electronAPI not available', 'error');
        return;
    }
    
    if (typeof window.electronAPI.kickPlayer !== 'function') {
        console.error('kickPlayer function not available');
        console.log('Available methods:', Object.keys(window.electronAPI));
        showNotification('Error: kickPlayer function not available', 'error');
        return;
    }
    
    // Ask for confirmation and optional reason
    const confirmed = confirm(`Are you sure you want to kick ${playerName}?`);
    if (!confirmed) {
        console.log('Kick cancelled by user');
        return;
    }
    
    // Ask for kick reason (optional)
    const reason = prompt(`Enter a reason for kicking ${playerName} (optional):`);
    
    console.log('Calling kickPlayer with reason:', reason);
    
    // Show loading
    showLoading();
    
    // Call the backend to kick the player
    window.electronAPI.kickPlayer(serverName, playerName, reason || undefined)
        .then((result) => {
            console.log('Kick successful:', result);
            showNotification(result, 'success');
            // Refresh the online players list after kicking
            const server = servers.find(s => s.name === serverName);
            if (server) {
                updateOnlinePlayersLive(server);
            }
        })
        .catch((error) => {
            console.error('Error kicking player:', error);
            showNotification(`Error kicking player: ${error.message}`, 'error');
        })
        .finally(() => {
            hideLoading();
        });
}

// Test function for debugging
function testKickAPI() {
    console.log('Testing kick API...');
    console.log('electronAPI available:', !!window.electronAPI);
    if (window.electronAPI) {
        console.log('kickPlayer method type:', typeof window.electronAPI.kickPlayer);
        console.log('Available methods:', Object.keys(window.electronAPI));
    }
}

// Test kick functionality with debugging
function testKickFunction() {
    console.log('Testing kick function...');
    if (servers.length > 0) {
        const server = servers[0];
        console.log('Testing with server:', server.name);
        console.log('Server has players:', server.status?.players_online);
        
        // Test the API directly with actual online player
        if (window.electronAPI && window.electronAPI.kickPlayer) {
            const onlinePlayers = server.status?.players_online || [];
            if (onlinePlayers.length > 0) {
                const playerToKick = onlinePlayers[0]; // Use first online player
                console.log('Calling kickPlayer API with real player:', playerToKick);
                window.electronAPI.kickPlayer(server.name, playerToKick, 'API Test')
                    .then(result => console.log('Kick test result:', result))
                    .catch(error => console.error('Kick test error:', error));
            } else {
                console.log('No online players to test kick with');
            }
        }
    }
}

// Make functions globally available for debugging
window.testKickAPI = testKickAPI;
window.kickPlayer = kickPlayer;
window.testKickFunction = testKickFunction;

async function unbanPlayer(serverName, playerName) {
    if (!confirm(`Are you sure you want to unban ${playerName}?`)) {
        return;
    }
    
    try {
        showLoading();
        const result = await window.electronAPI.unbanPlayer(serverName, playerName);
        showNotification(result, 'success');
        
        // Refresh the banned players list
        const bannedElement = document.getElementById('bannedPlayersList');
        await updateBannedPlayers(serverName, bannedElement);
        
    } catch (error) {
        console.error('Error unbanning player:', error);
        showNotification(`Error unbanning player: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

async function refreshBannedPlayers() {
    if (!currentDetailsServer) {
        showNotification('No server selected', 'error');
        return;
    }
    
    try {
        const bannedElement = document.getElementById('bannedPlayersList');
        if (bannedElement) {
            bannedElement.innerHTML = '<div class="empty-players">Refreshing...</div>';
            await updateBannedPlayers(currentDetailsServer, bannedElement);
            showNotification('Banned players list updated', 'success');
        }
    } catch (error) {
        console.error('Error refreshing banned players:', error);
        showNotification('Error refreshing banned players list', 'error');
    }
}
