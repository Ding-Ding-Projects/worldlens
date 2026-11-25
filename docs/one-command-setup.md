# One-command setup for the hosted application

Running the hosted WorldLens used to mean writing a `docker run` line or a Compose file by hand:
choosing a password and hashing it, declaring mounts twice, picking a free port, finding the
network address. This setup asks for what it cannot decide, generates the rest, writes the files,
starts the container and prints a link it has checked.

It is one self-contained file, [`scripts/setup.mjs`](../scripts/setup.mjs). It needs Node.js 18 or
newer and, to start the container, Docker with Compose v2. It installs nothing: it never installs
Docker, and it needs no `npm install`.

## The command

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/Ding-Ding-Projects/worldlens/main/scripts/setup.mjs -OutFile worldlens-setup.mjs; node worldlens-setup.mjs
```

Linux and macOS (sh):

```sh
curl -fsSL https://raw.githubusercontent.com/Ding-Ding-Projects/worldlens/main/scripts/setup.mjs -o worldlens-setup.mjs && node worldlens-setup.mjs
```

From a checkout of this repository: `node scripts/setup.mjs`.

## Behaviour

In a terminal it opens an arrow-key interface. Every question shows its default, validates as you
type, and can be undone with Esc (or Ctrl+B). Nothing is written until you accept the review
screen, which lists every value, the files it will write and, for any file it did not create
itself, the exact difference.

| Question | Default | What it does |
| --- | --- | --- |
| Setup folder | `worldlens-hosted` in your home folder | Where `compose.yaml`, `.env` and the saved answers go. |
| Password | Generate one | A strong 20-character password (about 99 bits), shown once at the end, or type your own twice (at least 12 characters, masked). On a re-run, "Keep the current password" comes first. |
| Port | The first free port from 8110 | Probed on this computer. An earlier setup's own port is accepted. |
| Who can open it | Only this computer | Or other computers on your network, with the detected address shown. |
| Folders | A writable `renders` folder inside the setup folder | Add worlds read-only, add writable folders, remove any. Each is checked to exist and given a name people will recognise. |
| Extras | None | Docker, SSH and GitHub grants (see [hosted mode](hosted-mode.md)). Each is off unless ticked. |
| HTTPS in front | No | Marks the session cookie `Secure` when a proxy provides HTTPS. |

Then it writes the files, checks that Docker, Compose and the Docker daemon are present (and says
plainly which is missing, without installing anything), pulls the pinned image, starts it, waits
up to 90 seconds for the application to answer, and prints the links:

```
WorldLens is running.
  This computer:  http://127.0.0.1:8110/
  Your network:   http://192.168.1.20:8110/  (answered when tried from this computer; not tried from another device)
Sign in with the password. This deployment has one shared password and no separate accounts.
```

**There is no setup code and no owner registration in this deployment.** The hosted application
has a single shared password; everyone who knows it is the same person to the server. (The
Minecraft server appliance's management site is different: the first person to register there
becomes its owner. See [appliance images](appliance.md).)

### Without a terminal

When standard input is not an interactive terminal, or with `--plain`, the same questions are asked
as numbered choices and typed lines: Enter takes the default, `<` goes back, and a bad answer is
explained and asked again. If the input ends early, nothing further is written.

### Unattended, for scripts and the desktop app

`--yes` asks nothing. Every value comes from a flag, a `WORLDLENS_SETUP_*` variable (a flag wins),
the answers of an earlier run, or the defaults. `node setup.mjs --help` lists them all.

```sh
node setup.mjs --yes --port 9100 --lan --worlds "/srv/worlds=My worlds" --writable /srv/renders
```

The password comes from the `WORLDLENS_SETUP_PASSWORD` variable or `--password-stdin`. There is no
`--password` flag on purpose, because arguments show up in process lists. A generated password is
printed once, or written to a file with mode 600 by `--password-out FILE`.

Exit codes: `0` done, `1` bad input, `2` would replace a file this setup did not create,
`3` files written but Docker is unavailable, `4` pull, start or health check failed, `130` cancelled.

## Re-running

The answers (never the password) are saved in `.worldlens-setup.json`, and the password hash stays
in `.env`. Running the command again offers the earlier values as defaults, keeps the password
unless you ask for a new one (`--reset-password`), and rewrites only what changed. Your worlds and
the container's state volume are never touched.

## Failure modes

- **A hand-made `compose.yaml`, `.env` or state file in the folder.** Files carry a marker line
  when this setup creates them. A file without it is never replaced silently: the review screen
  shows the difference and needs an explicit "Replace" choice, and an unattended run stops with exit
  code 2 unless `--overwrite` is given.
- **Docker missing, not running, or no Compose plugin.** The files are still written (and a
  generated password is still shown), the message says which piece is missing, and the exit code is 3.
- **Pull or start failure.** The tool's own last lines are shown and the exit code is 4.
- **No answer within the timeout.** The container's startup output usually explains it, so the
  last 20 log lines are printed with the exit code 4.
- **The network address.** A link for other computers is offered only when an address was found,
  and the setup says what it checked: the address was tried from this computer, not from another device.

## Security considerations

- The password is never written to disk. `.env` and the `WORLDLENS_PASSWORD_SHA256` the container
  receives hold only its SHA-256, the form the server already accepts. A generated password is
  printed exactly once and never redrawn; the interface offers to copy it to the clipboard.
- Files are created with mode 600 where the platform supports it. On Windows they inherit the
  folder's permissions, and the setup says so.
- The default is "only this computer". Choosing the network publishes the port on every
  interface of this machine: keep it on a trusted network and do not forward it to the Internet.
  The password is the only lock.
- The Docker grant mounts the Docker socket, which is close to full control of Docker on the
  host. It is off unless ticked.
- The image reference must be pinned by a `sha256` digest, matching the rule the deployment
  managers already apply.

## What was audited

The values a person had to create or edit by hand to run the hosted application, and what now
covers each:

| Hand-made value | Where it was asked for | Now |
| --- | --- | --- |
| `WORLDLENS_PASSWORD` or its SHA-256 | [hosted mode](hosted-mode.md), the hosted Dockerfile header | Generated or typed in the interface; only the hash is stored. |
| `WORLDLENS_MOUNTS` and the matching `-v` flags, written twice | hosted mode, the hosted Dockerfile header | Built from the folder questions; Compose gets the bind mounts and the declaration from one list. |
| Port, and whether other computers may connect | `-p` in the `docker run` line | Free port found, access asked. |
| `WORLDLENS_CAPABILITIES` | hosted mode | Ticked in the interface; the Docker socket mount is added with it. |
| `WORLDLENS_BEHIND_TLS` | hosted mode | One question. |
| The image digest | hosted mode, the container manager | Pinned default, checked against the desktop app's copy by a test. |
| The state volume | `-v worldlens-state:/data/state` | Created in the generated Compose file. |
| `WORLDLENS_HOST`, `WORLDLENS_DATA`, `WORLDLENS_UI_ROOT` | environment | Image defaults; not asked. |
| The CLI image's `config/` folder and `maps/*.conf` | [container image](container-image.md) | Not covered: those are written by the desktop application's configuration editor, which is where a person makes them. |
| `PRIVATE_WORLD_KEY` and related settings | [private world rendering](private-world-rendering.md) | Not covered: these are repository secrets entered in GitHub, not a local deployment. |
| `WORLDLENS_UPDATE_FEED` and related update variables | [automatic updates](automatic-updates.md) | Not covered: optional overrides for the desktop updater. |
| The Minecraft server appliance's variables | appliance boot script | Not covered: the appliance builder sets them. |

## Verification

`scripts/setup.test.mjs` runs with `node --test` (`pnpm --dir design run setup:check`). It drives the
interface with scripted keys and the plain prompts with scripted lines, against temporary folders and
an injected process runner, so no container is ever started. It covers Back and live validation,
the masked password with confirmation, nothing written before the review is accepted, the password
appearing exactly once in everything printed and never in a file, free-port probing against a real
listener, re-runs keeping values, refusal to replace a foreign file, flags and variables, every
Docker failure exit code, and the health timeout. The `secret appears once` test was watched failing
by printing the password twice, then restored. The default image digest is checked against the one in
`publishedImages.ts`.

**Not proved:** a real container start from the published image (the image has not been pulled and
started outside CI), a real terminal's keypress handling (the interface was driven with scripted
keys, and the plain prompts were run through a pipe), and a link opened from a second device.

## 廣東話

呢個係托管版 WorldLens 嘅一鍵設定：一條命令（PowerShell 用 `irm ... -OutFile`，Linux／macOS 用
`curl ... -o`，再 `node worldlens-setup.mjs`），唔使再手寫 `docker run`、手動 hash 密碼、寫兩次
mount、揀 port 或者搵網絡地址。

喺終端機會開一個用方向鍵嘅介面：每條問題有預設值，打字時即時驗證，按 Esc 可以返轉頭；去到
覆核畫面你確認咗先會寫任何檔案，而且如果個檔唔係呢個 setup 自己整嘅，會逐行顯示分別。冇終端
機就用逐行問答（`<` 返轉頭）；`--yes` 就唔問，所有值由 flag 或者 `WORLDLENS_SETUP_*` 變數嚟。

密碼可以自動產生（約 99 bit）或者自己打兩次；**密碼永遠唔會寫入磁碟**，`.env` 同容器只收 SHA-256
hash，自動產生嗰個只會顯示一次。檔案喺支援嘅平台會設成 600。預設只畀呢部電腦開，揀咗「網絡」會
喺所有網卡公開個 port，所以唔好 forward 去互聯網。

跟住佢會檢查 Docker 同 Compose（冇就明講，**唔會幫你裝 Docker**），pull 固定 digest 嘅映像、啟動、
等最多 90 秒睇佢有冇答，然後印出已經試過嘅連結。呢個托管部署淨係得一個共用密碼，冇帳戶，所以
冇「第一個註冊嘅人做擁有者」或者設定碼呢樣嘢。

再行一次會保留舊答案同密碼，只改你要改嗰樣。已經有一個唔係呢個 setup 整嘅檔？預設唔會覆蓋，
會顯示分別先；無人值守嗰陣要加 `--overwrite`，否則 exit code 2。其他 exit code：3 係 Docker
用唔到（檔案已寫好）、4 係 pull／啟動／健康檢查失敗、130 係取消。

**未證實嘅嘢：** 冇喺 CI 以外真係 pull 過個映像再啟動；真終端機嘅按鍵處理只用腳本按鍵測過；
亦冇由第二部機試過個網絡連結。
