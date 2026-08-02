"use client";

import React from "react";
import {
    buildWorldMapGrid,
    getWorldMapMarkerStyle,
    loadWorldMapGrid,
    WORLD_MAP_GENERAL_GRID_URL,
    WORLD_MAP_GENERAL_SRC,
    WORLD_MAP_GRID_URL,
    WORLD_MAP_SRC,
    type WorldMapConnectedPlayer,
    type WorldMapGridData,
    type WorldMapPlayerMarker,
} from "./worldMapGeometry";

export type UseWorldMapOptions = {
    isAdmin: boolean;
    previewMapId: number | null;
    pos?: { x: number; y: number } | null;
    /** Ref del boton del minimapa que abre el mapa; se desenfoca al cerrar. */
    triggerRef: React.RefObject<HTMLButtonElement | null>;
};

export type UseWorldMapResult = ReturnType<typeof useWorldMap>;

export function useWorldMap({
    isAdmin,
    previewMapId,
    pos,
    triggerRef,
}: UseWorldMapOptions) {
    const [worldMapGridData, setWorldMapGridData] =
        React.useState<WorldMapGridData | null>(null);
    const [worldMapPlayers, setWorldMapPlayers] = React.useState<
        WorldMapConnectedPlayer[]
    >([]);
    const [worldMapPlayersSampledAt, setWorldMapPlayersSampledAt] =
        React.useState<string | null>(null);
    const [worldMapPlayersLoading, setWorldMapPlayersLoading] =
        React.useState(false);
    const [worldMapPlayersError, setWorldMapPlayersError] = React.useState<
        string | null
    >(null);
    const [isWorldMapOpen, setIsWorldMapOpen] = React.useState(false);

    const worldMapGrid = React.useMemo(
        () => (worldMapGridData ? buildWorldMapGrid(worldMapGridData) : null),
        [worldMapGridData],
    );
    const worldMapAssetSrc = worldMapGridData?.generatedAt
        ? `${isAdmin ? WORLD_MAP_GENERAL_SRC : WORLD_MAP_SRC}?v=${encodeURIComponent(worldMapGridData.generatedAt)}`
        : isAdmin
          ? WORLD_MAP_GENERAL_SRC
          : WORLD_MAP_SRC;
    const adminWorldMapAlt = "Mapa del mundo completo";
    const worldMapMarkerPosition = React.useMemo(() => {
        return getWorldMapMarkerStyle(worldMapGrid, previewMapId, pos);
    }, [pos, previewMapId, worldMapGrid]);
    const worldMapPlayerMarkers = React.useMemo(() => {
        return worldMapPlayers
            .map((player) => {
                const markerStyle = getWorldMapMarkerStyle(
                    worldMapGrid,
                    player.map,
                    player.pos,
                );

                if (!markerStyle) {
                    return null;
                }

                return {
                    id: `${player.name}-${player.map}-${player.pos.x}-${player.pos.y}`,
                    left: markerStyle.left,
                    top: markerStyle.top,
                    title: `${player.name} (Mapa ${player.map} - ${player.pos.x}, ${player.pos.y})`,
                };
            })
            .filter(
                (marker): marker is WorldMapPlayerMarker => marker !== null,
            );
    }, [worldMapGrid, worldMapPlayers]);

    const closeWorldMap = React.useCallback(() => {
        setIsWorldMapOpen(false);
        triggerRef.current?.blur();
    }, [triggerRef]);
    const openWorldMap = React.useCallback(() => {
        setIsWorldMapOpen(true);
    }, []);
    const toggleWorldMap = React.useCallback(() => {
        setIsWorldMapOpen((current) => !current);
    }, []);
    const handleLoadWorldMapPlayers = React.useCallback(async () => {
        setWorldMapPlayers([]);
        setWorldMapPlayersSampledAt(null);
        setWorldMapPlayersError(null);
        setWorldMapPlayersLoading(false);
    }, []);
    const handleWorldMapContextMenu = React.useCallback(
        (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
        },
        [],
    );

    React.useEffect(() => {
        let cancelled = false;

        loadWorldMapGrid(
            isAdmin ? WORLD_MAP_GENERAL_GRID_URL : WORLD_MAP_GRID_URL,
        )
            .then((nextWorldMapGridData) => {
                if (!cancelled) {
                    setWorldMapGridData(nextWorldMapGridData);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setWorldMapGridData(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isAdmin]);

    React.useEffect(() => {
        if (!isWorldMapOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeWorldMap();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [closeWorldMap, isWorldMapOpen]);

    return {
        adminWorldMapAlt,
        closeWorldMap,
        handleLoadWorldMapPlayers,
        handleWorldMapContextMenu,
        isWorldMapOpen,
        openWorldMap,
        toggleWorldMap,
        worldMapAssetSrc,
        worldMapMarkerPosition,
        worldMapPlayerMarkers,
        worldMapPlayersError,
        worldMapPlayersLoading,
        worldMapPlayersSampledAt,
    };
}
