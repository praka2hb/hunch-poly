import { NextRequest, NextResponse } from 'next/server';
import { getUserByWalletAddress, searchUsers } from '@/app/lib/userService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const walletAddress = searchParams.get('walletAddress');
    const searchType = searchParams.get('type'); // 'displayName' or 'walletAddress'

    // If walletAddress is provided, search by exact wallet address
    if (walletAddress) {
      const user = await getUserByWalletAddress(walletAddress);
      if (user) {
        return NextResponse.json([user], { status: 200 });
      }
      return NextResponse.json([], { status: 200 });
    }

    // If query is provided, search by display name or wallet address
    if (query) {
      // Use searchUsers which searches both displayName and walletAddress
      const users = await searchUsers(query, 10);
      
      // If searchType is specified, filter results
      if (searchType === 'displayName') {
        // Filter to only show results matching displayName
        const filtered = users.filter(user => 
          user.displayName && user.displayName.toLowerCase().includes(query.toLowerCase())
        );
        return NextResponse.json(filtered, { status: 200 });
      } else if (searchType === 'walletAddress') {
        // Filter to only show results matching walletAddress
        const filtered = users.filter(user => 
          user.walletAddress.toLowerCase().includes(query.toLowerCase())
        );
        return NextResponse.json(filtered, { status: 200 });
      }
      
      // Default: return all matching results
      return NextResponse.json(users, { status: 200 });
    }

    return NextResponse.json(
      { error: 'Either "q" or "walletAddress" query parameter is required' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('Error searching users:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search users' },
      { status: 500 }
    );
  }
}

