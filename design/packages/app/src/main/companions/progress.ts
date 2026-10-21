/** Observed root-script phase markers only. These are phase numbers, not percentages. */
export interface BuildPhase { readonly stage: number; readonly stages: number; readonly label: string }
// These reviewed labels come from the root scripts. Unknown output remains transient.
const labels: Readonly<Record<number, readonly string[]>> = {
    4: [
        "Install and verify all build dependencies",
        "Resolve the pinned pnpm command",
        "Build the real workspace outputs",
        "Verify the built app and Electron runtime",
    ],
    9: [
        "Bootstrap dependencies and build the workspace",
        "Verify source identity",
        "Stage the BlueMap CLI jar",
        "Resolve monotonic package identity",
        "Prepare one fresh Squirrel release set",
        "Stamp and package Squirrel.Windows",
        "Collect exactly one fresh matching artifact set",
        "Verify unsigned executable and release contracts",
        "Re-prove exact source commit and clean tree",
    ],
};
export function knownBuildPhase(stage: number, stages: number, text: string): BuildPhase | undefined {
    if (!Number.isInteger(stage) || stage < 1) return undefined;
    const label = labels[stages]?.[stage - 1];
    return label !== undefined && text === label ? Object.freeze({ stage, stages, label }) : undefined;
}
export class BuildPhaseReader {
    private pending = "";
    push(text: string): BuildPhase[] {
        this.pending += text;
        const lines = this.pending.split(/\r?\n/u);
        this.pending = (lines.pop() ?? "").slice(-8192);
        return lines.flatMap((line) => {
            const match = /^\[([1-9])\/([49])\] (.{1,160})$/u.exec(line.trim());
            if (!match || !match[1] || !match[2] || !match[3]) return [];
            const stage = Number(match[1]), stages = Number(match[2]);
            const phase = knownBuildPhase(stage, stages, match[3]);
            return phase ? [phase] : [];
        });
    }
}
