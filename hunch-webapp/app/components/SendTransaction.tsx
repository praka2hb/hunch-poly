'use client';

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

export default function SendTransaction() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  // Fetch balance when wallet connects
  useEffect(() => {
    if (publicKey && connection) {
      const fetchBalance = async () => {
        try {
          const bal = await connection.getBalance(publicKey);
          setBalance(bal);
        } catch (error) {
          console.error('Error fetching balance:', error);
        }
      };
      fetchBalance();
      // Refresh balance every 5 seconds
      const interval = setInterval(fetchBalance, 5000);
      return () => clearInterval(interval);
    } else {
      setBalance(null);
    }
  }, [publicKey, connection]);

  const handleSendTransaction = async () => {
    if (!publicKey || !sendTransaction) {
      setStatus('Please connect your wallet first');
      return;
    }

    if (!recipientAddress) {
      setStatus('Please enter a recipient address');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setStatus('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setStatus('');

    try {
      // Validate recipient address
      let recipientPubkey: PublicKey;
      try {
        recipientPubkey = new PublicKey(recipientAddress);
      } catch (error) {
        setStatus('❌ Invalid recipient address');
        setLoading(false);
        return;
      }

      // Check balance (use current balance state or fetch fresh)
      const currentBalance = balance !== null ? balance : await connection.getBalance(publicKey);
      const amountInLamports = parseFloat(amount) * LAMPORTS_PER_SOL;

      if (currentBalance < amountInLamports) {
        setStatus(`❌ Insufficient balance. You have ${(currentBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
        setLoading(false);
        return;
      }

      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipientPubkey,
          lamports: amountInLamports,
        })
      );

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Send transaction
      setStatus('Sending transaction...');
      const signature = await sendTransaction(transaction, connection);

      // Confirm transaction
      setStatus('Confirming transaction...');
      await connection.confirmTransaction(
        {
          blockhash,
          lastValidBlockHeight,
          signature,
        },
        'confirmed'
      );

      setStatus(`✅ Transaction sent successfully! Signature: ${signature}`);
      setRecipientAddress('');
      setAmount('');
    } catch (error: any) {
      setStatus(`❌ Error: ${error.message}`);
      console.error('Send transaction error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
        Send Transaction
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        Send SOL to another wallet address on the Solana network.
      </p>
      {publicKey && balance !== null && (
        <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <p className="text-sm text-gray-600 dark:text-gray-400">Your Balance:</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">
            {(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL
          </p>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Recipient Address
          </label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="Enter Solana wallet address"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-white focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Amount (SOL)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            step="0.0001"
            min="0"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-white focus:border-transparent"
          />
        </div>
        <button
          onClick={handleSendTransaction}
          disabled={!publicKey || !sendTransaction || loading}
          className="w-full px-4 py-2 bg-white text-white rounded-lg hover:bg-white-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Processing...' : 'Send Transaction'}
        </button>
        {status && (
          <p className={`text-sm ${status.includes('✅') ? 'text-green-600' : status.includes('❌') ? 'text-red-600' : 'text-blue-600'}`}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

