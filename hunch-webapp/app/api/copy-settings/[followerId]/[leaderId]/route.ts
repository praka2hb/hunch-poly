import { NextRequest, NextResponse } from 'next/server';
import { updateCopySettings, toggleCopyEnabled } from '@/app/lib/copySettingsService';

// PATCH - Update copy settings or toggle enabled status
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ followerId: string; leaderId: string }> }
) {
    try {
        const { followerId, leaderId } = await params;
        const body = await request.json();
        const { action, amountPerTrade, maxTotalAmount, enabled, expiresAt } = body;

        console.log('PATCH /api/copy-settings/[followerId]/[leaderId] - Params:', { followerId, leaderId, action });

        if (!followerId || !leaderId) {
            return NextResponse.json(
                { error: 'followerId and leaderId are required' },
                { status: 400 }
            );
        }

        // If action is 'toggle', toggle the enabled status
        if (action === 'toggle') {
            const copySettings = await toggleCopyEnabled(followerId, leaderId);
            console.log('PATCH /api/copy-settings - Toggled enabled:', !copySettings.enabled);
            return NextResponse.json(copySettings, { status: 200 });
        }

        // Otherwise, update specific fields
        const updates: {
            amountPerTrade?: number;
            maxTotalAmount?: number;
            enabled?: boolean;
            expiresAt?: Date | null;
        } = {};

        if (typeof amountPerTrade === 'number') updates.amountPerTrade = amountPerTrade;
        if (typeof maxTotalAmount === 'number') updates.maxTotalAmount = maxTotalAmount;
        if (typeof enabled === 'boolean') updates.enabled = enabled;
        if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;

        const copySettings = await updateCopySettings(followerId, leaderId, updates);
        console.log('PATCH /api/copy-settings - Updated:', copySettings.id);
        return NextResponse.json(copySettings, { status: 200 });
    } catch (error: any) {
        console.error('Error updating copy settings:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update copy settings' },
            { status: 500 }
        );
    }
}
