# Gemini Project Context: CryptoVertX

## Project Overview

This project is a sleek and powerful desktop application named **CryptoVertX** for real-time cryptocurrency conversion and tracking. It is built using Electron, React, and TypeScript, providing a modern and intuitive user interface.

- **Core Technologies:**
  - **Electron:** For building the cross-platform desktop application.
  - **React 18:** For the user interface.
  - **TypeScript:** For static typing and improved developer experience.
  - **Vite:** As the build tool for fast development and optimized builds.
  - **Material-UI (MUI):** For UI components.
  - **Styled Components:** For custom styling.
  - **pnpm:** As the package manager.

- **Key Features:**
  - Real-time cryptocurrency conversion.
  - Live price updates and historical data charts.
  - A news feed from various crypto news sources.
  - Single instance management to prevent multiple app instances.
  - An auto-update mechanism using Cloudflare R2.
  - A global hotkey (`~` or `` ` ``) to quickly show/hide the application window.

## Getting Started

To get the application running locally, follow these steps:

1.  **Install Dependencies:**
    The project uses `pnpm` for package management.

    ```bash
    pnpm install
    ```

2.  **Environment Variables:**
    Create a `.env` file in the root directory by copying the example file.

    ```bash
    cp .env.example .env
    ```

    You will need to add API keys for CoinGecko and CryptoCompare to the `.env` file for the application to fetch data.

3.  **Run in Development Mode:**
    This command starts the Vite development server and the Electron application.

    ```bash
    pnpm dev
    ```

## Key Commands

The `package.json` file contains several scripts for development and building the application. Here are some of the most important ones:

-   `pnpm dev`: Starts the application in development mode with hot-reloading.
-   `pnpm build-app`: Runs an interactive script to create production builds (MSI, EXE, portable).
-   `pnpm build:release`: Creates an optimized production build.
-   `pnpm lint`: Lints the codebase using ESLint.
-   `pnpm typecheck`: Runs the TypeScript compiler to check for type errors.

## Project Structure

The project is organized into several key directories:

-   `src/electron/main.ts`: The main entry point for the Electron application. It handles window creation, global shortcuts, and communication with the renderer process.
-   `src/`: Contains the source code for the React application (the renderer process).
-   `src/App.tsx`: The main React component that sets up the application's routing and context providers.
-   `src/components/`: Reusable React components used throughout the application.
-   `src/pages/`: Components that represent the different pages/views of the application (e.g., `Converter`, `ChartPage`).
-   `src/services/`: Modules responsible for fetching data from external APIs (e.g., CoinGecko, CryptoCompare).
-   `src/context/`: React context providers for managing global state.
-   `vite.config.ts`: The configuration file for Vite, which handles the build process for both the main and renderer processes.
-   `scripts/`: Contains Node.js scripts for custom build processes and other utilities.

## Development Conventions

-   **Styling:** The project uses a combination of Material-UI components and `styled-components` for custom styling.
-   **State Management:** Global state is managed through React Context, as seen in the `src/context` directory.
-   **API Interaction:** API calls are centralized in the `src/services` directory.
-   **Build Process:** The build process is handled by Vite and customized with scripts in the `scripts` directory for creating different types of installers.
-   **IPC Communication:** The Electron main and renderer processes communicate via IPC channels. Handlers are defined in `src/electron/main.ts`.
