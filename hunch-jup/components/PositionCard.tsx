import { Theme } from '@/constants/theme';
import { getEventDetails } from "@/lib/api";
import { AggregatedPosition } from "@/lib/types";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const defaultProfileImage = require("@/assets/default.jpeg");

const formatCurrency = (value: number | null | undefined, fractionDigits = 2) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `$${value.toFixed(fractionDigits)}`;
};

const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `${value.toFixed(1)}%`;
};

const formatOpenedAt = (trades: { createdAt: string }[]): string => {
    if (!trades?.length) return '';
    const createdDates = trades.map((t) => new Date(t.createdAt).getTime());
    const earliest = new Date(Math.min(...createdDates));
    const now = new Date();
    const sameDay = earliest.toDateString() === now.toDateString();
    if (sameDay) {
        return earliest.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (earliest.toDateString() === yesterday.toDateString()) {
        return `Yesterday ${earliest.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    }
    return earliest.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

interface PositionCardProps {
    position: AggregatedPosition;
    isPrevious?: boolean;
    onPress: () => void;
    /** Pre-fetched event title; avoids per-card API call when provided */
    eventTitle?: string | null;
}

export default function PositionCard({
    position,
    isPrevious = false,
    onPress,
    eventTitle: propEventTitle,
}: PositionCardProps) {
    const isYes = position.side === 'yes';
    const marketTitle = position.market?.title || position.marketTicker;
    const subtitle = isYes ? position.market?.yesSubTitle : position.market?.noSubTitle;
    const pnlValue = position.totalPnL ?? position.profitLoss ?? position.unrealizedPnL ?? position.realizedPnL ?? null;
    const pnlPercent = position.profitLossPercentage ?? (
        pnlValue !== null && position.totalCostBasis > 0
            ? (pnlValue / position.totalCostBasis) * 100
            : null
    );
    const pnlColor = pnlValue !== null ? (pnlValue >= 0 ? '#32de12' : '#FF10F0') : Theme.textDisabled;
    const pnlText = pnlValue !== null
        ? `${pnlValue >= 0 ? '+' : '-'}${formatCurrency(Math.abs(pnlValue))}`
        : '—';
    const openedAt = formatOpenedAt(position.trades || []);

    const [fetchedEventTitle, setFetchedEventTitle] = useState<string | null>(null);
    const eventTitle = propEventTitle ?? fetchedEventTitle;

    useEffect(() => {
        if (propEventTitle != null || !position.eventTicker) return;
        getEventDetails(position.eventTicker).then(event => {
            if (event) setFetchedEventTitle(event.title);
        }).catch(() => {});
    }, [position.eventTicker, propEventTitle]);

    return (
        <TouchableOpacity
            className="px-4 py-4"
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View className="rounded-2xl p-4 overflow-hidden relative" style={{ backgroundColor: '#F5F5F5' }}>
                <View className="flex-row justify-between items-start gap-3 mb-2">
                    <Text className="text-xl font-bold flex-1" numberOfLines={1}>
                        {formatCurrency(position.totalCostBasis)}{" "}
                    <Text
                        className={isYes ? "text-[#32de12] text-2xl font-extrabold" : "text-[#FF10F0] text-2xl font-extrabold"}
                        style={{ fontFamily: 'BBHSansHegarty' }}
                    >
                        {isYes ? 'YES' : 'NO'}
                        </Text>{" "}
                        on {subtitle || position.market?.subtitle}
                    </Text>
                    {openedAt ? (
                        <Text className="text-xs text-txt-disabled shrink-0">
                            {openedAt}
                        </Text>
                    ) : null}
                </View>
                <View className="flex-row items-center gap-3 mb-3">
                    <View className="w-12 h-12 rounded-xl overflow-hidden border border-border bg-app-elevated">
                        <Image
                            source={position.eventImageUrl ? { uri: position.eventImageUrl } : defaultProfileImage}
                            className="w-full h-full"
                        />
                    </View>
                    <View className="flex-1">
                        <Text className="text-base font-medium text-txt-primary" numberOfLines={2}>
                            {eventTitle || marketTitle}
                        </Text>
                    </View>

                </View>

                <View className="flex-row items-start justify-between">

                    {!isPrevious && (
                        <View className="flex-1">
                            <Text className="text-[11px] text-txt-disabled uppercase">Value</Text>
                            <Text className="text-base font-semibold text-txt-primary">
                                {formatCurrency(position.currentValue)}
                            </Text>
                        </View>
                    )}
                    <View className="flex-1 items-end">
                        <Text className="text-[11px] text-txt-disabled uppercase">PnL</Text>
                        <Text className="text-base font-semibold" style={{ color: pnlColor }}>
                            {pnlText}
                        </Text>
                        <Text className="text-[11px] font-medium" style={{ color: pnlColor }}>
                            {pnlPercent === null ? '—' : `${pnlPercent >= 0 ? '+' : ''}${formatPercent(pnlPercent)}`}
                        </Text>
                    </View>
                </View>

            </View>
        </TouchableOpacity>
    );
}
