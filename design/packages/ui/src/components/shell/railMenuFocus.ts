/**
 * Restore disclosure focus after teardown, without taking it from an outside click or a job
 * which deliberately focused its own control. `menu` and `activeBeforeClose` are captured
 * before the overlay unmounts; `target` is resolved afterwards because a resize can remove More.
 */
export function restoreRailMenuFocus(
    menu: HTMLElement | null,
    target: HTMLElement | null,
    activeBeforeClose: Element | null,
): void {
    if (target === null || !target.isConnected) return;
    const document = target.ownerDocument;
    const belongedToMenu =
        activeBeforeClose === null ||
        activeBeforeClose === document.body ||
        activeBeforeClose === target ||
        (menu?.contains(activeBeforeClose) ?? false);
    if (!belongedToMenu) return;

    const current = document.activeElement;
    if (
        current !== null && current !== document.body && current !== target &&
        !(menu?.contains(current) ?? false)
    ) return;
    target.focus({ preventScroll: true });
}
