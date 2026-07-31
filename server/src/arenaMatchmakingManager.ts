import type { GameApi } from "./game";
import type { HandleProtocolApi } from "./handleProtocol";
import type { SocketApi } from "./socket";
import type { RuntimeCharacter } from "./types/runtime";
import { getCharacterById, getClientById } from "./runtimeRegistry";
import * as safeZone from "./safeZone";

const vars = require("./vars");
const funct = require("./functions");

type QueueEntry = {
    id: string;
    leaderId: string;
    characterIds: string[];
    isParty: boolean;
    joinedAt: number;
};

function getGame() {
    return require("./game") as GameApi;
}

function getHandleProtocol() {
    return require("./handleProtocol") as HandleProtocolApi;
}

function getSocket() {
    return require("./socket") as SocketApi;
}

function getChallengeManager() {
    return require("./challengeManager");
}

function now() {
    return Date.now();
}

function isInSafeZone(user: RuntimeCharacter | undefined) {
    if (!user) {
        return false;
    }

    return safeZone.isSafeZonePosition(user.map, user.pos);
}

function isInPvpMode(user: RuntimeCharacter | undefined) {
    return Boolean(user?.pvpChar || user?.arenaRoomId);
}

function sendConsoleMessage(user: RuntimeCharacter, message: string, color = "#E69500") {
    const client = getClientById(user.id);

    if (!client) {
        return;
    }

    const handleProtocol = getHandleProtocol();
    handleProtocol.console(message, color, 1, 0, client);
}

export const arenaMatchmakingManager = {
    queue: [] as QueueEntry[],

    createId() {
        return `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    },

    requireEligibleCharacter(user: RuntimeCharacter) {
        if (!user || user.cerrado || !user.connected) {
            throw new Error("Debes estar conectado para anotarte en la arena.");
        }

        if (isInPvpMode(user)) {
            throw new Error("Solo puedes anotarte a la arena desde el Mundo Abierto.");
        }

        if (user.dead) {
            throw new Error("No puedes anotarte a la arena estando muerto.");
        }

        if (!isInSafeZone(user)) {
            throw new Error("Solo puedes anotarte a la arena dentro de una Zona Segura.");
        }

        if (getChallengeManager().isCharacterBusy(user)) {
            throw new Error("Ya estás participando en un reto o partida activa.");
        }

        if (this.isInQueue(user.id)) {
            throw new Error("Ya estás anotado en la cola de la arena.");
        }
    },

    isInQueue(userId: string | number): boolean {
        const strId = String(userId);
        return this.queue.some((entry) => entry.characterIds.includes(strId));
    },

    getQueueEntryForUser(userId: string | number): QueueEntry | undefined {
        const strId = String(userId);
        return this.queue.find((entry) => entry.characterIds.includes(strId));
    },

    enqueue(idUser: string | number) {
        const user = getCharacterById(idUser);

        if (!user) {
            throw new Error("Personaje no encontrado.");
        }

        this.requireEligibleCharacter(user);

        let teamMembers: RuntimeCharacter[] = [];
        let isParty = false;

        if (user.partyId) {
            const partyLeaderId = String(user.partyLeaderId ?? "");

            if (partyLeaderId && partyLeaderId !== String(user.id)) {
                throw new Error("Solo el líder de la party puede inscribir al equipo en la cola de arena.");
            }

            const party = vars.parties?.[String(user.partyId)] as { memberIds?: Array<string | number> } | undefined;

            if (!party || !Array.isArray(party.memberIds) || party.memberIds.length !== 2) {
                throw new Error("La cola 2vs2 en party requiere una party de exactamente 2 jugadores.");
            }

            const members = party.memberIds
                .map((mId) => getCharacterById(mId))
                .filter((m): m is RuntimeCharacter => Boolean(m));

            if (members.length !== 2) {
                throw new Error("Todos los integrantes de la party deben estar conectados.");
            }

            for (const member of members) {
                this.requireEligibleCharacter(member);
            }

            teamMembers = members;
            isParty = true;
        } else {
            teamMembers = [user];
            isParty = false;
        }

        const entry: QueueEntry = {
            id: this.createId(),
            leaderId: String(user.id),
            characterIds: teamMembers.map((m) => String(m.id)),
            isParty,
            joinedAt: now(),
        };

        this.queue.push(entry);

        const currentTotal = this.getTotalPlayersInQueue();

        for (const member of teamMembers) {
            sendConsoleMessage(
                member,
                `[Arena 2v2] Te has unido a la cola de Matchmaking. (${currentTotal}/4 jugadores anotados)`,
                "#00E676",
            );
        }

        this.processQueue();

        return {
            ok: true,
            inQueue: true,
            totalInQueue: currentTotal,
        };
    },

    dequeue(idUser: string | number) {
        const strId = String(idUser);
        const entryIndex = this.queue.findIndex((e) => e.characterIds.includes(strId));

        if (entryIndex === -1) {
            throw new Error("No estás en la cola de la arena.");
        }

        const [entry] = this.queue.splice(entryIndex, 1);

        for (const charId of entry.characterIds) {
            const member = getCharacterById(charId);

            if (member) {
                sendConsoleMessage(member, "[Arena 2v2] Has salido de la cola de matchmaking.", "#FF5252");
            }
        }

        return {
            ok: true,
            inQueue: false,
            totalInQueue: this.getTotalPlayersInQueue(),
        };
    },

    getTotalPlayersInQueue(): number {
        return this.queue.reduce((acc, entry) => acc + entry.characterIds.length, 0);
    },

    pruneQueue() {
        this.queue = this.queue.filter((entry) => {
            const validMembers = entry.characterIds
                .map((id) => getCharacterById(id))
                .filter((user): user is RuntimeCharacter => {
                    if (!user || user.cerrado || !user.connected || user.dead) {
                        return false;
                    }

                    if (isInPvpMode(user) || !isInSafeZone(user)) {
                        return false;
                    }

                    if (getChallengeManager().isCharacterBusy(user)) {
                        return false;
                    }

                    return true;
                });

            if (entry.isParty) {
                return validMembers.length === 2;
            }

            return validMembers.length === 1;
        });
    },

    processQueue() {
        this.pruneQueue();

        const totalPlayers = this.getTotalPlayersInQueue();

        if (totalPlayers < 4) {
            return;
        }

        const selectedEntries: QueueEntry[] = [];
        let accumulatedPlayers = 0;

        for (const entry of this.queue) {
            if (accumulatedPlayers + entry.characterIds.length <= 4) {
                selectedEntries.push(entry);
                accumulatedPlayers += entry.characterIds.length;

                if (accumulatedPlayers === 4) {
                    break;
                }
            }
        }

        if (accumulatedPlayers !== 4) {
            return;
        }

        for (const entry of selectedEntries) {
            const idx = this.queue.findIndex((e) => e.id === entry.id);

            if (idx !== -1) {
                this.queue.splice(idx, 1);
            }
        }

        const allMatchedUsers: RuntimeCharacter[] = [];

        for (const entry of selectedEntries) {
            for (const charId of entry.characterIds) {
                const user = getCharacterById(charId);

                if (user) {
                    allMatchedUsers.push(user);
                }
            }
        }

        if (allMatchedUsers.length !== 4) {
            this.processQueue();
            return;
        }

        let teamOne: RuntimeCharacter[] = [];
        let teamTwo: RuntimeCharacter[] = [];

        if (selectedEntries.length === 2 && selectedEntries[0].isParty && selectedEntries[1].isParty) {
            teamOne = selectedEntries[0].characterIds
                .map((id) => getCharacterById(id))
                .filter((u): u is RuntimeCharacter => Boolean(u));
            teamTwo = selectedEntries[1].characterIds
                .map((id) => getCharacterById(id))
                .filter((u): u is RuntimeCharacter => Boolean(u));
        } else if (selectedEntries.length === 3 && selectedEntries.some((e) => e.isParty)) {
            const partyEntry = selectedEntries.find((e) => e.isParty)!;
            const soloEntries = selectedEntries.filter((e) => !e.isParty);

            teamOne = partyEntry.characterIds
                .map((id) => getCharacterById(id))
                .filter((u): u is RuntimeCharacter => Boolean(u));
            teamTwo = soloEntries
                .flatMap((e) => e.characterIds)
                .map((id) => getCharacterById(id))
                .filter((u): u is RuntimeCharacter => Boolean(u));
        } else {
            allMatchedUsers.sort((a, b) => Number(b.level ?? 1) - Number(a.level ?? 1));

            teamOne = [allMatchedUsers[0], allMatchedUsers[3]];
            teamTwo = [allMatchedUsers[1], allMatchedUsers[2]];
        }

        for (const user of allMatchedUsers) {
            sendConsoleMessage(user, "¡PARTIDA ENCONTRADA! Entrando a la Arena 2v2...", "#00E676");
        }

        try {
            getChallengeManager().createMatchmaking2v2Match(teamOne, teamTwo);
        } catch (error) {
            funct.dumpError(error);

            for (const user of allMatchedUsers) {
                sendConsoleMessage(user, "[Arena 2v2] Error al iniciar la partida. Regresando a la cola.", "#FF5252");
            }
        }
    },
};

module.exports = { arenaMatchmakingManager };
