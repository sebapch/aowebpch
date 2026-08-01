/* eslint-disable @next/next/no-img-element */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Flame, Trophy } from "lucide-react";
import { formatNumber } from "@/lib/number-format";
import type {
    RankingCharacter,
    RankingHeadSprite,
    RankingPageData,
    RatingRankingEntry,
    RatingRankingPageData,
    RatingTeamSize,
} from "@/lib/ranking";

type RankingViewProps = {
    characters: RankingCharacter[];
    headSpritesById: Record<string, RankingHeadSprite | null>;
};

type RankingSortKey = "level" | "kills";
type RankingClassFilter = "all" | number;
type RankingViewMode = "general" | RatingTeamSize;

const viewModeOptions: Array<{ key: RankingViewMode; label: string }> = [
    { key: "general", label: "General" },
    { key: 2, label: "2v2" },
    { key: 3, label: "3v3" },
    { key: 4, label: "4v4" },
];

const MAX_LEVEL = 50;

const sortOptions: Array<{ key: RankingSortKey; label: string }> = [
    { key: "level", label: "Nivel" },
    { key: "kills", label: "Kills" },
];

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

const factionColors = {
    armada: "#00AFFF",
    caos: "#9B0000",
} as const;

const classFilterOptions = [
    { value: "all" as const, label: "Todos" },
    ...Object.entries(classLabels).map(([value, label]) => ({
        value: Number(value),
        label,
    })),
];

function getMetricLabel(character: RankingCharacter, sortKey: RankingSortKey) {
    return sortKey === "level"
        ? isMaxLevelCharacter(character)
            ? `Nivel ${formatNumber(character.level)}`
            : `Nivel ${formatNumber(character.level)} (${formatExperiencePercent(character)})`
        : `${formatNumber(character.kills)} kills`;
}

function isMaxLevelCharacter(character: RankingCharacter) {
    return character.level >= MAX_LEVEL;
}

function getExperiencePercent(character: RankingCharacter) {
    if (character.expNextLevel <= 0) {
        return 0;
    }

    return Math.max(
        0,
        Math.min(100, (character.exp / character.expNextLevel) * 100),
    );
}

function formatExperiencePercent(character: RankingCharacter) {
    return `${Math.round(getExperiencePercent(character))}%`;
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
    if (character.faction === "armada") {
        return factionColors.armada;
    }

    if (character.faction === "caos") {
        return factionColors.caos;
    }

    return character.criminal ? "red" : "#3333ff";
}

function getClanTag(character: CharacterVisualMeta) {
    return character.clanName ? `<${character.clanName}>` : null;
}

function formatUpdatedAt(value: string) {
    return new Intl.DateTimeFormat("es-AR", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function sortCharacters(
    characters: RankingCharacter[],
    sortKey: RankingSortKey,
) {
    return [...characters].sort((left, right) => {
        const metricDelta = right[sortKey] - left[sortKey];

        if (metricDelta !== 0) {
            return metricDelta;
        }

        if (right.level !== left.level) {
            return right.level - left.level;
        }

        if (right.exp !== left.exp) {
            return right.exp - left.exp;
        }

        if (right.kills !== left.kills) {
            return right.kills - left.kills;
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

export default function RankingView({
    characters,
    headSpritesById,
}: RankingViewProps) {
    const [viewMode, setViewMode] = useState<RankingViewMode>("general");
    const [sortKey, setSortKey] = useState<RankingSortKey>("level");
    const [classFilter, setClassFilter] = useState<RankingClassFilter>("all");
    const [rankingCharacters, setRankingCharacters] = useState(characters);
    const [rankingHeads, setRankingHeads] = useState(headSpritesById);
    const [isLoading, setIsLoading] = useState(false);
    const [ratingEntries, setRatingEntries] = useState<RatingRankingEntry[]>([]);
    const [ratingHeads, setRatingHeads] = useState<
        Record<string, RankingHeadSprite | null>
    >({});
    const [isRatingLoading, setIsRatingLoading] = useState(false);
    const hasLoadedInitialDataRef = useRef(false);

    useEffect(() => {
        if (viewMode !== "general") {
            return;
        }

        if (!hasLoadedInitialDataRef.current) {
            hasLoadedInitialDataRef.current = true;
            return;
        }

        const controller = new AbortController();
        const query = new URLSearchParams({ sort: sortKey });

        if (classFilter !== "all") {
            query.set("classId", String(classFilter));
        }

        setIsLoading(true);
        setRankingCharacters([]);
        setRankingHeads({});

        fetch(`/api/ranking?${query.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error("No se pudo cargar el ranking");
                }

                return (await response.json()) as RankingPageData;
            })
            .then((result) => {
                setRankingCharacters(result.characters);
                setRankingHeads(result.headSpritesById);
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
    }, [sortKey, classFilter, viewMode]);

    useEffect(() => {
        if (viewMode === "general") {
            return;
        }

        const controller = new AbortController();
        const query = new URLSearchParams({ teamSize: String(viewMode) });

        setIsRatingLoading(true);
        setRatingEntries([]);
        setRatingHeads({});

        fetch(`/api/ranking/rating?${query.toString()}`, {
            signal: controller.signal,
            cache: "no-store",
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error("No se pudo cargar el ranking de rating");
                }

                return (await response.json()) as RatingRankingPageData;
            })
            .then((result) => {
                setRatingEntries(result.entries);
                setRatingHeads(result.headSpritesById);
            })
            .catch((error) => {
                if (controller.signal.aborted) {
                    return;
                }

                console.error("No se pudo actualizar el ranking de rating:", error);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsRatingLoading(false);
                }
            });

        return () => controller.abort();
    }, [viewMode]);

    const sortedCharacters = useMemo(
        () => sortCharacters(rankingCharacters, sortKey),
        [rankingCharacters, sortKey],
    );
    const podium = sortedCharacters.slice(0, 3);
    const latestUpdatedAt = useMemo(() => {
        if (rankingCharacters.length === 0) {
            return null;
        }

        return rankingCharacters.reduce((latest, character) =>
            new Date(character.updatedAt).getTime() >
            new Date(latest.updatedAt).getTime()
                ? character
                : latest,
        ).updatedAt;
    }, [rankingCharacters]);

    if (
        characters.length === 0 &&
        rankingCharacters.length === 0 &&
        !isLoading
    ) {
        return (
            <main className="min-h-screen csao-bg px-4 py-12 text-slate-100">
                <div className="mx-auto max-w-4xl game-card p-8 text-center shadow-lg">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                        CSAO2
                    </span>
                    <h1 className="mt-2 text-2xl font-bold uppercase text-white">
                        Ranking Global
                    </h1>
                    <p className="mt-4 text-slate-400 text-xs">
                        No hay personajes registrados en la tabla de posiciones actualmente.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen csao-bg px-4 py-12 text-slate-100">
            <div className="mx-auto max-w-6xl space-y-8">
                <section>
                    <div className="mt-3 flex flex-col gap-4 border-b border-[#3d2719] pb-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                                Clasificación
                            </span>
                            <h1 className="text-2xl font-black uppercase tracking-wide text-white md:text-3xl">
                                Ranking Global
                            </h1>
                        </div>

                        <div className="inline-flex self-start rounded-xl border border-[#3d2719] bg-[#080b12] p-1 md:self-auto">
                            {viewModeOptions.map((option) => (
                                <button
                                    key={String(option.key)}
                                    type="button"
                                    onClick={() => setViewMode(option.key)}
                                    className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wider transition ${
                                        viewMode === option.key
                                            ? "game-btn-bronze shadow-sm"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                {viewMode !== "general" ? (
                    <RatingRankingTable
                        teamSize={viewMode}
                        entries={ratingEntries}
                        headSpritesById={ratingHeads}
                        isLoading={isRatingLoading}
                    />
                ) : (
                <>
                <section className="grid gap-4 lg:grid-cols-3">
                    {podium.map((character, index) => {
                        return (
                            <article
                                key={character.id}
                                className="relative overflow-hidden game-card p-5 shadow-lg space-y-3"
                            >
                                <div className="flex items-center gap-4">
                                    <RankingHead
                                        sprite={
                                            rankingHeads[
                                                String(character.headId)
                                            ] ?? null
                                        }
                                        size={72}
                                        className="shrink-0 rounded-xl border border-[#3d2719] bg-[#080b12]"
                                    />

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                            <span className="inline-block rounded bg-[#5c2b0e] border border-[#8c582d] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                                Top #{index + 1}
                                            </span>
                                            <span className="game-badge-circle h-7 w-7 text-xs">
                                                {character.level}
                                            </span>
                                        </div>

                                        <p
                                            className="mt-2 truncate text-lg font-bold"
                                            style={{
                                                color: getCharacterNameColor(
                                                    character,
                                                ),
                                            }}
                                        >
                                            {character.name}
                                        </p>
                                        {getClanTag(character) ? (
                                            <p className="truncate text-xs text-[#d4a359] font-semibold">
                                                {getClanTag(character)}
                                            </p>
                                        ) : null}
                                        <p className="mt-1 text-sm font-semibold text-slate-200">
                                            {getMetricLabel(character, sortKey)}
                                        </p>
                                    </div>
                                </div>

                                {/* Mini HP/MP bar decoration */}
                                <div className="space-y-1.5 pt-2 border-t border-[#2d1d12]">
                                    <div className="h-1.5 w-full rounded-full bg-[#080b12] border border-[#3d2719] overflow-hidden">
                                        <div className="h-full w-full bg-[#d94125] rounded-full" />
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-[#080b12] border border-[#3d2719] overflow-hidden">
                                        <div className="h-full w-full bg-[#2bb3e5] rounded-full" />
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </section>

                <section className="game-card p-5 shadow-lg md:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-[#3d2719] pb-4">
                        <div>
                            <h2 className="text-lg font-bold uppercase tracking-wider text-white">
                                Tabla de Posiciones
                            </h2>
                            {latestUpdatedAt ? (
                                <p className="mt-1 text-xs text-slate-400">
                                    Actualizado: {formatUpdatedAt(latestUpdatedAt)}
                                </p>
                            ) : null}
                        </div>

                        <div className="flex flex-col gap-3 self-start md:self-auto">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                    Ordenar:
                                </span>
                                <div className="inline-flex rounded-xl border border-[#3d2719] bg-[#080b12] p-1">
                                    {sortOptions.map((option) => (
                                        <button
                                            key={option.key}
                                            type="button"
                                            onClick={() =>
                                                setSortKey(option.key)
                                            }
                                            className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wider transition ${
                                                sortKey === option.key
                                                    ? "game-btn-bronze shadow-sm"
                                                    : "text-slate-400 hover:text-slate-200"
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                    Filtrar:
                                </span>
                                <select
                                    value={String(classFilter)}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setClassFilter(
                                            value === "all"
                                                ? "all"
                                                : Number(value),
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
                    </div>

                    {isLoading ? (
                        <p className="mt-4 text-xs text-[#d4a359]">
                            Cargando ranking...
                        </p>
                    ) : null}

                    <div className="mt-6 overflow-x-auto rounded-xl border border-[#3d2719] bg-[#080b12]">
                        <div className="min-w-[720px]">
                            <div className="grid grid-cols-[64px_minmax(0,1.9fr)_160px_120px] gap-3 border-b border-[#3d2719] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[#d4a359] md:px-6">
                                <span>#</span>
                                <span>Jugador</span>
                                <span>Nivel</span>
                                <span>Kills</span>
                            </div>

                            <div>
                                {sortedCharacters.length === 0 ? (
                                    <div className="px-6 py-8 text-xs text-slate-400">
                                        No hay personajes para el filtro seleccionado.
                                    </div>
                                ) : (
                                    sortedCharacters.map((character, index) => (
                                        <div
                                            key={character.id}
                                            className="grid grid-cols-[64px_minmax(0,1.9fr)_160px_120px] items-center gap-3 border-b border-[#2d1d12] px-4 py-3.5 last:border-b-0 hover:bg-[#0e1320] transition md:px-6"
                                        >
                                            <div className="text-sm font-bold text-slate-400">
                                                #{index + 1}
                                            </div>

                                            <div className="flex min-w-0 items-center gap-3">
                                                <RankingHead
                                                    sprite={
                                                        rankingHeads[
                                                            String(
                                                                character.headId,
                                                            )
                                                        ] ?? null
                                                    }
                                                    size={48}
                                                    className="shrink-0 rounded-lg border border-[#3d2719]"
                                                />

                                                <div className="min-w-0 flex-1">
                                                    <p
                                                        className="truncate text-sm font-bold"
                                                        style={{
                                                            color: getCharacterNameColor(
                                                                character,
                                                            ),
                                                        }}
                                                    >
                                                        {character.name}
                                                    </p>
                                                    {getClanTag(character) ? (
                                                        <p className="truncate text-xs font-semibold text-[#d4a359]">
                                                            {getClanTag(
                                                                character,
                                                            )}
                                                        </p>
                                                    ) : null}
                                                    <p className="truncate text-xs text-slate-400">
                                                        {getCharacterMeta(
                                                            character,
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                                                <span className="game-badge-circle h-6 w-6 text-[10px]">
                                                    {character.level}
                                                </span>
                                                <span>
                                                    {!isMaxLevelCharacter(character)
                                                        ? `(${formatExperiencePercent(character)})`
                                                        : ""}
                                                </span>
                                            </div>

                                            <div className="text-xs font-bold text-[#d94125]">
                                                {formatNumber(character.kills)}
                                            </div>
                                        </div>
                                    ))
                                )}
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

function RatingRankingTable({
    teamSize,
    entries,
    headSpritesById,
    isLoading,
}: {
    teamSize: RatingTeamSize;
    entries: RatingRankingEntry[];
    headSpritesById: Record<string, RankingHeadSprite | null>;
    isLoading: boolean;
}) {
    return (
        <section className="game-card p-5 shadow-lg md:p-6">
            <div className="flex flex-col gap-1 border-b border-[#3d2719] pb-4">
                <h2 className="text-lg font-bold uppercase tracking-wider text-white">
                    Rating {teamSize}v{teamSize}
                </h2>
                <p className="text-xs text-slate-400">
                    Todos los jugadores arrancan en 1200. Ganar suma lo mismo que pierde el rival.
                </p>
            </div>

            {isLoading ? (
                <p className="mt-4 text-xs text-[#d4a359]">Cargando ranking...</p>
            ) : null}

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
                        {entries.length === 0 && !isLoading ? (
                            <div className="px-6 py-8 text-xs text-slate-400">
                                Todavia no hay partidas de {teamSize}v{teamSize} registradas.
                            </div>
                        ) : (
                            entries.map((entry, index) => (
                                <div
                                    key={entry.characterId}
                                    className="grid grid-cols-[64px_minmax(0,1.9fr)_120px_140px_120px] items-center gap-3 border-b border-[#2d1d12] px-4 py-3.5 last:border-b-0 hover:bg-[#0e1320] transition md:px-6"
                                >
                                    <div className="text-sm font-bold text-slate-400">
                                        #{index + 1}
                                    </div>

                                    <div className="flex min-w-0 items-center gap-3">
                                        <RankingHead
                                            sprite={
                                                headSpritesById[String(entry.headId)] ?? null
                                            }
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

                                    <div className="text-sm font-bold text-[#d4a359]">
                                        {formatNumber(entry.rating)}
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
                            ))
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
