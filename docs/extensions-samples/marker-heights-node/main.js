"use strict";
// Worldlens extension sample: one JSON line in, one JSON line out.
let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (data += chunk));
process.stdin.on("end", () => {
    let request;
    try {
        request = JSON.parse(data);
    } catch {
        process.stdout.write(JSON.stringify({ ok: false, message: "The request was not JSON." }) + "\n");
        return;
    }
    const markers = (request.input && request.input.markers) || [];
    const rows = markers
        .filter((m) => typeof m.y === "number")
        .sort((a, b) => b.y - a.y)
        .map((m) => `${String(m.y).padStart(4)}  ${m.label} (${m.set})`);
    process.stdout.write(
        JSON.stringify({ ok: true, message: `${rows.length} markers sorted.`, output: { kind: "text", name: "marker-heights.txt", text: rows.join("\n") + "\n" } }) + "\n",
    );
});
