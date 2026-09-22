// frontend/src/web3/chains.ts — the ONE place the expected chain is decided (from VITE_CHAIN_ENV).
import { avalanche, avalancheFuji } from "wagmi/chains";
const ENV = import.meta.env.VITE_CHAIN_ENV || "fuji";
export const IS_MAINNET = ENV === "mainnet";
export const EXPECTED_CHAIN = IS_MAINNET ? avalanche : avalancheFuji;
export const EXPECTED_CHAIN_ID = EXPECTED_CHAIN.id; // 43114 mainnet / 43113 fuji
export const CHAIN_LABEL = IS_MAINNET ? "Avalanche C-Chain" : "Avalanche Fuji Testnet";
