/** Conservative identity for a world path on Deen No. */
export function canonicalWorldIdentity(value: string): string {
    const unified = value.trim().replace(/[\\/]+/g, "\\");
    const root = /^[A-Za-z]:\\$/.test(unified) || unified === "\\\\";
    return (root ? unified : unified.replace(/\\+$/, "")).toUpperCase();
}
