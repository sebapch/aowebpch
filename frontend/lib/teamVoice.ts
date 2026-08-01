import type {
    VoiceIceServer,
    VoicePeerSignal,
    VoiceSignalPayload,
} from "./aowProtocol";

export type TeamVoiceStatus =
    | "idle"
    | "available"
    | "requesting-mic"
    | "connecting"
    | "connected"
    | "error";

export type TeamVoiceState = {
    status: TeamVoiceStatus;
    roomId: string | null;
    peerName: string | null;
    joined: boolean;
    /** El micrófono está abierto ahora mismo (push to talk apretado). */
    transmitting: boolean;
    peerSpeaking: boolean;
    peerMuted: boolean;
    error: string | null;
};

export const INITIAL_TEAM_VOICE_STATE: TeamVoiceState = {
    status: "idle",
    roomId: null,
    peerName: null,
    joined: false,
    transmitting: false,
    peerSpeaking: false,
    peerMuted: false,
    error: null,
};

type TeamVoiceChatOptions = {
    sendSignal: (signal: VoicePeerSignal) => void;
    onStateChange: (state: TeamVoiceState) => void;
};

const SPEAKING_LEVEL_THRESHOLD = 0.02;
const SPEAKING_SAMPLE_INTERVAL_MS = 120;

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

/**
 * Canal de voz P2P entre los dos integrantes de un equipo en un 2v2.
 *
 * El servidor sólo reenvía el handshake (oferta, respuesta y candidatos ICE):
 * el audio viaja directo entre los dos navegadores por WebRTC.
 */
export class TeamVoiceChat {
    private readonly sendSignal: TeamVoiceChatOptions["sendSignal"];
    private readonly onStateChange: TeamVoiceChatOptions["onStateChange"];

    private state: TeamVoiceState = { ...INITIAL_TEAM_VOICE_STATE };

    private roomId: string | null = null;
    private peerId: string | null = null;
    private isInitiator = false;
    private iceServers: VoiceIceServer[] = [];

    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteAudio: HTMLAudioElement | null = null;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private analyserBuffer: Uint8Array<ArrayBuffer> | null = null;
    private speakingIntervalId: ReturnType<typeof setInterval> | null = null;

    private isPeerReady = false;
    private isNegotiating = false;
    private hasRemoteDescription = false;
    private pendingCandidates: RTCIceCandidateInit[] = [];

    constructor(options: TeamVoiceChatOptions) {
        this.sendSignal = options.sendSignal;
        this.onStateChange = options.onStateChange;
    }

    getState(): TeamVoiceState {
        return this.state;
    }

    handlePayload(payload: VoiceSignalPayload): void {
        if (payload.type === "room") {
            this.openRoom(payload);
            return;
        }

        if (payload.type === "closed") {
            if (!this.roomId || payload.roomId === this.roomId) {
                this.closeRoom();
            }
            return;
        }

        if (payload.type === "signal") {
            if (this.roomId && payload.roomId !== this.roomId) {
                return;
            }

            void this.handlePeerSignal(payload.signal);
        }
    }

    /** El match empezó: ya se sabe quién es el compañero, falta que el jugador acepte. */
    private openRoom(payload: Extract<VoiceSignalPayload, { type: "room" }>): void {
        if (this.roomId && this.roomId !== payload.roomId) {
            this.teardownConnection();
        }

        this.roomId = payload.roomId;
        this.peerId = payload.peerId;
        this.isInitiator = payload.initiator;
        this.iceServers = payload.iceServers ?? [];
        this.isPeerReady = false;

        this.patchState({
            status: this.state.joined ? this.state.status : "available",
            roomId: payload.roomId,
            peerName: payload.peerName,
            error: isMediaDevicesSupported()
                ? null
                : "Tu navegador no soporta chat de voz.",
        });
    }

    closeRoom(): void {
        this.teardownConnection();
        this.roomId = null;
        this.peerId = null;
        this.isInitiator = false;
        this.iceServers = [];
        this.patchState({ ...INITIAL_TEAM_VOICE_STATE });
    }

    async join(): Promise<void> {
        if (!this.roomId || this.state.joined) {
            return;
        }

        if (!isMediaDevicesSupported()) {
            this.patchState({
                status: "error",
                error: "Tu navegador no soporta chat de voz.",
            });
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
            this.patchState({
                status: "error",
                joined: false,
                error: describeMicError(error),
            });
            return;
        }

        // El jugador se puede haber ido del match mientras el navegador pedía permiso.
        if (!this.roomId) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }

        this.localStream = stream;
        // Push to talk: el micrófono arranca cerrado y sólo se abre con la tecla.
        this.setTrackEnabled(false);

        this.createPeerConnection();
        this.patchState({ status: "connecting", joined: true });

        this.sendSignal({ kind: "ready", reply: false });
        this.maybeStartNegotiation();
    }

    leave(): void {
        if (!this.state.joined) {
            return;
        }

        this.teardownConnection();
        this.patchState({
            status: this.roomId ? "available" : "idle",
            joined: false,
            transmitting: false,
            peerSpeaking: false,
            error: null,
        });
    }

    setTransmitting(active: boolean): void {
        if (!this.state.joined || this.state.transmitting === active) {
            return;
        }

        this.setTrackEnabled(active);
        this.patchState({ transmitting: active });
    }

    setPeerMuted(muted: boolean): void {
        if (this.remoteAudio) {
            this.remoteAudio.muted = muted;
        }

        this.patchState({ peerMuted: muted });
    }

    destroy(): void {
        this.teardownConnection();
        this.roomId = null;
        this.peerId = null;
        this.state = { ...INITIAL_TEAM_VOICE_STATE };
    }

    private setTrackEnabled(enabled: boolean): void {
        this.localStream?.getAudioTracks().forEach((track) => {
            track.enabled = enabled;
        });
    }

    private createPeerConnection(): void {
        const connection = new RTCPeerConnection({
            iceServers: this.iceServers as RTCIceServer[],
        });

        connection.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal({
                    kind: "candidate",
                    candidate: event.candidate.toJSON(),
                });
            }
        };

        connection.ontrack = (event) => {
            const [remoteStream] = event.streams;

            if (remoteStream) {
                this.attachRemoteStream(remoteStream);
            }
        };

        connection.onconnectionstatechange = () => {
            if (connection.connectionState === "connected") {
                this.patchState({ status: "connected", error: null });
                return;
            }

            if (connection.connectionState === "failed") {
                this.patchState({
                    status: "error",
                    error: "No se pudo establecer la conexión de voz.",
                });
                return;
            }

            if (connection.connectionState === "disconnected") {
                this.patchState({ status: "connecting" });
            }
        };

        this.localStream
            ?.getTracks()
            .forEach((track) =>
                connection.addTrack(track, this.localStream as MediaStream),
            );

        this.peerConnection = connection;
    }

    private attachRemoteStream(stream: MediaStream): void {
        if (!this.remoteAudio) {
            const audio = document.createElement("audio");
            audio.autoplay = true;
            audio.muted = this.state.peerMuted;
            this.remoteAudio = audio;
        }

        this.remoteAudio.srcObject = stream;
        void this.remoteAudio.play().catch(() => undefined);
        this.startSpeakingDetection(stream);
    }

    private startSpeakingDetection(stream: MediaStream): void {
        this.stopSpeakingDetection();

        const AudioContextCtor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;

        if (!AudioContextCtor) {
            return;
        }

        try {
            const context = new AudioContextCtor();
            const analyser = context.createAnalyser();
            analyser.fftSize = 512;
            context.createMediaStreamSource(stream).connect(analyser);

            this.audioContext = context;
            this.analyser = analyser;
            this.analyserBuffer = new Uint8Array(
                new ArrayBuffer(analyser.fftSize),
            );
        } catch {
            return;
        }

        this.speakingIntervalId = setInterval(() => {
            const analyser = this.analyser;
            const buffer = this.analyserBuffer;

            if (!analyser || !buffer) {
                return;
            }

            analyser.getByteTimeDomainData(buffer);

            let sumOfSquares = 0;

            for (const sample of buffer) {
                const normalized = sample / 128 - 1;
                sumOfSquares += normalized * normalized;
            }

            const level = Math.sqrt(sumOfSquares / buffer.length);
            const isSpeaking = level > SPEAKING_LEVEL_THRESHOLD;

            if (isSpeaking !== this.state.peerSpeaking) {
                this.patchState({ peerSpeaking: isSpeaking });
            }
        }, SPEAKING_SAMPLE_INTERVAL_MS);
    }

    private stopSpeakingDetection(): void {
        if (this.speakingIntervalId !== null) {
            clearInterval(this.speakingIntervalId);
            this.speakingIntervalId = null;
        }

        this.analyser = null;
        this.analyserBuffer = null;

        if (this.audioContext) {
            void this.audioContext.close().catch(() => undefined);
            this.audioContext = null;
        }
    }

    private maybeStartNegotiation(): void {
        if (
            !this.isInitiator ||
            !this.state.joined ||
            !this.isPeerReady ||
            this.isNegotiating ||
            !this.peerConnection
        ) {
            return;
        }

        this.isNegotiating = true;
        void this.createAndSendOffer();
    }

    private async createAndSendOffer(): Promise<void> {
        const connection = this.peerConnection;

        if (!connection) {
            return;
        }

        try {
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            this.sendSignal({ kind: "offer", sdp: offer.sdp ?? "" });
        } catch {
            this.isNegotiating = false;
            this.patchState({
                status: "error",
                error: "No se pudo iniciar la conexión de voz.",
            });
        }
    }

    private async handlePeerSignal(signal: VoicePeerSignal): Promise<void> {
        if (signal.kind === "ready") {
            this.isPeerReady = true;

            if (this.state.joined && !signal.reply) {
                // El companero acaba de entrar al canal. Si de este lado ya habia
                // una sesion armada (o una oferta sin responder), la rehacemos:
                // del otro lado hay una conexion nueva que no la puede continuar.
                if (this.hasRemoteDescription || this.isNegotiating) {
                    this.resetPeerConnection();
                }

                this.sendSignal({ kind: "ready", reply: true });
            }

            this.maybeStartNegotiation();
            return;
        }

        const connection = this.peerConnection;

        if (!connection) {
            return;
        }

        if (signal.kind === "offer") {
            try {
                await connection.setRemoteDescription({
                    type: "offer",
                    sdp: signal.sdp,
                });
                this.hasRemoteDescription = true;
                await this.flushPendingCandidates();

                const answer = await connection.createAnswer();
                await connection.setLocalDescription(answer);
                this.sendSignal({ kind: "answer", sdp: answer.sdp ?? "" });
            } catch {
                this.patchState({
                    status: "error",
                    error: "No se pudo responder la conexión de voz.",
                });
            }
            return;
        }

        if (signal.kind === "answer") {
            try {
                await connection.setRemoteDescription({
                    type: "answer",
                    sdp: signal.sdp,
                });
                this.hasRemoteDescription = true;
                await this.flushPendingCandidates();
            } catch {
                this.patchState({
                    status: "error",
                    error: "No se pudo completar la conexión de voz.",
                });
            }
            return;
        }

        if (signal.kind === "candidate") {
            if (!this.hasRemoteDescription) {
                this.pendingCandidates.push(signal.candidate);
                return;
            }

            await connection.addIceCandidate(signal.candidate).catch(() => undefined);
        }
    }

    private async flushPendingCandidates(): Promise<void> {
        const connection = this.peerConnection;

        if (!connection) {
            return;
        }

        const candidates = this.pendingCandidates;
        this.pendingCandidates = [];

        for (const candidate of candidates) {
            await connection.addIceCandidate(candidate).catch(() => undefined);
        }
    }

    private closePeerConnection(): void {
        this.stopSpeakingDetection();

        if (this.remoteAudio) {
            this.remoteAudio.pause();
            this.remoteAudio.srcObject = null;
        }

        if (this.peerConnection) {
            this.peerConnection.onicecandidate = null;
            this.peerConnection.ontrack = null;
            this.peerConnection.onconnectionstatechange = null;
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.isNegotiating = false;
        this.hasRemoteDescription = false;
        this.pendingCandidates = [];
    }

    /** Rearma la conexion sin soltar el microfono, para renegociar desde cero. */
    private resetPeerConnection(): void {
        this.closePeerConnection();
        this.patchState({ status: "connecting", peerSpeaking: false });
        this.createPeerConnection();
    }

    private teardownConnection(): void {
        this.closePeerConnection();
        this.remoteAudio = null;

        this.localStream?.getTracks().forEach((track) => track.stop());
        this.localStream = null;

        this.isPeerReady = false;
    }

    private patchState(patch: Partial<TeamVoiceState>): void {
        this.state = { ...this.state, ...patch };
        this.onStateChange(this.state);
    }
}
