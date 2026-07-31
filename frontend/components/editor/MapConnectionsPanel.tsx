"use client";

import { useState } from "react";
import { EditorApiError, linkMapEdge } from "../../lib/editor/api";
import { MAP_SIDES, SIDE_LABELS, describeConnections, type MapSide } from "../../lib/editor/mapEdges";
import type { EditorMapBundle, MapSummary } from "../../lib/editor/types";
import type { EditorMapModel } from "./model/EditorMapModel";

/**
 * Conexiones de borde del mapa. En este formato no hay un campo "mapa del
 * norte": cada transicion son ~85 salidas, una por tile del borde, mas las de
 * vuelta en el vecino. Este panel las genera de una y las muestra ya resueltas.
 */
export function MapConnectionsPanel({
    model,
    maps,
    dirty,
    onLinked,
    onGoToMap,
    onClose,
}: {
    model: EditorMapModel;
    maps: MapSummary[];
    dirty: boolean;
    onLinked: (bundle: EditorMapBundle) => void;
    onGoToMap: (mapId: number) => void;
    onClose: () => void;
}) {
    const connections = describeConnections(model);
    const [drafts, setDrafts] = useState<Partial<Record<MapSide, string>>>({});
    const [busySide, setBusySide] = useState<MapSide | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Una transicion de borde solo cuadra si los mapas miden lo mismo.
    const candidates = maps.filter(
        (summary) => summary.id !== model.meta.id && summary.width === model.width && summary.height === model.height,
    );

    const nameOf = (mapId: number) => maps.find((summary) => summary.id === mapId)?.name || "(sin nombre)";

    const apply = async (side: MapSide, neighborMapId: number | null) => {
        setBusySide(side);
        setError(null);
        setNotice(null);

        try {
            const result = await linkMapEdge(model.meta.id, side, neighborMapId);

            onLinked(result.bundle);
            setDrafts((current) => ({ ...current, [side]: "" }));
            setNotice(
                neighborMapId === null
                    ? `${SIDE_LABELS[side]} desconectado (${result.tilesCleared} salidas borradas).`
                    : `${SIDE_LABELS[side]} conectado con el mapa ${neighborMapId}: ${result.tilesWritten} salidas` +
                      ` en los dos mapas${result.reloadedMapIds.length > 0 ? ", recargados en el servidor" : ""}.`,
            );
        } catch (err) {
            setError(err instanceof EditorApiError ? err.message : "No se pudo aplicar la conexion.");
        } finally {
            setBusySide(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="flex items-start justify-between border-b border-slate-800 px-4 py-3">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-100">
                            Conexiones del mapa {model.meta.id}
                        </h2>
                        <p className="text-[11px] text-slate-500">
                            Cada borde son ~85 salidas por lado. Se escriben los dos mapas al aplicar, sin pasar por
                            Guardar.
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

                <div className="flex-1 overflow-y-auto px-4 py-3">
                    {dirty && (
                        <p className="mb-3 rounded border border-amber-800 bg-amber-950/60 px-3 py-2 text-xs text-amber-300">
                            Tenés cambios sin guardar. Conectar un borde lee el mapa desde el disco, así que esos
                            cambios se perderían: guardá primero (Ctrl+S).
                        </p>
                    )}

                    <div className="space-y-2">
                        {MAP_SIDES.map((side) => {
                            const current = connections[side];
                            const draft = drafts[side] ?? "";
                            const busy = busySide === side;

                            return (
                                <div key={side} className="rounded border border-slate-800 bg-slate-800/40 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="w-14 shrink-0 text-xs font-semibold text-slate-300">
                                            {SIDE_LABELS[side]}
                                        </span>

                                        {current ? (
                                            <span className="flex-1 truncate text-xs text-cyan-300">
                                                mapa {current.mapId} · {nameOf(current.mapId)}
                                                <span className="ml-1 text-slate-600">({current.tileCount} tiles)</span>
                                            </span>
                                        ) : (
                                            <span className="flex-1 text-xs text-slate-600">sin conexión</span>
                                        )}

                                        {current && (
                                            <>
                                                <button
                                                    type="button"
                                                    className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-sky-400 hover:bg-slate-800"
                                                    onClick={() => onGoToMap(current.mapId)}
                                                >
                                                    ir
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy || dirty}
                                                    className="rounded border border-red-800/80 bg-red-950/60 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
                                                    onClick={() => void apply(side, null)}
                                                >
                                                    desconectar
                                                </button>
                                            </>
                                        )}
                                    </div>

                                    <div className="mt-2 flex items-center gap-1">
                                        <select
                                            className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs"
                                            value={draft}
                                            disabled={busy || dirty}
                                            onChange={(event) =>
                                                setDrafts((currentDrafts) => ({
                                                    ...currentDrafts,
                                                    [side]: event.target.value,
                                                }))
                                            }
                                        >
                                            <option value="">
                                                {current ? "Cambiar vecino..." : "Elegir mapa vecino..."}
                                            </option>
                                            {candidates.map((summary) => (
                                                <option key={summary.id} value={summary.id}>
                                                    {summary.id} · {summary.name || "(sin nombre)"}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            disabled={!draft || busy || dirty}
                                            className="shrink-0 rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                                            onClick={() => void apply(side, Number(draft))}
                                        >
                                            {busy ? "Aplicando..." : "Conectar"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {candidates.length === 0 && (
                        <p className="mt-3 text-[11px] text-slate-500">
                            No hay otros mapas de {model.width}x{model.height} para conectar.
                        </p>
                    )}

                    {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
                    {!error && notice && <p className="mt-3 text-xs text-emerald-400">{notice}</p>}
                </div>
            </div>
        </div>
    );
}
