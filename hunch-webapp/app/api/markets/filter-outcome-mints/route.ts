import { NextRequest, NextResponse } from 'next/server';
import { filterOutcomeMints } from '@/app/lib/api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mints } = body;

    if (!mints || !Array.isArray(mints) || mints.length === 0) {
      return NextResponse.json(
        { outcomeMints: [] },
        { status: 200 }
      );
    }

    const outcomeMints = await filterOutcomeMints(mints);

    return NextResponse.json(
      { outcomeMints },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in filter-outcome-mints API:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
