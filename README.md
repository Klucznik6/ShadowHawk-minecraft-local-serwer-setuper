# ShadowHawk Minecraft Server Manager

A modern, user-friendly desktop application for managing Minecraft servers on Windows. Built with **Electron + React + TypeScript** for the best development experience and cross-platform compatibility.

## ✨ Features

- **Easy Server Management**: Create, start, stop, and configure multiple Minecraft servers
- **Real-time Monitoring**: Live system resource tracking (CPU, RAM usage)
- **Server Console**: Built-in console for executing Minecraft commands via RCON
- **Player Tracking**: See who's online in real-time
- **Resource Control**: Allocate specific RAM and CPU cores per server
- **Modern UI**: Clean, intuitive interface built with Chakra UI
- **Cross-Platform Ready**: Easy to extend to macOS and Linux

## 🚀 Quick Start

### Prerequisites

1. **Node.js** (18+ recommended)
   ```bash
   # Download from https://nodejs.org/
   ```

2. **Java** (17+ for modern Minecraft versions)
   ```bash
   # Download from https://adoptium.net/
   ```

### Installation & Development

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/Klucznik6/ShadowHawk-minecraft-serwer-setuper.git
   cd ShadowHawk-minecraft-serwer-setuper
   npm install
   ```

2. **Build Electron components**
   ```bash
   npm run build:electron
   ```

3. **Start development mode**
   ```bash
   npm run electron:dev
   ```

4. **Build for production**
   ```bash
   npm run electron:build
   ```

## 🛠️ Development

### Project Structure

```
ShadowHawk-minecraft-serwer-setuper/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── types/             # TypeScript definitions
│   ├── App.tsx            # Main application
│   └── main.tsx           # React entry point
├── electron/              # Electron backend
│   ├── main.ts            # Main process (Node.js)
│   └── preload.ts         # Preload script (bridge)
├── dist-electron/         # Built Electron files
├── dist/                  # Built React files
├── package.json           # Dependencies & scripts
└── build-electron.js      # Electron build script
```

### Key Technologies

- **Backend**: Electron (Node.js) with system monitoring
- **Frontend**: React 18 + TypeScript
- **UI Framework**: Chakra UI with dark theme
- **Build Tools**: Vite + ESBuild
- **Icons**: Lucide React
- **System Info**: systeminformation package

### Available Scripts

```bash
npm run dev                # Start Vite dev server only
npm run build              # Build React frontend
npm run build:electron     # Build Electron main/preload
npm run build:all          # Build both frontend and Electron
npm run electron:dev       # Start full development environment
npm run electron:build     # Build production app
```

## 🎯 Features Status

### ✅ Completed
- [x] Project converted from Tauri to Electron
- [x] Modern React + TypeScript frontend
- [x] Electron main process with IPC communication
- [x] System resource monitoring
- [x] Server creation UI
- [x] Folder selection for server directories
- [x] Dark theme UI with Chakra

### 🚧 In Development
- [ ] Minecraft server jar download
- [ ] Java process management for servers
- [ ] Server configuration generation
- [ ] Real-time server log parsing
- [ ] RCON integration for commands

### 📋 Planned
- [ ] Player tracking and management
- [ ] Server backup system
- [ ] Plugin/mod support (Forge, Fabric)
- [ ] Settings persistence
- [ ] Auto-updates
- [ ] macOS and Linux builds

## � Why Electron?

**Easier Development & Debugging:**
- Familiar web development workflow
- Excellent DevTools integration
- Rich ecosystem and documentation
- Easier error handling and logging

**Cross-Platform Benefits:**
- One codebase for Windows, macOS, Linux
- Native OS integration (file dialogs, notifications)
- Professional desktop app experience
- Easy distribution via app stores

**Development Experience:**
- Hot-reload in development
- TypeScript support throughout
- Modern React ecosystem
- Easy to add new features

## 🔧 Architecture

### Frontend (React)
- **Modern UI Components** with Chakra UI
- **Real-time Updates** via Electron IPC
- **Type Safety** with TypeScript
- **State Management** with React hooks

### Backend (Electron Main)
- **System Monitoring** with systeminformation
- **Process Management** for Minecraft servers
- **File Operations** for server setup
- **IPC Communication** with secure context isolation

### Bridge (Preload Script)
- **Secure API Exposure** via contextBridge
- **Type-safe Communication** between processes
- **No Node.js Access** in renderer for security

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**🎉 Congratulations on switching to Electron!** 

The development experience is now much more familiar and easier to debug. You have all the power of Node.js in the backend with a modern React frontend, making it simple to add features like file system access, process management, and system monitoring.

**Next Steps:**
1. Test the folder selection in the Create Server modal
2. Implement actual Minecraft server downloading
3. Add Java process spawning for server management
4. Build the RCON integration for server commands

Happy coding! 🚀
