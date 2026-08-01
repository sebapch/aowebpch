import type { EntityId, Position, RuntimeCharacter, TimedTracker } from "./types/runtime";

export {};

const vars = require("./vars");
const funct = require("./functions");

/**
 * Tipos de violación detectables desde el servidor.
 *
 * Las variantes `*Burst` son señales de temporización: un cliente legítimo puede
 * dispararlas de forma aislada por un pico de latencia, así que pesan poco.
 * Las variantes `*OutOfRange` solo las puede producir un cliente modificado,
 * porque el cliente oficial nunca envía un objetivo fuera del área de visión.
 */
export type ViolationKind =
    | "speedhack"
    | "meleeBurst"
    | "spellBurst"
    | "rangedBurst"
    | "useItemBurst"
    | "spellOutOfRange"
    | "rangedOutOfRange";

const VIOLATION_WEIGHTS: Record<ViolationKind, number> = {
    speedhack: 3,
    meleeBurst: 2,
    spellBurst: 2,
    rangedBurst: 2,
    useItemBurst: 2,
    spellOutOfRange: 6,
    rangedOutOfRange: 6,
};

// Cada SUSPICION_HALF_LIFE_MS sin violaciones el puntaje se reduce a la mitad.
const SUSPICION_HALF_LIFE_MS = 5 * 60 * 1000;
const SUSPICION_ALERT_THRESHOLD = 12;
const SUSPICION_ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const SUSPICION_MAX_SCORE = 100;

type SuspicionState = {
    score: number;
    lastViolationAt: number;
    lastAlertAt: number;
    firstViolationAt: number;
    counts: Partial<Record<ViolationKind, number>>;
};

/**
 * El estado vive en el módulo y no en el personaje a propósito: los objetos de
 * `vars.personajes` se serializan hacia la base de datos, y este estado es
 * puramente de sesión.
 */
const suspicionByCharacter = new Map<string, SuspicionState>();

function decayScore(state: SuspicionState, now: number): number {
    const elapsedMs = Math.max(0, now - state.lastViolationAt);

    if (elapsedMs <= 0) {
        return state.score;
    }

    return state.score * Math.pow(0.5, elapsedMs / SUSPICION_HALF_LIFE_MS);
}

/**
 * Evalúa una ráfaga de acciones contra la ventana mínima plausible.
 *
 * El tracker acumula acciones hasta `threshold`. Cuando las alcanza, compara el
 * tiempo transcurrido contra `minWindowMs`: si el jugador completó la ráfaga más
 * rápido de lo que permite el cooldown del servidor, no es un humano.
 *
 * Devuelve el nuevo contador para que lo asigne quien llama, evitando depender
 * del nombre del campo (`pasos`, `hits`, `lanzados`, `usos`).
 */
export function evaluateBurst(
    tracker: TimedTracker,
    currentCount: number,
    threshold: number,
    minWindowMs: number,
    now = Date.now(),
): { count: number; violation: boolean; elapsedMs: number } {
    if (!tracker) {
        return { count: 0, violation: false, elapsedMs: 0 };
    }

    if (!Number.isFinite(tracker.startTimer) || tracker.startTimer <= 0) {
        tracker.startTimer = now;

        return { count: 1, violation: false, elapsedMs: 0 };
    }

    const count = Math.max(0, Number(currentCount) || 0) + 1;

    if (count < threshold) {
        return { count, violation: false, elapsedMs: now - tracker.startTimer };
    }

    const elapsedMs = Math.max(0, now - tracker.startTimer);

    tracker.tiempoTotal = elapsedMs;
    tracker.startTimer = now;

    const window = Math.max(0, Number(minWindowMs) || 0);

    return { count: 0, violation: window > 0 && elapsedMs < window, elapsedMs };
}

/**
 * Un objetivo válido siempre cae dentro del área de visión que el servidor le
 * transmite al cliente. Cualquier coordenada por fuera es imposible de producir
 * jugando normalmente.
 */
export function isWithinVisionRange(user: RuntimeCharacter, pos: Position): boolean {
    if (!user?.pos) {
        return false;
    }

    const deltaX = Math.abs(Number(user.pos.x) - Number(pos.x));
    const deltaY = Math.abs(Number(user.pos.y) - Number(pos.y));

    return deltaX <= Number(vars.areaVisionRangeX) && deltaY <= Number(vars.areaVisionRangeY);
}

/**
 * Registra una violación y devuelve el puntaje de sospecha resultante.
 *
 * No expulsa ni sanciona: los cooldowns del servidor ya rechazan la acción. Esto
 * existe para que la infracción deje rastro y un humano pueda decidir.
 */
export function recordViolation(
    user: RuntimeCharacter | undefined,
    kind: ViolationKind,
    detail = "",
    now = Date.now(),
): number {
    if (!user || typeof user.id === "undefined" || user.id === null) {
        return 0;
    }

    const characterId = String(user.id);
    const previous = suspicionByCharacter.get(characterId);
    const state: SuspicionState = previous ?? {
        score: 0,
        lastViolationAt: now,
        lastAlertAt: 0,
        firstViolationAt: now,
        counts: {},
    };

    const decayedScore = previous ? decayScore(state, now) : 0;

    state.score = Math.min(SUSPICION_MAX_SCORE, decayedScore + VIOLATION_WEIGHTS[kind]);
    state.lastViolationAt = now;
    state.counts[kind] = Number(state.counts[kind] ?? 0) + 1;

    suspicionByCharacter.set(characterId, state);

    const characterName = String(user.nameCharacter ?? characterId);

    console.warn(
        `[AntiCheat] ${characterName} (${characterId}) -> ${kind}` +
            `${detail ? ` | ${detail}` : ""} | score=${state.score.toFixed(1)}`,
    );

    if (state.score >= SUSPICION_ALERT_THRESHOLD && now - state.lastAlertAt >= SUSPICION_ALERT_COOLDOWN_MS) {
        state.lastAlertAt = now;

        const breakdown = Object.entries(state.counts)
            .map(([violationKind, total]) => `${violationKind}=${total}`)
            .join(", ");

        funct.sendTelegramMessage(
            `[AntiCheat] ${characterName} superó el umbral de sospecha ` +
                `(score ${state.score.toFixed(1)}). Detalle: ${breakdown}.`,
        );
    }

    return state.score;
}

export function getSuspicionScore(idUser: EntityId | null | undefined, now = Date.now()): number {
    if (typeof idUser === "undefined" || idUser === null) {
        return 0;
    }

    const state = suspicionByCharacter.get(String(idUser));

    if (!state) {
        return 0;
    }

    return decayScore(state, now);
}

export function getSuspicionReport(
    idUser: EntityId | null | undefined,
    now = Date.now(),
): { score: number; counts: Partial<Record<ViolationKind, number>>; firstViolationAt: number } | undefined {
    if (typeof idUser === "undefined" || idUser === null) {
        return;
    }

    const state = suspicionByCharacter.get(String(idUser));

    if (!state) {
        return;
    }

    return {
        score: decayScore(state, now),
        counts: { ...state.counts },
        firstViolationAt: state.firstViolationAt,
    };
}

export function clearCharacter(idUser: EntityId | null | undefined): void {
    if (typeof idUser === "undefined" || idUser === null) {
        return;
    }

    suspicionByCharacter.delete(String(idUser));
}
