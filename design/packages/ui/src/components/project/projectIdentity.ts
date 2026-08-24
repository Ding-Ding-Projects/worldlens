/** Conservative identity for a world path on Deen No. */
export function canonicalWorldIdentity(value: string): string {
    const trimmed = value.trim().replace(/\//g, "\\");
    const unc = trimmed.startsWith("\\\\");
    const rooted = !unc && trimmed.startsWith("\\");
    const body = trimmed.replace(/^\\+/, "").replace(/\\+/g, "\\");
    const unified = `${unc ? "\\\\" : rooted ? "\\" : ""}${body}`;
    const root = /^[A-Za-z]:\\$/.test(unified) || unified === "\\\\";
    return (root ? unified : unified.replace(/\\+$/, "")).toUpperCase();
}
