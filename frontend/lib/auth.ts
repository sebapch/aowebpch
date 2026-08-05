export type AuthCharacterSummary = {
    _id: string;
    name: string;
    level: number;
    map: number;
    className: string;
    raceName: string;
    isAdministrator: boolean;
    criminal: boolean;
    faction: "none" | "armada" | "caos";
    clanName: string | null;
    rating: number;
    id_head: number;
    id_body: number;
    id_weapon: number;
    id_shield: number;
    id_helmet: number;
};

export type AuthSession = {
    account: {
        _id: string;
        name: string;
        email: string;
    };
    characters: AuthCharacterSummary[];
    selectedCharacterId: string | null;
};

export type AuthErrorResponse = {
    error: string;
};

let inFlightAuthSession: Promise<AuthSession | null> | null = null;

/**
 * Varios componentes de layout (AppChrome, useAuthRedirect, LandingCta) piden
 * la sesion actual de forma independiente y suelen montarse juntos en la misma
 * carga de pagina. Este helper dedupea esas llamadas concurrentes en un solo
 * fetch a /api/auth/me en vez de dispararlo 2-3 veces.
 */
export function fetchAuthSession(): Promise<AuthSession | null> {
    if (inFlightAuthSession) {
        return inFlightAuthSession;
    }

    const request = fetch("/api/auth/me", { cache: "no-store" })
        .then(async (response) => {
            if (!response.ok) {
                return null;
            }

            const result = (await response.json()) as
                | AuthSession
                | AuthErrorResponse;

            return "error" in result ? null : result;
        })
        .catch(() => null)
        .finally(() => {
            inFlightAuthSession = null;
        });

    inFlightAuthSession = request;
    return request;
}

export type PasswordResetStatus = {
    valid: boolean;
};

export type PasswordResetResponse = {
    message: string;
};
