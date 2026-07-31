"use client";

import { useEffect, useMemo, useState } from "react";
import type { NPCsDB } from "../../types/game";
import { loadNPCsDB } from "../../utils/gameLoader";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSelectNpc: (npcIndex: number) => void;
};

type NpcItem = {
    id: number;
    name: string;
    npcType?: number;
    hp?: number;
    maxHp?: number;
    minHit?: number;
    maxHit?: number;
    exp?: number;
    gold?: number;
    desc?: string;
    isFriendly: boolean;
};

export function isFriendlyNpc(npc: { npcType?: number; minHit?: number; maxHit?: number; exp?: number }): boolean {
    if (npc.npcType !== undefined && npc.npcType > 0) {
        return true;
    }
    if (!npc.minHit && !npc.maxHit && !npc.exp) {
        return true;
    }
    return false;
}

export function NpcSelectorModal({ isOpen, onClose, onSelectNpc }: Props) {
    const [db, setDb] = useState<NPCsDB | null>(null);
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<"friendly" | "monsters">("friendly");
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!isOpen || db) return;
        setLoading(true);
        loadNPCsDB()
            .then((data) => {
                setDb(data);
            })
            .catch((err) => {
                console.error("Error al cargar base de datos de NPCs:", err);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [isOpen, db]);

    const items = useMemo<NpcItem[]>(() => {
        if (!db) return [];
        const result: NpcItem[] = [];
        for (const [idStr, data] of Object.entries(db)) {
            const id = Number.parseInt(idStr, 10);
            if (!Number.isFinite(id)) continue;
            const friendly = isFriendlyNpc(data);
            result.push({
                id,
                name: data.name ?? `NPC #${id}`,
                npcType: data.npcType,
                hp: data.hp ?? data.maxHp,
                maxHp: data.maxHp,
                minHit: data.minHit,
                maxHit: data.maxHit,
                exp: data.exp,
                gold: data.gold,
                desc: data.desc,
                isFriendly: friendly,
            });
        }
        return result.sort((a, b) => a.id - b.id);
    }, [db]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return items.filter((item) => {
            const matchesTab = tab === "friendly" ? item.isFriendly : !item.isFriendly;
            if (!matchesTab) return false;
            if (!query) return true;
            return (
                item.id.toString().includes(query) ||
                item.name.toLowerCase().includes(query) ||
                (item.desc && item.desc.toLowerCase().includes(query))
            );
        });
    }, [items, tab, search]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
            <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-100">Catálogo de NPCs</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    >
                        ✕
                    </button>
                </div>

                {/* Buscador y Pestañas */}
                <div className="space-y-2 border-b border-slate-800 p-3">
                    <input
                        type="text"
                        placeholder="Buscar por nombre o ID (ej. Sacerdote, Araña, 509)..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                    />

                    <div className="flex gap-2 text-xs">
                        <button
                            type="button"
                            onClick={() => setTab("friendly")}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 font-semibold transition-colors ${
                                tab === "friendly"
                                    ? "border-emerald-500 bg-emerald-950/80 text-emerald-200"
                                    : "border-slate-800 bg-slate-950/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                            }`}
                        >
                            🟢 Amistosos / Servicios ({items.filter((i) => i.isFriendly).length})
                        </button>

                        <button
                            type="button"
                            onClick={() => setTab("monsters")}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 font-semibold transition-colors ${
                                tab === "monsters"
                                    ? "border-rose-500 bg-rose-950/80 text-rose-200"
                                    : "border-slate-800 bg-slate-950/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                            }`}
                        >
                            🔴 Monstruos / Hostiles ({items.filter((i) => !i.isFriendly).length})
                        </button>
                    </div>
                </div>

                {/* Lista de NPCs */}
                <div className="flex-1 overflow-y-auto p-3">
                    {loading ? (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                            Cargando catálogo de NPCs...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-xs text-slate-500">
                            No se encontraron NPCs que coincidan con la búsqueda.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {filtered.map((npc) => (
                                <div
                                    key={npc.id}
                                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 transition-colors hover:border-slate-700 hover:bg-slate-950"
                                >
                                    <div className="min-w-0 flex-1 pr-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-mono text-xs font-bold text-slate-400">#{npc.id}</span>
                                            <span className="truncate text-xs font-semibold text-slate-100">{npc.name}</span>
                                        </div>
                                        <div className="mt-0.5 text-[11px] text-slate-400">
                                            {npc.isFriendly ? (
                                                <span className="text-emerald-400">Pacífico / Servicio</span>
                                            ) : (
                                                <span className="font-mono text-rose-400">
                                                    HP: {npc.hp ?? "—"} · Golpe: {npc.minHit ?? 0}-{npc.maxHit ?? 0}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelectNpc(npc.id);
                                            onClose();
                                        }}
                                        className="shrink-0 rounded border border-sky-600/80 bg-sky-950 px-2.5 py-1 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-900"
                                    >
                                        Colocar
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
