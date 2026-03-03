import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  createAuthErrorResponse,
  getAuthenticatedUser,
} from "@/app/lib/authMiddleware";
import { prisma } from "@/app/lib/db";
import { createWithdrawAddresses } from "@/app/lib/bridge";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const body = await request.json();
    const { toChainId, toTokenAddress, recipientAddress } = body;

    if (!toChainId || !toTokenAddress || !recipientAddress) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: toChainId, toTokenAddress, recipientAddress",
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { safeAddress: true },
    });

    if (!user?.safeAddress) {
      return NextResponse.json(
        {
          error:
            "Trading wallet not set up. Complete Polymarket onboarding before withdrawing.",
        },
        { status: 400 },
      );
    }

    const origin = request.nextUrl.origin;

    const withdrawAddresses = await createWithdrawAddresses({
      safeAddress: user.safeAddress,
      toChainId: String(toChainId),
      toTokenAddress,
      recipientAddress,
      origin,
    });

    return NextResponse.json(withdrawAddresses);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), {
        status: error.statusCode,
      });
    }
    console.error("[API /bridge/withdraw] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create withdraw addresses" },
      { status: 500 },
    );
  }
}

