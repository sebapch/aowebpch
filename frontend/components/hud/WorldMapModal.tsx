/* eslint-disable @next/next/no-img-element */

"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { WORLD_MAP_MARKER_SIZE } from "./worldMapGeometry";
import type { UseWorldMapResult } from "./useWorldMap";

type WorldMapModalProps = {
    worldMap: UseWorldMapResult;
    isAdmin: boolean;
    portalTarget?: HTMLElement | null;
};

export function WorldMapModal({
    worldMap,
    isAdmin,
    portalTarget,
}: WorldMapModalProps) {
    const {
        adminWorldMapAlt,
        closeWorldMap,
        handleLoadWorldMapPlayers,
        handleWorldMapContextMenu,
        isWorldMapOpen,
        worldMapAssetSrc,
        worldMapMarkerPosition,
        worldMapPlayerMarkers,
        worldMapPlayersError,
        worldMapPlayersLoading,
        worldMapPlayersSampledAt,
    } = worldMap;

    return (
        <>
            {isWorldMapOpen && typeof document !== "undefined"
                ? createPortal(
                      <div
                          className="fixed inset-0 z-[82] flex items-center justify-center bg-black/70 p-3 backdrop-blur-[3px] sm:p-5"
                          onClick={closeWorldMap}
                      >
                          <div
                              className="relative w-full max-w-6xl overflow-hidden rounded-[24px] border border-amber-200/20 bg-[#120c08]/96 shadow-[0_28px_90px_rgba(0,0,0,0.6)]"
                              onClick={(event) => event.stopPropagation()}
                          >
                              <div className="flex items-center justify-between gap-4 border-b border-amber-200/10 bg-[linear-gradient(180deg,rgba(127,78,35,0.28),rgba(18,12,8,0))] px-4 py-3 sm:px-5">
                                  <div>
                                      <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/72">
                                          Navegacion
                                      </p>
                                      <h3 className="mt-1 text-lg font-semibold text-[#f2e5ca] sm:text-xl">
                                          Mapa del mundo
                                      </h3>
                                      {isAdmin ? (
                                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-300">
                                              <button
                                                  type="button"
                                                  onClick={
                                                      handleLoadWorldMapPlayers
                                                  }
                                                  disabled={
                                                      worldMapPlayersLoading
                                                  }
                                                  className="rounded-[10px] border border-sky-700/60 bg-sky-950/60 px-3 py-2 text-left font-semibold text-sky-100 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                                              >
                                                  {worldMapPlayersLoading
                                                      ? "Cargando jugadores..."
                                                      : "Cargar todos los jugadores en el mapa"}
                                              </button>
                                              <span className="text-stone-400">
                                                  {worldMapPlayerMarkers.length}{" "}
                                                  visibles
                                              </span>
                                              {worldMapPlayersSampledAt ? (
                                                  <span className="text-stone-500">
                                                      Snapshot listo
                                                  </span>
                                              ) : null}
                                          </div>
                                      ) : null}
                                      {isAdmin && worldMapPlayersError ? (
                                          <p className="mt-2 text-xs text-rose-300">
                                              {worldMapPlayersError}
                                          </p>
                                      ) : null}
                                  </div>
                                  <button
                                      type="button"
                                      onClick={closeWorldMap}
                                      className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-700 bg-black/20 text-stone-300 transition hover:border-stone-500 hover:text-white"
                                      aria-label="Cerrar mapa del mundo"
                                  >
                                      <X
                                          aria-hidden="true"
                                          className="h-4 w-4"
                                          strokeWidth={1.8}
                                      />
                                  </button>
                              </div>

                              <div className="flex h-[calc(100vh-7rem)] items-center justify-center bg-[#0b0705] p-2 sm:p-3">
                                  <div
                                      className="relative inline-block"
                                      onContextMenu={handleWorldMapContextMenu}
                                      title={
                                          isAdmin
                                              ? "Click derecho para teletransportarte"
                                              : undefined
                                      }
                                  >
                                      <img
                                          src={worldMapAssetSrc}
                                          alt={adminWorldMapAlt}
                                          className="block max-h-[calc(100vh-8.5rem)] max-w-full object-contain"
                                      />
                                      {worldMapMarkerPosition ? (
                                          <div className="pointer-events-none absolute inset-0">
                                              {worldMapPlayerMarkers.map(
                                                  (marker) => (
                                                      <div
                                                          key={marker.id}
                                                          className="pointer-events-auto absolute h-[8px] w-[8px] rounded-full border border-white/70 bg-sky-400 shadow-[0_0_0_1px_rgba(8,47,73,0.9),0_0_6px_rgba(56,189,248,0.7)]"
                                                          style={{
                                                              left: marker.left,
                                                              top: marker.top,
                                                              transform:
                                                                  "translate(-50%, -50%)",
                                                          }}
                                                          title={marker.title}
                                                          aria-label={
                                                              marker.title
                                                          }
                                                      />
                                                  ),
                                              )}
                                              <div
                                                  data-testid="world-map-self-marker"
                                                  aria-hidden="true"
                                                  className="absolute rounded-full border border-white/90 bg-[#ff3b22] shadow-[0_0_0_1px_rgba(90,14,2,0.9),0_0_5px_rgba(255,88,42,0.9)] before:absolute before:left-1/2 before:top-1/2 before:h-6 before:w-6 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border before:border-[#ff6a54]/80 before:bg-[#ff6a54]/10 before:content-['']"
                                                  style={{
                                                      left: worldMapMarkerPosition.left,
                                                      top: worldMapMarkerPosition.top,
                                                      width: `${WORLD_MAP_MARKER_SIZE}px`,
                                                      height: `${WORLD_MAP_MARKER_SIZE}px`,
                                                      transform:
                                                          "translate(-50%, -50%)",
                                                  }}
                                              />
                                          </div>
                                      ) : worldMapPlayerMarkers.length > 0 ? (
                                          <div className="pointer-events-none absolute inset-0">
                                              {worldMapPlayerMarkers.map(
                                                  (marker) => (
                                                      <div
                                                          key={marker.id}
                                                          className="pointer-events-auto absolute h-[8px] w-[8px] rounded-full border border-white/70 bg-sky-400 shadow-[0_0_0_1px_rgba(8,47,73,0.9),0_0_6px_rgba(56,189,248,0.7)]"
                                                          style={{
                                                              left: marker.left,
                                                              top: marker.top,
                                                              transform:
                                                                  "translate(-50%, -50%)",
                                                          }}
                                                          title={marker.title}
                                                          aria-label={
                                                              marker.title
                                                          }
                                                      />
                                                  ),
                                              )}
                                          </div>
                                      ) : null}
                                  </div>
                              </div>
                          </div>
                      </div>,
                      portalTarget ?? document.body,
                  )
                : null}
        </>
    );
}
