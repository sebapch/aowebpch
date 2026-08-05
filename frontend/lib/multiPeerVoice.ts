import type {
    VoiceIceServer,
    VoicePeerSignal,
    VoiceSignalPayload,
} from "./aowProtocol";

export type MultiVoiceStatus =
    | "idle"
    | "requesting-mic"
    | "joined"
    | "error";

export type VoicePeerLinkState = {
    roomId: string;
    peerId: string;
    peerName: string;
    connected: boolean;
    speaking: boolean;
    muted: boolean;
    /** Distancia en tiles al peer, si el canal la reporta (sólo proximidad). `null` en voz de equipo. */
    distance: number | null;
};

export type MultiVoiceState = {
    status: MultiVoiceStatus;
    joined: boolean;
    /** El micrófono está abierto ahora mismo (push to talk apretado). */
    transmitting: boolean;
    error: string | null;
    peers: VoicePeerLinkState[];
};

export const INITIAL_MULTI_VOICE_STATE: MultiVoiceState = {
    status: "idle",
    joined: false,
    transmitting: false,
    error: null,
    peers: [],
};

type MultiPeerVoiceChatOptions = {
    sendSignal: (roomId: string, signal: VoicePeerSignal) => void;
    onStateChange: (state: MultiVoiceState) => void;
};

const SPEAKING_LEVEL_THRESHOLD = 0.02;
const SPEAKING_SAMPLE_INTERVAL_MS = 120;
/**
 * Hasta esta distancia (en tiles) se escucha al 100%: sin esta meseta, una
 * caída que arranca pegada al personaje deja al vecino de al lado a un
 * volumen ya recortado y da sensación de que la voz no funciona.
 */
const FULL_VOLUME_DISTANCE = 2;

/** Volumen según distancia: 100% cerca, caída lineal hasta el silencio en el borde del rango. */
export function computeProximityGain(distance: number, maxRange: number): number {
    if (!Number.isFinite(distance) || !Number.isFinite(maxRange) || maxRange <= 0) {
        return 1;
    }

    if (distance <= FULL_VOLUME_DISTANCE) {
        return 1;
    }

    if (distance >= maxRange) {
        return 0;
    }

    return (maxRange - distance) / (maxRange - FULL_VOLUME_DISTANCE);
}

function isMediaDevicesSupported(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.RTCPeerConnection === "function" &&
        typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
}

function describeMicError(error: unknown): string {
    if (error instanceof DOMException) {
        if (error.name === "NotAllowedError" || error.name === "SecurityError") {
            return "Bloqueaste el acceso al micrófono.";
        }

        if (error.name === "NotFoundError") {
            return "No se encontró ningún micrófono.";
        }

        if (error.name === "NotReadableError") {
            return "Otra aplicación está usando el micrófono.";
        }
    }

    return "No se pudo acceder al micrófono.";
}

/** Cuánto esperar tras "disconnected" antes de asumir que no se va a recuperar sola. */
const DISCONNECT_GRACE_MS = 4_000;
/** Backoff entre reintentos de reconexión de un link (crece con cada intento, con techo). */
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 8_000;
const RECONNECT_MAX_ATTEMPTS = 5;
/** Reintentos para recuperar el micrófono si el track se corta solo (dispositivo perdido). */
const MIC_RECOVERY_MAX_ATTEMPTS = 3;
const MIC_RECOVERY_DELAY_MS = 1_500;

type PeerLink = {
    roomId: string;
    peerId: string;
    peerName: string;
    initiator: boolean;
    iceServers: VoiceIceServer[];

    connection: RTCPeerConnection | null;
    isNegotiating: boolean;
    isPeerReady: boolean;
    hasRemoteDescription: boolean;
    pendingCandidates: RTCIceCandidateInit[];

    /** Intentos de reconexión consecutivos desde la última vez que se conectó bien. */
    reconnectAttempts: number;
    /** Timer del backoff de reconexión tras "failed" (o "disconnected" persistente). */
    reconnectTimer: ReturnType<typeof setTimeout> | null;
    /** Timer de gracia: espera a que "disconnected" se resuelva solo antes de forzar la reconexión. */
    disconnectGraceTimer: ReturnType<typeof setTimeout> | null;

    /**
     * Reproductor del audio remoto. Es un elemento multimedia y no un grafo de
     * Web Audio a propósito: `srcObject` reemplaza en vez de acumular (un
     * `ontrack` repetido no puede duplicar la voz) y Chrome sólo alimenta su
     * cancelador de eco con lo que sale por elementos multimedia.
     */
    audioSink: HTMLAudioElement | null;

    connected: boolean;
    speaking: boolean;
    muted: boolean;
    distance: number | null;
};

/**
 * Canal de voz P2P con varios peers simultáneos (mesh WebRTC): la base
 * compartida tanto de la voz de equipo (roster fijo durante un match, hasta
 * 4 por lado) como de la voz por proximidad en mundo abierto (roster
 * dinámico según distancia). El servidor sólo reenvía el handshake (oferta,
 * respuesta y candidatos ICE): el audio viaja directo entre navegadores.
 */
export class MultiPeerVoiceChat {
    private readonly sendSignal: MultiPeerVoiceChatOptions["sendSignal"];
    private readonly onStateChange: MultiPeerVoiceChatOptions["onStateChange"];

    private state: MultiVoiceState = { ...INITIAL_MULTI_VOICE_STATE };

    private links = new Map<string, PeerLink>();
    private localStream: MediaStream | null = null;
    private speakingIntervalId: ReturnType<typeof setInterval> | null = null;
    /** Rango máximo usado para traducir distancia -> volumen (sólo relevante en proximidad). */
    private maxDistanceRange = 0;
    /** Evita reintentos de mic superpuestos si el track dispara "ended" más de una vez. */
    private micRecoveryInFlight = false;

    constructor(options: MultiPeerVoiceChatOptions) {
        this.sendSignal = options.sendSignal;
        this.onStateChange = options.onStateChange;
    }

    getState(): MultiVoiceState {
        return this.state;
    }

    setMaxDistanceRange(maxRange: number): void {
        this.maxDistanceRange = maxRange;
    }

    handlePayload(payload: VoiceSignalPayload): void {
        if (payload.type === "room") {
            this.openRoom(payload);
            return;
        }

        if (payload.type === "closed") {
            this.closeRoom(payload.roomId);
            return;
        }

        if (payload.type === "distance") {
            this.updateDistance(payload.roomId, payload.distance);
            return;
        }

        if (payload.type === "signal") {
            void this.handlePeerSignal(payload.roomId, payload.signal);
        }
    }

    /** Un nuevo peer entra al mesh: compañero de equipo al iniciar el match, o alguien que entró en rango. */
    private openRoom(payload: Extract<VoiceSignalPayload, { type: "room" }>): void {
        let link = this.links.get(payload.roomId);

        if (!link) {
            link = {
                roomId: payload.roomId,
                peerId: payload.peerId,
                peerName: payload.peerName,
                initiator: payload.initiator,
                iceServers: payload.iceServers ?? [],
                connection: null,
                isNegotiating: false,
                isPeerReady: false,
                hasRemoteDescription: false,
                pendingCandidates: [],
                reconnectAttempts: 0,
                reconnectTimer: null,
                disconnectGraceTimer: null,
                audioSink: null,
                connected: false,
                speaking: false,
                muted: false,
                distance: null,
            };
            this.links.set(payload.roomId, link);
        } else {
            link.peerName = payload.peerName;
            link.initiator = payload.initiator;
            link.iceServers = payload.iceServers ?? link.iceServers;
        }

        if (this.state.joined && !link.connection) {
            this.createPeerConnection(link);
            this.sendSignal(link.roomId, { kind: "ready", reply: false });
            this.maybeStartNegotiation(link);
        }

        this.emitPeers();
    }

    /** Un peer sale del mesh: fin del match, o salió de rango / se desconectó. */
    private closeRoom(roomId: string): void {
        const link = this.links.get(roomId);

        if (!link) {
            return;
        }

        this.teardownLink(link);
        this.links.delete(roomId);
        this.emitPeers();
    }

    private updateDistance(roomId: string, distance: number): void {
        const link = this.links.get(roomId);

        if (!link) {
            return;
        }

        link.distance = distance;
        this.applyGain(link);
        this.emitPeers();
    }

    private applyGain(link: PeerLink): void {
        if (!link.audioSink) {
            return;
        }

        link.audioSink.muted = link.muted;

        // Sin distancia (voz de equipo) el volumen es siempre pleno.
        const gain =
            link.distance === null || this.maxDistanceRange <= 0
                ? 1
                : computeProximityGain(link.distance, this.maxDistanceRange);

        // `volume` tira excepción fuera de 0..1.
        link.audioSink.volume = Math.min(1, Math.max(0, gain));
    }

    async join(): Promise<void> {
        if (this.state.joined) {
            return;
        }

        if (!isMediaDevicesSupported()) {
            this.patchState({ status: "error", error: "Tu navegador no soporta chat de voz." });
            return;
        }

        this.patchState({ status: "requesting-mic", error: null });

        let stream: MediaStream;

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
        } catch (error) {
            this.patchState({ status: "error", joined: false, error: describeMicError(error) });
            return;
        }

        this.localStream = stream;
        // Push to talk: el micrófono arranca cerrado y sólo se abre con la tecla.
        this.setTrackEnabled(false);
        this.watchLocalTrackHealth(stream);

        this.patchState({ status: "joined", joined: true, error: null });

        for (const link of this.links.values()) {
            if (!link.connection) {
                this.createPeerConnection(link);
                this.sendSignal(link.roomId, { kind: "ready", reply: false });
                this.maybeStartNegotiation(link);
            }
        }
    }

    leave(): void {
        if (!this.state.joined) {
            return;
        }

        for (const link of this.links.values()) {
            this.closePeerConnection(link);
        }

        this.localStream?.getTracks().forEach((track) => track.stop());
        this.localStream = null;
        this.stopSpeakingLoop();

        this.patchState({
            status: "idle",
            joined: false,
            transmitting: false,
            error: null,
        });
        this.emitPeers();
    }

    setTransmitting(active: boolean): void {
        if (!this.state.joined || this.state.transmitting === active) {
            return;
        }

        this.setTrackEnabled(active);
        this.patchState({ transmitting: active });
    }

    setPeerMuted(peerRoomOrId: string, muted: boolean): void {
        const link = this.links.get(peerRoomOrId) ?? [...this.links.values()].find((l) => l.peerId === peerRoomOrId);

        if (!link) {
            return;
        }

        link.muted = muted;
        this.applyGain(link);
        this.emitPeers();
    }

    destroy(): void {
        for (const link of this.links.values()) {
            this.teardownLink(link);
        }

        this.links.clear();
        this.localStream?.getTracks().forEach((track) => track.stop());
        this.localStream = null;
        this.stopSpeakingLoop();

        this.state = { ...INITIAL_MULTI_VOICE_STATE };
    }

    private setTrackEnabled(enabled: boolean): void {
        this.localStream?.getAudioTracks().forEach((track) => {
            track.enabled = enabled;
        });
    }

    /**
     * El mic puede morirse sin ningún evento de WebRTC: el navegador revoca
     * el permiso, el sistema operativo le quita el device (auriculares
     * bluetooth que se desconectan, otra app lo toma en modo exclusivo).
     * `ended` es el único aviso que da el track en ese caso.
     */
    private watchLocalTrackHealth(stream: MediaStream): void {
        stream.getAudioTracks().forEach((track) => {
            track.onended = () => {
                if (this.localStream !== stream || !this.state.joined) {
                    return;
                }

                void this.recoverLocalTrack(1);
            };
        });
    }

    private async recoverLocalTrack(firstAttempt: number): Promise<void> {
        if (this.micRecoveryInFlight || !this.state.joined) {
            return;
        }

        this.micRecoveryInFlight = true;

        try {
            for (let attempt = firstAttempt; attempt <= MIC_RECOVERY_MAX_ATTEMPTS; attempt += 1) {
                if (!this.state.joined) {
                    return;
                }

                let stream: MediaStream;

                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true,
                        },
                    });
                } catch {
                    if (attempt >= MIC_RECOVERY_MAX_ATTEMPTS) {
                        this.patchState({ error: "Se perdió el micrófono y no se pudo reconectar." });
                        return;
                    }

                    await new Promise((resolve) => setTimeout(resolve, MIC_RECOVERY_DELAY_MS));
                    continue;
                }

                if (!this.state.joined) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                const wasTransmitting = this.state.transmitting;

                this.localStream?.getTracks().forEach((track) => track.stop());
                this.localStream = stream;
                this.setTrackEnabled(wasTransmitting);
                this.watchLocalTrackHealth(stream);

                const newTrack = stream.getAudioTracks()[0];

                if (newTrack) {
                    for (const link of this.links.values()) {
                        const sender = link.connection
                            ?.getSenders()
                            .find((candidate) => candidate.track?.kind === "audio");

                        void sender?.replaceTrack(newTrack).catch(() => undefined);
                    }
                }

                this.patchState({ error: null });
                return;
            }
        } finally {
            this.micRecoveryInFlight = false;
        }
    }

    private createPeerConnection(link: PeerLink): void {
        const connection = new RTCPeerConnection({ iceServers: link.iceServers as RTCIceServer[] });

        connection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal(link.roomId, { kind: "candidate", candidate: event.candidate.toJSON() });
            }
        };

        connection.ontrack = (event) => {
            const [remoteStream] = event.streams;

            if (remoteStream) {
                this.attachRemoteStream(link, remoteStream);
            }
        };

        connection.onconnectionstatechange = () => {
            if (connection.connectionState === "connected") {
                link.connected = true;
                link.reconnectAttempts = 0;
                this.clearRecoveryTimers(link);
                this.patchState({ status: "joined", error: null });
                this.emitPeers();
                return;
            }

            if (connection.connectionState === "failed") {
                link.connected = false;
                this.emitPeers();
                this.scheduleLinkRecovery(link, `No se pudo conectar con ${link.peerName}.`);
                return;
            }

            if (connection.connectionState === "disconnected") {
                link.connected = false;
                this.emitPeers();

                // "disconnected" suele resolverse solo en unos segundos (blip de red).
                // Recién si sigue así pasado el margen de gracia, se fuerza la reconexión.
                if (link.disconnectGraceTimer === null) {
                    link.disconnectGraceTimer = setTimeout(() => {
                        link.disconnectGraceTimer = null;

                        if (link.connection === connection && connection.connectionState === "disconnected") {
                            this.scheduleLinkRecovery(link, `Se cortó la conexión con ${link.peerName}.`);
                        }
                    }, DISCONNECT_GRACE_MS);
                }
            }
        };

        this.localStream?.getTracks().forEach((track) => connection.addTrack(track, this.localStream as MediaStream));

        link.connection = connection;
    }

    /**
     * Idempotente: un `ontrack` repetido (típico tras una renegociación)
     * reemplaza el stream del mismo elemento en vez de sumar una segunda
     * salida, que es lo que hacía sonar la voz duplicada.
     */
    private attachRemoteStream(link: PeerLink, stream: MediaStream): void {
        if (!link.audioSink) {
            const sink = document.createElement("audio");
            sink.autoplay = true;
            link.audioSink = sink;
        }

        if (link.audioSink.srcObject !== stream) {
            link.audioSink.srcObject = stream;
        }

        this.applyGain(link);
        void link.audioSink.play().catch(() => undefined);

        this.ensureSpeakingLoop();
    }

    private ensureSpeakingLoop(): void {
        if (this.speakingIntervalId !== null) {
            return;
        }

        this.speakingIntervalId = setInterval(() => {
            let changed = false;

            for (const link of this.links.values()) {
                const isSpeaking = this.readRemoteAudioLevel(link) > SPEAKING_LEVEL_THRESHOLD;

                if (isSpeaking !== link.speaking) {
                    link.speaking = isSpeaking;
                    changed = true;
                }
            }

            if (changed) {
                this.emitPeers();
            }
        }, SPEAKING_SAMPLE_INTERVAL_MS);
    }

    /**
     * Nivel de audio (0..1) que reporta WebRTC para el peer. Evita tener que
     * pasar el stream por Web Audio sólo para dibujar el indicador de "está
     * hablando". Si el navegador no lo implementa, el indicador queda apagado.
     */
    private readRemoteAudioLevel(link: PeerLink): number {
        const connection = link.connection;

        if (!connection || link.muted) {
            return 0;
        }

        let level = 0;

        for (const receiver of connection.getReceivers()) {
            if (receiver.track?.kind !== "audio" || typeof receiver.getSynchronizationSources !== "function") {
                continue;
            }

            for (const source of receiver.getSynchronizationSources()) {
                level = Math.max(level, source.audioLevel ?? 0);
            }
        }

        return level;
    }

    private stopSpeakingLoop(): void {
        if (this.speakingIntervalId !== null) {
            clearInterval(this.speakingIntervalId);
            this.speakingIntervalId = null;
        }
    }

    private maybeStartNegotiation(link: PeerLink): void {
        if (
            !link.initiator ||
            !this.state.joined ||
            !link.isPeerReady ||
            link.isNegotiating ||
            !link.connection
        ) {
            return;
        }

        link.isNegotiating = true;
        void this.createAndSendOffer(link);
    }

    private async createAndSendOffer(link: PeerLink): Promise<void> {
        const connection = link.connection;

        if (!connection) {
            return;
        }

        try {
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            this.sendSignal(link.roomId, { kind: "offer", sdp: offer.sdp ?? "" });
        } catch {
            link.isNegotiating = false;
            this.patchState({ error: `No se pudo iniciar la conexión con ${link.peerName}.` });
        }
    }

    private async handlePeerSignal(roomId: string, signal: VoicePeerSignal): Promise<void> {
        const link = this.links.get(roomId);

        if (!link) {
            return;
        }

        if (signal.kind === "ready") {
            link.isPeerReady = true;

            if (this.state.joined && !signal.reply) {
                // El peer acaba de entrar al canal. Si de este lado ya habia
                // una sesion armada (o una oferta sin responder), la rehacemos:
                // del otro lado hay una conexion nueva que no la puede continuar.
                if (link.hasRemoteDescription || link.isNegotiating) {
                    this.resetPeerConnection(link);
                }

                this.sendSignal(roomId, { kind: "ready", reply: true });
            }

            this.maybeStartNegotiation(link);
            return;
        }

        const connection = link.connection;

        if (!connection) {
            return;
        }

        if (signal.kind === "offer") {
            try {
                await connection.setRemoteDescription({ type: "offer", sdp: signal.sdp });
                link.hasRemoteDescription = true;
                await this.flushPendingCandidates(link);

                const answer = await connection.createAnswer();
                await connection.setLocalDescription(answer);
                this.sendSignal(roomId, { kind: "answer", sdp: answer.sdp ?? "" });
            } catch {
                this.patchState({ error: `No se pudo responder la conexión con ${link.peerName}.` });
            }
            return;
        }

        if (signal.kind === "answer") {
            try {
                await connection.setRemoteDescription({ type: "answer", sdp: signal.sdp });
                link.hasRemoteDescription = true;
                await this.flushPendingCandidates(link);
            } catch {
                this.patchState({ error: `No se pudo completar la conexión con ${link.peerName}.` });
            }
            return;
        }

        if (signal.kind === "candidate") {
            if (!link.hasRemoteDescription) {
                link.pendingCandidates.push(signal.candidate);
                return;
            }

            await connection.addIceCandidate(signal.candidate).catch(() => undefined);
        }
    }

    private async flushPendingCandidates(link: PeerLink): Promise<void> {
        const connection = link.connection;

        if (!connection) {
            return;
        }

        const candidates = link.pendingCandidates;
        link.pendingCandidates = [];

        for (const candidate of candidates) {
            await connection.addIceCandidate(candidate).catch(() => undefined);
        }
    }

    private closePeerConnection(link: PeerLink): void {
        this.clearRecoveryTimers(link);

        if (link.audioSink) {
            link.audioSink.pause();
            link.audioSink.srcObject = null;
            link.audioSink = null;
        }

        if (link.connection) {
            link.connection.onicecandidate = null;
            link.connection.ontrack = null;
            link.connection.onconnectionstatechange = null;
            link.connection.close();
            link.connection = null;
        }

        link.isNegotiating = false;
        link.hasRemoteDescription = false;
        link.pendingCandidates = [];
        link.connected = false;
        link.speaking = false;
    }

    /** Rearma la conexion sin soltar el microfono, para renegociar desde cero. */
    private resetPeerConnection(link: PeerLink): void {
        this.closePeerConnection(link);
        this.createPeerConnection(link);
    }

    private clearRecoveryTimers(link: PeerLink): void {
        if (link.reconnectTimer !== null) {
            clearTimeout(link.reconnectTimer);
            link.reconnectTimer = null;
        }

        if (link.disconnectGraceTimer !== null) {
            clearTimeout(link.disconnectGraceTimer);
            link.disconnectGraceTimer = null;
        }
    }

    /**
     * Auto-recuperación de un link roto: reintenta con backoff creciente hasta
     * un tope, en vez de dejar la conexión muerta para siempre (que es lo que
     * pasaba antes: "failed" sólo mostraba un error y ahí quedaba).
     */
    private scheduleLinkRecovery(link: PeerLink, errorMessage: string): void {
        if (!this.state.joined || !this.links.has(link.roomId)) {
            return;
        }

        this.patchState({ error: errorMessage });

        if (link.reconnectTimer !== null) {
            return;
        }

        if (link.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
            return;
        }

        const delay = Math.min(
            RECONNECT_BASE_DELAY_MS * 2 ** link.reconnectAttempts,
            RECONNECT_MAX_DELAY_MS,
        );

        link.reconnectAttempts += 1;
        link.reconnectTimer = setTimeout(() => {
            link.reconnectTimer = null;
            this.attemptLinkRecovery(link);
        }, delay);
    }

    /** Rearma la conexión del link y le avisa al otro lado para que también se resincronice. */
    private attemptLinkRecovery(link: PeerLink): void {
        if (!this.state.joined || !this.links.has(link.roomId)) {
            return;
        }

        this.resetPeerConnection(link);
        this.sendSignal(link.roomId, { kind: "ready", reply: false });
        this.maybeStartNegotiation(link);
    }

    private teardownLink(link: PeerLink): void {
        this.closePeerConnection(link);
    }

    private emitPeers(): void {
        const peers: VoicePeerLinkState[] = [...this.links.values()].map((link) => ({
            roomId: link.roomId,
            peerId: link.peerId,
            peerName: link.peerName,
            connected: link.connected,
            speaking: link.speaking,
            muted: link.muted,
            distance: link.distance,
        }));

        this.patchState({ peers });
    }

    private patchState(patch: Partial<MultiVoiceState>): void {
        this.state = { ...this.state, ...patch };
        this.onStateChange(this.state);
    }
}
