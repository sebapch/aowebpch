import {
    DEFAULT_HOTKEY_SETTINGS,
    normalizeHotkeySettings,
    type HotkeySettings,
} from "./hotkeys";

export type CharacterSettingsResponse = {
    characterId: string;
    hotkeys: HotkeySettings;
};

export function normalizeCharacterSettings(
    value: Partial<CharacterSettingsResponse> | null | undefined,
): CharacterSettingsResponse | null {
    if (!value?.characterId || typeof value.characterId !== "string") {
        return null;
    }

    return {
        characterId: value.characterId,
        hotkeys: normalizeHotkeySettings(
            value.hotkeys ?? DEFAULT_HOTKEY_SETTINGS,
        ),
    };
}
