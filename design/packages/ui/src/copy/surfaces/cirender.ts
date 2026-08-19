/**
 * The GitHub runners screen: rendering a world on GitHub Actions instead of on this
 * computer, and everything that has to be true before a byte of it leaves the machine.
 *
 * The surface is unusual for this application in that almost nothing it reports is under
 * its own control. It uploads a world to somebody else's storage, asks somebody else's
 * runners to render it, and then watches. Three consequences run through every string
 * below and are worth stating once here rather than in a comment above each of them.
 *
 * ## A run's state is never rounded up
 *
 * `run.going` and `run.ended` interpolate GitHub's own `status` and `conclusion` words.
 * They are not translated, not tidied, and not summarised into "working" and "done":
 * `queued`, `in_progress`, `failure`, `cancelled` and `timed_out` are what the GitHub API
 * says and what the run page will say when the reader opens it. A level that turned
 * `conclusion: failure` into a cheerful "all wrapped up" would be lying about somebody
 * else's machine, which is the one thing this screen cannot afford to do.
 *
 * ## "Recorded" and "verified" are different words
 *
 * `cirender.recorded` exists because GitHub does not publish a checksum for every
 * artifact. When it does not, this application hashes what it downloaded and stores that
 * hash, which proves the file has not changed since; it does not prove the file is the one
 * the run built. Every level of that entry keeps both halves, and `SHA-256` stays spelled
 * exactly that way in Cantonese too.
 *
 * ## Two GitHub sign-ins, and the screen always says which one
 *
 * There is the application's own OAuth sign-in and there is the `gh` command-line tool,
 * and they fail independently: one can read a private repository the other cannot, and
 * either can be the credential that ends up doing the upload. `gh.*`, `route.other`,
 * `repository.unknown` and `repository.fallback` all name which of the two they are
 * talking about, at every level, because "signing in to GitHub" is not an instruction
 * somebody can act on when there are two places to do it.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CIRENDER_VOICED = {
    /* ---------------------------------------------------------------- */
    /* The empty list, before this screen has ever been used             */
    /* ---------------------------------------------------------------- */

    /*
     * The one sentence on this whole screen that says why anyone would want a render on
     * somebody else's computer at all, rather than the "Make a map" tab's local one. The
     * button's own label is quoted rather than paraphrased, in the language actually on
     * screen -- the English string quotes the English label, the Cantonese string quotes
     * the Cantonese one -- so the words in the sentence match the words on the button.
     */
    "cirender.list.empty": {
        en: [
            'This lists renders sent to GitHub\'s own computers instead of yours, useful for a big world or a computer you would rather not tie up for hours. Nothing has been sent yet; fill in the form above and press "Render on GitHub" to start one.',
            'This lists renders sent to GitHub\'s own computers instead of yours, useful for a big world or a computer you would rather not tie up for hours. Nothing has been sent yet; fill in the form above and press "Render on GitHub" to start one.',
            'This lists renders sent to GitHub\'s own computers instead of yours, useful for a big world or a computer you would rather not tie up for hours. Nothing has been sent yet, so fill in the form above and press "Render on GitHub" to start one.',
            'This lists renders handed off to GitHub\'s own computers instead of yours, worth it for a big world or a computer you cannot spare for hours. Nothing has been sent yet, so fill in the form above and press "Render on GitHub".',
            "This lists renders handed off to GitHub's own computers instead of yours, worth it for a big world or a computer you would rather not chain to a desk for hours. Nothing has been sent yet, so fill in the form above and press \"Render on GitHub\", and let somebody else's computer do the sweating.",
        ],
        yue: [
            "呢度會列出送咗去 GitHub 自己部機、而唔係喺你部機算嘅 render，啱晒個世界好大又或者唔想部機俾霸幾個鐘嘅時候用。而家仲未送過任何一個；喺上面填好張表，撳「喺 GitHub 度算圖」就開始。",
            "呢度會列出送咗去 GitHub 自己部機、而唔係喺你部機算嘅 render，啱晒個世界好大又或者唔想部機俾霸幾個鐘嘅時候用。而家仲未送過任何一個；喺上面填好張表，撳「喺 GitHub 度算圖」就開始。",
            "呢度會列出送咗去 GitHub 自己部機、而唔係喺你部機算嘅 render，啱晒個世界好大又或者唔想部機俾霸幾個鐘嘅時候用。而家仲未送過任何一個，喺上面填好張表，撳「喺 GitHub 度算圖」就得。",
            "呢度會列出送咗去 GitHub 自己部機算嘅 render，唔係喺你部機度算，啱晒個世界大到誇張，又或者唔捨得部機俾人霸幾個鐘。而家仲未送過任何一個，喺上面填好張表，撳返個「喺 GitHub 度算圖」掣。",
            "呢度會列出送咗去 GitHub 自己部機算嘅 render，唔係喺你部機度算，啱晒個世界大到癲，又或者唔捨得部機成日俾人綁住做苦力。而家仲未送過任何一個，喺上面填好張表，撳返個「喺 GitHub 度算圖」掣，等第二部機幫你捱義氣。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* What the check found: what will be sent, and how much of it       */
    /* ---------------------------------------------------------------- */

    /*
     * The two halves of the upload decision. `upload.none` is the reassuring one and is
     * exactly where a playful level is tempted to drop the asset name, which is the only
     * thing that lets somebody go and confirm the claim on the releases page.
     */
    "cirender.upload.none": {
        en: [
            "The world has not changed since it was uploaded as {asset}, so nothing will be sent.",
            "The world has not changed since it was uploaded as {asset}, so nothing will be sent.",
            "The world has not changed since it was uploaded as {asset}, so nothing will be sent this time.",
            "The world has not changed since it went up as {asset}, so nothing will be sent. That upload still counts.",
            "The world has not changed one block since it went up as {asset}, so nothing will be sent. GitHub already has it and is not asking twice.",
        ],
        yue: [
            "個世界喺上載成 {asset} 之後冇改過，所以唔會送任何嘢上去。",
            "個世界喺上載成 {asset} 之後冇改過，所以唔會送任何嘢上去。",
            "個世界喺上載成 {asset} 之後冇改過，所以今次唔會送任何嘢上去。",
            "個世界自從上載成 {asset} 之後冇改過，所以唔會送任何嘢上去。嗰次上載仲數得。",
            "個世界自從上載成 {asset} 之後一格都冇改過，所以唔會送任何嘢上去。GitHub 已經有份，唔會問你攞多次。",
        ],
    },
    "cirender.upload.needed": {
        en: [
            "About {size} will be uploaded to GitHub before anything is rendered.",
            "About {size} will be uploaded to GitHub before anything is rendered.",
            "About {size} will be uploaded to GitHub before anything is rendered at all.",
            "About {size} goes up to GitHub first. Nothing is rendered until all of it has arrived.",
            "About {size} has to climb all the way up to GitHub before a single tile is rendered, so put the kettle on.",
        ],
        yue: [
            "大約 {size} 會上載去 GitHub，之後先至開始算圖。",
            "大約 {size} 會上載去 GitHub，之後先至開始算圖。",
            "大約 {size} 會先上載去 GitHub，全部到齊之後先至開始算圖。",
            "大約 {size} 要先爬上 GitHub。未到齊之前唔會開始算圖。",
            "大約 {size} 要先慢慢爬上 GitHub，一格都未算圖住，可以去斟杯茶先。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The gh command-line tool, which is the second of the two sign-ins */
    /* ---------------------------------------------------------------- */

    /*
     * `gh auth login` asks for a device code interactively and cannot be driven from
     * inside this application. That clause is not an apology, it is the reason the reader
     * has to open a terminal themselves, so it survives level 5 in both languages.
     */
    "cirender.gh.missing": {
        en: [
            "The gh command-line tool is not on this computer, so it cannot be used as a second route. Install it from cli.github.com if you would rather render with it than with the sign-in here.",
            "The gh command-line tool is not on this computer, so it cannot be used as a second route. Install it from cli.github.com if you would rather render with it than with the sign-in here.",
            "The gh command-line tool is not on this computer, so there is no second route to fall back on. Install it from cli.github.com if you would rather render with it than with the sign-in here.",
            "No gh command-line tool on this computer, so the second route is not there to fall back on. Install it from cli.github.com if you would rather render with it than with the sign-in here.",
            "There is no gh command-line tool anywhere on this computer, so the second route is a door with no room behind it. Grab it from cli.github.com if you would rather render with it than with the sign-in here.",
        ],
        yue: [
            "呢部電腦冇 gh 命令列工具，所以佢做唔到第二條路。如果想用佢嚟算圖多過用呢度嘅登入，可以喺 cli.github.com 裝返。",
            "呢部電腦冇 gh 命令列工具，所以佢做唔到第二條路。如果想用佢嚟算圖多過用呢度嘅登入，可以喺 cli.github.com 裝返。",
            "呢部電腦冇 gh 命令列工具，所以根本冇第二條路可以退返。如果想用佢嚟算圖多過用呢度嘅登入，可以喺 cli.github.com 裝返。",
            "搵勻成部電腦都冇 gh 命令列工具，所以第二條路係冇得行。如果想用佢嚟算圖多過用呢度嘅登入，去 cli.github.com 裝返佢。",
            "成部電腦都搵唔到 gh 命令列工具，所以嗰條所謂第二條路，其實係一道冇房喺後面嘅門。想用佢嚟算圖多過用呢度嘅登入，就去 cli.github.com 執返佢返嚟。",
        ],
    },
    "cirender.gh.signedOut": {
        en: [
            "The gh command-line tool is installed but nobody is signed in to it. Run `gh auth login` in a terminal - it asks for a code interactively and cannot be driven from inside this application - then check again.",
            "The gh command-line tool is installed but nobody is signed in to it. Run `gh auth login` in a terminal - it asks for a code interactively and cannot be driven from inside this application - then check again.",
            "The gh command-line tool is installed but nobody is signed in to it. Run `gh auth login` in a terminal, since it asks for a code interactively and cannot be driven from inside this application, then check again.",
            "The gh command-line tool is here, but signed in as nobody. Run `gh auth login` in a terminal yourself: it asks for a code interactively and cannot be driven from inside this application. Then check again.",
            "The gh command-line tool turned up, took a seat, and signed in as absolutely nobody. Run `gh auth login` in a terminal yourself, because it asks for a code interactively and cannot be driven from inside this application, then check again.",
        ],
        yue: [
            "gh 命令列工具裝咗，但係冇人登入過。喺終端機行 `gh auth login` - 佢會即場問你攞驗證碼，冇辦法喺呢個程式入面代你做 - 然後再檢查一次。",
            "gh 命令列工具裝咗，但係冇人登入過。喺終端機行 `gh auth login` - 佢會即場問你攞驗證碼，冇辦法喺呢個程式入面代你做 - 然後再檢查一次。",
            "gh 命令列工具裝咗，但係冇人登入過。喺終端機行 `gh auth login`，因為佢會即場問你攞驗證碼，冇辦法喺呢個程式入面代你做，然後再檢查一次。",
            "gh 命令列工具喺度，不過登入嘅係「冇人」。自己喺終端機行 `gh auth login`：佢會即場問你攞驗證碼，呢個程式代你做唔到。做完再檢查一次。",
            "gh 命令列工具到咗場、坐低咗，然後以「冇人」嘅身分登入。麻煩自己喺終端機行 `gh auth login`，因為佢要即場問你攞驗證碼，呢個程式係代你做唔到㗎，之後再檢查一次。",
        ],
    },
    "cirender.gh.ready": {
        en: [
            "The gh command-line tool is installed and signed in.",
            "The gh command-line tool is installed and signed in.",
            "The gh command-line tool is installed and signed in, so it is available as a second route.",
            "The gh command-line tool is installed and signed in, and ready to be used as the second route.",
            "The gh command-line tool is installed, signed in, and standing by as the second route with nothing whatsoever to complain about.",
        ],
        yue: [
            "gh 命令列工具已經裝咗，亦都登入咗。",
            "gh 命令列工具已經裝咗，亦都登入咗。",
            "gh 命令列工具已經裝咗，亦都登入咗，可以做第二條路。",
            "gh 命令列工具已經裝咗、登入咗，隨時可以做第二條路。",
            "gh 命令列工具裝咗、登入咗，喺度企定定等做第二條路，冇一樣嘢好投訴。",
        ],
    },
    /*
     * The account and the host both matter and for different reasons: `{account}` is whose
     * repositories the run can reach, and `{host}` is whether this is github.com or a
     * GitHub Enterprise instance. Neither is decoration, so both are pinned.
     */
    "cirender.gh.readyAs": {
        en: [
            "The gh command-line tool is signed in as {account} on {host}.",
            "The gh command-line tool is signed in as {account} on {host}.",
            "The gh command-line tool is signed in as {account} on {host}, so that is the account it would use.",
            "The gh command-line tool is signed in as {account} on {host}. That is the account it would work as.",
            "The gh command-line tool is signed in as {account} on {host}, and that is exactly who it will be when it goes to work.",
        ],
        yue: [
            "gh 命令列工具而家以 {account} 嘅身分登入咗 {host}。",
            "gh 命令列工具而家以 {account} 嘅身分登入咗 {host}。",
            "gh 命令列工具而家以 {account} 嘅身分登入咗 {host}，即係佢會用呢個帳戶。",
            "gh 命令列工具而家以 {account} 嘅身分喺 {host} 登入咗。做嘢嗰陣就係用呢個帳戶。",
            "gh 命令列工具而家以 {account} 嘅身分喺 {host} 登入咗，開工嗰陣佢就係呢個人，冇第二個。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Why the button will not go yet                                    */
    /* ---------------------------------------------------------------- */

    /*
     * Everything from here to `blocked.public` renders under a disabled start button, so
     * each one has exactly one job: say which condition is unmet and what would satisfy
     * it. A level that is amusing about the block but vague about the remedy has made the
     * screen worse.
     */
    "cirender.unsupported": {
        en: [
            "The desktop application is what starts a CI render.",
            "The desktop application is what starts a CI render.",
            "A CI render is started by the desktop application, not from here.",
            "A CI render is started by the desktop application. This window can show one, but it cannot start one.",
            "A CI render only ever starts from the desktop application. This window is happy to sit and watch, but it does not have the button.",
        ],
        yue: [
            "CI 算圖係由桌面應用程式開始嘅。",
            "CI 算圖係由桌面應用程式開始嘅。",
            "CI 算圖要由桌面應用程式開始，唔係喺呢度開。",
            "CI 算圖要由桌面應用程式開始。呢個視窗睇得到，但係開唔到。",
            "CI 算圖淨係得桌面應用程式開得到。呢個視窗好樂意企喺度睇，不過粒掣真係唔喺佢手。",
        ],
    },
    "cirender.blocked.check": {
        en: [
            "Check the repository first.",
            "Check the repository first.",
            "Check the repository first, before anything is sent.",
            "Check the repository first. Nothing is sent until that check has run.",
            "Check the repository first. Nothing leaves this computer until that check has run, so the button is waiting on you.",
        ],
        yue: [
            "請先檢查個倉庫。",
            "請先檢查個倉庫。",
            "請先檢查個倉庫，之後先至送嘢上去。",
            "請先檢查個倉庫。未檢查完，一嚿嘢都唔會送出去。",
            "請先檢查個倉庫。未檢查完之前，一嚿嘢都唔會離開呢部電腦，所以粒掣而家等緊你。",
        ],
    },
    "cirender.blocked.eula": {
        en: [
            "Mojang's licence has not been accepted on this computer, and the render needs it.",
            "Mojang's licence has not been accepted on this computer, and the render needs it.",
            "Mojang's licence has not been accepted on this computer, and the render cannot go ahead without it.",
            "Mojang's licence has not been accepted on this computer. The render needs it, so it stops here.",
            "Mojang's licence has not been accepted on this computer. The render needs it, and no amount of staring at the button changes that.",
        ],
        yue: [
            "呢部電腦未接受過 Mojang 嘅授權條款，而算圖需要佢。",
            "呢部電腦未接受過 Mojang 嘅授權條款，而算圖需要佢。",
            "呢部電腦未接受過 Mojang 嘅授權條款，冇咗佢算圖行唔到。",
            "呢部電腦未接受過 Mojang 嘅授權條款。算圖要用到佢，所以到呢度停低。",
            "呢部電腦未接受過 Mojang 嘅授權條款。算圖真係要佢，望實粒掣望到出汗都唔會變。",
        ],
    },
    "cirender.blocked.large": {
        en: [
            "This world packs to about {size}, past what one GitHub release asset can hold.",
            "This world packs to about {size}, past what one GitHub release asset can hold.",
            "This world packs to about {size}, which is past what one GitHub release asset can hold.",
            "This world packs to about {size}. That is past what one GitHub release asset can hold, so it cannot go up as one.",
            "This world packs to about {size}, which sails clean past what one GitHub release asset can hold. It will not fit through that door in one piece.",
        ],
        yue: [
            "呢個世界壓縮之後大約 {size}，超出咗一個 GitHub release asset 載得起嘅上限。",
            "呢個世界壓縮之後大約 {size}，超出咗一個 GitHub release asset 載得起嘅上限。",
            "呢個世界壓縮之後大約 {size}，已經超出咗一個 GitHub release asset 載得起嘅上限。",
            "呢個世界壓縮之後大約 {size}。呢個數超出咗一個 GitHub release asset 載得起嘅上限，所以塞唔落一件。",
            "呢個世界壓縮之後大約 {size}，一飛就飛過咗一個 GitHub release asset 載得起嘅上限。想成嚿塞入去，道門真係唔夠闊。",
        ],
    },
    /*
     * "Neither" is the load-bearing word: somebody who reads this as "sign in to GitHub"
     * will sign in to the one they already have and be blocked again. The remedy names
     * both routes at every level.
     */
    "cirender.blocked.uploadRoute": {
        en: [
            "Neither GitHub sign-in on this computer can publish a world. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, then check again.",
            "Neither GitHub sign-in on this computer can publish a world. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, then check again.",
            "Neither GitHub sign-in on this computer can publish a world. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, and then check again.",
            "Neither GitHub sign-in on this computer can publish a world, so there is nothing here to upload with. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, then check again.",
            "Both GitHub sign-ins turned up empty handed: neither of them can publish a world. Sign in to GitHub from Settings, or run `gh auth login` in a terminal, then check again.",
        ],
        yue: [
            "呢部電腦上面兩個 GitHub 登入都冇能力發佈一個世界。請喺設定入面登入 GitHub，或者喺終端機行 `gh auth login`，然後再檢查一次。",
            "呢部電腦上面兩個 GitHub 登入都冇能力發佈一個世界。請喺設定入面登入 GitHub，或者喺終端機行 `gh auth login`，然後再檢查一次。",
            "呢部電腦上面兩個 GitHub 登入都冇能力發佈一個世界。請喺設定入面登入 GitHub，又或者喺終端機行 `gh auth login`，之後再檢查一次。",
            "呢部電腦上面兩個 GitHub 登入都冇能力發佈一個世界，即係根本冇嘢用嚟上載。喺設定入面登入 GitHub，或者喺終端機行 `gh auth login`，然後再檢查一次。",
            "兩個 GitHub 登入都到齊晒，可惜兩個都冇能力發佈一個世界。喺設定入面登入 GitHub，或者喺終端機行 `gh auth login`，然後再檢查一次。",
        ],
    },
    "cirender.blocked.upload": {
        en: [
            "Confirm that the world may be uploaded to GitHub.",
            "Confirm that the world may be uploaded to GitHub.",
            "Confirm that the world may be uploaded to GitHub before this starts.",
            "Confirm that the world may be uploaded to GitHub, by ticking the box above.",
            "Nothing moves until you confirm that the world may be uploaded to GitHub. The box above is the whole ceremony.",
        ],
        yue: [
            "請確認個世界可以上載去 GitHub。",
            "請確認個世界可以上載去 GitHub。",
            "請喺開始之前確認個世界可以上載去 GitHub。",
            "請剔咗上面個格，確認個世界可以上載去 GitHub。",
            "未確認個世界可以上載去 GitHub 之前，乜都唔會郁。上面個格剔一剔就係全部儀式。",
        ],
    },
    "cirender.blocked.public": {
        en: [
            "Confirm that you mean to publish this world publicly.",
            "Confirm that you mean to publish this world publicly.",
            "Confirm that you mean to publish this world publicly, where anybody could download it.",
            "Confirm that you mean to publish this world publicly. The repository is public, so anybody could download it.",
            "Confirm that you mean to publish this world publicly. The repository is public, which means anybody at all could download it, strangers included.",
        ],
        yue: [
            "請確認你係有心公開發佈呢個世界。",
            "請確認你係有心公開發佈呢個世界。",
            "請確認你係有心公開發佈呢個世界，任何人都下載得到。",
            "請確認你係有心公開發佈呢個世界。個倉庫係公開嘅，任何人都下載得到。",
            "請確認你係有心公開發佈呢個世界。個倉庫係公開嘅，即係全世界唔識你嘅人都下載得到。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The pitch, and the price of taking it                             */
    /* ---------------------------------------------------------------- */

    /*
     * These two are read together and only work as a pair. The pitch is allowed to be
     * enthusiastic because the caveats immediately below it are not, and every number and
     * limit in the caveats survives level 5 for that reason: the honest version of "let
     * somebody else's computer do it" is the one that also says what it costs.
     */
    "cirender.pitch": {
        en: [
            "Built for computers that cannot render a big world themselves. Your machine uploads the world and then waits; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one.",
            "Built for computers that cannot render a big world themselves. Your machine uploads the world and then waits; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one.",
            "Built for computers that cannot render a big world on their own. Your machine uploads the world and then waits; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one.",
            "For computers that cannot render a big world on their own. Your machine uploads the world and then puts its feet up; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one.",
            "Built for computers that cannot render a big world themselves, which is most of them. Your machine uploads the world and then puts its feet up; GitHub's runners do the rendering, split across as many parallel jobs as the world needs, and the finished map comes back and opens exactly like a local one, no asterisk.",
        ],
        yue: [
            "專登為咗啲自己算唔到大世界嘅電腦而整。你部機負責上載個世界，之後就等；算圖交俾 GitHub 嘅 runner 做，按個世界嘅需要拆成幾多個平行工作都得，算好嘅地圖會傳返嚟，開起上嚟同本機算嘅一模一樣。",
            "專登為咗啲自己算唔到大世界嘅電腦而整。你部機負責上載個世界，之後就等；算圖交俾 GitHub 嘅 runner 做，按個世界嘅需要拆成幾多個平行工作都得，算好嘅地圖會傳返嚟，開起上嚟同本機算嘅一模一樣。",
            "專登為咗啲自己算唔到大世界嘅電腦而整。你部機負責上載個世界，然後就喺度等；算圖交俾 GitHub 嘅 runner 做，按個世界嘅需要拆成幾多個平行工作都得，算好嘅地圖會傳返嚟，開起上嚟同本機算嘅一模一樣。",
            "專登為咗啲自己算唔到大世界嘅電腦而整。你部機上載完個世界就可以翹埋雙手；算圖交俾 GitHub 嘅 runner 做，按個世界嘅需要拆成幾多個平行工作都得，算好嘅地圖會傳返嚟，開起上嚟同本機算嘅一模一樣。",
            "專登為咗啲自己算唔到大世界嘅電腦而整，其實大部分電腦都係咁。你部機上載完個世界就可以翹埋雙手飲杯嘢；算圖交俾 GitHub 嘅 runner 做，按個世界嘅需要拆成幾多個平行工作都得，算好嘅地圖會傳返嚟，開起上嚟同本機算嘅一模一樣，冇任何細字。",
        ],
    },
    "cirender.caveats": {
        en: [
            "The trade-offs, plainly: uploading a multi-gigabyte world takes time and bandwidth; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
            "The trade-offs, plainly: uploading a multi-gigabyte world takes time and bandwidth; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
            "The trade-offs, said plainly: uploading a multi-gigabyte world takes time and bandwidth; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
            "The trade-offs, with nothing hidden: uploading a multi-gigabyte world takes time and bandwidth; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
            "The trade-offs, with nothing tucked under the rug: uploading a multi-gigabyte world takes time and bandwidth, plenty of both; GitHub's free Actions minutes are finite for private repositories, while public ones get unlimited standard-runner minutes; and a very large world can still exceed a job's budget or be too big to send as one release asset.",
        ],
        yue: [
            "老實講吓啲代價：上載一個幾 GB 嘅世界，好食時間同頻寬；私人倉庫嘅 GitHub 免費 Actions 分鐘係有限嘅，公開倉庫就有無限標準 runner 分鐘；仲有，一個好大嘅世界始終可能超出一個工作嘅預算，又或者大到送唔到做一個 release asset。",
            "老實講吓啲代價：上載一個幾 GB 嘅世界，好食時間同頻寬；私人倉庫嘅 GitHub 免費 Actions 分鐘係有限嘅，公開倉庫就有無限標準 runner 分鐘；仲有，一個好大嘅世界始終可能超出一個工作嘅預算，又或者大到送唔到做一個 release asset。",
            "老實講埋啲代價：上載一個幾 GB 嘅世界，好食時間同頻寬；私人倉庫嘅 GitHub 免費 Actions 分鐘係有限嘅，公開倉庫就有無限標準 runner 分鐘；仲有，一個好大嘅世界始終可能超出一個工作嘅預算，又或者大到送唔到做一個 release asset。",
            "有咩代價，一樣都唔收埋：上載一個幾 GB 嘅世界，好食時間同頻寬；私人倉庫嘅 GitHub 免費 Actions 分鐘係有限嘅，公開倉庫就有無限標準 runner 分鐘；仲有，一個好大嘅世界始終可能超出一個工作嘅預算，又或者大到送唔到做一個 release asset。",
            "有咩代價，一樣都唔掃入地氈底：上載一個幾 GB 嘅世界，好食時間同頻寬，兩樣都食得好交關；私人倉庫嘅 GitHub 免費 Actions 分鐘係有限嘅，公開倉庫就有無限標準 runner 分鐘；仲有，一個好大嘅世界始終可能超出一個工作嘅預算，又或者大到送唔到做一個 release asset。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Mojang's licence, which this application never accepts for anyone */
    /* ---------------------------------------------------------------- */

    /*
     * The last sentence is the one that matters and the one a playful rewrite would drop
     * as throat-clearing. Accepting a licence on somebody's behalf is the failure mode
     * this whole flow exists to avoid, so "will not accept it for you" is a pinned fact.
     */
    "cirender.eula": {
        en: [
            "The render workflow downloads a Minecraft client jar for its block models and textures, which needs Mojang's licence to have been accepted. This application will not accept it for you.",
            "The render workflow downloads a Minecraft client jar for its block models and textures, which needs Mojang's licence to have been accepted. This application will not accept it for you.",
            "The render workflow downloads a Minecraft client jar for its block models and textures, and that needs Mojang's licence to have been accepted. This application will not accept it for you.",
            "The render workflow downloads a Minecraft client jar for its block models and textures. That needs Mojang's licence to have been accepted, and this application will not accept it for you.",
            "The render workflow downloads a Minecraft client jar, because that is where the block models and textures live. That needs Mojang's licence to have been accepted, and this application will not accept it for you. Not a chance.",
        ],
        yue: [
            "算圖 workflow 會下載一個 Minecraft client jar 攞入面嘅方塊模型同貼圖，而呢件事需要你已經接受咗 Mojang 嘅授權條款。呢個程式唔會代你接受。",
            "算圖 workflow 會下載一個 Minecraft client jar 攞入面嘅方塊模型同貼圖，而呢件事需要你已經接受咗 Mojang 嘅授權條款。呢個程式唔會代你接受。",
            "算圖 workflow 會下載一個 Minecraft client jar 攞入面嘅方塊模型同貼圖，而呢樣嘢需要你事先接受咗 Mojang 嘅授權條款。呢個程式唔會代你接受。",
            "算圖 workflow 會下載一個 Minecraft client jar 攞入面嘅方塊模型同貼圖。呢樣嘢需要你事先接受咗 Mojang 嘅授權條款，而呢個程式唔會代你接受。",
            "算圖 workflow 要下載一個 Minecraft client jar，因為啲方塊模型同貼圖就係擺喺入面。呢樣嘢需要你事先接受咗 Mojang 嘅授權條款，而呢個程式唔會代你接受，一次都唔會。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Which credential read the repository, and which one could not     */
    /* ---------------------------------------------------------------- */

    /*
     * These two look similar and report opposite situations. `unknown` means nothing could
     * read the repository and therefore nothing is uploaded; `fallback` means something
     * could, just not the sign-in the reader would have assumed. Confusing them would have
     * somebody wait for an upload that already happened, or the reverse.
     */
    "cirender.repository.unknown": {
        en: [
            "Neither GitHub sign-in on this computer could read the repository, so whether it is public could not be checked. Nothing will be uploaded until one of them can.",
            "Neither GitHub sign-in on this computer could read the repository, so whether it is public could not be checked. Nothing will be uploaded until one of them can.",
            "Neither GitHub sign-in on this computer could read the repository, so whether it is public was never checked. Nothing will be uploaded until one of them can.",
            "Neither GitHub sign-in on this computer could read the repository, so whether it is public is still an open question. Nothing will be uploaded until one of them can.",
            "Neither GitHub sign-in on this computer could read the repository, so whether it is public is anybody's guess, and this app does not guess. Nothing will be uploaded until one of them can.",
        ],
        yue: [
            "呢部電腦上面兩個 GitHub 登入都讀唔到個倉庫，所以佢係咪公開，查唔到。要等到其中一個讀得到，先會上載任何嘢。",
            "呢部電腦上面兩個 GitHub 登入都讀唔到個倉庫，所以佢係咪公開，查唔到。要等到其中一個讀得到，先會上載任何嘢。",
            "呢部電腦上面兩個 GitHub 登入都讀唔到個倉庫，所以佢係咪公開，由頭到尾冇查過。要等到其中一個讀得到，先會上載任何嘢。",
            "呢部電腦上面兩個 GitHub 登入都讀唔到個倉庫，所以佢係咪公開，而家仍然係個未解嘅問題。要等到其中一個讀得到，先會上載任何嘢。",
            "呢部電腦上面兩個 GitHub 登入都讀唔到個倉庫，所以佢係咪公開，齋靠估，而呢個程式唔靠估。要等到其中一個讀得到，先會上載任何嘢。",
        ],
    },
    "cirender.repository.fallback": {
        en: [
            "This application's own GitHub sign-in could not read the repository, so the note above was read with the credential that will do the work instead.",
            "This application's own GitHub sign-in could not read the repository, so the note above was read with the credential that will do the work instead.",
            "This application's own GitHub sign-in could not read the repository, so the note above was read instead with the credential that will do the work.",
            "This application's own GitHub sign-in could not read the repository. The note above was read with the credential that will do the work instead.",
            "This application's own GitHub sign-in could not read the repository, so it stepped aside: the note above was read with the credential that will do the work instead.",
        ],
        yue: [
            "呢個程式自己嘅 GitHub 登入讀唔到個倉庫，所以上面嗰段係用會真正做嘢嗰個憑證讀返嚟。",
            "呢個程式自己嘅 GitHub 登入讀唔到個倉庫，所以上面嗰段係用會真正做嘢嗰個憑證讀返嚟。",
            "呢個程式自己嘅 GitHub 登入讀唔到個倉庫，所以上面嗰段改為用會真正做嘢嗰個憑證讀返嚟。",
            "呢個程式自己嘅 GitHub 登入讀唔到個倉庫。上面嗰段係用會真正做嘢嗰個憑證讀返嚟。",
            "呢個程式自己嘅 GitHub 登入讀唔到個倉庫，於是自動讓位：上面嗰段係用會真正做嘢嗰個憑證讀返嚟。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Complete configuration transport, and what is being agreed to    */
    /* ---------------------------------------------------------------- */

    "cirender.configCarried": {
        en: [
            "Every map setting is carried in {file} inside the world archive and applied by the runner, including the complete render mask.",
            "Every map setting is carried in {file} inside the world archive and applied by the runner, including the complete render mask.",
            "Every map setting travels in {file} inside the world archive and is applied by the runner, including the complete render mask.",
            "Every map setting rides inside the world archive in {file}; the runner applies all of it, including the complete render mask.",
            "Every map setting has a reserved seat inside the world archive in {file}; the runner applies the whole passenger list, including the complete render mask.",
        ],
        yue: [
            "每個地圖設定都會放喺世界壓縮檔入面嘅 {file}，由 runner 全部套用，包括完整 render mask。",
            "每個地圖設定都會放喺世界壓縮檔入面嘅 {file}，由 runner 全部套用，包括完整 render mask。",
            "每個地圖設定都會跟住 {file} 一齊入世界壓縮檔，再由 runner 全部套用，包括完整 render mask。",
            "每個地圖設定都坐住 {file} 入世界壓縮檔，runner 會成份套用，完整 render mask 都唔會甩車。",
            "每個地圖設定都有位坐喺世界壓縮檔入面嘅 {file}；runner 會照名單全部套用，完整 render mask 一個都唔會走雞。",
        ],
    },
    /*
     * Two checkbox labels rather than notices, and voiced anyway: each is a sentence the
     * reader is asserting about a consequence, which is exactly the kind of sentence a
     * funny level must not blur. "whole world folder" and "PUBLIC" are what is being
     * agreed to and neither moves.
     */
    "cirender.ack.upload": {
        en: [
            "I understand this uploads the whole world folder to GitHub.",
            "I understand this uploads the whole world folder to GitHub.",
            "I understand this uploads the whole world folder to GitHub, not a part of it.",
            "I understand this uploads the whole world folder to GitHub. All of it, not the interesting bits.",
            "I understand this uploads the whole world folder to GitHub. Every chunk, every region file, the lot.",
        ],
        yue: [
            "我明白呢個動作會將成個世界資料夾上載去 GitHub。",
            "我明白呢個動作會將成個世界資料夾上載去 GitHub。",
            "我明白呢個動作會將成個世界資料夾上載去 GitHub，唔係淨係一部分。",
            "我明白呢個動作會將成個世界資料夾上載去 GitHub。係全部，唔係揀啲精華。",
            "我明白呢個動作會將成個世界資料夾上載去 GitHub。每一個 chunk、每一個 region 檔，一個都跑唔甩。",
        ],
    },
    "cirender.ack.public": {
        en: [
            "I understand this repository is PUBLIC and anybody could download the world.",
            "I understand this repository is PUBLIC and anybody could download the world.",
            "I understand this repository is PUBLIC and anybody at all could download the world.",
            "I understand this repository is PUBLIC. Anybody could download the world, with no account needed.",
            "I understand this repository is PUBLIC. Anybody could download the world: friends, strangers, and search engines alike.",
        ],
        yue: [
            "我明白呢個倉庫係 PUBLIC，任何人都可以下載呢個世界。",
            "我明白呢個倉庫係 PUBLIC，任何人都可以下載呢個世界。",
            "我明白呢個倉庫係 PUBLIC，任何人都可以下載呢個世界，一個都攔唔到。",
            "我明白呢個倉庫係 PUBLIC。任何人都可以下載呢個世界，唔使有帳戶都得。",
            "我明白呢個倉庫係 PUBLIC。任何人都可以下載呢個世界：朋友、陌生人，連搜尋引擎都計埋。",
        ],
    },
    "cirender.force": {
        en: [
            "Upload again even if the world looks unchanged",
            "Upload again even if the world looks unchanged",
            "Upload again even if the world looks unchanged from here",
            "Upload again even if the world looks unchanged, and skip the comparison",
            "Upload again even if the world looks unchanged, because sometimes the comparison is the thing that is wrong",
        ],
        yue: [
            "就算個世界睇落冇改過，都照上載多次",
            "就算個世界睇落冇改過，都照上載多次",
            "就算個世界喺呢度睇落冇改過，都照上載多次",
            "就算個世界睇落冇改過都照上載多次，直接唔比對",
            "就算個世界睇落冇改過都照上載多次，因為有時錯嘅係嗰個比對",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Publishing the finished map to Pages                              */
    /* ---------------------------------------------------------------- */

    /*
     * `pages.explain` carries the one thing somebody could get badly wrong: a private
     * repository does not make a published map private. It is a link anybody can follow.
     * That clause, and `/map/` as the literal path, survive every level.
     */
    "cirender.pages.publish": {
        en: [
            "Also host the finished map on this repository's GitHub Pages site",
            "Also host the finished map on this repository's GitHub Pages site",
            "Also host the finished map on this repository's GitHub Pages site, so it has a link",
            "Also host the finished map on this repository's GitHub Pages site, so there is a link to send people",
            "Also host the finished map on this repository's GitHub Pages site, so the map gets an address instead of living in a zip",
        ],
        yue: [
            "順便將算好嘅地圖放喺呢個倉庫嘅 GitHub Pages 網站度",
            "順便將算好嘅地圖放喺呢個倉庫嘅 GitHub Pages 網站度",
            "順便將算好嘅地圖放喺呢個倉庫嘅 GitHub Pages 網站度，等佢有條link",
            "順便將算好嘅地圖放喺呢個倉庫嘅 GitHub Pages 網站度，咁就有條link可以send俾人",
            "順便將算好嘅地圖放喺呢個倉庫嘅 GitHub Pages 網站度，等張地圖有個地址，唔使匿埋喺個 zip 入面",
        ],
    },
    "cirender.pages.explain": {
        en: [
            "The map is published under the documentation site at /map/, so publishing it does not take that site down. Anybody with the link can see the map, whether or not the repository is private.",
            "The map is published under the documentation site at /map/, so publishing it does not take that site down. Anybody with the link can see the map, whether or not the repository is private.",
            "The map is published under the documentation site at /map/, so publishing it does not knock that site offline. Anybody with the link can see the map, whether or not the repository is private.",
            "The map goes up under the documentation site at /map/, so the documentation site stays exactly where it is. Anybody with the link can see the map, whether or not the repository is private.",
            "The map goes up under the documentation site at /map/, so the documentation site keeps its own front door and nobody gets evicted. Anybody with the link can see the map, whether or not the repository is private.",
        ],
        yue: [
            "張地圖會發佈喺文件網站下面嘅 /map/，所以發佈佢唔會令嗰個網站落線。任何人有條link都睇到張地圖，唔理個倉庫係咪私人嘅。",
            "張地圖會發佈喺文件網站下面嘅 /map/，所以發佈佢唔會令嗰個網站落線。任何人有條link都睇到張地圖，唔理個倉庫係咪私人嘅。",
            "張地圖會發佈喺文件網站下面嘅 /map/，所以發佈佢唔會撞跌嗰個網站。任何人有條link都睇到張地圖，唔理個倉庫係咪私人嘅。",
            "張地圖會擺喺文件網站下面嘅 /map/，所以文件網站原封不動咁留喺度。任何人有條link都睇到張地圖，唔理個倉庫係咪私人嘅。",
            "張地圖會擺喺文件網站下面嘅 /map/，文件網站繼續守住自己道大門，冇人俾人趕走。任何人有條link都睇到張地圖，唔理個倉庫係咪私人嘅。",
        ],
    },
    "cirender.pages.parts": {
        en: [
            "A world too large to assemble on one runner is delivered in parts instead, and a map in parts cannot be hosted this way. The run says so plainly and the map is still downloadable.",
            "A world too large to assemble on one runner is delivered in parts instead, and a map in parts cannot be hosted this way. The run says so plainly and the map is still downloadable.",
            "A world too large to assemble on one runner is delivered in parts instead, and a map in parts cannot be hosted this way. The run says so plainly, and the map is still downloadable.",
            "A world too large to assemble on one runner comes back in parts instead, and a map in parts cannot be hosted this way. The run says so plainly, and the map is still downloadable.",
            "A world too large to assemble on one runner comes back in parts instead, and a map in parts cannot be hosted this way however politely you ask. The run says so plainly, and the map is still downloadable.",
        ],
        yue: [
            "一個大到冇辦法喺一部 runner 上面砌返埋嘅世界，會改為分件送返嚟，而分咗件嘅地圖係唔可以用呢個方法host嘅。個 run 會明明白白講出嚟，張地圖亦都仲下載得到。",
            "一個大到冇辦法喺一部 runner 上面砌返埋嘅世界，會改為分件送返嚟，而分咗件嘅地圖係唔可以用呢個方法host嘅。個 run 會明明白白講出嚟，張地圖亦都仲下載得到。",
            "一個大到冇辦法喺一部 runner 上面砌返埋嘅世界，會改為分件送返嚟；分咗件嘅地圖係唔可以用呢個方法host嘅。個 run 會明明白白講出嚟，張地圖亦都仲下載得到。",
            "一個大到冇辦法喺一部 runner 上面砌返埋嘅世界，會分件送返嚟；分咗件嘅地圖係唔可以用呢個方法host嘅。個 run 會明明白白講出嚟，張地圖亦都仲下載得到。",
            "一個大到冇辦法喺一部 runner 上面砌返埋嘅世界，會分件送返嚟；分咗件嘅地圖係唔可以用呢個方法host嘅，點求都冇用。個 run 會明明白白講出嚟，張地圖亦都仲下載得到。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* When it is over                                                   */
    /* ---------------------------------------------------------------- */

    /*
     * `recorded` is the one entry on this screen where a single word is the whole message.
     * Hashing what arrived proves the file has not changed since it was downloaded; it
     * does not prove the file is the one the run built, because GitHub published nothing
     * to compare it against. "recorded rather than verified" is therefore pinned in both
     * languages, and `SHA-256` keeps its spelling in the Cantonese.
     */
    "cirender.done": {
        en: [
            "{map} is in the map list, rendered on GitHub.",
            "{map} is in the map list, rendered on GitHub.",
            "{map} is now in the map list, rendered on GitHub.",
            "{map} is in the map list, rendered on GitHub rather than here.",
            "{map} is in the map list, rendered on GitHub while this computer sat and watched.",
        ],
        yue: [
            "{map} 已經喺地圖清單入面，係喺 GitHub 度算出嚟嘅。",
            "{map} 已經喺地圖清單入面，係喺 GitHub 度算出嚟嘅。",
            "{map} 而家已經喺地圖清單入面，係喺 GitHub 度算出嚟嘅。",
            "{map} 已經喺地圖清單入面，係喺 GitHub 度算出嚟，唔係喺呢部機。",
            "{map} 已經喺地圖清單入面，係喺 GitHub 度算出嚟，呢部機由頭到尾坐喺度睇住。",
        ],
    },
    "cirender.recorded": {
        en: [
            "GitHub published no checksum for the artifact, so its SHA-256 was recorded rather than verified.",
            "GitHub published no checksum for the artifact, so its SHA-256 was recorded rather than verified.",
            "GitHub published no checksum for the artifact, so its SHA-256 was recorded rather than verified against anything.",
            "GitHub published no checksum for the artifact. Its SHA-256 was recorded rather than verified, which is a weaker claim.",
            "GitHub published no checksum for the artifact, so there was nothing to compare against. Its SHA-256 was recorded rather than verified, and those two are not the same word.",
        ],
        yue: [
            "GitHub 冇為呢個 artifact 公佈過 checksum，所以佢個 SHA-256 只係記錄咗，唔算驗證過。",
            "GitHub 冇為呢個 artifact 公佈過 checksum，所以佢個 SHA-256 只係記錄咗，唔算驗證過。",
            "GitHub 冇為呢個 artifact 公佈過 checksum，所以佢個 SHA-256 只係記錄咗，冇同任何嘢對過，唔算驗證過。",
            "GitHub 冇為呢個 artifact 公佈過 checksum。佢個 SHA-256 只係記錄咗，唔算驗證過，呢兩樣係有分別嘅。",
            "GitHub 冇為呢個 artifact 公佈過 checksum，即係根本冇嘢好對。佢個 SHA-256 只係記錄咗，唔算驗證過，兩個詞唔可以當同一個用。",
        ],
    },
    /* ---------------------------------------------------------------- */
    /* The guided "What, and where" card: nobody has to know what to type */
    /* ---------------------------------------------------------------- */

    /*
     * The account picker's own signed-out state, distinct from the owner picker's below:
     * this one is about who the render authenticates as at all, not about which login or
     * organisation it publishes under. Same rule as every signed-out message on this card -
     * it names the remedy and points at the sign-in row that already exists.
     */
    "cirender.account.signedOut": {
        en: [
            "Nobody is signed in to GitHub, so there is no account to render as. Sign in from Settings.",
            "Nobody is signed in to GitHub, so there is no account to render as. Sign in from Settings.",
            "Nobody is signed in to GitHub yet, so there is no account to render as. Sign in from Settings.",
            "Nobody is signed in to GitHub, so there is nobody this render could run as. Sign in from Settings to add one.",
            "Nobody is signed in to GitHub at all, so there is nobody this render could possibly run as. Sign in from Settings, and this picker will suddenly have something to say.",
        ],
        yue: [
            "冇人登入咗 GitHub，所以冇帳戶可以用嚟算圖。請喺設定入面登入。",
            "冇人登入咗 GitHub，所以冇帳戶可以用嚟算圖。請喺設定入面登入。",
            "冇人登入咗 GitHub，所以暫時冇帳戶可以用嚟算圖。請喺設定入面登入。",
            "冇人登入咗 GitHub，所以呢次算圖搵唔到人做。喺設定入面登入一個先。",
            "成個 GitHub 都冇人登入，所以呢次算圖真係搵唔到人頂替。快啲喺設定入面登入，呢個揀帳戶掣先有嘢好揀。",
        ],
    },
    /*
     * `gh auth switch` changes the command-line tool's machine-wide active account; it is
     * not scoped to this render card. Every level keeps both the scope and the lasting
     * consequence so choosing a playful voice can never make the warning less actionable.
     */

    /*
     * Signed out is not a dead end: it says so, and it points at the sign-in row that
     * already exists rather than inventing a second one. That clause survives every level.
     */
    "cirender.owner.signedOut": {
        en: [
            "Nobody is signed in to GitHub, so there is no list of accounts to choose from. Sign in from Settings, or type the owner directly below.",
            "Nobody is signed in to GitHub, so there is no list of accounts to choose from. Sign in from Settings, or type the owner directly below.",
            "Nobody is signed in to GitHub, so there is no list of accounts to choose from yet. Sign in from Settings, or type the owner directly below.",
            "Nobody is signed in to GitHub, so this cannot list your accounts. Sign in from Settings, or just type the owner directly below.",
            "Nobody is signed in to GitHub, so there is no account list to offer, only a blank where one should be. Sign in from Settings, or type the owner directly below - the field never minded either way.",
        ],
        yue: [
            "冇人登入咗 GitHub，所以冇帳戶清單俾你揀。可以喺設定入面登入，或者直接喺下面打個擁有者。",
            "冇人登入咗 GitHub，所以冇帳戶清單俾你揀。可以喺設定入面登入，或者直接喺下面打個擁有者。",
            "冇人登入咗 GitHub，所以暫時冇帳戶清單俾你揀。可以喺設定入面登入，或者直接喺下面打個擁有者。",
            "冇人登入咗 GitHub，所以呢度列唔到你嘅帳戶。喺設定入面登入啦，又或者直接喺下面打個擁有者。",
            "冇人登入咗 GitHub，所以連個帳戶清單都冇得列，得返一格空白。喺設定入面登入，又或者直接喺下面打個擁有者－呢個欄從來都唔介意邊種。",
        ],
    },

    /*
     * The three GitHub naming-rule refusals. Each one names the exact rule broken, because
     * "invalid name" alone sends somebody back to guess which character was the problem.
     */
    "cirender.repo.invalid.chars": {
        en: [
            "Repository names may only use letters, digits, dots, hyphens and underscores.",
            "Repository names may only use letters, digits, dots, hyphens and underscores.",
            "Repository names may only use letters, digits, dots, hyphens and underscores - nothing else.",
            "GitHub only accepts letters, digits, dots, hyphens and underscores in a repository name. Everything else gets refused.",
            "GitHub is fussy about this one: letters, digits, dots, hyphens and underscores only. Spaces, slashes and emoji all get shown the door.",
        ],
        yue: [
            "倉庫名淨係可以用英文字母、數字、句號、連字號同底線。",
            "倉庫名淨係可以用英文字母、數字、句號、連字號同底線。",
            "倉庫名淨係可以用英文字母、數字、句號、連字號同底線，第啲一律唔得。",
            "GitHub 淨係收英文字母、數字、句號、連字號同底線做倉庫名，第啲字符一律拒收。",
            "GitHub 呢方面幾揀擇：淨係要英文字母、數字、句號、連字號同底線。空格、斜線、表情符號，全部企喺門口入唔到嚟。",
        ],
    },
    "cirender.repo.invalid.dots": {
        en: [
            'A repository name cannot be just "." or "..".',
            'A repository name cannot be just "." or "..".',
            'A repository name cannot be just "." or "..", on their own.',
            'GitHub refuses a repository name that is only "." or "..". Add something else to it.',
            'A repository named only "." or ".." is the one GitHub always refuses, no matter how politely it is asked. Add something else to it.',
        ],
        yue: [
            "倉庫名唔可以淨係得「.」或者「..」。",
            "倉庫名唔可以淨係得「.」或者「..」。",
            "倉庫名唔可以齋係「.」或者「..」呢啲。",
            "GitHub 唔收淨係「.」或者「..」嘅倉庫名，加多啲字先得。",
            "淨係「.」或者「..」嘅倉庫名，GitHub 點求都唔收，加多啲其他字先得。",
        ],
    },
    "cirender.repo.invalid.gitSuffix": {
        en: [
            'A repository name cannot end in ".git".',
            'A repository name cannot end in ".git".',
            'A repository name cannot end in ".git" - GitHub adds that itself.',
            'GitHub refuses a repository name ending in ".git", because it adds that suffix itself when cloning.',
            'Ending a repository name in ".git" is redundant twice over: GitHub refuses it, and it would have added that suffix for you anyway.',
        ],
        yue: [
            "倉庫名唔可以以「.git」結尾。",
            "倉庫名唔可以以「.git」結尾。",
            "倉庫名唔可以以「.git」結尾－呢個位 GitHub 自己會加。",
            "GitHub 唔收以「.git」結尾嘅倉庫名，因為 clone 嘅時候佢自己會加返呢個尾巴。",
            "倉庫名以「.git」結尾係多此一舉：GitHub 唔收，而且本身 clone 嗰陣佢都會自動幫你加返。",
        ],
    },
    "cirender.repo.invalid.long": {
        en: [
            "A repository name cannot be longer than 100 characters.",
            "A repository name cannot be longer than 100 characters.",
            "A repository name cannot be longer than 100 characters - GitHub's own limit.",
            "GitHub caps a repository name at 100 characters, so this one needs trimming down.",
            "100 characters is GitHub's hard ceiling for a repository name, and this one is standing on tiptoe past it. Trim it down.",
        ],
        yue: [
            "倉庫名唔可以長過 100 個字。",
            "倉庫名唔可以長過 100 個字。",
            "倉庫名唔可以長過 100 個字－呢個係 GitHub 自己嘅上限。",
            "GitHub 規定倉庫名最多 100 個字，呢個要剪短啲先得。",
            "100 個字係 GitHub 定死嘅上限，呢個名踮起腳都仲係超咗，要剪短少少。",
        ],
    },

    /*
     * The live availability read. "recorded rather than verified" above kept two claims
     * apart; this keeps three apart, because guessing `available` from a failed check is
     * how somebody loses the minute they spent typing a name that was never actually free.
     */
    "cirender.repo.available": {
        en: [
            "{owner}/{repo} is free on GitHub.",
            "{owner}/{repo} is free on GitHub.",
            "{owner}/{repo} is free on GitHub, as far as this check could tell.",
            "{owner}/{repo} came back free on GitHub. Nobody else has claimed it.",
            "{owner}/{repo} is free on GitHub and clear for the taking - go ahead and put your name on it.",
        ],
        yue: [
            "{owner}/{repo} 喺 GitHub 度未有人用。",
            "{owner}/{repo} 喺 GitHub 度未有人用。",
            "就呢次檢查嚟講，{owner}/{repo} 喺 GitHub 度未有人用。",
            "{owner}/{repo} 查完出嚟係未有人用，仲有排得閒。",
            "{owner}/{repo} 喺 GitHub 度乾乾淨淨未有人用－可以放心攞嚟做你嘅。",
        ],
    },
    "cirender.repo.taken": {
        en: [
            "{owner}/{repo} already exists on GitHub.",
            "{owner}/{repo} already exists on GitHub.",
            "{owner}/{repo} already exists on GitHub. Pick a different name, or use that repository on purpose.",
            "{owner}/{repo} already exists on GitHub as a repository, so this name will need to change unless that one is the point.",
            "{owner}/{repo} already exists on GitHub and is spoken for. Either that was the plan all along, or this name needs a rethink.",
        ],
        yue: [
            "{owner}/{repo} 喺 GitHub 度已經有咗。",
            "{owner}/{repo} 喺 GitHub 度已經有咗。",
            "{owner}/{repo} 喺 GitHub 度已經有咗。換個名，定係想用返嗰個倉庫都得。",
            "{owner}/{repo} 喺 GitHub 度已經有咗，係嗰度嘅一個倉庫，如果唔係有心用返嗰個，就要改個名。",
            "{owner}/{repo} 喺 GitHub 度已經有咗，早就俾人攞咗。除非本身就係想用嗰個，唔係就要諗過個名。",
        ],
    },
    "cirender.repo.unknown": {
        en: [
            "Could not check whether that name is free: {message}",
            "Could not check whether that name is free: {message}",
            "Could not check whether that name is free this time: {message}",
            "Could not check whether that name is free this time: {message}. Nothing else about it can be said yet.",
            "Could not check whether that name is free this time: {message}. GitHub was not talking - try the check again in a moment.",
        ],
        yue: [
            "查唔到呢個名係咪得閒：{message}",
            "查唔到呢個名係咪得閒：{message}",
            "呢個名係咪得閒，今次查唔到：{message}",
            "今次查唔到呢個名係咪得閒：{message}，其他嘢都未講得。",
            "今次查唔到呢個名係咪得閒：{message}。GitHub 呢次唔出聲，過陣再檢查多次啦。",
        ],
    },

    /*
     * Picked from "One of your repositories", not typed: a first-class, already-valid
     * state, and one that must never be confused with the create-path checks above. Where
     * `cirender.repo.available`/`.taken` describe a *typed* name's fate on GitHub, this one
     * describes a choice that has already been made, and there is nothing left to check.
     */
    "cirender.repo.selected": {
        en: [
            "{owner}/{repo} is one of your own repositories, picked from the list above.",
            "{owner}/{repo} is one of your own repositories, picked from the list above.",
            "{owner}/{repo} is one of your own repositories, picked from the list above rather than typed.",
            "{owner}/{repo} came from the list above, one of your own repositories - nothing to check, it is already yours.",
            "{owner}/{repo} came straight off the list above, one of your own repositories - there is nothing here to check, only to use.",
        ],
        yue: [
            "{owner}/{repo} 係你自己其中一個倉庫，喺上面個列表度揀返嚟嘅。",
            "{owner}/{repo} 係你自己其中一個倉庫，喺上面個列表度揀返嚟嘅。",
            "{owner}/{repo} 係你自己其中一個倉庫，喺上面個列表度揀返嚟，唔係打出嚟嘅。",
            "{owner}/{repo} 係喺上面個列表度揀嘅，本身就係你自己個倉庫 - 冇嘢好check，本來就係你嘅。",
            "{owner}/{repo} 直接喺上面個列表攞返嚟，本身就係你自己個倉庫 - 呢度冇嘢好check，淨係攞嚟用。",
        ],
    },

    /*
     * The two situations "no route can dispatch yet" used to answer with the same alarming
     * message: an existing repository nobody has set up for CI rendering, and a name that
     * may not exist yet at all. Read together with `cirender.readiness.missing` below, and
     * kept apart deliberately - confusing "not set up" with "cannot be reached" sends
     * somebody who just confirmed a free name looking for a permission problem that was
     * never there.
     */
    "cirender.readiness.exists": {
        en: [
            "{owner}/{repo} exists and this credential can write to it, but it is not set up for a GitHub render yet - it has no render workflow. Setting it up is the next step, not a sign-in problem.",
            "{owner}/{repo} exists and this credential can write to it, but it is not set up for a GitHub render yet - it has no render workflow. Setting it up is the next step, not a sign-in problem.",
            "{owner}/{repo} exists, and this credential can write to it, but it is not set up for a GitHub render yet - it has no render workflow. Setting it up is the next step, not a sign-in problem.",
            "{owner}/{repo} exists and is writable, but it is not set up for a GitHub render yet - it has no render workflow. Setting it up is next; nothing here is a sign-in problem.",
            "{owner}/{repo} exists, is perfectly writable, and is simply not set up for a GitHub render yet - it has no render workflow. Setting it up is the whole of what is left; nothing here is a sign-in problem.",
        ],
        yue: [
            "{owner}/{repo} 係存在嘅，呢個憑證亦都寫得入去，不過未設定做 GitHub 算圖 - 冇 render workflow。下一步係去設定，唔係登入出問題。",
            "{owner}/{repo} 係存在嘅，呢個憑證亦都寫得入去，不過未設定做 GitHub 算圖 - 冇 render workflow。下一步係去設定，唔係登入出問題。",
            "{owner}/{repo} 存在，呢個憑證亦都寫得入去，不過未設定做 GitHub 算圖 - 冇 render workflow。下一步係去設定，呢度冇任何登入問題。",
            "{owner}/{repo} 存在，亦寫得入去，淨係未設定做 GitHub 算圖 - 冇 render workflow。下一步就係去設定，唔係憑證出咗事。",
            "{owner}/{repo} 實實在在存在，亦寫得入去，淨係未設定做 GitHub 算圖 - 冇 render workflow。剩返嘅就係去設定；呢度絕對唔係登入問題。",
        ],
    },
    "cirender.readiness.missing": {
        en: [
            "{owner}/{repo} may not exist yet. If that name is free, creating it and setting it up is the next step; if it already exists privately, check that the signed-in account can see it.",
            "{owner}/{repo} may not exist yet. If that name is free, creating it and setting it up is the next step; if it already exists privately, check that the signed-in account can see it.",
            "{owner}/{repo} may not exist yet. If that name is free, creating it and setting it up is the next step; if it already exists privately, check that the signed-in account can see it.",
            "{owner}/{repo} may not exist yet, and that is the ordinary case. If the name is free, creating it and setting it up is what comes next; a private repository this account cannot see would look the same, so check that too.",
            "{owner}/{repo} may not exist yet, and probably that is all this is. If the name is free, creating it and setting it up is next; the one other explanation is a private repository this account cannot see, so check that too.",
        ],
        yue: [
            "{owner}/{repo} 可能仲未存在。如果個名得閒，下一步就係整個出嚟再設定好；如果佢其實已經係私人倉庫，就check下呢個已登入帳戶睇唔睇到。",
            "{owner}/{repo} 可能仲未存在。如果個名得閒，下一步就係整個出嚟再設定好；如果佢其實已經係私人倉庫，就check下呢個已登入帳戶睇唔睇到。",
            "{owner}/{repo} 好可能仲未存在。如果個名得閒，下一步就係整個出嚟再設定好；如果佢其實已經係私人倉庫，就check下呢個已登入帳戶睇唔睇到。",
            "{owner}/{repo} 可能仲未存在，呢個都算正常。如果個名得閒，跟住就整個出嚟再設定；仲有一個可能係佢係個私人倉庫、呢個帳戶睇唔到，都值得check埋。",
            "{owner}/{repo} 可能仲未存在，十居其九淨係咁解。如果個名得閒，跟住就係整個出嚟再設定好；唯一另一個可能係私人倉庫、呢個帳戶睇唔到，都check多次啦。",
        ],
    },

    /*
     * The Check button, disabled and named exactly which field is missing - the same
     * discipline `blocked.*` above already holds the Render button to.
     */
    "cirender.checkBlocked.world": {
        en: [
            "Choose a world folder before checking.",
            "Choose a world folder before checking.",
            "Choose a world folder before checking the repository.",
            "Choose a world folder before checking - there is nothing to check the repository against yet.",
            "Choose a world folder before checking - the repository check has nothing to compare against otherwise.",
        ],
        yue: [
            "請先揀個世界資料夾，先至可以檢查。",
            "請先揀個世界資料夾，先至可以檢查。",
            "請先揀個世界資料夾，先至可以檢查個倉庫。",
            "請先揀個世界資料夾，先至可以檢查－而家都未有嘢可以用嚟同個倉庫對比。",
            "請先揀個世界資料夾，先至可以檢查－唔係嘅話，個倉庫檢查根本冇嘢好對比。",
        ],
    },
    "cirender.checkBlocked.owner": {
        en: [
            "Choose or type a repository owner before checking.",
            "Choose or type a repository owner before checking.",
            "Choose or type a repository owner before checking the repository.",
            "Choose a repository owner from the list, or type one, before checking.",
            "Pick a repository owner from the list, or type one in, before checking - the check has nowhere to look without it.",
        ],
        yue: [
            "請先揀或者打一個倉庫擁有者，先至可以檢查。",
            "請先揀或者打一個倉庫擁有者，先至可以檢查。",
            "請先揀或者打一個倉庫擁有者，先至可以檢查個倉庫。",
            "喺清單度揀個倉庫擁有者，或者自己打一個，先至可以檢查。",
            "喺清單度揀個倉庫擁有者，又或者自己打返一個，先至可以檢查－冇呢樣嘢，檢查根本唔知去邊度睇。",
        ],
    },
    "cirender.checkBlocked.repo": {
        en: [
            "Choose or type a repository name before checking.",
            "Choose or type a repository name before checking.",
            "Choose or type a repository name before checking the repository.",
            "Choose a repository name from the list, or type one, before checking.",
            "Pick a repository name from the list, or type one, before checking - the check has nothing to look up without it.",
        ],
        yue: [
            "請先揀或者打一個倉庫名，先至可以檢查。",
            "請先揀或者打一個倉庫名，先至可以檢查。",
            "請先揀或者打一個倉庫名，先至可以檢查個倉庫。",
            "喺清單度揀個倉庫名，或者自己打一個，先至可以檢查。",
            "喺清單度揀個倉庫名，又或者自己打返一個，先至可以檢查－冇呢樣嘢，檢查都唔知查邊個。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Scheduled re-rendering: checking on a cadence, rendering only     */
    /* when something actually changed. See docs/scheduled-render.md.   */
    /* ---------------------------------------------------------------- */

    /*
     * The section's own explanation, read once when somebody opens it. The cost claim is
     * deliberately about *frequency*, never a made-up runner-minute figure - `{count}` is
     * the exact monthly check count `describeCadenceCost` computes, and every level keeps
     * that number rather than rounding it away for a punchier sentence.
     */
    "cirender.schedule.help": {
        en: [
            "Checks this world for changes about {count} times a month, and only starts a render when it actually finds one. A check reads a small amount of metadata, never the world itself, so it costs very little however often it runs.",
            "Checks this world for changes about {count} times a month, and only starts a render when it actually finds one. A check reads a small amount of metadata, never the world itself, so it costs very little however often it runs.",
            "Checks this world for changes about {count} times a month, and only starts a render when it actually finds one. A check reads a small amount of metadata rather than the world itself, so checking costs very little whatever the cadence.",
            "Checks about {count} times a month, and only spends real GitHub Actions minutes when a real change turns up. A check reads a little metadata, never the world itself, so the cadence barely moves the cost.",
            "Checks about {count} times a month and only bothers GitHub's runners when a real change actually turns up, since a check itself reads a scrap of metadata, never downloads the world, so dialling the cadence up costs you almost nothing but a few extra glances.",
        ],
        yue: [
            "呢個世界大約每個月 check {count} 次，搵到真係有改過先至會開始 render。check 淨係讀一小撮 metadata，唔會掂個世界本身，所以就算 check 得幾密都幾乎唔使錢。",
            "呢個世界大約每個月 check {count} 次，搵到真係有改過先至會開始 render。check 淨係讀一小撮 metadata，唔會掂個世界本身，所以就算 check 得幾密都幾乎唔使錢。",
            "呢個世界大約每個月 check {count} 次，搵到真係有改過先至會開始 render。check 淨係讀一小撮 metadata，唔會掂個世界本身，所以密啲 check 都好平。",
            "大約每個月 check {count} 次，搵到真係有嘢改過先會真金白銀去洗 GitHub Actions 嘅分鐘數。check 本身淨係讀返少少 metadata，唔會落去載個世界，所以 check 得密唔密，成本都冇乜分別。",
            "大約每個月 check {count} 次，搵到真係有嘢改過先至會勞煩 GitHub 啲 runner 出手，畢竟 check 本身就淨係睇少少 metadata，一格都唔會落去 load 個世界，所以你想 check 幾密都得，唔多過幾眼咁大把嘢。",
        ],
    },

    /*
     * One check's own outcome, shown beside "Last checked". Never guesses in either
     * direction: "unknown" states plainly that nothing comparable was available. Each
     * level keeps one exact phrase - what {@link CIRENDER_FACTS} pins below - so the fact
     * itself never moves even while the sentence around it gets more playful.
     */
    "cirender.schedule.result.changed": {
        en: [
            "the world had changed, so a render was started",
            "the world had changed, so a render was started",
            "the world had genuinely changed, so a render was started",
            "something had genuinely changed, so a render was started",
            "something had absolutely, unmistakably changed, so a render was started - no dawdling",
        ],
        yue: [
            "個世界改過，所以 render 已經開始咗",
            "個世界改過，所以 render 已經開始咗",
            "個世界真係改過，所以 render 已經開始咗",
            "真係有嘢改過，所以 render 已經開始咗",
            "真係實實在在改過，一格都走唔甩，所以 render 已經開始咗，仲即刻嗰種",
        ],
    },
    "cirender.schedule.result.unchanged": {
        en: [
            "the world had not changed, so nothing was rendered",
            "the world had not changed, so nothing was rendered",
            "the world had not changed at all, so nothing was rendered",
            "nothing had genuinely changed, so nothing was rendered",
            "not one block had changed, so nothing was rendered, and GitHub's runners went back to sleep",
        ],
        yue: [
            "個世界冇改過，所以乜都冇 render",
            "個世界冇改過，所以乜都冇 render",
            "個世界完全冇改過，所以乜都冇 render",
            "真係乜都冇改過，所以乜都冇 render",
            "一格都冇改過，所以乜都冇 render，GitHub 啲 runner 繼續瞓覺",
        ],
    },
    "cirender.schedule.result.unknown": {
        en: [
            "a change could not be cheaply told for this world's source",
            "a change could not be cheaply told for this world's source",
            "a change could not be cheaply told for this world's source, so nothing was rendered",
            "a change could not be cheaply told for this world's source, so nothing was rendered on a guess",
            "a change could not be cheaply told for this world's source, however hard it squinted, so nothing was rendered on a guess",
        ],
        yue: [
            "呢個世界嘅 source 冇得平價check有冇改過",
            "呢個世界嘅 source 冇得平價check有冇改過",
            "呢個世界嘅 source 冇得平價check有冇改過，所以乜都冇 render",
            "呢個世界嘅 source 冇得平價check有冇改過，所以唔會靠估去 render",
            "呢個世界嘅 source 冇得平價check有冇改過，眯埋眼都睇唔出，所以唔會靠估去 render",
        ],
    },
    "cirender.schedule.result.error": {
        en: [
            "the configured world could not be found by the last check",
            "the configured world could not be found by the last check",
            "the configured world could not be found by the last check, so nothing was rendered",
            "the configured world could not be found by the last check, so nothing was rendered",
            "the configured world could not be found by the last check, which went looking and came back with nothing, so nothing was rendered",
        ],
        yue: [
            "上次 check 搵唔到已配置嘅個世界",
            "上次 check 搵唔到已配置嘅個世界",
            "上次 check 搵唔到已配置嘅個世界，所以乜都冇 render",
            "上次 check 搵唔到已配置嘅個世界，所以乜都冇 render",
            "上次 check 搵唔到已配置嘅個世界，去搵完一場空手而回，所以乜都冇 render",
        ],
    },
    /*
     * The world has no project file. Every level keeps the word "defaults" and keeps the
     * three dimensions by name, because "set it up" without saying what gets written is
     * exactly the sentence somebody clicks and then wonders what it did to their world.
     */
    "cirender.defaultProject.create": {
        en: [
            "Set this world up with the defaults",
            "Set this world up with the defaults",
            "Set this world up with the defaults",
            "Set this world up with the defaults, right here",
            "Set this world up with the defaults, right here, and stop being sent somewhere else to do it",
        ],
        yue: [
            "用預設值幫呢個世界設定好",
            "用預設值幫呢個世界設定好",
            "用預設值幫呢個世界設定好",
            "就喺呢度用預設值幫呢個世界設定好",
            "就喺呢度用預設值幫呢個世界設定好，唔使再走去第二版搞",
        ],
    },
    "cirender.defaultProject.explain": {
        en: [
            "Writes a project file into the world with BlueMap's generated settings and an overworld, nether and end map.",
            "Writes a project file into the world with BlueMap's generated settings and an overworld, nether and end map. Nothing else in the world is touched.",
            "Writes a project file into the world holding BlueMap's own generated settings and an overworld, nether and end map. Nothing else in the world is touched, and everything in it stays editable from the Projects screen.",
            "Writes a project file into the world holding BlueMap's own generated settings and an overworld, nether and end map. Nothing else in the world is touched, and everything in it stays editable from the Projects screen afterwards.",
            "Writes a project file into the world holding BlueMap's own generated settings and an overworld, nether and end map. Nothing else in the world is touched - one small file appears, and everything in it stays editable from the Projects screen afterwards.",
        ],
        yue: [
            "會喺個世界入面寫一個 project 檔，用 BlueMap 產生嘅設定，加 overworld、nether 同 end 三張地圖。",
            "會喺個世界入面寫一個 project 檔，用 BlueMap 產生嘅設定，加 overworld、nether 同 end 三張地圖。個世界其他嘢一律唔郁。",
            "會喺個世界入面寫一個 project 檔，入面係 BlueMap 自己產生嘅設定，加 overworld、nether 同 end 三張地圖。個世界其他嘢一律唔郁，之後喺 Projects 版度樣樣都改得。",
            "會喺個世界入面寫一個 project 檔，入面係 BlueMap 自己產生嘅設定，加 overworld、nether 同 end 三張地圖。個世界其他嘢一律唔郁，寫完之後喺 Projects 版度樣樣都改得。",
            "會喺個世界入面寫一個 project 檔，入面係 BlueMap 自己產生嘅設定，加 overworld、nether 同 end 三張地圖。個世界其他嘢一律唔郁，淨係多咗一個細細個檔案，寫完之後喺 Projects 版度樣樣都改得。",
        ],
    },
    "cirender.defaultProject.unavailable": {
        en: [
            "This build cannot write a project file. Set the world up from the Projects screen or the map wizard.",
            "This build cannot write a project file, so set the world up from the Projects screen or the map wizard.",
            "This build cannot write a project file, so the world has to be set up from the Projects screen or the map wizard.",
            "This build cannot write a project file at all, so the world has to be set up from the Projects screen or the map wizard instead.",
            "This build cannot write a project file at all - not stubbornness, it simply has no way to - so the world has to be set up from the Projects screen or the map wizard instead.",
        ],
        yue: [
            "呢個 build 寫唔到 project 檔。請去 Projects 版或者 map wizard 設定個世界。",
            "呢個 build 寫唔到 project 檔，所以請去 Projects 版或者 map wizard 設定個世界。",
            "呢個 build 寫唔到 project 檔，所以個世界要喺 Projects 版或者 map wizard 度設定。",
            "呢個 build 根本寫唔到 project 檔，所以個世界要改為喺 Projects 版或者 map wizard 度設定。",
            "呢個 build 根本寫唔到 project 檔，唔係扭計，係真係冇路可行，所以個世界要改為喺 Projects 版或者 map wizard 度設定。",
        ],
    },
    "cirender.defaultProject.written": {
        en: [
            "Wrote {file}: an overworld, nether and end map from BlueMap's generated defaults.",
            "Wrote {file} with BlueMap's generated defaults: an overworld, nether and end map.",
            "Wrote {file} with BlueMap's generated defaults: an overworld, nether and end map. Open it from Projects to change anything.",
            "Wrote {file} with BlueMap's generated defaults: an overworld, nether and end map. Open it from Projects if you want to change anything in it.",
            "Wrote {file} with BlueMap's generated defaults: an overworld, nether and end map. That is the whole world set up; open it from Projects if you want to change anything in it.",
        ],
        yue: [
            "寫咗 {file}：overworld、nether 同 end 三張地圖，用 BlueMap 產生嘅預設值。",
            "寫咗 {file}，用 BlueMap 產生嘅預設值：overworld、nether 同 end 三張地圖。",
            "寫咗 {file}，用 BlueMap 產生嘅預設值：overworld、nether 同 end 三張地圖。想改嘢就喺 Projects 度打開佢。",
            "寫咗 {file}，用 BlueMap 產生嘅預設值：overworld、nether 同 end 三張地圖。想改入面任何嘢，就喺 Projects 度打開佢。",
            "寫咗 {file}，用 BlueMap 產生嘅預設值：overworld、nether 同 end 三張地圖。成個世界就係咁設定好；想改入面任何嘢，就喺 Projects 度打開佢。",
        ],
    },
    "cirender.cloudConfig.intro": {
        en: [
            "Answer the portable project settings below. The app writes the complete project file through local history, then returns to this exact cloud preflight with your world, account and repository choices intact. Java is not started and nothing is rendered locally.",
            "Answer the portable project settings below. The app writes the complete project file through local history, then returns to this exact cloud preflight with your world, account and repository choices intact. Java is not started and nothing is rendered locally.",
            "Answer the portable project settings below. The app writes the complete project file through local history, then returns to this exact cloud preflight with your world, account and repository choices intact. No Java starts and no local render begins.",
            "Answer the portable project settings below and let the file do the remembering. It is written through local history, then this exact cloud preflight comes back with your world, account and repository choices still filled in. No Java, no local render.",
            "Answer the portable project settings below, and the project file will do the remembering instead of making you repeat yourself. It goes through local history, the same cloud preflight comes back fully filled, and Java stays asleep while no local render starts.",
        ],
        yue: [
            "填好下面啲 portable project 設定。App 會經本機 history 寫完整 project 檔，之後返返同一個 cloud preflight，世界、帳戶同 repository 選擇全部保留。唔會開 Java，亦唔會喺本機 render。",
            "填好下面啲 portable project 設定。App 會經本機 history 寫完整 project 檔，之後返返同一個 cloud preflight，世界、帳戶同 repository 選擇全部保留。唔會開 Java，亦唔會喺本機 render。",
            "填好下面啲 portable project 設定。App 會經本機 history 寫完整 project 檔，再返同一個 cloud preflight；唔會開 Java，亦唔會喺本機開始 render。",
            "填好下面啲 portable project 設定，等個檔案幫你記住答案。寫入本機 history 之後返返同一個 cloud preflight，世界、帳戶同 repository 都仲喺度；Java 唔使郁，本機 render 都唔會偷跑。",
            "填好下面啲 portable project 設定，唔使再同一張表鬥記憶力。個 project 檔會入本機 history，原本嗰個 cloud preflight 返嚟仲係填滿晒；Java 繼續瞓，本機 render 唔會突然開工。",
        ],
    },
    "cirender.cloudConfig.mapHint": {
        en: [
            "These are BlueMap's generated map presets. Their names, dimensions and sorting are written into the normal maps/*.conf files; the generated defaults remain available in the project editor afterwards.",
            "These are BlueMap's generated map presets. Their names, dimensions and sorting are written into the normal maps/*.conf files; the generated defaults remain available in the project editor afterwards.",
            "These are BlueMap's generated map presets. Their names, dimensions and sorting are written into the normal maps/*.conf files, and the generated defaults remain editable afterwards.",
            "These are BlueMap's own map presets, with names, dimensions and sorting written into the ordinary maps/*.conf files. The project editor still gets the full set afterwards.",
            "These are BlueMap's own map presets, not a mystery box: names, dimensions and sorting land in the ordinary maps/*.conf files, and the project editor keeps the whole playground open afterwards.",
        ],
        yue: [
            "呢啲係 BlueMap 產生嘅地圖 preset。名稱、dimension 同排序會寫入正常嘅 maps/*.conf；之後喺 project editor 仲可以改晒啲預設值。",
            "呢啲係 BlueMap 產生嘅地圖 preset。名稱、dimension 同排序會寫入正常嘅 maps/*.conf；之後喺 project editor 仲可以改晒啲預設值。",
            "呢啲係 BlueMap 產生嘅地圖 preset。名稱、dimension 同排序會寫入正常 maps/*.conf，之後仲可以繼續編輯。",
            "呢啲係 BlueMap 自己嘅地圖 preset，名稱、dimension 同排序會落入普通 maps/*.conf；之後 project editor 仲保留完整設定。",
            "呢啲係 BlueMap 自己嘅地圖 preset，唔係神秘黑盒：名稱、dimension 同排序會落入普通 maps/*.conf，之後 project editor 仲畀你繼續玩晒成套設定。",
        ],
    },
    "cirender.cloudConfig.storageHint": {
        en: [
            "These are portable paths inside the generated project contract. They do not start a renderer or create folders now; the cloud workflow resolves them when it runs.",
            "These are portable paths inside the generated project contract. They do not start a renderer or create folders now; the cloud workflow resolves them when it runs.",
            "These portable paths are saved in the project contract. Nothing starts or creates folders until the cloud workflow runs.",
            "These paths go into the project contract and wait there. No renderer starts and no folder appears until the cloud workflow actually runs.",
            "These paths sit politely in the project contract until the cloud workflow earns its turn; no renderer wakes up and no folder magically appears now.",
        ],
        yue: [
            "呢啲係 generated project contract 入面嘅 portable path。依家唔會開始 renderer，亦唔會即刻開資料夾；cloud workflow 行嗰陣先會解讀。",
            "呢啲係 generated project contract 入面嘅 portable path。依家唔會開始 renderer，亦唔會即刻開資料夾；cloud workflow 行嗰陣先會解讀。",
            "呢啲 portable path 會儲喺 project contract。未到 cloud workflow 真係行之前，乜都唔會開、乜資料夾都唔會整。",
            "呢啲 path 會先安安靜靜放入 project contract，等 cloud workflow 真係行先郁；renderer 唔會偷跑，資料夾亦唔會憑空出現。",
            "呢啲 path 會乖乖坐喺 project contract 入面，等 cloud workflow 到場先開工；而家 renderer 繼續瞓，資料夾唔會自己變出嚟。",
        ],
    },
    "cirender.cloudConfig.renderHint": {
        en: [
            "The route is fixed to GitHub Actions for this guide. These values are saved in the project and can be edited later; they do not run Java or begin a local render now.",
            "The route is fixed to GitHub Actions for this guide. These values are saved in the project and can be edited later; they do not run Java or begin a local render now.",
            "This guide saves a GitHub Actions route and the render options you choose. Java and local rendering stay off until you return to preflight and start deliberately.",
            "This guide saves GitHub Actions plus your render switches. Java stays out of it and local rendering waits for the deliberate button in preflight.",
            "This guide writes GitHub Actions and your chosen switches into the project, while Java and local rendering remain firmly outside until preflight gets an explicit start.",
        ],
        yue: [
            "呢個 guide 固定用 GitHub Actions route。你揀嘅值會儲喺 project，之後仲可以改；而家唔會開 Java，亦唔會本機 render。",
            "呢個 guide 固定用 GitHub Actions route。你揀嘅值會儲喺 project，之後仲可以改；而家唔會開 Java，亦唔會本機 render。",
            "呢個 guide 會儲 GitHub Actions route 同你揀嘅 render 選項。返到 preflight 之前，Java 同本機 render 都唔會郁。",
            "呢個 guide 會寫低 GitHub Actions 同你揀嘅 render 開關。Java 唔會插手，本機 render 要等 preflight 嗰粒正式掣。",
            "呢個 guide 會將 GitHub Actions 同你揀嘅開關寫入 project，Java 同本機 render 就繼續企喺門外，等 preflight 真係收到明確開始先入場。",
        ],
    },
    "cirender.cloudConfig.reviewCloudOnlyBody": {
        en: [
            "No Java is launched, no client or JDK is downloaded, and no local render starts. The next action writes the complete project through local history, then returns to the same CI preflight.",
            "No Java is launched, no client or JDK is downloaded, and no local render starts. The next action writes the complete project through local history, then returns to the same CI preflight.",
            "No Java starts, nothing is downloaded, and no local render begins. Save writes the complete project through local history and returns to the same CI preflight.",
            "No Java, no download, no local render: just one history-backed project write, then the same CI preflight comes back with the earlier choices intact.",
            "No Java wakes up, no client or JDK goes shopping, and no local render sneaks off. One history-backed project write later, the exact same CI preflight returns with your earlier choices intact.",
        ],
        yue: [
            "唔會開 Java、唔會下載 client 或 JDK，亦唔會開始本機 render。下一步會經本機 history 寫完整 project，然後返返同一個 CI preflight。",
            "唔會開 Java、唔會下載 client 或 JDK，亦唔會開始本機 render。下一步會經本機 history 寫完整 project，然後返返同一個 CI preflight。",
            "Java 唔會開，乜都唔會下載，本機 render 都唔會開始。儲存會經本機 history 寫完整 project，再返同一個 CI preflight。",
            "冇 Java、冇下載、冇本機 render：淨係寫一次入 history 嘅完整 project，之後返同一個 CI preflight，之前揀好嘅答案原封不動。",
            "Java 唔會醒，client 同 JDK 唔會去 shopping，本機 render 亦唔會偷走。寫完一次 history-backed project，原本嗰個 CI preflight 就返嚟，之前啲答案一樣齊。",
        ],
    },
    "cirender.cloudConfig.written": {
        en: [
            "Wrote {file} through local history. Returning to the same cloud preflight now; your world, account and repository choices stay filled in.",
            "Wrote {file} through local history. Returning to the same cloud preflight now; your world, account and repository choices stay filled in.",
            "Wrote {file} through local history. Returning to the same cloud preflight with your world, account and repository choices intact.",
            "Wrote {file} through local history, and the same cloud preflight is coming back with your choices still in place.",
            "Wrote {file} through local history; the same cloud preflight is back with your world, account and repository choices still sitting exactly where you left them.",
        ],
        yue: [
            "經本機 history 寫咗 {file}。而家返返同一個 cloud preflight，世界、帳戶同 repository 選擇都仲填好晒。",
            "經本機 history 寫咗 {file}。而家返返同一個 cloud preflight，世界、帳戶同 repository 選擇都仲填好晒。",
            "經本機 history 寫咗 {file}。返返同一個 cloud preflight，世界、帳戶同 repository 選擇原封不動。",
            "{file} 已經寫入本機 history，同一個 cloud preflight 而家返嚟，之前揀嘅嘢全部仲喺位。",
            "{file} 已經乖乖入咗本機 history，同一個 cloud preflight 返返嚟，世界、帳戶同 repository 選擇一樣坐喺原位。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CIRENDER_FIXED = {
    "cirender.account.empty": {
        en: "No GitHub CLI accounts are signed in.",
        yue: "冇 GitHub CLI 帳戶登入咗。",
    },
    "cirender.account.noMatch": {
        en: "No signed-in account matches that search.",
        yue: "冇已登入帳戶符合嗰個搜尋。",
    },
    "cirender.account.reauthenticationRequired": {
        en: "reauthentication required",
        yue: "需要重新驗證",
    },
    "cirender.account.search": {
        en: "Search signed-in accounts",
        yue: "搜尋已登入帳戶",
    },
    "cirender.account.selected": {
        en: "Selected account",
        yue: "已選帳戶",
    },
    "cirender.bootstrap.createAction": {
        en: "Create and set this repository up",
        yue: "建立並設定好呢個 repository",
    },
    "cirender.bootstrap.creatingRepository": {
        en: "Creating the repository through GitHub CLI...",
        yue: "緊透過 GitHub CLI 建立 repository...",
    },
    "cirender.bootstrap.private": {
        en: "Create as a private repository",
        yue: "以私人 repository 建立",
    },
    "cirender.bootstrap.repositoryCreated": {
        en: "GitHub CLI created and verified {name}. Preparing its render workflow now.",
        yue: "GitHub CLI 建立並核實咗 {name}。而家準備緊佢嘅算圖 workflow。",
    },
    "cirender.bootstrap.pagesReadyLead": {
        en: "GitHub Pages is configured for workflow publishing at",
        yue: "GitHub Pages 已設定用 workflow 發佈，網址係",
    },
    "cirender.bootstrap.pagesReadyHomepage": {
        en: "The repository homepage now points to this exact URL. The first successful Pages render publishes the site.",
        yue: "Repository homepage 而家指向呢條同一網址。第一次成功嘅 Pages 算圖先會真正發佈個網站。",
    },
    "cirender.owner.empty": {
        en: "No owners were returned by GitHub CLI.",
        yue: "GitHub CLI 冇回傳任何擁有者。",
    },
    "cirender.owner.help": {
        en: "Owners are read through GitHub CLI for the selected account and revalidated before a repository is created.",
        yue: "擁有者係透過 GitHub CLI 用所選帳戶讀取，並會喺建立 repository 之前再核實一次。",
    },
    "cirender.owner.noMatch": {
        en: "No real owner matches that search.",
        yue: "冇真實擁有者符合嗰個搜尋。",
    },
    "cirender.owner.search": {
        en: "Search personal and organization owners",
        yue: "搜尋個人同組織擁有者",
    },
    "cirender.owner.selected": {
        en: "Selected owner",
        yue: "已選擁有者",
    },
    "cirender.readiness.cliUnavailable": {
        en: "This build cannot complete repository setup through GitHub CLI. No browser page was opened; update or repair the desktop application, then try again.",
        yue: "呢個版本無法透過 GitHub CLI 完成 repository 設定。冇打開過任何瀏覽器頁面；請更新或修復桌面應用程式，然後再試。",
    },
    "cirender.repo.empty": {
        en: "No writable repositories were returned by GitHub CLI.",
        yue: "GitHub CLI 冇回傳任何可寫入嘅 repository。",
    },
    "cirender.repo.loadedHint": {
        en: "Most recently active first, up to 300 real repositories returned by GitHub CLI.",
        yue: "最近活躍嘅排先，最多顯示 GitHub CLI 回傳嘅 300 個真實 repository。",
    },
    "cirender.repo.noMatch": {
        en: "No real repository matches that search.",
        yue: "冇真實 repository 符合嗰個搜尋。",
    },
    "cirender.repo.search": {
        en: "Search your repositories",
        yue: "搜尋你嘅 repository",
    },
    "cirender.repo.selectedLabel": {
        en: "Selected repository",
        yue: "已選 repository",
    },
    "cirender.artwork.alt": {
        en: "A local Minecraft world travelling through a cloud render pipeline and returning as a finished map",
        yue: "本機 Minecraft 世界經過雲端算圖流程，再以完成地圖返嚟",
    },
    /*
     * The phase names, in the order a render walks through them. They are read as a
     * sequence in a progress line, so they stay short enough to sit beside a spinner and
     * concrete enough to say which machine is doing the work at that moment.
     */
    "cirender.phase.checking": {
        en: "Checking the world and the repository",
        yue: "檢查緊個世界同個倉庫",
    },
    "cirender.phase.uploading": {
        en: "Uploading the world to GitHub",
        yue: "上載緊個世界去 GitHub",
    },
    "cirender.phase.dispatching": { en: "Starting the workflow", yue: "開緊個 workflow" },
    "cirender.phase.waiting": {
        en: "Waiting for GitHub to create the run",
        yue: "等緊 GitHub 開個 run",
    },
    "cirender.phase.rendering": { en: "GitHub is rendering", yue: "GitHub 算緊圖" },
    "cirender.phase.downloading": { en: "Fetching the rendered map", yue: "攞緊算好嘅地圖" },
    "cirender.phase.registering": { en: "Adding it to the map list", yue: "加緊入地圖清單" },
    "cirender.phase.finished": { en: "Finished", yue: "完成" },
    "cirender.phase.starting": { en: "Starting", yue: "開始緊" },

    /*
     * `{status}` and `{conclusion}` are GitHub's own words, passed through untranslated on
     * purpose: `queued`, `in_progress`, `failure`, `cancelled`, `timed_out`. They are what
     * the run page says, so a reader who opens the run finds the same word waiting there.
     */
    "cirender.run.none": { en: "No run yet", yue: "仲未有 run" },
    "cirender.run.going": { en: "Run is {status}", yue: "個 run 而家係 {status}" },
    "cirender.run.restored": {
        en: "Persisted run restored; live status has not arrived yet.",
        yue: "已還原持久化嘅 run；即時狀態仲未返到嚟。",
    },
    "cirender.run.ended": { en: "Run ended: {conclusion}", yue: "個 run 結束咗：{conclusion}" },

    /* The screen, its two cards, and the fields that say what and where. */
    "cirender.title": { en: "Render on GitHub", yue: "喺 GitHub 度算圖" },
    "cirender.where.title": { en: "What, and where", yue: "算咩，同埋去邊" },
    "cirender.field.world": { en: "World folder", yue: "世界資料夾" },
    "cirender.field.repo": { en: "Repository name", yue: "倉庫名" },
    "cirender.check": { en: "Check before anything is sent", yue: "送任何嘢上去之前先檢查" },
    "cirender.report.title": { en: "What this would do", yue: "呢個會做啲咩" },

    /* `{reason}` is why the sign-in that is not driving was passed over. */
    "cirender.route.other": {
        en: "The other sign-in was not used: {reason}",
        yue: "另一個登入冇用到：{reason}",
    },

    /* Buttons. `cirender.start` repeats the screen title deliberately: the card is titled
     * for what the screen is, the button is labelled for what pressing it does. */
    "cirender.eula.open": { en: "Open the consent setting", yue: "開同意設定" },
    "cirender.start": { en: "Render on GitHub", yue: "喺 GitHub 度算圖" },
    "cirender.signIn": { en: "Open the GitHub sign-in", yue: "開 GitHub 登入" },
    "cirender.openRun": { en: "Open the run on GitHub", yue: "喺 GitHub 開個 run" },
    "cirender.stop": { en: "Stop watching", yue: "唔再睇住" },
    "cirender.remove": { en: "Remove from list", yue: "由清單移除" },
    "cirender.remove.title": { en: "Remove this render from the list", yue: "由清單移除呢次算圖" },
    "cirender.remove.action": {
        en: "This deletes only the local history row. The GitHub run, release and rendered files on GitHub are not deleted.",
        yue: "只會刪除本機歷史記錄。GitHub 上面嘅 run、release 同已渲染檔案全部唔會刪除。",
    },
    "cirender.remove.confirm": { en: "Remove from the list", yue: "由清單移除" },

    /* The live run: transfer counter, job search, and the job that went wrong. */
    "cirender.transfer.bytes": { en: "{done} of {total}", yue: "{total} 入面嘅 {done}" },
    // The upload's own piece count (files while packing, parts while splitting, release
    // assets while uploading), shown beside the byte count once there is more than one piece.
    "cirender.transfer.items": {
        en: "{done} of {total} pieces",
        yue: "{total} 件入面嘅 {done} 件",
    },
    "cirender.jobs.search": { en: "Search jobs", yue: "搜尋工作" },
    "cirender.failingJob": { en: "The job that failed: {job}", yue: "失敗咗嗰個工作：{job}" },

    /*
     * The workflow runs shards in sequential waves; these three say which wave a job or a
     * shard group belongs to. `job.wave` labels one job's row, `wave.summary` totals a whole
     * wave's shards while it is still in progress.
     */
    "cirender.job.wave": { en: "Wave {wave}", yue: "第 {wave} 波" },
    "cirender.wave.summary": {
        en: "Wave {wave}: {done} of {total}",
        yue: "第 {wave} 波：{total} 入面嘅 {done}",
    },

    /* Which GitHub credential is driving this row: the app's own sign-in, or gh. */
    "cirender.row.route.gh": {
        en: "Using the gh command-line tool",
        yue: "用緊 gh 命令列工具",
    },

    /* Helper text under each field of the guided "What, and where" card. */
    "cirender.field.world.help": {
        en: "Pick a world below, browse for one, or type its full path.",
        yue: "喺下面揀個世界、瀏覽揾一個，或者直接打成個路徑。",
    },
    "cirender.field.world.browse": { en: "Browse", yue: "瀏覽" },
    "cirender.field.world.browsePrompt": {
        en: "Choose the world folder, the one that contains level.dat",
        yue: "揀個世界資料夾，即係入面有 level.dat 嗰個",
    },
    "cirender.field.world.browseUnavailable": {
        en: "This build cannot open a folder picker. Type the world's path above, or choose it from the list below.",
        yue: "呢個版本開唔到資料夾選擇器。喺上面打世界嘅路徑，或者喺下面個列表度揀一個。",
    },
    "cirender.field.world.browseUnavailableLabel": {
        en: "Browse: {reason}",
        yue: "瀏覽：{reason}",
    },
    "cirender.field.repo.help": {
        en: "A name is suggested once you choose a world. It stays yours to change before checking.",
        yue: "揀咗個世界之後會有個建議名。檢查之前你隨時可以自己改。",
    },

    /*
     * The account picker: which of possibly several stored GitHub sign-ins this render
     * authenticates as. The label names the *consequence* of picking one rather than merely
     * "account", and the hint says the opposite of what it would be easy to assume: this is
     * a LOCAL choice, scoped to this card, and never the application-wide active-account
     * switch `GitHubAccountsList.vue` in Settings offers. Shown whenever the multi-account
     * registry exists at all - see `showAccountPicker` in `CiRenderScreen.vue` - so even a
     * single stored account is named on screen rather than only implied.
     */
    "cirender.account.pick": { en: "Render as", yue: "算圖帳戶" },
    "cirender.account.help": {
        en: "Which signed-in account this render authenticates as. Worldlens selects and restores it around the operation, but another gh process can still change the machine-wide account between commands; avoid running gh account changes while this operation is active.",
        yue: "呢個算圖用邊個已登入帳戶做認證。Worldlens 會喺操作前後揀返同還原帳戶，但另一個 gh 程序仍可能喺指令之間改咗全機帳戶；操作進行中請唔好另外轉 gh 帳戶。",
    },
    /* Exactly one signed-in account: the picker still shows it, but names why it is fixed. */
    "cirender.account.single": {
        en: "Only one GitHub account is signed in, so this is fixed to it.",
        yue: "淨係得一個 GitHub 帳戶登入咗，所以固定用嗰個。",
    },
    /** Which one every other legacy channel already resolves to, named on the item itself. */
    "cirender.account.itemActive": { en: "{login} (active)", yue: "{login}（用緊）" },
    "cirender.gh.openAccounts": { en: "Open GitHub accounts", yue: "開啟 GitHub 帳戶" },

    /* The owner picker: its two item shapes, and the two ways it can come up short. */
    "cirender.owner.pick": { en: "Choose an owner", yue: "揀個擁有者" },
    "cirender.owner.asYou": { en: "{login} (you)", yue: "{login}（你）" },
    "cirender.owner.asOrg": { en: "{login} (organization)", yue: "{login}（機構）" },
    "cirender.owner.retry": { en: "Try again", yue: "再試一次" },

    /* The repository picker, and the availability check's own transient state. */
    "cirender.repo.pick": { en: "One of your repositories", yue: "你其中一個倉庫" },
    "cirender.repo.itemPrivate": { en: "{name} (private)", yue: "{name}（私人）" },
    "cirender.repo.itemPublic": { en: "{name} (PUBLIC)", yue: "{name}（公開）" },
    "cirender.repo.checking": {
        en: "Checking whether that name is free...",
        yue: "檢查緊呢個名係咪得閒...",
    },
    "cirender.repo.loadingRepositories": {
        en: "Reading your repositories...",
        yue: "讀緊你嘅倉庫...",
    },

    /*
     * The real, working next step beside `cirender.readiness.exists`/`.missing` - opens the
     * repository on GitHub, or GitHub's own prefilled "create a repository" page when there
     * is not one yet, so setting it up by hand is never more than one click away.
     */

    /* Scheduled re-rendering: the section title, its toggle, the cadence choices, and the
     * status readout. Short factual labels, like every other field name on this screen. */
    "cirender.schedule.title": { en: "Scheduled re-rendering", yue: "排程算圖" },
    "cirender.schedule.enable": { en: "Check automatically", yue: "自動檢查" },
    "cirender.schedule.cadence": { en: "How often", yue: "幾密" },
    "cirender.schedule.cadence.hourly": { en: "Every hour", yue: "每個鐘" },
    "cirender.schedule.cadence.sixHourly": { en: "Every 6 hours", yue: "每 6 個鐘" },
    "cirender.schedule.cadence.daily": { en: "Every day", yue: "每日" },
    "cirender.schedule.cadence.weekly": { en: "Every week", yue: "每星期" },
    "cirender.schedule.cadence.custom": { en: "Custom interval", yue: "自訂間隔" },
    "cirender.schedule.custom.hours": {
        en: "Run every this many hours",
        yue: "每隔幾多個鐘執行",
    },
    "cirender.schedule.custom.hint": {
        en: "Choose a whole number from 1 to 168. GitHub checks the schedule while this computer is off.",
        yue: "揀 1 至 168 嘅整數。部電腦熄咗之後，GitHub 都會照樣檢查排程。",
    },
    "cirender.schedule.custom.invalid": {
        en: "Enter a whole number from 1 to 168 hours.",
        yue: "請輸入 1 至 168 個鐘嘅整數。",
    },
    "cirender.schedule.lastCheck": { en: "Last checked", yue: "上次檢查" },
    "cirender.schedule.lastCheck.never": { en: "Never yet", yue: "仲未check過" },
    "cirender.schedule.nextCheck": { en: "Next check", yue: "下次檢查" },
    "cirender.schedule.lastRender": { en: "Last render started", yue: "上次開始算圖" },
    "cirender.schedule.reason": { en: "Why: {reason}", yue: "原因：{reason}" },
    "cirender.schedule.loading": { en: "Reading the schedule...", yue: "讀緊排程..." },
    "cirender.schedule.saving": { en: "Saving...", yue: "儲緊..." },

    /*
     * Preparing a repository automatically - see docs/ci-repository-setup.md. Short factual
     * status lines, the same register as `cirender.repo.checking` and the schedule labels
     * above: what is happening right now, and what each file's own outcome was. Nothing
     * here needs funny-level variation - it is a progress readout, not a claim worth
     * dressing up, and a phase label read out by a screen reader has to stay exactly as
     * literal at every setting.
     */
    "cirender.bootstrap.action": { en: "Set this repository up", yue: "幫呢個倉庫設定好" },
    "cirender.bootstrap.phase.resolvingCredential": {
        en: "Selecting the GitHub account...",
        yue: "揀緊 GitHub 帳戶...",
    },
    "cirender.bootstrap.phase.checkingScopes": {
        en: "Checking sign-in permissions...",
        yue: "檢查緊登入權限...",
    },
    "cirender.bootstrap.phase.readingRepository": {
        en: "Reading the repository...",
        yue: "讀緊個倉庫...",
    },
    "cirender.bootstrap.phase.writingFiles": {
        en: "Adding the render workflow...",
        yue: "加緊個算圖 workflow...",
    },
    "cirender.bootstrap.phase.checkingActions": {
        en: "Checking whether GitHub Actions is enabled...",
        yue: "檢查緊 GitHub Actions 開咗未...",
    },
    "cirender.bootstrap.phase.configuringPages": {
        en: "Enabling GitHub Pages and verifying the repository homepage...",
        yue: "開緊 GitHub Pages，同埋核實 repository homepage...",
    },
    "cirender.bootstrap.phase.finished": { en: "Done.", yue: "搞掂。" },
    "cirender.bootstrap.file.created": { en: "Added {path}", yue: "加咗 {path}" },
    "cirender.bootstrap.file.updated": { en: "Updated {path}", yue: "更新咗 {path}" },
    "cirender.bootstrap.file.unchanged": {
        en: "{path} was already up to date",
        yue: "{path} 本身已經係最新",
    },
    "cirender.bootstrap.file.refused": { en: "{path} was not touched", yue: "{path} 冇郁過" },
    "cirender.bootstrap.reauth": {
        en: "Sign in again and grant it",
        yue: "再登入一次，畀返個權限",
    },
    "cirender.bootstrap.conflict": {
        en: "Managed workflow conflict: no repository files were changed.",
        yue: "受管理 workflow 有衝突，倉庫入面一個檔案都冇改過。",
    },
    "cirender.cloudConfig.title": { en: "Create cloud render configuration", yue: "建立 cloud render 設定" },
    "cirender.cloudConfig.noLocalRender": { en: "Cloud-first · no local render", yue: "Cloud-first · 唔做本機 render" },
    "cirender.cloudConfig.search": { en: "Search configuration fields", yue: "搜尋設定欄位" },
    "cirender.cloudConfig.searchHint": { en: "map, storage, threads, output...", yue: "地圖、儲存、threads、輸出⋯⋯" },
    "cirender.cloudConfig.steps": { en: "Cloud configuration steps", yue: "Cloud 設定步驟" },
    "cirender.cloudConfig.step.map": { en: "Map", yue: "地圖" },
    "cirender.cloudConfig.step.storage": { en: "Storage", yue: "儲存" },
    "cirender.cloudConfig.step.render": { en: "Cloud render", yue: "Cloud render" },
    "cirender.cloudConfig.step.review": { en: "Review", yue: "檢查" },
    "cirender.cloudConfig.mapTitle": { en: "Choose the maps and primary map", yue: "揀地圖同主要地圖" },
    "cirender.cloudConfig.projectName": { en: "Project name", yue: "Project 名稱" },
    "cirender.cloudConfig.primaryDimension": { en: "Primary dimension", yue: "主要 dimension" },
    "cirender.cloudConfig.mapName": { en: "Primary map name", yue: "主要地圖名稱" },
    "cirender.cloudConfig.mapId": { en: "Primary map id", yue: "主要地圖 id" },
    "cirender.cloudConfig.sorting": { en: "Sort order", yue: "排序" },
    "cirender.cloudConfig.mapListTitle": { en: "Maps included in the cloud render", yue: "Cloud render 包含嘅地圖" },
    "cirender.cloudConfig.storageTitle": { en: "Choose storage paths", yue: "揀儲存路徑" },
    "cirender.cloudConfig.dataFolder": { en: "Runtime data folder", yue: "Runtime data 資料夾" },
    "cirender.cloudConfig.webroot": { en: "Web root", yue: "Web 根目錄" },
    "cirender.cloudConfig.outputFolder": { en: "Cloud output folder (optional)", yue: "Cloud 輸出資料夾（可選）" },
    "cirender.cloudConfig.browse": { en: "Browse", yue: "瀏覽" },
    "cirender.cloudConfig.renderTitle": { en: "Choose cloud render behaviour", yue: "揀 cloud render 行為" },
    "cirender.cloudConfig.threads": { en: "Render threads", yue: "Render threads" },
    "cirender.cloudConfig.automatic": { en: "Automatic", yue: "自動" },
    "cirender.cloudConfig.route": { en: "Render route", yue: "Render route" },
    "cirender.cloudConfig.force": { en: "Render all chunks even when they look unchanged", yue: "就算睇落冇變都 render 晒所有 chunk" },
    "cirender.cloudConfig.fixEdges": { en: "Repair map edges while rendering", yue: "Render 嗰陣修復地圖邊界" },
    "cirender.cloudConfig.metrics": { en: "Allow the upstream anonymous metrics option", yue: "容許 upstream 匿名 metrics 選項" },
    "cirender.cloudConfig.reviewTitle": { en: "Review before writing", yue: "寫入之前檢查" },
    "cirender.cloudConfig.reviewCloudOnly": { en: "Cloud-first", yue: "Cloud-first" },
    "cirender.cloudConfig.summaryWorld": { en: "World", yue: "世界" },
    "cirender.cloudConfig.summaryProject": { en: "Project", yue: "Project" },
    "cirender.cloudConfig.summaryPrimary": { en: "Primary map", yue: "主要地圖" },
    "cirender.cloudConfig.summaryStorage": { en: "Storage", yue: "儲存" },
    "cirender.cloudConfig.summaryRoute": { en: "Route", yue: "Route" },
    "cirender.cloudConfig.cancel": { en: "Cancel", yue: "取消" },
    "cirender.cloudConfig.back": { en: "Back", yue: "上一頁" },
    "cirender.cloudConfig.next": { en: "Next", yue: "下一頁" },
    "cirender.cloudConfig.save": { en: "Write and return to cloud preflight", yue: "寫入並返返 cloud preflight" },
    "cirender.cloudConfig.status": { en: "Step {step} of {total}", yue: "第 {step} 步，共 {total} 步" },
} as const satisfies Record<string, FixedString>;

export const CIRENDER_FACTS = {
    // What this list is for, and the exact label of the button that fills it.
    "cirender.list.empty": {
        en: ["GitHub's own computers", "Render on GitHub"],
        yue: ["GitHub 自己部機", "喺 GitHub 度算圖"],
    },
    // The asset name is what lets somebody confirm the "nothing to send" claim themselves.
    "cirender.upload.none": {
        en: ["{asset}", "not changed", "nothing will be sent"],
        yue: ["{asset}", "冇改過", "唔會送"],
    },
    "cirender.upload.needed": {
        en: ["{size}", "GitHub", "rendered"],
        yue: ["{size}", "GitHub", "算圖"],
    },

    // Where to get it, and that gh is the second route rather than the only one.
    "cirender.gh.missing": {
        en: ["gh command-line tool", "cli.github.com", "second route"],
        yue: ["gh 命令列工具", "cli.github.com", "第二條路"],
    },
    // The exact command, and that it has to be run in a terminal by a person.
    "cirender.gh.signedOut": {
        en: ["gh auth login", "terminal", "check again"],
        yue: ["gh auth login", "終端機", "再檢查"],
    },
    "cirender.gh.ready": {
        en: ["gh command-line tool", "signed in"],
        yue: ["gh 命令列工具", "登入咗"],
    },
    "cirender.gh.readyAs": {
        en: ["{account}", "{host}", "gh command-line tool"],
        yue: ["{account}", "{host}", "gh 命令列工具"],
    },

    "cirender.unsupported": {
        en: ["desktop application", "CI render"],
        yue: ["桌面應用程式", "CI 算圖"],
    },
    "cirender.blocked.check": { en: ["Check the repository"], yue: ["檢查個倉庫"] },
    "cirender.blocked.eula": {
        en: ["Mojang's licence", "not been accepted"],
        yue: ["Mojang", "未接受過"],
    },
    "cirender.blocked.large": {
        en: ["{size}", "GitHub release asset"],
        yue: ["{size}", "GitHub release asset"],
    },
    // Both remedies, because fixing the sign-in they already have will not unblock it.
    "cirender.blocked.uploadRoute": {
        en: ["publish a world", "Settings", "gh auth login"],
        yue: ["發佈一個世界", "設定", "gh auth login"],
    },
    "cirender.blocked.upload": {
        en: ["world", "uploaded to GitHub"],
        yue: ["個世界", "上載去 GitHub"],
    },
    "cirender.blocked.public": {
        en: ["publish this world publicly"],
        yue: ["公開發佈呢個世界"],
    },

    "cirender.pitch": {
        en: [
            "uploads the world",
            "GitHub's runners",
            "parallel jobs",
            "opens exactly like a local one",
        ],
        yue: ["上載", "runner", "平行工作", "一模一樣"],
    },
    // Each caveat is a number or a limit somebody plans around. None of them may go.
    "cirender.caveats": {
        en: [
            "takes time and bandwidth",
            "finite for private repositories",
            "unlimited standard-runner minutes",
            "one release asset",
        ],
        yue: ["時間同頻寬", "免費 Actions 分鐘係有限", "無限標準 runner 分鐘", "release asset"],
    },

    // The last clause is the point: nothing here accepts a licence on somebody's behalf.
    "cirender.eula": {
        en: [
            "Minecraft client jar",
            "block models and textures",
            "Mojang's licence",
            "will not accept it for you",
        ],
        yue: ["Minecraft client jar", "方塊模型同貼圖", "Mojang", "唔會代你接受"],
    },

    "cirender.repository.unknown": {
        en: ["Neither GitHub sign-in", "could read the repository", "Nothing will be uploaded"],
        yue: ["兩個 GitHub 登入", "讀唔到個倉庫", "先會上載"],
    },
    "cirender.repository.fallback": {
        en: ["could not read the repository", "credential that will do the work"],
        yue: ["讀唔到個倉庫", "會真正做嘢嗰個憑證"],
    },

    "cirender.configCarried": {
        en: ["{file}", "world archive", "runner", "complete render mask"],
        yue: ["{file}", "世界壓縮檔", "runner", "完整 render mask"],
    },
    // What is being agreed to. "whole" and "PUBLIC" are the words that carry the risk.
    "cirender.ack.upload": {
        en: ["whole world folder", "GitHub"],
        yue: ["成個世界資料夾", "GitHub"],
    },
    "cirender.ack.public": {
        en: ["PUBLIC", "download the world"],
        yue: ["PUBLIC", "下載呢個世界"],
    },
    "cirender.force": { en: ["Upload again", "unchanged"], yue: ["上載多次", "冇改過"] },

    "cirender.pages.publish": {
        en: ["GitHub Pages", "finished map"],
        yue: ["GitHub Pages", "算好嘅地圖"],
    },
    // A private repository does not make a published map private, and /map/ is where it goes.
    "cirender.pages.explain": {
        en: ["/map/", "documentation site", "Anybody with the link", "repository is private"],
        yue: ["/map/", "文件網站", "有條link", "係咪私人"],
    },
    "cirender.pages.parts": {
        en: ["in parts", "cannot be hosted this way", "still downloadable"],
        yue: ["分件", "唔可以用呢個方法host", "仲下載得到"],
    },

    "cirender.done": {
        en: ["{map}", "map list", "rendered on GitHub"],
        yue: ["{map}", "地圖清單", "GitHub"],
    },
    // "recorded" and "verified" are different claims, and the distinction is the message.
    "cirender.recorded": {
        en: ["no checksum", "SHA-256", "recorded rather than verified"],
        yue: ["checksum", "SHA-256", "記錄咗", "唔算驗證過"],
    },

    // Which account this render runs as at all, not which login or org it publishes under.
    "cirender.account.signedOut": {
        en: ["Nobody is signed in", "Sign in from Settings"],
        yue: ["冇人登入", "設定入面登入"],
    },

    // The remedy - Settings, or free text - is the point, not merely "nobody signed in".
    "cirender.owner.signedOut": {
        en: ["Nobody is signed in", "Sign in from Settings", "type the owner directly"],
        yue: ["冇人登入", "設定入面登入", "直接", "打個擁有者"],
    },

    // Each rule names exactly what is broken, so the fix is obvious rather than guessed.
    "cirender.repo.invalid.chars": {
        en: ["letters, digits, dots, hyphens and underscores"],
        yue: ["英文字母", "數字", "句號", "連字號", "底線"],
    },
    "cirender.repo.invalid.dots": {
        en: ['"."', '".."'],
        yue: ["「.」", "「..」"],
    },
    "cirender.repo.invalid.gitSuffix": {
        en: ['".git"'],
        yue: ["「.git」"],
    },
    "cirender.repo.invalid.long": {
        en: ["100 characters"],
        yue: ["100 個字"],
    },

    // {owner} and {repo} are what makes the claim checkable against the real name typed.
    "cirender.repo.available": {
        en: ["{owner}", "{repo}", "free on GitHub"],
        yue: ["{owner}", "{repo}", "未有人用"],
    },
    "cirender.repo.taken": {
        en: ["{owner}", "{repo}", "already exists"],
        yue: ["{owner}", "{repo}", "已經有咗"],
    },
    "cirender.repo.unknown": {
        en: ["{message}", "Could not check"],
        yue: ["{message}", "查唔到"],
    },

    // A choice, not a proposal: {owner} and {repo} pin exactly which repository was picked.
    "cirender.repo.selected": {
        en: ["{owner}", "{repo}", "one of your own repositories"],
        yue: ["{owner}", "{repo}", "你自己"],
    },
    // "not set up" is the whole difference from a real block, and the fact that it exists
    // and is writable is what makes that claim checkable rather than merely reassuring.
    "cirender.readiness.exists": {
        en: ["{owner}", "{repo}", "exists", "no render workflow"],
        yue: ["{owner}", "{repo}", "存在", "冇 render workflow"],
    },
    "cirender.readiness.missing": {
        en: ["{owner}", "{repo}", "may not exist yet", "creating it"],
        yue: ["{owner}", "{repo}", "可能仲未存在", "整個出嚟"],
    },

    "cirender.checkBlocked.world": {
        en: ["Choose a world folder", "before checking"],
        yue: ["揀個世界資料夾", "先至可以檢查"],
    },
    "cirender.checkBlocked.owner": {
        en: ["repository owner", "before checking"],
        yue: ["倉庫擁有者", "先至可以檢查"],
    },
    "cirender.checkBlocked.repo": {
        en: ["repository name", "before checking"],
        yue: ["倉庫名", "先至可以檢查"],
    },

    "cirender.schedule.help": {
        en: ["{count}", "metadata"],
        yue: ["{count}", "metadata"],
    },
    "cirender.schedule.result.changed": {
        en: ["a render was started"],
        yue: ["render 已經開始咗"],
    },
    "cirender.schedule.result.unchanged": {
        en: ["nothing was rendered"],
        yue: ["乜都冇 render"],
    },
    "cirender.schedule.result.unknown": {
        en: ["a change could not be cheaply told for this world's source"],
        yue: ["呢個世界嘅 source 冇得平價check有冇改過"],
    },
    "cirender.schedule.result.error": {
        en: ["the configured world could not be found by the last check"],
        yue: ["上次 check 搵唔到已配置嘅個世界"],
    },
    // What the button does has to survive every level: it writes into the world.
    "cirender.defaultProject.create": {
        en: ["Set this world up with the defaults"],
        yue: ["用預設值幫呢個世界設定好"],
    },
    // The three dimensions and "project file" are the facts; the rest is voice.
    "cirender.defaultProject.explain": {
        en: ["project file", "overworld, nether and end"],
        yue: ["project 檔", "overworld、nether 同 end"],
    },
    // Where to go instead, which is the only actionable half of a refusal.
    "cirender.defaultProject.unavailable": {
        en: ["cannot write a project file", "Projects screen or the map wizard"],
        yue: ["寫唔到 project 檔", "Projects 版或者 map wizard"],
    },
    // The path written, and what went into it.
    "cirender.defaultProject.written": {
        en: ["{file}", "overworld, nether and end"],
        yue: ["{file}", "overworld、nether 同 end"],
    },
    "cirender.cloudConfig.written": {
        en: ["local history", "same cloud preflight"],
        yue: ["本機 history", "同一個 cloud preflight"],
    },
} as const satisfies Record<
    keyof typeof CIRENDER_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
