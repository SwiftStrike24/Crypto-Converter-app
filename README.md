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

## 🛠️ Tech Stack

- **Frontend**
  - React 18 + TypeScript
  - Styled Components for styling
  - React Icons for UI elements
  - React Router for navigation
  - Axios for API calls

- **Desktop Integration**
  - Electron for cross-platform desktop support
  - Vite for fast development and building
  - Electron Builder for packaging

## 🏗️ Project Structure

- `src/electron/` - Electron main process code
- `src/components/` - React components
- `src/context/` - React context providers
- `src/assets/` - Static assets and resources
- `src/App.tsx` - Main application component

## 💻 Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run electron development build
pnpm electron:dev

# Build for production
pnpm electron:build

# Create installer
pnpm electron:build-installer
```

## 🚀 Building and Distribution

The app can be built for different platforms:
- Windows portable executable
- Windows installer (NSIS)

Use the following commands:
```bash
# Create portable executable
pnpm electron:build

# Create installer
pnpm electron:build-installer
```

## 🔧 Configuration

The application uses environment variables for configuration. Create a `.env` file in the root directory with the necessary API keys and configuration values.

## 📦 Dependencies

- React 18
- Electron
- TypeScript
- Styled Components
- React Router DOM
- Axios
- Lodash
- React Icons

## 🧪 Development Dependencies

- Vite
- Electron Builder
- TypeScript ESLint
- Various type definitions (@types/*)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## 📝 License

This project is licensed under the MIT License.