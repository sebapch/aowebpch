"use client";

import { useEffect, useMemo, useState } from "react";
import {
    LAYER_NAMES,
    TRIGGER_LABELS,
    type ExpandedTile,
    type MapSummary,
    type ObjectInfo,
    type TileExit,
} from "../../lib/editor/types";
import type { NPCsDB } from "../../types/game";
import { loadNPCsDB } from "../../utils/gameLoader";
import { isFriendlyNpc } from "./NpcSelectorModal";
import { ItemSearchField, useItemNames } from "./ItemSearchField";
import type { LayerIndex } from "./model/EditorMapModel";

type Props = {
    tile: ExpandedTile | null;
    x: number | null;
    y: number | null;
    /** Para validar el destino de una salida contra el tamano del mapa real. */
    maps?: MapSummary[];
    onAddNpc?: (x: number, y: number, npcIndex: number) => void;
    onOpenCatalog?: () => void;
    recentNpcs?: number[];
    onStartMoveLayer?: (x: number, y: number, layer: LayerIndex, grhId: number) => void;
    onStartMoveObject?: (x: number, y: number) => void;
    onStartMoveNpc?: (x: number, y: number) => void;
    onRemoveObject?: (x: number, y: number) => void;
    onRemoveNpc?: (x: number, y: number) => void;
    onRemoveTrigger?: (x: number, y: number) => void;
    onRemoveExit?: (x: number, y: number) => void;
    onSetExit?: (x: number, y: number, destinations: TileExit[]) => void;
    onSetTrigger?: (x: number, y: number, trigger: number | null) => void;
    onSetObject?: (x: number, y: number, object: ObjectInfo | null) => void;
    onSetSpawnMovement?: (x: number, y: number, movement: number) => void;
    onGoToExit?: (destination: TileExit) => void;
    onClearLayer?: (x: number, y: number, layer: LayerIndex) => void;
    onClearTile?: (x: number, y: number) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
            <span className="text-right text-xs text-slate-200">{children}</span>
        </div>
    );
}

const DELETE_ICON = (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        />
    </svg>
);

function exitDestinations(tile: ExpandedTile): TileExit[] {
    if (!tile.exit) {
        return [];
    }

    return "map" in tile.exit ? [tile.exit] : tile.exit.destinations;
}

export function TileInspector({
    tile,
    x,
    y,
    maps,
    onAddNpc,
    onOpenCatalog,
    recentNpcs,
    onStartMoveLayer,
    onStartMoveObject,
    onStartMoveNpc,
    onRemoveObject,
    onRemoveNpc,
    onRemoveTrigger,
    onRemoveExit,
    onSetExit,
    onSetTrigger,
    onSetObject,
    onSetSpawnMovement,
    onGoToExit,
    onClearLayer,
    onClearTile,
}: Props) {
    if (!tile || x === null || y === null) {
        return (
            <div className="p-3 text-xs text-slate-500">
                Pasa el cursor por el mapa o haz clic en un tile para inspeccionarlo.
            </div>
        );
    }

    const hasAnyContent = Boolean(
        tile.graphics.some((g) => g !== null) ||
            tile.blocked ||
            tile.object ||
            tile.spawn ||
            tile.npc !== undefined ||
            tile.exit ||
            tile.trigger !== undefined,
    );

    return (
        <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm text-slate-100">
                    x {x}, y {y}
                </span>
            </div>

            <div className="divide-y divide-slate-800">
                {([1, 2, 3, 4] as const).map((layer) => {
                    const grhId = tile.graphics[layer - 1];
                    return (
                        <div key={layer} className="flex items-center justify-between py-1 text-xs">
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                                    Capa {layer} · {LAYER_NAMES[layer]}
                                </span>
                                <span className="font-mono text-slate-200">
                                    {grhId !== null ? `Grh #${grhId}` : <span className="font-sans text-xs text-slate-600">vacia</span>}
                                </span>
                            </div>
                            {grhId !== null && (
                                <div className="flex items-center gap-1">
                                    {onStartMoveLayer && (
                                        <button
                                            type="button"
                                            onClick={() => onStartMoveLayer(x, y, layer, grhId)}
                                            className="rounded border border-amber-700/80 bg-amber-950/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-200 transition-colors hover:bg-amber-900"
                                            title={`Mover grafico Grh #${grhId} de Capa ${layer} a otro casillero`}
                                        >
                                            Mover
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => onClearLayer?.(x, y, layer)}
                                        className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 transition-colors hover:border-red-800 hover:bg-red-950 hover:text-red-300"
                                        title={`Borrar grafico Grh #${grhId} de Capa ${layer}`}
                                    >
                                        Borrar
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}

                <Row label="Bloqueado">
                    {tile.blocked ? <span className="text-red-400">si</span> : <span className="text-slate-600">no</span>}
                </Row>

                <ObjectSection
                    object={tile.object ?? null}
                    x={x}
                    y={y}
                    onStartMoveObject={onStartMoveObject}
                    onRemoveObject={onRemoveObject}
                    onSetObject={onSetObject}
                />

                {tile.spawn || tile.npc !== undefined ? (
                    <div className="py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">NPC</span>
                            <div className="flex items-center gap-1">
                                {onStartMoveNpc && (
                                    <button
                                        type="button"
                                        onClick={() => onStartMoveNpc(x, y)}
                                        className="flex items-center gap-1 rounded border border-amber-700/80 bg-amber-950/80 px-2 py-0.5 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-900"
                                        title="Haz clic para reubicar este NPC en otro tile del mapa"
                                    >
                                        ↔ Mover
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onRemoveNpc?.(x, y)}
                                    className="flex items-center gap-1 rounded border border-red-800/80 bg-red-950/80 px-2 py-0.5 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-900"
                                    title="Suprimir NPC de este tile"
                                >
                                    {DELETE_ICON}
                                    Suprimir
                                </button>
                            </div>
                        </div>
                        <div className="mt-1 font-mono text-xs text-yellow-300">
                            {tile.spawn ? <>Spawn #{tile.spawn.npcIndex}</> : <>Inline #{tile.npc}</>}
                        </div>

                        {tile.spawn && onSetSpawnMovement && (
                            <label className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                                <span title="Patron de movimiento con el que el servidor instancia este spawn">
                                    Movimiento
                                </span>
                                <input
                                    type="number"
                                    min={0}
                                    className="w-20 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 font-mono text-xs text-slate-200"
                                    value={tile.spawn.movement ?? 0}
                                    onChange={(event) => onSetSpawnMovement(x, y, Number(event.target.value))}
                                />
                            </label>
                        )}
                    </div>
                ) : (
                    <NpcAddSection
                        x={x}
                        y={y}
                        onAddNpc={onAddNpc}
                        onOpenCatalog={onOpenCatalog}
                        recentNpcs={recentNpcs}
                    />
                )}

                <ExitSection
                    destinations={exitDestinations(tile)}
                    x={x}
                    y={y}
                    maps={maps}
                    onRemoveExit={onRemoveExit}
                    onSetExit={onSetExit}
                    onGoToExit={onGoToExit}
                />

                <div className="py-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-wide text-slate-500">Trigger</span>
                        {tile.trigger !== undefined && (
                            <button
                                type="button"
                                onClick={() => onRemoveTrigger?.(x, y)}
                                className="flex items-center gap-1 rounded border border-red-800/80 bg-red-950/80 px-2 py-0.5 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-900"
                                title="Suprimir trigger"
                            >
                                {DELETE_ICON}
                                Suprimir
                            </button>
                        )}
                    </div>
                    {onSetTrigger ? (
                        <select
                            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-fuchsia-300"
                            value={tile.trigger ?? ""}
                            onChange={(event) =>
                                onSetTrigger(x, y, event.target.value === "" ? null : Number(event.target.value))
                            }
                        >
                            <option value="">Sin trigger</option>
                            {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <div className="mt-1 font-mono text-xs text-fuchsia-300">
                            {tile.trigger === undefined ? "—" : (TRIGGER_LABELS[tile.trigger] ?? tile.trigger)}
                        </div>
                    )}
                </div>
            </div>

            {hasAnyContent && (
                <div className="mt-4 border-t border-slate-800 pt-3">
                    <button
                        type="button"
                        onClick={() => onClearTile?.(x, y)}
                        className="flex w-full items-center justify-center gap-1.5 rounded border border-red-800/80 bg-red-950/60 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:bg-red-900"
                        title="Eliminar gráficos de todas las capas, objetos, NPCs y bloqueos de este casillero"
                    >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Vaciar casillero completo (Limpiar Tile)
                    </button>
                </div>
            )}
        </div>
    );
}

function ObjectSection({
    object,
    x,
    y,
    onStartMoveObject,
    onRemoveObject,
    onSetObject,
}: {
    object: ObjectInfo | null;
    x: number;
    y: number;
    onStartMoveObject?: (x: number, y: number) => void;
    onRemoveObject?: (x: number, y: number) => void;
    onSetObject?: (x: number, y: number, object: ObjectInfo | null) => void;
}) {
    const itemNames = useItemNames(object ? [object.objIndex] : []);

    return (
        <div className="py-2">
            <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">Objeto</span>
                {object && (
                    <div className="flex items-center gap-1">
                        {onStartMoveObject && (
                            <button
                                type="button"
                                onClick={() => onStartMoveObject(x, y)}
                                className="flex items-center gap-1 rounded border border-amber-700/80 bg-amber-950/80 px-2 py-0.5 text-[11px] font-semibold text-amber-200 transition-colors hover:bg-amber-900"
                                title="Haz clic para reubicar este objeto en otro tile del mapa"
                            >
                                ↔ Mover
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => onRemoveObject?.(x, y)}
                            className="flex items-center gap-1 rounded border border-red-800/80 bg-red-950/80 px-2 py-0.5 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-900"
                            title="Suprimir objeto de este tile"
                        >
                            {DELETE_ICON}
                            Suprimir
                        </button>
                    </div>
                )}
            </div>

            {object ? (
                <div className="mt-1 space-y-1">
                    <div className="font-mono text-xs text-green-300">
                        {itemNames[object.objIndex] ?? "..."} <span className="text-slate-500">#{object.objIndex}</span>
                    </div>
                    {onSetObject && (
                        <label className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                            Cantidad
                            <input
                                type="number"
                                min={1}
                                className="w-20 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 font-mono text-xs text-slate-200"
                                value={object.amount}
                                onChange={(event) =>
                                    onSetObject(x, y, { ...object, amount: Math.max(1, Number(event.target.value)) })
                                }
                            />
                        </label>
                    )}
                </div>
            ) : (
                onSetObject && (
                    <div className="mt-1">
                        <ItemSearchField
                            placeholder="Colocar objeto: buscar por nombre o id..."
                            onSelect={(item) => onSetObject(x, y, { objIndex: item.id, amount: 1 })}
                        />
                    </div>
                )
            )}
        </div>
    );
}

function ExitSection({
    destinations,
    x,
    y,
    maps,
    onRemoveExit,
    onSetExit,
    onGoToExit,
}: {
    destinations: TileExit[];
    x: number;
    y: number;
    maps?: MapSummary[];
    onRemoveExit?: (x: number, y: number) => void;
    onSetExit?: (x: number, y: number, destinations: TileExit[]) => void;
    onGoToExit?: (destination: TileExit) => void;
}) {
    const [draft, setDraft] = useState({ map: "", x: "", y: "" });

    /** Un destino invalido se guarda igual pero se marca: el formato lo admite. */
    const describeProblem = (destination: TileExit): string | null => {
        const summary = maps?.find((candidate) => candidate.id === destination.map);

        if (maps && maps.length > 0 && !summary) {
            return `El mapa ${destination.map} no existe`;
        }

        if (summary && (destination.x < 1 || destination.y < 1 || destination.x > summary.width || destination.y > summary.height)) {
            return `Fuera del mapa ${summary.id} (${summary.width}x${summary.height})`;
        }

        return null;
    };

    const addDraft = () => {
        const map = Number.parseInt(draft.map, 10);
        const destX = Number.parseInt(draft.x, 10);
        const destY = Number.parseInt(draft.y, 10);

        if (!Number.isInteger(map) || !Number.isInteger(destX) || !Number.isInteger(destY)) {
            return;
        }

        onSetExit?.(x, y, [...destinations, { map, x: destX, y: destY }]);
        setDraft({ map: "", x: "", y: "" });
    };

    return (
        <div className="py-2">
            <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">Salida</span>
                {destinations.length > 0 && (
                    <button
                        type="button"
                        onClick={() => onRemoveExit?.(x, y)}
                        className="flex items-center gap-1 rounded border border-red-800/80 bg-red-950/80 px-2 py-0.5 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-900"
                        title="Suprimir traslado/salida"
                    >
                        {DELETE_ICON}
                        Suprimir
                    </button>
                )}
            </div>

            <div className="mt-1 space-y-1">
                {destinations.map((destination, index) => {
                    const problem = describeProblem(destination);

                    return (
                        <div key={index} className="rounded border border-slate-800 bg-slate-800/50 px-2 py-1">
                            <div className="flex items-center gap-2 text-xs">
                                <span className="flex-1 font-mono text-cyan-300">
                                    Mapa {destination.map} ({destination.x}, {destination.y})
                                </span>
                                {onGoToExit && (
                                    <button
                                        type="button"
                                        className="text-[11px] text-sky-400 hover:text-sky-300"
                                        onClick={() => onGoToExit(destination)}
                                        title="Abrir el mapa de destino en esa posicion"
                                    >
                                        ir
                                    </button>
                                )}
                                {onSetExit && destinations.length > 1 && (
                                    <button
                                        type="button"
                                        className="text-[11px] text-slate-500 hover:text-red-300"
                                        onClick={() =>
                                            onSetExit(x, y, destinations.filter((_, entryIndex) => entryIndex !== index))
                                        }
                                    >
                                        quitar
                                    </button>
                                )}
                            </div>
                            {problem && <p className="mt-0.5 text-[10px] text-amber-400">⚠ {problem}</p>}
                        </div>
                    );
                })}
                {destinations.length === 0 && <p className="text-[11px] text-slate-600">Sin salida.</p>}
            </div>

            {onSetExit && (
                <div className="mt-2 flex gap-1">
                    <input
                        type="number"
                        min={1}
                        placeholder="mapa"
                        className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-0.5 font-mono text-[11px]"
                        value={draft.map}
                        onChange={(event) => setDraft((current) => ({ ...current, map: event.target.value }))}
                    />
                    <input
                        type="number"
                        min={1}
                        placeholder="x"
                        className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-0.5 font-mono text-[11px]"
                        value={draft.x}
                        onChange={(event) => setDraft((current) => ({ ...current, x: event.target.value }))}
                    />
                    <input
                        type="number"
                        min={1}
                        placeholder="y"
                        className="w-full rounded border border-slate-700 bg-slate-800 px-1 py-0.5 font-mono text-[11px]"
                        value={draft.y}
                        onChange={(event) => setDraft((current) => ({ ...current, y: event.target.value }))}
                    />
                    <button
                        type="button"
                        onClick={addDraft}
                        className="shrink-0 rounded border border-cyan-700/80 bg-cyan-950/80 px-2 py-0.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-900"
                    >
                        {destinations.length > 0 ? "+ destino" : "Crear"}
                    </button>
                </div>
            )}
        </div>
    );
}

function NpcAddSection({
    x,
    y,
    onAddNpc,
    onOpenCatalog,
    recentNpcs,
}: {
    x: number;
    y: number;
    onAddNpc?: (x: number, y: number, npcIndex: number) => void;
    onOpenCatalog?: () => void;
    recentNpcs?: number[];
}) {
    const [db, setDb] = useState<NPCsDB | null>(null);

    useEffect(() => {
        let active = true;
        void loadNPCsDB()
            .then((data) => {
                if (active) setDb(data);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    const npcList = useMemo(() => {
        if (!db) return [];
        const result: Array<{ id: number; name: string; isFriendly: boolean }> = [];
        for (const [idStr, data] of Object.entries(db)) {
            const id = Number.parseInt(idStr, 10);
            if (!Number.isFinite(id)) continue;
            result.push({
                id,
                name: data.name ?? `NPC #${id}`,
                isFriendly: isFriendlyNpc(data),
            });
        }
        return result.sort((a, b) => a.id - b.id);
    }, [db]);

    const friendlyNpcs = useMemo(() => npcList.filter((n) => n.isFriendly), [npcList]);
    const monsterNpcs = useMemo(() => npcList.filter((n) => !n.isFriendly), [npcList]);

    return (
        <div className="py-2 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">Agregar NPC</span>
            </div>

            {onOpenCatalog && (
                <button
                    type="button"
                    onClick={onOpenCatalog}
                    className="w-full rounded-lg border border-sky-600/80 bg-sky-950/80 px-2.5 py-1.5 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-900 flex items-center justify-center gap-1.5 shadow-sm"
                >
                    📋 Catálogo Visual (Amistosos / Monstruos)
                </button>
            )}

            <div>
                <label className="block text-[10px] uppercase font-semibold text-slate-400 mb-1">
                    Desplegar todos los NPCs ({npcList.length}):
                </label>
                <select
                    className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-amber-200 focus:border-amber-500 focus:outline-none"
                    value=""
                    onChange={(e) => {
                        const val = Number.parseInt(e.target.value, 10);
                        if (val > 0) {
                            onAddNpc?.(x, y, val);
                            e.target.value = "";
                        }
                    }}
                >
                    <option value="" disabled>
                        -- Elegir de la lista completa --
                    </option>
                    {friendlyNpcs.length > 0 && (
                        <optgroup label="🟢 Pacíficos / Servicios">
                            {friendlyNpcs.map((npc) => (
                                <option key={npc.id} value={npc.id}>
                                    #{npc.id} · {npc.name}
                                </option>
                            ))}
                        </optgroup>
                    )}
                    {monsterNpcs.length > 0 && (
                        <optgroup label="🔴 Monstruos / Hostiles">
                            {monsterNpcs.map((npc) => (
                                <option key={npc.id} value={npc.id}>
                                    #{npc.id} · {npc.name}
                                </option>
                            ))}
                        </optgroup>
                    )}
                </select>
            </div>

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const input = form.elements.namedItem("npcId") as HTMLInputElement;
                    const val = Number.parseInt(input.value, 10);
                    if (Number.isInteger(val) && val > 0) {
                        onAddNpc?.(x, y, val);
                        input.value = "";
                    }
                }}
                className="flex gap-1 pt-1"
            >
                <input
                    name="npcId"
                    type="number"
                    min={1}
                    placeholder="ID NPC exacto..."
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200 placeholder-slate-500"
                />
                <button
                    type="submit"
                    className="shrink-0 rounded border border-amber-600/80 bg-amber-950/80 px-3 py-1 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-900"
                >
                    Colocar
                </button>
            </form>

            {recentNpcs && recentNpcs.length > 0 && (
                <div className="pt-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400 block mb-1">
                        🕒 NPCs Recientes
                    </span>
                    <div className="flex flex-wrap gap-1">
                        {recentNpcs.map((id) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => onAddNpc?.(x, y, id)}
                                className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-yellow-300 hover:border-amber-500 hover:bg-amber-950 transition-colors"
                                title={`Colocar NPC #${id} en este tile`}
                            >
                                #{id}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

