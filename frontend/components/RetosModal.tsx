"use client";

import React from "react";
import type { RetosState } from "../lib/aowProtocol";

type RetosModalProps = {
    challenges: RetosState["challenges"];
    currentCharacterId: string | number | null;
    currentCharacterName: string | null;
    loading: boolean;
    error: string | null;
    info: string | null;
    actionKey: string | null;
    onClose: () => void;
    onRefresh: () => void;
    onCreateChallenge: (teamSize: 1 | 2 | 3 | 4) => void;
    onJoinChallenge: (challengeId: string) => void;
    onCancelChallenge: (challengeId: string) => void;
    onEnqueueMatchmaking?: (teamSize: 2 | 3 | 4) => void;
    onDequeueMatchmaking?: () => void;
};

export default function RetosModal({
    challenges,
    currentCharacterId,
    currentCharacterName,
    loading,
    error,
    info,
    actionKey,
    onClose,
    onRefresh,
    onCreateChallenge,
    onJoinChallenge,
    onCancelChallenge,
    onEnqueueMatchmaking,
    onDequeueMatchmaking,
}: RetosModalProps) {
    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[92] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[18px] border border-white/10 bg-stone-950/96 text-stone-100 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div>
                        <div className="text-sm font-semibold text-white">
                            Arena & Retos
                        </div>
                        <div className="text-xs text-stone-400">
                            {currentCharacterName ?? "Personaje"}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onRefresh}
                            className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-stone-300 transition hover:border-white/20 hover:text-white"
                        >
                            Refrescar
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-stone-300 transition hover:border-white/20 hover:text-white"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>

                <div className="grid gap-3 p-4 md:grid-cols-[260px,1fr]">
                    <section className="space-y-3">
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-2">
                            <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                                <span>🎯</span> Matchmaking (Modo CS)
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {([2, 3, 4] as const).map((teamSize) => (
                                    <button
                                        key={teamSize}
                                        type="button"
                                        onClick={() => onEnqueueMatchmaking?.(teamSize)}
                                        disabled={actionKey !== null}
                                        className="rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-2 text-center text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-60"
                                    >
                                        {actionKey === `enqueue-${teamSize}`
                                            ? "..."
                                            : `Entrar ${teamSize}v${teamSize}`}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => onDequeueMatchmaking?.()}
                                disabled={actionKey !== null}
                                className="w-full rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-center text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-60"
                            >
                                {actionKey === "dequeue" ? "Saliendo..." : "Salir de Cola"}
                            </button>
                        </div>

                        <div className="space-y-1.5">
                            <div className="text-xs font-medium text-stone-400">Duelos Directos</div>
                            <div className="grid grid-cols-2 gap-2">
                                {([1, 2, 3, 4] as const).map((teamSize) => (
                                    <button
                                        key={teamSize}
                                        type="button"
                                        onClick={() => onCreateChallenge(teamSize)}
                                        disabled={actionKey !== null}
                                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-xs transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {actionKey === `create-${teamSize}`
                                            ? `Crear ${teamSize}v${teamSize}...`
                                            : `Crear ${teamSize}v${teamSize}`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {error ? (
                            <div className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                                {error}
                            </div>
                        ) : null}

                        {info ? (
                            <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                                {info}
                            </div>
                        ) : null}

                        <p className="pt-1 text-xs text-stone-500">
                            Requisito: Estar en Zona Segura. En party, el líder inscribe al equipo.
                        </p>
                    </section>

                    <section className="rounded-lg border border-white/10 bg-black/20">
                        <div className="border-b border-white/10 px-3 py-2 text-sm font-medium text-white">
                            Retos abiertos
                        </div>

                        <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
                            {loading ? (
                                <div className="rounded-lg border border-white/10 px-3 py-3 text-sm text-stone-400">
                                    Cargando retos...
                                </div>
                            ) : challenges.length === 0 ? (
                                <div className="rounded-lg border border-white/10 px-3 py-3 text-sm text-stone-400">
                                    No hay retos abiertos.
                                </div>
                            ) : (
                                challenges.map((challenge) => {
                                    const isOwnChallenge =
                                        currentCharacterId !== null &&
                                        String(challenge.proposer.id) ===
                                            String(currentCharacterId);

                                    return (
                                        <article
                                            key={challenge.id}
                                            className="flex items-start justify-between gap-3 rounded-lg border border-white/10 px-3 py-3"
                                        >
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium text-white">
                                                    {challenge.teamSize}vs
                                                    {challenge.teamSize}
                                                </div>
                                                <div className="mt-1 space-y-1">
                                                    {challenge.participants.map(
                                                        (participant) => (
                                                            <div
                                                                key={
                                                                    participant.id
                                                                }
                                                                className="text-xs text-stone-400"
                                                            >
                                                                <span className="text-stone-200">
                                                                    {
                                                                        participant.name
                                                                    }
                                                                </span>{" "}
                                                                · Nivel{" "}
                                                                {
                                                                    participant.level
                                                                }{" "}
                                                                ·{" "}
                                                                {
                                                                    participant.className
                                                                }
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    isOwnChallenge
                                                        ? onCancelChallenge(
                                                              challenge.id,
                                                          )
                                                        : onJoinChallenge(
                                                              challenge.id,
                                                          )
                                                }
                                                disabled={actionKey !== null}
                                                className="shrink-0 rounded-md border border-white/10 px-3 py-1.5 text-xs text-stone-200 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {actionKey ===
                                                `${isOwnChallenge ? "cancel" : "join"}-${challenge.id}`
                                                    ? "..."
                                                    : isOwnChallenge
                                                      ? "Cancelar"
                                                      : "Unirte"}
                                            </button>
                                        </article>
                                    );
                                })
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
