/**
 * The settings screen: its own search bar, the docked-panel chrome every settings surface
 * is wrapped in, the Java runtime row, the folder rendered maps are written into, the
 * world-folder explanation, and the placement list that puts every panel back at once.
 *
 * One module per surface, spread into `appCopy.ts`. The split is not cosmetic: the
 * catalogue is the one file in this package that several people edit at once, and a single
 * two-thousand-entry object literal makes every one of those edits touch the same hunk.
 *
 * ## What is deliberately *not* here
 *
 * `settings.java.title`, `settings.java.description`, `settings.java.notFound`,
 * `settings.storage.title`, `settings.storage.description`, `settings.storage.saved`,
 * `settings.storage.relative`, `settings.github.title` and the whole of
 * `settings.consent.*` and `settings.language.*` are settings keys and are written
 * directly in `appCopy.ts`. They were there before this module existed and an entry here
 * would be shadowed by them anyway, because `appCopy.ts` spreads the surface modules first
 * so that its own entries win a collision. Two definitions of one key, one of which never
 * renders, is the kind of thing that survives review for a year.
 *
 * ## The `dock.*` keys
 *
 * They live here rather than in `chrome.ts` because `DockedSurface.vue` lives under
 * `components/settings/`, and because the only thing that reads `dock.placement.left` and
 * friends is the settings screen's own placement list. They are the panel chrome, not the
 * window chrome: `window.close` closes the application, `dock.close` closes a panel.
 *
 * One consequence worth knowing before editing `dock.adjusted.floating`: the `{edge}` it
 * interpolates is a `dock.placement.*` label, so the sentence renders as "to the Docked to
 * the left". The Cantonese wraps it in corner brackets for that reason, which reads as the
 * name of a placement rather than as a preposition that has been said twice.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const SETTINGS_VOICED = {
    /* ---------------------------------------------------------------- */
    /* The settings search                                               */
    /* ---------------------------------------------------------------- */

    /*
     * A search that lists nothing has two very different reasons for it, and the user can
     * act on one and not the other. `badPattern` is the app refusing to guess at a regex
     * that does not parse; `noMatches` is the app having looked and found nothing. Both say
     * at every level that no setting has been removed, because a settings screen that
     * suddenly shows three rows looks exactly like a settings screen that lost the rest.
     */
    "settings.search.badPattern": {
        en: [
            "The pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed.",
            "That pattern is not valid, so nothing is listed.",
            "The pattern is not valid, so nothing is listed. No setting has gone anywhere.",
            "The pattern is not valid, so nothing is listed. The settings are all still here; they just cannot be matched against a pattern that does not parse.",
        ],
        yue: [
            "個 pattern 唔正確，所以冇列出任何嘢。",
            "個 pattern 唔正確，所以冇列出任何嘢。",
            "呢個 pattern 唔正確，所以冇列出任何嘢。",
            "個 pattern 唔正確，所以冇列出任何嘢。設定一個都冇少。",
            "個 pattern 唔正確，所以冇列出任何嘢。啲設定全部仲好地地喺度，只係一個 parse 唔到嘅 pattern 冇嘢好對。",
        ],
    },
    "settings.search.total": {
        en: [
            "{n} settings.",
            "{n} settings.",
            "{n} settings on this screen.",
            "{n} settings, all of them on this screen.",
            "{n} settings, all present and correct on this screen.",
        ],
        yue: [
            "{n} 個設定。",
            "{n} 個設定。",
            "呢個畫面有 {n} 個設定。",
            "呢個畫面有 {n} 個設定，一個都冇匿埋。",
            "呢個畫面總共 {n} 個設定，齊晒，一個都冇走甩。",
        ],
    },
    "settings.search.found": {
        en: [
            "{shown} of {total} settings match.",
            "{shown} of {total} settings match.",
            "{shown} of the {total} settings match.",
            "{shown} of {total} settings match. The rest are filtered out, not gone.",
            "{shown} of {total} settings match. The others are filtered out rather than gone, and they come back the moment the box is empty.",
        ],
        yue: [
            "{total} 個設定入面有 {shown} 個符合。",
            "{total} 個設定入面有 {shown} 個符合。",
            "喺 {total} 個設定入面，有 {shown} 個符合。",
            "喺 {total} 個設定入面有 {shown} 個符合。其餘嘅係篩走咗，唔係唔見咗。",
            "喺 {total} 個設定入面有 {shown} 個符合。其餘嘅係篩走咗，唔係唔見咗，個框一清返就即刻返晒嚟。",
        ],
    },
    "settings.search.noMatches": {
        en: [
            "No setting on this screen matches that.",
            "No setting on this screen matches that.",
            "Nothing on this screen matches that.",
            "Nothing on this screen matches that. The settings are all still here, just not that word.",
            "Nothing on this screen matches that. Every setting is still here; that particular word is just not one of them.",
        ],
        yue: [
            "呢個畫面冇設定符合。",
            "呢個畫面冇設定符合。",
            "呢個畫面搵唔到符合嘅設定。",
            "呢個畫面搵唔到符合嘅設定。啲設定全部仲喺度，只係冇呢個字。",
            "呢個畫面搵唔到符合嘅設定。每一個設定都仲喺度，淨係冇你打嗰個字咋。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Docked panels: when the placement asked for was not the one used  */
    /* ---------------------------------------------------------------- */

    /*
     * Said out loud rather than silently done. The user picked an edge and the panel
     * appeared somewhere else, which is indistinguishable from the preference not having
     * been saved. "Your choice is kept" is therefore load-bearing and survives level 5, as
     * does the reason: the requested edge would have covered the control that opened it.
     */
    "dock.adjusted.floating": {
        en: [
            "There is not enough room to dock {title} to the {edge} without covering the control that opened it, so it is floating. Your choice is kept.",
            "There is not enough room to dock {title} to the {edge} without covering the control that opened it, so it is floating. Your choice is kept.",
            "There is not enough room to dock {title} to the {edge} without covering the control that opened it, so it is floating for now. Your choice is kept.",
            "Docking {title} to the {edge} would have covered the control that opened it, so it is floating instead. Your choice is kept, and it goes back when there is room.",
            "Docking {title} to the {edge} would have parked it right on top of the control that opened it, so it is floating instead. Your choice is kept, and it goes back the moment there is room.",
        ],
        yue: [
            "冇足夠空間將 {title} 擺成「{edge}」而唔遮住打開佢嗰個控制項，所以而家係浮動。你嘅選擇會保留。",
            "冇足夠空間將 {title} 擺成「{edge}」而唔遮住打開佢嗰個控制項，所以而家係浮動。你嘅選擇會保留。",
            "冇足夠空間將 {title} 擺成「{edge}」而唔遮住打開佢嗰個控制項，所以暫時係浮動。你嘅選擇會保留。",
            "如果將 {title} 擺成「{edge}」，就會遮住打開佢嗰個控制項，所以改為浮動。你嘅選擇會保留，有位嗰陣就會擺返去。",
            "{title} 擺成「{edge}」會啱啱好壓住打開佢嗰個控制項，所以改為浮動。你嘅選擇會保留，一有位就即刻擺返去。",
        ],
    },
    "dock.adjusted.shrunk": {
        en: [
            "{title} is narrower than usual so that it does not cover the control that opened it.",
            "{title} is narrower than usual so that it does not cover the control that opened it.",
            "{title} is a little narrower than usual so that it does not cover the control that opened it.",
            "{title} has been made narrower than usual so that it does not cover the control that opened it.",
            "{title} has breathed in a bit and is narrower than usual, so that it does not cover the control that opened it.",
        ],
        yue: [
            "{title} 比平時窄，為咗唔遮住打開佢嗰個控制項。",
            "{title} 比平時窄，為咗唔遮住打開佢嗰個控制項。",
            "{title} 比平時窄少少，為咗唔遮住打開佢嗰個控制項。",
            "{title} 已經整到比平時窄，為咗唔遮住打開佢嗰個控制項。",
            "{title} 收咗個肚，變到比平時窄，為咗唔遮住打開佢嗰個控制項。",
        ],
    },
    /*
     * The accessible name of the placement button, and its tooltip. Voiced because it
     * reports the current placement rather than naming a control, but kept short at every
     * level anyway: a screen reader says the whole of this before the user has pressed
     * anything, and a joke that has to be listened through twice is not a joke.
     */
    "dock.chooser.label": {
        en: [
            "Where {title} sits. Currently: {current}",
            "Where {title} sits. Currently: {current}",
            "Where {title} sits. Right now: {current}",
            "Where {title} sits. At the moment: {current}",
            "Where {title} sits, and it is parked at: {current}",
        ],
        yue: [
            "{title} 擺喺邊。而家：{current}",
            "{title} 擺喺邊。而家：{current}",
            "{title} 擺喺邊。目前：{current}",
            "{title} 擺喺邊。此刻：{current}",
            "{title} 擺喺邊，而家泊咗喺：{current}",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The Java runtime row                                              */
    /* ---------------------------------------------------------------- */

    "settings.java.missingHint": {
        en: [
            "A render stopped because no suitable Java was found. Installing one, or pointing JAVA_HOME at one, is what fixes it.",
            "A render stopped because no suitable Java was found. Installing one, or pointing JAVA_HOME at one, is what fixes it.",
            "A render stopped because no suitable Java was found here. Installing one, or pointing JAVA_HOME at one, is what fixes it.",
            "A render stopped because no suitable Java was found anywhere it looked. Installing one, or pointing JAVA_HOME at one, is what fixes it.",
            "A render stopped because no suitable Java was found anywhere it looked, and it did look. Installing one, or pointing JAVA_HOME at one, is what fixes it.",
        ],
        yue: [
            "有個算圖停咗，因為搵唔到合適嘅 Java。裝一個，或者將 JAVA_HOME 指去一個，就解決到。",
            "有個算圖停咗，因為搵唔到合適嘅 Java。裝一個，或者將 JAVA_HOME 指去一個，就解決到。",
            "有個算圖停咗，因為喺呢部機搵唔到合適嘅 Java。裝一個，或者將 JAVA_HOME 指去一個，就解決到。",
            "有個算圖停咗，因為搵勻晒都搵唔到合適嘅 Java。裝一個，或者將 JAVA_HOME 指去一個，就解決到。",
            "有個算圖停咗，因為搵勻晒都搵唔到合適嘅 Java，真係有搵過㗎。裝一個，或者將 JAVA_HOME 指去一個，就解決到。",
        ],
    },
    /*
     * The one line on this row that is not a reading of the machine. It is what the last
     * render recorded, and a user who has installed a Java since then will see the old one
     * here and reasonably conclude the app is wrong about their computer. Every level says
     * which of the two it is.
     */
    "settings.java.lastRender": {
        en: [
            "The most recent render ran on: {engine}. That is a record of that render, not a reading of this machine now.",
            "The most recent render ran on: {engine}. That is a record of that render, not a reading of this machine now.",
            "The most recent render ran on: {engine}. It is a record of that render, not a reading of this machine now.",
            "The most recent render ran on: {engine}. That is history: a record of that render, not a reading of this machine now.",
            "The most recent render ran on: {engine}. That line is history and nothing else, a record of that render, not a reading of this machine now.",
        ],
        yue: [
            "最近一次算圖係用：{engine}。呢個係嗰次算圖嘅記錄，唔係而家部機嘅實況。",
            "最近一次算圖係用：{engine}。呢個係嗰次算圖嘅記錄，唔係而家部機嘅實況。",
            "最近一次算圖係用：{engine}。呢行字係嗰次算圖嘅記錄，唔係而家部機嘅實況。",
            "最近一次算圖係用：{engine}。呢個純粹係舊帳，係嗰次算圖嘅記錄，唔係而家部機嘅實況。",
            "最近一次算圖係用：{engine}。呢行字純粹係舊帳嚟，係嗰次算圖嘅記錄，唔係而家部機嘅實況。",
        ],
    },
    /*
     * "Nothing is wrong with your Java" is the whole point of the sentence. A build that
     * cannot ask a question looks identical, from this screen, to a machine with no Java on
     * it, and only one of those is worth an afternoon of the reader's time.
     */
    "settings.java.unsupported": {
        en: [
            "This build cannot report the Java runtime. Nothing is wrong with your Java; the app has no way to ask about it from this screen yet.",
            "This build cannot report the Java runtime. Nothing is wrong with your Java; the app has no way to ask about it from this screen yet.",
            "This build cannot report the Java runtime. Nothing is wrong with your Java; the app simply has no way to ask about it from this screen yet.",
            "This build cannot report the Java runtime. Nothing is wrong with your Java; this build just has no way to ask about it from this screen yet.",
            "This build cannot report the Java runtime. Nothing is wrong with your Java; this build has no way to ask about it from this screen yet, which is a gap in the app and not in your computer.",
        ],
        yue: [
            "呢個版本報唔到 Java 執行環境。你部機嘅 Java 冇問題；係呢個程式暫時未有辦法喺呢個畫面問到。",
            "呢個版本報唔到 Java 執行環境。你部機嘅 Java 冇問題；係呢個程式暫時未有辦法喺呢個畫面問到。",
            "呢個版本報唔到 Java 執行環境。你部機嘅 Java 冇問題；純粹係呢個程式暫時未有辦法喺呢個畫面問到。",
            "呢個版本報唔到 Java 執行環境。你部機嘅 Java 冇問題；係呢個版本暫時未有辦法喺呢個畫面問到咋。",
            "呢個版本報唔到 Java 執行環境。你部機嘅 Java 冇問題；係呢個版本未有辦法喺呢個畫面問到，即係程式自己蝕底，唔關你部機事。",
        ],
    },
    /*
     * The order is the fact here, and so is "runs each one before trusting it": a folder
     * called `jdk-21` containing a Java 8 has happened to somebody, and the app checking
     * rather than believing the name is the reason a render fails at the start instead of
     * halfway through.
     */
    "settings.java.discoveryOrder": {
        en: [
            "When a render starts, the app looks at JAVA_HOME first, then java on PATH, then the copy it installed for itself, and runs each one before trusting it. A render that finds nothing suitable says so, and names every candidate it turned down.",
            "When a render starts, the app looks at JAVA_HOME first, then java on PATH, then the copy it installed for itself, and runs each one before trusting it. A render that finds nothing suitable says so, and names every candidate it turned down.",
            "When a render starts, the app checks JAVA_HOME first, then java on PATH, then the copy it installed for itself, and runs each one before trusting it. A render that finds nothing suitable says so, and names every candidate it turned down.",
            "When a render starts, the app checks JAVA_HOME first, then java on PATH, then the copy it installed for itself, and actually runs each one before trusting it. A render that finds nothing suitable says so, and names every candidate it turned down.",
            "When a render starts, the app checks JAVA_HOME first, then java on PATH, then the copy it installed for itself, and runs each one before trusting it, because a version number in a folder name has lied before. A render that finds nothing suitable says so, and names every candidate it turned down.",
        ],
        yue: [
            "算圖一開始，程式會先睇 JAVA_HOME，跟住係 PATH 上面嘅 java，最後先係佢自己裝嗰份，而且每一個都會行過先至信。搵唔到合用嘅話，算圖會直接講，仲會逐個列出佢唔收嘅候選。",
            "算圖一開始，程式會先睇 JAVA_HOME，跟住係 PATH 上面嘅 java，最後先係佢自己裝嗰份，而且每一個都會行過先至信。搵唔到合用嘅話，算圖會直接講，仲會逐個列出佢唔收嘅候選。",
            "算圖一開始，程式會順住 JAVA_HOME、PATH 上面嘅 java、再到佢自己裝嗰份咁睇，而且每一個都會行過先至信。搵唔到合用嘅話，算圖會直接講，仲會逐個列出佢唔收嘅候選。",
            "算圖一開始，程式會順住 JAVA_HOME、PATH 上面嘅 java、再到佢自己裝嗰份咁睇，而且每一個都真係行過先至信。搵唔到合用嘅話，算圖會直接講，仲會逐個列出佢唔收嘅候選。",
            "算圖一開始，程式會順住 JAVA_HOME、PATH 上面嘅 java、再到佢自己裝嗰份咁睇，而且每一個都要行過先至信，因為資料夾個名寫住嘅版本號呃過人。搵唔到合用嘅話，算圖會直接講，仲會逐個列出佢唔收嘅候選。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The GitHub account row, as the settings screen introduces it      */
    /* ---------------------------------------------------------------- */

    /*
     * The account screen itself is `surfaces/github.ts`. These three are the settings
     * screen's own framing of it, and all three carry the same two facts a reader needs
     * before deciding: signing in is optional, and the token is never put on this screen.
     */
    "settings.github.description": {
        en: [
            "Signing in lets the app reach worlds in private repositories and download release assets that are not public. Everything public works without it, so this is optional. The token is held by the app itself and never shown on this screen.",
            "Signing in lets the app reach worlds in private repositories and download release assets that are not public. Everything public works without it, so this is optional. The token is held by the app itself and never shown on this screen.",
            "Signing in lets the app reach worlds in private repositories and download release assets that are not public. Everything public works without it, so it is optional. The token is held by the app itself and never shown on this screen.",
            "Signing in lets the app reach worlds in private repositories and download release assets that are not public. Everything public works without it, so it is entirely optional. The token is held by the app itself and never shown on this screen.",
            "Signing in lets the app reach worlds in private repositories and download release assets that are not public. Everything public carries on working without it, so it is entirely optional and nobody here will nag you about it. The token is held by the app itself and never shown on this screen.",
        ],
        yue: [
            "登入之後，程式先攞到私人 repository 入面嘅世界，同埋下載唔公開嘅 release asset。所有公開嘅嘢唔登入都用得，所以呢樣係可選嘅。個 token 由程式自己保管，喺呢個畫面永遠唔會顯示。",
            "登入之後，程式先攞到私人 repository 入面嘅世界，同埋下載唔公開嘅 release asset。所有公開嘅嘢唔登入都用得，所以呢樣係可選嘅。個 token 由程式自己保管，喺呢個畫面永遠唔會顯示。",
            "登入之後，程式先攞到私人 repository 入面嘅世界，同埋下載唔公開嘅 release asset。所有公開嘅嘢唔登入一樣用得，所以呢樣係可選嘅。個 token 由程式自己保管，喺呢個畫面永遠唔會顯示。",
            "登入之後，程式先攞到私人 repository 入面嘅世界，同埋下載唔公開嘅 release asset。所有公開嘅嘢唔登入一樣用得，所以呢樣完全係可選嘅。個 token 由程式自己保管，喺呢個畫面永遠唔會顯示。",
            "登入之後，程式先攞到私人 repository 入面嘅世界，同埋下載唔公開嘅 release asset。所有公開嘅嘢唔登入照樣用得，所以呢樣完全係可選嘅，冇人會喺度催你。個 token 由程式自己保管，喺呢個畫面永遠唔會顯示。",
        ],
    },
    "settings.github.whatFor": {
        en: [
            "Signing in is only needed for private repositories: rendering a world that lives in one, and downloading a release asset that is not public. Public worlds and public releases work signed out.",
            "Signing in is only needed for private repositories: rendering a world that lives in one, and downloading a release asset that is not public. Public worlds and public releases work signed out.",
            "Signing in is only needed for private repositories: rendering a world that lives in one, or downloading a release asset that is not public. Public worlds and public releases work signed out.",
            "Signing in is only needed for private repositories: rendering a world that lives in one, or downloading a release asset that is not public. Everything else, public worlds and public releases, works signed out.",
            "Signing in is only needed for private repositories: rendering a world that lives in one, or downloading a release asset that is not public. Public worlds and public releases work signed out, and will not ask who you are.",
        ],
        yue: [
            "淨係私人 repository 先需要登入：算一個住喺入面嘅世界，同埋下載唔公開嘅 release asset。公開世界同公開 release 唔登入一樣做到。",
            "淨係私人 repository 先需要登入：算一個住喺入面嘅世界，同埋下載唔公開嘅 release asset。公開世界同公開 release 唔登入一樣做到。",
            "淨係私人 repository 先需要登入：算一個住喺入面嘅世界，或者下載唔公開嘅 release asset。公開世界同公開 release 唔登入一樣做到。",
            "淨係私人 repository 先需要登入：算一個住喺入面嘅世界，或者下載唔公開嘅 release asset。其餘嘅，公開世界同公開 release，唔登入一樣做到。",
            "淨係私人 repository 先需要登入：算一個住喺入面嘅世界，或者下載唔公開嘅 release asset。公開世界同公開 release 唔登入一樣做到，仲唔會查你身份。",
        ],
    },
    "settings.github.signedOut": {
        en: [
            "Not signed in. Nothing is stored on this computer, and public repositories still work.",
            "Not signed in. Nothing is stored on this computer, and public repositories still work.",
            "Not signed in. Nothing is stored on this computer, and public repositories still work fine.",
            "Not signed in. Nothing is stored on this computer, and public repositories still work perfectly well.",
            "Not signed in. Nothing is stored on this computer, and public repositories still work, quite happily, without knowing who you are.",
        ],
        yue: [
            "未登入。呢部電腦冇儲低任何嘢，公開 repository 一樣用得。",
            "未登入。呢部電腦冇儲低任何嘢，公開 repository 一樣用得。",
            "未登入。呢部電腦冇儲低任何嘢，公開 repository 照樣用得。",
            "未登入。呢部電腦冇儲低任何嘢，公開 repository 完全用得。",
            "未登入，呢部電腦冇儲低任何嘢。公開 repository 一樣用得，唔使知你係邊個都照做。",
        ],
    },
    /*
     * Separate from `settings.github.unsupported` on the account screen only by which half
     * it is about: this one is the settings screen saying the *build* cannot sign in, so it
     * has to rule out the reader's account and the reader's stored credentials in the same
     * breath. Both facts survive level 5.
     */
    "settings.github.unsupported": {
        en: [
            "This build cannot sign in to GitHub. Nothing is wrong with your account, and nothing was stored: the sign-in is held by the desktop app, and this build has no way to reach it.",
            "This build cannot sign in to GitHub. Nothing is wrong with your account, and nothing was stored: the sign-in is held by the desktop app, and this build has no way to reach it.",
            "This build cannot sign in to GitHub. Nothing is wrong with your account, and nothing was stored: the sign-in lives in the desktop app, and this build has no way to reach it.",
            "This build cannot sign in to GitHub. Nothing is wrong with your account, and nothing was stored: the sign-in lives in the desktop app, and this build cannot reach that far.",
            "This build cannot sign in to GitHub. Nothing is wrong with your account, and nothing was stored: the sign-in lives in the desktop app, and this build cannot reach that far, so it is standing here telling you about it instead.",
        ],
        yue: [
            "呢個版本登入唔到 GitHub。你個帳戶冇問題，亦都冇儲低任何嘢：登入係由桌面程式保管，而呢個版本掂唔到。",
            "呢個版本登入唔到 GitHub。你個帳戶冇問題，亦都冇儲低任何嘢：登入係由桌面程式保管，而呢個版本掂唔到。",
            "呢個版本登入唔到 GitHub。你個帳戶冇問題，亦都冇儲低任何嘢：登入放喺桌面程式度，而呢個版本掂唔到。",
            "呢個版本登入唔到 GitHub。你個帳戶冇問題，亦都冇儲低任何嘢：登入放喺桌面程式度，呢個版本伸唔到咁遠。",
            "呢個版本登入唔到 GitHub。你個帳戶冇問題，亦都冇儲低任何嘢：登入放喺桌面程式度，呢個版本伸唔到咁遠，唯有企喺度同你講一聲。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Where rendered maps are written                                   */
    /* ---------------------------------------------------------------- */

    "settings.storage.empty": {
        en: [
            "Give a folder for the maps to be written into.",
            "Give a folder for the maps to be written into.",
            "A folder is needed for the maps to be written into.",
            "This needs a folder for the maps to be written into.",
            "This needs a folder for the maps to be written into. An empty box is not a place.",
        ],
        yue: [
            "俾一個資料夾，等啲地圖有得寫入去。",
            "俾一個資料夾，等啲地圖有得寫入去。",
            "需要一個資料夾，等啲地圖有得寫入去。",
            "呢度要一個資料夾，等啲地圖有得寫入去。",
            "呢度要一個資料夾，等啲地圖有得寫入去。空白格唔係一個地方嚟。",
        ],
    },
    "settings.storage.missingHint": {
        en: [
            "A render stopped because this folder was not there. Point it somewhere that exists and start the render again.",
            "A render stopped because this folder was not there. Point it somewhere that exists and start the render again.",
            "A render stopped because this folder was not there. Point it at somewhere that exists and start the render again.",
            "A render stopped because this folder was not there at all. Point it at somewhere that exists and start the render again.",
            "A render stopped because this folder was not there, and a render cannot write into a folder that is not there. Point it at somewhere that exists and start the render again.",
        ],
        yue: [
            "有個算圖停咗，因為呢個資料夾唔喺度。指去一個真係存在嘅位置，再開多次算圖。",
            "有個算圖停咗，因為呢個資料夾唔喺度。指去一個真係存在嘅位置，再開多次算圖。",
            "有個算圖停咗，因為呢個資料夾唔喺度。指去一個真係存在嘅地方，再開多次算圖。",
            "有個算圖停咗，因為呢個資料夾唔喺度，搵極都冇。指去一個真係存在嘅地方，再開多次算圖。",
            "有個算圖停咗，因為呢個資料夾唔喺度，而算圖係寫唔入一個唔存在嘅資料夾。指去一個真係存在嘅地方，再開多次算圖。",
        ],
    },
    "settings.storage.isDefault": {
        en: [
            "This is the default folder.",
            "This is the default folder.",
            "This is already the default folder.",
            "This is already the default folder, unchanged.",
            "This is already the default folder, exactly as it came out of the box.",
        ],
        yue: [
            "呢個係預設資料夾。",
            "呢個係預設資料夾。",
            "呢個已經係預設資料夾。",
            "呢個已經係預設資料夾，冇改過。",
            "呢個已經係預設資料夾，同出廠嗰陣一模一樣。",
        ],
    },
    /*
     * `{token}` is a real path token such as `%LOCALAPPDATA%`, and the note exists because
     * it looks exactly like a placeholder somebody is meant to replace by hand. Every level
     * says it is expanded when a render starts, which is the only thing that stops a reader
     * editing it into a literal path.
     */
    "settings.storage.tokenNote": {
        en: [
            "{token} is expanded when a render starts, so this is a real value rather than an example.",
            "{token} is expanded when a render starts, so this is a real value rather than an example.",
            "{token} is expanded when a render starts, so this is a real value and not an example.",
            "{token} is expanded when a render starts, so this is a real value and not an example to be replaced by hand.",
            "{token} is expanded when a render starts, so this is a real value and not an example. There is nothing here to swap out.",
        ],
        yue: [
            "{token} 會喺算圖開始嗰陣展開，所以呢個係真值，唔係例子。",
            "{token} 會喺算圖開始嗰陣展開，所以呢個係真值，唔係例子。",
            "{token} 會喺算圖開始嗰陣展開，所以呢個係真值，唔係一個例子。",
            "{token} 會喺算圖開始嗰陣展開，所以呢個係真值，唔係要你自己手動換走嘅例子。",
            "{token} 會喺算圖開始嗰陣展開，所以呢個係真值，唔係例子。冇嘢需要你換走。",
        ],
    },
    "settings.storage.unresolved": {
        en: [
            "This build cannot ask where that expands to on disk. The desktop app resolves it when a render starts.",
            "This build cannot ask where that expands to on disk. The desktop app resolves it when a render starts.",
            "This build cannot ask where that expands to on disk. The desktop app is what resolves it when a render starts.",
            "This build cannot ask where that expands to on disk. The desktop app is the one that resolves it when a render starts.",
            "This build cannot ask where that expands to on disk, so it is not going to guess. The desktop app resolves it when a render starts.",
        ],
        yue: [
            "呢個版本問唔到嗰個喺硬碟上面展開成咩。桌面程式會喺算圖開始嗰陣解出嚟。",
            "呢個版本問唔到嗰個喺硬碟上面展開成咩。桌面程式會喺算圖開始嗰陣解出嚟。",
            "呢個版本問唔到嗰個喺硬碟上面展開成咩。要靠桌面程式喺算圖開始嗰陣解出嚟。",
            "呢個版本問唔到嗰個喺硬碟上面展開成咩。解出嚟嗰個係桌面程式，喺算圖開始嗰陣做。",
            "呢個版本問唔到嗰個喺硬碟上面展開成咩，所以佢唔會亂估。桌面程式會喺算圖開始嗰陣解出嚟。",
        ],
    },
    "settings.storage.localOnly": {
        en: [
            "Saving records the choice for the map wizard. Moving the folder the desktop app renders into needs the desktop app.",
            "Saving records the choice for the map wizard. Moving the folder the desktop app renders into needs the desktop app.",
            "Saving records the choice for the map wizard. Moving the folder the desktop app renders into needs the desktop app itself.",
            "Saving records the choice for the map wizard, and no further. Moving the folder the desktop app renders into needs the desktop app itself.",
            "Saving records the choice for the map wizard, and that is as far as its arm reaches. Moving the folder the desktop app renders into needs the desktop app itself.",
        ],
        yue: [
            "儲存只係為地圖精靈記低呢個選擇。要搬桌面程式算圖寫入嘅資料夾，就要用桌面程式。",
            "儲存只係為地圖精靈記低呢個選擇。要搬桌面程式算圖寫入嘅資料夾，就要用桌面程式。",
            "儲存只係為地圖精靈記低呢個選擇。要搬桌面程式算圖寫入嘅資料夾，一定要用桌面程式本身。",
            "儲存只係為地圖精靈記低呢個選擇，去到咁上下。要搬桌面程式算圖寫入嘅資料夾，一定要用桌面程式本身。",
            "儲存只係為地圖精靈記低呢個選擇，佢隻手就伸到咁遠。要搬桌面程式算圖寫入嘅資料夾，一定要用桌面程式本身。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The world folder, which this screen deliberately cannot set       */
    /* ---------------------------------------------------------------- */

    /*
     * Three keys for one awkward truth: there is a World folder row on the settings screen
     * and it has nothing to change. Saying only "set it elsewhere" reads as a missing
     * feature, so every level says why as well: a map's world folder is part of what makes
     * it that map, and a map rendered from a different folder is a different map.
     */
    "settings.worldFolder.description": {
        en: [
            "The Minecraft world a map is rendered from. This is set per map in the map wizard rather than once for the whole app, so there is no folder to change on this screen.",
            "The Minecraft world a map is rendered from. This is set per map in the map wizard rather than once for the whole app, so there is no folder to change on this screen.",
            "The Minecraft world a map is rendered from. It is set per map in the map wizard rather than once for the whole app, so there is no folder to change on this screen.",
            "The Minecraft world a map is rendered from. It is set per map in the map wizard rather than once for the whole app, so there is no folder to change on this screen, only an explanation of why not.",
            "The Minecraft world a map is rendered from. It is set per map in the map wizard rather than once for the whole app, so there is no folder to change on this screen, only this paragraph standing where a control would be.",
        ],
        yue: [
            "算一張地圖嗰陣用嘅 Minecraft 世界。呢樣係喺地圖精靈度逐張地圖設定，唔係成個程式 set 一次，所以呢個畫面冇資料夾可以改。",
            "算一張地圖嗰陣用嘅 Minecraft 世界。呢樣係喺地圖精靈度逐張地圖設定，唔係成個程式 set 一次，所以呢個畫面冇資料夾可以改。",
            "算一張地圖嗰陣用嘅 Minecraft 世界。呢樣喺地圖精靈度逐張地圖設定，唔係成個程式 set 一次，所以呢個畫面冇資料夾可以改。",
            "算一張地圖嗰陣用嘅 Minecraft 世界。呢樣喺地圖精靈度逐張地圖設定，唔係成個程式 set 一次，所以呢個畫面冇資料夾可以改，得返一段解釋。",
            "算一張地圖嗰陣用嘅 Minecraft 世界。呢樣喺地圖精靈度逐張地圖設定，唔係成個程式 set 一次，所以呢個畫面冇資料夾可以改，得返呢段字企喺本來應該有個掣嘅位。",
        ],
    },
    "settings.worldFolder.perMap": {
        en: [
            "Each map has its own world folder, so there is no single one to set here. It is chosen on the first step of the map wizard, the step titled World, and stored with that map.",
            "Each map has its own world folder, so there is no single one to set here. It is chosen on the first step of the map wizard, the step titled World, and stored with that map.",
            "Each map has its own world folder, so there is no single one to set here. It is chosen on the first step of the map wizard, the step titled World, and kept with that map.",
            "Each map keeps its own world folder, so there is no single one to set here. It is chosen on the first step of the map wizard, the step titled World, and kept with that map.",
            "Each map keeps its own world folder, so there is no single one to set here, and this screen is not being coy about it. It is chosen on the first step of the map wizard, the step titled World, and kept with that map.",
        ],
        yue: [
            "每張地圖都有自己嘅世界資料夾，所以呢度冇單一個可以設定。佢係喺地圖精靈第一步度揀，即係標題叫 World 嗰步，同嗰張地圖一齊儲低。",
            "每張地圖都有自己嘅世界資料夾，所以呢度冇單一個可以設定。佢係喺地圖精靈第一步度揀，即係標題叫 World 嗰步，同嗰張地圖一齊儲低。",
            "每張地圖都有自己嘅世界資料夾，所以呢度冇單一個可以設定。佢喺地圖精靈第一步度揀，即係標題叫 World 嗰步，同嗰張地圖一齊儲低。",
            "每張地圖都有自己嘅世界資料夾，所以呢度冇單一個可以設定。佢喺地圖精靈第一步度揀，即係標題叫 World 嗰步，跟住嗰張地圖一齊儲低。",
            "每張地圖都有自己嘅世界資料夾，所以呢度冇單一個可以設定，唔係收埋唔俾你改。佢喺地圖精靈第一步度揀，即係標題叫 World 嗰步，跟住嗰張地圖一齊儲低。",
        ],
    },
    "settings.worldFolder.where": {
        en: [
            "To change it: close this panel, open Set up another map to make a new one, or edit that map's own world setting in the configuration editor. Rendering the same map again from a different folder makes it a different map, which is why it is asked for there rather than here.",
            "To change it: close this panel, open Set up another map to make a new one, or edit that map's own world setting in the configuration editor. Rendering the same map again from a different folder makes it a different map, which is why it is asked for there rather than here.",
            "To change it: close this panel, open Set up another map to make a new one, or edit that map's own world setting in the configuration editor. Rendering the same map again from a different folder makes it a different map, and that is why it is asked for there rather than here.",
            "To change it: close this panel, open Set up another map to make a new one, or edit that map's own world setting in the configuration editor. Rendering the same map again from a different folder makes it a different map, and that is the whole reason it is asked for there rather than here.",
            "To change it: close this panel, open Set up another map to make a new one, or edit that map's own world setting in the configuration editor. Rendering the same map again from a different folder makes it a different map, however identical it looks, which is why it is asked for there rather than here.",
        ],
        yue: [
            "想改嘅話：閂咗呢個面板，撳 Set up another map 開一張新嘅，或者喺設定編輯器度改嗰張地圖自己嘅世界設定。同一張地圖用另一個資料夾再算過，就係另一張地圖，所以呢樣係喺嗰邊問，唔係喺呢度問。",
            "想改嘅話：閂咗呢個面板，撳 Set up another map 開一張新嘅，或者喺設定編輯器度改嗰張地圖自己嘅世界設定。同一張地圖用另一個資料夾再算過，就係另一張地圖，所以呢樣係喺嗰邊問，唔係喺呢度問。",
            "想改嘅話：閂咗呢個面板，撳 Set up another map 開一張新嘅，或者喺設定編輯器度改嗰張地圖自己嘅世界設定。同一張地圖用另一個資料夾再算過，就已經係另一張地圖，所以呢樣係喺嗰邊問，唔係喺呢度問。",
            "想改嘅話：閂咗呢個面板，撳 Set up another map 開一張新嘅，或者喺設定編輯器度改嗰張地圖自己嘅世界設定。同一張地圖換個資料夾再算過，就已經係另一張地圖，所以呢樣一定係喺嗰邊問，唔係喺呢度問。",
            "想改嘅話：閂咗呢個面板，撳 Set up another map 開一張新嘅，或者喺設定編輯器度改嗰張地圖自己嘅世界設定。同一張地圖換個資料夾再算過，就已經係另一張地圖，就算睇落一模一樣都好，所以呢樣係喺嗰邊問，唔係喺呢度問。",
        ],
    },
    "settings.worldFolder.missingHint": {
        en: [
            "A render stopped because its world folder was not there any more. The folder may have been moved, renamed, or been on a drive that is not plugged in.",
            "A render stopped because its world folder was not there any more. The folder may have been moved, renamed, or been on a drive that is not plugged in.",
            "A render stopped because its world folder was not there any more. That folder may have been moved, renamed, or sitting on a drive that is not plugged in.",
            "A render stopped because its world folder was not there any more. That folder may have been moved, renamed, or left on a drive that is not plugged in.",
            "A render stopped because its world folder was not there any more. Folders do not wander off on their own, so it was moved, renamed, or left on a drive that is not plugged in.",
        ],
        yue: [
            "有個算圖停咗，因為佢個世界資料夾已經唔喺度。個資料夾可能俾人搬咗、改咗名，或者喺一個冇插住嘅磁碟上面。",
            "有個算圖停咗，因為佢個世界資料夾已經唔喺度。個資料夾可能俾人搬咗、改咗名，或者喺一個冇插住嘅磁碟上面。",
            "有個算圖停咗，因為佢個世界資料夾已經唔喺度。嗰個資料夾可能搬咗、改咗名，或者放咗喺一個冇插住嘅磁碟上面。",
            "有個算圖停咗，因為佢個世界資料夾已經唔喺度。嗰個資料夾可能搬咗、改咗名，或者留咗喺一個冇插住嘅磁碟上面。",
            "有個算圖停咗，因為佢個世界資料夾已經唔喺度。資料夾唔會自己行開，所以係搬咗、改咗名，又或者留咗喺一個冇插住嘅磁碟上面。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* Where the panels sit                                              */
    /* ---------------------------------------------------------------- */

    "settings.placement.description": {
        en: [
            "Every panel that docks to an edge remembers its own position: floating, or docked to the left, right, top or bottom. Each one is changed from its own title bar. This is where all of them are put back at once.",
            "Every panel that docks to an edge remembers its own position: floating, or docked to the left, right, top or bottom. Each one is changed from its own title bar. This is where all of them are put back at once.",
            "Every panel that docks to an edge remembers its own position: floating, or docked to the left, right, top or bottom. Each one is changed from its own title bar, and this is where all of them are put back at once.",
            "Every panel that docks to an edge remembers where you put it: floating, or docked to the left, right, top or bottom. Each one is changed from its own title bar. This is the one place all of them are put back at once.",
            "Every panel that docks to an edge remembers where you put it, and remembers it stubbornly: floating, or docked to the left, right, top or bottom. Each one is changed from its own title bar. This is the one place all of them are put back at once.",
        ],
        yue: [
            "每一個可以泊邊嘅面板都會記住自己嘅位置：浮動，或者泊左、右、上、下。每個都喺佢自己個標題列度改。呢度就係一次過將全部放返原位嘅地方。",
            "每一個可以泊邊嘅面板都會記住自己嘅位置：浮動，或者泊左、右、上、下。每個都喺佢自己個標題列度改。呢度就係一次過將全部放返原位嘅地方。",
            "每一個可以泊邊嘅面板都會記住自己嘅位置：浮動，或者泊左、右、上、下。每個都喺佢自己個標題列度改，而呢度就係一次過將全部放返原位嘅地方。",
            "每一個可以泊邊嘅面板都會記住你擺佢喺邊：浮動，或者泊左、右、上、下。每個都喺佢自己個標題列度改。呢度係唯一一個可以一次過將全部放返原位嘅地方。",
            "每一個可以泊邊嘅面板都會記住你擺佢喺邊，仲要記得好牢：浮動，或者泊左、右、上、下。每個都喺佢自己個標題列度改。呢度係唯一一個可以一次過將全部放返原位嘅地方。",
        ],
    },
    /*
     * An empty list here is not an empty feature. The reset below it still applies to every
     * panel that has ever been moved, closed ones included, so no level may let "no panel is
     * open" be read as "there is nothing to reset".
     */
    "settings.placement.none": {
        en: [
            "No panel is open right now. Each one carries its own placement control in its title bar, and the reset below still applies to every panel, open or not.",
            "No panel is open right now. Each one carries its own placement control in its title bar, and the reset below still applies to every panel, open or not.",
            "No panel is open right now. Each one carries its own placement control in its title bar, and the reset below still applies to every panel, open or closed.",
            "No panel is open right now. Each one carries its own placement control in its title bar, and the reset below applies to every panel, open or closed.",
            "No panel is open right now, so there is nothing here to list. Each one carries its own placement control in its title bar, and the reset below applies to every panel, open or closed.",
        ],
        yue: [
            "而家冇面板開住。每個面板嘅位置控制都喺佢自己個標題列度，而下面嘅重設對每一個面板都有效，開住定閂咗都一樣。",
            "而家冇面板開住。每個面板嘅位置控制都喺佢自己個標題列度，而下面嘅重設對每一個面板都有效，開住定閂咗都一樣。",
            "而家冇面板開住。每個面板嘅位置控制都喺佢自己個標題列度，下面嘅重設對每一個面板都有效，開住定閂咗都一樣。",
            "而家冇面板開住。每個面板嘅位置控制都喺佢自己個標題列度，下面嘅重設對每一個面板一律有效，開住定閂咗都一樣。",
            "而家冇面板開住，所以呢度冇嘢好列。每個面板嘅位置控制都喺佢自己個標題列度，下面嘅重設對每一個面板一律有效，開住定閂咗都一樣。",
        ],
    },
    "settings.placement.noneMoved": {
        en: [
            "No panel has been moved.",
            "No panel has been moved.",
            "No panel has been moved yet.",
            "No panel has been moved from where it started.",
            "No panel has been moved. Every one of them is exactly where it started.",
        ],
        yue: [
            "冇面板被移動過。",
            "冇面板被移動過。",
            "暫時冇面板被移動過。",
            "冇面板被移動過，全部都喺原本嘅位置。",
            "冇面板被移動過。每一個都好地地留喺佢開始嗰個位。",
        ],
    },
    "settings.placement.someMoved": {
        en: [
            "{n} panels have a remembered position, including any that are closed.",
            "{n} panels have a remembered position, including any that are closed.",
            "{n} panels have a remembered position, closed ones included.",
            "{n} panels have a remembered position, and that count includes any that are closed.",
            "{n} panels have a remembered position, and that count includes the closed ones, which remember just as stubbornly.",
        ],
        yue: [
            "有 {n} 個面板記住咗位置，包括閂咗嗰啲。",
            "有 {n} 個面板記住咗位置，包括閂咗嗰啲。",
            "有 {n} 個面板記住咗位置，閂咗嗰啲都計埋。",
            "有 {n} 個面板記住咗位置，呢個數包埋閂咗嗰啲。",
            "有 {n} 個面板記住咗位置，呢個數包埋閂咗嗰啲，佢哋記得一樣咁牢。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The Updates section                                               */
    /* ---------------------------------------------------------------- */

    /*
     * `settings.updates.title`/`.description`: the settings-surface tab that mounts
     * `UpdateStatusRow` -- installed version, last check, the feed, a manual check and the
     * recovery action for a dismissed banner. Merged in from `uiFixes.ts`'s own staging copy,
     * written alongside the fix that actually wires `UpdateStatusRow` into `AppSettings.vue`;
     * before that fix the component existed and was fully tested but was never reachable from
     * the running app. Three facts are pinned rather than one, because a reader deciding
     * whether to open this tab needs all three regardless of the funny level: this is where
     * you find out how current the build is (`last checked`), this is where you trigger a
     * check yourself (`by hand`) rather than only waiting on the background schedule, and this
     * is the one place a `dismissed` update banner comes back from.
     */
    "settings.updates.description": {
        en: [
            "Whether this build is up to date, when it last checked, and where updates come from. Check for updates by hand from here, and bring back an update banner you dismissed.",
            "Whether this build is up to date, when it last checked, and where updates come from. Check for updates by hand from here, and bring back an update banner you dismissed.",
            "Whether this build is up to date, when it last checked, and where updates come from. Check for updates by hand from here any time, and bring back an update banner you dismissed.",
            "The full story on this build's updates: current or not, when it last checked, and where updates come from. Check for updates by hand whenever you like, and bring back an update banner you dismissed, right from here.",
            "Everything this build knows about its own updates, all in one row: current or not, when it last checked, and where updates come from. Check for updates by hand whenever the mood strikes, and haul back an update banner you dismissed without lifting more than one finger.",
        ],
        yue: [
            "呢個版本係咪最新、幾時check過、更新喺邊度嚟，呢度都答到你。可以喺度手動check更新，亦都可以攞返一個你之前收埋咗嘅更新提示。",
            "呢個版本係咪最新、幾時check過、更新喺邊度嚟，呢度都答到你。可以喺度手動check更新，亦都可以攞返一個你之前收埋咗嘅更新提示。",
            "呢個版本係咪最新、幾時check過、更新喺邊度嚟，呢度都答到你。隨時都可以喺度手動check更新，呢度亦都係攞返一個你收埋咗嘅更新提示嘅地方。",
            "呢個版本嘅更新故事全部喺呢一行：新唔新、幾時check過、由邊度嚟。想幾時手動check都得，仲可以喺呢度攞返一個你收埋咗嘅更新提示。",
            "呢個版本嘅更新身家全部攤晒喺呢一行俾你睇：新唔新、幾時check過、成日打電話返嗰個地址係邊。心血來潮都可以手動check，仲可以唔使郁多隻手指就攞返一個你收埋咗嘅更新提示。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The cosmetic product display name                                 */
    /* ---------------------------------------------------------------- */

    "settings.productName.hint": {
        en: [
            "Shown in the title bar, About, notifications and introductions.",
            "Shown in the title bar, About, notifications and introductions.",
            "Shown in the title bar, About, notifications and introductions.",
            "Shown in the title bar, About, notifications and introductions; the app changes its badge, not its passport.",
            "Shown in the title bar, About, notifications and introductions; the app can change its name tag without moving house.",
        ],
        yue: [
            "會顯示喺標題列、關於、通知同介紹入面。",
            "會顯示喺標題列、關於、通知同介紹入面。",
            "會顯示喺標題列、關於、通知同介紹入面。",
            "會顯示喺標題列、關於、通知同介紹入面；換名牌，唔係換身份證。",
            "會顯示喺標題列、關於、通知同介紹入面；個 app 可以換胸牌，唔使連屋都搬埋。",
        ],
    },
    "settings.productName.boundary": {
        en: [
            "This changes presentation only. The data folder, installer, packages, update feed, repository markers and diagnostic product name remain Worldlens.",
            "This changes presentation only. The data folder, installer, packages, update feed, repository markers and diagnostic product name remain Worldlens.",
            "This changes presentation only. The data folder, installer, packages, update feed, repository markers and diagnostic product name all remain Worldlens.",
            "This changes presentation only. The data folder, installer, packages, update feed, repository markers and diagnostic product name stay Worldlens; none of the machinery follows the new sign.",
            "This changes presentation only. The data folder, installer, packages, update feed, repository markers and diagnostic product name stay Worldlens; the sign may sparkle, but the machinery keeps its legal name.",
        ],
        yue: [
            "呢個只會改顯示。資料夾、安裝程式、packages、更新 feed、repository markers 同診斷產品名仍然係 Worldlens。",
            "呢個只會改顯示。資料夾、安裝程式、packages、更新 feed、repository markers 同診斷產品名仍然係 Worldlens。",
            "呢個只會改顯示。資料夾、安裝程式、packages、更新 feed、repository markers 同診斷產品名全部仍然係 Worldlens。",
            "呢個只會改顯示。資料夾、安裝程式、packages、更新 feed、repository markers 同診斷產品名照樣係 Worldlens；機器唔會跟住新招牌搬屋。",
            "呢個只會改顯示。資料夾、安裝程式、packages、更新 feed、repository markers 同診斷產品名照樣係 Worldlens；招牌可以閃令令，機器身份證一個字都唔郁。",
        ],
    },
    "settings.productName.default": {
        en: [
            "Current value: the built-in name Worldlens.",
            "Current value: the built-in name Worldlens.",
            "Current value: the built-in name Worldlens.",
            "Current value: the built-in name Worldlens, straight from the box.",
            "Current value: the built-in name Worldlens; the name tag is still wearing factory clothes.",
        ],
        yue: [
            "目前值：內置名稱 Worldlens。",
            "目前值：內置名稱 Worldlens。",
            "目前值：內置名稱 Worldlens。",
            "目前值：內置名稱 Worldlens，原裝出廠。",
            "目前值：內置名稱 Worldlens；塊名牌仲着住原廠套衫。",
        ],
    },
    "settings.productName.saved": {
        en: [
            "Current value: {name}, saved on this device.",
            "Current value: {name}, saved on this device.",
            "Current value: {name}, saved on this device.",
            "Current value: {name}, saved on this device and ready for the next launch.",
            "Current value: {name}, saved on this device; the new name tag will report for duty next launch too.",
        ],
        yue: [
            "目前值：{name}，已儲存喺呢部裝置。",
            "目前值：{name}，已儲存喺呢部裝置。",
            "目前值：{name}，已儲存喺呢部裝置。",
            "目前值：{name}，已儲存喺呢部裝置，下次開機都會用。",
            "目前值：{name}，已儲存喺呢部裝置；塊新名牌下次開機都會準時返工。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The History section                                               */
    /* ---------------------------------------------------------------- */

    /*
     * `settings.history.description`: the tab that mounts `SimpleHistoryList` twice, once
     * for the server-profile list and once for the application settings. Both facts pinned
     * at every level are the two things that make this tab worth opening rather than a
     * curiosity: `restorable` (a deleted profile or setting is not actually gone), and
     * `recorded first` (restoring is never destructive, because what it replaces becomes a
     * revision of its own before anything is overwritten - the same guarantee
     * `docs/config-history.md` states for the config-folder history this tab's little
     * sibling was built from).
     */
    "settings.history.description": {
        en: [
            "Every saved version of your server profiles and your application settings, each one restorable. Restoring is never destructive: what it replaces is recorded first, so it can always be undone.",
            "Every saved version of your server profiles and your application settings, each one restorable. Restoring is never destructive: what it replaces is recorded first, so it can always be undone.",
            "Every saved version of your server profiles and your application settings lives here, each one restorable. Restoring is never destructive - what it replaces is recorded first, so it can always be undone.",
            "Every saved version of your server profiles and your application settings lives here, and every one of them is restorable. Restoring is never destructive, because what it replaces is recorded first, as its own revision, so it can always be undone in turn.",
            "Every saved version of your server profiles and your application settings lives here, and every single one of them is restorable. Restoring is never destructive, because what it replaces is recorded first, as a revision in its own right, so even a restore can always be undone.",
        ],
        yue: [
            "呢度有你伺服器設定檔同應用程式設定嘅每一個已儲存版本，個個都還原得返。還原永遠唔會破壞嘢：佢換走嘅嗰個會事先記低，所以永遠都可以反悔。",
            "呢度有你伺服器設定檔同應用程式設定嘅每一個已儲存版本，個個都還原得返。還原永遠唔會破壞嘢：佢換走嘅嗰個會事先記低，所以永遠都可以反悔。",
            "呢度存住你伺服器設定檔同應用程式設定嘅每一個版本，個個都還原得返。還原唔會破壞嘢，佢換走嗰個會事先記低，所以隨時都可以反悔。",
            "呢度存住你伺服器設定檔同應用程式設定嘅每一個版本，個個都還原得返。還原永遠唔會破壞嘢，因為佢換走嗰個會事先記低成一個獨立版本，所以隨時都可以反悔。",
            "呢度存住你伺服器設定檔同應用程式設定嘅每一個版本，一個都唔漏，個個都還原得返。還原永遠唔會破壞嘢，因為佢換走嗰個會事先記低成一個版本，所以就算係還原本身，都一樣可以反悔。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The Diagnostics section                                           */
    /* ---------------------------------------------------------------- */

    /*
     * `settings.diagnostics.description`: the tab that mounts `RepairPanel`, per
     * `docs/automatic-repair.md`. Two facts pinned at every level: deterministic diagnosis
     * comes first and no model is involved in it at all, and every change the guardrailed
     * last resort makes is recorded so it can be undone - the two things that make this
     * tab trustworthy rather than merely present.
     */
    "settings.diagnostics.description": {
        en: [
            "Why a render or the web server failed to start, worked out from what was actually observed, with no model involved unless a local coding agent is installed and switched on. Every change it makes is recorded in the version history above, so it can be undone.",
            "Why a render or the web server failed to start, worked out from what was actually observed, with no model involved unless a local coding agent is installed and switched on. Every change it makes is recorded in the version history above, so it can be undone.",
            "Why a render or the web server failed to start, worked out from what was actually observed - no model is involved unless a local coding agent is installed and switched on. Every change it makes is recorded in the version history above, so it can be undone.",
            "Why a render or the web server failed to start, worked out from what was actually observed rather than guessed at. No model is involved at all unless a local coding agent is installed and switched on, and every change it makes is recorded in the version history above, so it can always be undone.",
            "Why a render or the web server failed to start, worked out from what was actually observed rather than guessed at. No model gets anywhere near it unless a local coding agent is installed and deliberately switched on, and every single change it makes is recorded in the version history above, so it can always be undone.",
        ],
        yue: [
            "點解一次 render 或者 web server 開唔到，係由實際觀察到嘅嘢推斷出嚟，除非裝咗本機 coding agent 仲開咗，先會有 model 牽涉入面。佢做嘅每一個改動都記錄喺上面嗰個版本記錄度，隨時還原得返。",
            "點解一次 render 或者 web server 開唔到，係由實際觀察到嘅嘢推斷出嚟，除非裝咗本機 coding agent 仲開咗，先會有 model 牽涉入面。佢做嘅每一個改動都記錄喺上面嗰個版本記錄度，隨時還原得返。",
            "點解一次 render 或者 web server 開唔到，係由實際觀察到嘅嘢推斷出嚟，唔係靠估。除非裝咗本機 coding agent 仲開咗，唔會有 model 牽涉入面。佢做嘅每一個改動都記錄喺上面嗰個版本記錄度，隨時還原得返。",
            "點解一次 render 或者 web server 開唔到，係由實際觀察到嘅嘢推斷出嚟，唔係靠估。除非裝咗本機 coding agent 仲特登開咗，完全唔會有 model 埋身，佢做嘅每一個改動都會記錄喺上面嗰個版本記錄度，隨時都可以反悔。",
            "點解一次 render 或者 web server 開唔到，係由實際觀察到嘅嘢推斷出嚟，唔係靠估。除非裝咗本機 coding agent 仲特登開咗，唔會有半隻 model 埋到身，佢做嘅每一個改動都會記錄喺上面嗰個版本記錄度，隨時都可以反悔。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The Render memory section                                         */
    /* ---------------------------------------------------------------- */

    /*
     * `settings.renderMemory.description`: the tab that mounts `RenderMemoryRow`, the
     * control for `files/renderMemory.ts`'s `-Xmx` ceiling - a setting that had a real
     * store, real validation and a real IPC channel from the day it was written, and
     * exactly one caller: a unit test. `render/orchestrator.ts`'s `jvmArgs` option is what
     * finally lets a render read it. "Automatic" and "Manual" are pinned in both languages
     * at every level because they are this row's own two named modes, not incidental words -
     * a level that stopped naming one of them would leave a reader unable to find the
     * button the sentence is describing.
     */
    "settings.renderMemory.description": {
        en: [
            "How much memory the render process may use, as a JVM heap ceiling. Automatic works out a sensible number from this machine's own memory; Manual lets you set your own.",
            "How much memory the render process may use, as a JVM heap ceiling. Automatic works out a sensible number from this machine's own memory; Manual lets you set your own.",
            "How much memory the render process may use, as a JVM heap ceiling. Automatic works out a sensible number from this machine's own memory; Manual lets you set your own instead.",
            "How much memory a render is allowed to use, as a hard JVM heap ceiling. Automatic, the default, works out a sensible number from this machine's own memory; switch to Manual and pick your own whenever you know better.",
            "How much memory a render is allowed to gobble, as a hard JVM heap ceiling. Automatic, the default and the polite choice, works out a sensible number from this machine's own memory; flip to Manual and pick your own number whenever you reckon you know better than the app does.",
        ],
        yue: [
            "算圖進程可以用幾多記憶體，即係 JVM heap 上限。Automatic 會按呢部機自己嘅記憶體計出一個合理數值；Manual 就俾你自己揀。",
            "算圖進程可以用幾多記憶體，即係 JVM heap 上限。Automatic 會按呢部機自己嘅記憶體計出一個合理數值；Manual 就俾你自己揀。",
            "算圖進程可以用幾多記憶體，即係 JVM heap 上限。Automatic 會按呢部機自己嘅記憶體計出一個合理數值；想自己揀就用 Manual。",
            "一次算圖可以用幾多記憶體，即係一個實實在在嘅 JVM heap 上限。Automatic（預設）會按呢部機自己嘅記憶體計出個合理數；想自己話事就轉去 Manual 揀個數。",
            "一次算圖可以食幾多記憶體，即係一個實實在在嘅 JVM heap 上限。Automatic（預設，亦係最斯文嗰個選擇）會按呢部機自己嘅記憶體計出個合理數；覺得自己叻過個 app 就轉去 Manual 自己揀個數。",
        ],
    },
    /* Shown instead of the controls on a build with no main process to ask, e.g. a browser tab. */
    "settings.renderMemory.unsupported": {
        en: [
            "This build cannot report or change how much memory a render may use. Nothing is wrong with the setting; the app has no way to ask about it from this screen yet.",
            "This build cannot report or change how much memory a render may use. Nothing is wrong with the setting; the app has no way to ask about it from this screen yet.",
            "This build cannot report or change how much memory a render may use. Nothing is wrong with the setting - the app just has no way to ask about it from this screen yet.",
            "This build has no way to report or change how much memory a render may use. Nothing is wrong with the setting itself; this screen simply cannot ask the question yet.",
            "This build has no way to report or change how much memory a render may use, full stop. Nothing is wrong with the setting itself; this screen just cannot ask the question yet, so do not go blaming the poor JVM.",
        ],
        yue: [
            "呢個版本冇辦法睇到或者改動一次算圖可以用幾多記憶體。個設定冇壞；只不過呢個畫面暫時仲問唔到呢個問題。",
            "呢個版本冇辦法睇到或者改動一次算圖可以用幾多記憶體。個設定冇壞；只不過呢個畫面暫時仲問唔到呢個問題。",
            "呢個版本冇辦法睇到或者改動一次算圖可以用幾多記憶體。個設定本身冇壞，淨係呢個畫面暫時仲問唔到呢個問題。",
            "呢個版本完全冇辦法睇到或者改動一次算圖可以用幾多記憶體。個設定本身冇壞，只係呢個畫面而家問唔到呢個問題。",
            "呢個版本完全冇辦法睇到或者改動一次算圖可以用幾多記憶體，齊晒。個設定本身冇壞，淨係呢個畫面而家問唔到呢條問題，唔關 JVM 事。",
        ],
    },
    /* Shown alongside the controls when this build can read the ceiling but not write it. */
    "settings.renderMemory.readOnly": {
        en: [
            "This build can show the ceiling but cannot change it. The desktop app owns that setting; a browser tab has no access to it.",
            "This build can show the ceiling but cannot change it. The desktop app owns that setting; a browser tab has no access to it.",
            "This build can show the ceiling but cannot change it. The desktop app owns that setting, and a browser tab has no access to it.",
            "This build can show the ceiling, but cannot change it. The desktop app owns that setting, and a browser tab simply has no access to it.",
            "This build can show the ceiling all it likes, but cannot change it. The desktop app owns that setting, and a browser tab has no access to it whatsoever.",
        ],
        yue: [
            "呢個版本可以顯示個上限，但係改唔到。呢個設定由桌面版負責，網頁分頁冇權限改。",
            "呢個版本可以顯示個上限，但係改唔到。呢個設定由桌面版負責，網頁分頁冇權限改。",
            "呢個版本可以顯示個上限，不過改唔到。呢個設定歸桌面版管，網頁分頁冇權限改佢。",
            "呢個版本淨係顯示到個上限，改唔到。呢個設定歸桌面版管，網頁分頁完全冇權限改。",
            "呢個版本鍾意點顯示個上限都得，總之就係改唔到。呢個設定歸桌面版管，網頁分頁一啲權限都冇。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The Notification duration section                                 */
    /* ---------------------------------------------------------------- */

    /*
     * `settings.noticeDuration.description`: the tab that mounts `NotificationDurationRow`,
     * the novice dial over `notifications.ts`'s `INFO_TIMEOUT_MS` / `SUCCESS_TIMEOUT_MS` -
     * two numbers every reader used to be stuck with regardless of how quickly they
     * actually read a toast. "Warnings and errors" and "stay until" are pinned at every
     * level because the one fact this description exists to state is that the dial never
     * touches those two - a level that dropped it would leave a reader believing they had
     * just made every error on the app auto-dismiss.
     */
    /* Every level's own summary of what it sets. `{info}`/`{success}` are the exact seconds, always. */
    "settings.noticeDuration.levelSummary": {
        en: [
            "Informational toasts stay {info} seconds; success toasts stay {success} seconds.",
            "Informational toasts stay {info} seconds; success toasts stay {success} seconds.",
            "Informational toasts stay {info} seconds; success toasts stay {success} seconds.",
            "Sets informational toasts to stay {info} seconds and success toasts to stay {success} seconds. Nothing else moves.",
            "Sets informational toasts to linger for {info} seconds and success toasts for {success} seconds, precisely. Nothing else moves, promise.",
        ],
        yue: [
            "資訊提示留 {info} 秒；成功提示留 {success} 秒。",
            "資訊提示留 {info} 秒；成功提示留 {success} 秒。",
            "資訊提示留 {info} 秒；成功提示留 {success} 秒。",
            "將資訊提示設做留 {info} 秒，成功提示留 {success} 秒。第二樣嘢一律唔會郁。",
            "將資訊提示精準咁設做留 {info} 秒，成功提示留 {success} 秒。第二樣嘢實牙實齒唔會郁，講得出做得到。",
        ],
    },
    /* Level 5 specifically: both timeouts become null, so this is what is said instead of a number. */
    "settings.noticeDuration.levelSummaryPersistent": {
        en: [
            "Informational and success toasts stay on screen until you dismiss them, exactly like a warning or an error already does.",
            "Informational and success toasts stay on screen until you dismiss them, exactly like a warning or an error already does.",
            "Informational and success toasts stay on screen until you dismiss them, exactly like a warning or an error already does.",
            "Informational and success toasts stay on screen until you dismiss them yourself, exactly the way a warning or an error already behaves.",
            "Informational and success toasts sit there and wait, staying on screen until you personally dismiss them, exactly the way a warning or an error already behaves, no exceptions.",
        ],
        yue: [
            "資訊同成功提示會一直留喺畫面度，直到你自己收埋為止，同警告同錯誤而家嘅做法一樣。",
            "資訊同成功提示會一直留喺畫面度，直到你自己收埋為止，同警告同錯誤而家嘅做法一樣。",
            "資訊同成功提示會一直留喺畫面度，直到你自己收埋為止，同警告同錯誤而家嘅做法一樣。",
            "資訊同成功提示會一直留喺畫面度，直到你親手收埋為止，同警告同錯誤而家嘅做法一模一樣。",
            "資訊同成功提示會死賴喺畫面度唔走，直到你親手收埋為止，同警告同錯誤而家嘅做法一模一樣，冇得例外。",
        ],
    },

    /* ---------------------------------------------------------------- */
    /* The Download concurrency section                                  */
    /* ---------------------------------------------------------------- */

    /*
     * `settings.downloadConcurrency.description`: the tab that mounts
     * `DownloadConcurrencyRow`, the control for `files/downloadConcurrency.ts`'s worker
     * count - a setting `download/downloader.ts` had always accepted correctly, but only
     * as a plain number frozen the moment the app launched, so writing a new one from
     * Settings would have changed nothing until a restart. "Four" is pinned at every level
     * because it is the one number that is a fact rather than a live reading - the shipped
     * default, unchanged by this control existing - and "at once" is pinned because the
     * whole sentence is about concurrency, not about total speed.
     */
    "settings.downloadConcurrency.description": {
        en: [
            "How many release-asset parts a download fetches at once, four by default: more at once can finish a fast connection sooner, and fewer means a dropped connection costs less and the disk is not asked to write several parts at once.",
            "How many release-asset parts a download fetches at once, four by default: more at once can finish a fast connection sooner, and fewer means a dropped connection costs less and the disk is not asked to write several parts at once.",
            "How many release-asset parts a download fetches at once, four by default. More at once can finish a fast connection sooner; fewer means a dropped connection costs less and the disk is not asked to write several parts at once - the number to lower on a slow or flaky connection.",
            "How many release-asset parts a download pulls down at once, four by default and untouched unless you say otherwise. Push it up on a fast, honest connection and things finish sooner; pull it down on a slow or metered one so a dropped connection only costs one part instead of several, and the disk is never asked to write more than one at once.",
            "How many release-asset parts a download tries to grab at once, four by default and nobody has complained about that number yet. Crank it up on a fast, honest connection and watch things finish sooner; dial it right back down on a slow, flaky or metered one, so a dropped connection only ever costs one part rather than several, and the poor disk is never asked to write more than one of them at once.",
        ],
        yue: [
            "一次下載可以同時攞幾多個 release-asset part。預設係四個：攞多啲喺快嘅連線上完成得快啲，攞少啲就萬一斷咗都蝕少啲，個磁碟又唔使同一時間寫幾個 part。",
            "一次下載可以同時攞幾多個 release-asset part。預設係四個：攞多啲喺快嘅連線上完成得快啲，攞少啲就萬一斷咗都蝕少啲，個磁碟又唔使同一時間寫幾個 part。",
            "一次下載可以同時攞幾多個 release-asset part，預設四個。攞多啲喺快連線上完成得快啲；攞少啲就斷線蝕少啲，個磁碟又唔使同一時間寫幾個 part，連線慢或者唔穩就撳細啲。",
            "一次下載想同時攞幾多個 release-asset part，預設四個，冇改過就一直係咁。連線快又靠得住就撳大啲，完成得快；連線慢或者計流量就撳細啲，斷咗都淨係蝕一個 part 唔係幾個，個磁碟亦都唔使同一時間寫幾份。",
            "一次下載想同時扯幾多個 release-asset part，預設四個，一直冇人投訴過呢個數。連線又快又老實就撳大啲，睇住佢完成得快；連線慢、唔穩定或者計緊流量就撳細啲，咁斷線都淨係蝕一個 part 唔使蝕成班，個磁碟都唔使同一時間死命寫幾份。",
        ],
    },
    /* Shown instead of the controls on a build with no main process to ask, e.g. a browser tab. */
    "settings.downloadConcurrency.unsupported": {
        en: [
            "This build cannot report or change how many parts a download fetches at once. Nothing is wrong with the setting; the app has no way to ask about it from this screen yet.",
            "This build cannot report or change how many parts a download fetches at once. Nothing is wrong with the setting; the app has no way to ask about it from this screen yet.",
            "This build cannot report or change how many parts a download fetches at once. Nothing is wrong with the setting - the app just has no way to ask about it from this screen yet.",
            "This build has no way to report or change how many parts a download fetches at once. Nothing is wrong with the setting itself; this screen simply cannot ask the question yet.",
            "This build has no way to report or change how many parts a download fetches at once, full stop. Nothing is wrong with the setting itself; this screen just cannot ask the question yet, so do not go blaming the poor downloader.",
        ],
        yue: [
            "呢個版本冇辦法睇到或者改動一次下載同時攞幾多個 part。個設定冇壞；只不過呢個畫面暫時仲問唔到呢個問題。",
            "呢個版本冇辦法睇到或者改動一次下載同時攞幾多個 part。個設定冇壞；只不過呢個畫面暫時仲問唔到呢個問題。",
            "呢個版本冇辦法睇到或者改動一次下載同時攞幾多個 part。個設定本身冇壞，淨係呢個畫面暫時仲問唔到呢個問題。",
            "呢個版本完全冇辦法睇到或者改動一次下載同時攞幾多個 part。個設定本身冇壞，只係呢個畫面而家問唔到呢個問題。",
            "呢個版本完全冇辦法睇到或者改動一次下載同時攞幾多個 part，齊晒。個設定本身冇壞，淨係呢個畫面而家問唔到呢條問題，唔關個 downloader 事。",
        ],
    },
    /* Shown alongside the controls when this build can read the count but not write it. */
    "settings.downloadConcurrency.readOnly": {
        en: [
            "This build can show the count but cannot change it. The desktop app owns that setting; a browser tab has no access to it.",
            "This build can show the count but cannot change it. The desktop app owns that setting; a browser tab has no access to it.",
            "This build can show the count but cannot change it. The desktop app owns that setting, and a browser tab has no access to it.",
            "This build can show the count, but cannot change it. The desktop app owns that setting, and a browser tab simply has no access to it.",
            "This build can show the count all it likes, but cannot change it. The desktop app owns that setting, and a browser tab has no access to it whatsoever.",
        ],
        yue: [
            "呢個版本可以顯示個數量，但係改唔到。呢個設定由桌面版負責，網頁分頁冇權限改。",
            "呢個版本可以顯示個數量，但係改唔到。呢個設定由桌面版負責，網頁分頁冇權限改。",
            "呢個版本可以顯示個數量，不過改唔到。呢個設定歸桌面版管，網頁分頁冇權限改佢。",
            "呢個版本淨係顯示到個數量，改唔到。呢個設定歸桌面版管，網頁分頁完全冇權限改。",
            "呢個版本鍾意點顯示個數量都得，總之就係改唔到。呢個設定歸桌面版管，網頁分頁一啲權限都冇。",
        ],
    },
    /* ---------------------------------------------------------------- */
    /* Display and ease of use                                           */
    /* ---------------------------------------------------------------- */

    /*
     * The facts here are the two safety-relevant promises: the dial tops out at double
     * the designed size (so nobody is told it can do more), and every choice is
     * remembered (so nobody re-does it per launch). The theme summary additionally keeps
     * all four choice names and "low vision" at every level - a high-contrast scheme
     * whose description gets too funny to name who it is for has stopped being a
     * description.
     */
    "settings.display.description": {
        en: [
            "How big everything is drawn, from the designed size up to double it, and whether the app is dark, light, high-contrast, or follows this computer. Both apply immediately and are remembered.",
            "How big everything is drawn, from the designed size up to double it, and whether the app is dark, light, high-contrast, or follows this computer. Both apply immediately and are remembered.",
            "How big everything is drawn - from the designed size up to double it - and whether the app is dark, light, high-contrast, or follows this computer. Both apply the moment you choose, and both are remembered.",
            "Make everything bigger, up to double the designed size, and pick dark, light, high-contrast, or whatever this computer prefers. Changes land immediately and are remembered.",
            "Make the whole interface bigger, up to double its designed size, and dress it dark, light, high-contrast, or however this computer likes it. Every change lands the instant you choose it, and is remembered forever after.",
        ],
        yue: [
            "成個介面畫幾大：由設計原本嘅大細，最多去到兩倍；仲有個 app 係暗色、淺色、高對比，定係跟返部電腦。兩樣都即時生效，並且會記住。",
            "成個介面畫幾大：由設計原本嘅大細，最多去到兩倍；仲有個 app 係暗色、淺色、高對比，定係跟返部電腦。兩樣都即時生效，並且會記住。",
            "成個介面畫幾大：由原本大細最多去到兩倍，同埋個 app 着暗色、淺色、高對比，定係跟部電腦。一揀即刻生效，仲會記住。",
            "想咩都大啲？最多放到原本兩倍。想暗色、淺色、高對比，定跟電腦？隨你。一揀就生效，會記住。",
            "成個介面任你放大，最多去到原本兩倍；暗色、淺色、高對比、跟電腦，鍾意着邊件着邊件。一揀即刻上身，仲會乖乖記住。",
        ],
    },
    "settings.uiSize.summary": {
        en: [
            "Everything is drawn at {percent}% of its designed size: text, buttons, icons and the map alike. The change applies immediately and is remembered.",
            "Everything is drawn at {percent}% of its designed size: text, buttons, icons and the map alike. The change applies immediately and is remembered.",
            "Everything is drawn at {percent}% of its designed size - text, buttons, icons and the map alike. It applies immediately and is remembered.",
            "Everything on screen is drawn at {percent}% of its designed size, map included. It takes effect immediately and is remembered.",
            "The whole show is drawn at {percent}% of its designed size - every letter, button, icon and the map itself. It lands immediately and is remembered, no restart, no ceremony.",
        ],
        yue: [
            "而家所有嘢都用設計大細嘅 {percent}% 嚟畫：文字、按鈕、圖示同埋幅地圖都一樣。改動即時生效，會記住。",
            "而家所有嘢都用設計大細嘅 {percent}% 嚟畫：文字、按鈕、圖示同埋幅地圖都一樣。改動即時生效，會記住。",
            "所有嘢而家用設計大細嘅 {percent}% 嚟畫：文字、按鈕、圖示連幅地圖都係。即時生效，會記住。",
            "畫面上所有嘢而家係 {percent}%，連幅地圖都計埋。即刻生效，會記住。",
            "成台戲而家用 {percent}% 上演：每粒字、每粒掣、每個圖示連幅地圖都放埋一份。即刻生效，乖乖記住，唔使重開，唔使拜神。",
        ],
    },
    "settings.display.themeSummary": {
        en: [
            "System follows this computer's own light-or-dark choice. Contrast is a high-contrast scheme built for low vision. The same control lives in the open map's own settings menu, and the two always agree.",
            "System follows this computer's own light-or-dark choice. Contrast is a high-contrast scheme built for low vision. The same control lives in the open map's own settings menu, and the two always agree.",
            "System follows this computer's own light-or-dark choice, and Contrast is a high-contrast scheme built for low vision. The open map's own settings menu offers the same control, and the two always agree.",
            "System simply copies whatever this computer prefers, light or dark. Contrast is a high-contrast scheme built for low vision. The open map's settings menu has the same control, and the two always agree.",
            "System copies whatever this computer is in the mood for, light or dark. Contrast is the high-contrast scheme built for low vision, no apologies. The open map's own settings menu carries the very same control, and the two always agree - no theme drama here.",
        ],
        yue: [
            "「系統」會跟返部電腦自己揀嘅光暗。「高對比」係為低視力而設嘅高對比配色。開咗嘅地圖入面嘅設定選單都有同一個控制，兩邊永遠一致。",
            "「系統」會跟返部電腦自己揀嘅光暗。「高對比」係為低視力而設嘅高對比配色。開咗嘅地圖入面嘅設定選單都有同一個控制，兩邊永遠一致。",
            "「系統」跟返部電腦自己嘅光暗選擇；「高對比」係為低視力而設嘅配色。開咗嘅地圖嘅設定選單都有同一個控制，兩邊永遠一致。",
            "「系統」即係部電腦話光就光、話暗就暗。「高對比」係為低視力而設。地圖入面嘅設定選單都有呢個控制，兩邊實一致。",
            "「系統」即係部電腦今日心情話事，話光就光話暗就暗。「高對比」就係為低視力朋友度身訂造，冇得傾。地圖入面嘅設定選單都有一模一樣嘅控制，兩邊永遠一致，夾到天衣無縫。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const SETTINGS_FIXED = {
    /* The settings screen itself. */
    "settings.body": { en: "All settings", yue: "所有設定" },
    "settings.search.label": { en: "Search settings", yue: "搜尋設定" },
    "settings.search.hint": {
        en: "name, explanation, or a value on screen",
        yue: "名稱、說明，或者畫面上見到嘅值",
    },

    /* The cosmetic product display-name row. */
    "settings.productName.label": {
        en: "Name shown by the app",
        yue: "個 app 顯示嘅名稱",
    },
    "settings.productName.save": {
        en: "Use this display name",
        yue: "用呢個顯示名稱",
    },
    "settings.productName.reset": {
        en: "Reset to Worldlens",
        yue: "重設做 Worldlens",
    },

    /* The docked panel's own chrome. */
    "dock.chooser.list": { en: "Placement", yue: "位置" },
    "dock.chooser.reset": { en: "Reset", yue: "重設" },
    "dock.reset.one": { en: "Put {title} back where it started", yue: "將 {title} 放返原本個位" },
    "dock.reset.all": {
        en: "Put every panel back where it started",
        yue: "將每個面板放返原本個位",
    },
    "dock.close": { en: "Close {title}", yue: "閂咗 {title}" },
    "dock.body": { en: "{title} contents", yue: "{title} 嘅內容" },

    /*
     * These five are labels in the placement menu and values in the placement list, and are
     * also what `dock.adjusted.floating` interpolates as `{edge}`. Keep them readable as a
     * standalone answer to "where does this sit", because that is how they are read there.
     */
    "dock.placement.floating": { en: "Floating panel", yue: "浮動面板" },
    "dock.placement.left": { en: "Docked to the left", yue: "泊咗喺左邊" },
    "dock.placement.right": { en: "Docked to the right", yue: "泊咗喺右邊" },
    "dock.placement.top": { en: "Docked to the top", yue: "泊咗喺頂" },
    "dock.placement.bottom": { en: "Docked to the bottom", yue: "泊咗喺底" },

    /* The Java runtime row's field names. */
    "settings.java.loading": { en: "Looking for a Java runtime…", yue: "搵緊 Java 執行環境…" },
    "settings.java.version": { en: "Version", yue: "版本" },
    "settings.java.source": { en: "Found through", yue: "點樣搵到" },
    "settings.java.executable": { en: "Executable", yue: "執行檔" },
    "settings.java.runtime": { en: "Runtime", yue: "執行環境" },
    /* The heading over the candidates the app ran and rejected, so it keeps both halves. */
    "settings.java.checked": { en: "Checked, and turned down:", yue: "查過但係唔收：" },
    "settings.java.recheck": { en: "Look again", yue: "再搵過" },

    /* The storage row. */
    "settings.storage.field": { en: "Folder for rendered maps", yue: "算好嘅地圖放邊個資料夾" },
    "settings.storage.useDefault": { en: "Use the default", yue: "用預設嗰個" },
    "settings.storage.revert": { en: "Undo the change", yue: "還原改動" },
    "settings.storage.save": { en: "Save this folder", yue: "儲存呢個資料夾" },
    "settings.storage.resolved": { en: "Maps are written to", yue: "地圖會寫入去" },
    "settings.storage.resolvedDefault": { en: "The default folder is", yue: "預設資料夾係" },

    /* The world folder row, whose only control is its title. */
    "settings.worldFolder.title": { en: "World folder", yue: "世界資料夾" },

    /* The placement list. */
    "settings.placement.title": { en: "Where the panels sit", yue: "啲面板擺喺邊" },
    "settings.placement.moved": { en: "Moved", yue: "已移動" },
    "settings.placement.groupLabel": { en: "Where {title} sits", yue: "{title} 擺喺邊" },

    /*
     * The accessible name of the settings window's own tab strip. Settings is tabbed like
     * every other surface, so its strip needs a name that says which strip it is: a screen
     * reader that announces two unnamed tab lists on one screen has announced nothing.
     */
    "settings.tabs.strip": { en: "Settings sections", yue: "設定分區" },

    /* The Updates tab's own heading, above `settings.updates.description`. */
    "settings.updates.title": { en: "Updates", yue: "更新" },
    /* The personal-vocabulary section's own heading, beside the other section headings so
     * there is one place a section title is written rather than two. */
    "settings.vocabulary.title": { en: "Personal vocabulary", yue: "個人詞彙" },
    "settings.vocabulary.description": {
        en: "A private JSON file of your own wording, read only on this computer.",
        yue: "一個你自己嘅私人 JSON 詞彙檔案，淨係喺呢部電腦度讀。",
    },

    /*
     * The BlueMap-source section. Every string here is fixed rather than voiced, and that is
     * a decision about what the section is for rather than an omission: it reports a commit,
     * a version, a release tag and, when something could not be asked, why. A funny level
     * styles the prose around a fact; there is almost no prose here that is not itself the
     * fact.
     *
     * The three sentences that are prose stay careful about one distinction in both
     * languages: an upstream check that could not be made is not the same as being up to
     * date, and advancing the pin is somebody's deliberate act rather than something this
     * screen does.
     */
    "settings.bluemapSource.title": { en: "BlueMap engine", yue: "BlueMap 引擎" },
    "settings.bluemapSource.description": {
        en: "Which BlueMap this installation's rendering engine was built from, and whether a newer BlueMap release exists. The engine is BlueMap's own code, compiled unmodified.",
        yue: "呢個安裝入面嘅算圖引擎係由邊個 BlueMap 版本 build 出嚟，同埋上游有冇更新嘅 release。個引擎係 BlueMap 自己嘅代碼，原封不動咁 compile 出嚟。",
    },
    "settings.bluemapSource.unmodified": {
        en: "The rendering engine is BlueMap's own code, compiled unmodified from a pinned copy of its source that ships with this repository. Nothing below is this app's version number.",
        yue: "算圖引擎係 BlueMap 自己嘅代碼，由呢個 repository 帶住嘅一份固定 source 原封不動咁 compile 出嚟。下面啲數字冇一個係呢個 app 自己嘅版本號。",
    },
    "settings.bluemapSource.unavailable": {
        en: "This build cannot look at the jars on disk, so it cannot say which BlueMap they came from. The desktop app can; a browser tab has no access to the files.",
        yue: "呢個 build 睇唔到硬碟上面啲 jar，所以講唔到佢哋係邊個 BlueMap 嚟。桌面 app 得；browser 分頁掂唔到啲檔案。",
    },
    "settings.bluemapSource.builtFrom": {
        en: "Built from BlueMap commit",
        yue: "由呢個 BlueMap commit build",
    },
    "settings.bluemapSource.version": { en: "BlueMap version", yue: "BlueMap 版本" },
    "settings.bluemapSource.builtAt": { en: "Built", yue: "Build 咗嘅時間" },
    "settings.bluemapSource.jarPath": { en: "Jar", yue: "Jar" },
    "settings.bluemapSource.check": {
        en: "Check for a newer BlueMap",
        yue: "睇下有冇新啲嘅 BlueMap",
    },
    "settings.bluemapSource.newestRelease": {
        en: "Newest BlueMap release",
        yue: "最新嘅 BlueMap release",
    },
    "settings.bluemapSource.published": { en: "Published", yue: "發佈時間" },
    "settings.bluemapSource.commitsBehind": {
        en: "Commits behind that release",
        yue: "落後嗰個 release 幾多個 commit",
    },
    "settings.bluemapSource.level": {
        en: "These jars were built from the newest BlueMap release. Nothing to do.",
        yue: "呢啲 jar 就係由最新嗰個 BlueMap release build 出嚟。冇嘢要做。",
    },
    "settings.bluemapSource.behind": {
        en: "A newer BlueMap release exists. Nothing has changed in this installation: moving to it compiles and ships new third-party code, so it is a deliberate step somebody takes rather than something this app does on its own.",
        yue: "上游有新啲嘅 BlueMap release。呢個安裝乜都冇變過：搬過去即係要 compile 同埋出貨新嘅第三方代碼，所以要有人特登去做，唔會由呢個 app 自己做。",
    },
    "settings.bluemapSource.ahead": {
        en: "These jars were built from a commit newer than the newest release, which is what a pin advanced past a tag looks like.",
        yue: "呢啲 jar 係由一個仲新過最新 release 嘅 commit build 出嚟，即係個 pin 行咗過 tag 嗰陣嘅樣。",
    },
    "settings.bluemapSource.diverged": {
        en: "The commit these jars were built from and the newest release have both moved since they last shared history.",
        yue: "呢啲 jar 嘅 commit 同最新嗰個 release，喺最後一次共同歷史之後兩邊都各自行咗。",
    },
    "settings.bluemapSource.advance": {
        en: "Moving to a newer BlueMap is done in the repository this app is built from, by advancing the pinned copy of BlueMap's source and rebuilding the jars. It is never done from this screen, and this screen never does it on your behalf.",
        yue: "要換新啲嘅 BlueMap，要喺 build 呢個 app 嗰個 repository 度做：推前嗰份固定嘅 BlueMap source，然後重新 build 啲 jar。呢個畫面唔會做，亦都唔會幫你做。",
    },

    /* The app-logo section's own heading, beside the other section headings for the same
     * reason vocabulary's is: one place a section title is written, not two. */
    "settings.appLogo.title": { en: "App logo", yue: "應用程式 logo" },
    "settings.appLogo.description": {
        en: "Pick a shipped mark or your own local image for this app's own logo, with its crop, fit and background. This changes the picture only, never the app's package identity.",
        yue: "揀一個出廠標記或者你自己部機度嘅圖片做呢個程式嘅 logo，連埋裁切、填滿方式同背景。呢個淨係改緊幅圖，唔會改應用程式嘅套件身份。",
    },

    /* The History tab's own heading, above `settings.history.description`. */
    "settings.history.title": { en: "Version history", yue: "版本記錄" },
    "settings.history.profiles": { en: "Server profiles", yue: "伺服器設定檔" },
    "settings.history.appSettings": { en: "Application settings", yue: "應用程式設定" },

    /* The Diagnostics tab's own heading, above `settings.diagnostics.description`. */
    "settings.diagnostics.title": { en: "Diagnostics", yue: "診斷" },

    /* The Render memory tab's own heading, above `settings.renderMemory.description`. */
    "settings.renderMemory.title": { en: "Render memory", yue: "算圖記憶體" },
    "settings.renderMemory.automatic": { en: "Automatic", yue: "自動" },
    "settings.renderMemory.manual": { en: "Manual", yue: "手動" },
    "settings.renderMemory.megabytesField": { en: "Megabytes", yue: "MB（百萬位元組）" },
    "settings.renderMemory.save": { en: "Save this limit", yue: "儲存呢個上限" },
    "settings.renderMemory.reset": { en: "Reset to automatic", yue: "重設做自動" },
    "settings.renderMemory.pickerLabel": {
        en: "How the memory ceiling is chosen",
        yue: "記憶體上限點揀",
    },
    "settings.renderMemory.saved": { en: "Saved.", yue: "已儲存。" },

    /* The Notification duration tab's own heading, above `settings.noticeDuration.description`. */
    "settings.noticeDuration.title": { en: "Notification duration", yue: "通知留幾耐" },
    "settings.noticeDuration.description": {
        en: "How long an informational or success message stays in the corner before it dismisses itself. Warnings and errors already wait for you and are not affected.",
        yue: "資訊同成功嘅訊息喺角落留幾耐先至自己收埋。警告同錯誤本身就會等你，唔受呢個影響。",
    },
    "settings.noticeDuration.level.1": { en: "1 · Quick", yue: "1 級 · 快" },
    "settings.noticeDuration.level.2": { en: "2 · Brisk", yue: "2 級 · 爽快" },
    "settings.noticeDuration.level.3": { en: "3 · Balanced", yue: "3 級 · 均衡" },
    "settings.noticeDuration.level.4": { en: "4 · Relaxed", yue: "4 級 · 從容" },
    "settings.noticeDuration.level.5": {
        en: "5 · Stay until dismissed",
        yue: "5 級 · 留到你收埋",
    },
    "settings.noticeDuration.pickerLabel": {
        en: "Notification duration, level 1 to 5",
        yue: "通知留幾耐，1 至 5 級",
    },
    "settings.noticeDuration.defaultChip": { en: "Default", yue: "預設" },
    "settings.noticeDuration.reset": { en: "Reset to Balanced", yue: "重設做均衡" },

    /* The Download concurrency tab's own heading, above `settings.downloadConcurrency.description`. */
    "settings.downloadConcurrency.title": { en: "Download concurrency", yue: "下載併發" },
    "settings.downloadConcurrency.workersField": { en: "Parts at once", yue: "同時幾多個 part" },
    "settings.downloadConcurrency.save": { en: "Save this limit", yue: "儲存呢個上限" },
    "settings.downloadConcurrency.reset": { en: "Reset to default", yue: "重設做預設" },
    "settings.downloadConcurrency.pickerLabel": {
        en: "How many parts are fetched at once",
        yue: "幾多個 part 同時攞",
    },
    "settings.downloadConcurrency.saved": { en: "Saved.", yue: "已儲存。" },

    /* The Display and ease of use tab's own heading, above `settings.display.description`. */
    "settings.display.title": { en: "Display and ease of use", yue: "顯示同易用度" },
    "settings.uiSize.level.1": { en: "1 · Standard", yue: "1 級 · 標準" },
    "settings.uiSize.level.2": { en: "2 · Comfortable", yue: "2 級 · 舒適" },
    "settings.uiSize.level.3": { en: "3 · Large", yue: "3 級 · 大" },
    "settings.uiSize.level.4": { en: "4 · Extra large", yue: "4 級 · 特大" },
    "settings.uiSize.level.5": { en: "5 · Largest", yue: "5 級 · 最大" },
    "settings.uiSize.pickerLabel": {
        en: "Interface size, level 1 to 5",
        yue: "介面大細，1 至 5 級",
    },
    "settings.uiSize.defaultChip": { en: "Default", yue: "預設" },
    "settings.uiSize.reset": { en: "Reset to Standard", yue: "重設做標準" },
    /*
     * The four theme names themselves are upstream's own `theme.*` keys, translated in
     * every bundled viewer locale, so they are deliberately not re-answered here - see
     * `themeChoiceLabel` in `settingsCopy.ts` and the catalogue rule about keys upstream
     * already translates.
     */
    "settings.display.themePickerLabel": { en: "Colour theme", yue: "色彩主題" },
    /* Catalogue-coverage sweep: these had no answer here, so every language mode and
       both funny-level extremes rendered the English written at the call site. */
    "settings.addons.changeFailed": { en: "The add-on state could not be changed.", yue: "改唔到呢個 add-on 嘅狀態。" },
    "settings.addons.consentFailed": { en: "Capability consent could not be saved.", yue: "儲唔到權限授權。" },
    "settings.addons.empty": { en: "No add-ons have been imported yet.", yue: "仲未匯入過任何 add-on。" },
    "settings.addons.import": { en: "Import add-on package", yue: "匯入 add-on 套件" },
    "settings.addons.importFailed": { en: "The add-on could not be imported.", yue: "匯入唔到呢個 add-on。" },
    "settings.addons.listFailed": { en: "The add-on list could not be read.", yue: "讀唔到 add-on 清單。" },
    "settings.addons.removeFailed": { en: "The add-on could not be removed.", yue: "移除唔到呢個 add-on。" },
    "settings.addons.safeModeFailed": { en: "Safe mode could not be changed.", yue: "改唔到安全模式。" },
    "settings.addons.title": { en: "Design add-ons", yue: "設計 add-on" },
    "settings.addons.unavailable": { en: "Add-on import is unavailable in this build.", yue: "呢個版本冇得匯入 add-on。" },
    "settings.awsAccounts.title": { en: "AWS accounts", yue: "AWS 戶口" },
    "settings.engineChoice.active": { en: "Selected", yue: "已揀" },
    "settings.engineChoice.artifactPath": { en: "Verified artifact path", yue: "已驗證嘅檔案路徑" },
    "settings.engineChoice.artifactVersion": { en: "Verified artifact version", yue: "已驗證嘅版本" },
    "settings.engineChoice.automatic": { en: "Automatic", yue: "自動" },
    "settings.engineChoice.bluemap": { en: "BlueMap original", yue: "BlueMap 原裝" },
    "settings.engineChoice.capabilities": { en: "Capabilities", yue: "功能" },
    "settings.engineChoice.copied": { en: "Copied", yue: "已複製" },
    "settings.engineChoice.copy": { en: "Copy JSON", yue: "複製 JSON" },
    "settings.engineChoice.export": { en: "Export choices", yue: "匯出選擇" },
    "settings.engineChoice.globalEyebrow": { en: "New-project default", yue: "新專案預設" },
    "settings.engineChoice.import": { en: "Import choices", yue: "匯入選擇" },
    "settings.engineChoice.importInvalid": { en: "That file is not a supported engine-choice export.", yue: "呢個檔案唔係支援嘅引擎選擇匯出檔。" },
    "settings.engineChoice.imported": { en: "Engine choices imported.", yue: "已匯入引擎選擇。" },
    "settings.engineChoice.projectEyebrow": { en: "Project render engine", yue: "專案 render 引擎" },
    "settings.engineChoice.provenance": { en: "Provenance", yue: "來源" },
    "settings.engineChoice.resetProject": { en: "Use global default", yue: "用全域預設" },
    "settings.engineChoice.resolved": { en: "Resolved engine", yue: "實際用嘅引擎" },
    "settings.engineChoice.searchBad": { en: "The pattern is not valid, so no engines are listed.", yue: "個 pattern 唔啱，所以一個引擎都列唔到。" },
    "settings.engineChoice.searchFound": { en: "{shown} of {total} engines match.", yue: "{total} 個引擎入面有 {shown} 個對得上。" },
    "settings.engineChoice.searchTotal": { en: "{total} engines are available to compare.", yue: "有 {total} 個引擎可以比較。" },
    "settings.engineChoice.source": { en: "Verified source", yue: "已驗證嘅來源" },
    "settings.engineChoice.title": { en: "Choose the render engine", yue: "揀 render 引擎" },
    "settings.engineChoice.unsupported": { en: "Unsupported or conditional", yue: "唔支援或者有條件" },
    "settings.engineChoice.version": { en: "Version", yue: "版本" },
    "settings.engineChoice.worldlens": { en: "Worldlens app engine", yue: "Worldlens 自己嘅引擎" },
    "settings.runtime.title": { en: "Runtime settings and accommodations", yue: "執行時設定同輔助選項" },
} as const satisfies Record<string, FixedString>;

export const SETTINGS_FACTS = {
    // Which of the two empty results this is, and that the settings are still there.
    "settings.search.badPattern": {
        en: ["not valid", "nothing is listed"],
        yue: ["唔正確", "冇列出任何嘢"],
    },
    "settings.search.total": { en: ["{n}"], yue: ["{n}"] },
    "settings.search.found": { en: ["{shown}", "{total}"], yue: ["{shown}", "{total}"] },
    "settings.search.noMatches": { en: ["this screen", "match"], yue: ["呢個畫面", "符合"] },

    "settings.productName.hint": {
        en: ["title bar", "About", "notifications", "introductions"],
        yue: ["標題列", "關於", "通知", "介紹"],
    },
    "settings.productName.boundary": {
        en: [
            "data folder",
            "installer",
            "packages",
            "update feed",
            "repository markers",
            "diagnostic product name",
            "Worldlens",
        ],
        yue: [
            "資料夾",
            "安裝程式",
            "packages",
            "更新 feed",
            "repository markers",
            "診斷產品名",
            "Worldlens",
        ],
    },
    "settings.productName.default": { en: ["Worldlens"], yue: ["Worldlens"] },
    "settings.productName.saved": {
        en: ["{name}", "saved"],
        yue: ["{name}", "儲存"],
    },

    // The preference was honoured even though the panel is not where it was asked to be.
    "dock.adjusted.floating": {
        en: ["{title}", "{edge}", "floating", "Your choice is kept"],
        yue: ["{title}", "{edge}", "浮動", "你嘅選擇會保留"],
    },
    "dock.adjusted.shrunk": {
        en: ["{title}", "narrower than usual", "cover the control that opened it"],
        yue: ["{title}", "比平時窄", "唔遮住打開佢嗰個控制項"],
    },
    "dock.chooser.label": { en: ["{title}", "{current}"], yue: ["{title}", "{current}"] },

    // `JAVA_HOME` and `PATH` are identifiers and read the same in both languages.
    "settings.java.missingHint": {
        en: ["no suitable Java was found", "JAVA_HOME"],
        yue: ["合適嘅 Java", "JAVA_HOME"],
    },
    // A record of a past render, not a reading of this machine: the whole point of the row.
    "settings.java.lastRender": {
        en: ["{engine}", "record of that render", "not a reading of this machine now"],
        yue: ["{engine}", "嗰次算圖嘅記錄", "唔係而家部機嘅實況"],
    },
    "settings.java.unsupported": {
        en: ["cannot report the Java runtime", "Nothing is wrong with your Java", "this screen"],
        yue: ["報唔到 Java 執行環境", "Java 冇問題", "呢個畫面"],
    },
    "settings.java.discoveryOrder": {
        en: ["JAVA_HOME", "PATH", "before trusting it", "turned down"],
        yue: ["JAVA_HOME", "PATH", "行過先至信", "唔收嘅候選"],
    },

    // Optional, and the token never reaches this screen. Both are security-facing.
    "settings.github.description": {
        en: ["private repositories", "optional", "never shown on this screen"],
        yue: ["私人 repository", "可選", "永遠唔會顯示"],
    },
    "settings.github.whatFor": {
        en: ["private repositories", "release asset", "signed out"],
        yue: ["私人 repository", "release asset", "唔登入"],
    },
    "settings.github.signedOut": {
        en: [
            "Not signed in",
            "Nothing is stored on this computer",
            "public repositories still work",
        ],
        yue: ["未登入", "冇儲低任何嘢", "公開 repository"],
    },
    "settings.github.unsupported": {
        en: [
            "cannot sign in to GitHub",
            "Nothing is wrong with your account",
            "nothing was stored",
            "desktop app",
        ],
        yue: ["登入唔到 GitHub", "帳戶冇問題", "冇儲低任何嘢", "桌面程式"],
    },

    "settings.storage.empty": { en: ["folder", "written into"], yue: ["資料夾", "寫入"] },
    "settings.storage.missingHint": {
        en: ["folder was not there", "start the render again"],
        yue: ["資料夾唔喺度", "再開多次算圖"],
    },
    "settings.storage.isDefault": { en: ["default folder"], yue: ["預設資料夾"] },
    // Not an example to be edited by hand, which is the mistake the note exists to prevent.
    "settings.storage.tokenNote": {
        en: ["{token}", "expanded when a render starts", "real value"],
        yue: ["{token}", "算圖開始嗰陣展開", "真值"],
    },
    "settings.storage.unresolved": {
        en: ["expands to on disk", "desktop app", "when a render starts"],
        yue: ["硬碟", "桌面程式", "算圖開始"],
    },
    "settings.storage.localOnly": {
        en: ["map wizard", "desktop app"],
        yue: ["地圖精靈", "桌面程式"],
    },

    // Where the world folder actually is, so no level leaves it sounding unimplemented.
    "settings.worldFolder.description": {
        en: ["per map", "map wizard", "no folder to change on this screen"],
        yue: ["Minecraft", "地圖精靈", "呢個畫面冇資料夾可以改"],
    },
    "settings.worldFolder.perMap": {
        en: ["own world folder", "no single one to set here", "map wizard", "World"],
        yue: ["世界資料夾", "呢度冇單一個可以設定", "地圖精靈", "World"],
    },
    "settings.worldFolder.where": {
        en: [
            "Set up another map",
            "configuration editor",
            "a different map",
            "there rather than here",
        ],
        yue: ["Set up another map", "設定編輯器", "另一張地圖", "唔係喺呢度問"],
    },
    "settings.worldFolder.missingHint": {
        en: ["world folder was not there any more", "renamed", "not plugged in"],
        yue: ["世界資料夾已經唔喺度", "改咗名", "冇插住嘅磁碟"],
    },

    "settings.placement.description": {
        en: ["floating", "left, right, top or bottom", "title bar", "put back at once"],
        yue: ["浮動", "泊左、右、上、下", "標題列", "放返原位"],
    },
    // An empty list is not an empty feature: the reset still reaches every panel.
    "settings.placement.none": {
        en: ["No panel is open", "title bar", "every panel"],
        yue: ["冇面板開住", "標題列", "每一個面板"],
    },
    "settings.placement.noneMoved": { en: ["No panel has been moved"], yue: ["冇面板被移動過"] },
    "settings.placement.someMoved": {
        en: ["{n}", "remembered position", "closed"],
        yue: ["{n}", "記住咗位置", "閂咗"],
    },

    // Last checked, a manual check, and a dismissed banner coming back -- all three are why
    // this tab exists, so no level may drop one of them for the other two.
    "settings.updates.description": {
        en: ["last checked", "by hand", "dismissed"],
        yue: ["幾時check過", "手動", "收埋咗"],
    },

    // That everything here is restorable, and that a restore is safe because what it
    // replaces is recorded first -- the two facts that make this tab worth opening.
    "settings.history.description": {
        en: ["restorable", "recorded first"],
        yue: ["還原得返", "事先記低"],
    },

    // That no model is involved unless a local agent is deliberately switched on, and
    // that every change is recorded so it can be undone.
    "settings.diagnostics.description": {
        en: ["model", "recorded"],
        yue: ["model", "記錄"],
    },

    // The row's own two named modes. A level that stopped naming one would leave a
    // reader unable to find the button the sentence is describing.
    "settings.renderMemory.description": {
        en: ["Automatic", "Manual"],
        yue: ["Automatic", "Manual"],
    },
    "settings.renderMemory.unsupported": {
        en: ["report or change", "Nothing is wrong"],
        yue: ["冇辦法", "冇壞"],
    },
    "settings.renderMemory.readOnly": {
        en: ["show", "cannot change", "desktop app"],
        yue: ["顯示", "改唔到", "桌面版"],
    },

    // The one fact that matters: this dial never touches warnings or errors, at any level.
    "settings.noticeDuration.levelSummary": {
        en: ["{info}", "{success}"],
        yue: ["{info}", "{success}"],
    },
    "settings.noticeDuration.levelSummaryPersistent": {
        en: ["dismiss", "warning or an error"],
        yue: ["收埋", "警告同錯誤"],
    },

    // "Four" is the real, fixed shipped default - not a live reading like the render
    // memory ceiling's own numbers, which is why it can be pinned as a fact at all.
    // "at once" is the other fact worth keeping: this is about concurrency, not raw speed.
    "settings.downloadConcurrency.description": {
        en: ["four by default", "at once"],
        yue: ["四個", "同時"],
    },
    "settings.downloadConcurrency.unsupported": {
        en: ["report or change", "Nothing is wrong"],
        yue: ["冇辦法", "冇壞"],
    },
    "settings.downloadConcurrency.readOnly": {
        en: ["show", "cannot change", "desktop app"],
        yue: ["顯示", "改唔到", "桌面版"],
    },

    // The ceiling ("double") and the persistence promise are the two things a person
    // plans around; "high-contrast" has to survive because it names the accessibility
    // scheme rather than decorating it.
    "settings.display.description": {
        en: ["double", "high-contrast", "remembered"],
        yue: ["兩倍", "高對比", "記住"],
    },
    "settings.uiSize.summary": {
        en: ["{percent}", "remembered"],
        yue: ["{percent}", "記住"],
    },
    // All four names stay nameable, and so does who the contrast scheme is for: a
    // description of an accessibility feature that gets too playful to say "low vision"
    // has stopped describing it.
    "settings.display.themeSummary": {
        en: ["System", "Contrast", "high-contrast", "low vision", "settings menu", "agree"],
        yue: ["系統", "高對比", "低視力", "設定選單", "一致"],
    },
} as const satisfies Record<
    keyof typeof SETTINGS_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
