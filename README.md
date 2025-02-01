# Crypto Converter App

<div align="center">
  <img src="src/assets/icon.ico" alt="Crypto Converter Icon" width="120" />
  <h1>🪙 Crypto Converter</h1>
  <p>A sleek and powerful desktop application for real-time cryptocurrency conversion and tracking</p>
</div>

## ✨ Features

- 💱 Real-time cryptocurrency conversion
- 📊 Support for multiple cryptocurrencies
- 🔄 Live price updates
- 🖥️ Cross-platform desktop application
- 🌙 Modern, intuitive interface
- 🔍 Search and add new cryptocurrencies
- 💫 Smooth animations and transitions
- 📱 Responsive design
- 🔐 Secure API integration
- 🚀 Single instance management with smart relaunch
- ⚡ Optimized build process for faster production builds
- 🎯 Global hotkey support (` or ~ to toggle window)
- 🔄 Smart window management (minimize to tray)

## 🛠️ Tech Stack

- **Frontend**
  - React 18 + TypeScript
  - Material-UI (MUI) for UI components
  - Styled Components for custom styling
  - React Icons for UI elements
  - React Router for navigation
  - Axios for API calls
  - Recharts for cryptocurrency charts

- **Desktop Integration**
  - Electron for cross-platform desktop support
  - Vite for blazing-fast development and optimized builds
  - Electron Builder for efficient packaging
  - Custom instance management system

## 🏗️ Project Structure

```
src/
├── electron/          # Electron main process code
│   └── main.ts       # Main electron process with window management
├── components/        # React components
├── context/          # React context providers
│   ├── CryptoContext.tsx
│   └── CryptoCompareContext.tsx
├── pages/            # Application pages
│   ├── ChartPage.tsx
│   ├── InstanceDialog.tsx
│   └── ManageTokens.tsx
├── assets/           # Static assets and resources
└── App.tsx           # Main application component
```

## 💻 Development

```bash
# Install dependencies (using pnpm for faster, more reliable builds)
pnpm install

# Start development server
pnpm dev

# Run electron development build
pnpm electron:dev

# Build optimized production executable
pnpm electron:build

# Create installer
pnpm electron:build-installer
```

## 🚀 Building and Distribution

The app uses an optimized build process leveraging:
- Vite's build optimization
- Manual chunk splitting for better performance
- Tree shaking and code minification
- Disabled sourcemaps in production
- Efficient asset compression

Build commands:
```bash
# Create optimized portable executable
pnpm electron:build

# Create installer with optimized settings
pnpm electron:build-installer
```

## 🔧 Advanced Features

### Instance Management
- Single instance lock ensures only one app instance runs
- Smart relaunch functionality for updates
- Custom dialog for second instance attempts
- Graceful cleanup on exit

### Window Management
- Global hotkey support (` or ~) for quick access
- Minimize to tray functionality
- Window position memory
- Focus/blur handling

### Build Optimization
- Optimized chunk splitting:
  - vendor (React core)
  - ui (Material-UI + styling)
  - charts (Recharts)
- Fast production builds
- Efficient caching
- Minimal output size

## 📦 Dependencies

### Core
- React 18
- Electron 27
- TypeScript 5
- Material-UI 6
- Styled Components 6
- React Router DOM 7
- Axios
- Recharts

### Development
- Vite 5
- Electron Builder 24
- ESLint
- Various type definitions

## 🔧 Configuration

The application uses environment variables for configuration:
1. Create a `.env` file in the root directory
2. Add necessary API keys and configuration values
3. See `.env.example` for required variables

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🎯 Recent Improvements

- Enhanced single instance management
- Optimized build process for faster production builds
- Improved window management with global hotkeys
- Added smart relaunch functionality
- Implemented efficient chunk splitting
- Optimized asset loading and caching