'use client';

import { FC, ReactNode, useMemo, useState, useEffect } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

interface WalletContextProviderProps {
  children: ReactNode;
}

export const WalletContextProvider: FC<WalletContextProviderProps> = ({ children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // You can set the network to 'devnet', 'testnet', or 'mainnet-beta'
  const network = WalletAdapterNetwork.Mainnet;

  // Use custom RPC URL from environment variable, fallback to default cluster URL
  const endpoint = useMemo(() => {
    const customRpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
    if (customRpcUrl) {
      return customRpcUrl;
    }
    return clusterApiUrl(network);
  }, [network]);

  const wallets = useMemo(
    () => {
      // Only create wallets on client side
      if (typeof window === 'undefined') return [];
      
      const walletAdapters = [
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
      ];

      // Filter out any undefined or null adapters and ensure unique wallets
      const uniqueWallets = walletAdapters.filter(
        (wallet, index, self) => 
          wallet && 
          self.findIndex((w) => w?.name === wallet.name) === index
      );

      return uniqueWallets;
    },
    []
  );

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

