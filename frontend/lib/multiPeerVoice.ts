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

    sourceNode: MediaStreamAudioSourceNode | null;
    gainNode: GainNode | null;
    analyser: AnalyserNode | null;
    analyserBuffer: Uint8Array<ArrayBuffer> | null;
    /**
     * Sink mudo obligatorio: Chrome no hace fluir un MediaStream remoto de
     * WebRTC por Web Audio si el stream no está además atado a un elemento
     * multimedia. El volumen real sale por el GainNode, no por acá.
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
    private audioContext: AudioContext | null = null;
    private speakingIntervalId: ReturnType<typeof setInterval> | null = null;
    /** Rango máximo usado para traducir distancia -> volumen (sólo relevante en proximidad). */
    private maxDistanceRange = 0;

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
                sourceNode: null,
                gainNode: null,
                analyser: null,
                analyserBuffer: null,
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
        if (!link.gainNode) {
            return;
        }

        if (link.muted) {
            link.gainNode.gain.value = 0;
            return;
        }

        if (link.distance === null || this.maxDistanceRange <= 0) {
            link.gainNode.gain.value = 1;
            return;
        }

        link.gainNode.gain.value = computeProximityGain(link.distance, this.maxDistanceRange);
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

        // Unirse siempre nace de un click, el unico momento en que el
        // navegador deja arrancar el AudioContext sin quedar suspendido.
        this.getAudioContext();
        void this.resumeAudioContext();

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

        if (this.audioContext) {
            void this.audioContext.close().catch(() => undefined);
            this.audioContext = null;
        }

        this.state = { ...INITIAL_MULTI_VOICE_STATE };
    }

    private setTrackEnabled(enabled: boolean): void {
        this.localStream?.getAudioTracks().forEach((track) => {
            track.enabled = enabled;
        });
    }

    private getAudioContext(): AudioContext | null {
        if (this.audioContext) {
            return this.audioContext;
        }

        const AudioContextCtor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

        if (!AudioContextCtor) {
            return null;
        }

        try {
            this.audioContext = new AudioContextCtor();
        } catch {
            this.audioContext = null;
        }

        return this.audioContext;
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
                this.patchState({ status: "joined", error: null });
                this.emitPeers();
                return;
            }

            if (connection.connectionState === "failed") {
                this.patchState({ error: `No se pudo conectar con ${link.peerName}.` });
                return;
            }

            if (connection.connectionState === "disconnected") {
                link.connected = false;
                this.emitPeers();
            }
        };

        this.localStream?.getTracks().forEach((track) => connection.addTrack(track, this.localStream as MediaStream));

        link.connection = connection;
    }

    private attachRemoteStream(link: PeerLink, stream: MediaStream): void {
        const context = this.getAudioContext();

        if (!context) {
            return;
        }

        // Chrome descarta el audio de un stream remoto que sólo pasa por Web
        // Audio: hay que atarlo tambien a un elemento multimedia para que el
        // pipeline arranque. Va en mute porque el volumen real (atenuado por
        // distancia) sale por el GainNode.
        if (!link.audioSink) {
            const sink = document.createElement("audio");
            sink.autoplay = true;
            sink.muted = true;
            link.audioSink = sink;
        }

        link.audioSink.srcObject = stream;
        void link.audioSink.play().catch(() => undefined);

        try {
            const source = context.createMediaStreamSource(stream);
            const gainNode = context.createGain();
            const analyser = context.createAnalyser();
            analyser.fftSize = 512;

            source.connect(gainNode);
            gainNode.connect(context.destination);
            source.connect(analyser);

            link.sourceNode = source;
            link.gainNode = gainNode;
            link.analyser = analyser;
            link.analyserBuffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
            this.applyGain(link);
        } catch {
            return;
        }

        void this.resumeAudioContext();
        this.ensureSpeakingLoop();
    }

    /** El navegador arranca el AudioContext suspendido hasta que hay un gesto del usuario. */
    private async resumeAudioContext(): Promise<void> {
        const context = this.audioContext;

        if (context && context.state === "suspended") {
            await context.resume().catch(() => undefined);
        }
    }

    private ensureSpeakingLoop(): void {
        if (this.speakingIntervalId !== null) {
            return;
        }

        this.speakingIntervalId = setInterval(() => {
            let changed = false;

            for (const link of this.links.values()) {
                const { analyser, analyserBuffer } = link;

                if (!analyser || !analyserBuffer) {
                    continue;
                }

                analyser.getByteTimeDomainData(analyserBuffer);

                let sumOfSquares = 0;

                for (const sample of analyserBuffer) {
                    const normalized = sample / 128 - 1;
                    sumOfSquares += normalized * normalized;
                }

                const level = Math.sqrt(sumOfSquares / analyserBuffer.length);
                const isSpeaking = level > SPEAKING_LEVEL_THRESHOLD;

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
        if (link.sourceNode) {
            link.sourceNode.disconnect();
            link.sourceNode = null;
        }

        if (link.gainNode) {
            link.gainNode.disconnect();
            link.gainNode = null;
        }

        if (link.analyser) {
            link.analyser.disconnect();
            link.analyser = null;
        }

        link.analyserBuffer = null;

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
