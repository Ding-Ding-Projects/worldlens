/**
 * Choosing where a Chunker conversion runs: the four routes, and every reason one of them
 * cannot take the job right now.
 *
 * The refusals are the interesting half. Each one names the exact unmet condition, because
 * "Docker is unavailable" is the sentence somebody reads after installing Docker Desktop
 * and never starting it, and it sends them to download software they already have. The
 * facts guarding these keys are therefore the concrete nouns a person has to act on -
 * Docker, GitHub, SSH, Chunker - so no level of playfulness can render a refusal that does
 * not say which thing is missing.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CHUNKERROUTE_VOICED = {
    "chunkerRoute.title": {
        en: [
            "Where should this conversion run?",
            "Where should this conversion run?",
            "Where should this conversion run?",
            "Where should this conversion run? Four answers, one job.",
            "Where should this conversion run? You get four machines to pick from, and only one of them has to do the work.",
        ],
        yue: [
            "呢次轉換想喺邊度行？",
            "呢次轉換想喺邊度行？",
            "呢次轉換想喺邊度行？",
            "呢次轉換想喺邊度行？四個選擇，一份工。",
            "呢次轉換想喺邊度行？四部機任你揀，最後只有一部要捱騾仔。",
        ],
    },
    "chunkerRoute.intro": {
        en: [
            "Converting a world is a long job on a lot of files, so it matters which machine does it.",
            "Converting a world is a long job on a lot of files, so it matters which machine does it.",
            "Converting a world is a long job on a lot of files, so the machine you pick matters.",
            "Converting a world is a long job on a lot of files, and the machine you pick is the one that has to survive it.",
            "Converting a world is a long job on a lot of files. Pick the machine you mind least about hearing its fans for an hour.",
        ],
        yue: [
            "轉換一個世界要處理好多檔案，用邊部機好重要。",
            "轉換一個世界要處理好多檔案，用邊部機好重要。",
            "轉換一個世界要處理好多檔案，所以揀邊部機好重要。",
            "轉換一個世界要處理好多檔案，你揀嗰部機就係要捱到最後嗰部。",
            "轉換一個世界要處理好多檔案，揀部你唔介意聽佢把風扇響一個鐘嘅機啦。",
        ],
    },

    /* -- what each route means ------------------------------------------------ */

    "chunkerRoute.summary.local": {
        en: [
            "Converts here, using the Chunker this app installed.",
            "Converts here, using the Chunker this app installed.",
            "Converts right here, with the Chunker this app installed.",
            "Converts right here on this computer, with the Chunker this app installed for you.",
            "Converts right here on this computer, with the Chunker this app already went and installed. No uploads, no waiting on anybody else.",
        ],
        yue: [
            "喺呢部機轉換，用呢個應用裝咗嘅 Chunker。",
            "喺呢部機轉換，用呢個應用裝咗嘅 Chunker。",
            "就喺呢部機度轉換，用呢個應用裝咗嘅 Chunker。",
            "就喺你呢部電腦度轉換，用呢個應用幫你裝咗嘅 Chunker。",
            "就喺你呢部電腦度轉換，用呢個應用早就幫你裝好嘅 Chunker，唔使上傳，唔使等人。",
        ],
    },
    "chunkerRoute.summary.docker": {
        en: [
            "Converts here inside Docker, which brings its own Java and its own memory ceiling.",
            "Converts here inside Docker, which brings its own Java and its own memory ceiling.",
            "Converts here inside Docker, which brings its own Java and its own memory ceiling.",
            "Converts here inside Docker, which brings its own Java and its own memory ceiling. It is isolation, not extra speed.",
            "Converts here inside Docker, which brings its own Java and its own memory ceiling. Tidier, not faster, whatever the container marketing says.",
        ],
        yue: [
            "喺呢部機用 Docker 轉換，佢自己帶埋 Java 同記憶體上限。",
            "喺呢部機用 Docker 轉換，佢自己帶埋 Java 同記憶體上限。",
            "喺呢部機用 Docker 轉換，佢自己帶埋 Java 同記憶體上限。",
            "喺呢部機用 Docker 轉換，佢自己帶埋 Java 同記憶體上限，係為咗隔離，唔係為咗快。",
            "喺呢部機用 Docker 轉換，佢自己帶埋 Java 同記憶體上限。整齊啲啫，唔會快啲，唔好信啲宣傳。",
        ],
    },
    "chunkerRoute.summary.githubActions": {
        en: [
            "Uploads the world to a repository and converts it on GitHub's machines.",
            "Uploads the world to a repository and converts it on GitHub's machines.",
            "Uploads the world to a repository and converts it on GitHub's own machines.",
            "Uploads the world to a repository and converts it on GitHub's own machines, so this one stays free.",
            "Uploads the world to a repository and lets GitHub's own machines sweat through it while yours does nothing at all.",
        ],
        yue: [
            "將世界上傳去一個倉庫，再喺 GitHub 部機度轉換。",
            "將世界上傳去一個倉庫，再喺 GitHub 部機度轉換。",
            "將世界上傳去一個倉庫，再喺 GitHub 自己部機度轉換。",
            "將世界上傳去一個倉庫，再喺 GitHub 自己部機度轉換，你部機就得閒。",
            "將世界上傳去一個倉庫，等 GitHub 部機幫你捱，你部機喺度嘆世界。",
        ],
    },
    "chunkerRoute.summary.ssh": {
        en: [
            "Sends the world to a machine you have set up over SSH, converts it there, and brings it back.",
            "Sends the world to a machine you have set up over SSH, converts it there, and brings it back.",
            "Sends the world over SSH to a machine you have set up, converts it there, and brings it back.",
            "Sends the world over SSH to a machine you have set up, converts it there, and brings the result home again.",
            "Sends the world over SSH to that machine of yours, makes it do the work, and brings the result home again. Two trips over the wire.",
        ],
        yue: [
            "用 SSH 將世界送去你設定咗嘅機，喺嗰邊轉換，再攞返嚟。",
            "用 SSH 將世界送去你設定咗嘅機，喺嗰邊轉換，再攞返嚟。",
            "用 SSH 將世界送去你設定咗嘅機，喺嗰邊轉換完再攞返嚟。",
            "用 SSH 將世界送去你設定咗嘅機，喺嗰邊轉換完，再將成果攞返嚟。",
            "用 SSH 將世界送去你嗰部機，叫佢做嘢，然後將成果攞返嚟，行兩轉網路。",
        ],
    },

    /* -- why a route cannot take the job ------------------------------------- */

    "chunkerRoute.reason.local-unsupported": {
        en: [
            "This build has no Chunker channel, so it cannot convert on this computer.",
            "This build has no Chunker channel, so it cannot convert on this computer.",
            "This build carries no Chunker channel, so it cannot convert on this computer.",
            "This build carries no Chunker channel at all, so converting on this computer is not something it can do.",
            "This build never got a Chunker channel, so converting on this computer is off the table here, not broken on your machine.",
        ],
        yue: [
            "呢個版本冇 Chunker 通道，所以喺呢部機轉換唔到。",
            "呢個版本冇 Chunker 通道，所以喺呢部機轉換唔到。",
            "呢個版本根本冇 Chunker 通道，所以喺呢部機轉換唔到。",
            "呢個版本根本冇 Chunker 通道，所以喺呢部機轉換呢件事佢做唔到。",
            "呢個版本由頭到尾都冇 Chunker 通道，所以唔係你部機壞，係佢做唔到。",
        ],
    },
    "chunkerRoute.reason.local-no-chunker": {
        en: [
            "Chunker is not on this computer yet.",
            "Chunker is not on this computer yet.",
            "Chunker is not on this computer yet. It can be fetched from here.",
            "Chunker is not on this computer yet, and it can be fetched from right here.",
            "Chunker is not on this computer yet. One button and it will be, no hunting around required.",
        ],
        yue: [
            "呢部機仲未有 Chunker。",
            "呢部機仲未有 Chunker。",
            "呢部機仲未有 Chunker，可以喺呢度攞。",
            "呢部機仲未有 Chunker，可以就喺呢度攞落嚟。",
            "呢部機仲未有 Chunker，撳一下就有，唔使周圍搵。",
        ],
    },
    "chunkerRoute.reason.docker-unsupported": {
        en: [
            "This build has no Docker channel, so it cannot run a container here.",
            "This build has no Docker channel, so it cannot run a container here.",
            "This build carries no Docker channel, so it cannot run a container here.",
            "This build carries no Docker channel at all, so running a container here is not something it can do.",
            "This build never got a Docker channel, so a container here is off the table - nothing on your machine is wrong.",
        ],
        yue: [
            "呢個版本冇 Docker 通道，所以喺度開唔到容器。",
            "呢個版本冇 Docker 通道，所以喺度開唔到容器。",
            "呢個版本根本冇 Docker 通道，所以喺度開唔到容器。",
            "呢個版本根本冇 Docker 通道，所以喺度開容器呢件事佢做唔到。",
            "呢個版本由頭到尾都冇 Docker 通道，所以開容器係冇得諗，同你部機冇關係。",
        ],
    },
    "chunkerRoute.reason.docker-not-installed": {
        en: [
            "Docker is not installed on this computer.",
            "Docker is not installed on this computer.",
            "Docker is not installed on this computer yet.",
            "Docker is not installed on this computer yet, so there is no container to run in.",
            "Docker is not installed on this computer at all, so there is nothing here for a container to live in yet.",
        ],
        yue: [
            "呢部機未裝 Docker。",
            "呢部機未裝 Docker。",
            "呢部機仲未裝 Docker。",
            "呢部機仲未裝 Docker，所以冇容器可以行。",
            "呢部機根本未裝 Docker，所以而家連個容器住嘅地方都未有。",
        ],
    },
    "chunkerRoute.reason.docker-daemon-down": {
        en: [
            "Docker is installed but not running.",
            "Docker is installed but not running.",
            "Docker is installed here but is not running.",
            "Docker is installed here but is not running, so nothing can be handed to it yet.",
            "Docker is installed here and fast asleep. Wake it up and this route works.",
        ],
        yue: [
            "Docker 裝咗，但係未開。",
            "Docker 裝咗，但係未開。",
            "Docker 裝咗喺呢部機，但係未開。",
            "Docker 裝咗喺呢部機但係未開，所以而家咩都交唔到俾佢。",
            "Docker 裝咗喺呢部機，不過瞓緊。嗌醒佢，呢條路就通。",
        ],
    },
    "chunkerRoute.reason.docker-refused": {
        en: [
            "Docker refused this account.",
            "Docker refused this account.",
            "Docker refused this account, so it cannot be used from here.",
            "Docker refused this account, so nothing can be handed to it from here until that is sorted out.",
            "Docker took one look at this account and said no, so this route stays shut until that is sorted out.",
        ],
        yue: [
            "Docker 拒絕咗呢個帳戶。",
            "Docker 拒絕咗呢個帳戶。",
            "Docker 拒絕咗呢個帳戶，所以喺呢度用唔到。",
            "Docker 拒絕咗呢個帳戶，搞掂之前咩都交唔到俾佢。",
            "Docker 望一眼呢個帳戶就話唔得，搞掂之前呢條路都係閂住。",
        ],
    },
    "chunkerRoute.reason.docker-unusable": {
        en: [
            "Docker could not be asked what state it is in.",
            "Docker could not be asked what state it is in.",
            "Docker could not be asked what state it is in, so this route is not offered.",
            "Docker could not be asked what state it is in, so this route is not offered rather than guessed at.",
            "Docker would not say what state it is in, and guessing on your behalf is how an hour gets wasted, so this route stays shut.",
        ],
        yue: [
            "問唔到 Docker 而家咩狀態。",
            "問唔到 Docker 而家咩狀態。",
            "問唔到 Docker 而家咩狀態，所以唔提供呢條路。",
            "問唔到 Docker 而家咩狀態，所以寧願唔提供呢條路，都唔靠估。",
            "Docker 唔肯講佢而家咩狀態，靠估就會白等一個鐘，所以呢條路閂住。",
        ],
    },
    "chunkerRoute.reason.ci-unsupported": {
        en: [
            "This build has no GitHub channel, so it cannot use their runners.",
            "This build has no GitHub channel, so it cannot use their runners.",
            "This build carries no GitHub channel, so it cannot use their runners.",
            "This build carries no GitHub channel at all, so handing the job to their runners is not something it can do.",
            "This build never got a GitHub channel, so their runners are out of reach here - nothing is signed out or broken.",
        ],
        yue: [
            "呢個版本冇 GitHub 通道，所以用唔到佢哋部機。",
            "呢個版本冇 GitHub 通道，所以用唔到佢哋部機。",
            "呢個版本根本冇 GitHub 通道，所以用唔到佢哋部機。",
            "呢個版本根本冇 GitHub 通道，所以將份工交俾佢哋部機呢件事佢做唔到。",
            "呢個版本由頭到尾都冇 GitHub 通道，所以掂唔到佢哋部機，唔係登出咗又唔係壞咗。",
        ],
    },
    "chunkerRoute.reason.ci-signed-out": {
        en: [
            "No GitHub account is signed in.",
            "No GitHub account is signed in.",
            "No GitHub account is signed in, so nothing can be uploaded yet.",
            "No GitHub account is signed in yet, so there is nowhere to upload the world to.",
            "No GitHub account is signed in yet, so there is nowhere to put the world and nobody to run it for you.",
        ],
        yue: [
            "未登入任何 GitHub 帳戶。",
            "未登入任何 GitHub 帳戶。",
            "未登入任何 GitHub 帳戶，所以而家上傳唔到。",
            "仲未登入任何 GitHub 帳戶，所以個世界冇地方上傳。",
            "仲未登入任何 GitHub 帳戶，個世界冇地方擺，亦都冇人幫你行。",
        ],
    },
    "chunkerRoute.reason.ssh-unsupported": {
        en: [
            "This build has no SSH channel, so it cannot use another machine.",
            "This build has no SSH channel, so it cannot use another machine.",
            "This build carries no SSH channel, so it cannot use another machine.",
            "This build carries no SSH channel at all, so sending the world to another machine is not something it can do.",
            "This build never got an SSH channel, so another machine is out of reach here, however well set up yours is.",
        ],
        yue: [
            "呢個版本冇 SSH 通道，所以用唔到第二部機。",
            "呢個版本冇 SSH 通道，所以用唔到第二部機。",
            "呢個版本根本冇 SSH 通道，所以用唔到第二部機。",
            "呢個版本根本冇 SSH 通道，所以將世界送去第二部機呢件事佢做唔到。",
            "呢個版本由頭到尾都冇 SSH 通道，你部機設定得幾好都掂唔到。",
        ],
    },
    "chunkerRoute.reason.ssh-no-hosts": {
        en: [
            "No SSH machine has been set up yet.",
            "No SSH machine has been set up yet.",
            "No SSH machine has been set up yet, so there is nowhere to send the world.",
            "No SSH machine has been set up yet, so there is nowhere for the world to go.",
            "No SSH machine has been set up yet, so the world has nowhere to go and nobody to visit.",
        ],
        yue: [
            "仲未設定過任何 SSH 機。",
            "仲未設定過任何 SSH 機。",
            "仲未設定過任何 SSH 機，所以個世界冇地方送。",
            "仲未設定過任何 SSH 機，所以個世界冇地方可以去。",
            "仲未設定過任何 SSH 機，個世界冇地方去，亦都冇人探。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CHUNKERROUTE_FIXED = {
    "chunkerRoute.label.local": { en: "This computer", yue: "呢部電腦" },
    "chunkerRoute.label.docker": { en: "A container on this computer", yue: "呢部電腦上嘅容器" },
    "chunkerRoute.label.githubActions": { en: "GitHub's runners", yue: "GitHub 嘅執行機" },
    "chunkerRoute.label.ssh": { en: "Another machine over SSH", yue: "用 SSH 連去第二部機" },
    "chunkerRoute.fix.installChunker": { en: "Get Chunker", yue: "攞 Chunker" },
    "chunkerRoute.fix.installDocker": { en: "Install Docker", yue: "安裝 Docker" },
    "chunkerRoute.fix.startDocker": { en: "Open Docker Desktop", yue: "開 Docker Desktop" },
    "chunkerRoute.fix.signInGithub": { en: "Sign in to GitHub", yue: "登入 GitHub" },
    "chunkerRoute.fix.addSshHost": { en: "Add a machine", yue: "加一部機" },
    "chunkerRoute.recheck": { en: "Check again", yue: "再檢查一次" },
} as const satisfies Record<string, FixedString>;

export const CHUNKERROUTE_FACTS = {
    "chunkerRoute.title": { en: ["conversion run"], yue: ["轉換"] },
    "chunkerRoute.intro": { en: ["files"], yue: ["檔案"] },
    "chunkerRoute.summary.local": { en: ["Chunker"], yue: ["Chunker"] },
    "chunkerRoute.summary.docker": { en: ["Docker", "Java"], yue: ["Docker", "Java"] },
    "chunkerRoute.summary.githubActions": { en: ["GitHub"], yue: ["GitHub"] },
    "chunkerRoute.summary.ssh": { en: ["SSH"], yue: ["SSH"] },
    "chunkerRoute.reason.local-unsupported": { en: ["Chunker"], yue: ["Chunker"] },
    "chunkerRoute.reason.local-no-chunker": { en: ["Chunker"], yue: ["Chunker"] },
    "chunkerRoute.reason.docker-unsupported": { en: ["Docker"], yue: ["Docker"] },
    "chunkerRoute.reason.docker-not-installed": { en: ["Docker"], yue: ["Docker"] },
    "chunkerRoute.reason.docker-daemon-down": { en: ["Docker"], yue: ["Docker"] },
    "chunkerRoute.reason.docker-refused": { en: ["Docker"], yue: ["Docker"] },
    "chunkerRoute.reason.docker-unusable": { en: ["Docker"], yue: ["Docker"] },
    "chunkerRoute.reason.ci-unsupported": { en: ["GitHub"], yue: ["GitHub"] },
    "chunkerRoute.reason.ci-signed-out": { en: ["GitHub"], yue: ["GitHub"] },
    "chunkerRoute.reason.ssh-unsupported": { en: ["SSH"], yue: ["SSH"] },
    "chunkerRoute.reason.ssh-no-hosts": { en: ["SSH"], yue: ["SSH"] },
} as const satisfies Record<
    keyof typeof CHUNKERROUTE_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
