import type { GameApi } from "./game";
import type { HandleProtocolApi } from "./handleProtocol";
import type { SocketApi } from "./socket";
import type { RuntimeCharacter } from "./types/runtime";
import { getCharacterById, getClientById } from "./runtimeRegistry";
import * as safeZone from "./safeZone";

const vars = require("./vars");
const funct = require("./functions");

export type MatchmakingTeamSize = 2 | 3 | 4;

const MATCHMAKING_TEAM_SIZES: MatchmakingTeamSize[] = [2, 3, 4];

type QueueEntry = {
    id: string;
    leaderId: string;
    characterIds: string[];
    isParty: boolean;
    teamSize: MatchmakingTeamSize;
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

function isMatchmakingTeamSize(value: unknown): value is MatchmakingTeamSize {
    return MATCHMAKING_TEAM_SIZES.includes(value as MatchmakingTeamSize);
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

    enqueue(idUser: string | number, teamSize: unknown) {
        if (!isMatchmakingTeamSize(teamSize)) {
            throw new Error("Modo de matchmaking inválido. Elegí 2v2, 3v3 o 4v4.");
        }

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

            if (!party || !Array.isArray(party.memberIds) || party.memberIds.length !== teamSize) {
                throw new Error(`La cola ${teamSize}vs${teamSize} en party requiere una party de exactamente ${teamSize} jugadores.`);
            }

            const members = party.memberIds
                .map((mId) => getCharacterById(mId))
                .filter((m): m is RuntimeCharacter => Boolean(m));

            if (members.length !== teamSize) {
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
            teamSize,
            joinedAt: now(),
        };

        this.queue.push(entry);

        const currentTotal = this.getTotalPlayersInQueue(teamSize);

        for (const member of teamMembers) {
            sendConsoleMessage(
                member,
                `[Arena ${teamSize}v${teamSize}] Te has unido a la cola de Matchmaking. (${currentTotal}/${teamSize * 2} jugadores anotados)`,
                "#00E676",
            );
        }

        this.processQueue(teamSize);

        return {
            ok: true,
            inQueue: true,
            teamSize,
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
                sendConsoleMessage(member, `[Arena ${entry.teamSize}v${entry.teamSize}] Has salido de la cola de matchmaking.`, "#FF5252");
            }
        }

        return {
            ok: true,
            inQueue: false,
            totalInQueue: this.getTotalPlayersInQueue(entry.teamSize),
        };
    },

    getTotalPlayersInQueue(teamSize?: MatchmakingTeamSize): number {
        return this.queue
            .filter((entry) => teamSize === undefined || entry.teamSize === teamSize)
            .reduce((acc, entry) => acc + entry.characterIds.length, 0);
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
                return validMembers.length === entry.teamSize;
            }

            return validMembers.length === 1;
        });
    },

    processQueue(teamSize: MatchmakingTeamSize) {
        this.pruneQueue();

        const requiredPlayers = teamSize * 2;
        const totalPlayers = this.getTotalPlayersInQueue(teamSize);

        if (totalPlayers < requiredPlayers) {
            return;
        }

        const eligibleEntries = this.queue.filter((entry) => entry.teamSize === teamSize);
        const selectedEntries: QueueEntry[] = [];
        let accumulatedPlayers = 0;

        for (const entry of eligibleEntries) {
            if (accumulatedPlayers + entry.characterIds.length <= requiredPlayers) {
                selectedEntries.push(entry);
                accumulatedPlayers += entry.characterIds.length;

                if (accumulatedPlayers === requiredPlayers) {
                    break;
                }
            }
        }

        if (accumulatedPlayers !== requiredPlayers) {
            return;
        }

        for (const entry of selectedEntries) {
            const idx = this.queue.findIndex((e) => e.id === entry.id);

            if (idx !== -1) {
                this.queue.splice(idx, 1);
            }
        }

        const blocks = selectedEntries
            .map((entry) => {
                const members = entry.characterIds
                    .map((id) => getCharacterById(id))
                    .filter((u): u is RuntimeCharacter => Boolean(u));
                const avgLevel =
                    members.reduce((sum, m) => sum + Number(m.level ?? 1), 0) / (members.length || 1);
                return { members, avgLevel };
            })
            .filter((block) => block.members.length > 0)
            .sort((a, b) => {
                if (b.members.length !== a.members.length) {
                    return b.members.length - a.members.length;
                }
                return b.avgLevel - a.avgLevel;
            });

        const allMatchedUsers = blocks.flatMap((block) => block.members);

        if (allMatchedUsers.length !== requiredPlayers) {
            this.processQueue(teamSize);
            return;
        }

        const teamOne: RuntimeCharacter[] = [];
        const teamTwo: RuntimeCharacter[] = [];
        let teamOneLevelSum = 0;
        let teamTwoLevelSum = 0;
        let assignmentFailed = false;

        for (const block of blocks) {
            const blockSize = block.members.length;
            const teamOneFits = teamOne.length + blockSize <= teamSize;
            const teamTwoFits = teamTwo.length + blockSize <= teamSize;

            if (!teamOneFits && !teamTwoFits) {
                assignmentFailed = true;
                break;
            }

            let assignToTeamOne: boolean;

            if (teamOneFits && teamTwoFits) {
                assignToTeamOne =
                    teamOne.length !== teamTwo.length
                        ? teamOne.length < teamTwo.length
                        : teamOneLevelSum <= teamTwoLevelSum;
            } else {
                assignToTeamOne = teamOneFits;
            }

            if (assignToTeamOne) {
                teamOne.push(...block.members);
                teamOneLevelSum += block.avgLevel * blockSize;
            } else {
                teamTwo.push(...block.members);
                teamTwoLevelSum += block.avgLevel * blockSize;
            }
        }

        if (assignmentFailed || teamOne.length !== teamSize || teamTwo.length !== teamSize) {
            // No se pudo formar una partida balanceada sin partir una party
            // (ej: tres parties de 2 en una cola de 3v3). Devolvemos las
            // entries a la cola y esperamos a que cambie la composición.
            this.queue.unshift(...selectedEntries);
            return;
        }

        for (const user of allMatchedUsers) {
            sendConsoleMessage(user, `¡PARTIDA ENCONTRADA! Entrando a la Arena ${teamSize}v${teamSize}...`, "#00E676");
        }

        try {
            getChallengeManager().createChallengeVetoSession(teamSize, teamOne, teamTwo);
        } catch (error) {
            funct.dumpError(error);

            for (const user of allMatchedUsers) {
                sendConsoleMessage(user, `[Arena ${teamSize}v${teamSize}] Error al iniciar la partida. Regresando a la cola.`, "#FF5252");
            }
        }
    },
};

module.exports = { arenaMatchmakingManager };
