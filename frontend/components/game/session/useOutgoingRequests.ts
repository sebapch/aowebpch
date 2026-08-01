import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
    createBuyItemPacket,
    createChangeBankTabPacket,
    createCloseTradePacket,
    createCraftItemPacket,
    createDepositBankGoldPacket,
    createDropItemPacket,
    createEquipItemPacket,
    createMarketActionPacket,
    createReorderBankItemPacket,
    createReorderInventoryItemPacket,
    createReorderSpellPacket,
    createRetosActionPacket,
    createSellItemPacket,
    createUseItemClickPacket,
    createUseItemUPacket,
    createWithdrawBankGoldPacket,
    type InventoryItem,
} from "../../../lib/aowProtocol";
import type { RuntimeTimingConfig } from "../../../lib/runtime-config";
import type { Engine } from "../engine/Engine";

const MAX_BUFFERED_USE_ITEMS = 6;

type TargetingMode =
    | { type: "range" }
    | { type: "spell"; slot: number; manaRequired: number; name: string }
    | { type: "fishing"; name: string }
    | { type: "woodcutting"; name: string }
    | { type: "mining"; name: string }
    | { type: "smelting"; name: string }
    | { type: "blacksmith"; name: string };

type CombatCooldowns = {
    nextMeleeAt: number;
    nextRangeAt: number;
    nextSpellAt: number;
    nextSpellAfterMeleeAt: number;
    nextMeleeAfterSpellAt: number;
    nextUseItemAfterMeleeAt: number;
};

type OutgoingRequestProps = {
    equipRequest?: { slot: number; token: number } | null;
    useItemClickRequest?: { slot: number; token: number } | null;
    useItemURequest?: { slot: number; token: number } | null;
    dropRequest?: { slot: number; amount: number; token: number } | null;
    buyRequest?: { slot: number; amount: number; token: number } | null;
    sellRequest?: { slot: number; amount: number; token: number } | null;
    changeBankTabRequest?: {
        tab: "character" | "account" | "clan";
        token: number;
    } | null;
    depositBankGoldRequest?: { amount: number; token: number } | null;
    withdrawBankGoldRequest?: { amount: number; token: number } | null;
    closeTradeRequest?: { token: number } | null;
    marketActionRequest?: {
        action: "refresh" | "create" | "buy" | "cancel" | "claim";
        payload?: Record<string, unknown>;
        token: number;
    } | null;
    retosActionRequest?: {
        action:
            | "refresh"
            | "create"
            | "join"
            | "cancel"
            | "enqueue2v2"
            | "dequeue2v2"
            | "vetoBan";
        payload?: Record<string, unknown>;
        token: number;
    } | null;
    craftRequest?: {
        profession: "carpentry" | "blacksmith" | "tailoring";
        itemId: number;
        amount: number;
        token: number;
    } | null;
    reorderInventoryRequest?: {
        sourceSlot: number;
        targetSlot: number;
        token: number;
    } | null;
    reorderSpellRequest?: {
        sourceSlot: number;
        targetSlot: number;
        token: number;
    } | null;
    reorderBankRequest?: {
        sourceSlot: number;
        targetSlot: number;
        token: number;
    } | null;
    rangeAttackRequest?: { token: number } | null;
    spellTargetRequest?: {
        slot: number;
        manaRequired: number;
        name: string;
        token: number;
    } | null;
};

type UseOutgoingRequestsOptions = OutgoingRequestProps & {
    websocketRef: RefObject<WebSocket | null>;
    engineRef: RefObject<Engine | null>;
    playerHudRef: RefObject<{
        inventory: InventoryItem[];
    } | null>;
    runtimeTimingRef: RefObject<RuntimeTimingConfig>;
    combatCooldownsRef: RefObject<CombatCooldowns>;
    nextUseItemAtRef: RefObject<number>;
    nextDropItemAtRef: RefObject<number>;
    nextEquipToggleAtRef: RefObject<number>;
    setTargetingMode: (mode: TargetingMode) => void;
    clearTargetingMode: () => void;
    getEquippedWeaponItem: () => InventoryItem | null;
    pushSystemMessage: (text: string, color?: string) => void;
    isFishingRodItem: (item: InventoryItem | null) => boolean;
    isWoodcuttingToolItem: (item: InventoryItem | null) => boolean;
    isMiningToolItem: (item: InventoryItem | null) => boolean;
    isSmeltingMineralItem: (item: InventoryItem | null) => boolean;
    reorderInventoryItems: (sourceSlot: number, targetSlot: number) => void;
    reorderSpells: (sourceSlot: number, targetSlot: number) => void;
    clearExpiredCombatCooldowns: () => void;
    recordResourceUseItem: (
        slot: number,
        item: InventoryItem | null,
        sentAt: number,
    ) => void;
    recordClientGameAction: (
        action: string,
        details?: Record<string, unknown>,
    ) => void;
};

function getSocket(
    websocketRef: RefObject<WebSocket | null>,
): WebSocket | null {
    const socket = websocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        return null;
    }

    return socket;
}

function maybeSetGatheringTargetingMode(
    item: InventoryItem | null,
    options: Pick<
        UseOutgoingRequestsOptions,
        | "isFishingRodItem"
        | "isWoodcuttingToolItem"
        | "isMiningToolItem"
        | "isSmeltingMineralItem"
        | "setTargetingMode"
    >,
) {
    if (options.isFishingRodItem(item)) {
        options.setTargetingMode({
            type: "fishing",
            name: item?.name ?? "Caña de pescar",
        });
        return;
    }

    if (options.isWoodcuttingToolItem(item)) {
        options.setTargetingMode({
            type: "woodcutting",
            name: item?.name ?? "Hacha de leñador",
        });
        return;
    }

    if (options.isMiningToolItem(item)) {
        options.setTargetingMode({
            type: "mining",
            name: item?.name ?? "Piquete de minero",
        });
        return;
    }

    if (/martillo de herrero/i.test(item?.name ?? "")) {
        options.setTargetingMode({
            type: "blacksmith",
            name: item?.name ?? "Martillo de herrero",
        });
        return;
    }

    if (options.isSmeltingMineralItem(item)) {
        options.setTargetingMode({
            type: "smelting",
            name: item?.name ?? "Mineral",
        });
    }
}

export function useOutgoingRequests({
    websocketRef,
    engineRef,
    playerHudRef,
    runtimeTimingRef,
    combatCooldownsRef,
    nextUseItemAtRef,
    nextDropItemAtRef,
    nextEquipToggleAtRef,
    setTargetingMode,
    clearTargetingMode,
    getEquippedWeaponItem,
    pushSystemMessage,
    isFishingRodItem,
    isWoodcuttingToolItem,
    isMiningToolItem,
    isSmeltingMineralItem,
    reorderInventoryItems,
    reorderSpells,
    clearExpiredCombatCooldowns,
    recordResourceUseItem,
    recordClientGameAction,
    equipRequest,
    useItemClickRequest,
    useItemURequest,
    dropRequest,
    buyRequest,
    sellRequest,
    changeBankTabRequest,
    depositBankGoldRequest,
    withdrawBankGoldRequest,
    closeTradeRequest,
    marketActionRequest,
    retosActionRequest,
    craftRequest,
    reorderInventoryRequest,
    reorderSpellRequest,
    reorderBankRequest,
    rangeAttackRequest,
    spellTargetRequest,
}: UseOutgoingRequestsOptions) {
    const useItemClickQueueRef = useRef<number[]>([]);
    const useItemUQueueRef = useRef<number[]>([]);
    const useItemClickFlushTimerRef = useRef<number | null>(null);
    const useItemUFlushTimerRef = useRef<number | null>(null);
    const flushUseItemClickQueueRef = useRef<() => void>(() => {});
    const flushUseItemUQueueRef = useRef<() => void>(() => {});
    const processedRequestTokensRef = useRef<Map<string, number>>(new Map());

    const scheduleUseItemQueueFlush = useCallback(
        (
            timerRef: RefObject<number | null>,
            flushQueueRef: RefObject<() => void>,
            delayMs: number,
        ) => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current);
            }

            timerRef.current = window.setTimeout(
                () => {
                    timerRef.current = null;
                    flushQueueRef.current();
                },
                Math.max(1, delayMs),
            );
        },
        [],
    );

    const hasProcessedRequestToken = useCallback(
        (key: string, token: number) =>
            processedRequestTokensRef.current.get(key) === token,
        [],
    );

    const markRequestTokenProcessed = useCallback(
        (key: string, token: number) => {
            processedRequestTokensRef.current.set(key, token);
        },
        [],
    );

    const clearUseItemQueues = useCallback(() => {
        useItemClickQueueRef.current = [];
        useItemUQueueRef.current = [];
        nextUseItemAtRef.current = 0;

        if (useItemClickFlushTimerRef.current !== null) {
            window.clearTimeout(useItemClickFlushTimerRef.current);
            useItemClickFlushTimerRef.current = null;
        }

        if (useItemUFlushTimerRef.current !== null) {
            window.clearTimeout(useItemUFlushTimerRef.current);
            useItemUFlushTimerRef.current = null;
        }
    }, [nextUseItemAtRef]);

    const flushUseItemClickQueue = useCallback(() => {
        if (useItemClickFlushTimerRef.current !== null) {
            window.clearTimeout(useItemClickFlushTimerRef.current);
            useItemClickFlushTimerRef.current = null;
        }

        if (useItemClickQueueRef.current.length === 0) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        clearExpiredCombatCooldowns();
        const now = Date.now();
        const nextUseItemAfterMeleeAt =
            combatCooldownsRef.current.nextUseItemAfterMeleeAt;
        const nextAvailableAt = Math.max(
            nextUseItemAfterMeleeAt,
            nextUseItemAtRef.current,
        );

        if (now < nextAvailableAt) {
            scheduleUseItemQueueFlush(
                useItemClickFlushTimerRef,
                flushUseItemClickQueueRef,
                nextAvailableAt - now,
            );
            return;
        }

        const slot = useItemClickQueueRef.current.shift();
        if (typeof slot !== "number") {
            return;
        }

        const inventoryItem =
            playerHudRef.current?.inventory.find(
                (item) => item.slot === slot,
            ) ?? null;
        recordResourceUseItem(slot, inventoryItem, now);
        socket.send(createUseItemClickPacket(slot));
        recordClientGameAction("use_item_click", {
            slot,
            itemId: inventoryItem?.idItem ?? null,
            itemName: inventoryItem?.name ?? null,
        });
        nextUseItemAtRef.current =
            now + runtimeTimingRef.current.actionCooldowns.useItemMs;

        if (useItemClickQueueRef.current.length > 0) {
            useItemClickQueueRef.current = [];
        }
    }, [
        clearExpiredCombatCooldowns,
        combatCooldownsRef,
        nextUseItemAtRef,
        playerHudRef,
        recordClientGameAction,
        recordResourceUseItem,
        runtimeTimingRef,
        scheduleUseItemQueueFlush,
        websocketRef,
    ]);

    useEffect(() => {
        flushUseItemClickQueueRef.current = flushUseItemClickQueue;
    }, [flushUseItemClickQueue]);

    const flushUseItemUQueue = useCallback(() => {
        if (useItemUFlushTimerRef.current !== null) {
            window.clearTimeout(useItemUFlushTimerRef.current);
            useItemUFlushTimerRef.current = null;
        }

        if (useItemUQueueRef.current.length === 0) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        clearExpiredCombatCooldowns();
        const now = Date.now();
        const nextUseItemAfterMeleeAt =
            combatCooldownsRef.current.nextUseItemAfterMeleeAt;
        const nextAvailableAt = Math.max(
            nextUseItemAfterMeleeAt,
            nextUseItemAtRef.current,
        );

        if (now < nextAvailableAt) {
            scheduleUseItemQueueFlush(
                useItemUFlushTimerRef,
                flushUseItemUQueueRef,
                nextAvailableAt - now,
            );
            return;
        }

        const slot = useItemUQueueRef.current.shift();
        if (typeof slot !== "number") {
            return;
        }

        const inventoryItem =
            playerHudRef.current?.inventory.find(
                (item) => item.slot === slot,
            ) ?? null;
        recordResourceUseItem(slot, inventoryItem, now);
        socket.send(createUseItemUPacket(slot));
        recordClientGameAction("use_item_u", {
            slot,
            itemId: inventoryItem?.idItem ?? null,
            itemName: inventoryItem?.name ?? null,
        });
        nextUseItemAtRef.current =
            now + runtimeTimingRef.current.actionCooldowns.useItemMs;

        if (useItemUQueueRef.current.length > 0) {
            useItemUQueueRef.current = [];
        }
    }, [
        combatCooldownsRef,
        clearExpiredCombatCooldowns,
        nextUseItemAtRef,
        playerHudRef,
        recordClientGameAction,
        recordResourceUseItem,
        runtimeTimingRef,
        scheduleUseItemQueueFlush,
        websocketRef,
    ]);

    useEffect(() => {
        flushUseItemUQueueRef.current = flushUseItemUQueue;
    }, [flushUseItemUQueue]);

    useEffect(() => {
        return () => {
            clearUseItemQueues();
        };
    }, [clearUseItemQueues]);

    useEffect(() => {
        const request = equipRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("equip", request.token)) {
            return;
        }

        const now = Date.now();
        if (now < nextEquipToggleAtRef.current) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(createEquipItemPacket(request.slot));
        recordClientGameAction("equip_item", { slot: request.slot });
        nextEquipToggleAtRef.current =
            now + runtimeTimingRef.current.actionCooldowns.equipToggleMs;
        markRequestTokenProcessed("equip", request.token);
    }, [
        equipRequest,
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        nextEquipToggleAtRef,
        recordClientGameAction,
        runtimeTimingRef,
        websocketRef,
    ]);

    useEffect(() => {
        const request = useItemClickRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("useItemClick", request.token)) {
            return;
        }

        clearExpiredCombatCooldowns();

        if (useItemClickQueueRef.current.length >= MAX_BUFFERED_USE_ITEMS) {
            return;
        }

        const inventoryItem =
            playerHudRef.current?.inventory.find(
                (item) => item.slot === request.slot,
            ) ?? null;

        maybeSetGatheringTargetingMode(inventoryItem, {
            isFishingRodItem,
            isWoodcuttingToolItem,
            isMiningToolItem,
            isSmeltingMineralItem,
            setTargetingMode,
        });
        markRequestTokenProcessed("useItemClick", request.token);
        useItemClickQueueRef.current.push(request.slot);
        flushUseItemClickQueue();
    }, [
        clearExpiredCombatCooldowns,
        flushUseItemClickQueue,
        hasProcessedRequestToken,
        isFishingRodItem,
        isMiningToolItem,
        isSmeltingMineralItem,
        isWoodcuttingToolItem,
        markRequestTokenProcessed,
        playerHudRef,
        setTargetingMode,
        useItemClickRequest,
    ]);

    useEffect(() => {
        const request = useItemURequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("useItemU", request.token)) {
            return;
        }

        clearExpiredCombatCooldowns();

        if (useItemUQueueRef.current.length >= MAX_BUFFERED_USE_ITEMS) {
            return;
        }

        const inventoryItem =
            playerHudRef.current?.inventory.find(
                (item) => item.slot === request.slot,
            ) ?? null;

        maybeSetGatheringTargetingMode(inventoryItem, {
            isFishingRodItem,
            isWoodcuttingToolItem,
            isMiningToolItem,
            isSmeltingMineralItem,
            setTargetingMode,
        });
        markRequestTokenProcessed("useItemU", request.token);
        useItemUQueueRef.current.push(request.slot);
        flushUseItemUQueue();
    }, [
        clearExpiredCombatCooldowns,
        flushUseItemUQueue,
        hasProcessedRequestToken,
        isFishingRodItem,
        isMiningToolItem,
        isSmeltingMineralItem,
        isWoodcuttingToolItem,
        markRequestTokenProcessed,
        playerHudRef,
        setTargetingMode,
        useItemURequest,
    ]);

    useEffect(() => {
        const request = rangeAttackRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("rangeAttack", request.token)) {
            return;
        }

        const weapon = getEquippedWeaponItem();
        const objectsDB = engineRef.current?.objectsDB;

        if (!weapon || !objectsDB?.[weapon.idItem.toString()]?.proyectil) {
            pushSystemMessage(
                "Debes tener un arco equipado para disparar.",
                "#fca5a5",
            );
            clearTargetingMode();
            markRequestTokenProcessed("rangeAttack", request.token);
            return;
        }

        setTargetingMode({ type: "range" });
        markRequestTokenProcessed("rangeAttack", request.token);
    }, [
        clearTargetingMode,
        engineRef,
        getEquippedWeaponItem,
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        pushSystemMessage,
        rangeAttackRequest,
        setTargetingMode,
    ]);

    useEffect(() => {
        const request = dropRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("drop", request.token)) {
            return;
        }

        const now = Date.now();
        if (now < nextDropItemAtRef.current) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(createDropItemPacket(request.slot, request.amount));
        recordClientGameAction("drop_item", {
            slot: request.slot,
            amount: request.amount,
        });
        nextDropItemAtRef.current =
            now + runtimeTimingRef.current.actionCooldowns.dropItemMs;
        markRequestTokenProcessed("drop", request.token);
    }, [
        dropRequest,
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        nextDropItemAtRef,
        recordClientGameAction,
        runtimeTimingRef,
        websocketRef,
    ]);

    useEffect(() => {
        const request = buyRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("buy", request.token)) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(createBuyItemPacket(request.slot, request.amount));
        recordClientGameAction("buy_item", {
            slot: request.slot,
            amount: request.amount,
        });
        markRequestTokenProcessed("buy", request.token);
    }, [
        buyRequest,
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        websocketRef,
    ]);

    useEffect(() => {
        const request = sellRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("sell", request.token)) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(createSellItemPacket(request.slot, request.amount));
        recordClientGameAction("sell_item", {
            slot: request.slot,
            amount: request.amount,
        });
        markRequestTokenProcessed("sell", request.token);
    }, [
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        sellRequest,
        websocketRef,
    ]);

    useEffect(() => {
        const request = changeBankTabRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("changeBankTab", request.token)) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(createChangeBankTabPacket(request.tab));
        recordClientGameAction("change_bank_tab", { tab: request.tab });
        markRequestTokenProcessed("changeBankTab", request.token);
    }, [
        changeBankTabRequest,
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        websocketRef,
    ]);

    useEffect(() => {
        const request = depositBankGoldRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("depositBankGold", request.token)) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(createDepositBankGoldPacket(request.amount));
        recordClientGameAction("deposit_bank_gold", {
            amount: request.amount,
        });
        markRequestTokenProcessed("depositBankGold", request.token);
    }, [
        depositBankGoldRequest,
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        websocketRef,
    ]);

    useEffect(() => {
        const request = withdrawBankGoldRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("withdrawBankGold", request.token)) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(createWithdrawBankGoldPacket(request.amount));
        recordClientGameAction("withdraw_bank_gold", {
            amount: request.amount,
        });
        markRequestTokenProcessed("withdrawBankGold", request.token);
    }, [
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        websocketRef,
        withdrawBankGoldRequest,
    ]);

    useEffect(() => {
        const request = closeTradeRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("closeTrade", request.token)) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(createCloseTradePacket());
        recordClientGameAction("close_trade");
        markRequestTokenProcessed("closeTrade", request.token);
    }, [
        closeTradeRequest,
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        websocketRef,
    ]);

    useEffect(() => {
        const request = marketActionRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("marketAction", request.token)) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(
            createMarketActionPacket(request.action, request.payload ?? {}),
        );
        recordClientGameAction("market_action", {
            action: request.action,
        });
        markRequestTokenProcessed("marketAction", request.token);
    }, [
        hasProcessedRequestToken,
        marketActionRequest,
        markRequestTokenProcessed,
        recordClientGameAction,
        websocketRef,
    ]);

    useEffect(() => {
        const request = retosActionRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("retosAction", request.token)) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(
            createRetosActionPacket(request.action, request.payload ?? {}),
        );
        recordClientGameAction("retos_action", {
            action: request.action,
        });
        markRequestTokenProcessed("retosAction", request.token);
    }, [
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        retosActionRequest,
        websocketRef,
    ]);

    useEffect(() => {
        const request = craftRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("craft", request.token)) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(
            createCraftItemPacket(
                request.profession,
                request.itemId,
                request.amount,
            ),
        );
        recordClientGameAction("craft_item", {
            profession: request.profession,
            itemId: request.itemId,
            amount: request.amount,
        });
        markRequestTokenProcessed("craft", request.token);
    }, [
        craftRequest,
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        websocketRef,
    ]);

    useEffect(() => {
        const request = reorderInventoryRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("reorderInventory", request.token)) {
            return;
        }

        reorderInventoryItems(request.sourceSlot, request.targetSlot);

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(
            createReorderInventoryItemPacket(
                request.sourceSlot,
                request.targetSlot,
            ),
        );
        recordClientGameAction("reorder_inventory", {
            sourceSlot: request.sourceSlot,
            targetSlot: request.targetSlot,
        });
        markRequestTokenProcessed("reorderInventory", request.token);
    }, [
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        reorderInventoryItems,
        reorderInventoryRequest,
        websocketRef,
    ]);

    useEffect(() => {
        const request = reorderSpellRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("reorderSpell", request.token)) {
            return;
        }

        reorderSpells(request.sourceSlot, request.targetSlot);

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(
            createReorderSpellPacket(request.sourceSlot, request.targetSlot),
        );
        recordClientGameAction("reorder_spell", {
            sourceSlot: request.sourceSlot,
            targetSlot: request.targetSlot,
        });
        markRequestTokenProcessed("reorderSpell", request.token);
    }, [
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        reorderSpellRequest,
        reorderSpells,
        websocketRef,
    ]);

    useEffect(() => {
        const request = reorderBankRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("reorderBank", request.token)) {
            return;
        }

        const socket = getSocket(websocketRef);
        if (!socket) {
            return;
        }

        socket.send(
            createReorderBankItemPacket(request.sourceSlot, request.targetSlot),
        );
        recordClientGameAction("reorder_bank", {
            sourceSlot: request.sourceSlot,
            targetSlot: request.targetSlot,
        });
        markRequestTokenProcessed("reorderBank", request.token);
    }, [
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        recordClientGameAction,
        reorderBankRequest,
        websocketRef,
    ]);

    useEffect(() => {
        const request = spellTargetRequest;
        if (!request) {
            return;
        }

        if (hasProcessedRequestToken("spellTarget", request.token)) {
            return;
        }

        setTargetingMode({
            type: "spell",
            slot: request.slot,
            manaRequired: request.manaRequired,
            name: request.name,
        });
        markRequestTokenProcessed("spellTarget", request.token);
    }, [
        hasProcessedRequestToken,
        markRequestTokenProcessed,
        setTargetingMode,
        spellTargetRequest,
    ]);

    return {
        clearUseItemQueues,
    };
}
