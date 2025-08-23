/* eslint-disable @typescript-eslint/no-unused-vars */
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { spawn, ChildProcess, exec } from 'child_process';
import * as si from 'systeminformation';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

// Keep track of server processes
const serverProcesses = new Map<string, ChildProcess>();
const serverStatuses = new Map<string, Partial<ServerStatus>>();
const serverStartTimes = new Map<string, number>();
const serverTunnels = new Map<string, any>();
const serverUpnpMappings = new Map<string, any>();
const serverConsoleOutputs = new Map<string, string[]>();
const serverPids = new Map<string, number>();

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

// Check if a port is available for use
async function isPortAvailable(port: number, host: string = '0.0.0.0'): Promise<boolean> {
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
async function findAvailablePort(): Promise<number> {
  console.log('🔍 Scanning for available ports...');
  
  // Check all port ranges in order of preference
  const allPortRanges = [
    ...MINECRAFT_PORT_RANGES.preferred,
    ...MINECRAFT_PORT_RANGES.gaming,
    ...MINECRAFT_PORT_RANGES.highRange,
    ...MINECRAFT_PORT_RANGES.standard
  ];
  
  for (const port of allPortRanges) {
    // Check if port is available on the system
    const systemAvailable = await isPortAvailable(port);
    
    if (systemAvailable) {
      // Also check if it's not used by any running servers in our app
      const usedByApp = Array.from(serverStatuses.values())
        .some(status => status.port === port && status.is_running);
      
      if (!usedByApp) {
        console.log(`✅ Found available port: ${port}`);
        
        // Provide helpful info about the chosen port
        if (MINECRAFT_PORT_RANGES.preferred.includes(port)) {
          console.log(`   📋 Using alternative Minecraft port (${port}) - better compatibility!`);
        } else if (MINECRAFT_PORT_RANGES.gaming.includes(port)) {
          console.log(`   🎮 Using gaming-friendly port (${port}) - commonly open on routers!`);
        } else if (MINECRAFT_PORT_RANGES.highRange.includes(port)) {
          console.log(`   🚀 Using high-range port (${port}) - usually unrestricted!`);
        } else {
          console.log(`   ⚠️  Using standard Minecraft port (${port}) - may need router config`);
        }
        
        return port;
      }
    }
  }
  
  // If all predefined ports are taken, find a random available port
  console.log('🔄 All preferred ports taken, scanning for random available port...');
  for (let port = 25571; port <= 25600; port++) {
    const available = await isPortAvailable(port);
    if (available) {
      console.log(`✅ Found random available port: ${port}`);
      return port;
    }
  }
  
  // Last resort - return standard port and let user handle conflicts
  console.warn('⚠️  All scanned ports are in use, falling back to standard port 25565');
  console.log('   💡 You may need to stop other services or configure your router');
  return 25565;
}

// Get smart port recommendations with conflict detection
async function getPortRecommendations(): Promise<{
  recommended: number;
  alternatives: number[];
  conflictInfo: {
    hasConflicts: boolean;
    conflictingPorts: number[];
    safePorts: number[];
  };
}> {
  console.log('🧠 Analyzing port availability and generating recommendations...');
  
  const conflictingPorts: number[] = [];
  const safePorts: number[] = [];
  const alternatives: number[] = [];
  
  // Test all common ports
  const testPorts = [
    25565, // Standard Minecraft
    ...MINECRAFT_PORT_RANGES.preferred,
    ...MINECRAFT_PORT_RANGES.gaming.slice(0, 3), // Test first 3 gaming ports
    ...MINECRAFT_PORT_RANGES.highRange.slice(0, 3) // Test first 3 high-range ports
  ];
  
  for (const port of testPorts) {
    const available = await isPortAvailable(port);
    const usedByApp = Array.from(serverStatuses.values())
      .some(status => status.port === port && status.is_running);
    
    if (available && !usedByApp) {
      safePorts.push(port);
      if (alternatives.length < 5) {
        alternatives.push(port);
      }
    } else {
      conflictingPorts.push(port);
    }
  }
  
  const recommended = safePorts[0] || 25565;
  
  console.log(`📊 Port Analysis Complete:`);
  console.log(`   ✅ Safe ports found: ${safePorts.length}`);
  console.log(`   ❌ Conflicting ports: ${conflictingPorts.length}`);
  console.log(`   🎯 Recommended port: ${recommended}`);
  
  return {
    recommended,
    alternatives: alternatives.slice(1), // Exclude the recommended one
    conflictInfo: {
      hasConflicts: conflictingPorts.length > 0,
      conflictingPorts,
      safePorts
    }
  };
}

// Get local IP address for server connection
function getLocalIPAddress(): string {
  const interfaces = require('os').networkInterfaces();
  const addresses: string[] = [];
  
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && !alias.internal) {
        if (alias.address !== '127.0.0.1') {
          addresses.push(alias.address);
        }
      }
    }
  }
  
  // Prefer common local network ranges, specifically 192.168.0.x first
  for (const addr of addresses) {
    if (addr.startsWith('192.168.0.')) {
      return addr;
    }
  }
  
  // Then try other common ranges
  for (const addr of addresses) {
    if (addr.startsWith('192.168.') || addr.startsWith('10.') || addr.startsWith('172.')) {
      return addr;
    }
  }
  
  // Return the first available address or localhost
  return addresses[0] || 'localhost';
}

// Configure Windows Firewall for Minecraft server
async function configureFirewall(serverName: string, port: number): Promise<void> {
  return new Promise((resolve) => {
    const ruleName = `ShadowHawk-${serverName}-${port}`;
    
    // Try both inbound and outbound rules for better connectivity
    const commands = [
      `netsh advfirewall firewall add rule name="${ruleName}-IN" dir=in action=allow protocol=TCP localport=${port}`,
      `netsh advfirewall firewall add rule name="${ruleName}-OUT" dir=out action=allow protocol=TCP localport=${port}`
    ];
    
    console.log(`Configuring firewall for ${serverName} on port ${port}...`);
    
    let completedCommands = 0;
    let hasError = false;
    
    commands.forEach((command, index) => {
      const firewallProcess = spawn('powershell', ['-Command', `Start-Process cmd -ArgumentList '/c ${command}' -Verb RunAs -WindowStyle Hidden -Wait`], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let errorOutput = '';

      firewallProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      firewallProcess.on('exit', (code) => {
        completedCommands++;
        
        if (code !== 0) {
          hasError = true;
          console.warn(`Firewall rule ${index + 1} failed (code ${code}): ${errorOutput}`);
        } else {
          console.log(`Firewall rule ${index + 1} created successfully for ${serverName}`);
        }
        
        // Resolve when all commands are done (success or failure)
        if (completedCommands === commands.length) {
          if (!hasError) {
            console.log(`All firewall rules created successfully for ${serverName}`);
          } else {
            console.warn(`Some firewall rules failed - server may still work with manual firewall configuration`);
          }
          resolve();
        }
      });

      firewallProcess.on('error', (error) => {
        completedCommands++;
        hasError = true;
        console.warn(`Firewall configuration ${index + 1} failed: ${error.message}`);
        
        if (completedCommands === commands.length) {
          console.warn(`Firewall configuration failed - server may still work with manual firewall configuration`);
          resolve();
        }
      });
    });
  });
}

// Automatic UPnP port forwarding (simplified but reliable implementation)
async function setupUpnpPortForwarding(serverName: string, port: number): Promise<string | null> {
  return new Promise(async (resolve) => {
    try {
      console.log(`🔧 Attempting UPnP discovery for ${serverName} on port ${port}...`);
      
      // First, try to get external IP
      const externalIP = await getExternalIP();
      if (!externalIP) {
        console.warn('Could not determine external IP address');
        resolve(null);
        return;
      }
      
      console.log(`🌍 External IP detected: ${externalIP}`);
      
      // For now, we'll provide the external IP but recommend manual setup
      console.log(`📋 Internet connection detected:`);
      console.log(`   External IP: ${externalIP}`);
      console.log(`   Required setup for internet access:`);
      console.log(`   1. Open router admin panel (usually 192.168.1.1 or 192.168.0.1)`);
      console.log(`   2. Look for "Port Forwarding" or "Virtual Server" settings`);
      console.log(`   3. Add rule: External Port ${port} -> ${getLocalIPAddress()}:${port} (TCP)`);
      console.log(`   4. Save settings and restart router if needed`);
      console.log(`   5. Share this address with friends: ${externalIP}:${port}`);
      console.log(`   `);
      console.log(`💡 Pro tip: Look for "UPnP" or "Universal Plug and Play" in router settings`);
      console.log(`   and enable it for automatic port forwarding in the future.`);
      
      // Store for reference but don't claim automatic setup
      serverUpnpMappings.set(serverName, { 
        externalIP, 
        port, 
        manualSetupRequired: true 
      });
      
      // Don't return the IP since manual setup is required
      resolve(null);
      
    } catch (error) {
      console.warn(`Network setup check failed: ${error}`);
      console.log(`💡 For internet access, you'll need to manually configure port forwarding`);
      resolve(null);
    }
  });
}

// Get external IP address for internet access
async function getExternalIP(): Promise<string | null> {
  return new Promise((resolve) => {
    const services = [
      'https://api.ipify.org',
      'https://icanhazip.com',
      'https://ipinfo.io/ip'
    ];
    
    function tryService(index: number) {
      if (index >= services.length) {
        console.warn('Could not determine external IP address');
        resolve(null);
        return;
      }
      
      const service = services[index];
      console.log(`Checking external IP via ${service}...`);
      
      https.get(service, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          const ip = data.trim();
          if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
            console.log(`🌍 External IP detected: ${ip}`);
            resolve(ip);
          } else {
            tryService(index + 1);
          }
        });
      }).on('error', () => {
        tryService(index + 1);
      });
    }
    
    tryService(0);
  });
}

// Test server connectivity
async function testServerConnection(_serverName: string, address: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const client = new net.Socket();
    
    client.setTimeout(5000); // 5 second timeout
    
    client.connect(port, address, () => {
      console.log(`✅ Connection test PASSED: ${address}:${port}`);
      client.destroy();
      resolve(true);
    });
    
    client.on('error', (err: any) => {
      console.log(`❌ Connection test FAILED: ${address}:${port} - ${err.message}`);
      resolve(false);
    });
    
    client.on('timeout', () => {
      console.log(`⏰ Connection test TIMEOUT: ${address}:${port}`);
      client.destroy();
      resolve(false);
    });
  });
}

// Create secure tunnel using localtunnel (DISABLED - not compatible with Minecraft)
async function createSecureTunnel(_serverName: string, _port: number): Promise<string | null> {
  return new Promise((resolve) => {
    // Localtunnel is HTTP-based and incompatible with Minecraft TCP protocol
    console.log(`⚠️  Localtunnel disabled - not compatible with Minecraft TCP protocol`);
    console.log(`   Using UPnP port forwarding for internet access instead`);
    resolve(null);
  });
}

// Check if secure tunneling tools are available
async function checkTunnelingCapabilities(): Promise<{
  cloudflare: boolean;
  ssh: boolean;
  recommendations: string[];
}> {
  const capabilities = {
    cloudflare: false,
    ssh: false,
    recommendations: [] as string[]
  };

  return new Promise((resolve) => {
    const { exec } = require('child_process');
    
    // Check for Cloudflare Tunnel
    exec('cloudflared version', (cfError: any) => {
      capabilities.cloudflare = !cfError;
      
      // Check for SSH (for Serveo)
      exec('ssh -V', (sshError: any) => {
        capabilities.ssh = !sshError;
        
        // Generate recommendations
        if (!capabilities.cloudflare) {
          capabilities.recommendations.push('🔐 Install Cloudflare Tunnel (BEST option - run install-cloudflare-tunnel.bat)');
        }
        if (!capabilities.ssh) {
          capabilities.recommendations.push('🔧 Install OpenSSH for additional tunnel options');
        }
        if (capabilities.cloudflare) {
          capabilities.recommendations.push('✅ Cloudflare Tunnel ready - you have the best security!');
        }
        if (capabilities.ssh && !capabilities.cloudflare) {
          capabilities.recommendations.push('🌐 SSH tunneling available via Serveo');
        }
        
        resolve(capabilities);
      });
    });
  });
}

// Cloudflare Tunnel: Secure, free, and awesome tunneling solution! 🚀
async function createCloudflareTunnel(serverName: string, port: number): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      console.log(`☁️  Setting up Cloudflare Tunnel for ${serverName}...`);
      console.log(`🔐 This is much safer than port forwarding - your IP stays hidden!`);
      
      const { exec } = require('child_process');
      
      // Check if cloudflared is installed
      exec('cloudflared version', (error: any, stdout: any, _stderr: any) => {
        if (error) {
          console.log(`📥 Cloudflared not found. Let's set it up! It's FREE and SECURE:`);
          console.log(`   🌟 Benefits:`);
          console.log(`      • Zero Trust security - no open ports needed`);
          console.log(`      • Built-in DDoS protection from Cloudflare`);
          console.log(`      • Your home IP stays completely hidden`);
          console.log(`      • Free service with no bandwidth limits`);
          console.log(`      • Works through any firewall/NAT`);
          console.log(`   `);
          console.log(`   📋 Setup Instructions:`);
          console.log(`   1. Download cloudflared from: https://github.com/cloudflare/cloudflared/releases`);
          console.log(`   2. Add it to your PATH or put it in this folder`);
          console.log(`   3. Run: cloudflared tunnel login`);
          console.log(`   4. Create tunnel: cloudflared tunnel create minecraft-${serverName}`);
          console.log(`   5. Restart your server - tunnel will auto-start!`);
          console.log(`   `);
          console.log(`   💡 Alternative quick setup:`);
          console.log(`   Run: cloudflared tunnel --url tcp://localhost:${port}`);
          console.log(`   (This creates a temporary tunnel - great for testing!)`);
          resolve(null);
        } else {
          console.log(`✅ Cloudflared found: ${stdout.trim()}`);
          console.log(`🚀 Creating secure TCP tunnel on port ${port}...`);
          
          // Try to create a quick tunnel first (no auth needed)
          const tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `tcp://localhost:${port}`, '--logfile', '-'], {
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          // Store the process for cleanup later
          serverTunnels.set(serverName, tunnelProcess);
          
          let tunnelUrl: string | null = null;
          let setupCompleted = false;
          
          // Listen for cloudflared output to extract tunnel URL
          tunnelProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            console.log(`[cloudflared] ${output}`);
            
            // Look for tunnel URL in cloudflared output - improved parsing
            const urlMatches = [
              // Match the specific format from your logs
              output.match(/https:\/\/([^\\s]+\.trycloudflare\.com)/),
              // Alternative patterns
              output.match(/Visit it at[^:]*:\s*\|\s*https:\/\/([^\\s]+\.trycloudflare\.com)/),
              output.match(/\|\s*https:\/\/([^\\s]+\.trycloudflare\.com)\s*\|/),
              // Fallback patterns
              output.match(/([^\\s]+\.trycloudflare\.com)/),
            ];
            
            for (const match of urlMatches) {
              if (match && !tunnelUrl) {
                let url = match[1] || match[0];
                if (url && url.includes('.trycloudflare.com')) {
                  // Clean up the URL - remove https:// if present, keep domain only
                  url = url.replace('https://', '').replace('http://', '').trim();
                  
                  // Make sure we have a valid cloudflare domain
                  if (url.endsWith('.trycloudflare.com')) {
                    tunnelUrl = url;
                    console.log(`🌍 Cloudflare Tunnel URL: ${tunnelUrl}`);
                    console.log(`🎮 Share this address with friends: ${tunnelUrl}`);
                    console.log(`🔐 Your server is now securely accessible worldwide!`);
                    setupCompleted = true;
                    resolve(tunnelUrl);
                    break;
                  }
                }
              }
            }
          });
          
          tunnelProcess.stderr?.on('data', (data) => {
            const errorOutput = data.toString();
            console.log(`[cloudflared] ${errorOutput}`);
            
            // Check for authentication suggestions
            if (errorOutput.includes('login') || errorOutput.includes('authenticate')) {
              console.log(`💡 For permanent tunnels, authenticate with:`);
              console.log(`   cloudflared tunnel login`);
            }
            
            // Look for tunnel URLs in stderr too
            const urlMatch = errorOutput.match(/https:\/\/[^\\s]+\.trycloudflare\.com/);
            if (urlMatch && !tunnelUrl) {
              tunnelUrl = urlMatch[0].replace('https://', '');
              console.log(`🌍 Cloudflare Tunnel URL: ${tunnelUrl}`);
              setupCompleted = true;
              resolve(tunnelUrl);
            }
          });
          
          tunnelProcess.on('error', (error) => {
            console.error(`Cloudflare tunnel process error:`, error);
            if (!setupCompleted) resolve(null);
          });
          
          // Timeout fallback
          setTimeout(() => {
            if (!tunnelUrl && !setupCompleted) {
              console.log(`⏱️  Tunnel is starting... this may take a moment`);
              console.log(`   If it takes too long, try the manual setup method above`);
              
              // Give it a bit more time for slow connections
              setTimeout(() => {
                if (!tunnelUrl && !setupCompleted) {
                  console.log(`⚠️  Tunnel setup is taking longer than expected`);
                  console.log(`   The tunnel may still be working, check the logs above`);
                  console.log(`   Or try: cloudflared tunnel --url tcp://localhost:${port}`);
                  resolve(null);
                }
              }, 10000);
            }
          }, 8000);
        }
      });
    } catch (error) {
      console.warn('Cloudflare tunnel setup failed:', error);
      resolve(null);
    }
  });
}

// Advanced TCP Tunnel: Serveo.net (another cool free alternative)
async function createServeoTunnel(serverName: string, port: number): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      console.log(`🌐 Setting up Serveo tunnel for ${serverName}...`);
      console.log(`🆓 Using serveo.net - free SSH-based tunneling service`);
      
      // Create SSH tunnel using serveo.net
      const tunnelProcess = spawn('ssh', [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ServerAliveInterval=60',
        '-R', `0:localhost:${port}`,
        'serveo.net'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      serverTunnels.set(serverName, tunnelProcess);
      
      let tunnelUrl: string | null = null;
      
      tunnelProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log(`[serveo] ${output}`);
        
        // Look for tunnel URL in serveo output
        const urlMatch = output.match(/Forwarding TCP .*? \\(([^)]+)\\)/);
        if (urlMatch && !tunnelUrl) {
          tunnelUrl = urlMatch[1];
          console.log(`🌍 Serveo Tunnel URL: ${tunnelUrl}`);
          resolve(tunnelUrl);
        }
      });
      
      tunnelProcess.stderr?.on('data', (data) => {
        const errorOutput = data.toString();
        console.log(`[serveo] ${errorOutput}`);
        
        if (errorOutput.includes('Permission denied') || errorOutput.includes('Connection refused')) {
          console.log(`❌ Serveo connection failed`);
          console.log(`   This might be due to SSH client issues or network restrictions`);
          resolve(null);
        }
      });
      
      tunnelProcess.on('error', (error) => {
        console.warn(`Serveo tunnel error: ${error.message}`);
        if (error.message.includes('ssh')) {
          console.log(`💡 SSH client required for Serveo tunnels`);
          console.log(`   Install OpenSSH or use Cloudflare tunnels instead`);
        }
        resolve(null);
      });
      
      // Timeout
      setTimeout(() => {
        if (!tunnelUrl) {
          console.log(`⏱️  Serveo tunnel timeout - falling back to other methods`);
          resolve(null);
        }
      }, 15000);
      
    } catch (error) {
      console.warn('Serveo tunnel setup failed:', error);
      resolve(null);
    }
  });
}

// Comprehensive automatic networking setup
async function setupAutomaticNetworking(serverName: string, port: number): Promise<{
  localIP: string;
  externalIP?: string;
  tunnelURL?: string;
  methods: string[];
  connectionTests?: {
    localhost: boolean;
    localNetwork: boolean;
    tunnel?: boolean;
  };
}> {
  const localIP = getLocalIPAddress();
  const methods: string[] = ['Local Network'];
  let externalIP: string | undefined;
  let tunnelURL: string | undefined;
  const connectionTests = {
    localhost: false,
    localNetwork: false,
    tunnel: false
  };

  console.log(`Setting up automatic networking for ${serverName} on port ${port}...`);

  // Provide port-specific guidance
  if (MINECRAFT_PORT_RANGES.preferred.includes(port)) {
    console.log(`🎯 Using optimized Minecraft port ${port} - better router compatibility!`);
  } else if (MINECRAFT_PORT_RANGES.gaming.includes(port)) {
    console.log(`🎮 Using gaming-friendly port ${port} - commonly open on routers!`);
  } else if (MINECRAFT_PORT_RANGES.highRange.includes(port)) {
    console.log(`🚀 Using high-range port ${port} - rarely blocked by firewalls!`);
  } else if (port === 25565) {
    console.log(`⚠️  Using standard Minecraft port ${port} - may need router configuration`);
  } else {
    console.log(`🔧 Using custom port ${port}`);
  }

  // Check what tunneling capabilities we have
  const tunnelCapabilities = await checkTunnelingCapabilities();
  
  if (tunnelCapabilities.recommendations.length > 0) {
    console.log(`🔧 Tunneling Status:`);
    tunnelCapabilities.recommendations.forEach(rec => console.log(`   ${rec}`));
    console.log('');
  }

  // 1. Configure Windows Firewall (always try this)
  try {
    await configureFirewall(serverName, port);
    methods.push('Windows Firewall');
  } catch (error) {
    console.warn('Firewall setup failed:', error);
  }

  // 2. Test local connections
  console.log('Testing server connectivity...');
  
  // Test localhost connection
  connectionTests.localhost = await testServerConnection(serverName, '127.0.0.1', port);
  
  // Test local network connection
  connectionTests.localNetwork = await testServerConnection(serverName, localIP, port);

  // 3. Try UPnP port forwarding (PRIMARY method for internet access)
  try {
    const upnpResult = await setupUpnpPortForwarding(serverName, port);
    if (upnpResult) {
      externalIP = upnpResult;
      methods.push('UPnP Port Forwarding');
      console.log(`🎯 Internet access enabled via UPnP: ${externalIP}`);
    }
  } catch (error) {
    console.warn('UPnP setup failed:', error);
  }

  // 4. Fallback: Try to detect external IP even without UPnP
  if (!externalIP) {
    try {
      const detectedIP = await getExternalIP();
      if (detectedIP) {
        console.log(`🌍 External IP detected: ${detectedIP}:${port}`);
        console.log(`⚠️  Manual port forwarding required on your router`);
        console.log(`   Instructions:`);
        console.log(`   1. Open router admin panel (usually 192.168.1.1 or 192.168.0.1)`);
        console.log(`   2. Find "Port Forwarding" or "Virtual Server" settings`);
        console.log(`   3. Add rule: External Port ${port} -> ${localIP}:${port} (TCP)`);
        console.log(`   4. Save and restart router if needed`);
        console.log(`   5. Share this address with friends: ${detectedIP}:${port}`);
        
        // Don't set externalIP here since manual setup is required
        methods.push('Manual Port Forwarding Required');
      }
    } catch (error) {
      console.warn('External IP detection failed:', error);
    }
  }

  // 5. Last resort: Try secure tunneling (Cloudflare is the BEST option!)
  if (!externalIP) {
    try {
      console.log('UPnP failed - attempting Cloudflare Tunnel (much better than port forwarding!)...');
      
      // Try Cloudflare first (most secure and reliable)
      const cloudflareResult = await createCloudflareTunnel(serverName, port);
      if (cloudflareResult) {
        tunnelURL = cloudflareResult;
        methods.push('🔐 Cloudflare Tunnel (Zero Trust)');
        console.log(`✨ Cloudflare Tunnel active - your server is super secure!`);
      } else {
        // Fallback to Serveo if Cloudflare isn't available
        console.log('Cloudflare not available - trying Serveo as backup...');
        const serveoResult = await createServeoTunnel(serverName, port);
        if (serveoResult) {
          tunnelURL = serveoResult;
          methods.push('🌐 Serveo SSH Tunnel');
          console.log(`✅ Serveo tunnel established!`);
        } else {
          console.log('⚠️  All automatic methods failed');
          console.log('💡 Recommended solutions (in order of preference):');
          console.log('   1. 🥇 Install Cloudflare Tunnel (FREE, most secure)');
          console.log('      • Download: https://github.com/cloudflare/cloudflared/releases');
          console.log('      • Quick test: cloudflared tunnel --url tcp://localhost:' + port);
          console.log('   2. 🥈 Enable UPnP on your router');
          console.log('   3. 🥉 Configure manual port forwarding');
          console.log('   4. 🆓 Use cloud hosting (Aternos, Minehut)');
        }
      }
    } catch (error) {
      console.warn('Secure tunnel setup failed:', error);
    }
  }

  // Print connection summary
  console.log('\n🔗 CONNECTION SUMMARY:');
  console.log(`   ✅ Local (Same computer): localhost:${port} ${connectionTests.localhost ? '✅' : '❌'}`);
  console.log(`   🏠 Local Network: ${localIP}:${port} ${connectionTests.localNetwork ? '✅' : '❌'}`);
  if (externalIP) {
    console.log(`   🌍 Internet (UPnP): ${externalIP} ✅`);
  }
  if (tunnelURL) {
    console.log(`   🌍 Internet (Secure Tunnel): ${tunnelURL} ✅`);
    console.log(`      🔐 Your connection is encrypted and your IP stays hidden!`);
  }
  if (!externalIP && !tunnelURL) {
    console.log(`   🌍 Internet: Manual setup required`);
    console.log(`      • Option 1: 🔐 Cloudflare Tunnel (RECOMMENDED - Zero Trust security)`);
    console.log(`      • Option 2: Configure router port forwarding (port ${port})`);
    console.log(`      • Option 3: Use cloud hosting services`);
  }
  
  console.log('\n💡 RECOMMENDED CONNECTION METHODS:');
  if (connectionTests.localhost) {
    console.log(`   🎮 Same Computer: localhost:${port}`);
  }
  if (connectionTests.localNetwork) {
    console.log(`   🏠 Local Network: ${localIP}:${port}`);
  }
  if (tunnelURL) {
    console.log(`   🌍 Internet: ${tunnelURL}`);
    console.log(`      🛡️  Secure, encrypted connection - your IP stays private!`);
  } else if (!externalIP) {
    console.log(`   🌍 Internet: Not available (setup required)`);
    console.log(`      🔐 Try Cloudflare Tunnel for best security!`);
  }
  console.log('');

  return {
    localIP: `${localIP}:${port}`,
    externalIP,
    tunnelURL,
    methods,
    connectionTests
  };
}

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

interface ServerConfig {
  name: string;
  version: string;
  port: number;
  max_ram: number;
  min_ram: number;
  path: string;
  auto_start: boolean;
  
  // Player lists
  whitelist?: string[];
  operators?: string[];
  
  // Advanced settings
  settings?: {
    // Player management
    max_players?: number;
    online_mode?: boolean;
    white_list?: boolean;
    enforce_whitelist?: boolean;
    
    // World settings
    level_name?: string;
    level_seed?: string;
    level_type?: string;
    gamemode?: 'survival' | 'creative' | 'adventure' | 'spectator';
    difficulty?: 'peaceful' | 'easy' | 'normal' | 'hard';
    hardcore?: boolean;
    spawn_protection?: number;
    view_distance?: number;
    motd?: string;
    
    // Gameplay rules
    pvp?: boolean;
    allow_flight?: boolean;
    spawn_monsters?: boolean;
    spawn_animals?: boolean;
    spawn_npcs?: boolean;
    generate_structures?: boolean;
    enable_command_block?: boolean;
    
    // Network settings
    prevent_proxy_connections?: boolean;
    network_compression_threshold?: number;
    use_native_transport?: boolean;
    hide_online_players?: boolean;
    
    // Performance settings
    max_tick_time?: number;
    sync_chunk_writes?: boolean;
    enable_status?: boolean;
    
    // RCON and console
    enable_rcon?: boolean;
    broadcast_console_to_ops?: boolean;
    broadcast_rcon_to_ops?: boolean;
    
    // Permissions
    function_permission_level?: number;
    op_permission_level?: number;
    
    // Monitoring
    enable_jmx_monitoring?: boolean;
  };
}

interface SystemInfo {
  total_memory: number;
  available_memory: number;
  cpu_usage: number;
  cpu_count: number;
}

interface ServerStatus {
  name: string;
  is_running: boolean;
  status: 'stopped' | 'starting' | 'ready';
  ip_address: string;
  port: number;
  players_online: string[];
  cpu_usage: number;
  memory_usage: number;
  uptime: number;
  startup_progress?: string;
  networking?: {
    localIP: string;
    externalIP?: string;
    tunnelURL?: string;
    methods: string[];
  };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'default',
    title: 'ShadowHawk Minecraft Server Manager',
    icon: join(__dirname, '../public/icon.png'), // We'll create this
  });

  // Load the app
  if (app.isPackaged) {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools(); // Open dev tools in development
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Stop all server processes before quitting
  serverProcesses.forEach((process, name) => {
    console.log(`Stopping server: ${name}`);
    process.kill();
  });
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers for backend communication

// Download Minecraft server JAR
async function downloadServerJar(version: string, serverPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Minecraft server download URLs (these are official Mojang URLs)
    const versionUrls: { [key: string]: string } = {
      '1.20.1': 'https://piston-data.mojang.com/v1/objects/84194a2f286ef7c14ed7ce0090dba59902951553/server.jar',
      '1.20.4': 'https://piston-data.mojang.com/v1/objects/8dd1a28015f51b1803213892b50b7b4fc76e594d/server.jar',
      '1.20.6': 'https://piston-data.mojang.com/v1/objects/145ff0858209bcfc164859ba735d4199aafa1eea/server.jar',
      '1.21': 'https://piston-data.mojang.com/v1/objects/450698d1863ab5180c25d32dd6fab2d5dbd61daa/server.jar',
      '1.21.1': 'https://piston-data.mojang.com/v1/objects/59353fb40c36d304f2035d51e7d6e6baa98dc05c/server.jar',
      '1.19.4': 'https://piston-data.mojang.com/v1/objects/8f3112a1049751cc472ec13e397eade5336ca7ae/server.jar',
      '1.19.2': 'https://piston-data.mojang.com/v1/objects/f69c284232d7c7580bd89a5a4931c3581eae1378/server.jar',
      '1.18.2': 'https://piston-data.mojang.com/v1/objects/c8f83c5655308435b3dcf03c06d9fe8740a77469/server.jar',
      '1.17.1': 'https://piston-data.mojang.com/v1/objects/a16d67e5807f57fc4e550299cf20226194497dc2/server.jar',
      '1.16.5': 'https://piston-data.mojang.com/v1/objects/1b557e7b033b583cd9f66746b7a9ab1ec1673ced/server.jar'
    };

    const downloadUrl = versionUrls[version];
    if (!downloadUrl) {
      reject(new Error(`Unsupported Minecraft version: ${version}`));
      return;
    }

    const serverJarPath = path.join(serverPath, 'server.jar');
    const file = fs.createWriteStream(serverJarPath);

    https.get(downloadUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download server JAR: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`Downloaded Minecraft ${version} server.jar to ${serverJarPath}`);
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(serverJarPath, () => {}); // Delete the file async
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

ipcMain.handle('get-system-info', async (): Promise<SystemInfo> => {
  try {
    const [cpu, mem] = await Promise.all([
      si.currentLoad(),
      si.mem()
    ]);

    return {
      total_memory: Math.round(mem.total / (1024 * 1024 * 1024)), // Convert to GB
      available_memory: Math.round(mem.available / (1024 * 1024 * 1024)), // Convert to GB  
      cpu_usage: Math.round(cpu.currentLoad * 10) / 10, // Round to 1 decimal
      cpu_count: cpu.cpus?.length || 1,
    };
  } catch (error) {
    console.error('Error getting system info:', error);
    throw new Error('Failed to get system information');
  }
});

ipcMain.handle('create-server', async (event, config: ServerConfig): Promise<string> => {
  try {
    // Smart port assignment - check if provided port is available
    let finalPort = config.port;
    const portAvailable = await isPortAvailable(config.port);
    const usedByApp = Array.from(serverStatuses.values())
      .some(status => status.port === config.port && status.is_running);
    
    if (!portAvailable || usedByApp) {
      console.log(`⚠️  Port ${config.port} is not available, finding alternative...`);
      finalPort = await findAvailablePort();
      console.log(`✅ Auto-assigned port ${finalPort} for better compatibility`);
      
      // Update config with the new port
      config = { ...config, port: finalPort };
    } else {
      console.log(`✅ Port ${config.port} is available and ready to use`);
    }

    // Create server directory
    if (!fs.existsSync(config.path)) {
      fs.mkdirSync(config.path, { recursive: true });
    }

    // Download Minecraft server JAR
    console.log(`Downloading Minecraft ${config.version} server...`);
    await downloadServerJar(config.version, config.path);

    // Create server.properties file with comprehensive user settings
    const settings = config.settings || {};
    const serverProperties = `#Minecraft server properties
#Generated by ShadowHawk Server Manager - ${new Date().toISOString()}
#For more configuration options, see: https://minecraft.wiki/w/Server.properties

# Network Configuration
server-ip=
server-port=${config.port}
online-mode=${settings.online_mode !== undefined ? settings.online_mode : true}
prevent-proxy-connections=${settings.prevent_proxy_connections || false}
network-compression-threshold=${settings.network_compression_threshold || 256}
use-native-transport=${settings.use_native_transport !== false}

# Player Management
max-players=${settings.max_players || 20}
white-list=${settings.white_list || false}
enforce-whitelist=${settings.enforce_whitelist || false}
player-idle-timeout=0

# World Configuration
level-name=${settings.level_name || 'world'}
level-seed=${settings.level_seed || ''}
level-type=${settings.level_type || 'minecraft\\:normal'}
max-world-size=29999984
spawn-protection=${settings.spawn_protection || 16}

# Game Rules
gamemode=${settings.gamemode || 'survival'}
difficulty=${settings.difficulty || 'normal'}
hardcore=${settings.hardcore || false}
force-gamemode=false
pvp=${settings.pvp !== false}
allow-flight=${settings.allow_flight || false}

# World Generation
generate-structures=${settings.generate_structures !== false}
spawn-monsters=${settings.spawn_monsters !== false}
spawn-animals=${settings.spawn_animals !== false}
spawn-npcs=${settings.spawn_npcs !== false}

# Performance & View
view-distance=${settings.view_distance || 10}
simulation-distance=10
entity-broadcast-range-percentage=100
max-tick-time=${settings.max_tick_time || 60000}
sync-chunk-writes=${settings.sync_chunk_writes !== false}

# Server Information
motd=${settings.motd || `Welcome to ${config.name}!`}
enable-status=${settings.enable_status !== false}
hide-online-players=${settings.hide_online_players || false}

# Commands & Permissions
enable-command-block=${settings.enable_command_block || false}
function-permission-level=${settings.function_permission_level || 2}
op-permission-level=${settings.op_permission_level || 4}

# RCON Configuration
enable-rcon=${settings.enable_rcon !== false}
rcon.port=${config.port + 1000}
rcon.password=shadowhawk
broadcast-console-to-ops=${settings.broadcast_console_to_ops !== false}
broadcast-rcon-to-ops=${settings.broadcast_rcon_to_ops !== false}

# Additional Settings
allow-nether=true
enable-query=false
query.port=${config.port}
require-resource-pack=false
enable-jmx-monitoring=${settings.enable_jmx_monitoring || false}
`;
    
    fs.writeFileSync(path.join(config.path, 'server.properties'), serverProperties.trim());

    // Create whitelist.json if whitelist is enabled and players are specified
    if (settings.white_list && config.whitelist && config.whitelist.length > 0) {
      const whitelistData = config.whitelist.map(username => ({
        uuid: "", // Will be filled by server on first join
        name: username
      }));
      fs.writeFileSync(path.join(config.path, 'whitelist.json'), JSON.stringify(whitelistData, null, 2));
      console.log(`✅ Created whitelist with ${config.whitelist.length} player(s)`);
    }

    // Create ops.json if operators are specified
    if (config.operators && config.operators.length > 0) {
      const opsData = config.operators.map(username => ({
        uuid: "", // Will be filled by server on first join
        name: username,
        level: settings.op_permission_level || 4,
        bypassesPlayerLimit: true
      }));
      fs.writeFileSync(path.join(config.path, 'ops.json'), JSON.stringify(opsData, null, 2));
      console.log(`✅ Created ops list with ${config.operators.length} admin(s)`);
    }

    // Create EULA file
    const eulaContent = `
#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://account.mojang.com/documents/minecraft_eula).
eula=true
`;
    fs.writeFileSync(path.join(config.path, 'eula.txt'), eulaContent.trim());

    // Create start script
    const startScript = `@echo off
title ${config.name} Server
java -Xmx${config.max_ram}M -Xms${config.min_ram}M -jar server.jar nogui
pause`;
    
    fs.writeFileSync(path.join(config.path, 'start-server.bat'), startScript);

    // Configure Windows Firewall (optional - won't fail if unsuccessful)
    try {
      await configureFirewall(config.name, config.port);
    } catch (error) {
      console.warn('Firewall configuration skipped:', error);
    }

    // Save server config in the server directory
    const configData = {
      ...config,
      created: new Date().toISOString(),
      jar_downloaded: true
    };
    
    fs.writeFileSync(path.join(config.path, 'shadowhawk-config.json'), JSON.stringify(configData, null, 2));

    // ALSO save in centralized servers directory for management
    const serversDir = path.join(process.cwd(), 'servers');
    if (!fs.existsSync(serversDir)) {
      fs.mkdirSync(serversDir, { recursive: true });
    }
    
    const serverManagementDir = path.join(serversDir, config.name);
    if (!fs.existsSync(serverManagementDir)) {
      fs.mkdirSync(serverManagementDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(serverManagementDir, 'shadowhawk-config.json'), JSON.stringify(configData, null, 2));

    console.log(`Server '${config.name}' created at ${config.path}`);
    return `Server '${config.name}' created successfully at ${config.path}`;
  } catch (error) {
    console.error('Error creating server:', error);
    throw new Error(`Failed to create server: ${error}`);
  }
});

ipcMain.handle('start-server', async (event, serverName: string): Promise<string> => {
  try {
    if (serverProcesses.has(serverName)) {
      throw new Error('Server is already running');
    }

    // First, try to find the server in our saved servers
    const savedServers = await getSavedServersInternal();
    const serverConfig = savedServers.find(s => s.name === serverName);
    
    if (!serverConfig) {
      throw new Error(`Server configuration not found for: ${serverName}`);
    }

    const serverPath = serverConfig.path;
    const serverJarPath = path.join(serverPath, 'server.jar');

    // Check if server directory exists
    if (!fs.existsSync(serverPath)) {
      throw new Error(`Server directory not found: ${serverPath}`);
    }

    // Check if server JAR exists
    if (!fs.existsSync(serverJarPath)) {
      throw new Error('Server JAR file not found. Please recreate the server.');
    }

    // Enhanced port conflict detection
    const usedPorts = Array.from(serverStatuses.values())
      .filter(status => status.is_running && status.name !== serverName)
      .map(status => status.port);
    
    if (usedPorts.includes(serverConfig.port)) {
      // Suggest alternative ports
      const availablePort = await findAvailablePort();
      const message = `Port ${serverConfig.port} is already in use by another server.\n` +
                     `💡 Suggestion: Use port ${availablePort} instead.\n` +
                     `   To fix this: Edit server settings and change port to ${availablePort}`;
      throw new Error(message);
    }
    
    // Also check if port is available on the system
    const systemPortAvailable = await isPortAvailable(serverConfig.port);
    if (!systemPortAvailable) {
      const availablePort = await findAvailablePort();
      const message = `Port ${serverConfig.port} is in use by another application.\n` +
                     `💡 Suggestion: Use port ${availablePort} instead.\n` +
                     `   To fix this: Edit server settings and change port to ${availablePort}`;
      throw new Error(message);
    }

    console.log(`Starting server: ${serverName} at ${serverPath}`);
    
    // Initialize server status
    const startTime = Date.now();
    serverStartTimes.set(serverName, startTime);
    serverStatuses.set(serverName, {
      name: serverName,
      status: 'starting',
      is_running: true,
      ip_address: getLocalIPAddress(),
      port: serverConfig.port,
      players_online: [],
      cpu_usage: 0,
      memory_usage: 0,
      uptime: 0,
      startup_progress: 'Initializing...'
    });
    
    // Validate Java installation and version for Minecraft 1.20.1
    try {
      const javaVersionOutput = await new Promise<string>((resolve, reject) => {
        exec('java -version', (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve(stderr || stdout); // Java version goes to stderr
        });
      });
      
      console.log('Java version check:', javaVersionOutput);
      
      // Extract version number
      const versionMatch = javaVersionOutput.match(/version "([^"]+)"/);
      if (versionMatch) {
        const version = versionMatch[1];
        const majorVersion = parseInt(version.split('.')[0]);
        
        // Minecraft 1.20.1 requires Java 17+
        if (majorVersion < 17) {
          console.warn(`⚠️ Java ${majorVersion} detected. Minecraft 1.20.1 requires Java 17 or later for optimal compatibility.`);
        } else {
          console.log(`✅ Java ${majorVersion} is compatible with Minecraft 1.20.1`);
        }
      }
    } catch (error) {
      console.warn('Could not check Java version:', error);
    }
    
    // Start Java process with enhanced networking configuration
    const serverProcess = spawn('java', [
      `-Xmx${serverConfig.max_ram}M`,
      `-Xms${serverConfig.min_ram}M`,
      '-Djava.net.preferIPv4Stack=true',
      '-Djava.awt.headless=true',
      '-Dfile.encoding=UTF-8',
      '-Dio.netty.tryReflectionSetAccessible=true',
      '-Dio.netty.eventLoopThreads=4',
      '-XX:+UseG1GC',
      '-XX:+ParallelRefProcEnabled',
      '-XX:MaxGCPauseMillis=200',
      '-jar', 'server.jar',
      'nogui'
    ], {
      cwd: serverPath,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    serverProcesses.set(serverName, serverProcess);
    serverStartTimes.set(serverName, Date.now());
    
    // Store process ID for resource monitoring
    if (serverProcess.pid) {
      serverPids.set(serverName, serverProcess.pid);
    }
    
    // Initialize console output
    if (!serverConsoleOutputs.has(serverName)) {
      serverConsoleOutputs.set(serverName, []);
    }

    // Handle server output
    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log(`[${serverName}] ${output}`);
      
      // Store console output for retrieval
      if (!serverConsoleOutputs.has(serverName)) {
        serverConsoleOutputs.set(serverName, []);
      }
      const consoleLines = serverConsoleOutputs.get(serverName)!;
      const lines = output.split('\n').filter(line => line.trim());
      consoleLines.push(...lines);
      
      // Keep only last 1000 lines to prevent memory issues
      if (consoleLines.length > 1000) {
        consoleLines.splice(0, consoleLines.length - 1000);
      }
      
      // Send real-time console output to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('console-output', serverName, lines);
      }
      
      // Parse server output for status updates
      const currentStatus = serverStatuses.get(serverName);
      if (currentStatus) {
        // Check for startup progress
        if (output.includes('Preparing spawn area:')) {
          const match = output.match(/Preparing spawn area: (\d+)%/);
          if (match) {
            currentStatus.startup_progress = `Preparing spawn area: ${match[1]}%`;
            serverStatuses.set(serverName, currentStatus);
          }
        }
        // Check if server is ready
        else if (output.includes('Done (') && output.includes('For help, type "help"')) {
          currentStatus.status = 'ready';
          currentStatus.startup_progress = 'Setting up networking...';
          serverStatuses.set(serverName, currentStatus);
          
          // Setup automatic networking
          setupAutomaticNetworking(serverName, currentStatus.port || 25565)
            .then((networkInfo) => {
              currentStatus.networking = networkInfo;
              currentStatus.startup_progress = 'Server ready!';
              
              // Update IP address with the best available option
              if (networkInfo.externalIP) {
                currentStatus.ip_address = networkInfo.externalIP.split(':')[0];
                console.log(`🎯 Server ${serverName} ready! External access: ${networkInfo.externalIP}`);
              } else if (networkInfo.tunnelURL) {
                currentStatus.ip_address = networkInfo.tunnelURL;
                console.log(`🎯 Server ${serverName} ready! Tunnel access: ${networkInfo.tunnelURL}`);
              } else {
                console.log(`🎯 Server ${serverName} ready! Local access only: ${networkInfo.localIP}`);
                console.log(`\n🔧 TROUBLESHOOTING INTERNET ACCESS:`);
                console.log(`   If you need internet access, try these solutions:`);
                console.log(`   1. Router Port Forwarding (Recommended):`);
                console.log(`      • Log into your router (usually 192.168.1.1 or 192.168.0.1)`);
                console.log(`      • Find "Port Forwarding" or "NAT" settings`);
                console.log(`      • Forward port ${currentStatus.port} to ${networkInfo.localIP.split(':')[0]}`);
                console.log(`   2. Cloudflare Tunnel (Secure):`);
                console.log(`      • Download from: https://github.com/cloudflare/cloudflared/releases`);
                console.log(`      • Run: cloudflared tunnel --url tcp://localhost:${currentStatus.port}`);
                console.log(`   3. Alternative Servers:`);
                console.log(`      • Consider Aternos, Minehut, or other free hosting`);
              }
              
              console.log(`\n📋 Networking methods: ${networkInfo.methods.join(', ')}`);
              serverStatuses.set(serverName, currentStatus);
            })
            .catch((error) => {
              console.warn('Automatic networking setup failed:', error);
              currentStatus.startup_progress = 'Server ready! (Local network only)';
              serverStatuses.set(serverName, currentStatus);
              console.log(`Server ${serverName} is now ready! Connect to ${currentStatus.ip_address}:${currentStatus.port}`);
            });
        }
        // Check for player join/leave
        else if (output.includes(' joined the game')) {
          const match = output.match(/\[Server thread\/INFO\]: (.+) joined the game/);
          if (match && currentStatus.players_online) {
            const playerName = match[1];
            if (!currentStatus.players_online.includes(playerName)) {
              currentStatus.players_online.push(playerName);
              serverStatuses.set(serverName, currentStatus);
            }
          }
        }
        else if (output.includes(' left the game')) {
          const match = output.match(/\[Server thread\/INFO\]: (.+) left the game/);
          if (match && currentStatus.players_online) {
            const playerName = match[1];
            const index = currentStatus.players_online.indexOf(playerName);
            if (index > -1) {
              currentStatus.players_online.splice(index, 1);
              serverStatuses.set(serverName, currentStatus);
            }
          }
        }
      }
      
      // TODO: Send to renderer for console display
    });

    serverProcess.stderr?.on('data', (data) => {
      const errorOutput = data.toString();
      console.error(`[${serverName}] ERROR: ${errorOutput}`);
      
      // Store error output in console
      if (!serverConsoleOutputs.has(serverName)) {
        serverConsoleOutputs.set(serverName, []);
      }
      const consoleLines = serverConsoleOutputs.get(serverName)!;
      const lines = errorOutput.split('\n').filter(line => line.trim()).map(line => `[ERROR] ${line}`);
      consoleLines.push(...lines);
      
      // Keep only last 1000 lines to prevent memory issues
      if (consoleLines.length > 1000) {
        consoleLines.splice(0, consoleLines.length - 1000);
      }
      
      // Send real-time error output to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('console-output', serverName, lines);
      }
      
      // Check for common networking errors
      if (errorOutput.includes('Address already in use') || errorOutput.includes('Cannot bind to port')) {
        console.error(`❌ Port ${serverConfig.port} is already in use for ${serverName}`);
        const currentStatus = serverStatuses.get(serverName);
        if (currentStatus) {
          currentStatus.startup_progress = `Error: Port ${serverConfig.port} is in use`;
          serverStatuses.set(serverName, currentStatus);
        }
      }
      
      if (errorOutput.includes('java.net.BindException')) {
        console.error(`❌ Network binding error for ${serverName}`);
        const currentStatus = serverStatuses.get(serverName);
        if (currentStatus) {
          currentStatus.startup_progress = 'Error: Network binding failed';
          serverStatuses.set(serverName, currentStatus);
        }
      }
    });

    serverProcess.on('exit', (code) => {
      serverProcesses.delete(serverName);
      serverPids.delete(serverName);
      serverStartTimes.delete(serverName);
      // Keep console output for review after server stops
      // serverConsoleOutputs.delete(serverName); // Don't delete immediately
      
      // Clean up networking resources
      const tunnel = serverTunnels.get(serverName);
      if (tunnel) {
        try {
          tunnel.kill();
          serverTunnels.delete(serverName);
          console.log(`Tunnel closed for ${serverName}`);
        } catch (error) {
          console.warn(`Error closing tunnel for ${serverName}:`, error);
          serverTunnels.delete(serverName);
        }
      }
      
      const upnpMapping = serverUpnpMappings.get(serverName);
      if (upnpMapping) {
        try {
          if (upnpMapping.manualSetupRequired) {
            console.log(`🔧 Server ${serverName} stopped. Manual port forwarding cleanup:`);
            console.log(`   To remove port forwarding: Open router admin panel and delete rule for port ${upnpMapping.port}`);
          }
        } catch (error) {
          console.warn('Note: Manual cleanup may be needed for port forwarding rules');
        }
        serverUpnpMappings.delete(serverName);
      }
      
      serverStatuses.set(serverName, {
        name: serverName,
        status: 'stopped',
        is_running: false,
        ip_address: '',
        port: serverConfig.port,
        players_online: [],
        cpu_usage: 0,
        memory_usage: 0,
        uptime: 0
      });
      serverStartTimes.delete(serverName);
      console.log(`Server ${serverName} stopped with code ${code}`);
    });

    serverProcess.on('error', (error) => {
      console.error(`Failed to start server ${serverName}:`, error);
      serverProcesses.delete(serverName);
      serverStatuses.delete(serverName);
      serverStartTimes.delete(serverName);
      throw error;
    });

    return `Server '${serverName}' started successfully`;
  } catch (error) {
    console.error('Error starting server:', error);
    throw new Error(`Failed to start server: ${error}`);
  }
});

ipcMain.handle('stop-server', async (event, serverName: string): Promise<string> => {
  try {
    const process = serverProcesses.get(serverName);
    if (!process) {
      throw new Error('Server is not running');
    }

    // Send stop command to server first (graceful shutdown)
    process.stdin?.write('stop\n');
    
    // If server doesn't stop in 10 seconds, force kill
    setTimeout(() => {
      if (serverProcesses.has(serverName)) {
        process.kill();
      }
    }, 10000);
    
    return `Server '${serverName}' stop command sent`;
  } catch (error) {
    console.error('Error stopping server:', error);
    throw new Error(`Failed to stop server: ${error}`);
  }
});

ipcMain.handle('send-command', async (event, serverName: string, command: string): Promise<string> => {
  try {
    const serverProcess = serverProcesses.get(serverName);
    if (!serverProcess) {
      throw new Error(`Server "${serverName}" is not running`);
    }

    // Send command to server stdin
    serverProcess.stdin?.write(`${command}\n`);
    
    // Add command to console output for display
    if (!serverConsoleOutputs.has(serverName)) {
      serverConsoleOutputs.set(serverName, []);
    }
    const consoleLines = serverConsoleOutputs.get(serverName)!;
    consoleLines.push(`> ${command}`);
    
    // Send to renderer for real-time display
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('console-output', serverName, [`> ${command}`]);
    }
    
    console.log(`Sent command '${command}' to server '${serverName}'`);
    return `Command '${command}' sent to server '${serverName}'`;
  } catch (error) {
    console.error('Error sending command:', error);
    throw new Error(`Failed to send command: ${error}`);
  }
});

ipcMain.handle('get-console-output', async (event, serverName: string): Promise<string[]> => {
  try {
    return serverConsoleOutputs.get(serverName) || [];
  } catch (error) {
    console.error('Error getting console output:', error);
    return [];
  }
});

ipcMain.handle('clear-console-output', async (event, serverName: string): Promise<void> => {
  try {
    serverConsoleOutputs.set(serverName, []);
  } catch (error) {
    console.error('Error clearing console output:', error);
  }
});

ipcMain.handle('get-server-status', async (event, serverName: string): Promise<ServerStatus> => {
  try {
    const isRunning = serverProcesses.has(serverName);
    const status = serverStatuses.get(serverName);
    const startTime = serverStartTimes.get(serverName);
    
    // If we have cached status, return it with calculated uptime
    if (status) {
      const uptime = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
      return {
        ...status,
        is_running: isRunning,
        uptime
      } as ServerStatus;
    }
    
    // Get server config for port info
    const savedServers = await getSavedServersInternal();
    const serverConfig = savedServers.find(s => s.name === serverName);
    const port = serverConfig?.port || 25565;
    
    // Return basic status if no cached data
    return {
      name: serverName,
      is_running: isRunning,
      status: isRunning ? 'starting' : 'stopped',
      ip_address: isRunning ? getLocalIPAddress() : '',
      port: port,
      players_online: [],
      cpu_usage: 0,
      memory_usage: 0,
      uptime: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
    };
  } catch (error) {
    console.error('Error getting server status:', error);
    throw new Error(`Failed to get server status: ${error}`);
  }
});

ipcMain.handle('get-port-recommendations', async (): Promise<any> => {
  try {
    const recommendations = await getPortRecommendations();
    return {
      ...recommendations,
      portRanges: MINECRAFT_PORT_RANGES,
      explanation: {
        recommended: `Port ${recommendations.recommended} is available and optimized for compatibility`,
        alternatives: `Alternative ports that are also available: ${recommendations.alternatives.join(', ')}`,
        conflicts: recommendations.conflictInfo.hasConflicts 
          ? `Conflicting ports detected: ${recommendations.conflictInfo.conflictingPorts.join(', ')}`
          : 'No port conflicts detected',
        tips: [
          '🎯 Recommended ports (25566-25570) are Minecraft-adjacent and usually work well',
          '🎮 Gaming ports (19132+, 7777+) are commonly open on gaming routers',
          '🚀 High-range ports (30000+) are rarely blocked by firewalls',
          '⚠️  Standard port 25565 may require router configuration'
        ]
      }
    };
  } catch (error) {
    console.error('Error getting port recommendations:', error);
    throw new Error('Failed to get port recommendations');
  }
});

ipcMain.handle('check-port-availability', async (event, port: number): Promise<boolean> => {
  try {
    const available = await isPortAvailable(port);
    const usedByApp = Array.from(serverStatuses.values())
      .some(status => status.port === port && status.is_running);
    
    return available && !usedByApp;
  } catch (error) {
    console.error('Error checking port availability:', error);
    return false;
  }
});

ipcMain.handle('get-local-ip', async (): Promise<string> => {
  try {
    return getLocalIPAddress();
  } catch (error) {
    console.error('Error getting local IP:', error);
    throw new Error('Failed to get local IP');
  }
});

ipcMain.handle('get-network-info', async (): Promise<any> => {
  try {
    const interfaces = require('os').networkInterfaces();
    const networkInfo: any[] = [];
    
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && !alias.internal) {
          networkInfo.push({
            interface: devName,
            address: alias.address,
            isLocal: alias.address.startsWith('192.168.') || alias.address.startsWith('10.') || alias.address.startsWith('172.'),
          });
        }
      }
    }
    
    return {
      localIP: getLocalIPAddress(),
      allInterfaces: networkInfo,
      troubleshooting: {
        firewallNote: "Make sure Windows Firewall allows Minecraft on the server port",
        routerNote: "For internet access, configure port forwarding on your router",
        localNote: "Local network connections should work with the IP addresses shown above",
      }
    };
  } catch (error) {
    console.error('Error getting network info:', error);
    throw new Error('Failed to get network information');
  }
});

ipcMain.handle('select-folder', async (): Promise<string | null> => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Select Server Directory'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  } catch (error) {
    console.error('Error selecting folder:', error);
    return null;
  }
});

// Get saved servers
// Get saved servers
async function getSavedServersInternal(): Promise<ServerConfig[]> {
  try {
    const serversDir = path.join(process.cwd(), 'servers');
    if (!fs.existsSync(serversDir)) {
      fs.mkdirSync(serversDir, { recursive: true });
      return [];
    }

    const servers: ServerConfig[] = [];
    const serverFolders = fs.readdirSync(serversDir);

    for (const folder of serverFolders) {
      const serverFolderPath = path.join(serversDir, folder);
      const configPath = path.join(serverFolderPath, 'shadowhawk-config.json');
      
      // Check if the folder and config file exist
      if (fs.existsSync(serverFolderPath) && fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          
          // Validate that the server path in config actually exists
          if (fs.existsSync(config.path)) {
            servers.push(config);
          } else {
            console.warn(`Server path for ${config.name} no longer exists: ${config.path}`);
            // Optionally clean up the orphaned folder
            try {
              fs.rmSync(serverFolderPath, { recursive: true, force: true });
              console.log(`Cleaned up orphaned server folder: ${serverFolderPath}`);
            } catch (cleanupError) {
              console.error(`Failed to cleanup orphaned folder ${serverFolderPath}:`, cleanupError);
            }
          }
        } catch (error) {
          console.error(`Error reading config for server ${folder}:`, error);
          // If config is corrupted, remove the folder
          try {
            fs.rmSync(serverFolderPath, { recursive: true, force: true });
            console.log(`Cleaned up corrupted server folder: ${serverFolderPath}`);
          } catch (cleanupError) {
            console.error(`Failed to cleanup corrupted folder ${serverFolderPath}:`, cleanupError);
          }
        }
      } else {
        // If config doesn't exist but folder does, clean it up
        if (fs.existsSync(serverFolderPath)) {
          try {
            fs.rmSync(serverFolderPath, { recursive: true, force: true });
            console.log(`Cleaned up incomplete server folder: ${serverFolderPath}`);
          } catch (cleanupError) {
            console.error(`Failed to cleanup incomplete folder ${serverFolderPath}:`, cleanupError);
          }
        }
      }
    }

    return servers;
  } catch (error) {
    console.error('Error getting saved servers:', error);
    return [];
  }
}

ipcMain.handle('get-saved-servers', async (): Promise<ServerConfig[]> => {
  return getSavedServersInternal();
});

// Server settings management
ipcMain.handle('get-server-settings', async (event, serverName: string): Promise<ServerConfig | null> => {
  try {
    const servers = await getSavedServersInternal();
    const server = servers.find(s => s.name === serverName);
    return server || null;
  } catch (error) {
    console.error('Error getting server settings:', error);
    throw new Error(`Failed to get server settings: ${error}`);
  }
});

ipcMain.handle('update-server-settings', async (event, serverName: string, newSettings: Partial<ServerConfig>): Promise<string> => {
  try {
    const servers = await getSavedServersInternal();
    const serverIndex = servers.findIndex(s => s.name === serverName);
    
    if (serverIndex === -1) {
      throw new Error(`Server ${serverName} not found`);
    }
    
    const server = servers[serverIndex];
    const updatedServer = { ...server, ...newSettings };
    
    // Update server.properties file
    const serverPropertiesPath = path.join(server.path, 'server.properties');
    if (fs.existsSync(serverPropertiesPath)) {
      const settings = updatedServer.settings || {};
      const serverProperties = `
#Minecraft server properties
#Generated by ShadowHawk Server Manager - Updated: ${new Date().toISOString()}
server-ip=0.0.0.0
server-port=${updatedServer.port}
max-players=${settings.max_players || 20}
difficulty=${settings.difficulty || 'easy'}
gamemode=${settings.gamemode || 'survival'}
hardcore=${settings.hardcore || false}
pvp=${settings.pvp !== undefined ? settings.pvp : true}
enable-command-block=${settings.enable_command_block || false}
spawn-protection=${settings.spawn_protection || 16}
force-gamemode=false
max-world-size=29999984
level-name=world
level-seed=${settings.level_seed || ''}
level-type=${settings.level_type || 'minecraft\\:normal'}
spawn-monsters=${settings.spawn_monsters !== undefined ? settings.spawn_monsters : true}
spawn-animals=${settings.spawn_animals !== undefined ? settings.spawn_animals : true}
spawn-npcs=${settings.spawn_npcs !== undefined ? settings.spawn_npcs : true}
generate-structures=${settings.generate_structures !== undefined ? settings.generate_structures : true}
view-distance=${settings.view_distance || 10}
simulation-distance=10
player-idle-timeout=0
motd=${settings.motd || `Welcome to ${updatedServer.name}!`}
enable-rcon=true
rcon.port=${updatedServer.port + 1000}
rcon.password=shadowhawk
online-mode=${settings.online_mode !== undefined ? settings.online_mode : true}
white-list=${settings.white_list || false}
enforce-whitelist=false
allow-flight=${settings.allow_flight || false}
prevent-proxy-connections=false
hide-online-players=false
network-compression-threshold=256
max-tick-time=60000
require-resource-pack=false
use-native-transport=true
enable-jmx-monitoring=false
sync-chunk-writes=true
enable-status=true
entity-broadcast-range-percentage=100
function-permission-level=2
op-permission-level=4
allow-nether=true
enable-query=false
query.port=25565
broadcast-console-to-ops=true
broadcast-rcon-to-ops=true
`;
      
      fs.writeFileSync(serverPropertiesPath, serverProperties.trim());
    }
    
    // Update config file
    const configPath = path.join(server.path, 'shadowhawk-config.json');
    fs.writeFileSync(configPath, JSON.stringify(updatedServer, null, 2));
    
    return `Server settings updated successfully for ${serverName}`;
  } catch (error) {
    console.error('Error updating server settings:', error);
    throw new Error(`Failed to update server settings: ${error}`);
  }
});

ipcMain.handle('restart-server', async (event, serverName: string): Promise<string> => {
  try {
    // Stop the server first
    await ipcMain.emit('stop-server', event, serverName);
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start the server again
    await ipcMain.emit('start-server', event, serverName);
    return `Server ${serverName} restarted successfully`;
  } catch (error) {
    console.error('Error restarting server:', error);
    throw new Error(`Failed to restart server: ${error}`);
  }
});

ipcMain.handle('delete-server', async (event, serverName: string): Promise<string> => {
  try {
    // Stop the server if it's running
    const status = serverStatuses.get(serverName);
    if (status?.is_running) {
      try {
        await ipcMain.emit('stop-server', event, serverName);
        // Wait for cleanup
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (stopError) {
        console.warn(`Failed to stop server ${serverName} before deletion:`, stopError);
        // Continue with deletion even if stop fails
      }
    }

    // Get server configuration
    const servers = await getSavedServersInternal();
    const server = servers.find(s => s.name === serverName);
    
    // If server config is found, try to remove its directory
    if (server && server.path) {
      if (fs.existsSync(server.path)) {
        try {
          fs.rmSync(server.path, { recursive: true, force: true });
          console.log(`Removed server directory: ${server.path}`);
        } catch (removeError) {
          console.error(`Failed to remove server directory ${server.path}:`, removeError);
          // Don't throw here, continue with cleanup
        }
      } else {
        console.warn(`Server directory ${server.path} was already missing`);
      }
    }

    // Also clean up any orphaned folders in the servers directory
    try {
      const serversDir = path.join(process.cwd(), 'servers');
      if (fs.existsSync(serversDir)) {
        const serverFolders = fs.readdirSync(serversDir);
        for (const folder of serverFolders) {
          const folderPath = path.join(serversDir, folder);
          const configPath = path.join(folderPath, 'shadowhawk-config.json');
          
          if (fs.existsSync(configPath)) {
            try {
              const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
              if (config.name === serverName) {
                fs.rmSync(folderPath, { recursive: true, force: true });
                console.log(`Cleaned up server management folder: ${folderPath}`);
                break;
              }
            } catch (configError) {
              console.error(`Error reading config in cleanup for ${folder}:`, configError);
            }
          }
        }
      }
    } catch (cleanupError) {
      console.error('Error during server cleanup:', cleanupError);
    }

    // Clean up status and tunnels regardless
    serverStatuses.delete(serverName);
    serverTunnels.delete(serverName);

    return `Server ${serverName} deleted successfully`;
  } catch (error) {
    console.error('Error deleting server:', error);
    throw new Error(`Failed to delete server: ${error}`);
  }
});

ipcMain.handle('cleanup-servers', async (): Promise<string> => {
  try {
    const beforeCount = (await getSavedServersInternal()).length;
    
    // Force a cleanup by calling getSavedServersInternal which now includes cleanup logic
    const cleanServers = await getSavedServersInternal();
    const afterCount = cleanServers.length;
    
    const removedCount = beforeCount - afterCount;
    
    if (removedCount > 0) {
      return `Cleaned up ${removedCount} orphaned server(s)`;
    } else {
      return 'No cleanup needed - all servers are valid';
    }
  } catch (error) {
    console.error('Error during server cleanup:', error);
    throw new Error(`Failed to cleanup servers: ${error}`);
  }
});

// Get banned players list for a server
ipcMain.handle('get-banned-players', async (event, serverName: string): Promise<string[]> => {
  try {
    const servers = await getSavedServersInternal();
    const server = servers.find(s => s.name === serverName);
    
    if (!server) {
      throw new Error('Server not found');
    }
    
    const bannedListPath = path.join(server.path, 'banned-players.json');
    
    if (!fs.existsSync(bannedListPath)) {
      return [];
    }
    
    const bannedData = JSON.parse(fs.readFileSync(bannedListPath, 'utf8'));
    return bannedData.map((entry: any) => entry.name);
  } catch (error) {
    console.error('Error getting banned players:', error);
    return [];
  }
});

// Unban a player
ipcMain.handle('unban-player', async (event, serverName: string, playerName: string): Promise<string> => {
  try {
    const servers = await getSavedServersInternal();
    const server = servers.find(s => s.name === serverName);
    
    if (!server) {
      throw new Error('Server not found');
    }
    
    const bannedListPath = path.join(server.path, 'banned-players.json');
    
    if (!fs.existsSync(bannedListPath)) {
      throw new Error('No banned players file found');
    }
    
    const bannedData = JSON.parse(fs.readFileSync(bannedListPath, 'utf8'));
    const originalLength = bannedData.length;
    
    const filteredData = bannedData.filter((entry: any) => entry.name !== playerName);
    
    if (filteredData.length === originalLength) {
      throw new Error(`Player ${playerName} is not banned`);
    }
    
    fs.writeFileSync(bannedListPath, JSON.stringify(filteredData, null, 2));
    
    // Also send unban command to server if it's running
    const process = serverProcesses.get(serverName);
    if (process && !process.killed) {
      process.stdin?.write(`pardon ${playerName}\n`);
    }
    
    return `Successfully unbanned ${playerName}`;
  } catch (error) {
    console.error('Error unbanning player:', error);
    throw new Error(`Failed to unban player: ${error}`);
  }
});
