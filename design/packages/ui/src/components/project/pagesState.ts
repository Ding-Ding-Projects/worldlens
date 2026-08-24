import type { ProjectPagesStateRecord } from "./ProjectEditor.vue";

/** Accepts a Pages completion only when it belongs to the active publication attempt. */
export function acceptsPagesState(
    activeKey: string | null,
    current: ProjectPagesStateRecord | undefined,
    incoming: ProjectPagesStateRecord,
): boolean {
    return (
        activeKey === incoming.key &&
        current !== undefined &&
        current.generation === incoming.generation &&
        current.renderId === incoming.renderId &&
        current.projectSnapshot === incoming.projectSnapshot
    );
}
