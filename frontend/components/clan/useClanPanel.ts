"use client";

import React from "react";
import type {
    CharacterStatsSnapshot,
    InventoryItem,
    PlayerHudState,
} from "../../lib/aowProtocol";
import type {
    ClanAlignment,
    ClanDetails,
    ClanMember,
    ClanMemberActionMenuState,
    ClanOverview,
    ClanView,
} from "./types";

const clanNamePattern = /^[A-Za-z ]+$/;
export const CLAN_CREATION_LEVEL_REQUIRED = 30;
export const CLAN_CREATION_COST = 0;
const FOUNDATION_GEM_ITEM_ID = 1066;

function inferFactionFromHud(
    hud: PlayerHudState | null,
    snapshot?: CharacterStatsSnapshot | null,
): "none" | "armada" | "caos" {
    if (snapshot?.factions.activeFaction) {
        return snapshot.factions.activeFaction;
    }

    const normalizedColor = String(hud?.color ?? "")
        .trim()
        .toLowerCase();

    if (normalizedColor === "#00afff") {
        return "armada";
    }

    if (normalizedColor === "#9b0000") {
        return "caos";
    }

    return "none";
}

export function formatClanAlignment(alignment: ClanAlignment) {
    switch (alignment) {
        case "citizen":
            return "Ciudadano";
        case "criminal":
            return "Criminal";
    }
}

export function formatClanRole(role: ClanMember["role"]) {
    switch (role) {
        case "leader":
            return "Lider";
        case "co_leader":
            return "Co-lider";
        default:
            return "Miembro";
    }
}

export function validateClanName(rawName: string) {
    const normalizedName = rawName.replace(/\s+/g, " ").trim();

    if (normalizedName.length < 3) {
        return "El nombre del clan debe tener al menos 3 caracteres.";
    }

    if (normalizedName.length > 18) {
        return "El nombre del clan no puede superar 18 caracteres.";
    }

    const spaceCount = (normalizedName.match(/ /g) ?? []).length;

    if (spaceCount > 2) {
        return "El nombre del clan solo puede contener hasta dos espacios.";
    }

    if (!clanNamePattern.test(normalizedName)) {
        return "El nombre del clan solo puede contener letras y espacios.";
    }

    return null;
}

export type UseClanPanelOptions = {
    hud: PlayerHudState | null;
    inventory: InventoryItem[];
    characterStatsSnapshot?: CharacterStatsSnapshot | null;
    selectedCharacterId?: string | null;
    onSendCommand?: (message: string) => void;
};

export type UseClanPanelResult = ReturnType<typeof useClanPanel>;

export function useClanPanel({
    hud,
    inventory,
    characterStatsSnapshot,
    selectedCharacterId,
    onSendCommand,
}: UseClanPanelOptions) {
    const [isClanModalOpen, setIsClanModalOpen] = React.useState(false);
    const [clanOverview, setClanOverview] = React.useState<ClanOverview | null>(
        null,
    );
    const [clanView, setClanView] = React.useState<ClanView>("list");
    const [clanLoading, setClanLoading] = React.useState(false);
    const [clanError, setClanError] = React.useState<string | null>(null);
    const [selectedClanId, setSelectedClanId] = React.useState<string | null>(
        null,
    );
    const [selectedClanDetails, setSelectedClanDetails] =
        React.useState<ClanDetails | null>(null);
    const [clanCreateName, setClanCreateName] = React.useState("");
    const [clanCreateMinLevel, setClanCreateMinLevel] = React.useState("1");
    const [clanRequestMessage, setClanRequestMessage] = React.useState("");
    const [clanRequestSubmitting, setClanRequestSubmitting] =
        React.useState(false);
    const [clanReviewActionId, setClanReviewActionId] = React.useState<
        string | null
    >(null);
    const [clanKickActionId, setClanKickActionId] = React.useState<
        string | null
    >(null);
    const [clanMemberActionMenu, setClanMemberActionMenu] =
        React.useState<ClanMemberActionMenuState | null>(null);
    const [clanRoleActionId, setClanRoleActionId] = React.useState<
        string | null
    >(null);
    const [clanLeadershipTransferActionId, setClanLeadershipTransferActionId] =
        React.useState<string | null>(null);
    const [clanLeaveSubmitting, setClanLeaveSubmitting] = React.useState(false);
    const [clanDeleteSubmitting, setClanDeleteSubmitting] =
        React.useState(false);
    const [isClanDeleteDialogOpen, setIsClanDeleteDialogOpen] =
        React.useState(false);
    const [isClanCreateConfirmOpen, setIsClanCreateConfirmOpen] =
        React.useState(false);
    const [clanDeleteConfirmationText, setClanDeleteConfirmationText] =
        React.useState("");

    const refreshClanOverview = React.useCallback(async () => {
        if (!selectedCharacterId) {
            setClanOverview(null);
            setClanError(null);
            return;
        }

        setClanLoading(true);
        setClanError(null);

        try {
            const response = await fetch("/api/clans", {
                cache: "no-store",
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    typeof result?.error === "string"
                        ? result.error
                        : "No se pudieron cargar los clanes.",
                );
            }

            const nextOverview = result as ClanOverview;
            setClanOverview(nextOverview);
            setSelectedClanId((current) => {
                if (
                    current &&
                    nextOverview.clans.some((clan) => clan.id === current)
                ) {
                    return current;
                }

                return nextOverview.clans[0]?.id ?? null;
            });
        } catch (error) {
            setClanOverview(null);
            setSelectedClanId(null);
            setSelectedClanDetails(null);
            setClanError(
                error instanceof Error
                    ? error.message
                    : "No se pudieron cargar los clanes.",
            );
        } finally {
            setClanLoading(false);
        }
    }, [selectedCharacterId]);

    React.useEffect(() => {
        if (!isClanModalOpen) {
            return;
        }

        void refreshClanOverview();
    }, [isClanModalOpen, refreshClanOverview]);

    const scheduleClanRefresh = React.useCallback(() => {
        window.setTimeout(() => {
            void refreshClanOverview();
        }, 700);
    }, [refreshClanOverview]);

    const currentClan = clanOverview?.currentClan ?? null;
    const detailClan =
        selectedClanDetails ??
        (selectedClanId === currentClan?.id ? currentClan : null);
    const currentLevel = hud?.level ?? 0;
    const isCurrentCharacterCriminal =
        String(hud?.color ?? "").toLowerCase() === "red";
    const currentFaction = inferFactionFromHud(hud, characterStatsSnapshot);
    const missingClanJoinRequirements = React.useMemo(() => {
        if (!detailClan || currentClan) {
            return [] as string[];
        }

        const issues: string[] = [];

        if (currentLevel < detailClan.minJoinLevel) {
            issues.push(
                `Necesitas nivel ${detailClan.minJoinLevel} para postularte a este clan.`,
            );
        }

        return issues;
    }, [
        currentClan,
        currentFaction,
        currentLevel,
        detailClan,
        isCurrentCharacterCriminal,
    ]);
    const canRequestJoinSelectedClan = missingClanJoinRequirements.length === 0;
    const hasPendingRequestToSelectedClan = Boolean(
        !currentClan &&
        detailClan &&
        clanOverview?.pendingRequestClanId === detailClan.id,
    );
    const isClanLeader = currentClan?.members.some(
        (member) =>
            member.role === "leader" &&
            member.characterId === selectedCharacterId,
    );
    const isClanCoLeader = currentClan?.members.some(
        (member) =>
            member.role === "co_leader" &&
            member.characterId === selectedCharacterId,
    );
    const canReviewClanRequests = Boolean(isClanLeader || isClanCoLeader);
    const clanMemberActionTarget = clanMemberActionMenu
        ? (currentClan?.members.find(
              (member) =>
                  member.characterId === clanMemberActionMenu.characterId,
          ) ?? null)
        : null;

    React.useEffect(() => {
        if (!isClanModalOpen) {
            return;
        }

        setClanView(currentClan ? "manage" : "list");
    }, [currentClan, isClanModalOpen]);

    function sendClanCommand(command: string) {
        onSendCommand?.(command);
        scheduleClanRefresh();
    }

    const hasFoundationGem = React.useMemo(() => {
        return inventory.some(
            (item) => item.idItem === FOUNDATION_GEM_ITEM_ID && item.amount >= 1,
        );
    }, [inventory]);

    function handleCreateClan() {
        const name = clanCreateName.replace(/\s+/g, " ").trim();
        const minLevel = Number.parseInt(clanCreateMinLevel, 10);
        const nameError = validateClanName(clanCreateName);
        const currentLevel = hud?.level ?? 0;

        if (nameError) {
            setClanError(nameError);
            return;
        }

        if (currentLevel < CLAN_CREATION_LEVEL_REQUIRED) {
            setClanError(
                `Necesitas nivel ${CLAN_CREATION_LEVEL_REQUIRED} para crear un clan.`,
            );
            return;
        }

        if (!hasFoundationGem) {
            setClanError("Necesitas 1 Gema de Fundación en tu inventario para fundar un clan.");
            return;
        }

        if (!name || !Number.isInteger(minLevel) || minLevel < 1) {
            setClanError("Completa nombre y nivel minimo validos.");
            return;
        }

        setClanError(null);
        setIsClanCreateConfirmOpen(true);
    }

    function confirmCreateClan() {
        const name = clanCreateName.replace(/\s+/g, " ").trim();
        const minLevel = Number.parseInt(clanCreateMinLevel, 10);
        setIsClanCreateConfirmOpen(false);
        setClanCreateName(name);
        sendClanCommand(`/clancrear ${name}|${minLevel}`);
    }

    async function handleRequestJoin() {
        if (!detailClan) {
            setClanError("Selecciona un clan primero.");
            return;
        }

        if (
            hasPendingRequestToSelectedClan ||
            clanRequestSubmitting ||
            !canRequestJoinSelectedClan
        ) {
            return;
        }

        setClanRequestSubmitting(true);
        setClanError(null);

        try {
            sendClanCommand(
                `/clanpostular ${detailClan.id}|${clanRequestMessage.trim()}`,
            );
            setClanRequestMessage("");
            setClanOverview((current) =>
                current
                    ? {
                          ...current,
                          pendingRequestClanId: detailClan.id,
                      }
                    : current,
            );
        } finally {
            window.setTimeout(() => setClanRequestSubmitting(false), 700);
        }
    }

    function handleClanReviewAction(
        requestId: string,
        action: "accept" | "reject",
    ) {
        if (clanReviewActionId) {
            return;
        }

        setClanReviewActionId(requestId);
        setClanError(null);
        sendClanCommand(
            action === "accept"
                ? `/clanaceptar ${requestId}`
                : `/clanrechazar ${requestId}`,
        );
        window.setTimeout(() => setClanReviewActionId(null), 700);
    }

    function handleClanKick(characterId: string, memberName?: string) {
        if (clanKickActionId) {
            return;
        }

        const confirmed = window.confirm(
            memberName
                ? `¿Seguro que quieres echar a ${memberName} del clan?`
                : "¿Seguro que quieres echar a este miembro del clan?",
        );

        if (!confirmed) {
            return;
        }

        setClanKickActionId(characterId);
        setClanMemberActionMenu(null);
        setClanError(null);
        sendClanCommand(`/clanexpulsar ${characterId}`);
        window.setTimeout(() => setClanKickActionId(null), 700);
    }

    function handleLeaveClan() {
        if (clanLeaveSubmitting) {
            return;
        }

        setClanLeaveSubmitting(true);
        setClanError(null);
        sendClanCommand("/clansalir");
        window.setTimeout(() => setClanLeaveSubmitting(false), 700);
    }

    function handleClanRoleChange(
        characterId: string,
        role: "co_leader" | "member",
    ) {
        if (clanRoleActionId) {
            return;
        }

        setClanRoleActionId(characterId);
        setClanMemberActionMenu(null);
        setClanError(null);
        sendClanCommand(`/clancolider ${characterId}|${role}`);
        window.setTimeout(() => setClanRoleActionId(null), 700);
    }

    function handleDeleteClan() {
        if (
            clanDeleteSubmitting ||
            clanDeleteConfirmationText.trim() !== "BORRAR"
        ) {
            return;
        }

        setIsClanDeleteDialogOpen(false);
        setClanDeleteConfirmationText("");
        setClanDeleteSubmitting(true);
        setClanError(null);
        sendClanCommand("/claneliminar confirmar");
        window.setTimeout(() => setClanDeleteSubmitting(false), 700);
    }

    function closeClanDeleteDialog() {
        setIsClanDeleteDialogOpen(false);
        setClanDeleteConfirmationText("");
    }

    function closeClanModal() {
        setIsClanModalOpen(false);
        closeClanDeleteDialog();
    }

    function openClanModal() {
        setIsClanModalOpen(true);
    }

    function handleTransferClanLeadership(
        characterId: string,
        memberName?: string,
    ) {
        if (clanLeadershipTransferActionId) {
            return;
        }

        const confirmed = window.confirm(
            memberName
                ? `¿Seguro que quieres transferir el liderazgo del clan a ${memberName}? Dejarás de ser el lider.`
                : "¿Seguro que quieres transferir el liderazgo del clan? Dejarás de ser el lider.",
        );

        if (!confirmed) {
            return;
        }

        setClanLeadershipTransferActionId(characterId);
        setClanMemberActionMenu(null);
        setClanError(null);
        sendClanCommand(`/clanlider ${characterId}`);
        window.setTimeout(() => setClanLeadershipTransferActionId(null), 700);
    }

    async function openClanDetail(clanId: string) {
        setSelectedClanId(clanId);
        setClanLoading(true);
        setClanError(null);

        try {
            if (!selectedCharacterId) {
                throw new Error("No hay personaje seleccionado.");
            }

            const response = await fetch(
                `/api/clans/${encodeURIComponent(clanId)}`,
                { cache: "no-store" },
            );
            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    typeof result?.error === "string"
                        ? result.error
                        : "No se pudo cargar el clan.",
                );
            }

            setSelectedClanDetails(result as ClanDetails);
        } catch (error) {
            setClanError(
                error instanceof Error
                    ? error.message
                    : "No se pudo cargar el clan.",
            );
            return;
        } finally {
            setClanLoading(false);
        }

        setClanView("detail");
    }

    return {
        characterLevel: currentLevel,
        canRequestJoinSelectedClan,
        canReviewClanRequests,
        clanCreateMinLevel,
        clanCreateName,
        clanDeleteConfirmationText,
        clanDeleteSubmitting,
        clanError,
        clanKickActionId,
        clanLeadershipTransferActionId,
        clanLeaveSubmitting,
        clanLoading,
        clanMemberActionMenu,
        clanMemberActionTarget,
        clanOverview,
        clanRequestMessage,
        clanRequestSubmitting,
        clanReviewActionId,
        clanRoleActionId,
        clanView,
        closeClanDeleteDialog,
        closeClanModal,
        confirmCreateClan,
        currentClan,
        detailClan,
        handleClanKick,
        handleClanReviewAction,
        handleClanRoleChange,
        handleCreateClan,
        handleDeleteClan,
        handleLeaveClan,
        handleRequestJoin,
        handleTransferClanLeadership,
        hasFoundationGem,
        hasPendingRequestToSelectedClan,
        isClanCreateConfirmOpen,
        isClanDeleteDialogOpen,
        isClanLeader,
        isClanModalOpen,
        missingClanJoinRequirements,
        openClanDetail,
        openClanModal,
        refreshClanOverview,
        setClanCreateMinLevel,
        setClanCreateName,
        setClanDeleteConfirmationText,
        setClanMemberActionMenu,
        setClanRequestMessage,
        setClanView,
        setIsClanCreateConfirmOpen,
        setIsClanDeleteDialogOpen,
    };
}
