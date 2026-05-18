import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ToastProvider } from "./components/Toast";  // patch_bundle04b1_providers
import { NotificationsProvider } from "./notifications";
import { BrowserRouter } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";

import "@rainbow-me/rainbowkit/styles.css";

import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { avalancheFuji, avalanche } from "wagmi/chains";

const chainEnv = import.meta.env.VITE_CHAIN_ENV;
const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "fallback-local-id";

// Fix: avalanche was referenced but never imported in original
const chains =
  chainEnv === "mainnet"
    ? ([avalanche] as const)
    : ([avalancheFuji] as const);

const config = getDefaultConfig({
  appName: "Verisphere",
  projectId,
  chains,
  ssr: false,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <RainbowKitProvider>
          <BrowserRouter>
          <ErrorBoundary>
            <ToastProvider>
              <NotificationsProvider>
                <App />
              </NotificationsProvider>
            </ToastProvider>
          </ErrorBoundary>
          </BrowserRouter>
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  </React.StrictMode>
);