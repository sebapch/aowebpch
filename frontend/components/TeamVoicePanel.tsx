"use client";

import type { TeamVoiceState } from "../lib/teamVoice";

type TeamVoicePanelProps = {
    state: TeamVoiceState;
    pushToTalkLabel: string;
    onJoin: () => void;
    onLeave: () => void;
    onTogglePeerMute: () => void;
};

const STATUS_TITLES: Record<TeamVoiceState["status"], string> = {
    idle: "Sin equipo",
    available: "Sin conectar al chat de voz",
    "requesting-mic": "Pidiendo micrófono...",
    connecting: "Conectando...",
    connected: "Conectado",
    error: "Error de voz",
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
    const title = state.error ?? STATUS_TITLES[state.status];

    return (
        <div
            className="pointer-events-auto absolute right-3 top-14 z-30 flex items-center gap-1.5 rounded-full border border-cyan-200/25 bg-stone-950/80 py-1 pl-2 pr-1.5 text-stone-100 shadow-lg backdrop-blur-md"
            title={title}
        >
            <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${getStatusColor(state)}`}
                aria-hidden
            />

            {state.joined ? (
                <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                        state.peerSpeaking && !state.peerMuted
                            ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                            : "bg-stone-600"
                    }`}
                    aria-hidden
                />
            ) : null}

            <span className="max-w-[90px] truncate text-[11px] font-medium text-stone-200">
                {state.peerName ?? "Voz de equipo"}
            </span>

            {state.joined ? (
                <>
                    <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                            state.transmitting ? "bg-emerald-400" : "bg-stone-700"
                        }`}
                        title={
                            state.transmitting
                                ? "Micrófono abierto"
                                : `Mantené ${pushToTalkLabel} para hablar`
                        }
                        aria-hidden
                    />

                    <button
                        type="button"
                        onClick={onTogglePeerMute}
                        title={state.peerMuted ? "Escuchar" : "Silenciar"}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-stone-300 transition-colors hover:bg-stone-800/80 hover:text-stone-100"
                    >
                        {state.peerMuted ? (
                            <MutedIcon />
                        ) : (
                            <SpeakerIcon />
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={onLeave}
                        title="Salir del chat de voz"
                        className="flex h-5 w-5 items-center justify-center rounded-full text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
                    >
                        <LeaveIcon />
                    </button>
                </>
            ) : (
                <button
                    type="button"
                    onClick={onJoin}
                    disabled={isBusy}
                    title={isBusy ? "Pidiendo micrófono..." : "Unirse al chat de voz"}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-cyan-200 transition-colors hover:bg-cyan-400/15 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <MicIcon />
                </button>
            )}
        </div>
    );
}

function MicIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"
                stroke="currentColor"
                strokeWidth="2"
            />
            <path
                d="M19 11a7 7 0 0 1-14 0M12 18v3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function SpeakerIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M4 9v6h4l5 4V5L8 9H4Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <path
                d="M17 9a4 4 0 0 1 0 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function MutedIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
                d="M4 9v6h4l5 4V5L8 9H4Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
            />
            <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function LeaveIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}
