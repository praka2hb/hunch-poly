'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { ReactNode } from 'react';

interface PrivyAuthProviderProps {
  children: ReactNode;
}

export function PrivyAuthProvider({ children }: PrivyAuthProviderProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

  // Show a helpful message if Privy App ID is not configured
  if (!appId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0D0D0D] p-6">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Configuration Required</h1>
          <p className="text-gray-400 mb-6">
            Privy App ID is not configured. Please add your Privy App ID to your environment variables.
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left">
            <p className="text-gray-500 text-sm mb-2">Add to your <code className="text-white">.env.local</code> file:</p>
            <code className="text-green-400 text-sm font-mono">
              NEXT_PUBLIC_PRIVY_APP_ID=your_app_id_here
            </code>
          </div>
          <p className="text-gray-500 text-sm mt-4">
            Get your App ID from{' '}
            <a
              href="https://dashboard.privy.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-white underline"
            >
              dashboard.privy.io
            </a>
          </p>
        </div>
      </div>
    );
  }

  // Convert HTTP RPC URL to WebSocket URL for subscriptions
  const wsUrl = rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#06b6d4',
          logo: undefined,
          showWalletLoginFirst: false,
        },
        loginMethods: ['twitter', 'google'],
        embeddedWallets: {
          showWalletUIs: false,
          solana: {
            createOnLogin: 'users-without-wallets' as const,
          },
        },
        solana: {
          rpcs: {
            'solana:mainnet': {
              rpc: createSolanaRpc(rpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl),
            },
          },
        },
        // Don't set default Ethereum chain - ensures no Ethereum wallets are created
      }}
    >
      {children}
    </PrivyProvider>
  );
}
