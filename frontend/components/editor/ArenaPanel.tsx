"use client";

import {
    MAX_ARENA_SPAWNS_PER_TEAM,
    type ArenaSpawnConfig,
    type ArenaSpawnPoint,
    type MapMetadata,
    type MapSummary,
} from "../../lib/editor/types";

const EMPTY_ARENA_SPAWNS: ArenaSpawnConfig = { team1: [], team2: [] };

/**
 * Editor de configuracion de arena (`meta.isArena` / `meta.arenaSpawns`). Los
 * cambios viajan dentro del bundle en el guardado normal, igual que el resto
 * de la metadata.
 */
export function ArenaPanel({
    meta,
    armedTeam,
    maps = [],
    onChange,
    onArmTeam,
    onSelectMap,
    onClose,
}: {
    meta: MapMetadata;
    /** Equipo para el que el siguiente clic en el mapa agrega un spawn, o null si no hay colocacion activa. */
    armedTeam: 1 | 2 | null;
    maps?: MapSummary[];
    onChange: (meta: MapMetadata) => void;
    onArmTeam: (team: 1 | 2 | null) => void;
    onSelectMap?: (mapId: number) => void;
    onClose: () => void;
}) {
    const isArena = meta.isArena === true;
    const rawSpawns = meta.arenaSpawns;
    const spawns: ArenaSpawnConfig = {
        team1: rawSpawns?.team1 ?? [],
        team2: rawSpawns?.team2 ?? [],
    };

    const updateSpawns = (next: ArenaSpawnConfig) => {
        onChange({
            ...meta,
            arenaSpawns: {
                team1: next.team1 ?? [],
                team2: next.team2 ?? [],
            },
        });
    };

    const removeSpawn = (team: "team1" | "team2", index: number) => {
        updateSpawns({
            team1: spawns.team1,
            team2: spawns.team2,
            [team]: spawns[team].filter((_, entryIndex) => entryIndex !== index),
        });
    };

    // Mapas marcados como arena en la lista del editor
    const arenaMaps = maps.filter((m) => m.isArena || m.id === meta.id && isArena);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-200 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                            <span>🏟️</span> Configuración de arena — Mapa {meta.id}
                        </h2>
                        <p className="text-[11px] text-slate-400">
                            Se guarda con Ctrl+S junto con el resto del mapa.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                        onClick={onClose}
                    >
                        Cerrar
                    </button>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isArena}
                            onChange={(event) => onChange({ ...meta, isArena: event.target.checked })}
                            className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                        />
                        Es arena (habilitado para Retos por equipos 2v2/3v3/4v4)
                    </label>

                    {!isArena && (
                        <p className="text-[11px] leading-relaxed text-slate-400 bg-slate-950/50 p-2.5 rounded border border-slate-800">
                            Activa &quot;Es arena&quot; para configurar los puntos de spawn de cada equipo.
                        </p>
                    )}

                    {isArena && (
                        <>
                            <p className="text-[11px] leading-relaxed text-slate-400">
                                Hasta {MAX_ARENA_SPAWNS_PER_TEAM} puntos por equipo. Al presionar &quot;+ Agregar en el mapa&quot;, este modal se cerrará para que puedas hacer clic directamente en los casilleros del mapa.
                            </p>

                            <ArenaTeamSection
                                label="Equipo 1"
                                color="text-sky-400"
                                team="team1"
                                points={spawns.team1}
                                armed={armedTeam === 1}
                                onArm={() => {
                                    if (!isArena) {
                                        onChange({ ...meta, isArena: true });
                                    }
                                    onArmTeam(armedTeam === 1 ? null : 1);
                                }}
                                onRemove={(index) => removeSpawn("team1", index)}
                            />

                            <ArenaTeamSection
                                label="Equipo 2"
                                color="text-rose-400"
                                team="team2"
                                points={spawns.team2}
                                armed={armedTeam === 2}
                                onArm={() => {
                                    if (!isArena) {
                                        onChange({ ...meta, isArena: true });
                                    }
                                    onArmTeam(armedTeam === 2 ? null : 2);
                                }}
                                onRemove={(index) => removeSpawn("team2", index)}
                            />
                        </>
                    )}

                    {/* Lista de Mapas marcados como arenas en el servidor */}
                    {arenaMaps.length > 0 && (
                        <div className="border-t border-slate-800 pt-3 space-y-2">
                            <h3 className="text-xs font-semibold text-amber-300 uppercase tracking-wide flex items-center justify-between">
                                <span>Arenas registradas ({arenaMaps.length})</span>
                            </h3>
                            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                                {arenaMaps.map((map) => (
                                    <div
                                        key={map.id}
                                        className={`flex items-center justify-between rounded border px-2.5 py-1.5 text-xs transition-colors ${
                                            map.id === meta.id
                                                ? "border-amber-500/60 bg-amber-950/40 text-amber-200 font-semibold"
                                                : "border-slate-800 bg-slate-950/60 text-slate-300 hover:bg-slate-800/80"
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-mono text-amber-400 font-bold shrink-0">
                                                #{map.id}
                                            </span>
                                            <span className="truncate">{map.name || "(Sin nombre)"}</span>
                                            {map.id === meta.id && (
                                                <span className="text-[10px] text-amber-400/80 shrink-0">
                                                    (actual)
                                                </span>
                                            )}
                                        </div>

                                        {onSelectMap && map.id !== meta.id && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onSelectMap(map.id);
                                                    onClose();
                                                }}
                                                className="shrink-0 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                                            >
                                                Cargar mapa
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
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
                <p className="text-[11px] text-slate-500">Sin spawns configurados.</p>
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
                                className="text-[11px] text-slate-400 hover:text-red-400 transition-colors"
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
