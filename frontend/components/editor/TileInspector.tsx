"use client";

import { LAYER_NAMES, TRIGGER_LABELS, type ExpandedTile } from "../../lib/editor/types";

type Props = {
    tile: ExpandedTile | null;
    x: number | null;
    y: number | null;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">{label}</span>
            <span className="text-right text-xs text-slate-200">{children}</span>
        </div>
    );
}

export function TileInspector({ tile, x, y }: Props) {
    if (!tile || x === null || y === null) {
        return (
            <div className="p-3 text-xs text-slate-500">
                Pasa el cursor por el mapa o hace click en un tile para inspeccionarlo.
            </div>
        );
    }

    return (
        <div className="p-3">
            <div className="mb-2 font-mono text-sm text-slate-100">
                {x}, {y}
            </div>

            <div className="divide-y divide-slate-800">
                {([1, 2, 3, 4] as const).map((layer) => (
                    <Row key={layer} label={`Capa ${layer} · ${LAYER_NAMES[layer]}`}>
                        {tile.graphics[layer - 1] ?? <span className="text-slate-600">vacia</span>}
                    </Row>
                ))}

                <Row label="Bloqueado">
                    {tile.blocked ? <span className="text-red-400">si</span> : <span className="text-slate-600">no</span>}
                </Row>

                {tile.exit && (
                    <Row label="Salida">
                        {"map" in tile.exit ? (
                            <span className="text-cyan-300">
                                mapa {tile.exit.map} ({tile.exit.x}, {tile.exit.y})
                            </span>
                        ) : (
                            <span className="text-cyan-300">{tile.exit.destinations.length} destinos</span>
                        )}
                    </Row>
                )}

                {tile.object && (
                    <Row label="Objeto">
                        <span className="text-green-300">
                            #{tile.object.objIndex} x{tile.object.amount}
                        </span>
                    </Row>
                )}

                {tile.spawn && (
                    <Row label="Spawn NPC">
                        <span className="text-yellow-300">
                            #{tile.spawn.npcIndex}
                            {tile.spawn.movement !== undefined ? ` · mov ${tile.spawn.movement}` : ""}
                        </span>
                    </Row>
                )}

                {tile.npc !== undefined && (
                    <Row label="NPC inline">
                        <span className="text-orange-300" title="Legado: el cliente del juego ignora este campo">
                            #{tile.npc}
                        </span>
                    </Row>
                )}

                {tile.trigger !== undefined && (
                    <Row label="Trigger">
                        <span className="text-fuchsia-300">{TRIGGER_LABELS[tile.trigger] ?? tile.trigger}</span>
                    </Row>
                )}
            </div>
        </div>
    );
}
