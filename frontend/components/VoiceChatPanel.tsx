"use client";

import type { MultiVoiceState } from "../lib/multiPeerVoice";

type VoiceChatPanelProps = {
    state: MultiVoiceState;
    pushToTalkLabel: string;
    emptyPeerLabel?: string;
    visible: boolean;
    onJoin: () => void;
    onLeave: () => void;
    onTogglePeerMute: (peerId: string) => void;
};

const STATUS_TITLES: Record<MultiVoiceState["status"], string> = {
    idle: "Sin conectar al chat de voz",
    "requesting-mic": "Pidiendo micrófono...",
    joined: "Conectado",
    error: "Error de voz",
};

function getStatusColor(state: MultiVoiceState): string {
    if (state.status === "error") {
        return "bg-red-400";
    }

    if (state.status === "joined") {
        return state.peers.some((peer) => peer.connected) ? "bg-emerald-400" : "bg-amber-300";
    }

    if (state.status === "requesting-mic") {
        return "bg-amber-300";
    }

    return "bg-stone-500";
}

/**
 * Base compartida del HUD de voz: lista de peers conectados (equipo o
 * proximidad), con indicador de quién habla y mute/leave por peer.
 */
export default function VoiceChatPanel({
    state,
    pushToTalkLabel,
    emptyPeerLabel,
    visible,
    onJoin,
    onLeave,
    onTogglePeerMute,
}: VoiceChatPanelProps) {
    if (!visible) {
        return null;
    }

    const isBusy = state.status === "requesting-mic";
    const title = state.error ?? STATUS_TITLES[state.status];

    return (
        <div
            className="pointer-events-auto absolute right-3 top-14 z-30 flex max-w-[220px] flex-col gap-1 rounded-2xl border border-cyan-200/25 bg-stone-950/80 px-2 py-1.5 text-stone-100 shadow-lg backdrop-blur-md"
            title={title}
        >
            <div className="flex items-center gap-1.5">
                <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${getStatusColor(state)}`}
                    aria-hidden
                />

                {state.joined ? (
                    state.peers.length > 0 ? (
                        <span className="max-w-[130px] truncate text-[11px] font-medium text-stone-200">
                            {`${state.peers.length} cerca`}
                        </span>
                    ) : emptyPeerLabel ? (
                        <span className="max-w-[130px] truncate text-[11px] font-medium text-stone-200">
                            {emptyPeerLabel}
                        </span>
                    ) : null
                ) : emptyPeerLabel ? (
                    <span className="max-w-[130px] truncate text-[11px] font-medium text-stone-200">
                        {emptyPeerLabel}
                    </span>
                ) : null}

                {state.joined ? (
                    <button
                        type="button"
                        onClick={onLeave}
                        title="Salir del chat de voz"
                        className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200"
                    >
                        <LeaveIcon />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onJoin}
                        disabled={isBusy}
                        title={isBusy ? "Pidiendo micrófono..." : "Unirse al chat de voz"}
                        className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-cyan-200 transition-colors hover:bg-cyan-400/15 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <MicIcon />
                    </button>
                )}
            </div>

            {state.joined && state.peers.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                    {state.peers.map((peer) => (
                        <div key={peer.roomId} className="flex items-center gap-1.5">
                            <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                                    peer.speaking && !peer.muted
                                        ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                                        : "bg-stone-600"
                                }`}
                                aria-hidden
                            />
                            <span className="max-w-[110px] truncate text-[10px] text-stone-300">
                                {peer.peerName}
                            </span>
                            <button
                                type="button"
                                onClick={() => onTogglePeerMute(peer.peerId)}
                                title={peer.muted ? "Escuchar" : "Silenciar"}
                                className="ml-auto flex h-4 w-4 items-center justify-center rounded-full text-stone-300 transition-colors hover:bg-stone-800/80 hover:text-stone-100"
                            >
                                {peer.muted ? <MutedIcon /> : <SpeakerIcon />}
                            </button>
                        </div>
                    ))}
                </div>
            ) : null}
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
