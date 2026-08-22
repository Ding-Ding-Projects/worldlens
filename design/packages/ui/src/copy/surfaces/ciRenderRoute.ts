/**
 * Choosing where a cloud render runs, and where its finished map is served from.
 *
 * Two things shape every sentence here.
 *
 * **Money.** One render route is free and one is billed; two hosting routes are free and
 * one is billed. Somebody picking between them is deciding whether to be charged, so the
 * summaries say so plainly at every funny level. The facts guarding them are the words
 * that carry that meaning - "no bill", "you pay", "唔使錢", "要俾錢" - so no amount of
 * playfulness can produce a sentence that leaves a person unsure whether this costs money.
 *
 * **The exact unmet condition.** "AWS is unavailable" is the sentence somebody reads after
 * installing the CLI and never signing in, and it sends them to download software they
 * already have. Every refusal names the concrete thing that is missing.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const CIRENDERROUTE_VOICED = {
    "ciRenderRoute.title": {
        en: [
            "Where should this render run?",
            "Where should this render run?",
            "Where should this render run?",
            "Where should this render run? Two machines, one job.",
            "Where should this render run? One is free and patient, the other is fast and sends you a bill.",
        ],
        yue: [
            "呢次渲染想喺邊度行？",
            "呢次渲染想喺邊度行？",
            "呢次渲染想喺邊度行？",
            "呢次渲染想喺邊度行？兩部機，一份工。",
            "呢次渲染想喺邊度行？一部免費但慢慢嚟，一部快但會寄單俾你。",
        ],
    },
    "ciRenderRoute.summary.github-actions": {
        en: [
            "Renders on GitHub's runners. No bill, and nothing to set up beyond a repository.",
            "Renders on GitHub's runners. No bill, and nothing to set up beyond a repository.",
            "Renders on GitHub's runners. There is no bill, and nothing to set up beyond a repository.",
            "Renders on GitHub's runners. There is no bill, nothing to set up beyond a repository, and a fixed amount of machine.",
            "Renders on GitHub's runners: no bill, no setup beyond a repository, and however much machine GitHub feels like giving you.",
        ],
        yue: [
            "喺 GitHub 嘅執行機行。唔使錢，除咗個 repository 之外冇嘢要設定。",
            "喺 GitHub 嘅執行機行。唔使錢，除咗個 repository 之外冇嘢要設定。",
            "喺 GitHub 嘅執行機行。唔使錢，除咗個 repository 之外冇乜嘢要設定。",
            "喺 GitHub 嘅執行機行。唔使錢，除咗個 repository 之外冇嘢要設定，部機幾大就幾大。",
            "喺 GitHub 嘅執行機行：唔使錢，除咗 repository 乜都唔使搞，部機有幾勁就睇 GitHub 心情。",
        ],
    },
    "ciRenderRoute.summary.aws-batch": {
        en: [
            "Renders on AWS Fargate. No world-size limit, and you pay AWS for what it uses.",
            "Renders on AWS Fargate. No world-size limit, and you pay AWS for what it uses.",
            "Renders on AWS Fargate. There is no world-size limit, and you pay AWS for what it uses.",
            "Renders on AWS Fargate. No world-size limit, the CPU is yours to choose, and you pay AWS for what it uses.",
            "Renders on AWS Fargate: no world-size limit, as much CPU as you care to ask for, and you pay AWS for every second of it.",
        ],
        yue: [
            "喺 AWS Fargate 行。世界幾大都得，用幾多就要俾錢俾 AWS。",
            "喺 AWS Fargate 行。世界幾大都得，用幾多就要俾錢俾 AWS。",
            "喺 AWS Fargate 行。世界幾大都冇限制，用幾多就要俾錢俾 AWS。",
            "喺 AWS Fargate 行。世界幾大都冇限制，CPU 你自己揀，用幾多就要俾錢俾 AWS。",
            "喺 AWS Fargate 行：世界幾大都食得落，CPU 想要幾多有幾多，不過每一秒都要俾錢俾 AWS。",
        ],
    },
    "ciRenderRoute.reason.gh-unsupported": {
        en: [
            "This build cannot reach GitHub.",
            "This build cannot reach GitHub.",
            "This build was made without the GitHub route.",
            "This build was made without the GitHub route, so there is nothing here to turn on.",
            "This build was made without the GitHub route entirely, so no button on this screen can conjure one up.",
        ],
        yue: [
            "呢個版本連唔到 GitHub。",
            "呢個版本連唔到 GitHub。",
            "呢個版本整嘅時候冇加 GitHub 呢條路。",
            "呢個版本整嘅時候冇加 GitHub 呢條路，所以冇嘢可以開。",
            "呢個版本整嘅時候根本冇加 GitHub 呢條路，撳邊個掣都變唔出嚟。",
        ],
    },
    "ciRenderRoute.reason.gh-signed-out": {
        en: [
            "You are not signed in to GitHub.",
            "You are not signed in to GitHub.",
            "You are not signed in to GitHub yet.",
            "You are not signed in to GitHub yet, so there is nobody to start a run as.",
            "You are not signed in to GitHub yet, so there is nobody for this render to be started by.",
        ],
        yue: [
            "你未登入 GitHub。",
            "你未登入 GitHub。",
            "你仲未登入 GitHub。",
            "你仲未登入 GitHub，所以冇人可以開呢個 run。",
            "你仲未登入 GitHub，所以呢次渲染連個開工嘅人都冇。",
        ],
    },
    "ciRenderRoute.reason.aws-unsupported": {
        en: [
            "This build cannot reach AWS.",
            "This build cannot reach AWS.",
            "This build was made without the AWS route.",
            "This build was made without the AWS route, so there is nothing here to turn on.",
            "This build was made without the AWS route entirely, so no button on this screen can conjure one up.",
        ],
        yue: [
            "呢個版本連唔到 AWS。",
            "呢個版本連唔到 AWS。",
            "呢個版本整嘅時候冇加 AWS 呢條路。",
            "呢個版本整嘅時候冇加 AWS 呢條路，所以冇嘢可以開。",
            "呢個版本整嘅時候根本冇加 AWS 呢條路，撳邊個掣都變唔出嚟。",
        ],
    },
    "ciRenderRoute.reason.aws-cli-missing": {
        en: [
            "The AWS CLI is not installed on this computer.",
            "The AWS CLI is not installed on this computer.",
            "The AWS CLI is not installed on this computer yet.",
            "The AWS CLI is not installed on this computer yet, and this app signs in through it rather than holding your keys.",
            "The AWS CLI is not installed on this computer yet. This app deliberately never holds your AWS keys, so it asks the CLI to do the work instead.",
        ],
        yue: [
            "呢部機未裝 AWS CLI。",
            "呢部機未裝 AWS CLI。",
            "呢部機仲未裝 AWS CLI。",
            "呢部機仲未裝 AWS CLI，呢個 app 係靠佢登入，唔會自己攞住你條匙。",
            "呢部機仲未裝 AWS CLI。呢個 app 特登唔會揸住你嘅 AWS 鎖匙，所以要靠 CLI 幫手做嘢。",
        ],
    },
    "ciRenderRoute.reason.aws-signed-out": {
        en: [
            "The AWS session has expired.",
            "The AWS session has expired.",
            "The AWS session has expired and needs refreshing.",
            "The AWS session has expired and needs refreshing before anything can be submitted.",
            "The AWS session has expired. Nothing is broken - AWS sessions simply run out, and this one has.",
        ],
        yue: [
            "AWS 個 session 過咗期。",
            "AWS 個 session 過咗期。",
            "AWS 個 session 過咗期，要重新登入。",
            "AWS 個 session 過咗期，要重新登入先可以交嘢上去。",
            "AWS 個 session 過咗期。冇嘢壞咗，AWS 啲 session 本身就會到期，今次到期咗啫。",
        ],
    },
    "ciRenderRoute.reason.aws-no-profile": {
        en: [
            "No AWS profile has been chosen.",
            "No AWS profile has been chosen.",
            "No AWS profile has been chosen yet.",
            "No AWS profile has been chosen yet, so this does not know which account to render in.",
            "No AWS profile has been chosen yet, so this has no idea whose account is supposed to be paying for the render.",
        ],
        yue: [
            "未揀 AWS profile。",
            "未揀 AWS profile。",
            "仲未揀 AWS profile。",
            "仲未揀 AWS profile，所以唔知要用邊個帳戶渲染。",
            "仲未揀 AWS profile，所以完全唔知呢次渲染係邊個帳戶找數。",
        ],
    },
    "ciRenderRoute.reason.aws-no-region": {
        en: [
            "That AWS profile sets no region.",
            "That AWS profile sets no region.",
            "That AWS profile sets no region, so there is nowhere to run.",
            "That AWS profile sets no region, so there is nowhere in particular for the render to run.",
            "That AWS profile sets no region, and AWS will not guess one for you - neither will this.",
        ],
        yue: [
            "嗰個 AWS profile 冇設定 region。",
            "嗰個 AWS profile 冇設定 region。",
            "嗰個 AWS profile 冇設定 region，所以冇地方可以行。",
            "嗰個 AWS profile 冇設定 region，所以唔知部機要喺邊度開工。",
            "嗰個 AWS profile 冇設定 region。AWS 唔會幫你估，我哋都唔會。",
        ],
    },
    "ciRenderRoute.reason.aws-not-provisioned": {
        en: [
            "The AWS side has not been set up yet.",
            "The AWS side has not been set up yet.",
            "The AWS side has not been set up in this account yet.",
            "The AWS side has not been set up in this account yet. Setting it up shows you exactly what it creates and what it costs first.",
            "The AWS side has not been set up in this account yet. Nothing gets created until you have seen the list and the bill that comes with it.",
        ],
        yue: [
            "AWS 嗰邊未整好。",
            "AWS 嗰邊未整好。",
            "呢個 AWS 帳戶仲未整好。",
            "呢個 AWS 帳戶仲未整好。整之前會話晒你知會開啲乜、要幾多錢。",
            "呢個 AWS 帳戶仲未整好。未俾你睇清楚開乜嘢、要幾多錢之前，一樣都唔會開。",
        ],
    },

    /* -- hosting ------------------------------------------------------------- */

    "ciHostingRoute.title": {
        en: [
            "Where should the map be served from?",
            "Where should the map be served from?",
            "Where should the finished map be served from?",
            "Where should the finished map be served from? Three answers, and two of them are free.",
            "Where should the finished map live? Three answers - two free, one billed, and one of them is the machine you are sitting at.",
        ],
        yue: [
            "個地圖想放喺邊度俾人睇？",
            "個地圖想放喺邊度俾人睇？",
            "整好嘅地圖想放喺邊度俾人睇？",
            "整好嘅地圖想放喺邊度俾人睇？三個選擇，兩個免費。",
            "整好嘅地圖想住喺邊度？三個選擇：兩個唔使錢，一個要俾錢，仲有一個就係你而家坐緊嗰部機。",
        ],
    },
    "ciHostingRoute.summary.github-pages": {
        en: [
            "Served free from the repository. Public, and no bill.",
            "Served free from the repository. Public, and no bill.",
            "Served from the repository itself. It is public, and there is no bill.",
            "Served from the repository itself. It is public to anyone with the address, and there is no bill.",
            "Served from the repository itself: public to anyone who has the address, and no bill will ever arrive for it.",
        ],
        yue: [
            "由 repository 直接放出嚟。公開嘅，唔使錢。",
            "由 repository 直接放出嚟。公開嘅，唔使錢。",
            "由 repository 直接放出嚟。任何人有條 link 都睇到，唔使錢。",
            "由 repository 直接放出嚟。任何人有條 link 都睇到，而且唔使錢。",
            "由 repository 直接放出嚟：邊個有條 link 都入得，而且一世都唔會收你錢。",
        ],
    },
    "ciHostingRoute.summary.aws-cloudfront": {
        en: [
            "Served from your S3 bucket through a global cache. You pay for storage and traffic.",
            "Served from your S3 bucket through a global cache. You pay for storage and traffic.",
            "Served from your own S3 bucket through a global cache. You pay AWS for storage and traffic.",
            "Served from your own S3 bucket through a global cache, so it is fast everywhere. You pay AWS for storage and traffic.",
            "Served from your own S3 bucket through a cache that sits near whoever is looking. Fast everywhere, and you pay AWS for the storage and the traffic.",
        ],
        yue: [
            "由你自己個 S3 bucket 經全球快取放出嚟。儲存同流量要俾錢。",
            "由你自己個 S3 bucket 經全球快取放出嚟。儲存同流量要俾錢。",
            "由你自己個 S3 bucket 經全球快取放出嚟。儲存同流量要俾錢俾 AWS。",
            "由你自己個 S3 bucket 經全球快取放出嚟，邊度睇都快。儲存同流量要俾錢俾 AWS。",
            "由你自己個 S3 bucket 經全球快取放出嚟，快取就喺睇緊嗰個人隔籬，所以邊度都快。儲存同流量要俾錢俾 AWS。",
        ],
    },
    "ciHostingRoute.summary.local": {
        en: [
            "Served from this computer. Add a Cloudflare tunnel to reach it from anywhere.",
            "Served from this computer. Add a Cloudflare tunnel to reach it from anywhere.",
            "Served from this computer. On its own it is reachable on your own network; add a Cloudflare tunnel to reach it from anywhere.",
            "Served from this computer. On its own that means your own network only; a Cloudflare tunnel opens it to the internet without a port forward.",
            "Served from this computer, which on its own means your own network and nowhere else. A Cloudflare tunnel opens it to the internet without a port forward, a public address, or a hole in your firewall.",
        ],
        yue: [
            "由呢部機放出嚟。加條 Cloudflare tunnel 就邊度都入到。",
            "由呢部機放出嚟。加條 Cloudflare tunnel 就邊度都入到。",
            "由呢部機放出嚟。淨係咁嘅話得自己個網絡入到；加條 Cloudflare tunnel 就邊度都入到。",
            "由呢部機放出嚟。淨係咁嘅話得自己個網絡入到；加條 Cloudflare tunnel 就唔使開 port 都上到網。",
            "由呢部機放出嚟，淨係咁嘅話得自己個網絡入到，出面完全唔知你存在。加條 Cloudflare tunnel 就唔使開 port、唔使公網 IP、唔使喺防火牆度穿窿都上到網。",
        ],
    },
    "ciHostingRoute.reason.pages-unsupported": {
        en: [
            "This build cannot reach GitHub Pages.",
            "This build cannot reach GitHub Pages.",
            "This build was made without the GitHub Pages route.",
            "This build was made without the GitHub Pages route, so there is nothing here to turn on.",
            "This build was made without the GitHub Pages route entirely, so no button here can conjure one up.",
        ],
        yue: [
            "呢個版本連唔到 GitHub Pages。",
            "呢個版本連唔到 GitHub Pages。",
            "呢個版本整嘅時候冇加 GitHub Pages 呢條路。",
            "呢個版本整嘅時候冇加 GitHub Pages 呢條路，所以冇嘢可以開。",
            "呢個版本整嘅時候根本冇加 GitHub Pages 呢條路，撳邊個掣都變唔出嚟。",
        ],
    },
    "ciHostingRoute.reason.pages-signed-out": {
        en: [
            "You are not signed in to GitHub.",
            "You are not signed in to GitHub.",
            "You are not signed in to GitHub yet.",
            "You are not signed in to GitHub yet, so the site cannot be published.",
            "You are not signed in to GitHub yet, so there is nobody for this site to be published by.",
        ],
        yue: [
            "你未登入 GitHub。",
            "你未登入 GitHub。",
            "你仲未登入 GitHub。",
            "你仲未登入 GitHub，所以個網出唔到。",
            "你仲未登入 GitHub，所以個網連個發佈嘅人都冇。",
        ],
    },
    "ciHostingRoute.reason.cloudfront-unsupported": {
        en: [
            "This build cannot reach AWS.",
            "This build cannot reach AWS.",
            "This build was made without the AWS route.",
            "This build was made without the AWS route, so there is nothing here to turn on.",
            "This build was made without the AWS route entirely, so no button here can conjure one up.",
        ],
        yue: [
            "呢個版本連唔到 AWS。",
            "呢個版本連唔到 AWS。",
            "呢個版本整嘅時候冇加 AWS 呢條路。",
            "呢個版本整嘅時候冇加 AWS 呢條路，所以冇嘢可以開。",
            "呢個版本整嘅時候根本冇加 AWS 呢條路，撳邊個掣都變唔出嚟。",
        ],
    },
    "ciHostingRoute.reason.cloudfront-not-provisioned": {
        en: [
            "The AWS side has not been set up yet.",
            "The AWS side has not been set up yet.",
            "The AWS side has not been set up in this account yet.",
            "The AWS side has not been set up in this account yet. Setting it up shows you what it creates and what it costs first.",
            "The AWS side has not been set up in this account yet. Nothing gets created until you have seen the list and the bill that comes with it.",
        ],
        yue: [
            "AWS 嗰邊未整好。",
            "AWS 嗰邊未整好。",
            "呢個 AWS 帳戶仲未整好。",
            "呢個 AWS 帳戶仲未整好。整之前會話晒你知會開啲乜、要幾多錢。",
            "呢個 AWS 帳戶仲未整好。未俾你睇清楚開乜嘢、要幾多錢之前，一樣都唔會開。",
        ],
    },
    "ciHostingRoute.reason.local-unsupported": {
        en: [
            "This build cannot serve a map from this computer.",
            "This build cannot serve a map from this computer.",
            "This build was made without the local hosting route.",
            "This build was made without the local hosting route, so there is nothing here to turn on.",
            "This build was made without the local hosting route entirely, so no button here can conjure one up.",
        ],
        yue: [
            "呢個版本唔可以由呢部機放個地圖出嚟。",
            "呢個版本唔可以由呢部機放個地圖出嚟。",
            "呢個版本整嘅時候冇加本機寄存呢條路。",
            "呢個版本整嘅時候冇加本機寄存呢條路，所以冇嘢可以開。",
            "呢個版本整嘅時候根本冇加本機寄存呢條路，撳邊個掣都變唔出嚟。",
        ],
    },
    "ciHostingRoute.reason.local-not-running": {
        en: [
            "Nothing is serving the map on this computer.",
            "Nothing is serving the map on this computer.",
            "Nothing is serving the map on this computer yet.",
            "Nothing is serving the map on this computer yet, so there is nothing for a tunnel to point at.",
            "Nothing is serving the map on this computer yet, so a tunnel would be a door onto an empty room.",
        ],
        yue: [
            "呢部機而家冇嘢喺度放個地圖。",
            "呢部機而家冇嘢喺度放個地圖。",
            "呢部機而家仲未有嘢喺度放個地圖。",
            "呢部機而家仲未有嘢喺度放個地圖，所以條 tunnel 冇嘢可以指住。",
            "呢部機而家仲未有嘢喺度放個地圖，開條 tunnel 都係開咗道門去間吉屋。",
        ],
    },
    "ciHostingRoute.reason.no-cloudflare-token": {
        en: [
            "No Cloudflare token has been saved.",
            "No Cloudflare token has been saved.",
            "No Cloudflare token has been saved yet.",
            "No Cloudflare token has been saved yet. It is kept in this computer's credential store and never in a project file.",
            "No Cloudflare token has been saved yet. When you add one it goes into this computer's own credential store - never a project file, never a log, and never anywhere this app could read it back to you.",
        ],
        yue: [
            "未存過 Cloudflare token。",
            "未存過 Cloudflare token。",
            "仲未存過 Cloudflare token。",
            "仲未存過 Cloudflare token。佢會存喺呢部機嘅密碼庫，唔會入 project 檔案。",
            "仲未存過 Cloudflare token。加咗之後會存入呢部機自己嘅密碼庫，唔會入 project 檔案，唔會入 log，亦都唔會有任何地方讀返出嚟俾你睇。",
        ],
    },
    "ciHostingRoute.reason.cloudflared-missing": {
        en: [
            "cloudflared is not available on the machine you picked.",
            "cloudflared is not available on the machine you picked.",
            "cloudflared is not available on the machine you picked to run it.",
            "cloudflared is not available on the machine you picked to run it, so there is nothing to open a tunnel with.",
            "cloudflared is not available on the machine you picked to run it. It can run here, in a container, or on another machine over SSH - but it has to exist on whichever one you chose.",
        ],
        yue: [
            "你揀嗰部機冇 cloudflared。",
            "你揀嗰部機冇 cloudflared。",
            "你揀咗行佢嗰部機冇 cloudflared。",
            "你揀咗行佢嗰部機冇 cloudflared，所以冇嘢可以開條 tunnel。",
            "你揀咗行佢嗰部機冇 cloudflared。佢可以喺呢部機、喺容器、或者用 SSH 喺第二部機行，但你揀嗰部一定要有佢。",
        ],
    },
    "ciHostingRoute.reason.zone-not-owned": {
        en: [
            "That domain is not on this Cloudflare account.",
            "That domain is not on this Cloudflare account.",
            "That domain is not on the Cloudflare account this token belongs to.",
            "That domain is not on the Cloudflare account this token belongs to, so nothing here can change its DNS.",
            "That domain is not on the Cloudflare account this token belongs to. Only the account that holds a domain can change where it points.",
        ],
        yue: [
            "嗰個域名唔喺呢個 Cloudflare 帳戶度。",
            "嗰個域名唔喺呢個 Cloudflare 帳戶度。",
            "嗰個域名唔喺呢個 token 屬於嘅 Cloudflare 帳戶度。",
            "嗰個域名唔喺呢個 token 屬於嘅 Cloudflare 帳戶度，所以改唔到佢個 DNS。",
            "嗰個域名唔喺呢個 token 屬於嘅 Cloudflare 帳戶度。得揸住個域名嗰個帳戶先改到佢指去邊。",
        ],
    },
    "ciHostingRoute.reason.tunnel-disconnected": {
        en: [
            "The tunnel is not connected.",
            "The tunnel is not connected.",
            "The tunnel is not connected right now.",
            "The tunnel is not connected right now, so the address will not answer.",
            "The tunnel is not connected right now, so the address is pointing at a door nobody is holding open.",
        ],
        yue: [
            "條 tunnel 未接通。",
            "條 tunnel 未接通。",
            "條 tunnel 而家未接通。",
            "條 tunnel 而家未接通，所以條網址唔會覆你。",
            "條 tunnel 而家未接通，所以條網址指住道冇人揦住嘅門。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const CIRENDERROUTE_FIXED = {
    "ciRenderRoute.label.github-actions": { en: "GitHub Actions", yue: "GitHub Actions" },
    "ciRenderRoute.label.aws-batch": { en: "AWS Batch", yue: "AWS Batch" },
    "ciHostingRoute.label.github-pages": { en: "GitHub Pages", yue: "GitHub Pages" },
    "ciHostingRoute.label.aws-cloudfront": { en: "AWS CloudFront", yue: "AWS CloudFront" },
    "ciHostingRoute.label.local": { en: "This computer", yue: "呢部電腦" },
    "ciRenderRoute.fix.signInGithub": { en: "Sign in to GitHub", yue: "登入 GitHub" },
    "ciRenderRoute.fix.installAwsCli": { en: "Get the AWS CLI", yue: "攞 AWS CLI" },
    "ciRenderRoute.fix.signInAws": { en: "Sign in to AWS", yue: "登入 AWS" },
    "ciRenderRoute.fix.chooseAwsProfile": { en: "Choose a profile", yue: "揀個 profile" },
    "ciRenderRoute.fix.chooseAwsRegion": { en: "Choose a region", yue: "揀個 region" },
    "ciRenderRoute.fix.provisionAws": { en: "Set up AWS", yue: "整好 AWS" },
    "ciRenderRoute.recheck": { en: "Check again", yue: "再檢查一次" },
} as const satisfies Record<string, FixedString>;

/**
 * The words every level has to keep.
 *
 * Two kinds. The concrete nouns a person must act on - AWS, GitHub, Cloudflare,
 * cloudflared - so no refusal can be playful enough to stop naming the missing thing. And
 * the money words, because whether something costs money is the fact somebody is actually
 * choosing between, and a summary that loses it at level five has lost the point of being
 * read at all.
 */
export const CIRENDERROUTE_FACTS = {
    "ciRenderRoute.title": { en: ["render"], yue: ["渲染"] },
    "ciRenderRoute.summary.github-actions": {
        en: ["GitHub", "no bill"],
        yue: ["GitHub", "唔使錢"],
    },
    "ciRenderRoute.summary.aws-batch": {
        en: ["AWS", "you pay"],
        yue: ["AWS", "俾錢"],
    },
    "ciRenderRoute.reason.gh-unsupported": { en: ["GitHub"], yue: ["GitHub"] },
    "ciRenderRoute.reason.gh-signed-out": { en: ["GitHub"], yue: ["GitHub"] },
    "ciRenderRoute.reason.aws-unsupported": { en: ["AWS"], yue: ["AWS"] },
    "ciRenderRoute.reason.aws-cli-missing": { en: ["AWS CLI"], yue: ["AWS CLI"] },
    "ciRenderRoute.reason.aws-signed-out": { en: ["AWS"], yue: ["AWS"] },
    "ciRenderRoute.reason.aws-no-profile": { en: ["AWS profile"], yue: ["AWS profile"] },
    "ciRenderRoute.reason.aws-no-region": { en: ["AWS profile", "region"], yue: ["AWS profile", "region"] },
    "ciRenderRoute.reason.aws-not-provisioned": { en: ["AWS"], yue: ["AWS"] },
    "ciHostingRoute.title": { en: ["map"], yue: ["地圖"] },
    "ciHostingRoute.summary.github-pages": {
        en: ["repository", "no bill"],
        yue: ["repository", "唔使錢"],
    },
    "ciHostingRoute.summary.aws-cloudfront": {
        en: ["S3", "You pay", "storage and traffic"],
        yue: ["S3", "俾錢"],
    },
    "ciHostingRoute.summary.local": {
        en: ["Cloudflare", "tunnel"],
        yue: ["Cloudflare", "tunnel"],
    },
    "ciHostingRoute.reason.pages-unsupported": { en: ["GitHub Pages"], yue: ["GitHub Pages"] },
    "ciHostingRoute.reason.pages-signed-out": { en: ["GitHub"], yue: ["GitHub"] },
    "ciHostingRoute.reason.cloudfront-unsupported": { en: ["AWS"], yue: ["AWS"] },
    "ciHostingRoute.reason.cloudfront-not-provisioned": { en: ["AWS"], yue: ["AWS"] },
    "ciHostingRoute.reason.local-unsupported": { en: ["build"], yue: ["版本"] },
    "ciHostingRoute.reason.local-not-running": { en: ["map"], yue: ["地圖"] },
    "ciHostingRoute.reason.no-cloudflare-token": {
        en: ["Cloudflare"],
        yue: ["Cloudflare"],
    },
    "ciHostingRoute.reason.cloudflared-missing": { en: ["cloudflared"], yue: ["cloudflared"] },
    "ciHostingRoute.reason.zone-not-owned": { en: ["Cloudflare"], yue: ["Cloudflare"] },
    "ciHostingRoute.reason.tunnel-disconnected": { en: ["tunnel"], yue: ["tunnel"] },
} as const satisfies Record<
    string,
    { readonly en: readonly string[]; readonly yue: readonly string[] }
>;
