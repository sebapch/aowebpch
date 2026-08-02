/* eslint-disable @next/next/no-img-element */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Crown, Flame, Trophy } from "lucide-react";
import { formatNumber } from "@/lib/number-format";
import type {
    RankingHeadSprite,
    RatingRankingEntry,
    RatingRankingPageData,
} from "@/lib/ranking";

type RankingViewProps = {
    entries: RatingRankingEntry[];
    headSpritesById: Record<string, RankingHeadSprite | null>;
};

type RankingClassFilter = "all" | number;

const classLabels: Record<number, string> = {
    1: "Mago",
    2: "Clerigo",
    3: "Guerrero",
    4: "Asesino",
    6: "Bardo",
    7: "Druida",
    8: "Paladin",
    9: "Cazador",
};

const raceLabels: Record<number, string> = {
    1: "Humano",
    2: "Elfo",
    3: "Elfo Drow",
    4: "Enano",
    5: "Gnomo",
};

const classFilterOptions = [
    { value: "all" as const, label: "Todos" },
    ...Object.entries(classLabels).map(([value, label]) => ({
        value: Number(value),
        label,
    })),
];

const eloTiers = [
    { min: 1750, label: "Maestro", color: "#e879f9" },
    { min: 1550, label: "Diamante", color: "#5ad4e6" },
    { min: 1350, label: "Platino", color: "#8fd6c4" },
    { min: 1150, label: "Oro", color: "#d4a359" },
    { min: 1000, label: "Plata", color: "#9ca3af" },
    { min: -Infinity, label: "Bronce", color: "#a1662f" },
] as const;

function getEloTier(rating: number) {
    return eloTiers.find((tier) => rating >= tier.min) ?? eloTiers[eloTiers.length - 1];
}

function getWinRate(entry: RatingRankingEntry) {
    if (entry.gamesPlayed <= 0) {
        return null;
    }

    return Math.round((entry.wins / entry.gamesPlayed) * 100);
}

type CharacterVisualMeta = {
    idClase: number;
    idRaza: number;
    faction: "none" | "armada" | "caos";
    criminal: boolean;
    clanName: string | null;
};

function getCharacterMeta(character: CharacterVisualMeta) {
    const classLabel =
        classLabels[character.idClase] ?? `Clase ${character.idClase}`;
    const raceLabel =
        raceLabels[character.idRaza] ?? `Raza ${character.idRaza}`;
    return `${classLabel} · ${raceLabel}`;
}

function getCharacterNameColor(character: CharacterVisualMeta) {
    void character;
    return "#808080";
}

function getClanTag(character: CharacterVisualMeta) {
    return character.clanName ? `<${character.clanName}>` : null;
}

function sortByRating(entries: RatingRankingEntry[]) {
    return [...entries].sort((left, right) => {
        if (right.rating !== left.rating) {
            return right.rating - left.rating;
        }

        if (right.wins !== left.wins) {
            return right.wins - left.wins;
        }

        return left.name.localeCompare(right.name, "es");
    });
}

function RankingHead({
    sprite,
    size,
    className,
}: {
    sprite: RankingHeadSprite | null;
    size: number;
    className?: string;
}) {
    if (!sprite) {
        return (
            <div
                className={`flex items-center justify-center rounded-[18px] border border-white/10 bg-black/20 text-[10px] uppercase tracking-[0.22em] text-stone-500 ${className ?? ""}`}
                style={{ width: size, height: size }}
            >
                N/A
            </div>
        );
    }

    return (
        <div
            className={`relative overflow-hidden rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),rgba(12,10,9,0.95)_58%),linear-gradient(180deg,rgba(120,53,15,0.16),rgba(12,10,9,0))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${className ?? ""}`}
            style={{ width: size, height: size }}
        >
            <div
                className="absolute overflow-hidden"
                style={{
                    left: 0,
                    top: 0,
                    width: size,
                    height: size,
                    imageRendering: "pixelated",
                }}
            >
                <img
                    src={`/graphics/${sprite.numFile}.png`}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute max-w-none select-none"
                    style={{
                        left: -sprite.sourceX,
                        top: -sprite.sourceY,
                        width: "auto",
                        height: "auto",
                        transform: `scale(${Math.max(size / sprite.width, size / sprite.height)})`,
                        transformOrigin: `${sprite.sourceX}px ${sprite.sourceY}px`,
                        imageRendering: "pixelated",
                    }}
                />
            </div>
        </div>
    );
}

const podiumIcons = [Crown, Trophy, Flame];
const podiumIconColors = ["#f2c14e", "#c7ccd6", "#d97a4d"];

export default function RankingView({
    entries: initialEntries,
    headSpritesById: initialHeads,
}: RankingViewProps) {
    const [classFilter, setClassFilter] = useState<RankingClassFilter>("all");
    const [entries, setEntries] = useState(initialEntries);
    const [heads, setHeads] = useState(initialHeads);
    const [isLoading, setIsLoading] = useState(false);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    useEffect(() => {
        if (!hasLoadedOnce) {
            setHasLoadedOnce(true);
            return;
        }

        const controller = new AbortController();
        setIsLoading(true);

        fetch(`/api/ranking/rating`, {
            signal: controller.signal,
            cache: "no-store",
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error("No se pudo cargar el ranking");
                }

                return (await response.json()) as RatingRankingPageData;
            })
            .then((result) => {
                setEntries(result.entries);
                setHeads(result.headSpritesById);
            })
            .catch((error) => {
                if (controller.signal.aborted) {
                    return;
                }

                console.error("No se pudo actualizar el ranking:", error);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const sortedEntries = useMemo(() => sortByRating(entries), [entries]);
    const filteredEntries = useMemo(
        () =>
            classFilter === "all"
                ? sortedEntries
                : sortedEntries.filter((entry) => entry.idClase === classFilter),
        [sortedEntries, classFilter],
    );
    const podium = filteredEntries.slice(0, 3);
    const rest = filteredEntries.slice(3);

    if (entries.length === 0 && !isLoading) {
        return (
            <main className="min-h-screen csao-bg px-4 py-12 text-slate-100">
                <div className="mx-auto max-w-4xl game-card p-8 text-center shadow-lg">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                        CSAO2
                    </span>
                    <h1 className="mt-2 text-2xl font-bold uppercase text-white">
                        Ranking ELO
                    </h1>
                    <p className="mt-4 text-slate-400 text-xs">
                        Todavia no hay partidas de arena registradas.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen csao-bg px-4 py-12 text-slate-100">
            <div className="mx-auto max-w-6xl space-y-8">
                <section>
                    <div className="mt-3 flex flex-col gap-4 border-b border-[#3d2719] pb-4 md:flex-row md:items-end md:justify-between">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                                Clasificación
                            </span>
                            <h1 className="text-2xl font-black uppercase tracking-wide text-white md:text-3xl">
                                Ranking ELO
                            </h1>
                            <p className="mt-2 max-w-2xl text-xs text-slate-400">
                                Un unico rating compartido entre 1v1, 2v2, 3v3 y 4v4. Todos los jugadores arrancan en 1200; ganar suma lo mismo que pierde el rival.
                            </p>
                        </div>

                        <div className="flex items-center gap-3 self-start md:self-auto">
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                Filtrar:
                            </span>
                            <select
                                value={String(classFilter)}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    setClassFilter(
                                        value === "all" ? "all" : Number(value),
                                    );
                                }}
                                className="rounded-xl border border-[#3d2719] bg-[#080b12] px-3 py-1 text-xs font-semibold text-slate-200 outline-none"
                            >
                                {classFilterOptions.map((option) => (
                                    <option
                                        key={String(option.value)}
                                        value={String(option.value)}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                {isLoading ? (
                    <p className="text-xs text-[#d4a359]">Cargando ranking...</p>
                ) : null}

                {podium.length === 0 ? (
                    <div className="game-card p-8 text-center text-xs text-slate-400 shadow-lg">
                        No hay personajes para el filtro seleccionado.
                    </div>
                ) : (
                    <>
                        <section className="grid gap-4 lg:grid-cols-3">
                            {podium.map((entry, index) => {
                                const Icon = podiumIcons[index] ?? Trophy;
                                const iconColor = podiumIconColors[index] ?? "#c7ccd6";
                                const tier = getEloTier(entry.rating);
                                const winRate = getWinRate(entry);

                                return (
                                    <article
                                        key={entry.characterId}
                                        className="relative overflow-hidden game-card p-5 shadow-lg space-y-3"
                                    >
                                        <div className="flex items-center gap-4">
                                            <RankingHead
                                                sprite={heads[String(entry.headId)] ?? null}
                                                size={72}
                                                className="shrink-0 rounded-xl border border-[#3d2719] bg-[#080b12]"
                                            />

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="inline-flex items-center gap-1 rounded bg-[#5c2b0e] border border-[#8c582d] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                                        <Icon
                                                            className="h-3 w-3"
                                                            style={{ color: iconColor }}
                                                        />
                                                        Top #{index + 1}
                                                    </span>
                                                    <span
                                                        className="text-[10px] font-bold uppercase tracking-wider"
                                                        style={{ color: tier.color }}
                                                    >
                                                        {tier.label}
                                                    </span>
                                                </div>

                                                <p
                                                    className="mt-2 truncate text-lg font-bold"
                                                    style={{
                                                        color: getCharacterNameColor(entry),
                                                    }}
                                                >
                                                    {entry.name}
                                                </p>
                                                {getClanTag(entry) ? (
                                                    <p className="truncate text-xs text-[#d4a359] font-semibold">
                                                        {getClanTag(entry)}
                                                    </p>
                                                ) : null}
                                                <p className="mt-1 text-xs text-slate-400">
                                                    {getCharacterMeta(entry)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-2 border-t border-[#2d1d12]">
                                            <span className="text-2xl font-black text-[#d4a359]">
                                                {formatNumber(entry.rating)}
                                            </span>
                                            <span className="text-xs font-bold text-slate-200">
                                                <span className="text-[#2bb3e5]">{entry.wins}V</span>
                                                {" / "}
                                                <span className="text-[#d94125]">{entry.losses}D</span>
                                                {winRate !== null ? (
                                                    <span className="ml-1 text-slate-400">
                                                        ({winRate}%)
                                                    </span>
                                                ) : null}
                                            </span>
                                        </div>
                                    </article>
                                );
                            })}
                        </section>

                        <section className="game-card p-5 shadow-lg md:p-6">
                            <div className="border-b border-[#3d2719] pb-4">
                                <h2 className="text-lg font-bold uppercase tracking-wider text-white">
                                    Tabla de Posiciones
                                </h2>
                            </div>

                            <div className="mt-6 overflow-x-auto rounded-xl border border-[#3d2719] bg-[#080b12]">
                                <div className="min-w-[760px]">
                                    <div className="grid grid-cols-[64px_minmax(0,1.9fr)_120px_140px_120px] gap-3 border-b border-[#3d2719] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[#d4a359] md:px-6">
                                        <span>#</span>
                                        <span>Jugador</span>
                                        <span>Rating</span>
                                        <span>Victorias / Derrotas</span>
                                        <span>Partidas</span>
                                    </div>

                                    <div>
                                        {rest.map((entry, index) => {
                                            const tier = getEloTier(entry.rating);

                                            return (
                                                <div
                                                    key={entry.characterId}
                                                    className="grid grid-cols-[64px_minmax(0,1.9fr)_120px_140px_120px] items-center gap-3 border-b border-[#2d1d12] px-4 py-3.5 last:border-b-0 hover:bg-[#0e1320] transition md:px-6"
                                                >
                                                    <div className="text-sm font-bold text-slate-400">
                                                        #{index + 4}
                                                    </div>

                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <RankingHead
                                                            sprite={heads[String(entry.headId)] ?? null}
                                                            size={48}
                                                            className="shrink-0 rounded-lg border border-[#3d2719]"
                                                        />

                                                        <div className="min-w-0 flex-1">
                                                            <p
                                                                className="truncate text-sm font-bold"
                                                                style={{
                                                                    color: getCharacterNameColor(entry),
                                                                }}
                                                            >
                                                                {entry.name}
                                                            </p>
                                                            {getClanTag(entry) ? (
                                                                <p className="truncate text-xs font-semibold text-[#d4a359]">
                                                                    {getClanTag(entry)}
                                                                </p>
                                                            ) : null}
                                                            <p className="truncate text-xs text-slate-400">
                                                                {getCharacterMeta(entry)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-sm font-bold text-[#d4a359]">
                                                            {formatNumber(entry.rating)}
                                                        </span>
                                                        <span
                                                            className="text-[10px] font-bold uppercase tracking-wider"
                                                            style={{ color: tier.color }}
                                                        >
                                                            {tier.label}
                                                        </span>
                                                    </div>

                                                    <div className="text-xs font-bold text-slate-200">
                                                        <span className="text-[#2bb3e5]">{entry.wins}V</span>
                                                        {" / "}
                                                        <span className="text-[#d94125]">{entry.losses}D</span>
                                                    </div>

                                                    <div className="text-xs font-bold text-slate-400">
                                                        {formatNumber(entry.gamesPlayed)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </main>
    );
}
