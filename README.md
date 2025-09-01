# CryptoVertX

<div align="center">
  <img src="src/assets/icon.ico" alt="CryptoVertX Icon" width="120" />
  <h1>🪙 CryptoVertX</h1>
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

### Interactive Build System

CryptoVertX features an interactive build system that allows you to choose what type of build you want to create:

```bash
# Interactive build (recommended)
pnpm build-app
```

This will present you with a menu to choose between:
- 🚀 Default (MSI Setup + Portable) - Builds the standard MSI installer and the portable version.
- 💿 MSI Installer - Build only the Windows installer (.msi)
- 📦 Portable Executable - Build only the standalone .exe file
- ✨ EXE Setup Wizard - Build only the .exe setup wizard
- 🏆 All Packages (EXE, MSI, Portable) - Build all available packages

The build system also handles version management:
- Automatically reads version from package.json
- Updates the hardcoded version in versionManager.ts for production builds
- Prompts to create a new version or overwrite existing version
- Automatically creates versioned output directories

When selecting the "Both" option, you'll get a cool build summary with performance metrics showing:
- Build time for each package type
- Visual progress bars comparing build times
- Performance statistics
- Which build was faster and by what percentage

### Direct Build Commands

You can also use these direct commands to skip the interactive menu:

```bash
# Build the default packages (MSI Setup + Portable)
pnpm build-app --default

# Build portable executable only
pnpm build-app --portable

# Build MSI installer only
pnpm build-app --msi

# Build EXE setup wizard only
pnpm build-app --exe

# Build all packages with performance summary
pnpm build-app --all
```

All build outputs are placed in the `release/${version}` directory.

## �� Advanced Features

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

### Version Management & Updates
- Robust version management:
  - Centralized version handling through `versionManager.ts`
  - Multiple version detection methods with fallbacks
  - Version priority system for reliable detection in all environments
- Automated version injection during build:
  - Dynamic injection of current version from package.json into build files
  - Multiple verification passes to ensure correct version is used
  - Support for updating version number during the build process
- Integrated update system:
  - Automatic update checking against cloud storage
  - Secure Cloudflare R2 integration for update distribution
  - Version comparison with semantic versioning support
  - Smooth update download and installation process
  - Support for both direct updates and browser-based downloads

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

## Environment Variables

This application uses environment variables for configuration. To set up your environment:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your API keys and credentials in the `.env` file:
   - `VITE_COINGECKO_API_KEY`: Your CoinGecko API key
   - `VITE_CRYPTOCOMPARE_API_KEY`: Your CryptoCompare API key
   - `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: Your Cloudflare R2 credentials (for update service)
   - Other configuration variables as needed

3. Never commit your `.env` file to version control. It's already added to `.gitignore`.

## Security Notes

- API keys and credentials are loaded from environment variables and passed to the renderer process securely.
- No hardcoded credentials are used in the application.
- For production builds, ensure all environment variables are properly set in your build environment.
- When distributing the application, use a secure method to provide the necessary credentials.

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

## Development

### CORS Handling in Development

When developing locally, API requests to external services may be blocked by CORS policies. The application uses a proxy approach to handle CORS in development:

1. For Vite development server, add the following to your `vite.config.ts`:

```typescript
export default defineConfig({
  // ... other config
  server: {
    proxy: {
      '/api-proxy': {
        target: 'https://cryptovertx.com/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ''),
        secure: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  }
});
```
