import assert from "node:assert/strict";
import * as antiCheat from "../antiCheat";
import type { Position, RuntimeCharacter, TimedTracker } from "../types/runtime";

const vars = require("../vars");

/**
 * Verifica la logica pura del modulo anti-cheat.
 *
 * Cubre las dos decisiones que toma el servidor:
 *  - `evaluateBurst`: distinguir un ritmo humano de un macro, sin castigar a un
 *    jugador legitimo que sufre un pico de latencia.
 *  - `isWithinVisionRange`: rechazar objetivos que el cliente oficial no pudo
 *    haber visto nunca (el exploit de francotirador a lo ancho del mapa).
 */

type BurstTracker = TimedTracker & { count: number };

function makeTracker(): BurstTracker {
    return { count: 0, tiempoTotal: 0, startTimer: 0 };
}

/** Simula una rafaga de `samples` acciones separadas por `stepMs`. */
function runBurst(
    samples: number,
    stepMs: number,
    threshold: number,
    windowMs: number,
): { violations: number; finalCount: number; lastElapsedMs: number } {
    const tracker = makeTracker();
    let count = 0;
    let now = 1_000;
    let violations = 0;
    let lastElapsedMs = 0;

    for (let i = 0; i < samples; i++) {
        const result = antiCheat.evaluateBurst(tracker, count, threshold, windowMs, now);

        count = result.count;

        if (result.violation) {
            violations++;
            lastElapsedMs = result.elapsedMs;
        }

        now += stepMs;
    }

    return { violations, finalCount: count, lastElapsedMs };
}

const checks: Array<{ name: string; run: () => void }> = [
    {
        name: "la primera muestra arranca el cronometro y nunca es violacion",
        run: () => {
            const tracker = makeTracker();
            const result = antiCheat.evaluateBurst(tracker, 0, 10, 7000, 1_000);

            assert.equal(result.count, 1);
            assert.equal(result.violation, false);
            assert.equal(tracker.startTimer, 1_000);
        },
    },
    {
        name: "un ritmo legitimo (900ms por accion) no se marca",
        run: () => {
            const { violations } = runBurst(10, 900, 10, 7000);
            assert.equal(violations, 0);
        },
    },
    {
        name: "un ritmo apenas por debajo de la ventana no se marca",
        run: () => {
            // 10 acciones separadas 780ms = 7020ms > ventana de 7000ms.
            const { violations } = runBurst(10, 780, 10, 7000);
            assert.equal(violations, 0);
        },
    },
    {
        name: "un macro (100ms por accion) se marca una vez por rafaga",
        run: () => {
            const { violations, finalCount, lastElapsedMs } = runBurst(10, 100, 10, 7000);

            assert.equal(violations, 1);
            assert.equal(lastElapsedMs, 900);
            assert.equal(finalCount, 0, "el contador se reinicia tras evaluar");
        },
    },
    {
        name: "rafagas sucesivas se detectan de forma independiente",
        run: () => {
            const { violations } = runBurst(20, 100, 10, 7000);
            assert.equal(violations, 2);
        },
    },
    {
        name: "un tracker ausente no rompe el handler",
        run: () => {
            const result = antiCheat.evaluateBurst(undefined as unknown as TimedTracker, 5, 10, 7000, 1_000);
            assert.equal(result.violation, false);
        },
    },
    {
        name: "los objetivos dentro del area de vision se aceptan",
        run: () => {
            const rangeX = Number(vars.areaVisionRangeX);
            const rangeY = Number(vars.areaVisionRangeY);
            const user = { pos: { x: 50, y: 50 } } as RuntimeCharacter;
            const at = (x: number, y: number) => ({ x, y }) as Position;

            assert.equal(antiCheat.isWithinVisionRange(user, at(50, 50)), true);
            assert.equal(antiCheat.isWithinVisionRange(user, at(50 + rangeX, 50)), true);
            assert.equal(antiCheat.isWithinVisionRange(user, at(50, 50 + rangeY)), true);
            assert.equal(antiCheat.isWithinVisionRange(user, at(50 - rangeX, 50 - rangeY)), true);
        },
    },
    {
        name: "los objetivos fuera del area de vision se rechazan",
        run: () => {
            const rangeX = Number(vars.areaVisionRangeX);
            const rangeY = Number(vars.areaVisionRangeY);
            const user = { pos: { x: 50, y: 50 } } as RuntimeCharacter;
            const at = (x: number, y: number) => ({ x, y }) as Position;

            assert.equal(antiCheat.isWithinVisionRange(user, at(50 + rangeX + 1, 50)), false);
            assert.equal(antiCheat.isWithinVisionRange(user, at(50, 50 + rangeY + 1)), false);
            // El exploit real: castear o disparar a lo ancho del mapa.
            assert.equal(antiCheat.isWithinVisionRange(user, at(99, 99)), false);
            assert.equal(antiCheat.isWithinVisionRange(user, at(1, 1)), false);
        },
    },
    {
        name: "el score acumula, decae por vida media y se limpia",
        run: () => {
            const characterId = "verify-anticheat-char";
            const user = {
                id: characterId,
                nameCharacter: "Tester",
                pos: { x: 1, y: 1 },
            } as unknown as RuntimeCharacter;

            assert.equal(antiCheat.recordViolation(user, "spellOutOfRange", "", 10_000), 6);
            assert.equal(antiCheat.recordViolation(user, "spellOutOfRange", "", 10_000), 12);

            // Una vida media (5 min) sin infracciones deja el score a la mitad.
            const decayed = antiCheat.getSuspicionScore(characterId, 10_000 + 5 * 60 * 1000);
            assert.ok(Math.abs(decayed - 6) < 0.001, `esperaba ~6, obtuve ${decayed}`);

            const report = antiCheat.getSuspicionReport(characterId, 10_000);
            assert.equal(report?.counts.spellOutOfRange, 2);

            antiCheat.clearCharacter(characterId);
            assert.equal(antiCheat.getSuspicionScore(characterId), 0);
        },
    },
];

function main() {
    const failures: Array<{ name: string; error: unknown }> = [];

    console.log(`Rango de vision del servidor: ${vars.areaVisionRangeX}x${vars.areaVisionRangeY}\n`);

    for (const check of checks) {
        try {
            check.run();
            console.log(`ok    ${check.name}`);
        } catch (error) {
            failures.push({ name: check.name, error });
            console.error(`FALLA ${check.name}`);
        }
    }

    if (failures.length === 0) {
        console.log(`\nAnti-cheat OK: ${checks.length} verificaciones.`);
        return;
    }

    console.error(`\nFALLAS: ${failures.length}\n`);

    for (const failure of failures) {
        console.error(`- ${failure.name}: ${String(failure.error)}\n`);
    }

    process.exitCode = 1;
}

if (require.main === module) {
    main();
}
