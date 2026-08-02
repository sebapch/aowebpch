"use client";

import { MoreHorizontal, Shield, Trash2, X } from "lucide-react";
import { formatClassName } from "../../lib/character-labels";
import {
    CLAN_CREATION_LEVEL_REQUIRED,
    formatClanAlignment,
    formatClanRole,
    type UseClanPanelResult,
} from "./useClanPanel";

type ClanPanelProps = {
    clan: UseClanPanelResult;
};

export function ClanPanel({ clan }: ClanPanelProps) {
    const {
        characterLevel,
        canRequestJoinSelectedClan,
        canReviewClanRequests,
        clanCreateMinLevel,
        clanCreateName,
        clanDeleteConfirmationText,
        clanDeleteSubmitting,
        clanError,
        clanLeaveSubmitting,
        clanLoading,
        clanOverview,
        clanRequestMessage,
        clanRequestSubmitting,
        clanReviewActionId,
        clanMemberActionMenu,
        clanView,
        closeClanDeleteDialog,
        closeClanModal,
        confirmCreateClan,
        currentClan,
        detailClan,
        handleClanReviewAction,
        handleCreateClan,
        handleDeleteClan,
        handleLeaveClan,
        handleRequestJoin,
        hasFoundationGem,
        hasPendingRequestToSelectedClan,
        isClanCreateConfirmOpen,
        isClanDeleteDialogOpen,
        isClanLeader,
        isClanModalOpen,
        missingClanJoinRequirements,
        openClanDetail,
        refreshClanOverview,
        setClanCreateMinLevel,
        setClanCreateName,
        setClanDeleteConfirmationText,
        setClanMemberActionMenu,
        setClanRequestMessage,
        setClanView,
        setIsClanCreateConfirmOpen,
        setIsClanDeleteDialogOpen,
    } = clan;

    return (
        <>
            {isClanModalOpen ? (
                <div
                    className="fixed inset-0 z-[84] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]"
                    onClick={closeClanModal}
                >
                    <div
                        className="w-full max-w-3xl overflow-hidden rounded-[24px] border border-amber-200/20 bg-[#120c08]/96 text-stone-100 shadow-[0_28px_90px_rgba(0,0,0,0.6)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-4 border-b border-amber-200/10 bg-[linear-gradient(180deg,rgba(127,78,35,0.28),rgba(18,12,8,0))] px-4 py-3">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/72">
                                    Clanes
                                </p>
                                <h3 className="mt-1 text-lg font-semibold text-[#f2e5ca]">
                                    {clanView === "detail" && detailClan
                                        ? `<${detailClan.name}>`
                                        : clanView === "create"
                                          ? "Crear clan"
                                          : currentClan
                                            ? `<${currentClan.name}>`
                                            : "Clanes disponibles"}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                {!currentClan && clanView !== "create" ? (
                                    <button
                                        type="button"
                                        onClick={() => setClanView("create")}
                                        className="rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                    >
                                        Crear clan
                                    </button>
                                ) : null}
                                {currentClan ? (
                                    <button
                                        type="button"
                                        onClick={() => setClanView("list")}
                                        className="rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                    >
                                        Ver clanes
                                    </button>
                                ) : null}
                                {clanView === "detail" ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setClanView(
                                                currentClan ? "manage" : "list",
                                            )
                                        }
                                        className="rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                    >
                                        Volver
                                    </button>
                                ) : null}
                                {clanView === "create" ? (
                                    <button
                                        type="button"
                                        onClick={() => setClanView("list")}
                                        className="rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                    >
                                        Volver
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => void refreshClanOverview()}
                                    className="rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                >
                                    Refrescar
                                </button>
                                <button
                                    type="button"
                                    onClick={closeClanModal}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-700 bg-black/20 text-stone-300 transition hover:border-stone-500 hover:text-white"
                                    aria-label="Cerrar clanes"
                                >
                                    <X
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                        strokeWidth={1.8}
                                    />
                                </button>
                            </div>
                        </div>

                        <div className="px-4 py-4">
                            {clanView === "list" ? (
                                <div>
                                    <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78">
                                                Clanes disponibles
                                            </p>
                                            <span className="text-[11px] text-stone-400">
                                                {clanOverview?.clans.length ??
                                                    0}
                                            </span>
                                        </div>
                                        <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                                            {(clanOverview?.clans ?? []).map(
                                                (clan) => (
                                                    <div
                                                        key={clan.id}
                                                        className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-3"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-semibold text-stone-100">
                                                                    {`<${clan.name}>`}
                                                                </div>
                                                                <div className="mt-1 text-xs text-stone-400">
                                                                    {formatClanAlignment(
                                                                        clan.alignment,
                                                                    )}{" "}
                                                                    • Lider{" "}
                                                                    {
                                                                        clan.leaderName
                                                                    }
                                                                </div>
                                                                <div className="mt-1 text-xs text-stone-500">
                                                                    Miembros{" "}
                                                                    {
                                                                        clan.memberCount
                                                                    }{" "}
                                                                    • Minimo{" "}
                                                                    {
                                                                        clan.minJoinLevel
                                                                    }
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openClanDetail(
                                                                        clan.id,
                                                                    )
                                                                }
                                                                aria-label={`Ver clan ${clan.name}`}
                                                                className="shrink-0 rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                                            >
                                                                Ver clan
                                                            </button>
                                                        </div>
                                                    </div>
                                                ),
                                            )}
                                            {!clanLoading &&
                                            !clanError &&
                                            !(
                                                clanOverview?.clans.length ?? 0
                                            ) ? (
                                                <div className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-4 text-sm text-stone-400">
                                                    No hay clanes creados
                                                    todavía.
                                                </div>
                                            ) : null}
                                        </div>
                                    </section>
                                </div>
                            ) : null}

                            {clanView === "create" && !currentClan ? (
                                <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78">
                                        Fundar nuevo clan
                                    </p>

                                    <div className="mt-3 rounded-[14px] border border-white/10 bg-black/30 p-3 space-y-2 text-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="text-stone-300">💎 Gema de Fundación (1x inventario):</span>
                                            {hasFoundationGem ? (
                                                <span className="font-semibold text-emerald-400">✓ Posees la gema</span>
                                            ) : (
                                                <span className="font-semibold text-rose-400">✗ No la posees</span>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-stone-300">🏆 Nivel mínimo (30):</span>
                                            {characterLevel >= CLAN_CREATION_LEVEL_REQUIRED ? (
                                                <span className="font-semibold text-emerald-400">✓ Nivel {characterLevel}</span>
                                            ) : (
                                                <span className="font-semibold text-rose-400">✗ Nivel {characterLevel}/30</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <label className="sm:col-span-2">
                                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                                Nombre del clan
                                            </span>
                                            <input
                                                type="text"
                                                value={clanCreateName}
                                                onChange={(event) =>
                                                    setClanCreateName(
                                                        event.target.value,
                                                    )
                                                }
                                                maxLength={18}
                                                placeholder="Nombre del clan"
                                                className="w-full rounded-2xl border border-stone-700 bg-stone-950/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                                            />
                                        </label>
                                        <label className="sm:col-span-2">
                                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                                                Nivel mínimo para ingresar
                                            </span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={45}
                                                value={clanCreateMinLevel}
                                                onChange={(event) =>
                                                    setClanCreateMinLevel(
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="Nivel minimo"
                                                className="w-full rounded-2xl border border-stone-700 bg-stone-950/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                                            />
                                        </label>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleCreateClan}
                                        className="mt-4 w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
                                    >
                                        Fundar Clan
                                    </button>
                                </section>
                            ) : null}

                            {clanView === "detail" && detailClan ? (
                                <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                                    <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                        <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78">
                                            Información del clan
                                        </p>
                                        <h4 className="mt-2 text-xl font-semibold text-stone-100">
                                            {`<${detailClan.name}>`}
                                        </h4>
                                        <p className="mt-1 text-sm text-stone-400">
                                            {formatClanAlignment(
                                                detailClan.alignment,
                                            )}{" "}
                                            • Lider {detailClan.leaderName}
                                        </p>
                                        <p className="mt-1 text-sm text-stone-400">
                                            Miembros {detailClan.memberCount} •
                                            Nivel minimo{" "}
                                            {detailClan.minJoinLevel}
                                        </p>
                                        {!currentClan ? (
                                            <>
                                                {hasPendingRequestToSelectedClan ? (
                                                    <div className="mt-3 rounded-[14px] border border-amber-300/20 bg-amber-400/10 px-3 py-3 text-sm text-amber-100">
                                                        Ya enviaste una
                                                        solicitud a este clan.
                                                    </div>
                                                ) : !canRequestJoinSelectedClan ? (
                                                    <div className="mt-3 rounded-[14px] border border-rose-400/25 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">
                                                        {missingClanJoinRequirements.map(
                                                            (issue) => (
                                                                <p key={issue}>
                                                                    {issue}
                                                                </p>
                                                            ),
                                                        )}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <textarea
                                                            value={
                                                                clanRequestMessage
                                                            }
                                                            onChange={(event) =>
                                                                setClanRequestMessage(
                                                                    event.target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder="Mensaje opcional para el lider"
                                                            rows={6}
                                                            className="mt-4 w-full rounded-2xl border border-stone-700 bg-stone-950/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={
                                                                handleRequestJoin
                                                            }
                                                            disabled={
                                                                clanRequestSubmitting
                                                            }
                                                            className="mt-4 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                                                        >
                                                            {clanRequestSubmitting
                                                                ? "Enviando solicitud..."
                                                                : "Enviar solicitud"}
                                                        </button>
                                                    </>
                                                )}
                                            </>
                                        ) : null}
                                    </section>

                                    <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                        <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78">
                                            Miembros
                                        </p>
                                        <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                                            {detailClan.members.map(
                                                (member) => (
                                                    <div
                                                        key={member.characterId}
                                                        className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-3"
                                                    >
                                                        <div className="text-sm font-semibold text-stone-100">
                                                            {member.name}
                                                        </div>
                                                        <div className="mt-1 text-xs text-stone-400">
                                                            {formatClassName(
                                                                member.classId,
                                                            )}{" "}
                                                            • Nivel{" "}
                                                            {member.level} •{" "}
                                                            {member.criminal
                                                                ? "Criminal"
                                                                : "Ciudadano"}
                                                            {member.online ===
                                                            null ? null : (
                                                                <>
                                                                    {" "}
                                                                    •{" "}
                                                                    <span
                                                                        className={
                                                                            member.online
                                                                                ? "text-emerald-400"
                                                                                : "text-rose-400"
                                                                        }
                                                                    >
                                                                        {member.online
                                                                            ? "Online"
                                                                            : "Offline"}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </section>
                                </div>
                            ) : null}

                            {clanView === "manage" && currentClan ? (
                                <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                                    <div className="space-y-4">
                                        <section className="relative rounded-[18px] border border-white/8 bg-white/4 p-4">
                                            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78">
                                                Tu clan
                                            </p>
                                            {isClanLeader ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsClanDeleteDialogOpen(
                                                            true,
                                                        );
                                                        setClanDeleteConfirmationText(
                                                            "",
                                                        );
                                                    }}
                                                    disabled={
                                                        clanDeleteSubmitting
                                                    }
                                                    aria-label="Borrar clan"
                                                    title="Borrar clan"
                                                    className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/8 bg-black/20 text-stone-400 opacity-70 transition hover:border-rose-500/50 hover:bg-rose-950/40 hover:text-rose-200 hover:opacity-100 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-black/10 disabled:text-stone-600"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            ) : null}
                                            <h4 className="mt-2 text-xl font-semibold text-stone-100">
                                                {`<${currentClan.name}>`}
                                            </h4>
                                            <p className="mt-1 text-sm text-stone-400">
                                                {formatClanAlignment(
                                                    currentClan.alignment,
                                                )}{" "}
                                                • Lider {currentClan.leaderName}
                                            </p>
                                            <p className="mt-1 text-sm text-stone-400">
                                                Miembros{" "}
                                                {currentClan.memberCount} •
                                                Nivel minimo{" "}
                                                {currentClan.minJoinLevel}
                                            </p>
                                            {!isClanLeader && (
                                                <button
                                                    type="button"
                                                    onClick={handleLeaveClan}
                                                    disabled={
                                                        clanLeaveSubmitting
                                                    }
                                                    className="mt-4 w-full rounded-2xl border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-4 py-3 text-sm font-semibold text-amber-100 transition hover:border-[#c39a6a] disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                                                >
                                                    {clanLeaveSubmitting
                                                        ? "Saliendo del clan..."
                                                        : "Salir del clan"}
                                                </button>
                                            )}
                                        </section>

                                        <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78">
                                                Miembros
                                            </p>
                                            <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
                                                {currentClan.members.map(
                                                    (member) => {
                                                        const canKick =
                                                            isClanLeader &&
                                                            member.role !==
                                                                "leader";
                                                        const canManageRole =
                                                            isClanLeader &&
                                                            member.role !==
                                                                "leader";
                                                        const canTransferLeadership =
                                                            isClanLeader &&
                                                            member.role !==
                                                                "leader";
                                                        return (
                                                            <div
                                                                key={
                                                                    member.characterId
                                                                }
                                                                className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-3"
                                                            >
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <div className="min-w-0">
                                                                        <div className="truncate text-sm font-semibold text-stone-100">
                                                                            {
                                                                                member.name
                                                                            }
                                                                        </div>
                                                                        <div className="mt-1 text-xs text-stone-400">
                                                                            {formatClanRole(
                                                                                member.role,
                                                                            )}{" "}
                                                                            •{" "}
                                                                            {formatClassName(
                                                                                member.classId,
                                                                            )}{" "}
                                                                            •
                                                                            Nivel{" "}
                                                                            {
                                                                                member.level
                                                                            }{" "}
                                                                            •{" "}
                                                                            {member.criminal
                                                                                ? "Criminal"
                                                                                : "Ciudadano"}
                                                                            {member.online ===
                                                                            null ? null : (
                                                                                <>
                                                                                    {" "}
                                                                                    •{" "}
                                                                                    <span
                                                                                        className={
                                                                                            member.online
                                                                                                ? "text-emerald-400"
                                                                                                : "text-rose-400"
                                                                                        }
                                                                                    >
                                                                                        {member.online
                                                                                            ? "Online"
                                                                                            : "Offline"}
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {canTransferLeadership ||
                                                                    canManageRole ||
                                                                    canKick ? (
                                                                        <div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(
                                                                                    event,
                                                                                ) => {
                                                                                    const bounds =
                                                                                        event.currentTarget.getBoundingClientRect();
                                                                                    setClanMemberActionMenu(
                                                                                        clanMemberActionMenu?.characterId ===
                                                                                            member.characterId
                                                                                            ? null
                                                                                            : {
                                                                                                  characterId:
                                                                                                      member.characterId,
                                                                                                  memberName:
                                                                                                      member.name,
                                                                                                  left: bounds.right,
                                                                                                  top: bounds.bottom,
                                                                                              },
                                                                                    );
                                                                                }}
                                                                                aria-label={`Acciones para ${member.name}`}
                                                                                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/10 bg-black/20 text-stone-300 transition hover:border-white/20 hover:text-stone-100"
                                                                            >
                                                                                <MoreHorizontal className="h-4 w-4" />
                                                                            </button>
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        </section>
                                    </div>

                                    <div className="space-y-4">
                                        {canReviewClanRequests ? (
                                            <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                                <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78">
                                                    Solicitudes
                                                </p>
                                                <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                                                    {currentClan.requests
                                                        .length ? (
                                                        currentClan.requests.map(
                                                            (request) => (
                                                                <div
                                                                    key={
                                                                        request.id
                                                                    }
                                                                    className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-3"
                                                                >
                                                                    <div className="text-sm font-semibold text-stone-100">
                                                                        {
                                                                            request.name
                                                                        }
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-stone-400">
                                                                        {formatClassName(
                                                                            request.classId,
                                                                        )}{" "}
                                                                        • Nivel{" "}
                                                                        {
                                                                            request.level
                                                                        }{" "}
                                                                        •{" "}
                                                                        {request.criminal
                                                                            ? "Criminal"
                                                                            : "Ciudadano"}{" "}
                                                                        •{" "}
                                                                        <span
                                                                            className={
                                                                                request.online
                                                                                    ? "text-emerald-400"
                                                                                    : "text-rose-400"
                                                                            }
                                                                        >
                                                                            {request.online
                                                                                ? "Online"
                                                                                : "Offline"}
                                                                        </span>
                                                                    </div>
                                                                    <p className="mt-2 text-sm text-stone-300">
                                                                        {request.message ||
                                                                            "Sin mensaje"}
                                                                    </p>
                                                                    <div className="mt-3 flex gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                handleClanReviewAction(
                                                                                    request.id,
                                                                                    "accept",
                                                                                )
                                                                            }
                                                                            aria-label={`Aceptar solicitud de ${request.name}`}
                                                                            disabled={Boolean(
                                                                                clanReviewActionId,
                                                                            )}
                                                                            className="flex-1 rounded-2xl bg-emerald-300 px-3 py-2 text-sm font-semibold text-stone-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                                                                        >
                                                                            {clanReviewActionId ===
                                                                            request.id
                                                                                ? "Procesando..."
                                                                                : "Aceptar"}
                                                                        </button>
                                                                        {isClanLeader ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleClanReviewAction(
                                                                                        request.id,
                                                                                        "reject",
                                                                                    )
                                                                                }
                                                                                aria-label={`Rechazar solicitud de ${request.name}`}
                                                                                disabled={Boolean(
                                                                                    clanReviewActionId,
                                                                                )}
                                                                                className="flex-1 rounded-2xl border border-rose-700/60 bg-rose-950/70 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-500 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                                                                            >
                                                                                {clanReviewActionId ===
                                                                                request.id
                                                                                    ? "Procesando..."
                                                                                    : "Rechazar"}
                                                                            </button>
                                                                        ) : null}
                                                                    </div>
                                                                </div>
                                                            ),
                                                        )
                                                    ) : (
                                                        <div className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-4 text-sm text-stone-400">
                                                            No hay solicitudes
                                                            pendientes.
                                                        </div>
                                                    )}
                                                </div>
                                            </section>
                                        ) : (
                                            <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                                <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78">
                                                    Estado del clan
                                                </p>
                                                <p className="mt-3 text-sm text-stone-300">
                                                    Aquí puedes ver la
                                                    información general del clan
                                                    y sus miembros.
                                                </p>
                                            </section>
                                        )}
                                    </div>
                                </div>
                            ) : null}

                            {clanLoading ? (
                                <div className="mt-4 rounded-[14px] border border-white/8 bg-white/3 px-3 py-4 text-sm text-stone-400">
                                    Cargando clanes...
                                </div>
                            ) : null}

                            {clanError ? (
                                <div className="mt-4 rounded-[14px] border border-rose-400/25 bg-rose-500/10 px-3 py-4 text-sm text-rose-100">
                                    {clanError}
                                </div>
                            ) : null}
                        </div>

                        {isClanDeleteDialogOpen ? (
                            <div
                                className="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[3px]"
                                onClick={closeClanDeleteDialog}
                            >
                                <div
                                    className="w-full max-w-md rounded-[28px] border border-rose-400/20 bg-[linear-gradient(180deg,rgba(32,12,12,0.97),rgba(18,12,8,0.98))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.6)]"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-3 text-rose-100">
                                            <Trash2 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-semibold text-white">
                                                Borrar clan
                                            </p>
                                            <p className="mt-2 text-sm leading-6 text-stone-300">
                                                Se eliminara el clan para todos
                                                los miembros, online y offline.
                                            </p>
                                            <p className="mt-3 text-sm leading-6 text-stone-400">
                                                Escribe{" "}
                                                <span className="font-semibold text-white">
                                                    BORRAR
                                                </span>{" "}
                                                para confirmar.
                                            </p>
                                        </div>
                                    </div>

                                    <label className="mt-6 block">
                                        <span className="text-xs font-medium uppercase tracking-[0.22em] text-stone-400">
                                            Confirmacion
                                        </span>
                                        <input
                                            type="text"
                                            value={clanDeleteConfirmationText}
                                            onChange={(event) =>
                                                setClanDeleteConfirmationText(
                                                    event.target.value,
                                                )
                                            }
                                            autoComplete="off"
                                            spellCheck={false}
                                            disabled={clanDeleteSubmitting}
                                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-rose-400/50 focus:bg-white/7 disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder="BORRAR"
                                        />
                                    </label>

                                    <div className="mt-6 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={closeClanDeleteDialog}
                                            disabled={clanDeleteSubmitting}
                                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDeleteClan}
                                            disabled={
                                                clanDeleteSubmitting ||
                                                clanDeleteConfirmationText.trim() !==
                                                    "BORRAR"
                                            }
                                            className="rounded-full border border-rose-400/35 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-400/55 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {clanDeleteSubmitting
                                                ? "Borrando..."
                                                : "Confirmar borrado"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {isClanCreateConfirmOpen ? (
                            <div
                                className="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[3px]"
                                onClick={() => setIsClanCreateConfirmOpen(false)}
                            >
                                <div
                                    className="w-full max-w-md rounded-[28px] border border-amber-400/20 bg-[linear-gradient(180deg,rgba(24,20,12,0.97),rgba(14,10,6,0.98))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.6)]"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3 text-amber-100">
                                            <Shield className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-semibold text-white">
                                                Confirmar Fundación de Clan
                                            </p>
                                            <p className="mt-2 text-sm leading-6 text-stone-300">
                                                ¿Estás seguro de que deseas fundar el clan{" "}
                                                <span className="font-semibold text-amber-300">
                                                    &lt;{clanCreateName.trim()}&gt;
                                                </span>?
                                            </p>
                                            <div className="mt-3 space-y-1 text-xs text-stone-400">
                                                <p>• Se consumirá <span className="text-emerald-400 font-semibold">1x Gema de Fundación</span>.</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsClanCreateConfirmOpen(false)}
                                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-white/20 hover:bg-white/10"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            onClick={confirmCreateClan}
                                            className="rounded-full border border-amber-400/35 bg-amber-500/20 px-5 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-400 hover:bg-amber-500/30"
                                        >
                                            Confirmar Fundación
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </>
    );
}
