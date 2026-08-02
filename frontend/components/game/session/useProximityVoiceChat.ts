import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
    createProximityVoiceJoinPacket,
    createProximityVoiceLeavePacket,
    createVoiceSignalPacket,
    type VoiceSignalPayload,
} from "../../../lib/aowProtocol";
import {
    INITIAL_MULTI_VOICE_STATE,
    MultiPeerVoiceChat,
    type MultiVoiceState,
} from "../../../lib/multiPeerVoice";

/**
 * Debe coincidir con `VOICE_PROXIMITY_RANGE` en `server/src/proximityVoice.ts`.
 * Apenas más que `VIEWPORT_TILE_RADIUS` (10): quien está en el borde de la
 * pantalla todavía se escucha, muy bajito, y recién ahí se apaga del todo.
 */
export const VOICE_PROXIMITY_RANGE = 11;

type UseProximityVoiceChatOptions = {
    websocketRef: RefObject<WebSocket | null>;
    onVoiceStateChange?: ((state: MultiVoiceState) => void) | undefined;
};

/**
 * Chat de voz por proximidad en mundo abierto: arma un mesh dinámico con
 * quien esté cerca en mapas habilitados desde el editor (`voiceChatEnabled`).
 * A diferencia de la voz de equipo, unirse/salir del canal es un aviso
 * explícito al servidor (`proximityJoin`/`proximityLeave`): recién ahí
 * empieza a calcular quién está en rango. El volumen por distancia lo maneja
 * `MultiPeerVoiceChat` con los mensajes `{type:"distance"}` que manda el
 * servidor cada vez que alguien unido al canal se mueve.
 */
export function useProximityVoiceChat({
    websocketRef,
    onVoiceStateChange,
}: UseProximityVoiceChatOptions) {
    const [voiceState, setVoiceState] = useState<MultiVoiceState>(
        INITIAL_MULTI_VOICE_STATE,
    );
    const voiceChatRef = useRef<MultiPeerVoiceChat | null>(null);
    const onVoiceStateChangeRef = useRef(onVoiceStateChange);

    useEffect(() => {
        onVoiceStateChangeRef.current = onVoiceStateChange;
    }, [onVoiceStateChange]);

    const getVoiceChat = useCallback(() => {
        if (!voiceChatRef.current) {
            const chat = new MultiPeerVoiceChat({
                sendSignal: (roomId, signal) => {
                    const socket = websocketRef.current;

                    if (!socket || socket.readyState !== WebSocket.OPEN) {
                        return;
                    }

                    socket.send(createVoiceSignalPacket(roomId, signal));
                },
                onStateChange: (state) => {
                    setVoiceState(state);
                    onVoiceStateChangeRef.current?.(state);
                },
            });
            chat.setMaxDistanceRange(VOICE_PROXIMITY_RANGE);
            voiceChatRef.current = chat;
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

        const socket = websocketRef.current;

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(createProximityVoiceJoinPacket());
        }
    }, [getVoiceChat, websocketRef]);

    const leaveVoiceChat = useCallback(() => {
        getVoiceChat().leave();

        const socket = websocketRef.current;

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(createProximityVoiceLeavePacket());
        }
    }, [getVoiceChat, websocketRef]);

    const setVoiceTransmitting = useCallback(
        (active: boolean) => {
            voiceChatRef.current?.setTransmitting(active);
        },
        [],
    );

    const setVoicePeerMuted = useCallback((peerId: string, muted: boolean) => {
        voiceChatRef.current?.setPeerMuted(peerId, muted);
    }, []);

    return {
        voiceState,
        handleVoiceSignalPacket,
        joinVoiceChat,
        leaveVoiceChat,
        setVoiceTransmitting,
        setVoicePeerMuted,
    };
}
