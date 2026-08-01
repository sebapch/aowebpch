"use client";

import React from "react";
import type { ChallengeVetoState } from "../lib/aowProtocol";

type ChallengeVetoModalProps = {
    vetoState: ChallengeVetoState;
    actionKey: string | null;
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
    onBanMap,
}: ChallengeVetoModalProps) {
    const votingSecondsLeft = useCountdown(vetoState.deadlineAt);
    const teleportSecondsLeft = useCountdown(vetoState.teleportAt);

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

    if (vetoState.resolved) {
        return null;
    }

    const mapNames = vetoState.mapNames ?? {};
    const votesByMap = vetoState.votesByMap ?? {};
    const userVotes = vetoState.userVotes ?? {};

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

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[20px] border border-white/10 bg-stone-950/96 text-stone-100 shadow-2xl">
                <div className="border-b border-white/10 px-5 py-3.5">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-semibold text-white">
                                Selección y Veteo de Mapas · Arena {vetoState.teamSize}v{vetoState.teamSize}
                            </div>
                            <div className="mt-0.5 text-xs text-stone-400">
                                Votación simultánea: Vota para banear el mapa que NO quieres jugar. Votos: {totalVotes}/{totalExpectedVoters}.
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {mapPool.map((mapId) => {
                            const mapName = mapNames[mapId] ?? `Mapa ${mapId}`;
                            const isBanned = vetoState.bannedMapIds?.some((b) => b.mapId === mapId);
                            const banVoteCount = votesByMap[mapId] ?? 0;

                            return (
                                <div
                                    key={mapId}
                                    className={`relative flex flex-col justify-between overflow-hidden rounded-xl border transition ${
                                        isBanned
                                            ? "border-rose-500/20 bg-rose-500/5 opacity-50"
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
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[1px]">
                                                <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white shadow">
                                                    Baneado
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-3">
                                        <div>
                                            <div className="text-sm font-bold text-white truncate" title={mapName}>
                                                {mapName}
                                            </div>
                                            <div className="text-[11px] text-stone-400 font-mono">
                                                Mapa {mapId}
                                            </div>
                                        </div>

                                        <div className="mt-2 text-xs text-stone-400">
                                            Votos para banear:{" "}
                                            <span className="font-bold text-amber-400">{banVoteCount}</span>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={isBanned || actionKey !== null}
                                            onClick={() => onBanMap(mapId)}
                                            className={`mt-3 w-full rounded-lg border py-2 text-center text-xs font-semibold transition ${
                                                isBanned
                                                    ? "border-stone-800 bg-stone-900 text-stone-600 cursor-not-allowed"
                                                    : "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 active:scale-[0.98]"
                                            } disabled:opacity-50`}
                                        >
                                            🚫 Banear Mapa
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-[11px] text-stone-500 text-center">
                        Tienen 1 minuto para votar. La opción con más descalificaciones se descarta. Si hay empate, la ruleta elegirá el mapa al azar.
                    </p>
                </div>
            </div>
        </div>
    );
}
