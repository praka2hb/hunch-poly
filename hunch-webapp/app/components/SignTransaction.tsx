'use client';

import { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';

export default function SignTransaction() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSignTransaction = async () => {
    if (!publicKey || !signTransaction) {
      setStatus('Please connect your wallet first');
      return;
    }

    setLoading(true);
    setStatus('');

    try {

      // Create a simple transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: publicKey, // Sending to self for demo
          lamports: 0, // 0 lamports since it's just for signing
        })
      );

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign the transaction
      const signedTransaction = await signTransaction(transaction);

      // Verify signature
      if (signedTransaction.signature) {
        setStatus('✅ Transaction signed successfully!');
        console.log('Signed transaction:', signedTransaction);
      } else {
        setStatus('❌ Failed to sign transaction');
      }
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
      console.error('Sign transaction error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
        Sign Transaction
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Sign a transaction without sending it to the network. This is useful for off-chain verification.
      </p>
      <button
        onClick={handleSignTransaction}
        disabled={!publicKey || !signTransaction || loading}
        className="px-4 py-2 bg-white text-white rounded-lg hover:bg-white-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Signing...' : 'Sign Transaction'}
      </button>
      {status && (
        <p className={`mt-4 ${status.includes('✅') ? 'text-green-600' : 'text-red-600'}`}>
          {status}
        </p>
      )}
    </div>
  );
}

