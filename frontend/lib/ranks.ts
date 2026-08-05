export type RankTierKey =
    | "bronce"
    | "plata"
    | "oro"
    | "platino"
    | "diamante"
    | "maestro";

export type RankTierInfo = {
    key: RankTierKey;
    name: string;
    minElo: number;
    maxElo: number; // Infinity for top rank
    badgeColor: string; // Tailwind/HEX gradient colors
    borderColor: string;
    textColor: string;
    hexColor: string; // plain hex equivalent of textColor, for inline styles / canvas
    glowColor: string;
    iconSymbol: string;
};

export const RANK_TIERS: RankTierInfo[] = [
    {
        key: "bronce",
        name: "Bronce",
        minElo: 0,
        maxElo: 1249,
        badgeColor: "from-[#8C5338] via-[#B86F45] to-[#6E3C23]",
        borderColor: "border-[#b86f45]/60",
        textColor: "text-[#e8b598]",
        hexColor: "#e8b598",
        glowColor: "rgba(184, 111, 69, 0.3)",
        iconSymbol: "🥉",
    },
    {
        key: "plata",
        name: "Plata",
        minElo: 1250,
        maxElo: 1299,
        badgeColor: "from-[#71717A] via-[#A1A1AA] to-[#52525B]",
        borderColor: "border-zinc-400/60",
        textColor: "text-zinc-200",
        hexColor: "#e4e4e7",
        glowColor: "rgba(161, 161, 170, 0.35)",
        iconSymbol: "🥈",
    },
    {
        key: "oro",
        name: "Oro",
        minElo: 1300,
        maxElo: 1349,
        badgeColor: "from-[#B45309] via-[#F59E0B] to-[#78350F]",
        borderColor: "border-amber-400/70",
        textColor: "text-amber-200",
        hexColor: "#fde68a",
        glowColor: "rgba(245, 158, 11, 0.4)",
        iconSymbol: "🥇",
    },
    {
        key: "platino",
        name: "Platino",
        minElo: 1350,
        maxElo: 1399,
        badgeColor: "from-[#0369A1] via-[#38BDF8] to-[#075985]",
        borderColor: "border-sky-400/70",
        textColor: "text-sky-200",
        hexColor: "#bae6fd",
        glowColor: "rgba(56, 189, 248, 0.45)",
        iconSymbol: "💎",
    },
    {
        key: "diamante",
        name: "Diamante",
        minElo: 1400,
        maxElo: 1449,
        badgeColor: "from-[#6D28D9] via-[#A855F7] to-[#4C1D95]",
        borderColor: "border-purple-400/70",
        textColor: "text-purple-200",
        hexColor: "#e9d5ff",
        glowColor: "rgba(168, 85, 247, 0.5)",
        iconSymbol: "👑",
    },
    {
        key: "maestro",
        name: "Maestro",
        minElo: 1450,
        maxElo: Infinity,
        badgeColor: "from-[#BE123C] via-[#F43F5E] to-[#881337]",
        borderColor: "border-rose-400/80",
        textColor: "text-rose-200",
        hexColor: "#fecdd3",
        glowColor: "rgba(244, 63, 94, 0.6)",
        iconSymbol: "🔥",
    },
];

export type RankDetails = {
    tier: RankTierInfo;
    division: string;
    currentElo: number;
    nextTierElo: number | null;
    eloInTier: number;
    tierRange: number;
    progressPercent: number;
};

/**
 * Calculates current rank tier and percentage progress to next tier.
 */
export function getRankDetails(elo: number = 1200): RankDetails {
    const safeElo = Math.max(0, Math.round(elo));

    // Find current tier
    const tier =
        RANK_TIERS.find(
            (t) => safeElo >= t.minElo && safeElo <= t.maxElo,
        ) ?? RANK_TIERS[0];

    let nextTierElo: number | null = tier.maxElo + 1;
    let effectiveMin = tier.minElo;
    let eloInTier = Math.max(0, safeElo - effectiveMin);
    let tierRange = tier.maxElo - tier.minElo + 1;
    let progressPercent = 0;

    if (tier.key === "maestro") {
        nextTierElo = null;
        progressPercent = 100;
    } else {
        progressPercent = Math.min(
            100,
            Math.max(0, Math.round((eloInTier / tierRange) * 100)),
        );
    }

    return {
        tier,
        division: "",
        currentElo: safeElo,
        nextTierElo,
        eloInTier,
        tierRange,
        progressPercent,
    };
}
