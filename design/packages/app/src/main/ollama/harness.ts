export interface OllamaHarnessProfile {
    readonly id: string;
    readonly name: string;
    readonly executable: string;
    readonly arguments: readonly string[];
    readonly workingDirectory: string;
    readonly environmentKeys: readonly string[];
    readonly allowed: boolean;
}

export interface OllamaHarnessPreflight { readonly ok: boolean; readonly blockers: readonly string[]; readonly preview: string; }

const SAFE_ARGUMENT = /^[A-Za-z0-9_./:=+@% -]{0,240}$/;

export function validateHarnessProfile(profile: OllamaHarnessProfile): OllamaHarnessPreflight {
    const blockers: string[] = [];
    if (!profile.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(profile.id)) blockers.push("Profile id must use lowercase letters, numbers and hyphens.");
    if (!profile.name.trim()) blockers.push("Profile name is required.");
    if (!profile.executable.trim()) blockers.push("Choose an executable with the file picker.");
    if (!profile.workingDirectory.trim()) blockers.push("Choose a working folder with the folder picker.");
    if (!profile.allowed) blockers.push("The executable is not in the allowlisted harness registry.");
    if (profile.arguments.some((argument) => !SAFE_ARGUMENT.test(argument) || /[;&|<>`$]/.test(argument))) blockers.push("Arguments contain shell syntax or unsupported characters.");
    if (profile.environmentKeys.some((key) => !/^[A-Z][A-Z0-9_]{0,63}$/.test(key))) blockers.push("Environment keys must be named allowlisted variables.");
    return { ok: blockers.length === 0, blockers, preview: `${profile.executable} ${profile.arguments.join(" ")} in ${profile.workingDirectory}; environment keys: ${profile.environmentKeys.join(", ") || "none"}` };
}

export const OLLAMA_HARNESS_COMPLETENESS = ["allowlisted-executable", "semantic-pickers", "preflight-preview", "snapshot", "rollback", "secret-redaction"] as const;

export function assertHarnessCompleteness(inventory: readonly string[] = OLLAMA_HARNESS_COMPLETENESS): void {
    const actual = new Set(inventory);
    for (const item of OLLAMA_HARNESS_COMPLETENESS) if (!actual.has(item)) throw new Error(`Ollama harness completeness is missing ${item}.`);
}
