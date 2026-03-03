import { NextRequest, NextResponse } from "next/server";
import { getBridgeSupportedAssets } from "@/app/lib/bridge";

export async function GET(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;
    const assets = await getBridgeSupportedAssets(origin);
    return NextResponse.json({ supportedAssets: assets });
  } catch (error: any) {
    console.error("[API /bridge/supported-assets] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch supported assets" },
      { status: 500 },
    );
  }
}

