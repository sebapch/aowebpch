"use client";

import React from "react";
import type { ChallengeVetoState } from "../lib/aowProtocol";

type ChallengeVetoModalProps = {
    vetoState: ChallengeVetoState;
    actionKey: string | null;
    onBanMap: (mapId: number) => void;
};

function useCountdown(deadlineAt: number) {
    const [secondsLeft, setSecondsLeft] = React.useState(() =>
        Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)),
    );

    React.useEffect(() => {
        setSecondsLeft(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));

        const intervalId = window.setInterval(() => {
            setSecondsLeft(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));
        }, 250);

        return () => window.clearInterval(intervalId);
    }, [deadlineAt]);

    return secondsLeft;
}

export default function ChallengeVetoModal({
    vetoState,
    actionKey,
    onBanMap,
}: ChallengeVetoModalProps) {
    const secondsLeft = useCountdown(vetoState.deadlineAt);

    if (vetoState.resolved) {
        return null;
    }

    const isYourTurn = vetoState.currentTurnSide === vetoState.yourSide;
    const canAct = isYourTurn && vetoState.isLeader === true;

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-[18px] border border-white/10 bg-stone-950/96 text-stone-100 shadow-2xl">
                <div className="border-b border-white/10 px-4 py-3">
                    <div className="text-sm font-semibold text-white">
                        Veteo de mapas · {vetoState.teamSize}v{vetoState.teamSize}
                    </div>
                    <div className="mt-1 text-xs text-stone-400">
                        {isYourTurn
                            ? vetoState.isLeader
                                ? "Te toca banear un mapa."
                                : "Le toca a tu equipo: esperando a que el líder banee un mapa."
                            : "Esperando al equipo rival..."}
                    </div>
                </div>

                <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between text-xs text-stone-400">
                        <span>
                            Paso {Math.min(vetoState.stepIndex + 1, vetoState.totalSteps)} de{" "}
                            {vetoState.totalSteps}
                        </span>
                        <span
                            className={
                                secondsLeft <= 5
                                    ? "font-semibold text-rose-400"
                                    : "font-semibold text-stone-300"
                            }
                        >
                            {secondsLeft}s
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {vetoState.mapPool.map((mapId) => {
                            const bannedEntry = vetoState.bannedMapIds.find(
                                (banned) => banned.mapId === mapId,
                            );
                            const isBanned = Boolean(bannedEntry);
                            const isSelectable =
                                canAct && !isBanned && vetoState.remainingMapIds.includes(mapId);

                            return (
                                <button
                                    key={mapId}
                                    type="button"
                                    disabled={!isSelectable || actionKey !== null}
                                    onClick={() => onBanMap(mapId)}
                                    className={`rounded-lg border px-3 py-4 text-center text-xs font-medium transition ${
                                        isBanned
                                            ? "border-rose-500/20 bg-rose-500/5 text-rose-400/60 line-through"
                                            : isSelectable
                                              ? "border-white/10 bg-white/5 text-stone-100 hover:border-emerald-400/40 hover:bg-emerald-500/10"
                                              : "border-white/10 bg-white/5 text-stone-300"
                                    } disabled:cursor-not-allowed`}
                                >
                                    Mapa {mapId}
                                    {isBanned ? (
                                        <div className="mt-1 text-[10px] uppercase tracking-wide text-rose-400/80">
                                            Baneado por equipo {bannedEntry?.side}
                                        </div>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>

                    <p className="text-[11px] text-stone-500">
                        Si se agota el tiempo, se banea un mapa al azar automáticamente. El mapa
                        que quede sin banear es el que se juega.
                    </p>
                </div>
            </div>
        </div>
    );
}
