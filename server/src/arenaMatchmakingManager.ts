import type { HandleProtocolApi, RetosOpenPayload } from "./handleProtocol";
import type { RuntimeCharacter } from "./types/runtime";
import { getCharacterById, getClientById } from "./runtimeRegistry";
import * as safeZone from "./safeZone";

const vars = require("./vars");
const funct = require("./functions");

export type MatchmakingTeamSize = 1 | 2 | 3 | 4;

const MATCHMAKING_TEAM_SIZES: MatchmakingTeamSize[] = [1, 2, 3, 4];

// Cada cuanto se re-evaluan las colas aunque nadie se anote. Sin esto una cola
// puede quedar trabada con jugadores suficientes (por ejemplo cuando alguien
// sale de una cola o es convocado por otra).
const MATCHMAKING_TICK_MS = 3_000;

type QueueEntry = {
    id: string;
    leaderId: string;
    characterIds: string[];
    isParty: boolean;
    teamSize: MatchmakingTeamSize;
    joinedAt: number;
};

export type MatchmakingState = {
    queuedTeamSizes: MatchmakingTeamSize[];
    counts: Record<MatchmakingTeamSize, { inQueue: number; required: number }>;
};

function getHandleProtocol() {
    return require("./handleProtocol") as HandleProtocolApi;
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

// Anuncia por consola a TODO el servidor que un jugador se anoto a la cola,
// para llamar la atencion y sumar mas jugadores.
function announceQueueJoin(teamSize: MatchmakingTeamSize, joinedMembers: RuntimeCharacter[], totalInQueue: number) {
    const required = teamSize * 2;

    for (const member of joinedMembers) {
        const name = member.nameCharacter;

        if (!name) {
            continue;
        }

        const message = `[Arena ${teamSize}v${teamSize}] ${name} se ha anotado. (${totalInQueue}/${required} jugadores anotados)`;
        getHandleProtocol().consoleToAll(message, "#00E676", 1, 0);
    }
}

export const arenaMatchmakingManager = {
    queue: [] as QueueEntry[],
    tickTimer: null as ReturnType<typeof setTimeout> | null,

    createId() {
        return `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    },

    requireEligibleCharacter(user: RuntimeCharacter, teamSize: MatchmakingTeamSize) {
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

        if (this.isInQueue(user.id, teamSize)) {
            throw new Error(`Ya estás anotado en la cola ${teamSize}v${teamSize}.`);
        }
    },

    isInQueue(userId: string | number, teamSize?: MatchmakingTeamSize): boolean {
        const strId = String(userId);
        return this.queue.some(
            (entry) =>
                (teamSize === undefined || entry.teamSize === teamSize) &&
                entry.characterIds.includes(strId),
        );
    },

    getQueueEntriesForUser(userId: string | number): QueueEntry[] {
        const strId = String(userId);
        return this.queue.filter((entry) => entry.characterIds.includes(strId));
    },

    getQueuedTeamSizes(userId: string | number): MatchmakingTeamSize[] {
        const sizes = new Set(this.getQueueEntriesForUser(userId).map((entry) => entry.teamSize));
        return MATCHMAKING_TEAM_SIZES.filter((size) => sizes.has(size));
    },

    buildMatchmakingState(userId: string | number): MatchmakingState {
        const counts = {} as MatchmakingState["counts"];

        for (const size of MATCHMAKING_TEAM_SIZES) {
            counts[size] = {
                inQueue: this.getTotalPlayersInQueue(size),
                required: size * 2,
            };
        }

        return {
            queuedTeamSizes: this.getQueuedTeamSizes(userId),
            counts,
        };
    },

    // Empuja el estado de matchmaking al cliente reusando el paquete openRetos,
    // que ya viaja como JSON. El listado de retos puede fallar si el personaje
    // no tiene acceso a retos: en ese caso mandamos la lista vacia.
    pushMatchmakingState(characterIds: Array<string | number>) {
        const handleProtocol = getHandleProtocol();
        const challengeManager = getChallengeManager();
        const seen = new Set<string>();

        for (const characterId of characterIds) {
            const strId = String(characterId);

            if (seen.has(strId)) {
                continue;
            }

            seen.add(strId);

            const client = getClientById(strId);

            if (!client) {
                continue;
            }

            let challenges: RetosOpenPayload["challenges"] = [];

            try {
                challenges = challengeManager.listChallengesForUserId(strId).challenges ?? [];
            } catch {
                challenges = [];
            }

            try {
                handleProtocol.openRetos(
                    {
                        challenges,
                        matchmaking: this.buildMatchmakingState(strId),
                    },
                    client,
                );
            } catch (error) {
                funct.dumpError(error);
            }
        }
    },

    // Notifica a todos los que estan en alguna cola, para que los contadores
    // de "jugadores anotados" se mantengan al dia en el HUD.
    broadcastQueueState() {
        this.pushMatchmakingState(this.queue.flatMap((entry) => entry.characterIds));
    },

    ensureTicker() {
        if (this.tickTimer || this.queue.length === 0) {
            return;
        }

        const scheduleNext = () => {
            const timer = setTimeout(() => {
                this.tickTimer = null;

                if (this.queue.length === 0) {
                    return;
                }

                try {
                    const removed = this.pruneQueue();

                    for (const teamSize of MATCHMAKING_TEAM_SIZES) {
                        this.processQueue(teamSize);
                    }

                    if (removed.length > 0) {
                        this.broadcastQueueState();
                    }
                } catch (error) {
                    funct.dumpError(error);
                }

                if (this.queue.length > 0) {
                    scheduleNext();
                }
            }, MATCHMAKING_TICK_MS);

            timer.unref?.();
            this.tickTimer = timer;
        };

        scheduleNext();
    },

    stopTicker() {
        if (!this.tickTimer) {
            return;
        }

        clearTimeout(this.tickTimer);
        this.tickTimer = null;
    },

    enqueue(idUser: string | number, teamSize: unknown) {
        if (!isMatchmakingTeamSize(teamSize)) {
            throw new Error("Modo de matchmaking inválido. Elegí 1v1, 2v2, 3v3 o 4v4.");
        }

        const user = getCharacterById(idUser);

        if (!user) {
            throw new Error("Personaje no encontrado.");
        }

        this.requireEligibleCharacter(user, teamSize);

        let teamMembers: RuntimeCharacter[] = [];
        let isParty = false;

        // El 1v1 siempre se anota en solitario: la party se ignora en vez de
        // bloquear, igual que en los retos directos (challengeManager.deriveTeam).
        if (teamSize > 1 && user.partyId) {
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
                this.requireEligibleCharacter(member, teamSize);
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

        announceQueueJoin(teamSize, teamMembers, currentTotal);

        this.processQueue(teamSize);
        this.broadcastQueueState();
        this.ensureTicker();

        return {
            ok: true,
            inQueue: true,
            teamSize,
            totalInQueue: currentTotal,
            queuedTeamSizes: this.getQueuedTeamSizes(idUser),
        };
    },

    // Sin teamSize saca al jugador de todas las colas en las que este anotado.
    dequeue(idUser: string | number, teamSize?: unknown) {
        const strId = String(idUser);
        let targetSize: MatchmakingTeamSize | undefined;

        if (teamSize !== undefined && teamSize !== null) {
            if (!isMatchmakingTeamSize(teamSize)) {
                throw new Error("Modo de matchmaking inválido. Elegí 1v1, 2v2, 3v3 o 4v4.");
            }

            targetSize = teamSize;
        }

        const removed: QueueEntry[] = [];

        this.queue = this.queue.filter((entry) => {
            const matches =
                entry.characterIds.includes(strId) &&
                (targetSize === undefined || entry.teamSize === targetSize);

            if (matches) {
                removed.push(entry);
            }

            return !matches;
        });

        if (removed.length === 0) {
            if (targetSize !== undefined) {
                throw new Error(`No estás en la cola ${targetSize}v${targetSize}.`);
            }

            throw new Error("No estás en la cola de la arena.");
        }

        for (const entry of removed) {
            for (const charId of entry.characterIds) {
                const member = getCharacterById(charId);

                if (member) {
                    sendConsoleMessage(member, `[Arena ${entry.teamSize}v${entry.teamSize}] Has salido de la cola de matchmaking.`, "#FF5252");
                }
            }
        }

        this.pushMatchmakingState(removed.flatMap((entry) => entry.characterIds));
        this.broadcastQueueState();

        if (this.queue.length === 0) {
            this.stopTicker();
        }

        return {
            ok: true,
            inQueue: this.isInQueue(strId),
            queuedTeamSizes: this.getQueuedTeamSizes(strId),
        };
    },

    // Al ser convocado por una cola, el jugador se libera automaticamente de las
    // demas colas en las que estuviera anotado.
    releaseFromOtherQueues(matchedCharacterIds: string[], exceptTeamSize: MatchmakingTeamSize) {
        const matched = new Set(matchedCharacterIds.map((id) => String(id)));
        const released: QueueEntry[] = [];

        this.queue = this.queue.filter((entry) => {
            if (entry.teamSize === exceptTeamSize) {
                return true;
            }

            if (!entry.characterIds.some((id) => matched.has(id))) {
                return true;
            }

            released.push(entry);
            return false;
        });

        for (const entry of released) {
            for (const charId of entry.characterIds) {
                const member = getCharacterById(charId);

                if (member) {
                    sendConsoleMessage(
                        member,
                        `[Arena ${entry.teamSize}v${entry.teamSize}] Saliste de la cola porque entraste a una partida ${exceptTeamSize}v${exceptTeamSize}.`,
                        "#E69500",
                    );
                }
            }
        }

        return released;
    },

    getTotalPlayersInQueue(teamSize?: MatchmakingTeamSize): number {
        return this.queue
            .filter((entry) => teamSize === undefined || entry.teamSize === teamSize)
            .reduce((acc, entry) => acc + entry.characterIds.length, 0);
    },

    pruneQueue(): QueueEntry[] {
        const removed: QueueEntry[] = [];

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

            const keep = entry.isParty
                ? validMembers.length === entry.teamSize
                : validMembers.length === 1;

            if (!keep) {
                removed.push(entry);
            }

            return keep;
        });

        return removed;
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

        const matchedIds = allMatchedUsers.map((user) => String(user.id));
        const releasedEntries = this.releaseFromOtherQueues(matchedIds, teamSize);

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

            // Devolvemos a la cola tanto la partida fallida como las colas
            // paralelas que habiamos liberado, para no dejar al jugador afuera.
            this.queue.unshift(...selectedEntries, ...releasedEntries);
        }

        this.pushMatchmakingState(matchedIds);
        this.broadcastQueueState();

        if (this.queue.length === 0) {
            this.stopTicker();
        }
    },
};

module.exports = { arenaMatchmakingManager };
