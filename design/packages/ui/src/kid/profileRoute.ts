/**
 * Completes a Kids profile-row activation at the application seam.
 *
 * Identity is the stable profile id, never the translated/display name. Map selection always runs,
 * even when the chosen id is already active, because the original defect was a click that changed
 * no store value and therefore left Home visibly in front of the already-loaded map.
 */
export function routeKidProfile(
    id: string,
    profileIds: readonly string[],
    setActive: (id: string) => void,
    selectMap: () => void,
): boolean {
    if (!profileIds.includes(id)) return false;
    setActive(id);
    selectMap();
    return true;
}
