import type { GameApi } from "./game";
import type { HandleProtocolApi } from "./handleProtocol";
import type { SocketApi } from "./socket";
import type { RuntimeCharacter } from "./types/runtime";
import { getCharacterById, getClientById, getOnlineSessionById } from "./runtimeRegistry";
import * as safeZone from "./safeZone";
import {
    VOICE_SIGNAL_MAX_PER_WINDOW,
    VOICE_SIGNAL_WINDOW_MS,
    getVoiceIceServers,
    type VoiceIceServer,
} from "./voiceChat";

export {};

const _ = require("lodash");
const vars = require("./vars");
const CHALLENGE_BASE_MAP_ID = 506;
const CHALLENGE_INSTANCE_MAP_START = 2000;
const CHALLENGE_VETO_STEP_TIMEOUT_MS = 15_000;
// Fallback cuando un mapa esta marcado como arena en el editor pero todavia no
// tiene spawns de equipo configurados (o para el mapa 506 antes de migrarlo).
const CHALLENGE_TEAM_POSITIONS: Record<TeamSide, Array<{ x: number; y: number }>> = {
    1: [
        { x: 65, y: 63 },
        { x: 66, y: 63 },
        { x: 65, y: 64 },
        { x: 66, y: 64 },
    ],
    2: [
        { x: 85, y: 79 },
        { x: 84, y: 79 },
        { x: 85, y: 78 },
        { x: 84, y: 78 },
    ],
};

/** Mapas marcados como arena (`isArena: true`) en el editor, ordenados por id. */
function getArenaMapIds(): number[] {
    const mapData = vars.mapData ?? {};
    const ids: number[] = [];

    for (const key of Object.keys(mapData)) {
        const mapId = Number(key);

        if (Number.isInteger(mapId) && mapData[mapId]?.isArena === true) {
            ids.push(mapId);
        }
    }

    ids.sort((left, right) => left - right);

    return ids.length > 0 ? ids : [CHALLENGE_BASE_MAP_ID];
}

/** Spawns de equipo configurados en el editor para `mapId`, o el fallback fijo. */
function getArenaTeamPositions(mapId: number): Record<TeamSide, Array<{ x: number; y: number }>> {
    const configured = vars.mapData?.[mapId]?.arenaSpawns as
        | { team1?: Array<{ x: number; y: number }>; team2?: Array<{ x: number; y: number }> }
        | undefined;

    const team1 = configured?.team1?.length ? configured.team1 : CHALLENGE_TEAM_POSITIONS[1];
    const team2 = configured?.team2?.length ? configured.team2 : CHALLENGE_TEAM_POSITIONS[2];

    return { 1: team1, 2: team2 };
}
const COUNTDOWN_START = 10;
const COUNTDOWN_STEP_MS = 1000;
const SHIELD_DISABLE_DELAY_MS = 60_000;
const CHALLENGE_GLOBAL_ANNOUNCE_COOLDOWN_MS = 30_000;
type TeamSize = 1 | 2 | 3 | 4;
type TeamSide = 1 | 2;

type ParticipantEquipmentSnapshot = {
    idHead: number;
    idHelmet: number;
    idWeapon: number;
    idShield: number;
    idBody: number;
    navigatingBodyId: number;
    navegando: number;
    idLastHead: number;
    idLastHelmet: number;
    idLastWeapon: number;
    idLastShield: number;
    idLastBody: number;
    idItemWeapon: number | string;
    idItemBody: number | string;
    idItemShield: number | string;
    idItemHelmet: number | string;
    idItemArrow: number | string;
    idItemRing: number | string;
    equippedSlots: string[];
};

type MatchParticipant = {
    id: string;
    persistedId: string;
    name: string;
    level: number;
    className: string;
    raceName: string;
    originalMap: number;
    originalPos: {
        x: number;
        y: number;
    };
    equipment: ParticipantEquipmentSnapshot;
};

type MatchTeam = {
    side: TeamSide;
    participants: MatchParticipant[];
    score: number;
};

type OpenChallenge = {
    id: string;
    createdAt: number;
    teamSize: TeamSize;
    proposerPersistedId: string;
    proposerLeaderRuntimeId: string;
    proposerTeamRuntimeIds: string[];
};

type ActiveMatch = {
    id: string;
    createdAt: number;
    teamSize: TeamSize;
    targetScore?: number;
    instanceMapId: number;
    baseMapId: number;
    teams: Record<TeamSide, MatchTeam>;
    timerIds: number[];
    resolvingRound: boolean;
    finished: boolean;
};

type ChallengeVetoStep = {
    side: TeamSide;
    type: "ban";
};

type ChallengeVetoBannedMap = {
    mapId: number;
    side: TeamSide;
};

type ChallengeVetoSession = {
    id: string;
    createdAt: number;
    teamSize: TeamSize;
    teamOneParticipants: RuntimeCharacter[];
    teamTwoParticipants: RuntimeCharacter[];
    mapPool: number[];
    remainingMapIds: number[];
    bannedMapIds: ChallengeVetoBannedMap[];
    sequence: ChallengeVetoStep[];
    stepIndex: number;
    deadlineAt: number;
    timerId: number | null;
    resolved: boolean;
};

type ChallengeVetoStatePayload = {
    vetoId: string;
    teamSize: TeamSize;
    mapPool: number[];
    remainingMapIds: number[];
    bannedMapIds: ChallengeVetoBannedMap[];
    totalSteps: number;
    stepIndex: number;
    currentTurnSide: TeamSide | null;
    deadlineAt: number;
    resolved: boolean;
    cancelled?: boolean;
    reason?: string;
    selectedMapId?: number;
    matchId?: string;
    yourSide?: TeamSide;
    isLeader?: boolean;
};

function buildVetoSequence(poolSize: number): ChallengeVetoStep[] {
    if (poolSize <= 1) {
        return [];
    }

    const banCount = poolSize - 1;
    const sequence: ChallengeVetoStep[] = [];
    let side: TeamSide = 1;

    for (let index = 0; index < banCount; index++) {
        sequence.push({ side, type: "ban" });
        side = side === 1 ? 2 : 1;
    }

    return sequence;
}

type VoiceRoomPayload =
    | {
          type: "room";
          roomId: string;
          peerId: string;
          peerName: string;
          initiator: boolean;
          iceServers: VoiceIceServer[];
      }
    | { type: "signal"; roomId: string; fromId: string; signal: unknown }
    | { type: "closed"; roomId: string };

type ChallengeListItem = {
    id: string;
    createdAt: number;
    teamSize: TeamSize;
    proposer: ReturnType<typeof buildParticipantSummary>;
    participants: Array<ReturnType<typeof buildParticipantSummary>>;
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

function sendToClient(client: ReturnType<typeof getClientById> | undefined) {
    if (!client) {
        return;
    }

    const socket = getSocket();

    if (typeof socket.send !== "function") {
        return;
    }

    socket.send(client);
}

function getFunctions() {
    return require("./functions") as {
        logChallengeHistory: (payload: unknown) => void;
    };
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

function buildParticipantSummary(user: RuntimeCharacter) {
    const classId = Number(user.idClase ?? 0);
    const raceId = Number(user.idRaza ?? 0);

    return {
        id: String(user.id),
        persistedId: String(user._id ?? user.id),
        name: String(user.nameCharacter ?? "Personaje"),
        level: Number(user.level ?? 1),
        className: vars.nameClases[classId] ?? `Clase ${user.idClase}`,
        raceName: vars.nameRazas[raceId] ?? `Raza ${user.idRaza}`,
    };
}

function buildEquipmentSnapshot(user: RuntimeCharacter): ParticipantEquipmentSnapshot {
    const inventory = (user.inv ?? {}) as Record<string, { equipped?: number | boolean }>;
    const equippedSlots = Object.entries(inventory)
        .filter(([, item]) => Boolean(item?.equipped))
        .map(([slot]) => slot);
    const isNavigating = Boolean(user.navegando);

    return {
        idHead: Number((isNavigating ? user.idLastHead : user.idHead) ?? 0),
        idHelmet: Number((isNavigating ? user.idLastHelmet : user.idHelmet) ?? 0),
        idWeapon: Number((isNavigating ? user.idLastWeapon : user.idWeapon) ?? 0),
        idShield: Number((isNavigating ? user.idLastShield : user.idShield) ?? 0),
        idBody: Number((isNavigating ? user.idLastBody : user.idBody) ?? 0),
        navigatingBodyId: Number(user.idBody ?? 0),
        navegando: Number(user.navegando ?? 0),
        idLastHead: Number(user.idLastHead ?? 0),
        idLastHelmet: Number(user.idLastHelmet ?? 0),
        idLastWeapon: Number(user.idLastWeapon ?? 0),
        idLastShield: Number(user.idLastShield ?? 0),
        idLastBody: Number(user.idLastBody ?? 0),
        idItemWeapon: (user.idItemWeapon ?? 0) as number | string,
        idItemBody: (user.idItemBody ?? 0) as number | string,
        idItemShield: (user.idItemShield ?? 0) as number | string,
        idItemHelmet: (user.idItemHelmet ?? 0) as number | string,
        idItemArrow: (user.idItemArrow ?? 0) as number | string,
        idItemRing: (user.idItemRing ?? 0) as number | string,
        equippedSlots,
    };
}

function restoreEquipment(user: RuntimeCharacter, snapshot: ParticipantEquipmentSnapshot) {
    const inventory = (user.inv ?? {}) as Record<string, { equipped?: number | boolean }>;

    for (const [, item] of Object.entries(inventory)) {
        if (item) {
            item.equipped = 0;
        }
    }

    for (const slot of snapshot.equippedSlots) {
        if (inventory[slot]) {
            inventory[slot].equipped = 1;
        }
    }

    user.idHead = snapshot.idHead;
    user.idHelmet = snapshot.idHelmet;
    user.idWeapon = snapshot.idWeapon;
    user.idShield = snapshot.idShield;
    user.idBody = snapshot.idBody;
    user.idLastHead = snapshot.idLastHead;
    user.idLastHelmet = snapshot.idLastHelmet;
    user.idLastWeapon = snapshot.idLastWeapon;
    user.idLastShield = snapshot.idLastShield;
    user.idLastBody = snapshot.idLastBody;
    user.idItemWeapon = snapshot.idItemWeapon;
    user.idItemBody = snapshot.idItemBody;
    user.idItemShield = snapshot.idItemShield;
    user.idItemHelmet = snapshot.idItemHelmet;
    user.idItemArrow = snapshot.idItemArrow;
    user.idItemRing = snapshot.idItemRing;
}

function restoreNavigatingState(user: RuntimeCharacter, snapshot: ParticipantEquipmentSnapshot) {
    if (!snapshot.navegando) {
        user.navegando = 0;
        return;
    }

    user.navegando = 1;
    user.idBody = Number(snapshot.navigatingBodyId || 84);
    user.idHead = 0;
    user.idWeapon = 0;
    user.idHelmet = 0;
    user.idShield = 0;
}

function getActiveParticipants(match: ActiveMatch): RuntimeCharacter[] {
    return [1, 2]
        .flatMap((side) => match.teams[side as TeamSide].participants)
        .map((participant) => getCharacterById(participant.id))
        .filter((user): user is RuntimeCharacter => Boolean(user));
}

function getTeamArenaPosition(mapId: number, teamSide: TeamSide, index: number) {
    const positions = getArenaTeamPositions(mapId)[teamSide];
    return positions[index] ?? positions[positions.length - 1];
}

function getParticipantSideFromMatch(
    match: ActiveMatch | undefined,
    user: RuntimeCharacter | undefined,
): TeamSide | null {
    if (!match || !user) {
        return null;
    }

    for (const side of [1, 2] as TeamSide[]) {
        if (match.teams[side].participants.some((participant) => String(participant.id) === String(user.id))) {
            return side;
        }
    }

    return null;
}

function isPartyLeader(user: RuntimeCharacter) {
    return Boolean(user.partyId && user.partyLeaderId && String(user.partyLeaderId) === String(user.id));
}

function getVoiceRoomId(match: ActiveMatch, side: TeamSide) {
    return `${match.id}:${side}`;
}

const challengeManager = {
    nextInstanceMapId: CHALLENGE_INSTANCE_MAP_START,
    openChallenges: {} as Record<string, OpenChallenge>,
    activeMatches: {} as Record<string, ActiveMatch>,
    vetoSessions: {} as Record<string, ChallengeVetoSession>,
    lastGlobalAnnouncementByProposerId: {} as Record<string, number>,
    voiceSignalRates: {} as Record<string, { windowStartedAt: number; count: number }>,

    createId(prefix: string) {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    },

    maybeAnnounceChallengeToAll(challenge: OpenChallenge) {
        const proposer = getCharacterById(challenge.proposerLeaderRuntimeId);

        if (!proposer) {
            return;
        }

        const proposerId = String(proposer._id ?? proposer.id);
        const announcedAt = Number(this.lastGlobalAnnouncementByProposerId[proposerId] ?? 0);
        const currentTime = now();

        if (currentTime - announcedAt < CHALLENGE_GLOBAL_ANNOUNCE_COOLDOWN_MS) {
            return;
        }

        this.lastGlobalAnnouncementByProposerId[proposerId] = currentTime;

        const handleProtocol = getHandleProtocol();
        handleProtocol.consoleToAll(
            `[Retos] ${proposer.nameCharacter} nivel ${Number(proposer.level ?? 1)} ${
                vars.nameClases[Number(proposer.idClase ?? 0)] ?? `Clase ${proposer.idClase}`
            } publicó un reto ${challenge.teamSize}vs${challenge.teamSize}. Si quieres aceptarlo, usa /retos.`,
            "#E69500",
            1,
            0,
        );
    },

    createInstanceMapId() {
        while (vars.mapa[this.nextInstanceMapId] || vars.mapData[this.nextInstanceMapId]) {
            this.nextInstanceMapId += 1;
        }

        const mapId = this.nextInstanceMapId;
        this.nextInstanceMapId += 1;
        return mapId;
    },

    createMatchInstanceMap(baseMapId: number = CHALLENGE_BASE_MAP_ID) {
        const mapId = this.createInstanceMapId();

        vars.mapa[mapId] = _.cloneDeep(vars.mapa[baseMapId]);
        vars.mapData[mapId] = [];

        for (let y = 1; y <= 100; y++) {
            vars.mapData[mapId][y] = [];

            for (let x = 1; x <= 100; x++) {
                vars.mapData[mapId][y][x] = {
                    id: 0,
                };
            }
        }

        vars.mapData[mapId].name = vars.mapData[baseMapId].name;
        vars.mapData[mapId].musicNum = vars.mapData[baseMapId].musicNum;
        vars.mapData[mapId].magiaSinEfecto = vars.mapData[baseMapId].magiaSinEfecto;
        vars.mapData[mapId].noEncriptarMp = vars.mapData[baseMapId].noEncriptarMp;
        vars.mapData[mapId].terreno = vars.mapData[baseMapId].terreno;
        vars.mapData[mapId].zona = vars.mapData[baseMapId].zona;
        vars.mapData[mapId].restringir = vars.mapData[baseMapId].restringir;
        vars.mapData[mapId].backup = vars.mapData[baseMapId].backup;
        vars.mapData[mapId].pk = vars.mapData[baseMapId].pk;

        return mapId;
    },

    destroyMatchInstanceMap(mapId: number) {
        if (!vars.mapa[mapId] && !vars.mapData[mapId]) {
            return;
        }

        delete vars.mapData[mapId];
        delete vars.mapa[mapId];
    },

    getBusyMatchByCharacter(user: RuntimeCharacter | undefined) {
        if (!user?.challengeMatchId) {
            return;
        }

        return this.activeMatches[String(user.challengeMatchId)];
    },

    isCharacterInActiveMatch(user: RuntimeCharacter | undefined) {
        return Boolean(this.getBusyMatchByCharacter(user));
    },

    getCombatRelation(
        left: RuntimeCharacter | undefined,
        right: RuntimeCharacter | undefined,
    ): "ally" | "enemy" | null {
        if (!left || !right || !left.challengeMatchId || !right.challengeMatchId) {
            return null;
        }

        if (String(left.challengeMatchId) !== String(right.challengeMatchId)) {
            return null;
        }

        const match = this.activeMatches[String(left.challengeMatchId)];
        const leftSide = getParticipantSideFromMatch(match, left);
        const rightSide = getParticipantSideFromMatch(match, right);

        if (!leftSide || !rightSide) {
            return null;
        }

        return leftSide === rightSide ? "ally" : "enemy";
    },

    isCharacterBusy(user: RuntimeCharacter | undefined, options?: { excludeOpenChallengeId?: string }) {
        if (!user) {
            return false;
        }

        if (user.challengeMatchId && this.activeMatches[String(user.challengeMatchId)]) {
            return true;
        }

        const isInVetoSession = Object.values(this.vetoSessions).some((session) =>
            [...session.teamOneParticipants, ...session.teamTwoParticipants].some(
                (participant) => String(participant.id) === String(user.id),
            ),
        );

        if (isInVetoSession) {
            return true;
        }

        return Object.values(this.openChallenges).some((challenge) => {
            if (options?.excludeOpenChallengeId && challenge.id === options.excludeOpenChallengeId) {
                return false;
            }

            return challenge.proposerTeamRuntimeIds.some((runtimeId) => runtimeId === String(user.id));
        });
    },

    requireEligibleCharacter(user: RuntimeCharacter, options?: { excludeOpenChallengeId?: string }) {
        if (isInPvpMode(user)) {
            throw new Error("Solo puedes usar retos en Mundo Abierto.");
        }

        if (user.dead) {
            throw new Error("No puedes usar retos mientras estás muerto.");
        }

        if (!isInSafeZone(user)) {
            throw new Error("Solo puedes usar retos estando en zona segura.");
        }

        if (this.isCharacterBusy(user, options)) {
            throw new Error("Ese personaje ya está participando en otro reto.");
        }
    },

    requireRetosAccess(user: RuntimeCharacter) {
        if (isInPvpMode(user)) {
            throw new Error("Solo puedes usar retos en Mundo Abierto.");
        }

        if (user.dead) {
            throw new Error("No puedes usar retos mientras estás muerto.");
        }

        if (!isInSafeZone(user)) {
            throw new Error("Solo puedes usar retos estando en zona segura.");
        }
    },

    deriveTeam(user: RuntimeCharacter, teamSize: TeamSize, options?: { excludeOpenChallengeId?: string }) {
        this.requireEligibleCharacter(user, options);

        if (teamSize === 1) {
            return [user];
        }

        if (!user.partyId) {
            throw new Error(`Para crear o unirte a un reto ${teamSize}vs${teamSize} debes estar en una party de ${teamSize}.`);
        }

        if (!isPartyLeader(user)) {
            throw new Error(`Solo el líder de la party puede crear o aceptar retos ${teamSize}vs${teamSize}.`);
        }

        const party = vars.parties?.[String(user.partyId)] as { memberIds?: Array<string | number> } | undefined;

        if (!party || !Array.isArray(party.memberIds) || party.memberIds.length !== teamSize) {
            throw new Error(`El reto ${teamSize}vs${teamSize} requiere una party exacta de ${teamSize} personajes.`);
        }

        const members = party.memberIds
            .map((memberId) => getCharacterById(memberId))
            .filter((member): member is RuntimeCharacter => Boolean(member));

        if (members.length !== teamSize) {
            throw new Error(`Todos los miembros de la party deben estar conectados para el reto ${teamSize}vs${teamSize}.`);
        }

        for (const member of members) {
            this.requireEligibleCharacter(member, options);
        }

        return members.sort((left, right) => {
            if (String(left.id) === String(user.id)) {
                return -1;
            }

            if (String(right.id) === String(user.id)) {
                return 1;
            }

            return String(left.id).localeCompare(String(right.id));
        });
    },

    pruneOpenChallenges() {
        for (const [challengeId, challenge] of Object.entries(this.openChallenges)) {
            const proposer = getCharacterById(challenge.proposerLeaderRuntimeId);

            if (!proposer) {
                delete this.openChallenges[challengeId];
                continue;
            }

            try {
                const currentTeam = this.deriveTeam(proposer, challenge.teamSize, {
                    excludeOpenChallengeId: challenge.id,
                });
                const currentTeamIds = currentTeam.map((member) => String(member.id)).sort();
                const storedIds = [...challenge.proposerTeamRuntimeIds].sort();

                if (currentTeamIds.length !== storedIds.length) {
                    delete this.openChallenges[challengeId];
                    continue;
                }

                for (let index = 0; index < currentTeamIds.length; index++) {
                    if (currentTeamIds[index] !== storedIds[index]) {
                        delete this.openChallenges[challengeId];
                        break;
                    }
                }
            } catch {
                delete this.openChallenges[challengeId];
            }
        }
    },

    buildOpenChallengeResponse(challenge: OpenChallenge) {
        const proposer = getCharacterById(challenge.proposerLeaderRuntimeId);

        if (!proposer) {
            return null;
        }

        const participants = this.deriveTeam(proposer, challenge.teamSize, {
            excludeOpenChallengeId: challenge.id,
        }).map((member) => buildParticipantSummary(member));

        return {
            id: challenge.id,
            createdAt: challenge.createdAt,
            teamSize: challenge.teamSize,
            proposer: buildParticipantSummary(proposer),
            participants,
        } satisfies ChallengeListItem;
    },

    listChallengesForUserId(idUser: string | number) {
        const user = getCharacterById(idUser);

        if (!user || user.cerrado || !user.connected) {
            throw new Error("Debes estar conectado para usar retos.");
        }

        this.requireRetosAccess(user);

        this.pruneOpenChallenges();

        return {
            challenges: Object.values(this.openChallenges)
                .map((challenge) => this.buildOpenChallengeResponse(challenge))
                .filter(Boolean),
        };
    },

    createChallengeByUserId(idUser: string | number, teamSize: TeamSize) {
        const user = getCharacterById(idUser);

        if (!user || user.cerrado || !user.connected) {
            throw new Error("Debes estar conectado para usar retos.");
        }

        this.requireRetosAccess(user);

        this.pruneOpenChallenges();

        if (![1, 2, 3, 4].includes(teamSize)) {
            throw new Error("El modo de reto es inválido.");
        }

        const team = this.deriveTeam(user, teamSize);
        const challengeId = this.createId("challenge");

        this.openChallenges[challengeId] = {
            id: challengeId,
            createdAt: now(),
            teamSize,
            proposerPersistedId: String(user._id ?? user.id),
            proposerLeaderRuntimeId: String(user.id),
            proposerTeamRuntimeIds: team.map((member) => String(member.id)),
        };

        this.maybeAnnounceChallengeToAll(this.openChallenges[challengeId]);

        return {
            challenge: this.buildOpenChallengeResponse(this.openChallenges[challengeId]),
        };
    },

    cancelChallengeByUserId(idUser: string | number, challengeId: string) {
        const user = getCharacterById(idUser);

        if (!user || user.cerrado || !user.connected) {
            throw new Error("Debes estar conectado para usar retos.");
        }

        this.requireRetosAccess(user);

        this.pruneOpenChallenges();

        const challenge = this.openChallenges[challengeId];

        if (!challenge) {
            throw new Error("El reto ya no está disponible.");
        }

        const isOwner =
            String(challenge.proposerLeaderRuntimeId) === String(user.id) ||
            String(challenge.proposerPersistedId) === String(user._id ?? user.id);

        if (!isOwner) {
            throw new Error("Solo puedes cancelar tu propio reto.");
        }

        delete this.openChallenges[challengeId];

        return {
            ok: true,
        };
    },

    buildMatchParticipant(user: RuntimeCharacter): MatchParticipant {
        const summary = buildParticipantSummary(user);

        return {
            id: String(user.id),
            persistedId: String(user._id ?? user.id),
            name: summary.name,
            level: summary.level,
            className: summary.className,
            raceName: summary.raceName,
            originalMap: Number(user.map),
            originalPos: {
                x: Number(user.pos.x),
                y: Number(user.pos.y),
            },
            equipment: buildEquipmentSnapshot(user),
        };
    },

    setParticipantLock(user: RuntimeCharacter, locked: boolean, lockedUntil = 0) {
        const client = getClientById(user.id);
        const game = getGame();
        const handleProtocol = getHandleProtocol();

        user.challengeLockedUntil = locked ? lockedUntil : 0;
        user.inmovilizado = locked ? 1 : 0;
        user.paralizado = 0;
        user.cooldownParalizado = locked ? now() : 0;
        user.pendingMoveQueue = [];

        if (client) {
            handleProtocol.inmo(user.id, locked ? 1 : 0, client);
        }

        game.loopAreaPos(user.map, user.pos, (target) => {
            if (target.id === user.id) {
                return;
            }

            const targetClient = getClientById(target.id);

            if (!targetClient) {
                return;
            }

            handleProtocol.sendCharacter(user as any, target.id);
            sendToClient(targetClient);
        });
    },

    syncParticipantState(user: RuntimeCharacter) {
        const client = getClientById(user.id);

        if (!client) {
            return;
        }

        const handleProtocol = getHandleProtocol();
        handleProtocol.sendMyCharacter(user as any);
        sendToClient(client);
    },

    syncParticipantAppearanceForOthers(user: RuntimeCharacter) {
        const handleProtocol = getHandleProtocol();

        getGame().loopAreaPos(user.map, user.pos, (target) => {
            if (target.isNpc || String(target.id) === String(user.id)) {
                return;
            }

            const client = getClientById(target.id);

            if (!client) {
                return;
            }

            handleProtocol.sendCharacter(user as any, target.id);
            sendToClient(client);
        });
    },

    setShieldBlockedForRound(user: RuntimeCharacter | undefined, blocked: boolean) {
        if (!user) {
            return;
        }

        user.challengeShieldBlockedForRound = blocked ? 1 : 0;
    },

    unequipShieldForRound(user: RuntimeCharacter | undefined) {
        if (!user) {
            return;
        }

        const game = getGame();

        this.setShieldBlockedForRound(user, true);

        const shieldSlot = String(user.idItemShield ?? 0);

        if (!shieldSlot || shieldSlot === "0") {
            return;
        }

        const inventory = (user.inv ?? {}) as Record<string, { equipped?: number | boolean }>;
        const shieldItem = inventory[shieldSlot];

        if (shieldItem) {
            shieldItem.equipped = 0;
        }

        if (user.navegando) {
            user.idLastShield = 0;
        } else {
            user.idShield = 0;
        }

        user.idItemShield = 0;
        this.syncParticipantState(user);

        const handleProtocol = getHandleProtocol();

        game.loopAreaPos(user.map, user.pos, (target) => {
            const client = getClientById(target.id);

            if (client) {
                handleProtocol.changeShield(user.id, Number(user.idShield ?? 0), 0, client);
            }
        });

        const client = getClientById(user.id);

        if (client) {
            handleProtocol.console(
                "[Retos] Pasó 1 minuto: el escudo quedó desequipado hasta la próxima ronda.",
                "white",
                1,
                0,
                client,
            );
        }
    },

    disableShieldsForRound(match: ActiveMatch) {
        for (const participant of getActiveParticipants(match)) {
            this.unequipShieldForRound(participant);
        }
    },

    sendMatchConsole(match: ActiveMatch, message: string, color = "#E69500") {
        const handleProtocol = getHandleProtocol();

        for (const participant of getActiveParticipants(match)) {
            const client = getClientById(participant.id);

            if (client) {
                handleProtocol.console(message, color, 1, 0, client);
            }
        }
    },

    clearTimers(match: ActiveMatch) {
        while (match.timerIds.length > 0) {
            const timerId = match.timerIds.pop();

            if (typeof timerId === "number") {
                clearTimeout(timerId);
            }
        }
    },

    restoreParticipantForCombat(
        match: ActiveMatch,
        matchParticipant: MatchParticipant,
        teamSide: TeamSide,
        index: number,
    ) {
        const session = getOnlineSessionById(matchParticipant.id);

        if (!session) {
            return;
        }

        const game = getGame();
        const { user, client } = session;

        game.revivirUsuario(user.id, {
            hp: Number(user.maxHp ?? user.hp ?? 1),
            mana: Number(user.maxMana ?? user.mana ?? 0),
        });
        game.setSpellInvisibility(user.id, false);
        restoreEquipment(user, matchParticipant.equipment);
        user.meditar = false;
        user.navegando = 0;
        user.hiddenSkill = false;
        user.hiddenSkillStartedAt = 0;
        user.hiddenSkillExpiresAt = 0;
        user.hiddenSkillCooldownUntil = 0;
        this.syncParticipantState(user);

        const arenaPos = getTeamArenaPosition(match.baseMapId, teamSide, index);
        game.telep(client, match.instanceMapId, arenaPos.x, arenaPos.y, `challenge round ${matchParticipant.name}`);
        this.syncParticipantAppearanceForOthers(user);
    },

    restoreParticipantToOrigin(matchParticipant: MatchParticipant) {
        const session = getOnlineSessionById(matchParticipant.id);

        if (!session) {
            const offlineUser = getCharacterById(matchParticipant.id);

            if (offlineUser) {
                offlineUser.challengeMatchId = null;
                offlineUser.challengeTeam = null;
                offlineUser.challengeTeamColor = null;
                offlineUser.challengeLockedUntil = 0;
                offlineUser.challengeShieldBlockedForRound = 0;
                offlineUser.inmovilizado = 0;
                offlineUser.paralizado = 0;
            }

            return;
        }

        const game = getGame();
        const { user, client } = session;

        game.revivirUsuario(user.id, {
            hp: Number(user.maxHp ?? user.hp ?? 1),
            mana: Number(user.maxMana ?? user.mana ?? 0),
        });
        game.setSpellInvisibility(user.id, false);
        restoreEquipment(user, matchParticipant.equipment);
        restoreNavigatingState(user, matchParticipant.equipment);
        this.setParticipantLock(user, false);
        this.setShieldBlockedForRound(user, false);
        user.challengeMatchId = null;
        user.challengeTeam = null;
        this.clearTeamColor(user);
        this.syncParticipantState(user);
        game.telep(
            client,
            matchParticipant.originalMap,
            matchParticipant.originalPos.x,
            matchParticipant.originalPos.y,
            `challenge return ${matchParticipant.name}`,
        );
        this.syncParticipantAppearanceForOthers(user);
    },

    startRound(match: ActiveMatch, customCountdown?: number) {
        match.resolvingRound = false;
        this.clearTimers(match);

        const countdownStart = typeof customCountdown === "number" ? customCountdown : COUNTDOWN_START;
        const releaseAt = now() + (countdownStart + 1) * COUNTDOWN_STEP_MS;

        for (const side of [1, 2] as TeamSide[]) {
            match.teams[side].participants.forEach((participant, index) => {
                const user = getCharacterById(participant.id);

                if (user) {
                    user.challengeMatchId = match.id;
                    user.challengeTeam = side;
                    this.applyTeamColor(match, user, side);
                    this.setShieldBlockedForRound(user, false);
                    this.setParticipantLock(user, true, releaseAt);
                }

                this.restoreParticipantForCombat(match, participant, side, index);
            });
        }

        for (let value = countdownStart; value >= 0; value--) {
            const timerId = setTimeout(
                () => {
                    if (match.finished) {
                        return;
                    }

                    this.sendMatchConsole(match, `[Arena] ${value > 0 ? value : "¡A COMBATIR!"}`);
                },
                (countdownStart - value) * COUNTDOWN_STEP_MS,
            );

            match.timerIds.push(timerId as unknown as number);
        }

        const releaseTimerId = setTimeout(
            () => {
                if (match.finished) {
                    return;
                }

                for (const participant of getActiveParticipants(match)) {
                    this.setParticipantLock(participant, false);
                }

                this.sendMatchConsole(match, "[Arena] ¡PELEA!", "#00E676");
            },
            (countdownStart + 1) * COUNTDOWN_STEP_MS,
        );

        match.timerIds.push(releaseTimerId as unknown as number);

        const shieldDisableTimerId = setTimeout(() => {
            if (!match.finished) {
                this.disableShieldsForRound(match);
            }
        }, SHIELD_DISABLE_DELAY_MS);

        match.timerIds.push(shieldDisableTimerId as unknown as number);
    },

    getTeamDisplayName(team: MatchTeam) {
        return team.participants.map((participant) => participant.name).join(" y ");
    },

    logFinishedMatch(match: ActiveMatch, winnerSide: TeamSide, reason?: string) {
        const funct = getFunctions();

        funct.logChallengeHistory({
            matchId: match.id,
            teamSize: match.teamSize,
            instanceMapId: match.instanceMapId,
            baseMapId: match.baseMapId,
            winnerSide,
            finishReason: reason ?? null,
            teamOneScore: match.teams[1].score,
            teamTwoScore: match.teams[2].score,
            participants: [1, 2].flatMap((side) =>
                match.teams[side as TeamSide].participants.map((participant) => ({
                    characterId: participant.persistedId,
                    characterName: participant.name,
                    teamSide: side,
                    level: participant.level,
                    className: participant.className,
                    raceName: participant.raceName,
                })),
            ),
            startedAt: new Date(match.createdAt).toISOString(),
            finishedAt: new Date(now()).toISOString(),
        });
    },

    finishMatch(match: ActiveMatch, winnerSide: TeamSide, reason?: string) {
        if (match.finished) {
            return;
        }

        match.finished = true;
        this.clearTimers(match);
        this.closeVoiceRooms(match);

        const winnerTeam = match.teams[winnerSide];
        const loserTeam = match.teams[winnerSide === 1 ? 2 : 1];
        const handleProtocol = getHandleProtocol();
        const winnerLabel = this.getTeamDisplayName(winnerTeam);
        const loserLabel = this.getTeamDisplayName(loserTeam);
        const suffix = reason ? ` (${reason})` : "";

        this.sendMatchConsole(match, `[Retos] Ganador: ${winnerLabel}${suffix}`);
        handleProtocol.consoleToAll(
            `[Retos] ${winnerLabel} ganó el reto contra ${loserLabel}${suffix}.`,
            "#E69500",
            1,
            0,
        );

        for (const side of [1, 2] as TeamSide[]) {
            for (const participant of match.teams[side].participants) {
                this.restoreParticipantToOrigin(participant);
            }
        }

        this.logFinishedMatch(match, winnerSide, reason);

        this.destroyMatchInstanceMap(match.instanceMapId);

        delete this.activeMatches[match.id];
    },

    scheduleNextRound(match: ActiveMatch, winnerSide: TeamSide) {
        match.resolvingRound = true;
        match.teams[winnerSide].score += 1;
        const targetScore = match.targetScore ?? 2;

        if (match.teams[winnerSide].score >= targetScore) {
            const finishTimerId = setTimeout(() => {
                this.finishMatch(match, winnerSide);
            }, 0);

            match.timerIds.push(finishTimerId as unknown as number);
            return;
        }

        this.sendMatchConsole(
            match,
            `[Retos] Punto para ${this.getTeamDisplayName(match.teams[winnerSide])}. Marcador ${match.teams[1].score}-${match.teams[2].score}.`,
        );

        const timerId = setTimeout(() => {
            if (!match.finished) {
                this.startRound(match);
            }
        }, 0);

        match.timerIds.push(timerId as unknown as number);
    },

    joinChallengeByUserId(idUser: string | number, challengeId: string) {
        const user = getCharacterById(idUser);

        if (!user || user.cerrado || !user.connected) {
            throw new Error("Debes estar conectado para usar retos.");
        }

        this.requireRetosAccess(user);

        this.pruneOpenChallenges();

        const challenge = this.openChallenges[challengeId];

        if (!challenge) {
            throw new Error("El reto ya no está disponible.");
        }

        const proposer = getCharacterById(challenge.proposerLeaderRuntimeId);

        if (!proposer) {
            delete this.openChallenges[challengeId];
            throw new Error("El retador ya no está disponible.");
        }

        const teamOneUsers = this.deriveTeam(proposer, challenge.teamSize, {
            excludeOpenChallengeId: challenge.id,
        });
        const teamTwoUsers = this.deriveTeam(user, challenge.teamSize);
        const teamOneIds = new Set(teamOneUsers.map((member) => String(member.id)));

        for (const member of teamTwoUsers) {
            if (teamOneIds.has(String(member.id))) {
                throw new Error("No puedes aceptar tu propio reto.");
            }
        }

        delete this.openChallenges[challengeId];

        const arenaMapIds = getArenaMapIds();

        if (arenaMapIds.length <= 1) {
            const matchId = this.startMatchForTeams(
                challenge.teamSize,
                teamOneUsers,
                teamTwoUsers,
                arenaMapIds[0] ?? CHALLENGE_BASE_MAP_ID,
            );

            return {
                ok: true,
                matchId,
            };
        }

        const vetoId = this.createChallengeVetoSession(challenge.teamSize, teamOneUsers, teamTwoUsers);

        return {
            ok: true,
            vetoId,
        };
    },

    startMatchForTeams(
        teamSize: TeamSize,
        teamOneUsers: RuntimeCharacter[],
        teamTwoUsers: RuntimeCharacter[],
        baseMapId: number,
    ) {
        const matchId = this.createId("match");
        const match: ActiveMatch = {
            id: matchId,
            createdAt: now(),
            teamSize,
            instanceMapId: this.createMatchInstanceMap(baseMapId),
            baseMapId,
            teams: {
                1: {
                    side: 1,
                    participants: teamOneUsers.map((member) => this.buildMatchParticipant(member)),
                    score: 0,
                },
                2: {
                    side: 2,
                    participants: teamTwoUsers.map((member) => this.buildMatchParticipant(member)),
                    score: 0,
                },
            },
            timerIds: [],
            resolvingRound: false,
            finished: false,
        };

        this.activeMatches[matchId] = match;

        this.sendMatchConsole(match, `[Retos] Comienza ${teamSize}vs${teamSize}. Primero en ganar 2 rondas.`);
        this.openVoiceRooms(match);
        this.startRound(match);

        return matchId;
    },

    createVetoStepTimeoutTimer(vetoId: string) {
        return setTimeout(() => {
            this.autoResolveVetoStep(vetoId);
        }, CHALLENGE_VETO_STEP_TIMEOUT_MS) as unknown as number;
    },

    clearVetoTimer(session: ChallengeVetoSession) {
        if (session.timerId !== null) {
            clearTimeout(session.timerId);
            session.timerId = null;
        }
    },

    buildVetoStatePayload(session: ChallengeVetoSession): ChallengeVetoStatePayload {
        const currentStep = session.sequence[session.stepIndex] ?? null;

        return {
            vetoId: session.id,
            teamSize: session.teamSize,
            mapPool: session.mapPool,
            remainingMapIds: session.remainingMapIds,
            bannedMapIds: session.bannedMapIds,
            totalSteps: session.sequence.length,
            stepIndex: session.stepIndex,
            currentTurnSide: currentStep?.side ?? null,
            deadlineAt: session.deadlineAt,
            resolved: session.resolved,
        };
    },

    getVetoSessionParticipants(session: ChallengeVetoSession) {
        return [...session.teamOneParticipants, ...session.teamTwoParticipants];
    },

    broadcastVetoState(session: ChallengeVetoSession, extra?: Partial<ChallengeVetoStatePayload>) {
        const handleProtocol = getHandleProtocol();
        const basePayload = { ...this.buildVetoStatePayload(session), ...extra };
        const teamsBySide: Record<TeamSide, RuntimeCharacter[]> = {
            1: session.teamOneParticipants,
            2: session.teamTwoParticipants,
        };

        for (const side of [1, 2] as TeamSide[]) {
            teamsBySide[side].forEach((participant, index) => {
                const client = getClientById(participant.id);

                if (client) {
                    handleProtocol.challengeVetoState(
                        { ...basePayload, yourSide: side, isLeader: index === 0 },
                        client,
                    );
                }
            });
        }
    },

    sendVetoConsole(session: ChallengeVetoSession, message: string, color = "#E69500") {
        const handleProtocol = getHandleProtocol();

        for (const participant of this.getVetoSessionParticipants(session)) {
            const client = getClientById(participant.id);

            if (client) {
                handleProtocol.console(message, color, 1, 0, client);
            }
        }
    },

    createChallengeVetoSession(teamSize: TeamSize, teamOneUsers: RuntimeCharacter[], teamTwoUsers: RuntimeCharacter[]) {
        const vetoId = this.createId("veto");
        const arenaMapIds = getArenaMapIds();
        const sequence = buildVetoSequence(arenaMapIds.length);
        const session: ChallengeVetoSession = {
            id: vetoId,
            createdAt: now(),
            teamSize,
            teamOneParticipants: teamOneUsers,
            teamTwoParticipants: teamTwoUsers,
            mapPool: arenaMapIds,
            remainingMapIds: [...arenaMapIds],
            bannedMapIds: [],
            sequence,
            stepIndex: 0,
            deadlineAt: now() + CHALLENGE_VETO_STEP_TIMEOUT_MS,
            timerId: null,
            resolved: false,
        };

        this.vetoSessions[vetoId] = session;

        const firstTurnTeamName = teamOneUsers.map((member) => member.nameCharacter).join(" y ");
        this.sendVetoConsole(session, `[Retos] Veteo de mapas: le toca banear a ${firstTurnTeamName}.`);
        this.broadcastVetoState(session);
        session.timerId = this.createVetoStepTimeoutTimer(vetoId);

        return vetoId;
    },

    getVetoParticipantSide(session: ChallengeVetoSession, user: RuntimeCharacter): TeamSide | null {
        if (session.teamOneParticipants[0] && String(session.teamOneParticipants[0].id) === String(user.id)) {
            return 1;
        }

        if (session.teamTwoParticipants[0] && String(session.teamTwoParticipants[0].id) === String(user.id)) {
            return 2;
        }

        return null;
    },

    applyVetoBan(session: ChallengeVetoSession, mapId: number, side: TeamSide) {
        if (!session.remainingMapIds.includes(mapId)) {
            throw new Error("Ese mapa ya no está disponible para vetar.");
        }

        this.clearVetoTimer(session);

        session.remainingMapIds = session.remainingMapIds.filter((id) => id !== mapId);
        session.bannedMapIds.push({ mapId, side });
        session.stepIndex += 1;

        if (session.remainingMapIds.length <= 1 || session.stepIndex >= session.sequence.length) {
            this.resolveVetoSession(session);
            return;
        }

        session.deadlineAt = now() + CHALLENGE_VETO_STEP_TIMEOUT_MS;
        this.broadcastVetoState(session);
        session.timerId = this.createVetoStepTimeoutTimer(session.id);
    },

    resolveVetoSession(session: ChallengeVetoSession) {
        session.resolved = true;
        delete this.vetoSessions[session.id];

        const selectedMapId = session.remainingMapIds[0] ?? session.mapPool[0] ?? CHALLENGE_BASE_MAP_ID;
        const matchId = this.startMatchForTeams(
            session.teamSize,
            session.teamOneParticipants,
            session.teamTwoParticipants,
            selectedMapId,
        );

        this.broadcastVetoState(session, { resolved: true, selectedMapId, matchId });
    },

    autoResolveVetoStep(vetoId: string) {
        const session = this.vetoSessions[vetoId];

        if (!session || session.resolved) {
            return;
        }

        const currentStep = session.sequence[session.stepIndex];

        if (!currentStep || session.remainingMapIds.length === 0) {
            return;
        }

        const randomIndex = Math.floor(Math.random() * session.remainingMapIds.length);
        const mapId = session.remainingMapIds[randomIndex];

        this.sendVetoConsole(session, "[Retos] Se agotó el tiempo: se baneó un mapa al azar.", "#d94125");
        this.applyVetoBan(session, mapId, currentStep.side);
    },

    submitChallengeVetoBan(idUser: string | number, vetoId: string, mapId: number) {
        const user = getCharacterById(idUser);

        if (!user || user.cerrado || !user.connected) {
            throw new Error("Debes estar conectado para usar retos.");
        }

        const session = this.vetoSessions[vetoId];

        if (!session || session.resolved) {
            throw new Error("El veteo de mapas ya no está disponible.");
        }

        const currentStep = session.sequence[session.stepIndex];

        if (!currentStep) {
            throw new Error("El veteo de mapas ya terminó.");
        }

        const participantSide = this.getVetoParticipantSide(session, user);

        if (!participantSide) {
            throw new Error("Solo el líder de cada equipo puede vetar mapas.");
        }

        if (participantSide !== currentStep.side) {
            throw new Error("No es tu turno de vetar un mapa.");
        }

        this.applyVetoBan(session, mapId, currentStep.side);

        return { ok: true };
    },

    cancelVetoSessionForUser(user: RuntimeCharacter, reason: string) {
        for (const [vetoId, session] of Object.entries(this.vetoSessions)) {
            const isParticipant = this.getVetoSessionParticipants(session).some(
                (participant) => String(participant.id) === String(user.id),
            );

            if (!isParticipant) {
                continue;
            }

            this.clearVetoTimer(session);
            delete this.vetoSessions[vetoId];
            this.broadcastVetoState(session, { resolved: true, cancelled: true, reason });
        }
    },

    createMatchmaking2v2Match(teamOneUsers: RuntimeCharacter[], teamTwoUsers: RuntimeCharacter[]) {
        const matchId = this.createId("matchmaking");
        const match: ActiveMatch = {
            id: matchId,
            createdAt: now(),
            teamSize: 2,
            targetScore: 1,
            instanceMapId: this.createMatchInstanceMap(getArenaMapIds()[0] ?? CHALLENGE_BASE_MAP_ID),
            baseMapId: getArenaMapIds()[0] ?? CHALLENGE_BASE_MAP_ID,
            teams: {
                1: {
                    side: 1,
                    participants: teamOneUsers.map((member) => this.buildMatchParticipant(member)),
                    score: 0,
                },
                2: {
                    side: 2,
                    participants: teamTwoUsers.map((member) => this.buildMatchParticipant(member)),
                    score: 0,
                },
            },
            timerIds: [],
            resolvingRound: false,
            finished: false,
        };

        this.activeMatches[matchId] = match;

        this.sendMatchConsole(
            match,
            "[Arena Matchmaking 2v2] ¡Partida encontrada! Preparando arena...",
            "#00E676",
        );
        this.openVoiceRooms(match);
        this.startRound(match, 3);

        return {
            ok: true,
            matchId,
        };
    },

    /**
     * En los 2v2 cada equipo se pinta de un color: el 1 como ciudadano y el 2 como criminal.
     * En 1v1 no hace falta porque no hay aliados que confundir.
     */
    applyTeamColor(match: ActiveMatch, user: RuntimeCharacter, side: TeamSide) {
        if (match.teamSize !== 2) {
            return;
        }

        getGame().setChallengeTeamColor(user.id, side);
    },

    clearTeamColor(user: RuntimeCharacter) {
        getGame().setChallengeTeamColor(user.id, null);
    },

    sendVoicePayload(idUser: RuntimeCharacter["id"], payload: VoiceRoomPayload) {
        const client = getClientById(idUser);

        if (!client) {
            return;
        }

        getHandleProtocol().voiceSignal(payload, client);
    },

    getVoiceTeammate(match: ActiveMatch, user: RuntimeCharacter) {
        const side = getParticipantSideFromMatch(match, user);

        if (!side) {
            return null;
        }

        const teammate = match.teams[side].participants.find(
            (participant) => String(participant.id) !== String(user.id),
        );

        return teammate ? (getCharacterById(teammate.id) ?? null) : null;
    },

    /**
     * Avisa a cada integrante de un equipo 2v2 quién es su compañero de voz.
     * El cliente sólo pide el micrófono si el jugador acepta unirse.
     */
    openVoiceRooms(match: ActiveMatch) {
        if (match.teamSize !== 2) {
            return;
        }

        const iceServers = getVoiceIceServers();

        for (const side of [1, 2] as TeamSide[]) {
            const [first, second] = match.teams[side].participants;

            if (!first || !second) {
                continue;
            }

            const roomId = getVoiceRoomId(match, side);
            // El de id menor arranca la negociación para que no haya oferta cruzada.
            const initiatorId = String(first.id) < String(second.id) ? String(first.id) : String(second.id);

            for (const [self, peer] of [
                [first, second],
                [second, first],
            ] as const) {
                this.sendVoicePayload(self.id, {
                    type: "room",
                    roomId,
                    peerId: String(peer.id),
                    peerName: peer.name,
                    initiator: String(self.id) === initiatorId,
                    iceServers,
                });

                const client = getClientById(self.id);

                if (client) {
                    getHandleProtocol().console(
                        `[Voz] Podés hablar con ${peer.name}: unite desde el panel de voz del equipo.`,
                        "#00E676",
                        0,
                        0,
                        client,
                    );
                }
            }
        }
    },

    closeVoiceRooms(match: ActiveMatch) {
        if (match.teamSize !== 2) {
            return;
        }

        for (const side of [1, 2] as TeamSide[]) {
            const roomId = getVoiceRoomId(match, side);

            for (const participant of match.teams[side].participants) {
                delete this.voiceSignalRates[String(participant.id)];
                this.sendVoicePayload(participant.id, { type: "closed", roomId });
            }
        }
    },

    isVoiceSignalRateExceeded(idUser: RuntimeCharacter["id"]) {
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
     * Reenvía la señalización WebRTC (oferta/respuesta/candidatos ICE) al compañero
     * de equipo. El servidor nunca ve ni transporta el audio: sólo el handshake.
     */
    relayVoiceSignal(idUser: string | number, signal: unknown) {
        const user = getCharacterById(idUser);

        if (!user) {
            return;
        }

        const match = this.getBusyMatchByCharacter(user);

        if (!match || match.finished || match.teamSize !== 2) {
            return;
        }

        const side = getParticipantSideFromMatch(match, user);

        if (!side) {
            return;
        }

        if (this.isVoiceSignalRateExceeded(user.id)) {
            return;
        }

        const teammate = this.getVoiceTeammate(match, user);

        if (!teammate) {
            return;
        }

        this.sendVoicePayload(teammate.id, {
            type: "signal",
            roomId: getVoiceRoomId(match, side),
            fromId: String(user.id),
            signal,
        });
    },

    onCharacterDeath(user: RuntimeCharacter | undefined) {
        const match = this.getBusyMatchByCharacter(user);

        if (!match || match.finished || match.resolvingRound || !user?.challengeTeam) {
            return;
        }

        const defeatedSide = Number(user.challengeTeam) as TeamSide;
        const defeatedTeam = match.teams[defeatedSide];
        const allDefeated = defeatedTeam.participants.every((participant) => getCharacterById(participant.id)?.dead);

        if (!allDefeated) {
            return;
        }

        const winnerSide = defeatedSide === 1 ? 2 : 1;
        this.scheduleNextRound(match, winnerSide);
    },

    onPlayerDisconnected(user: RuntimeCharacter | undefined) {
        if (!user) {
            return;
        }

        for (const [challengeId, challenge] of Object.entries(this.openChallenges)) {
            if (challenge.proposerTeamRuntimeIds.some((runtimeId) => runtimeId === String(user.id))) {
                delete this.openChallenges[challengeId];
            }
        }

        this.cancelVetoSessionForUser(user, "abandono");

        const match = this.getBusyMatchByCharacter(user);

        if (!match || match.finished) {
            return;
        }

        const teamSide = Number(user.challengeTeam ?? 0) as TeamSide;

        if (teamSide !== 1 && teamSide !== 2) {
            return;
        }

        const winnerSide = teamSide === 1 ? 2 : 1;
        this.finishMatch(match, winnerSide, "abandono");
    },
};

module.exports = challengeManager;
