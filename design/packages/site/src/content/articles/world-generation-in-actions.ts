import type { Article } from "../types.js";
import { repoFile } from "../links.js";

export const worldGenerationInActions: Article = {
    id: "world-generation-in-actions",
    title: "Generating a world in GitHub Actions",
    summary:
        "The world generator dialog sends its configuration to worldgen.yml, which generates the world with the built-in generator on a GitHub runner, verifies and packages it, compiles a map, and can publish it for render-world.yml.",
    category: "delivery",
    status: "ported-unverified",
    statusNote:
        "The document, the dispatch and the workflow have unit tests; whether a live dispatch generated and rendered a world is recorded with its run id in HANDOFF.md rather than claimed here.",
    sections: [
        {
            id: "follow-import",
            title: "Follow and verify the imported world",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The dialog retains the durable operation id, displays the run and jobs, and offers bounded observation plus manual refresh. Discovery requires the exact world title, workflow_dispatch event and creation within five minutes of dispatch; ambiguous matches are rejected. After success, collection verifies GitHub's outer archive digest, the inner archive digest and receipt binding to the exact configuration, repository, source commit and run. Safe extraction uses a fresh owned directory; measured chunks and the saved seed are read before Open imported world appears. Existing worlds are never overwritten. Closing the dialog stops observation only, not the remote workflow.",
                },
                {
                    kind: "paragraph",
                    content:
                        "視窗保留操作編號，顯示工作流程及各項工作狀態，提供有限次自動觀察及手動更新。尋找結果要符合世界標題、事件及派發後五分鐘內時間，多個符合結果不會自動選擇。下載會核對外層及內層摘要，以及設定、儲存庫、提交及流程身份。解壓使用新的儲存目錄，讀回區塊及種子後才可開啟世界；不覆寫現有世界，關閉視窗不會取消遠端工作流程。",
                },
            ],
        },

        {
            id: "behaviour",
            title: "Behaviour",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Choosing GitHub Actions with the built-in generator shows the exact configuration document, read-only, before it is sent: seed, square size from the radius, world name, chunk format from the version, output mode and an echo of the other settings.",
                        "The main process validates the document with the same module, confirms the repository carries worldgen.yml on its default branch, and sends one workflow_dispatch. The answer is a dispatch receipt with the runs link; a started run is not a generated world.",
                        "The generate job validates again on the runner, writes the world, checks level.dat and a region file exist, zips it and uploads it with SHA256SUMS and a receipt naming configuration, commit and run.",
                        "The render job downloads the BlueMap CLI jar from the latest green ci.yml run on main and renders the overworld exactly as the test-world job does; no tiles is a failure.",
                        "publish attaches the zip to a prerelease render-world.yml can read as a release asset, and dispatch-render starts that workflow against it with the world's name as map id.",
                    ],
                },
            ],
        },
        {
            id: "configuration",
            title: "Configuration",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "Four workflow_dispatch inputs: generation-config (the JSON document, required), render (default true), publish (artifact or release-asset) and dispatch-render (default false). The document is bounded at 16 KiB, the size at 16 to 40000 blocks and the world name at 120 characters; unknown fields are refused.",
                },
            ],
        },
        {
            id: "failure-modes",
            title: "Failure modes",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "A refused document fails in the dialog before anything is sent, and fails the runner's validation step with the same message when dispatched by hand.",
                        "The vanilla-server engine is refused on the runner: nothing launches a Minecraft server, and the receipt never implies Mojang's generator produced the terrain.",
                        "A missing level.dat or region file, an expired BlueMap CLI artifact, or a render with no tiles each fail the run with a message instead of uploading something incomplete.",
                    ],
                },
            ],
        },
        {
            id: "security",
            title: "Security considerations",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "No value from the input is interpolated into shell text. Each job holds the least workflow-token permission it needs, with contents: write only in publish and actions: write only in chain-render. The desktop dispatches through the GitHub CLI account lease every other cloud action uses; no credential crosses IPC.",
                },
            ],
        },
        {
            id: "verification",
            title: "Verification",
            blocks: [
                {
                    kind: "paragraph",
                    content:
                        "The shared module's tests cover building, parsing and refusing the document and the exact dispatch inputs; scripts/worldgen-config.test.mjs runs the validator as the workflow does; the dialog test selects the GitHub Actions runner, reads the shown document and checks the dispatched request; the main-process test dispatches worldgen.yml on the default branch with string-only inputs and refuses a signed-out account or a repository without the workflow. The workflow is pinned in scripts/lint-workflows.mjs and named in the cloud runner inventory. A live dispatch is recorded with its run id in HANDOFF.md.",
                },
            ],
        },
    ],
    suggested: [
        {
            articleId: "render-in-actions",
            reason: "The map pipeline chain-render hands the generated world to.",
        },
        {
            articleId: "test-world-generator",
            reason: "The synthetic generator the run writes the world with, and what its terrain is and is not.",
        },
        {
            articleId: "server-generation",
            reason: "Generating a world from a real server on this computer, the path this one does not replace.",
        },
    ],
    sources: [
        {
            label: "docs/world-generation-in-actions.md",
            href: repoFile("docs/world-generation-in-actions.md"),
        },
        {
            label: ".github/workflows/worldgen.yml",
            href: repoFile(".github/workflows/worldgen.yml"),
        },
        {
            label: "packages/shared/src/worldGenerationConfig.ts",
            href: repoFile("design/packages/shared/src/worldGenerationConfig.ts"),
        },
        {
            label: "packages/app/src/main/worldgenactions/ipc.ts",
            href: repoFile("design/packages/app/src/main/worldgenactions/ipc.ts"),
        },
    ],
};
