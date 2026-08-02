import type { GameApi } from "./game";
import type { HandleProtocolApi } from "./handleProtocol";
import type { RuntimeCharacter } from "./types/runtime";
import { getCharacterById, getClientById } from "./runtimeRegistry";
import {
    VOICE_SIGNAL_MAX_PER_WINDOW,
    VOICE_SIGNAL_WINDOW_MS,
    getVoiceIceServers,
} from "./voiceChat";

export {};

const vars = require("./vars");

/**
 * Radio en tiles dentro del cual dos jugadores unidos al canal arman una
 * conexión P2P de voz. Menor al de visión (±15, `vars.areaVisionRangeX/Y`)
 * para que sólo se escuche gente relativamente cerca.
 */
const VOICE_PROXIMITY_RANGE = 7;

/**
 * Tope de conexiones simultáneas por jugador: en una plaza llena sólo nos
 * conectamos a los N más cercanos, para no armar un mesh gigantesco.
 */
const MAX_PROXIMITY_PEERS = 8;

function getGame() {
    return require("./game") as GameApi;
}

function getHandleProtocol() {
    return require("./handleProtocol") as HandleProtocolApi;
}

function now() {
    return Date.now();
}

function getVoiceRoomId(idA: string | number, idB: string | number) {
    const [lo, hi] = [String(idA), String(idB)].sort();
    return `prox:${lo}:${hi}`;
}

function isMapVoiceEnabled(mapId: number | undefined): boolean {
    if (typeof mapId !== "number") {
        return false;
    }

    return vars.mapData?.[mapId]?.voiceChatEnabled === true;
}

type VoiceProximityPayload =
    | {
          type: "room";
          roomId: string;
          peerId: string;
          peerName: string;
          initiator: boolean;
          iceServers: ReturnType<typeof getVoiceIceServers>;
      }
    | { type: "signal"; roomId: string; fromId: string; signal: unknown }
    | { type: "closed"; roomId: string }
    | { type: "distance"; roomId: string; distance: number };

const proximityVoice = {
    /** Ids (string) de usuarios que activaron el mic del canal de proximidad. */
    joinedUsers: new Set<string>() as Set<string>,
    /** Por usuario, ids de los peers con los que tiene una sala WebRTC abierta ahora. */
    activePeers: {} as Record<string, Set<string>>,
    voiceSignalRates: {} as Record<string, { windowStartedAt: number; count: number }>,

    isJoined(idUser: string | number): boolean {
        return this.joinedUsers.has(String(idUser));
    },

    sendVoicePayload(idUser: string | number, payload: VoiceProximityPayload) {
        const client = getClientById(idUser);

        if (!client) {
            return;
        }

        getHandleProtocol().voiceSignal(payload, client);
    },

    /** El jugador prende el mic del canal de proximidad (join explícito, análogo al botón del panel). */
    join(idUser: string | number) {
        const user = getCharacterById(idUser);

        if (!user || !isMapVoiceEnabled(user.map)) {
            return;
        }

        this.joinedUsers.add(String(idUser));
        this.recomputePeers(user);
    },

    /** Cierra todas las salas activas del usuario: desconexión, cambio de mapa o salida explícita. */
    leaveAll(idUser: string | number) {
        const key = String(idUser);
        const hadPeers = this.activePeers[key];

        this.joinedUsers.delete(key);
        delete this.voiceSignalRates[key];
        delete this.activePeers[key];

        if (!hadPeers) {
            return;
        }

        for (const peerId of hadPeers) {
            const roomId = getVoiceRoomId(key, peerId);
            this.activePeers[peerId]?.delete(key);
            this.sendVoicePayload(key, { type: "closed", roomId });
            this.sendVoicePayload(peerId, { type: "closed", roomId });
        }
    },

    /** Se llama después de cada paso de movimiento de un usuario unido al canal. */
    onUserMoved(user: RuntimeCharacter) {
        const key = String(user.id);

        if (!this.joinedUsers.has(key)) {
            return;
        }

        if (!isMapVoiceEnabled(user.map)) {
            this.leaveAll(user.id);
            return;
        }

        this.recomputePeers(user);
    },

    recomputePeers(user: RuntimeCharacter) {
        const key = String(user.id);
        const game = getGame();

        const candidates: Array<{ id: string; distance: number }> = [];

        game.loopAreaPos(user.map, user.pos, (target: RuntimeCharacter) => {
            const targetKey = String(target.id);

            if (targetKey === key || !this.joinedUsers.has(targetKey)) {
                return;
            }

            const distance = Math.hypot(user.pos.x - target.pos.x, user.pos.y - target.pos.y);

            if (distance <= VOICE_PROXIMITY_RANGE) {
                candidates.push({ id: targetKey, distance });
            }
        });

        candidates.sort((a, b) => a.distance - b.distance);
        const nearestCandidates = candidates.slice(0, MAX_PROXIMITY_PEERS);
        const nextPeers = new Set(nearestCandidates.map((candidate) => candidate.id));
        const previousPeers = this.activePeers[key] ?? new Set<string>();

        for (const peerId of previousPeers) {
            if (nextPeers.has(peerId)) {
                continue;
            }

            const roomId = getVoiceRoomId(key, peerId);
            this.activePeers[peerId]?.delete(key);
            this.sendVoicePayload(key, { type: "closed", roomId });
            this.sendVoicePayload(peerId, { type: "closed", roomId });
        }

        const iceServers = getVoiceIceServers();

        for (const candidate of nearestCandidates) {
            if (previousPeers.has(candidate.id)) {
                continue;
            }

            const peer = getCharacterById(candidate.id);

            if (!peer) {
                continue;
            }

            const roomId = getVoiceRoomId(key, candidate.id);
            const initiatorId = key < candidate.id ? key : candidate.id;

            if (!this.activePeers[candidate.id]) {
                this.activePeers[candidate.id] = new Set();
            }

            this.activePeers[candidate.id].add(key);

            this.sendVoicePayload(key, {
                type: "room",
                roomId,
                peerId: candidate.id,
                peerName: String(peer.nameCharacter ?? "Jugador"),
                initiator: key === initiatorId,
                iceServers,
            });

            this.sendVoicePayload(candidate.id, {
                type: "room",
                roomId,
                peerId: key,
                peerName: String(user.nameCharacter ?? "Jugador"),
                initiator: candidate.id === initiatorId,
                iceServers,
            });
        }

        this.activePeers[key] = nextPeers;

        for (const candidate of nearestCandidates) {
            const roomId = getVoiceRoomId(key, candidate.id);
            this.sendVoicePayload(key, { type: "distance", roomId, distance: candidate.distance });
            this.sendVoicePayload(candidate.id, { type: "distance", roomId, distance: candidate.distance });
        }
    },

    isVoiceSignalRateExceeded(idUser: string | number): boolean {
        const key = String(idUser);
        const currentTime = now();
        const bucket = this.voiceSignalRates[key];

        if (!bucket || currentTime - bucket.windowStartedAt >= VOICE_SIGNAL_WINDOW_MS) {
            this.voiceSignalRates[key] = { windowStartedAt: currentTime, count: 1 };
            return false;
        }

        bucket.count += 1;

        return bucket.count > VOICE_SIGNAL_MAX_PER_WINDOW;
    },

    /**
     * Reenvía la señalización WebRTC (oferta/respuesta/candidatos ICE) al
     * peer dueño de esa sala puntual. El servidor nunca ve ni transporta el
     * audio: sólo el handshake.
     */
    relayVoiceSignal(idUser: string | number, roomId: string, signal: unknown) {
        const key = String(idUser);

        if (!this.joinedUsers.has(key)) {
            return;
        }

        if (this.isVoiceSignalRateExceeded(idUser)) {
            return;
        }

        const peers = this.activePeers[key];

        if (!peers) {
            return;
        }

        const peerId = [...peers].find((candidate) => getVoiceRoomId(key, candidate) === roomId);

        if (!peerId) {
            return;
        }

        this.sendVoicePayload(peerId, {
            type: "signal",
            roomId,
            fromId: key,
            signal,
        });
    },
};

export type ProximityVoiceApi = typeof proximityVoice;

module.exports = proximityVoice;
