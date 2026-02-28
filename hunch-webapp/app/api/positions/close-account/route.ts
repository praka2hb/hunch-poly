import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createBurnInstruction,
  createCloseAccountInstruction,
} from '@solana/spl-token';

/**
 * POST /api/positions/close-account
 *
 * Builds a transaction to burn any remaining outcome tokens and then
 * close the token account to reclaim the rent-exempt lamports.
 *
 * From the dFlow docs:
 *   "A token account must be empty to close.
 *    If it still has a balance, burn the remaining outcome tokens
 *    and then close the account to reclaim rent."
 *
 * Body:
 *   walletAddress      - user's Solana public key
 *   tokenAccountAddress- the ATA to burn+close  (base-58)
 *   mint               - outcome token mint      (base-58)
 *   rawBalance         - token amount in smallest unit (string)
 *
 * Returns { transaction: <base64>, message }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, tokenAccountAddress, mint, rawBalance } = body;

    if (!walletAddress || !tokenAccountAddress || !mint) {
      return NextResponse.json(
        { error: 'walletAddress, tokenAccountAddress, and mint are required' },
        { status: 400 }
      );
    }

    const owner = new PublicKey(walletAddress);
    const tokenAccount = new PublicKey(tokenAccountAddress);
    const mintPubkey = new PublicKey(mint);
    const balance = BigInt(rawBalance || '0');

    const rpcUrl =
      process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const tx = new Transaction();

    // If there is remaining balance, burn it first
    if (balance > BigInt(0)) {
      tx.add(
        createBurnInstruction(
          tokenAccount,   // account holding tokens
          mintPubkey,      // token mint
          owner,           // authority
          balance,         // amount to burn
          [],              // multi-signers
          TOKEN_2022_PROGRAM_ID
        )
      );
    }

    // Close the (now-empty) token account – rent goes back to the owner
    tx.add(
      createCloseAccountInstruction(
        tokenAccount,   // account to close
        owner,          // destination for rent lamports
        owner,          // authority
        [],             // multi-signers
        TOKEN_2022_PROGRAM_ID
      )
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = owner;

    const serialised = tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64');

    return NextResponse.json(
      {
        transaction: serialised,
        message: balance > BigInt(0)
          ? 'Burn remaining tokens and close account to reclaim rent'
          : 'Close empty token account to reclaim rent',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[CloseAccount] Error building transaction:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to build close transaction' },
      { status: 500 }
    );
  }
}
