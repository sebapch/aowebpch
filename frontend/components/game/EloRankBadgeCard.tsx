"use client";

import React from "react";
import { getRankDetails } from "@/lib/ranks";
import { formatNumber } from "@/lib/number-format";

type EloRankBadgeCardProps = {
    rating?: number;
    wins?: number;
    losses?: number;
    className?: string;
};

export const EloRankBadgeCard: React.FC<EloRankBadgeCardProps> = ({
    rating = 1200,
    wins = 0,
    losses = 0,
    className = "",
}) => {
    const rank = getRankDetails(rating);
    const totalGames = wins + losses;
    const winRate =
        totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

    return (
        <div
            className={`relative flex flex-col justify-between overflow-hidden rounded-[16px] border bg-[#140c09]/95 p-2.5 transition-all duration-300 ${rank.tier.borderColor} shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${className}`}
            style={{
                boxShadow: `0 4px 20px -2px ${rank.tier.glowColor}, inset 0 1px 0 rgba(255, 214, 170, 0.08)`,
            }}
        >
            {/* Background subtle sheen */}
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/5 blur-xl" />

            {/* Header: Badge Name, Stats & ELO */}
            <div className="flex items-center justify-between gap-2">
                {/* Badge Emblem & Name */}
                <div className="flex items-center gap-2">
                    <div
                        className={`flex h-8 w-8 items-center justify-center rounded-xl bg-linear-to-br ${rank.tier.badgeColor} text-base shadow-sm ring-1 ring-white/20`}
                    >
                        <span>{rank.tier.iconSymbol}</span>
                    </div>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <span
                                className={`text-xs font-extrabold uppercase tracking-wide ${rank.tier.textColor}`}
                            >
                                {rank.tier.name}
                            </span>
                        </div>
                        <p className="text-[10px] text-stone-400">
                            {wins}V - {losses}D ({winRate}% WR)
                        </p>
                    </div>
                </div>

                {/* ELO Display */}
                <div className="flex flex-col items-end justify-center">
                    <div className="flex items-center gap-1">
                        <span className="text-sm font-black tracking-tight text-amber-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                            {formatNumber(rank.currentElo)}
                        </span>
                        <span className="text-[10px] font-bold text-amber-400/80">
                            ELO
                        </span>
                    </div>
                </div>
            </div>

            {/* Progress Bar to Next Tier */}
            <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-center justify-between text-[9px] font-semibold text-stone-400">
                    <span>Progreso de Rango</span>
                    <span>
                        {rank.nextTierElo !== null
                            ? `${rank.progressPercent}%`
                            : "Rango Máximo"}
                    </span>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full border border-amber-900/40 bg-black/60 p-[1px]">
                    <div
                        className={`h-full rounded-full bg-linear-to-r ${rank.tier.badgeColor} transition-all duration-500`}
                        style={{ width: `${rank.progressPercent}%` }}
                    />
                </div>
            </div>
        </div>
    );
};
