"use client";

import { createPortal } from "react-dom";
import type { UseClanPanelResult } from "./useClanPanel";

type ClanMemberActionMenuProps = {
    clan: UseClanPanelResult;
    portalTarget?: HTMLElement | null;
};

export function ClanMemberActionMenu({
    clan,
    portalTarget,
}: ClanMemberActionMenuProps) {
    const {
        clanKickActionId,
        clanLeadershipTransferActionId,
        clanMemberActionMenu,
        clanMemberActionTarget,
        clanRoleActionId,
        handleClanKick,
        handleClanRoleChange,
        handleTransferClanLeadership,
        setClanMemberActionMenu,
    } = clan;

    return (
        <>
            {clanMemberActionMenu && clanMemberActionTarget
                ? createPortal(
                      <div
                          className="fixed inset-0 z-[86]"
                          onClick={() => setClanMemberActionMenu(null)}
                      >
                          <div
                              className="absolute flex min-w-[190px] flex-col gap-2 rounded-[14px] border border-white/10 bg-[#1b140f]/95 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                              style={{
                                  left: clanMemberActionMenu.left,
                                  top: clanMemberActionMenu.top,
                                  transform: "translate(-100%, 8px)",
                              }}
                              onClick={(event) => event.stopPropagation()}
                          >
                              <button
                                  type="button"
                                  onClick={() =>
                                      handleTransferClanLeadership(
                                          clanMemberActionTarget.characterId,
                                          clanMemberActionTarget.name,
                                      )
                                  }
                                  disabled={Boolean(
                                      clanLeadershipTransferActionId,
                                  )}
                                  className="rounded-[10px] border border-amber-700/60 bg-amber-950/55 px-3 py-2 text-left text-[11px] font-semibold text-amber-100 transition hover:border-amber-500 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                              >
                                  {clanLeadershipTransferActionId ===
                                  clanMemberActionTarget.characterId
                                      ? "Procesando..."
                                      : "Transferir liderazgo"}
                              </button>
                              <button
                                  type="button"
                                  onClick={() =>
                                      handleClanRoleChange(
                                          clanMemberActionTarget.characterId,
                                          clanMemberActionTarget.role ===
                                              "co_leader"
                                              ? "member"
                                              : "co_leader",
                                      )
                                  }
                                  disabled={Boolean(clanRoleActionId)}
                                  className="rounded-[10px] border border-sky-700/60 bg-sky-950/60 px-3 py-2 text-left text-[11px] font-semibold text-sky-100 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                              >
                                  {clanRoleActionId ===
                                  clanMemberActionTarget.characterId
                                      ? "Procesando..."
                                      : clanMemberActionTarget.role ===
                                          "co_leader"
                                        ? "Quitar co-lider"
                                        : "Hacer co-lider"}
                              </button>
                              <button
                                  type="button"
                                  onClick={() =>
                                      handleClanKick(
                                          clanMemberActionTarget.characterId,
                                          clanMemberActionTarget.name,
                                      )
                                  }
                                  aria-label={`Echar a ${clanMemberActionTarget.name}`}
                                  disabled={Boolean(clanKickActionId)}
                                  className="rounded-[10px] border border-rose-700/60 bg-rose-950/70 px-3 py-2 text-left text-[11px] font-semibold text-rose-100 transition hover:border-rose-500 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                              >
                                  {clanKickActionId ===
                                  clanMemberActionTarget.characterId
                                      ? "Procesando..."
                                      : "Echar"}
                              </button>
                          </div>
                      </div>,
                      portalTarget ?? document.body,
                  )
                : null}
        </>
    );
}
