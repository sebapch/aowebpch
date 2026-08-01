"use client";

import type { TeamVoiceState } from "../lib/teamVoice";

type TeamVoicePanelProps = {
    state: TeamVoiceState;
    pushToTalkLabel: string;
    onJoin: () => void;
    onLeave: () => void;
    onTogglePeerMute: () => void;
};

const STATUS_LABELS: Record<TeamVoiceState["status"], string> = {
    idle: "Sin equipo",
    available: "Sin conectar",
    "requesting-mic": "Pidiendo micrófono...",
    connecting: "Conectando...",
    connected: "Conectado",
    error: "Error",
};

function getStatusColor(state: TeamVoiceState): string {
    if (state.status === "error") {
        return "bg-red-400";
    }

    if (state.status === "connected") {
        return "bg-emerald-400";
    }

    if (state.status === "connecting" || state.status === "requesting-mic") {
        return "bg-amber-300";
    }

    return "bg-stone-500";
}

export default function TeamVoicePanel({
    state,
    pushToTalkLabel,
    onJoin,
    onLeave,
    onTogglePeerMute,
}: TeamVoicePanelProps) {
    if (!state.roomId) {
        return null;
    }

    const isBusy = state.status === "requesting-mic";

    return (
        <div className="pointer-events-auto absolute right-3 top-24 z-30 w-56 rounded-2xl border border-cyan-200/30 bg-stone-950/84 px-3 py-2.5 text-stone-100 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">
                    Voz de equipo
                </span>
                <span
                    className={`h-2 w-2 rounded-full ${getStatusColor(state)}`}
                    aria-hidden
                />
            </div>

            <div className="mt-1.5 flex items-center gap-2">
                <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors ${
                        state.peerSpeaking && !state.peerMuted
                            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                            : "bg-stone-600"
                    }`}
                    aria-hidden
                />
                <span className="truncate text-sm font-semibold text-stone-100">
                    {state.peerName ?? "Companero"}
                </span>
            </div>

            <div className="mt-0.5 text-[11px] text-stone-300/85">
                {state.error ?? STATUS_LABELS[state.status]}
            </div>

            {state.joined ? (
                <>
                    <div
                        className={`mt-2 rounded-lg border px-2 py-1.5 text-center text-[11px] font-semibold transition-colors ${
                            state.transmitting
                                ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-200"
                                : "border-stone-600/60 bg-stone-900/60 text-stone-300"
                        }`}
                    >
                        {state.transmitting
                            ? "Micrófono abierto"
                            : `Mantené ${pushToTalkLabel} para hablar`}
                    </div>

                    <div className="mt-2 flex gap-2">
                        <button
                            type="button"
                            onClick={onTogglePeerMute}
                            className="flex-1 rounded-lg border border-stone-600/60 bg-stone-900/60 px-2 py-1 text-[11px] font-medium text-stone-200 transition-colors hover:bg-stone-800/80"
                        >
                            {state.peerMuted ? "Escuchar" : "Silenciar"}
                        </button>
                        <button
                            type="button"
                            onClick={onLeave}
                            className="flex-1 rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-200 transition-colors hover:bg-red-500/20"
                        >
                            Salir
                        </button>
                    </div>
                </>
            ) : (
                <button
                    type="button"
                    onClick={onJoin}
                    disabled={isBusy}
                    className="mt-2 w-full rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-2 py-1.5 text-[11px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isBusy ? "Pidiendo micrófono..." : "Unirse al chat de voz"}
                </button>
            )}
        </div>
    );
}
