"use client";

import { useEffect, useMemo, useState } from "react";
import type { GraphicsDB } from "../../types/game";
import { getTexturePath, loadGraphicsDB } from "../../utils/gameLoader";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSelectGraphic: (grhId: number) => void;
};

const ITEMS_PER_PAGE = 64;
const THUMB_SIZE = 40;

function resolveStaticGraphicId(grhId: number, graphicsDB: GraphicsDB): number | null {
    const data = graphicsDB[String(grhId)];
    if (!data) return null;
    if (data.numFrames > 1) {
        const firstFrame = Number(data.frames?.["1"]);
        if (Number.isFinite(firstFrame) && firstFrame > 0 && firstFrame !== grhId) {
            return resolveStaticGraphicId(firstFrame, graphicsDB);
        }
        return null;
    }
    return grhId;
}

function CatalogThumbnail({ grhId, graphicsDB }: { grhId: number; graphicsDB: GraphicsDB }) {
    const resolved = resolveStaticGraphicId(grhId, graphicsDB);
    const data = resolved !== null ? (graphicsDB[String(resolved)] ?? null) : null;

    if (!data?.numFile) {
        return <div style={{ width: THUMB_SIZE, height: THUMB_SIZE }} className="shrink-0 rounded bg-slate-800" />;
    }

    const scale = Math.min(1, (THUMB_SIZE - 4) / Math.max(data.width, data.height, 1));

    return (
        <div
            className="relative shrink-0 overflow-hidden rounded bg-black/40 border border-slate-800"
            style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
        >
            <div
                className="absolute left-1/2 top-1/2 bg-no-repeat"
                style={{
                    width: data.width,
                    height: data.height,
                    backgroundImage: `url(${getTexturePath(data)})`,
                    backgroundPosition: `-${data.sX}px -${data.sY}px`,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    transformOrigin: "center",
                }}
            />
        </div>
    );
}

export function GraphicsCatalogModal({ isOpen, onClose, onSelectGraphic }: Props) {
    const [db, setDb] = useState<GraphicsDB | null>(null);
    const [loading, setLoading] = useState(false);
    const [category, setCategory] = useState<"all" | "tiles" | "objects" | "structures">("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    useEffect(() => {
        if (!isOpen || db) return;
        setLoading(true);
        loadGraphicsDB()
            .then((data) => setDb(data))
            .catch((err) => console.error("Error al cargar base de datos de gráficos:", err))
            .finally(() => setLoading(false));
    }, [isOpen, db]);

    useEffect(() => {
        setPage(1);
    }, [category, search]);

    const allGraphics = useMemo(() => {
        if (!db) return [];
        const result: Array<{ id: number; width: number; height: number }> = [];
        for (const [idStr, data] of Object.entries(db)) {
            const id = Number.parseInt(idStr, 10);
            if (!Number.isFinite(id) || id <= 0) continue;
            result.push({ id, width: data.width ?? 32, height: data.height ?? 32 });
        }
        return result.sort((a, b) => a.id - b.id);
    }, [db]);

    const filtered = useMemo(() => {
        const query = search.trim();
        return allGraphics.filter((item) => {
            if (query && !item.id.toString().includes(query)) {
                return false;
            }

            if (category === "tiles") {
                return item.width <= 32 && item.height <= 32;
            }
            if (category === "objects") {
                return item.width <= 64 && item.height <= 64 && (item.width > 32 || item.height > 32);
            }
            if (category === "structures") {
                return item.width > 64 || item.height > 64;
            }

            return true;
        });
    }, [allGraphics, category, search]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const currentPageItems = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE;
        return filtered.slice(start, start + ITEMS_PER_PAGE);
    }, [filtered, page]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
            <div className="flex h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                        <span>🎨 Catálogo Visual de Gráficos</span>
                        {db && <span className="font-mono text-xs text-slate-400">({filtered.length} gráficos)</span>}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    >
                        ✕
                    </button>
                </div>

                {/* Filtros */}
                <div className="space-y-2 border-b border-slate-800 p-3">
                    <input
                        type="text"
                        placeholder="Buscar por ID de Grh (ej. 1, 100, 1500)..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                    />

                    <div className="flex flex-wrap gap-1.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setCategory("all")}
                            className={`rounded-lg border px-3 py-1 font-medium transition-colors ${
                                category === "all"
                                    ? "border-sky-500 bg-sky-950 text-sky-200"
                                    : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800"
                            }`}
                        >
                            Todos
                        </button>
                        <button
                            type="button"
                            onClick={() => setCategory("tiles")}
                            className={`rounded-lg border px-3 py-1 font-medium transition-colors ${
                                category === "tiles"
                                    ? "border-sky-500 bg-sky-950 text-sky-200"
                                    : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800"
                            }`}
                        >
                            Pisos / Terrenos (32x32)
                        </button>
                        <button
                            type="button"
                            onClick={() => setCategory("objects")}
                            className={`rounded-lg border px-3 py-1 font-medium transition-colors ${
                                category === "objects"
                                    ? "border-sky-500 bg-sky-950 text-sky-200"
                                    : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800"
                            }`}
                        >
                            Objetos / Decoración
                        </button>
                        <button
                            type="button"
                            onClick={() => setCategory("structures")}
                            className={`rounded-lg border px-3 py-1 font-medium transition-colors ${
                                category === "structures"
                                    ? "border-sky-500 bg-sky-950 text-sky-200"
                                    : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800"
                            }`}
                        >
                            Estructuras / Árboles Grandes
                        </button>
                    </div>
                </div>

                {/* Grid de Gráficos */}
                <div className="flex-1 overflow-y-auto p-3">
                    {loading || !db ? (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                            Cargando base de datos de gráficos...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-xs text-slate-500">
                            No se encontraron gráficos con ese ID o categoría.
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                            {currentPageItems.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        onSelectGraphic(item.id);
                                        onClose();
                                    }}
                                    className="flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-950 p-2 transition-all hover:border-sky-500 hover:bg-sky-950/40 hover:scale-105"
                                    title={`Seleccionar Grh #${item.id} (${item.width}x${item.height})`}
                                >
                                    <CatalogThumbnail grhId={item.id} graphicsDB={db} />
                                    <span className="mt-1 font-mono text-[10px] text-slate-400">#{item.id}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Paginación */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-xs text-slate-400">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 disabled:opacity-40 hover:bg-slate-700"
                        >
                            ← Anterior
                        </button>

                        <span className="font-mono text-[11px] text-slate-300">
                            Página {page} de {totalPages}
                        </span>

                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 disabled:opacity-40 hover:bg-slate-700"
                        >
                            Siguiente →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
