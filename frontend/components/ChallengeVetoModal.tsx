"use client";

import React from "react";
import type { ChallengeVetoState, PlayerHudState } from "../lib/aowProtocol";

type ChallengeVetoModalProps = {
    vetoState: ChallengeVetoState;
    actionKey: string | null;
    hud?: PlayerHudState | null;
    onBanMap: (mapId: number) => void;
};

function useCountdown(targetTimestamp?: number | null) {
    const [secondsLeft, setSecondsLeft] = React.useState(() =>
        targetTimestamp ? Math.max(0, Math.ceil((targetTimestamp - Date.now()) / 1000)) : 0,
    );

    React.useEffect(() => {
        if (!targetTimestamp) {
            setSecondsLeft(0);
            return;
        }

        setSecondsLeft(Math.max(0, Math.ceil((targetTimestamp - Date.now()) / 1000)));

        const intervalId = window.setInterval(() => {
            setSecondsLeft(Math.max(0, Math.ceil((targetTimestamp - Date.now()) / 1000)));
        }, 200);

        return () => window.clearInterval(intervalId);
    }, [targetTimestamp]);

    return secondsLeft;
}

export default function ChallengeVetoModal({
    vetoState,
    actionKey,
    hud,
    onBanMap,
}: ChallengeVetoModalProps) {
    const votingSecondsLeft = useCountdown(vetoState.deadlineAt);
    const teleportSecondsLeft = useCountdown(vetoState.teleportAt);
    const [locallyBannedMapId, setLocallyBannedMapId] = React.useState<number | null>(null);

    React.useEffect(() => {
        setLocallyBannedMapId(null);
    }, [vetoState.vetoId]);

    const isTransitioning =
        vetoState.transitioning || Boolean(vetoState.selectedMapId && vetoState.teleportAt);
    const isTie = Boolean(vetoState.isTie);

    // Candidates for the tiebreaker roulette (spin ONLY between maps tied with lowest ban votes)
    const candidateMapIds = React.useMemo(() => {
        if (Array.isArray(vetoState.tieCandidateMapIds) && vetoState.tieCandidateMapIds.length > 0) {
            return vetoState.tieCandidateMapIds;
        }

        const pool = vetoState.mapPool ?? [];
        const votes = vetoState.votesByMap ?? {};
        const minVotes = Math.min(...pool.map((id) => votes[id] ?? 0));
        const tiedCandidates = pool.filter((id) => (votes[id] ?? 0) === minVotes);

        return tiedCandidates.length > 0 ? tiedCandidates : pool;
    }, [vetoState.tieCandidateMapIds, vetoState.mapPool, vetoState.votesByMap]);

    const [rouletteIndex, setRouletteIndex] = React.useState(0);
    const [isSpinning, setIsSpinning] = React.useState(false);

    React.useEffect(() => {
        if (!isTransitioning || !isTie || candidateMapIds.length <= 1) {
            setIsSpinning(false);
            return;
        }

        setIsSpinning(true);
        let currentIndex = 0;
        let delay = 80;
        let timerId: number;

        const step = () => {
            currentIndex = (currentIndex + 1) % candidateMapIds.length;
            setRouletteIndex(currentIndex);

            delay = Math.floor(delay * 1.18); // Gradually slow down!

            if (delay >= 480) {
                // Lock onto final selected map
                const finalIdx = candidateMapIds.indexOf(vetoState.selectedMapId ?? candidateMapIds[0]);
                setRouletteIndex(finalIdx !== -1 ? finalIdx : 0);
                setIsSpinning(false);
                return;
            }

            timerId = window.setTimeout(step, delay);
        };

        timerId = window.setTimeout(step, delay);

        return () => window.clearTimeout(timerId);
    }, [isTransitioning, isTie, candidateMapIds, vetoState.selectedMapId]);

    const mapNames = vetoState.mapNames ?? {};
    const votesByMap = vetoState.votesByMap ?? {};
    const votersByMap = vetoState.votersByMap ?? {};
    const userVotes = vetoState.userVotes ?? {};

    // Determine if current user has voted, and for which map
    // (este hook tiene que correr siempre, incluso si mas abajo cortamos con
    // `vetoState.resolved`: los hooks no pueden ser condicionales)
    const userVotedMapId = React.useMemo(() => {
        // 1. Check userVotes by player ID
        if (hud?.id != null && userVotes[String(hud.id)] !== undefined) {
            return userVotes[String(hud.id)];
        }
        // 2. Check votersByMap by character name
        if (hud?.nameCharacter) {
            for (const [mIdStr, voterList] of Object.entries(votersByMap)) {
                if (Array.isArray(voterList) && voterList.includes(hud.nameCharacter)) {
                    return Number(mIdStr);
                }
            }
        }
        // 3. Fallback to actionKey if currently sending vote
        if (actionKey?.startsWith("vetoban-")) {
            const parsed = Number(actionKey.split("-")[1]);
            if (!isNaN(parsed)) return parsed;
        }
        // 4. Fallback to local state
        return locallyBannedMapId;
    }, [hud?.id, hud?.nameCharacter, userVotes, votersByMap, actionKey, locallyBannedMapId]);

    if (vetoState.resolved) {
        return null;
    }

    const hasUserVoted = userVotedMapId !== null;

    if (isTransitioning && vetoState.selectedMapId) {
        const activeMapId = isSpinning
            ? (candidateMapIds[rouletteIndex] ?? vetoState.selectedMapId)
            : vetoState.selectedMapId;
        const activeMapName = mapNames[activeMapId] ?? `Mapa ${activeMapId}`;

        return (
            <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/85 px-4 py-6 backdrop-blur-md animate-in fade-in duration-200">
                <div
                    className={`w-full max-w-md rounded-[24px] border p-6 text-center text-stone-100 shadow-2xl space-y-4 transition-all duration-300 ${
                        isSpinning
                            ? "border-amber-500/60 bg-stone-950/98 shadow-amber-500/20 ring-4 ring-amber-500/20 scale-[1.02]"
                            : "border-emerald-500/40 bg-stone-950/96 shadow-emerald-500/20"
                    }`}
                >
                    {/* Header Badge */}
                    <div className="flex items-center justify-center gap-2">
                        <span className={`text-4xl ${isSpinning ? "animate-spin" : "animate-bounce"}`}>
                            {isTie ? "🎰" : "⚔️"}
                        </span>
                    </div>

                    <div>
                        <div
                            className={`text-xs uppercase tracking-widest font-black ${
                                isTie ? "text-amber-400" : "text-emerald-400"
                            }`}
                        >
                            {isTie
                                ? isSpinning
                                    ? "🎲 ¡EMPATE DE VOTOS - SORTEANDO MAPA EN RULETA!"
                                    : "🎰 ¡GANADOR DEL SORTEO POR EMPATE!"
                                : "¡MAPA ELEGIDO POR VOTACIÓN!"}
                        </div>

                        {/* Map Image Thumbnail Card */}
                        <div
                            className={`mt-3 relative mx-auto h-44 w-full overflow-hidden rounded-2xl border bg-stone-900 shadow-xl transition-all duration-150 ${
                                isSpinning
                                    ? "border-amber-400 scale-[1.03] brightness-125"
                                    : "border-emerald-500/50 scale-100 brightness-100"
                            }`}
                        >
                            <img
                                key={activeMapId}
                                src={`/imgs_maps/${activeMapId}.png`}
                                alt={activeMapName}
                                className={`h-full w-full object-cover transition-all ${
                                    isSpinning ? "saturate-200 scale-110" : "saturate-100 scale-100"
                                }`}
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
                            <div className="absolute bottom-3 left-0 right-0 px-4">
                                <div
                                    className={`text-2xl font-black drop-shadow-md ${
                                        isSpinning ? "text-amber-300 animate-pulse" : "text-white"
                                    }`}
                                >
                                    {activeMapName}
                                </div>
                                <div className="text-xs text-stone-300 font-mono mt-0.5">
                                    Mapa {activeMapId}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Countdown Box */}
                    <div className="rounded-xl border border-white/10 bg-white/5 py-2.5">
                        <div className="text-xs text-stone-300">
                            {isSpinning ? "Girando ruleta entre mapas empatados..." : "Entrando a la Arena en"}
                        </div>
                        <div className="text-3xl font-extrabold text-emerald-400 mt-0.5">
                            {teleportSecondsLeft > 0 ? `${teleportSecondsLeft}s` : "¡Cargando!"}
                        </div>
                    </div>

                    <p className="text-[11px] text-stone-400">
                        Tendrás 15 segundos dentro de la arena para activar voz y comunicarte con tu equipo antes de comenzar.
                    </p>
                </div>
            </div>
        );
    }

    const mapPool = vetoState.mapPool ?? [];
    const totalVotes = Object.keys(userVotes).length;
    const totalExpectedVoters = (vetoState.teamSize ?? 2) * 2;
    const banThreshold = Math.ceil(totalExpectedVoters / 2); // 2 votes in 2v2

    const modalMaxWidth = mapPool.length > 3 ? "max-w-4xl" : "max-w-2xl";

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
            <div className={`w-full ${modalMaxWidth} rounded-[20px] border border-white/10 bg-stone-950/96 text-stone-100 shadow-2xl transition-all`}>
                <div className="border-b border-white/10 px-5 py-3.5">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-semibold text-white">
                                Selección y Veteo de Mapas · Arena {vetoState.teamSize}v{vetoState.teamSize}
                            </div>
                            <div className="mt-0.5 text-xs text-stone-400">
                                Votación simultánea para banear. Límite de descalificación: {banThreshold} votos. Progreso: {totalVotes}/{totalExpectedVoters} votos.
                            </div>
                        </div>
                        <span
                            className={`rounded-full px-3 py-1 text-xs font-mono font-bold ${
                                votingSecondsLeft <= 10
                                    ? "bg-rose-500/20 text-rose-400 animate-pulse border border-rose-500/30"
                                    : "bg-white/10 text-emerald-400 border border-white/10"
                            }`}
                        >
                            ⏱️ {votingSecondsLeft}s
                        </span>
                    </div>
                </div>

                <div className="space-y-4 p-5">
                    <div className="flex flex-wrap justify-center gap-4">
                        {mapPool.map((mapId) => {
                            const mapName = mapNames[mapId] ?? `Mapa ${mapId}`;
                            const isBanned = vetoState.bannedMapIds?.some((b) => b.mapId === mapId);
                            const banVoteCount = votesByMap[mapId] ?? 0;
                            const voters = votersByMap[mapId] ?? [];
                            const isMyVotedMap = userVotedMapId === mapId;

                            return (
                                <div
                                    key={mapId}
                                    className={`relative flex w-full flex-col justify-between overflow-hidden rounded-xl border transition sm:w-[calc(50%-0.5rem)] md:w-[calc(33.333%-0.667rem)] ${
                                        isBanned
                                            ? "border-rose-500/30 bg-stone-900/60 opacity-60 grayscale-[40%]"
                                            : "border-white/10 bg-white/5 hover:border-emerald-500/40"
                                    }`}
                                >
                                    {/* Map thumbnail image */}
                                    <div className="relative h-28 w-full bg-stone-900 overflow-hidden">
                                        <img
                                            src={`/imgs_maps/${mapId}.png`}
                                            alt={mapName}
                                            className={`h-full w-full object-cover transition ${
                                                isBanned ? "grayscale contrast-75" : "hover:scale-105 duration-200"
                                            }`}
                                            onError={(e) => {
                                                (e.target as HTMLElement).style.display = "none";
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/40 to-transparent" />
                                        {isBanned && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-[1px]">
                                                <span className="rounded bg-rose-600/90 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white shadow">
                                                    🚫 MAPA BANEADO
                                                </span>
                                                <span className="text-[10px] text-stone-300 mt-1">
                                                    Alcanzó el límite ({banVoteCount}/{banThreshold} votos)
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-3 flex flex-col flex-1 justify-between">
                                        <div>
                                            <div className="text-sm font-bold text-white truncate" title={mapName}>
                                                {mapName}
                                            </div>
                                            <div className="text-[11px] text-stone-400 font-mono">
                                                Mapa {mapId}
                                            </div>

                                            <div className="mt-2 text-xs text-stone-400">
                                                Votos para banear:{" "}
                                                <span className="font-bold text-amber-400">
                                                    {banVoteCount}/{banThreshold}
                                                </span>
                                            </div>

                                            {/* Voter character names */}
                                            {voters.length > 0 && (
                                                <div className="mt-2 text-[11px] leading-tight text-stone-300 bg-stone-900/90 rounded-md p-1.5 border border-white/5">
                                                    <span className="text-stone-400 font-medium">Baneado por: </span>
                                                    <span className="text-amber-300 font-semibold">{voters.join(", ")}</span>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            disabled={isBanned || hasUserVoted || actionKey !== null}
                                            onClick={() => {
                                                setLocallyBannedMapId(mapId);
                                                onBanMap(mapId);
                                            }}
                                            className={`mt-3 w-full rounded-lg border py-2 text-center text-xs font-semibold transition ${
                                                isBanned
                                                    ? "border-stone-800 bg-stone-900/80 text-stone-500 cursor-not-allowed"
                                                    : isMyVotedMap
                                                    ? "border-amber-500/50 bg-amber-500/20 text-amber-300 font-bold cursor-default shadow-sm shadow-amber-500/10"
                                                    : hasUserVoted
                                                    ? "border-stone-800 bg-stone-900/60 text-stone-500 cursor-not-allowed opacity-60"
                                                    : actionKey !== null
                                                    ? "border-stone-800 bg-stone-900/60 text-stone-400 cursor-wait opacity-70"
                                                    : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 active:scale-[0.98]"
                                            }`}
                                        >
                                            {isBanned
                                                ? "🚫 Mapa Bloqueado"
                                                : isMyVotedMap
                                                ? "✔ Tu Voto (Banear)"
                                                : hasUserVoted
                                                ? "✔ Voto Registrado"
                                                : actionKey !== null
                                                ? "⏳ Registrando voto..."
                                                : "🚫 Banear Mapa"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-[11px] text-stone-500 text-center">
                        Cada jugador tiene 1 voto para banear. Al alcanzar {banThreshold} votos, el mapa se bloquea en gris. Cuando todos votan o queda 1 solo mapa disponible, el duelo inicia automáticamente.
                    </p>
                </div>
            </div>
        </div>
    );
}
