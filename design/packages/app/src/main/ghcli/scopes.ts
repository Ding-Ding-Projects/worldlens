/** GitHub OAuth-scope normalization shared by the gh account list and login proof. */

const SCOPE_IMPLICATIONS: Readonly<Record<string, readonly string[]>> = {
    "read:org": ["read:org", "write:org", "admin:org"],
    "write:org": ["write:org", "admin:org"],
    "admin:org": ["admin:org"],
    "read:project": ["read:project", "project"],
    project: ["project"],
    public_repo: ["public_repo", "repo"],
    repo: ["repo"],
    workflow: ["workflow"],
    "read:user": ["read:user", "user"],
    user: ["user"],
};

export function normalizeScopes(scopes: readonly string[]): readonly string[] {
    return [
        ...new Set(
            scopes.map((scope) => scope.trim().toLowerCase()).filter((scope) => scope.length > 0),
        ),
    ];
}

export function scopeSatisfied(granted: readonly string[], required: string): boolean {
    const normalizedRequired = required.trim().toLowerCase();
    const accepted = SCOPE_IMPLICATIONS[normalizedRequired] ?? [normalizedRequired];
    const normalizedGranted = normalizeScopes(granted);
    return accepted.some((scope) => normalizedGranted.includes(scope));
}

export function normalizeRequiredScopes(scopes: readonly string[]): readonly string[] {
    const normalized = normalizeScopes(scopes);
    return normalized.filter(
        (required) =>
            !normalized.some(
                (candidate) => candidate !== required && scopeSatisfied([candidate], required),
            ),
    );
}

export function missingScopes(
    granted: readonly string[],
    required: readonly string[],
): readonly string[] {
    return normalizeRequiredScopes(required).filter((scope) => !scopeSatisfied(granted, scope));
}
