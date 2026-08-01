"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MapSummary } from "../../lib/editor/types";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    maps: MapSummary[];
    activeMapIds: number[];
    currentMapId: number;
    onSelectMap: (mapId: number) => void;
};

export function MapSearchModal({ isOpen, onClose, maps, activeMapIds, currentMapId, onSelectMap }: Props) {
    const [search, setSearch] = useState("");
    const [filterTab, setFilterTab] = useState<"all" | "arenas" | "server">("all");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSearch("");
            setFilterTab("all");
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const arenaCount = useMemo(() => maps.filter((m) => m.isArena).length, [maps]);
    const serverCount = useMemo(() => maps.filter((m) => activeMapIds.includes(m.id)).length, [maps, activeMapIds]);

    const filteredMaps = useMemo(() => {
        let list = maps;

        if (filterTab === "arenas") {
            list = list.filter((m) => m.isArena);
        } else if (filterTab === "server") {
            list = list.filter((m) => activeMapIds.includes(m.id));
        }

        const query = search.trim().toLowerCase();
        if (query) {
            list = list.filter((map) => {
                const isArenaQuery = query === "arena" || query === "arenas";
                const arenaMatch = isArenaQuery ? map.isArena === true : false;
                const idMatch = map.id.toString().includes(query);
                const nameMatch = map.name ? map.name.toLowerCase().includes(query) : false;
                const terrainMatch = map.terreno ? map.terreno.toLowerCase().includes(query) : false;
                const zoneMatch = map.zona ? map.zona.toLowerCase().includes(query) : false;

                return arenaMatch || idMatch || nameMatch || terrainMatch || zoneMatch;
            });
        }

        return [...list].sort((a, b) => {
            const aActive = activeMapIds.includes(a.id);
            const bActive = activeMapIds.includes(b.id);
            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;
            return a.id - b.id;
        });
    }, [maps, activeMapIds, search, filterTab]);

    // Resetea el índice seleccionado cuando cambia la búsqueda o tab
    useEffect(() => {
        setSelectedIndex(0);
    }, [search, filterTab]);

    // Scroll suave al elemento activo con teclado
    useEffect(() => {
        if (!listRef.current) return;
        const activeElement = listRef.current.children[selectedIndex] as HTMLElement;
        if (activeElement) {
            activeElement.scrollIntoView({ block: "nearest" });
        }
    }, [selectedIndex]);

    if (!isOpen) return null;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => Math.min(prev + 1, filteredMaps.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const selected = filteredMaps[selectedIndex];
            if (selected) {
                onSelectMap(selected.id);
                onClose();
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/70 p-4 backdrop-blur-xs"
            onClick={onClose}
        >
            <div
                className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Cabecera y Buscador */}
                <div className="border-b border-slate-800 p-3 space-y-2.5">
                    <div className="relative flex items-center">
                        <span className="absolute left-3 text-slate-400 text-sm">🔍</span>
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Buscar mapa por número, nombre o 'arena' (ej. 506, Retos, arena)..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-8 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch("")}
                                className="absolute right-3 text-xs text-slate-400 hover:text-slate-200"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Filtros rápidos por pestaña */}
                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setFilterTab("all")}
                                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                                    filterTab === "all"
                                        ? "bg-slate-700 text-slate-100 font-semibold"
                                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                                }`}
                            >
                                Todos ({maps.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilterTab("arenas")}
                                className={`rounded px-2.5 py-1 font-medium transition-colors flex items-center gap-1 ${
                                    filterTab === "arenas"
                                        ? "bg-amber-950 border border-amber-600/70 text-amber-300 font-semibold"
                                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                                }`}
                            >
                                🏟️ Arenas ({arenaCount})
                            </button>
                            <button
                                type="button"
                                onClick={() => setFilterTab("server")}
                                className={`rounded px-2.5 py-1 font-medium transition-colors flex items-center gap-1 ${
                                    filterTab === "server"
                                        ? "bg-emerald-950 border border-emerald-600/70 text-emerald-300 font-semibold"
                                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                                }`}
                            >
                                🟢 Servidor ({serverCount})
                            </button>
                        </div>
                        <span className="text-[11px] text-slate-400">
                            {filteredMaps.length} resultado{filteredMaps.length === 1 ? "" : "s"}
                        </span>
                    </div>
                </div>

                {/* Lista de Resultados */}
                <div ref={listRef} className="flex-1 overflow-y-auto p-2 divide-y divide-slate-800/40">
                    {filteredMaps.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-500">
                            No se encontraron mapas que coincidan con la búsqueda.
                        </div>
                    ) : (
                        filteredMaps.map((map, index) => {
                            const isActive = activeMapIds.includes(map.id);
                            const isCurrent = map.id === currentMapId;
                            const isSelected = index === selectedIndex;

                            return (
                                <div
                                    key={map.id}
                                    onClick={() => {
                                        onSelectMap(map.id);
                                        onClose();
                                    }}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                                        isSelected
                                            ? "bg-sky-950/80 border border-sky-600/60 text-sky-100"
                                            : isCurrent
                                              ? "bg-slate-800/80 text-slate-100"
                                              : "hover:bg-slate-800/50 text-slate-300"
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="font-mono text-sm font-bold text-amber-400 shrink-0">
                                            #{map.id}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="truncate text-xs font-semibold flex items-center gap-1.5">
                                                <span>{map.name || "(Sin nombre)"}</span>
                                                {isCurrent && (
                                                    <span className="text-[10px] font-normal text-sky-400">
                                                        (actual)
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                                <span>{map.terreno || "Terreno s/d"}</span>
                                                <span>•</span>
                                                <span>{map.zona || "Zona s/d"}</span>
                                                <span>•</span>
                                                <span className={map.pk === 1 ? "text-emerald-400" : "text-rose-400"}>
                                                    {map.pk === 1 ? "Zona Segura" : "Zona PK"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {map.isArena && (
                                            <span className="rounded border border-amber-500/80 bg-amber-950/80 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                                                🏟️ Arena
                                            </span>
                                        )}
                                        <span
                                            className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                                isActive
                                                    ? "border-emerald-600/80 bg-emerald-950/80 text-emerald-300"
                                                    : "border-slate-700 bg-slate-800 text-slate-500"
                                            }`}
                                        >
                                            {isActive ? "🟢 Servidor" : "⚪ Inactivo"}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
