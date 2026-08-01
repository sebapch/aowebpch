export type VoiceIceServer = {
    urls: string | string[];
    username?: string;
    credential?: string;
};

export const VOICE_SIGNAL_MAX_LENGTH = 16_384;
export const VOICE_SIGNAL_WINDOW_MS = 10_000;
export const VOICE_SIGNAL_MAX_PER_WINDOW = 120;

const DEFAULT_ICE_SERVERS: VoiceIceServer[] = [
    {
        urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
    },
];

let cachedIceServers: VoiceIceServer[] | null = null;

function parseIceServersFromEnv(): VoiceIceServer[] | null {
    const raw = process.env.VOICE_ICE_SERVERS?.trim();

    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed) || parsed.length === 0) {
            return null;
        }

        return parsed.filter((entry): entry is VoiceIceServer => {
            if (!entry || typeof entry !== "object") {
                return false;
            }

            const urls = (entry as VoiceIceServer).urls;
            return typeof urls === "string" || Array.isArray(urls);
        });
    } catch {
        return null;
    }
}

function buildTurnServerFromEnv(): VoiceIceServer | null {
    const url = process.env.VOICE_TURN_URL?.trim();

    if (!url) {
        return null;
    }

    return {
        urls: url,
        username: process.env.VOICE_TURN_USERNAME?.trim() || undefined,
        credential: process.env.VOICE_TURN_CREDENTIAL?.trim() || undefined,
    };
}

/**
 * Servidores ICE que el cliente usa para armar la conexión P2P de voz.
 * Por defecto sólo hay STUN público: los jugadores detrás de NAT simétrico
 * necesitan un TURN, configurable con VOICE_ICE_SERVERS o VOICE_TURN_*.
 */
export function getVoiceIceServers(): VoiceIceServer[] {
    if (cachedIceServers) {
        return cachedIceServers;
    }

    const fromEnv = parseIceServersFromEnv();

    if (fromEnv && fromEnv.length > 0) {
        cachedIceServers = fromEnv;
        return cachedIceServers;
    }

    const turnServer = buildTurnServerFromEnv();
    cachedIceServers = turnServer ? [...DEFAULT_ICE_SERVERS, turnServer] : DEFAULT_ICE_SERVERS;

    return cachedIceServers;
}
