import { NextRequest, NextResponse } from 'next/server';
import { ACTIONS_CORS_HEADERS, ActionsJson } from '@solana/actions';

// GET endpoint - Returns actions.json mapping at root level
export async function GET(request: NextRequest) {
  const payload: ActionsJson = {
    rules: [
      {
        pathPattern: '/market/*',
        apiPath: '/api/actions/market/*',
      },
      {
        pathPattern: '/api/actions/**',
        apiPath: '/api/actions/**',
      },
    ],
  };

  return Response.json(payload, {
    headers: ACTIONS_CORS_HEADERS,
  });
}

// DO NOT FORGET TO INCLUDE THE `OPTIONS` HTTP METHOD
// THIS WILL ENSURE CORS WORKS FOR BLINKS
export const OPTIONS = GET;

