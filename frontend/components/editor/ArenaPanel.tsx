"use client";

import { MAX_ARENA_SPAWNS_PER_TEAM, type ArenaSpawnConfig, type ArenaSpawnPoint, type MapMetadata } from "../../lib/editor/types";

const EMPTY_ARENA_SPAWNS: ArenaSpawnConfig = { team1: [], team2: [] };

/**
 * Editor de configuracion de arena (`meta.isArena` / `meta.arenaSpawns`). Los
 * cambios viajan dentro del bundle en el guardado normal, igual que el resto
 * de la metadata.
 */
export function ArenaPanel({
    meta,
    armedTeam,
    onChange,
    onArmTeam,
    onClose,
}: {
    meta: MapMetadata;
    /** Equipo para el que el siguiente clic en el mapa agrega un spawn, o null si no hay colocacion activa. */
    armedTeam: 1 | 2 | null;
    onChange: (meta: MapMetadata) => void;
    onArmTeam: (team: 1 | 2 | null) => void;
    onClose: () => void;
}) {
    const isArena = meta.isArena === true;
    const spawns = meta.arenaSpawns ?? EMPTY_ARENA_SPAWNS;

    const updateSpawns = (next: ArenaSpawnConfig) => {
        onChange({ ...meta, arenaSpawns: next });
    };

    const removeSpawn = (team: "team1" | "team2", index: number) => {
        updateSpawns({
            ...spawns,
            [team]: spawns[team].filter((_, entryIndex) => entryIndex !== index),
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-100">Configuracion de arena — mapa {meta.id}</h2>
                        <p className="text-[11px] text-slate-500">
                            Se guarda con Ctrl+S junto con el resto del mapa.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        onClick={onClose}
                    >
                        Cerrar
                    </button>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                            type="checkbox"
                            checked={isArena}
                            onChange={(event) => onChange({ ...meta, isArena: event.target.checked })}
                        />
                        Es arena (habilitado para Retos por equipos 2v2/3v3/4v4)
                    </label>

                    {!isArena && (
                        <p className="text-[11px] leading-relaxed text-slate-600">
                            Activa &quot;Es arena&quot; para configurar los puntos de spawn de cada equipo.
                        </p>
                    )}

                    {isArena && (
                        <>
                            <p className="text-[11px] leading-relaxed text-slate-500">
                                Hasta {MAX_ARENA_SPAWNS_PER_TEAM} puntos por equipo. Se reusan para los tres modos: 2v2 y
                                3v3 usan los primeros, 4v4 los cuatro.
                            </p>

                            <ArenaTeamSection
                                label="Equipo 1"
                                color="text-sky-300"
                                team="team1"
                                points={spawns.team1}
                                armed={armedTeam === 1}
                                onArm={() => onArmTeam(armedTeam === 1 ? null : 1)}
                                onRemove={(index) => removeSpawn("team1", index)}
                            />

                            <ArenaTeamSection
                                label="Equipo 2"
                                color="text-rose-300"
                                team="team2"
                                points={spawns.team2}
                                armed={armedTeam === 2}
                                onArm={() => onArmTeam(armedTeam === 2 ? null : 2)}
                                onRemove={(index) => removeSpawn("team2", index)}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function ArenaTeamSection({
    label,
    color,
    team,
    points,
    armed,
    onArm,
    onRemove,
}: {
    label: string;
    color: string;
    team: "team1" | "team2";
    points: ArenaSpawnPoint[];
    armed: boolean;
    onArm: () => void;
    onRemove: (index: number) => void;
}) {
    const full = points.length >= MAX_ARENA_SPAWNS_PER_TEAM;

    return (
        <div className="space-y-2 border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between">
                <span className={`text-[11px] uppercase tracking-wide font-semibold ${color}`}>
                    {label} ({points.length}/{MAX_ARENA_SPAWNS_PER_TEAM})
                </span>
                <button
                    type="button"
                    disabled={full && !armed}
                    onClick={onArm}
                    className={`rounded border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        armed
                            ? "border-amber-500/80 bg-amber-950/80 text-amber-200"
                            : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                    title={full ? "Ya hay 4 puntos: elimina uno para agregar otro" : "Haz clic en un tile del mapa para agregar un spawn"}
                >
                    {armed ? "Haz clic en el mapa..." : "+ Agregar en el mapa"}
                </button>
            </div>

            {points.length === 0 ? (
                <p className="text-[11px] text-slate-600">Sin spawns configurados.</p>
            ) : (
                <div className="space-y-1">
                    {points.map((point, index) => (
                        <div
                            key={`${team}-${index}`}
                            className="flex items-center justify-between rounded border border-slate-800 bg-slate-800/50 px-2 py-1"
                        >
                            <span className="font-mono text-xs text-slate-200">
                                #{index + 1} · x {point.x}, y {point.y}
                            </span>
                            <button
                                type="button"
                                onClick={() => onRemove(index)}
                                className="text-[11px] text-slate-500 hover:text-red-300"
                            >
                                quitar
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
