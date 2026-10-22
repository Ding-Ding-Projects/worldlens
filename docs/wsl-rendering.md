# Rendering with WSL

On Windows, choose **In WSL on this computer** in **Where this render runs**. The desktop application discovers existing Linux distributions and excludes Docker Desktop's internal distributions. Ubuntu is the initial suggestion when installed; an explicit saved selection is never replaced silently. Select the distribution and use **Check WSL and Java** before rendering.

The selected distribution needs Java 25 or later. Worldlens checks `java -version` inside that distribution and then its own managed runtime. Starting a render with missing Java downloads the Linux Temurin release through the existing Adoptium metadata resolver, verifies SHA-256 before extraction, and installs only under `$HOME/.local/share/worldlens/java/<sha256>`. No system package manager, elevation, PATH edit or default-distribution change is used. It does not install a distribution or accept download licenses. If WSL is unavailable, install and configure WSL using Microsoft's supported procedure. If managed Java setup is unavailable, the render reports the exact setup problem; an existing supported Linux Java runtime can also be installed independently and checked again. Existing download consent is still required before rendering.

Choose the Java render engine for this route. The TypeScript engine is not automatically replaced. The bundled CLI jar is resolved normally, but Windows Java is not used or provisioned for a WSL render.

## Paths and output

World folders, the CLI jar, configuration, working directory, data and output are translated using `wslpath` inside the selected distribution. This respects its configured drive-mount location. Absolute local drive paths and `\\wsl.localhost\<distribution>\...` or `\\wsl$\<distribution>\...` paths for that same distribution are supported. Network shares and paths belonging to another distribution are rejected. Paths with spaces and shell punctuation are passed as separate arguments, not shell commands.

Generated configuration retains the supplied map settings, with world, data and output paths set to the paths Linux can read. The working directory and output remain under the owned render workspace. The ordinary progress stream, diagnostics, live-map preview and finished-map promotion use the same desktop channels as local rendering. Distribution and runtime are retained for interrupted-render resume.

## Cancellation and speed

Cancel addresses the owned Linux process, checking its recorded PID, kernel start time and per-run environment identity. It sends a graceful termination signal, then escalates only that process after a bounded wait. It never shuts down WSL or terminates a distribution. A cancellation marker also prevents a process whose startup was still pending from starting later.

Choose thread count and priority before rendering. Live Windows scheduling controls cannot change a Linux JVM, so live speed adjustment is explicitly unavailable for WSL. The existing local, Docker and SSH choices retain their own behavior.

## Verification scope

Focused checks cover distribution discovery, unavailable and obsolete Java, retained explicit selection, path translation, shell-argument isolation and launch settings. Runtime acceptance additionally requires a real render in the chosen installed distribution, streaming progress, live-map output and confirmed cancellation. A passing source check alone is not native runtime evidence.
