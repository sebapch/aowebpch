"use client";

import { LAYER_NAMES, TRIGGER_LABELS, type ExpandedTile } from "../../lib/editor/types";
import type { LayerIndex } from "./model/EditorMapModel";

type Props = {
    tile: ExpandedTile | null;
    x: number | null;
    y: number | null;
    onAddNpc?: (x: number, y: number, npcIndex: number) => void;
    onOpenCatalog?: () => void;
    onRemoveObject?: (x: number, y: number) => void;
    onRemoveNpc?: (x: number, y: number) => void;
    onRemoveTrigger?: (x: number, y: number) => void;
    onRemoveExit?: (x: number, y: number) => void;
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

export function TileInspector({
    tile,
    x,
    y,
    onAddNpc,
    onOpenCatalog,
    onRemoveObject,
    onRemoveNpc,
    onRemoveTrigger,
    onRemoveExit,
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
                                <button
                                    type="button"
                                    onClick={() => onClearLayer?.(x, y, layer)}
                                    className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 transition-colors hover:border-red-800 hover:bg-red-950 hover:text-red-300"
                                    title={`Borrar grafico Grh #${grhId} de Capa ${layer}`}
                                >
                                    Borrar
                                </button>
                            )}
                        </div>
                    );
                })}

                <Row label="Bloqueado">
                    {tile.blocked ? <span className="text-red-400">si</span> : <span className="text-slate-600">no</span>}
                </Row>

                {tile.object && (
                    <div className="py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">Objeto</span>
                            <button
                                type="button"
                                onClick={() => onRemoveObject?.(x, y)}
                                className="flex items-center gap-1 rounded border border-red-800/80 bg-red-950/80 px-2 py-0.5 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-900"
                                title="Suprimir objeto de este tile"
                            >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Suprimir
                            </button>
                        </div>
                        <div className="mt-1 font-mono text-xs text-green-300">
                            #{tile.object.objIndex} · Cant: {tile.object.amount}
                        </div>
                    </div>
                )}

                {tile.spawn || tile.npc !== undefined ? (
                    <div className="py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">NPC</span>
                            <button
                                type="button"
                                onClick={() => onRemoveNpc?.(x, y)}
                                className="flex items-center gap-1 rounded border border-red-800/80 bg-red-950/80 px-2 py-0.5 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-900"
                                title="Suprimir NPC de este tile"
                            >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Suprimir
                            </button>
                        </div>
                        <div className="mt-1 font-mono text-xs text-yellow-300">
                            {tile.spawn ? (
                                <>
                                    Spawn #{tile.spawn.npcIndex}
                                    {tile.spawn.movement !== undefined ? ` · Mov ${tile.spawn.movement}` : ""}
                                </>
                            ) : (
                                <>Inline #{tile.npc}</>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="py-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">Agregar NPC</span>
                            {onOpenCatalog && (
                                <button
                                    type="button"
                                    onClick={onOpenCatalog}
                                    className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 underline"
                                >
                                    🔍 Catálogo (Amistosos / Monstruos)
                                </button>
                            )}
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
                            className="flex gap-1"
                        >
                            <input
                                name="npcId"
                                type="number"
                                min={1}
                                placeholder="ID NPC (ej. 1)"
                                className="w-24 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-200"
                            />
                            <button
                                type="submit"
                                className="rounded border border-amber-600/80 bg-amber-950/80 px-2 py-0.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-900"
                            >
                                Colocar
                            </button>
                        </form>
                    </div>
                )}

                {tile.exit && (
                    <div className="py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">Salida</span>
                            <button
                                type="button"
                                onClick={() => onRemoveExit?.(x, y)}
                                className="flex items-center gap-1 rounded border border-red-800/80 bg-red-950/80 px-2 py-0.5 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-900"
                                title="Suprimir traslado/salida"
                            >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Suprimir
                            </button>
                        </div>
                        <div className="mt-1 font-mono text-xs text-cyan-300">
                            {"map" in tile.exit ? (
                                <>Mapa {tile.exit.map} ({tile.exit.x}, {tile.exit.y})</>
                            ) : (
                                <>{tile.exit.destinations.length} destinos</>
                            )}
                        </div>
                    </div>
                )}

                {tile.trigger !== undefined && (
                    <div className="py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase tracking-wide text-slate-500">Trigger</span>
                            <button
                                type="button"
                                onClick={() => onRemoveTrigger?.(x, y)}
                                className="flex items-center gap-1 rounded border border-red-800/80 bg-red-950/80 px-2 py-0.5 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-900"
                                title="Suprimir trigger"
                            >
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Suprimir
                            </button>
                        </div>
                        <div className="mt-1 font-mono text-xs text-fuchsia-300">
                            {TRIGGER_LABELS[tile.trigger] ?? tile.trigger}
                        </div>
                    </div>
                )}
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
