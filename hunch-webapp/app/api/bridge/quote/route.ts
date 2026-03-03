import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  createAuthErrorResponse,
  getAuthenticatedUser,
} from "@/app/lib/authMiddleware";
import { getBridgeQuote } from "@/app/lib/bridge";

export async function POST(request: NextRequest) {
  try {
    await getAuthenticatedUser(request);

    const body = await request.json();
    const { amountUsd, toChainId, toTokenAddress, recipientAddress } = body;

    const parsedAmount =
      typeof amountUsd === "string" ? parseFloat(amountUsd) : amountUsd;

    if (
      !parsedAmount ||
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      return NextResponse.json(
        { error: "amountUsd must be a positive number" },
        { status: 400 },
      );
    }

    if (!toChainId || !toTokenAddress || !recipientAddress) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: toChainId, toTokenAddress, recipientAddress",
        },
        { status: 400 },
      );
    }

    const origin = request.nextUrl.origin;

    const quote = await getBridgeQuote({
      amountUsd: parsedAmount,
      toChainId: String(toChainId),
      toTokenAddress,
      recipientAddress,
      origin,
    });

    return NextResponse.json(quote);
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), {
        status: error.statusCode,
      });
    }
    console.error("[API /bridge/quote] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch bridge quote" },
      { status: 500 },
    );
  }
}

