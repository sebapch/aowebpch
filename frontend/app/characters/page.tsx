"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import CharacterSpritePreview from "@/components/CharacterSpritePreview";
import type { AuthErrorResponse, AuthSession } from "../../lib/auth";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";

type DeleteCandidate = {
    id: string;
    name: string;
};

function getCharacterAppearance(character: AuthSession["characters"][number]) {
    return {
        headId: character.id_head,
        bodyId: character.id_body,
        weaponId: character.id_weapon,
        shieldId: character.id_shield,
        helmetId: character.id_helmet,
    };
}

function getCharacterNamePresentation(character: AuthSession["characters"][number]) {
    if (character.isAdministrator) {
        return { label: "Administrador", color: "#419900" };
    }

    return { label: "Jugador", color: "#808080" };
}

export default function CharactersPage() {
    const router = useRouter();
    const { session } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const [localSession, setLocalSession] = useState<AuthSession | null>(null);
    const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(
        null,
    );
    const [deletingCharacterId, setDeletingCharacterId] = useState<
        string | null
    >(null);
    const [deleteCandidate, setDeleteCandidate] =
        useState<DeleteCandidate | null>(null);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLocalSession(session);
    }, [session]);

    const selectCharacter = async (characterId: string) => {
        setPendingCharacterId(characterId);
        setError(null);

        try {
            const response = await fetch("/api/auth/select-character", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ characterId }),
            });

            const result = (await response.json()) as
                | AuthSession
                | AuthErrorResponse;

            if (!response.ok || "error" in result) {
                throw new Error(
                    "error" in result
                        ? result.error
                        : "No se pudo seleccionar el personaje",
                );
            }

            setLocalSession(result);
            router.push("/play");
            router.refresh();
        } catch (selectionError) {
            setError(
                selectionError instanceof Error
                    ? selectionError.message
                    : "Error inesperado",
            );
        } finally {
            setPendingCharacterId(null);
        }
    };

    const deleteCharacter = async (characterId: string) => {
        setDeletingCharacterId(characterId);
        setError(null);

        try {
            const response = await fetch(
                `/api/auth/delete-character/${encodeURIComponent(characterId)}`,
                {
                    method: "DELETE",
                },
            );

            const result = (await response.json()) as
                | AuthSession
                | AuthErrorResponse;

            if (!response.ok || "error" in result) {
                throw new Error(
                    "error" in result
                        ? result.error
                        : "No se pudo borrar el personaje",
                );
            }

            setLocalSession(result);
            setDeleteCandidate(null);
            router.refresh();
        } catch (deletionError) {
            setError(
                deletionError instanceof Error
                    ? deletionError.message
                    : "Error inesperado",
            );
        } finally {
            setDeletingCharacterId(null);
        }
    };

    const closeDeleteModal = () => {
        setDeleteCandidate(null);
        setDeleteConfirmationText("");
    };

    const activeSession = localSession;

    return (
        <main className="min-h-screen csao-bg px-4 py-12 text-slate-100">
            <div className="mx-auto max-w-5xl">
                <div className="mb-8 flex items-center justify-between border-b border-[#3d2719] pb-4">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#d4a359]">
                            CSAO2
                        </span>
                        <h1 className="text-2xl font-black uppercase tracking-wide text-white md:text-3xl">
                            Selección de Personaje
                        </h1>
                    </div>
                </div>

                {activeSession ? (
                    <div className="space-y-4">
                            <div className="flex justify-end">
                                <Link
                                    href="/createcharacter"
                                    prefetch={false}
                                    className="game-btn-bronze px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider shadow-md"
                                >
                                    + Crear Personaje
                                </Link>
                            </div>

                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                                {activeSession.characters.map((character) => {
                                    const appearance =
                                        getCharacterAppearance(character);
                                    const presentation =
                                        getCharacterNamePresentation(character);
                                    const isSelected =
                                        activeSession.selectedCharacterId ===
                                        character._id;
                                    const isPending =
                                        pendingCharacterId === character._id;
                                    const isBusy = Boolean(
                                        pendingCharacterId ||
                                        deletingCharacterId,
                                    );

                                    return (
                                        <div
                                            key={character._id}
                                            onClick={() => {
                                                if (isBusy) {
                                                    return;
                                                }

                                                void selectCharacter(
                                                    character._id,
                                                );
                                            }}
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === "Enter" ||
                                                    event.key === " "
                                                ) {
                                                    event.preventDefault();
                                                    if (isBusy) {
                                                        return;
                                                    }

                                                    void selectCharacter(
                                                        character._id,
                                                    );
                                                }
                                            }}
                                            role="button"
                                            tabIndex={isBusy ? -1 : 0}
                                            aria-disabled={isBusy}
                                            className={`group flex h-full flex-col rounded-2xl border px-3 py-3 text-left transition shadow-md ${
                                                isSelected
                                                    ? "border-[#8c582d] bg-[#5c2b0e]/30 shadow-[0_0_15px_rgba(140,88,45,0.25)]"
                                                    : "border-[#3d2719] bg-[#0b0f19] hover:border-[#6e4624] hover:bg-[#0e1320]"
                                            } ${
                                                isBusy
                                                    ? "cursor-not-allowed opacity-70"
                                                    : "cursor-pointer"
                                            }`}
                                        >
                                            <div className="flex justify-center relative">
                                                {appearance.bodyId > 0 &&
                                                appearance.headId > 0 ? (
                                                    <CharacterSpritePreview
                                                        bodyId={
                                                            appearance.bodyId
                                                        }
                                                        headId={
                                                            appearance.headId
                                                        }
                                                        weaponId={
                                                            appearance.weaponId
                                                        }
                                                        shieldId={
                                                            appearance.shieldId
                                                        }
                                                        helmetId={
                                                            appearance.helmetId
                                                        }
                                                        scale={1}
                                                        className="border-[#3d2719] bg-[#080b12]"
                                                    />
                                                ) : (
                                                    <div className="flex h-[186px] w-[152px] items-center justify-center rounded-xl border border-[#3d2719] bg-[#080b12] px-4 text-center text-xs text-slate-500">
                                                        Sin apariencia.
                                                    </div>
                                                )}
                                            </div>

                                            <div className="mt-3 min-h-9 text-center">
                                                <p
                                                    className="text-sm font-bold leading-none uppercase tracking-wide"
                                                    style={{
                                                        color: presentation.color,
                                                    }}
                                                >
                                                    {isPending
                                                        ? "Ingresando..."
                                                        : character.name}
                                                </p>
                                                {character.clanName ? (
                                                    <p className="mt-1 min-h-4 text-xs font-semibold text-[#d4a359]">
                                                        {`<${character.clanName}>`}
                                                    </p>
                                                ) : null}
                                            </div>

                                            <div className="mt-auto flex items-end justify-between gap-3 pt-3 border-t border-[#2d1d12]">
                                                <div className="min-w-0">
                                                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                                        {character.className}{" "}
                                                        {character.raceName}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setDeleteCandidate({
                                                                id: character._id,
                                                                name: character.name,
                                                            });
                                                            setDeleteConfirmationText("");
                                                            setError(null);
                                                        }}
                                                        disabled={isBusy}
                                                        aria-label={`Borrar ${character.name}`}
                                                        className="rounded-lg border border-[#3d2719] bg-[#080b12] p-1.5 text-slate-400 opacity-0 transition hover:border-red-900/50 hover:bg-red-950/40 hover:text-red-300 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {activeSession.characters.length === 0 ? (
                                <div className="game-card p-6 text-slate-400 text-xs text-center border-dashed">
                                    Esta cuenta todavía no posee personajes creados.
                                </div>
                            ) : null}

                            {error ? (
                                <div className="rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-2.5 text-xs text-red-300">
                                    {error}
                                </div>
                            ) : null}
                    </div>
                ) : (
                    <div className="game-card p-6 text-slate-400 text-xs shadow-md">
                        Cargando personajes...
                    </div>
                )}
            </div>

            {deleteCandidate ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,25,23,0.96),rgba(12,10,9,0.98))] p-6 shadow-2xl">
                        <div className="flex items-start gap-4">
                            <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-3 text-rose-100">
                                <Trash2 className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-white">
                                    Borrar personaje
                                </p>
                                <p className="mt-2 text-sm leading-6 text-stone-300">
                                    Vas a borrar a{" "}
                                    <span className="font-semibold text-white">
                                        {deleteCandidate.name}
                                    </span>
                                    .
                                </p>
                                <p className="mt-3 text-sm leading-6 text-stone-400">
                                    Escribe <span className="font-semibold text-white">BORRAR</span> para confirmar.
                                </p>
                            </div>
                        </div>

                        <label className="mt-6 block">
                            <span className="text-xs font-medium uppercase tracking-[0.22em] text-stone-400">
                                Confirmacion
                            </span>
                            <input
                                type="text"
                                value={deleteConfirmationText}
                                onChange={(event) =>
                                    setDeleteConfirmationText(event.target.value)
                                }
                                disabled={Boolean(deletingCharacterId)}
                                autoComplete="off"
                                spellCheck={false}
                                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-rose-400/50 focus:bg-white/7 disabled:cursor-not-allowed disabled:opacity-60"
                                placeholder="BORRAR"
                            />
                        </label>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeDeleteModal}
                                disabled={Boolean(deletingCharacterId)}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    void deleteCharacter(deleteCandidate.id)
                                }
                                disabled={
                                    Boolean(deletingCharacterId) ||
                                    deleteConfirmationText.trim() !==
                                        "BORRAR"
                                }
                                className="rounded-full border border-rose-400/35 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-400/55 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {deletingCharacterId === deleteCandidate.id
                                    ? "Borrando..."
                                    : "Confirmar borrado"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </main>
    );
}
