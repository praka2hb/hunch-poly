import { NextRequest, NextResponse } from 'next/server';
import { getTopTraders } from '@/app/lib/userService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const excludeUserId = searchParams.get('excludeUserId') || undefined;

    const users = await getTopTraders(limit, excludeUserId);
    
    return NextResponse.json(users, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching suggested users:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch suggested users' },
      { status: 500 }
    );
  }
}

