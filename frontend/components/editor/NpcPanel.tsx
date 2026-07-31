"use client";

import { useCallback, useEffect, useState } from "react";
import { EditorApiError, fetchNpcTemplate, saveNpcTemplate } from "../../lib/editor/api";
import type { DataNpc, GameNpcRecord, ItemTemplateSummary, NpcDropEntry } from "../../lib/editor/types";
import { ItemSearchField, useItemNames } from "./ItemSearchField";

type Props = {
    npcIndex: number;
    onClose: () => void;
    onSaved?: (record: GameNpcRecord) => void;
};

type EditableFields = {
    name: string;
    npcType: number;
    idHead: number;
    idBody: number;
    movement: number;
    desc: string;
    hp: number;
    maxHp: number;
    minHit: number;
    maxHit: number;
    def: number;
    poderAtaque: number;
    poderEvasion: number;
    exp: number;
    gold: number;
};

function toEditable(data: DataNpc): EditableFields {
    return {
        name: data.name ?? "",
        npcType: data.npcType ?? 0,
        idHead: data.idHead ?? 0,
        idBody: data.idBody ?? 0,
        movement: data.movement ?? 0,
        desc: data.desc ?? "",
        hp: data.hp ?? 0,
        maxHp: data.maxHp ?? 0,
        minHit: data.minHit ?? 0,
        maxHit: data.maxHit ?? 0,
        def: data.def ?? 0,
        poderAtaque: data.poderAtaque ?? 0,
        poderEvasion: data.poderEvasion ?? 0,
        exp: data.exp ?? 0,
        gold: data.gold ?? 0,
    };
}

const NUMBER_FIELDS: Array<{ key: keyof EditableFields; label: string }> = [
    { key: "npcType", label: "Tipo" },
    { key: "idHead", label: "Cabeza" },
    { key: "idBody", label: "Cuerpo" },
    { key: "movement", label: "Movimiento" },
    { key: "hp", label: "HP actual" },
    { key: "maxHp", label: "HP maximo" },
    { key: "minHit", label: "Golpe minimo" },
    { key: "maxHit", label: "Golpe maximo" },
    { key: "def", label: "Defensa" },
    { key: "poderAtaque", label: "Poder de ataque" },
    { key: "poderEvasion", label: "Poder de evasion" },
    { key: "exp", label: "Experiencia" },
    { key: "gold", label: "Oro" },
];

/**
 * Panel modal para ver/editar la plantilla compartida de un NPC
 * (`game_npcs` en la api). Distinto de la ubicacion del spawn en el mapa:
 * editar aca afecta a todas las apariciones de este npcIndex, en cualquier mapa.
 */
export function NpcPanel({ npcIndex, onClose, onSaved }: Props) {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [record, setRecord] = useState<GameNpcRecord | null>(null);
    const [fields, setFields] = useState<EditableFields | null>(null);
    const [drop, setDrop] = useState<NpcDropEntry[]>([]);
    const [objs, setObjs] = useState<NpcDropEntry[]>([]);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        setSaveError(null);
        setSavedAt(null);

        void fetchNpcTemplate(npcIndex)
            .then((npc) => {
                if (cancelled) {
                    return;
                }

                setRecord(npc);
                setFields(toEditable(npc.data));
                setDrop(npc.data.drop ?? []);
                setObjs(npc.data.objs ?? []);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setLoadError(err instanceof EditorApiError ? err.message : `No se pudo cargar el NPC ${npcIndex}.`);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [npcIndex]);

    const updateField = useCallback(<K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
        setFields((current) => (current ? { ...current, [key]: value } : current));
    }, []);

    const handleSave = useCallback(async () => {
        if (!record || !fields) {
            return;
        }

        setSaving(true);
        setSaveError(null);

        const nextData: DataNpc = {
            ...record.data,
            ...fields,
            desc: fields.desc || undefined,
            drop: drop.length > 0 ? drop : undefined,
            objs: objs.length > 0 ? objs : undefined,
        };

        try {
            const saved = await saveNpcTemplate(npcIndex, nextData);
            setRecord(saved);
            setFields(toEditable(saved.data));
            setDrop(saved.data.drop ?? []);
            setObjs(saved.data.objs ?? []);
            setSavedAt(Date.now());
            onSaved?.(saved);
        } catch (err) {
            setSaveError(err instanceof EditorApiError ? err.message : "No se pudo guardar el NPC.");
        } finally {
            setSaving(false);
        }
    }, [record, fields, drop, objs, npcIndex, onSaved]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-100">
                            NPC #{npcIndex} {fields ? `· ${fields.name}` : ""}
                        </h2>
                        <p className="text-[11px] text-slate-500">
                            Plantilla compartida: los cambios afectan a todas las apariciones de este NPC en todos los mapas.
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
                    {loading && <p className="text-sm text-slate-400">Cargando...</p>}
                    {loadError && <p className="text-sm text-red-300">{loadError}</p>}

                    {fields && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-wide text-slate-500">Nombre</label>
                                <input
                                    className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                                    value={fields.name}
                                    onChange={(event) => updateField("name", event.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] uppercase tracking-wide text-slate-500">
                                    Descripcion
                                </label>
                                <textarea
                                    className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                                    rows={2}
                                    value={fields.desc}
                                    onChange={(event) => updateField("desc", event.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {NUMBER_FIELDS.map(({ key, label }) => (
                                    <div key={key}>
                                        <label className="block text-[11px] uppercase tracking-wide text-slate-500">
                                            {label}
                                        </label>
                                        <input
                                            type="number"
                                            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm"
                                            value={fields[key]}
                                            onChange={(event) => updateField(key, Number(event.target.value))}
                                        />
                                    </div>
                                ))}
                            </div>

                            <DropListEditor label="Botin al morir (drop)" entries={drop} onChange={setDrop} />
                            <DropListEditor label="Objetos en venta (objs)" entries={objs} onChange={setObjs} />
                        </div>
                    )}
                </div>

                <footer className="flex items-center gap-3 border-t border-slate-800 px-4 py-3">
                    {saveError && <span className="text-xs text-red-300">{saveError}</span>}
                    {!saveError && savedAt && <span className="text-xs text-emerald-400">Guardado.</span>}
                    <div className="ml-auto flex gap-2">
                        <button
                            type="button"
                            className="rounded border border-slate-700 px-3 py-1 text-xs hover:bg-slate-800"
                            onClick={onClose}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            disabled={!fields || saving}
                            className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void handleSave()}
                        >
                            {saving ? "Guardando..." : "Guardar"}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}

function DropListEditor({
    label,
    entries,
    onChange,
}: {
    label: string;
    entries: NpcDropEntry[];
    onChange: (entries: NpcDropEntry[]) => void;
}) {
    const itemNames = useItemNames(entries.map((entry) => entry.item));

    const addItem = (item: ItemTemplateSummary) => {
        if (entries.some((entry) => entry.item === item.id)) {
            return;
        }

        onChange([...entries, { item: item.id, cant: 1 }]);
    };

    const updateQuantity = (index: number, cant: number) => {
        onChange(entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, cant } : entry)));
    };

    const removeAt = (index: number) => {
        onChange(entries.filter((_, entryIndex) => entryIndex !== index));
    };

    return (
        <div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-500">{label}</label>

            <div className="mt-1 space-y-1">
                {entries.map((entry, index) => (
                    <div
                        key={`${entry.item}-${index}`}
                        className="flex items-center gap-2 rounded border border-slate-800 bg-slate-800/50 px-2 py-1 text-xs"
                    >
                        <span className="flex-1">
                            {itemNames[entry.item] ?? "..."} <span className="font-mono text-slate-500">#{entry.item}</span>
                        </span>
                        <input
                            type="number"
                            min={0}
                            className="w-20 rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
                            value={entry.cant}
                            onChange={(event) => updateQuantity(index, Number(event.target.value))}
                        />
                        <button type="button" className="text-slate-500 hover:text-red-300" onClick={() => removeAt(index)}>
                            quitar
                        </button>
                    </div>
                ))}
                {entries.length === 0 && <p className="text-[11px] text-slate-600">Sin items.</p>}
            </div>

            <div className="mt-2">
                <ItemSearchField onSelect={addItem} />
            </div>
        </div>
    );
}
