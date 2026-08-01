import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
    createVoiceSignalPacket,
    type VoiceSignalPayload,
} from "../../../lib/aowProtocol";
import {
    INITIAL_TEAM_VOICE_STATE,
    TeamVoiceChat,
    type TeamVoiceState,
} from "../../../lib/teamVoice";

type UseTeamVoiceChatOptions = {
    websocketRef: RefObject<WebSocket | null>;
    onVoiceStateChange?: ((state: TeamVoiceState) => void) | undefined;
};

/**
 * Chat de voz por equipo para los 2v2: mantiene vivo el canal WebRTC con el
 * compañero y expone los controles que usan el HUD y el push to talk.
 */
export function useTeamVoiceChat({
    websocketRef,
    onVoiceStateChange,
}: UseTeamVoiceChatOptions) {
    const [voiceState, setVoiceState] = useState<TeamVoiceState>(
        INITIAL_TEAM_VOICE_STATE,
    );
    const voiceChatRef = useRef<TeamVoiceChat | null>(null);
    const onVoiceStateChangeRef = useRef(onVoiceStateChange);

    useEffect(() => {
        onVoiceStateChangeRef.current = onVoiceStateChange;
    }, [onVoiceStateChange]);

    const getVoiceChat = useCallback(() => {
        if (!voiceChatRef.current) {
            voiceChatRef.current = new TeamVoiceChat({
                sendSignal: (signal) => {
                    const socket = websocketRef.current;

                    if (!socket || socket.readyState !== WebSocket.OPEN) {
                        return;
                    }

                    socket.send(createVoiceSignalPacket(signal));
                },
                onStateChange: (state) => {
                    setVoiceState(state);
                    onVoiceStateChangeRef.current?.(state);
                },
            });
        }

        return voiceChatRef.current;
    }, [websocketRef]);

    useEffect(
        () => () => {
            voiceChatRef.current?.destroy();
            voiceChatRef.current = null;
        },
        [],
    );

    const handleVoiceSignalPacket = useCallback(
        (payload: VoiceSignalPayload) => {
            getVoiceChat().handlePayload(payload);
        },
        [getVoiceChat],
    );

    const joinVoiceChat = useCallback(() => {
        void getVoiceChat().join();
    }, [getVoiceChat]);

    const leaveVoiceChat = useCallback(() => {
        getVoiceChat().leave();
    }, [getVoiceChat]);

    const setVoiceTransmitting = useCallback(
        (active: boolean) => {
            voiceChatRef.current?.setTransmitting(active);
        },
        [],
    );

    const setVoicePeerMuted = useCallback((muted: boolean) => {
        voiceChatRef.current?.setPeerMuted(muted);
    }, []);

    const closeVoiceChat = useCallback(() => {
        voiceChatRef.current?.closeRoom();
    }, []);

    return {
        voiceState,
        handleVoiceSignalPacket,
        joinVoiceChat,
        leaveVoiceChat,
        setVoiceTransmitting,
        setVoicePeerMuted,
        closeVoiceChat,
    };
}
