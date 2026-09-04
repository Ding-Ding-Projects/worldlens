/**
 * The toy locks and the recovery desk they point at.
 *
 * Two things run through every string below and are worth stating once rather than in a
 * comment above each of them.
 *
 * ## "For fun" survives every level, in both directions
 *
 * The disclosure is the one thing this feature cannot afford to lose to a funny slider. At
 * level 1 it reads as a plain statement and at level 5 it reads as a joke about itself, but
 * at both it says the lock is not encryption and names the folder that clears it. A level
 * that dropped either would leave somebody treating a speed bump as a safe, or locked out
 * with no idea what to do about it, and the second of those is the failure this whole
 * feature is designed around.
 *
 * ## A refusal never grows a hint
 *
 * `unlock.wrongPassword` and `unlock.wrongCode` say the answer did not match, at every
 * level, and never how long it should have been, how close it came, or what it started
 * with. There is more room at level 5 and none of it is spent on the answer. The one
 * refusal that is *not* the person's fault - `unlock.noSecret` - keeps "your authenticator
 * is fine" at every level too, because telling somebody their code is wrong when their
 * authenticator is working sends them to check the one thing that is not broken.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const LOCKS_VOICED = {
    "locks.wizard.forFun": {
        en: [
            "This is a for-fun lock. It is not encryption, and forgetting the answer means deleting this application's local data folder.",
            "This is a for-fun lock: a speed bump you are putting in front of yourself. It is not encryption, and forgetting the answer means deleting this application's local data folder.",
            "This is a for-fun lock: a speed bump you are putting in front of yourself. It is not encryption, it protects nothing from anybody else who has this computer, and forgetting the answer means deleting this application's local data folder to clear every lock on the machine.",
            "This is a for-fun lock: a speed bump you are putting in front of yourself, and nobody else. It is not encryption, it protects nothing from anybody else who has this computer, and forgetting the answer means deleting this application's local data folder to clear every lock on the machine.",
            "This is a for-fun lock: a speed bump you are putting in front of yourself, and nobody else, for reasons entirely your own. It is not encryption, it protects nothing from anybody else who has this computer, and forgetting the answer means deleting this application's local data folder to clear every lock on the machine.",
        ],
        yue: [
            "呢個係玩具鎖。唔係 encryption，唔記得答案就要刪呢個應用程式嘅本機資料 folder。",
            "呢個係玩具鎖：你自己擺喺自己面前嘅一個減速壆。唔係 encryption，唔記得答案就要刪呢個應用程式嘅本機資料 folder。",
            "呢個係玩具鎖：你自己擺喺自己面前嘅一個減速壆。唔係 encryption，對住任何一個攞到呢部電腦嘅人都擋唔到，唔記得答案就要刪呢個應用程式嘅本機資料 folder，成部機所有鎖一次過清。",
            "呢個係玩具鎖：你自己擺喺自己面前嘅一個減速壆，冇第二個人。唔係 encryption，對住任何一個攞到呢部電腦嘅人都擋唔到，唔記得答案就要刪呢個應用程式嘅本機資料 folder，成部機所有鎖一次過清。",
            "呢個係玩具鎖：你自己擺喺自己面前嘅一個減速壆，冇第二個人，理由完全係你自己嘅事。唔係 encryption，對住任何一個攞到呢部電腦嘅人都擋唔到，唔記得答案就要刪呢個應用程式嘅本機資料 folder，成部機所有鎖一次過清。",
        ],
    },
    "locks.wizard.ownCredential": {
        en: [
            "This password opens this one element. There is no master password.",
            "This password opens this one element and nothing else. There is no master password.",
            "This password opens this one element and nothing else. Every lock carries its own; there is no master password anywhere in this application.",
            "This password opens this one element and nothing else at all. Every lock carries its own credential; there is no master password anywhere in this application.",
            "This password opens this one element and nothing else at all, which is either reassuring or inconvenient depending on how many you make. Every lock carries its own credential; there is no master password anywhere in this application.",
        ],
        yue: [
            "呢個密碼淨係開得呢一個 element。冇 master password。",
            "呢個密碼淨係開得呢一個 element，開唔到第二樣。冇 master password。",
            "呢個密碼淨係開得呢一個 element，開唔到第二樣。每把鎖都有自己嘅；成個應用程式入面冇 master password。",
            "呢個密碼淨係開得呢一個 element，第二樣一律開唔到。每把鎖都有自己嘅 credential；成個應用程式入面冇 master password。",
            "呢個密碼淨係開得呢一個 element，第二樣一律開唔到，你做得多鎖就知道係好事定係麻煩。每把鎖都有自己嘅 credential；成個應用程式入面冇 master password。",
        ],
    },
    "locks.wizard.noVault": {
        en: [
            "This build has nowhere safe to keep an authenticator secret, so this lock can only use a password.",
            "This build has nowhere safe to keep an authenticator secret, so this lock can only use a password.",
            "This build has nowhere safe to keep an authenticator secret, so this lock can only use a password instead.",
            "This build has nowhere safe to keep an authenticator secret at all, so this lock can only use a password instead.",
            "This build has nowhere safe to keep an authenticator secret at all, and storing one carelessly is worse than not offering it, so this lock can only use a password instead.",
        ],
        yue: [
            "呢個 build 冇地方安全咁擺 authenticator secret，所以呢把鎖淨係用得密碼。",
            "呢個 build 冇地方安全咁擺 authenticator secret，所以呢把鎖淨係用得密碼。",
            "呢個 build 冇地方安全咁擺 authenticator secret，所以呢把鎖改為淨係用得密碼。",
            "呢個 build 根本冇地方安全咁擺 authenticator secret，所以呢把鎖改為淨係用得密碼。",
            "呢個 build 根本冇地方安全咁擺 authenticator secret，求其擺仲衰過唔提供，所以呢把鎖改為淨係用得密碼。",
        ],
    },
    "locks.wizard.noHost": {
        en: [
            "This build cannot keep locks, so nothing can be locked here.",
            "This build cannot keep locks, so nothing can be locked here.",
            "This build cannot keep locks at all, so nothing can be locked here.",
            "This build cannot keep locks at all, so nothing can be locked from here.",
            "This build cannot keep locks at all, so nothing can be locked from here. The desktop application is what stores them.",
        ],
        yue: [
            "呢個 build 存唔到鎖，所以呢度乜都鎖唔到。",
            "呢個 build 存唔到鎖，所以呢度乜都鎖唔到。",
            "呢個 build 根本存唔到鎖，所以呢度乜都鎖唔到。",
            "呢個 build 根本存唔到鎖，所以喺呢度乜都鎖唔到。",
            "呢個 build 根本存唔到鎖，所以喺呢度乜都鎖唔到。要存鎖係桌面應用程式嘅嘢。",
        ],
    },
    "locks.wizard.pairing": {
        en: [
            "Scan this in your authenticator, then prove the pairing with one current code.",
            "Scan this in your authenticator, or type the secret in by hand, then prove the pairing with one current code.",
            "Scan this in your authenticator, or type the secret in by hand, then prove the pairing with one current code.",
            "Scan this in your authenticator, or type the secret in by hand if you are pairing on this same machine, then prove the pairing with one current code.",
            "Scan this in your authenticator, or type the secret in by hand if you are pairing on this same machine and cannot point a camera at your own screen, then prove the pairing with one current code.",
        ],
        yue: [
            "用 authenticator 掃呢個，然後打一個現時嘅 code 證明配對成功。",
            "用 authenticator 掃呢個，或者自己手打個 secret，然後打一個現時嘅 code 證明配對成功。",
            "用 authenticator 掃呢個，或者自己手打個 secret，然後打一個現時嘅 code 證明配對成功。",
            "用 authenticator 掃呢個，如果就喺同一部機配對就自己手打個 secret，然後打一個現時嘅 code 證明配對成功。",
            "用 authenticator 掃呢個，如果就喺同一部機配對、部相機影唔到自己個 mon，就自己手打個 secret，然後打一個現時嘅 code 證明配對成功。",
        ],
    },
    "locks.wizard.pairingFailed": {
        en: [
            "That code does not match this secret, so no lock was made.",
            "That code does not match this secret, so no lock was made.",
            "That code does not match this secret, so no lock was made. Check the authenticator scanned this exact secret.",
            "That code does not match this secret, so no lock was made at all. Check the authenticator scanned this exact secret.",
            "That code does not match this secret, so no lock was made at all, which is the kind outcome here. Check the authenticator scanned this exact secret.",
        ],
        yue: [
            "個 code 同呢個 secret 唔夾，所以冇整到鎖。",
            "個 code 同呢個 secret 唔夾，所以冇整到鎖。",
            "個 code 同呢個 secret 唔夾，所以冇整到鎖。睇下個 authenticator 掃嘅係咪呢個 secret。",
            "個 code 同呢個 secret 唔夾，所以完全冇整到鎖。睇下個 authenticator 掃嘅係咪呢個 secret。",
            "個 code 同呢個 secret 唔夾，所以完全冇整到鎖，喺呢度嚟講呢個叫做好彩。睇下個 authenticator 掃嘅係咪呢個 secret。",
        ],
    },
    "locks.wizard.confirm": {
        en: [
            "The two passwords do not match.",
            "The two passwords do not match.",
            "The two passwords do not match. A lock made from a typo is a lock nothing opens.",
            "The two passwords do not match. A lock made from a typo is a lock nothing opens, ever.",
            "The two passwords do not match. A lock made from a typo is a lock nothing opens, ever, including by you.",
        ],
        yue: [
            "兩個密碼唔一樣。",
            "兩個密碼唔一樣。",
            "兩個密碼唔一樣。打錯字整出嚟嘅鎖，係一把冇嘢開得到嘅鎖。",
            "兩個密碼唔一樣。打錯字整出嚟嘅鎖，係一把永遠冇嘢開得到嘅鎖。",
            "兩個密碼唔一樣。打錯字整出嚟嘅鎖，係一把永遠冇嘢開得到嘅鎖，包括你自己。",
        ],
    },
    "locks.wizard.needCode": {
        en: [
            "Type one current code from your authenticator.",
            "Type one current code from your authenticator, so the pairing is proven.",
            "Type one current code from your authenticator, so the pairing is proven before the lock arms.",
            "Type one current code from your authenticator, so the pairing is proven before the lock arms rather than afterwards.",
            "Type one current code from your authenticator, so the pairing is proven before the lock arms rather than at the worst possible moment later.",
        ],
        yue: [
            "喺個 authenticator 度打一個現時嘅 code。",
            "喺個 authenticator 度打一個現時嘅 code，證明配對成功。",
            "喺個 authenticator 度打一個現時嘅 code，喺把鎖生效之前證明配對成功。",
            "喺個 authenticator 度打一個現時嘅 code，喺把鎖生效之前證明配對成功，唔好等生效咗先算。",
            "喺個 authenticator 度打一個現時嘅 code，喺把鎖生效之前證明配對成功，唔好等到最唔想出事嗰刻先發現。",
        ],
    },
    "locks.wizard.needPassword": {
        en: [
            "Choose a password for this lock.",
            "Choose a password for this lock.",
            "Choose a password for this lock, and one you will recognise later.",
            "Choose a password for this lock, and one you will still recognise later.",
            "Choose a password for this lock, and one you will still recognise later, because nothing here will remind you.",
        ],
        yue: [
            "揀個密碼畀呢把鎖。",
            "揀個密碼畀呢把鎖。",
            "揀個密碼畀呢把鎖，揀個之後認得返嘅。",
            "揀個密碼畀呢把鎖，揀個之後仲認得返嘅。",
            "揀個密碼畀呢把鎖，揀個之後仲認得返嘅，因為呢度冇嘢會提你。",
        ],
    },
    "locks.unlock.forFun": {
        en: [
            "This lock is just for fun. It is not encryption.",
            "This lock is just for fun. It is not encryption and it protects nothing from anybody else who has this computer.",
            "This lock is just for fun. It is not encryption and it does not protect anything from anybody else who has this computer.",
            "This lock is just for fun. It is not encryption, and it does not protect anything from anybody else who has this computer.",
            "This lock is just for fun, and somebody here chose to put it in front of themselves. It is not encryption, and it does not protect anything from anybody else who has this computer.",
        ],
        yue: [
            "呢把鎖淨係玩下。唔係 encryption。",
            "呢把鎖淨係玩下。唔係 encryption，對住任何一個攞到呢部電腦嘅人都擋唔到。",
            "呢把鎖淨係玩下。唔係 encryption，亦都保護唔到任何嘢，唔擋得住任何一個攞到呢部電腦嘅人。",
            "呢把鎖淨係玩下。唔係 encryption，亦都保護唔到任何嘢，唔擋得住任何一個攞到呢部電腦嘅人。",
            "呢把鎖淨係玩下，係有人自己揀擺喺自己面前嘅。唔係 encryption，亦都保護唔到任何嘢，唔擋得住任何一個攞到呢部電腦嘅人。",
        ],
    },
    "locks.unlock.wrongPassword": {
        en: [
            "That password did not match.",
            "That password did not match.",
            "That password did not match. Try again.",
            "That password did not match. Try again whenever you like.",
            "That password did not match. Try again whenever you like; nothing is counting down and nothing is being taken away.",
        ],
        yue: [
            "個密碼唔啱。",
            "個密碼唔啱。",
            "個密碼唔啱。再試過啦。",
            "個密碼唔啱。幾時想再試都得。",
            "個密碼唔啱。幾時想再試都得；冇嘢喺度倒數，亦都冇嘢會被攞走。",
        ],
    },
    "locks.unlock.wrongCode": {
        en: [
            "That code did not match.",
            "That code did not match.",
            "That code did not match. Try the next one.",
            "That code did not match. Try the next one when it comes round.",
            "That code did not match. Try the next one when it comes round; a code typed as it expires is the usual explanation.",
        ],
        yue: [
            "個 code 唔啱。",
            "個 code 唔啱。",
            "個 code 唔啱。試下一個啦。",
            "個 code 唔啱。等下一個轉出嚟再試。",
            "個 code 唔啱。等下一個轉出嚟再試；通常都係打到一半嗰個過咗期。",
        ],
    },
    "locks.unlock.noSecret": {
        en: [
            "This lock's secret is not on this computer any more. Your authenticator is fine; the stored half is gone.",
            "This lock's authenticator secret is not on this computer any more, so no code can open it. Your authenticator is fine; the stored half is gone.",
            "This lock's authenticator secret is not on this computer any more, so no code can open it. Your authenticator is fine; the stored half is gone.",
            "This lock's authenticator secret is not on this computer any more, so no code can open it at all. Your authenticator is fine; the stored half is gone.",
            "This lock's authenticator secret is not on this computer any more, so no code can open it at all, and none of this is your doing. Your authenticator is fine; the stored half is gone.",
        ],
        yue: [
            "呢把鎖個 secret 已經唔喺呢部電腦。你個 authenticator 冇問題，係存喺呢邊嗰半冇咗。",
            "呢把鎖個 authenticator secret 已經唔喺呢部電腦，所以冇 code 開得到。你個 authenticator 冇問題，係存喺呢邊嗰半冇咗。",
            "呢把鎖個 authenticator secret 已經唔喺呢部電腦，所以冇 code 開得到。你個 authenticator 冇問題，係存喺呢邊嗰半冇咗。",
            "呢把鎖個 authenticator secret 已經唔喺呢部電腦，所以根本冇 code 開得到。你個 authenticator 冇問題，係存喺呢邊嗰半冇咗。",
            "呢把鎖個 authenticator secret 已經唔喺呢部電腦，所以根本冇 code 開得到，而且完全唔關你事。你個 authenticator 冇問題，係存喺呢邊嗰半冇咗。",
        ],
    },
    "locks.unlock.slowDown": {
        en: [
            "Too many tries. Wait {seconds} seconds. Nothing has been lost.",
            "Too many tries. Wait {seconds} seconds and try again. Nothing has been lost.",
            "Too many tries. Wait {seconds} seconds and try again. Nothing has been lost.",
            "Too many tries. Wait {seconds} seconds and try again. Nothing has been lost, and nothing will be.",
            "Too many tries. Wait {seconds} seconds and try again. Nothing has been lost, and nothing will be, however many times this happens.",
        ],
        yue: [
            "試得太密。等 {seconds} 秒。乜都冇失去。",
            "試得太密。等 {seconds} 秒再試。乜都冇失去。",
            "試得太密。等 {seconds} 秒再試，乜都冇失去。",
            "試得太密。等 {seconds} 秒再試，乜都冇失去，之後都唔會。",
            "試得太密。等 {seconds} 秒再試，乜都冇失去，之後都唔會，試幾多次都係咁。",
        ],
    },
    "locks.unlock.recoveryPath": {
        en: [
            "Every lock is reset by deleting {folder}. That is what {action} means here.",
            "Every lock on this computer is reset by deleting {folder}. That is what {action} means here.",
            "Every lock on this computer is reset by deleting {folder}. Nothing else in it is a lock, so {action} takes your other settings with it.",
            "Every lock on this computer is reset by deleting {folder}. Nothing else in it is a lock, so {action} takes your other settings along with them.",
            "Every lock on this computer is reset by deleting {folder}, which is a blunt instrument and the only one there is. Nothing else in it is a lock, so {action} takes your other settings along with them.",
        ],
        yue: [
            "所有鎖都係靠刪 {folder} 嚟重設。喺呢度 {action} 就係咁解。",
            "呢部電腦所有鎖都係靠刪 {folder} 嚟重設。喺呢度 {action} 就係咁解。",
            "呢部電腦所有鎖都係靠刪 {folder} 嚟重設。入面其他嘢唔係鎖，所以 {action} 會連你其他設定一齊帶走。",
            "呢部電腦所有鎖都係靠刪 {folder} 嚟重設。入面其他嘢唔係鎖，所以 {action} 會連你其他設定一齊帶走。",
            "呢部電腦所有鎖都係靠刪 {folder} 嚟重設，好粗暴，但係得呢招。入面其他嘢唔係鎖，所以 {action} 會連你其他設定一齊帶走。",
        ],
    },
    "locks.unlock.recoveryUnknown": {
        en: [
            "Every lock is reset by deleting this application's local data folder. This build cannot say where it is.",
            "Every lock on this computer is reset by deleting this application's local data folder. This build cannot say where that folder is.",
            "Every lock on this computer is reset by deleting this application's local data folder. This build cannot say where that folder is.",
            "Every lock on this computer is reset by deleting this application's local data folder. This build cannot say where that folder is, so it will not guess.",
            "Every lock on this computer is reset by deleting this application's local data folder. This build cannot say where that folder is, so it will not guess at a path you might then delete.",
        ],
        yue: [
            "所有鎖都係靠刪呢個應用程式嘅本機資料 folder 嚟重設。呢個 build 講唔到喺邊。",
            "呢部電腦所有鎖都係靠刪呢個應用程式嘅本機資料 folder 嚟重設。呢個 build 講唔到嗰個 folder 喺邊。",
            "呢部電腦所有鎖都係靠刪呢個應用程式嘅本機資料 folder 嚟重設。呢個 build 講唔到嗰個 folder 喺邊。",
            "呢部電腦所有鎖都係靠刪呢個應用程式嘅本機資料 folder 嚟重設。呢個 build 講唔到嗰個 folder 喺邊，所以佢唔會靠估。",
            "呢部電腦所有鎖都係靠刪呢個應用程式嘅本機資料 folder 嚟重設。呢個 build 講唔到嗰個 folder 喺邊，唔會靠估一條你跟住去刪嘅路徑。",
        ],
    },
    "locks.list.lede": {
        en: [
            "Every lock on this computer. Each one has its own credential, and all of them are for fun.",
            "Every lock you have put on this computer. Each one has its own credential and opens nothing else, and all of them are for fun.",
            "Every lock you have put on this computer. Each one has its own credential and opens nothing else; there is no master password. All of them are for fun, and all of them are cleared at once by deleting this application's local data folder.",
            "Every lock you have put on this computer. Each one has its own credential and opens nothing else at all; there is no master password. All of them are for fun, and all of them are cleared at once by deleting this application's local data folder.",
            "Every lock you have put on this computer, in the order you made them. Each one has its own credential and opens nothing else at all; there is no master password. All of them are for fun, and all of them are cleared at once by deleting this application's local data folder.",
        ],
        yue: [
            "呢部電腦上所有鎖。每把都有自己嘅 credential，而且全部都係玩具。",
            "你喺呢部電腦上落嘅所有鎖。每把都有自己嘅 credential，開唔到第二樣，全部都係玩具。",
            "你喺呢部電腦上落嘅所有鎖。每把都有自己嘅 credential，開唔到第二樣；冇 master password。全部都係玩具，亦都全部係刪呢個應用程式嘅本機資料 folder 一次過清。",
            "你喺呢部電腦上落嘅所有鎖。每把都有自己嘅 credential，第二樣一律開唔到；冇 master password。全部都係玩具，亦都全部係刪呢個應用程式嘅本機資料 folder 一次過清。",
            "你喺呢部電腦上落嘅所有鎖，順住你做嘅次序。每把都有自己嘅 credential，第二樣一律開唔到；冇 master password。全部都係玩具，亦都全部係刪呢個應用程式嘅本機資料 folder 一次過清。",
        ],
    },
    "locks.list.unsupported": {
        en: [
            "This build cannot keep locks, so there is no list to show.",
            "This build cannot keep locks, so there is no list to show.",
            "This build cannot keep locks, so there is no list to show. The desktop application is what stores them.",
            "This build cannot keep locks at all, so there is no list to show. The desktop application is what stores them.",
            "This build cannot keep locks at all, so there is no list to show rather than an empty one. The desktop application is what stores them.",
        ],
        yue: [
            "呢個 build 存唔到鎖，所以冇 list 可以顯示。",
            "呢個 build 存唔到鎖，所以冇 list 可以顯示。",
            "呢個 build 存唔到鎖，所以冇 list 可以顯示。要存鎖係桌面應用程式嘅嘢。",
            "呢個 build 根本存唔到鎖，所以冇 list 可以顯示。要存鎖係桌面應用程式嘅嘢。",
            "呢個 build 根本存唔到鎖，所以係冇 list，唔係一個空 list。要存鎖係桌面應用程式嘅嘢。",
        ],
    },
    "locks.list.failed": {
        en: [
            "The list could not be read, so this is not an empty list - it is an unknown one: {message}",
            "The list of locks could not be read, so this is not an empty list - it is an unknown one: {message}",
            "The list of locks could not be read, so this is not an empty list - it is an unknown one: {message}",
            "The list of locks could not be read, so this is not an empty list at all - it is an unknown one: {message}",
            "The list of locks could not be read, so this is not an empty list at all - it is an unknown one, which is a very different thing to tell you: {message}",
        ],
        yue: [
            "讀唔到個 list，所以呢個唔係空 list，係一個唔知係咩嘅 list：{message}",
            "讀唔到啲鎖嘅 list，所以呢個唔係空 list，係一個唔知係咩嘅 list：{message}",
            "讀唔到啲鎖嘅 list，所以呢個唔係空 list，係一個唔知係咩嘅 list：{message}",
            "讀唔到啲鎖嘅 list，所以呢個完全唔係空 list，係一個唔知係咩嘅 list：{message}",
            "讀唔到啲鎖嘅 list，所以呢個完全唔係空 list，係一個唔知係咩嘅 list，同你講呢兩句，意思差好遠：{message}",
        ],
    },
    "locks.list.confirmRemove": {
        en: [
            "Remove {count} locks? The elements behind them are not touched.",
            "Remove {count} locks? The elements behind them are not touched.",
            "Remove {count} locks? The elements behind them are not touched - only the locks go.",
            "Remove {count} locks? The elements behind them are not touched at all - only the locks go.",
            "Remove {count} locks? The elements behind them are not touched at all - only the locks go, and nothing you have made goes with them.",
        ],
        yue: [
            "剷走 {count} 把鎖？後面啲 element 唔會郁到。",
            "剷走 {count} 把鎖？後面啲 element 唔會郁到。",
            "剷走 {count} 把鎖？後面啲 element 唔會郁到，淨係啲鎖走。",
            "剷走 {count} 把鎖？後面啲 element 一律唔會郁到，淨係啲鎖走。",
            "剷走 {count} 把鎖？後面啲 element 一律唔會郁到，淨係啲鎖走，你整落嘅嘢一樣都唔會跟住走。",
        ],
    },
    "support.disclosure": {
        en: [
            "Nothing here is sent anywhere. No network request is made, no data is collected, nobody is reading it, and this is not a real support service.",
            "Nothing here is sent anywhere. No ticket exists outside this computer, no network request is made, no data is collected, nobody is reading it, and this is not a real support service.",
            "Nothing here is sent anywhere. No ticket exists outside this computer, no network request is made, no data is collected, and nobody is reading it. This desk is part of this application and is not a real support service.",
            "Nothing here is sent anywhere at all. No ticket exists outside this computer, no network request is made, no data is collected, and nobody is reading it. This desk is part of this application and is not a real support service.",
            "Nothing here is sent anywhere at all, which is the most important sentence on this page. No ticket exists outside this computer, no network request is made, no data is collected, and nobody is reading it. This desk is part of this application and is not a real support service.",
        ],
        yue: [
            "呢度冇嘢會送去任何地方。冇 network request，冇收集資料，冇人喺度睇，亦都唔係真嘅客服。",
            "呢度冇嘢會送去任何地方。呢部電腦以外冇任何 ticket 存在，冇 network request，冇收集資料，冇人喺度睇，亦都唔係真嘅客服。",
            "呢度冇嘢會送去任何地方。呢部電腦以外冇任何 ticket 存在，冇 network request，冇收集資料，亦都冇人喺度睇。呢個櫃檯係應用程式嘅一部分，唔係真嘅客服。",
            "呢度完全冇嘢會送去任何地方。呢部電腦以外冇任何 ticket 存在，冇 network request，冇收集資料，亦都冇人喺度睇。呢個櫃檯係應用程式嘅一部分，唔係真嘅客服。",
            "呢度完全冇嘢會送去任何地方，成版嘢最緊要就係呢句。呢部電腦以外冇任何 ticket 存在，冇 network request，冇收集資料，亦都冇人喺度睇。呢個櫃檯係應用程式嘅一部分，唔係真嘅客服。",
        ],
    },
    "support.resolutionText": {
        en: [
            "Every lock is cleared by deleting this application's local data folder.",
            "Every lock on this computer is cleared by deleting this application's local data folder. Your worlds and rendered maps are not in it.",
            "Every lock on this computer is cleared by deleting this application's local data folder. Your worlds and your rendered maps are not in it. Your settings, your history and your tickets are, and they go too.",
            "Every lock on this computer is cleared by deleting this application's local data folder. Your worlds and your rendered maps are not in it at all. Your settings, your history and your tickets are, and they go too.",
            "Every lock on this computer is cleared by deleting this application's local data folder, which is exactly as subtle as it sounds. Your worlds and your rendered maps are not in it at all. Your settings, your history and your tickets are, and they go too.",
        ],
        yue: [
            "所有鎖都係靠刪呢個應用程式嘅本機資料 folder 嚟清。",
            "呢部電腦所有鎖都係靠刪呢個應用程式嘅本機資料 folder 嚟清。你啲世界同 render 好嘅地圖唔喺入面。",
            "呢部電腦所有鎖都係靠刪呢個應用程式嘅本機資料 folder 嚟清。你啲世界同 render 好嘅地圖唔喺入面。你啲設定、記錄同 ticket 就喺，會一齊走。",
            "呢部電腦所有鎖都係靠刪呢個應用程式嘅本機資料 folder 嚟清。你啲世界同 render 好嘅地圖完全唔喺入面。你啲設定、記錄同 ticket 就喺，會一齊走。",
            "呢部電腦所有鎖都係靠刪呢個應用程式嘅本機資料 folder 嚟清，粗暴程度同你諗嘅一樣。你啲世界同 render 好嘅地圖完全唔喺入面。你啲設定、記錄同 ticket 就喺，會一齊走。",
        ],
    },
    "support.weDoNotDelete": {
        en: [
            "This application does not delete it for you.",
            "This application does not delete it for you. It opens the folder; the deleting is yours to do.",
            "This application does not delete it for you. It opens the folder; the deleting is yours to do.",
            "This application does not delete it for you, deliberately. It opens the folder; the deleting is yours to do.",
            "This application does not delete it for you, deliberately, because a button that wipes your settings should not be hiding behind a joke. It opens the folder; the deleting is yours to do.",
        ],
        yue: [
            "呢個應用程式唔會幫你刪。",
            "呢個應用程式唔會幫你刪。佢淨係開個 folder；刪係你自己嘅事。",
            "呢個應用程式唔會幫你刪。佢淨係開個 folder；刪係你自己嘅事。",
            "呢個應用程式故意唔會幫你刪。佢淨係開個 folder；刪係你自己嘅事。",
            "呢個應用程式故意唔會幫你刪，因為一粒會抹走你所有設定嘅掣，唔應該匿喺個笑話後面。佢淨係開個 folder；刪係你自己嘅事。",
        ],
    },
    "support.cannedReply": {
        en: [
            "Thank you for contacting Support. Your ticket has been escalated to the only engineer, which is this application. The recommended resolution is below.",
            "Thank you for contacting Support. Your ticket has been assigned Priority One and escalated to the only engineer, which is this application. The recommended resolution is below.",
            "Thank you for contacting Support. Your ticket has been assigned Priority One and escalated to the only engineer, who is this application. Having reviewed the case in depth, the recommended resolution is the one below, which is also the only one.",
            "Thank you for contacting Support. Your ticket has been assigned Priority One and escalated to the only engineer, who is this application. Having reviewed the case in considerable depth, the recommended resolution is the one below, which is also the only one.",
            "Thank you for contacting Support. Your ticket has been assigned Priority One and escalated to the only engineer, who is this application, and who has been on this case since you pressed the button. Having reviewed it in considerable depth, the recommended resolution is the one below, which is also the only one.",
        ],
        yue: [
            "多謝你聯絡客服。你張 ticket 已經轉畀唯一嘅工程師，即係呢個應用程式。建議嘅解決方法喺下面。",
            "多謝你聯絡客服。你張 ticket 已經評為最高優先，轉畀唯一嘅工程師，即係呢個應用程式。建議嘅解決方法喺下面。",
            "多謝你聯絡客服。你張 ticket 已經評為最高優先，轉畀唯一嘅工程師，即係呢個應用程式。深入研究過之後，建議嘅解決方法就係下面嗰個，亦都係唯一嗰個。",
            "多謝你聯絡客服。你張 ticket 已經評為最高優先，轉畀唯一嘅工程師，即係呢個應用程式。相當深入咁研究過之後，建議嘅解決方法就係下面嗰個，亦都係唯一嗰個。",
            "多謝你聯絡客服。你張 ticket 已經評為最高優先，轉畀唯一嘅工程師，即係呢個應用程式；佢由你㩒落去嗰刻已經跟緊呢單嘢。相當深入咁研究過之後，建議嘅解決方法就係下面嗰個，亦都係唯一嗰個。",
        ],
    },
    "support.cannotOpen": {
        en: [
            "This build cannot open a file manager. The folder is named above.",
            "This build cannot open a file manager. The folder is named above; open it yourself.",
            "This build cannot open a file manager. The folder is named above; open it yourself.",
            "This build cannot open a file manager at all. The folder is named above; open it yourself.",
            "This build cannot open a file manager at all, so this is where the service ends. The folder is named above; open it yourself.",
        ],
        yue: [
            "呢個 build 開唔到 file manager。個 folder 喺上面寫咗。",
            "呢個 build 開唔到 file manager。個 folder 喺上面寫咗，自己開啦。",
            "呢個 build 開唔到 file manager。個 folder 喺上面寫咗，自己開啦。",
            "呢個 build 根本開唔到 file manager。個 folder 喺上面寫咗，自己開啦。",
            "呢個 build 根本開唔到 file manager，服務就到呢度為止。個 folder 喺上面寫咗，自己開啦。",
        ],
    },
    "support.openFailed": {
        en: [
            "The file manager did not open. The folder is named above.",
            "The file manager did not open. The folder is named above; open it yourself.",
            "The file manager did not open. The folder is named above; open it yourself.",
            "The file manager did not open this time. The folder is named above; open it yourself.",
            "The file manager did not open this time, and this desk has exhausted its options. The folder is named above; open it yourself.",
        ],
        yue: [
            "個 file manager 冇開到。個 folder 喺上面寫咗。",
            "個 file manager 冇開到。個 folder 喺上面寫咗，自己開啦。",
            "個 file manager 冇開到。個 folder 喺上面寫咗，自己開啦。",
            "今次個 file manager 冇開到。個 folder 喺上面寫咗，自己開啦。",
            "今次個 file manager 冇開到，呢個櫃檯招數用晒。個 folder 喺上面寫咗，自己開啦。",
        ],
    },
    "support.folderUnknown": {
        en: [
            "This build cannot say where that folder is.",
            "This build cannot say where that folder is, so it cannot open it either.",
            "This build cannot say where that folder is, so it cannot open it either.",
            "This build cannot say where that folder is, so it cannot open it either, and it will not guess.",
            "This build cannot say where that folder is, so it cannot open it either, and it will not guess at a path you might then delete.",
        ],
        yue: [
            "呢個 build 講唔到嗰個 folder 喺邊。",
            "呢個 build 講唔到嗰個 folder 喺邊，所以亦都開唔到。",
            "呢個 build 講唔到嗰個 folder 喺邊，所以亦都開唔到。",
            "呢個 build 講唔到嗰個 folder 喺邊，所以亦都開唔到，佢亦都唔會靠估。",
            "呢個 build 講唔到嗰個 folder 喺邊，所以亦都開唔到，亦都唔會靠估一條你跟住去刪嘅路徑。",
        ],
    },
    "support.empty": {
        en: [
            "No tickets.",
            "No tickets. Nothing has gone wrong yet.",
            "No tickets. Nothing has gone wrong yet, or nothing you have told this desk about.",
            "No tickets at all. Nothing has gone wrong yet, or nothing you have told this desk about.",
            "No tickets at all, which this desk chooses to read as a triumph. Nothing has gone wrong yet, or nothing you have told this desk about.",
        ],
        yue: [
            "冇 ticket。",
            "冇 ticket。暫時未出過事。",
            "冇 ticket。暫時未出過事，又或者出咗但係你冇同呢個櫃檯講。",
            "一張 ticket 都冇。暫時未出過事，又或者出咗但係你冇同呢個櫃檯講。",
            "一張 ticket 都冇，呢個櫃檯決定當呢個係勝利。暫時未出過事，又或者出咗但係你冇同呢個櫃檯講。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const LOCKS_FIXED = {
    "locks.menu.lock": { en: "Lock this element...", yue: "鎖住呢個 element..." },
    "locks.menu.unlock": { en: "Unlock this element...", yue: "解鎖呢個 element..." },
    "locks.menu.relock": { en: "Lock it again now", yue: "即刻再鎖返" },
    "locks.menu.remove": { en: "Remove this lock", yue: "剷走呢把鎖" },

    "locks.duration.surface": { en: "This surface only", yue: "淨係呢一版" },
    "locks.duration.session": { en: "Until the app closes", yue: "直到閂咗個 app" },
    "locks.duration.minutes": { en: "For a set number of minutes", yue: "指定幾多分鐘" },

    "locks.wizard.title": { en: "Lock {label}", yue: "鎖住 {label}" },
    "locks.wizard.label": { en: "Lock {label}", yue: "鎖住 {label}" },
    "locks.wizard.method": { en: "How this one opens", yue: "呢把點樣開" },
    "locks.wizard.methodPassword": { en: "A password", yue: "一個密碼" },
    "locks.wizard.methodTotp": { en: "A code from an authenticator", yue: "authenticator 出嘅 code" },
    "locks.wizard.password": { en: "Password for this lock", yue: "呢把鎖嘅密碼" },
    "locks.wizard.passwordAgain": { en: "The same password again", yue: "再打多次同一個密碼" },
    "locks.wizard.secret": {
        en: "The secret, in case you are typing it",
        yue: "個 secret，如果你係手打嘅話",
    },
    "locks.wizard.code": { en: "One current code, to prove the pairing", yue: "一個現時嘅 code，用嚟證明配對" },
    "locks.wizard.duration": { en: "How long an unlock lasts", yue: "解鎖之後維持幾耐" },
    "locks.wizard.minutes": { en: "Minutes", yue: "分鐘" },
    "locks.wizard.badMinutes": {
        en: "Enter a whole number of minutes from 1 to {max}.",
        yue: "請填 1 至 {max} 之間嘅整數分鐘。",
    },
    "locks.wizard.create": { en: "Lock it", yue: "鎖佢" },
    "locks.wizard.cancel": { en: "Never mind", yue: "算數" },

    "locks.unlock.title": { en: "{label} is locked", yue: "{label} 鎖咗" },
    "locks.unlock.password": { en: "Password for this lock", yue: "呢把鎖嘅密碼" },
    "locks.unlock.code": {
        en: "Six-digit code from your authenticator",
        yue: "你 authenticator 出嘅六位數字",
    },
    "locks.unlock.open": { en: "Unlock", yue: "解鎖" },
    "locks.unlock.cancel": { en: "Leave it locked", yue: "咪郁佢，繼續鎖住" },
    "locks.unlock.forgotten": { en: "Forgotten it?", yue: "唔記得咗？" },
    "locks.unlock.support": { en: "Open Support Tickets", yue: "打開 Support Tickets" },

    "locks.list.title": { en: "Locks", yue: "鎖" },
    "locks.list.search": { en: "Search locks", yue: "搵鎖" },
    "locks.list.badPattern": {
        en: "The pattern is not valid, so nothing is listed.",
        yue: "個 pattern 唔啱，所以乜都唔會列出嚟。",
    },
    "locks.list.summary": { en: "{shown} of {total} locks match.", yue: "{total} 把鎖入面有 {shown} 把夾。" },
    "locks.list.empty": { en: "Nothing on this computer is locked.", yue: "呢部電腦冇嘢鎖住。" },
    "locks.list.noMatch": { en: "No lock matches that search.", yue: "冇鎖夾到嗰個搜尋。" },
    "locks.list.byPassword": { en: "Password", yue: "密碼" },
    "locks.list.byAuthenticator": { en: "Authenticator", yue: "Authenticator" },
    "locks.list.forMinutes": { en: "For {minutes} minutes", yue: "維持 {minutes} 分鐘" },
    "locks.list.open": { en: "Open now", yue: "而家開住" },
    "locks.list.closed": { en: "Locked", yue: "鎖住" },
    "locks.list.relock": { en: "Lock again", yue: "再鎖返" },
    "locks.list.remove": { en: "Remove", yue: "剷走" },
    "locks.list.selectListed": { en: "Select the {count} shown", yue: "揀晒顯示緊嘅 {count} 個" },
    "locks.list.invert": { en: "Invert within those shown", yue: "喺顯示緊嗰批入面反轉" },
    "locks.list.selectNone": { en: "Select none", yue: "一個都唔揀" },
    "locks.list.selectOne": { en: "Select the lock on {label}", yue: "揀 {label} 上面嗰把鎖" },
    "locks.list.removeSelected": { en: "Remove {count} locks", yue: "剷走 {count} 把鎖" },
    "locks.list.confirmYes": { en: "Remove them", yue: "剷走佢哋" },
    "locks.list.confirmNo": { en: "Keep them", yue: "留返佢哋" },

    "support.title": { en: "Support Tickets", yue: "Support Tickets" },
    "support.raise": { en: "Raise a ticket", yue: "開一張 ticket" },
    "support.category": { en: "What has happened", yue: "發生咗咩事" },
    "support.category.lockedOut": {
        en: "I am locked out of something",
        yue: "我畀嘢鎖咗喺門外",
    },
    "support.category.forgot": { en: "I have forgotten a password", yue: "我唔記得咗個密碼" },
    "support.category.authenticator": { en: "My authenticator is gone", yue: "我個 authenticator 冇咗" },
    "support.category.other": { en: "Something else entirely", yue: "完全另一件事" },
    "support.describe": {
        en: "Describe the problem in your own words",
        yue: "用你自己嘅講法描述下個問題",
    },
    "support.submit": { en: "Submit ticket", yue: "交張 ticket" },
    "support.severity.urgent": { en: "Urgent - Priority One", yue: "緊急，最高優先" },
    "support.status.triaged": { en: "Triaged - awaiting your action", yue: "已分流，等你出手" },
    "support.status.resolved": { en: "Resolved", yue: "已解決" },
    "support.knownResolution": { en: "Known resolution", yue: "已知解決方法" },
    "support.openFolder": {
        en: "Open the folder so I can delete it",
        yue: "打開個 folder，等我自己刪",
    },
    "support.search": { en: "Search your tickets", yue: "搵你啲 ticket" },
    "support.badPattern": {
        en: "The pattern is not valid, so nothing is listed.",
        yue: "個 pattern 唔啱，所以乜都唔會列出嚟。",
    },
    "support.listSummary": {
        en: "{shown} of {total} tickets match.",
        yue: "{total} 張 ticket 入面有 {shown} 張夾。",
    },
    /* Catalogue-coverage sweep: these answered nothing, so every language and every
       funny level rendered the English fallback. */
    "locks.badge.label": { en: "Locked", yue: "鎖咗" },
    "locks.list.change": { en: "Change", yue: "更改" },
    "locks.menu.change": { en: "Change this lock's password or authenticator...", yue: "改呢個鎖嘅密碼或者驗證器…" },
    "locks.wizard.changeTitle": { en: "Change the lock on {label}", yue: "更改 {label} 上面嘅鎖" },
    "locks.badge.title": { en: "Locked. Choose to unlock it.", yue: "鎖住咗。㩒一下就可以解鎖。" },
} as const satisfies Record<string, FixedString>;

export const LOCKS_FACTS = {
    // The two the funny slider may never take: it is not encryption, and here is the way out.
    "locks.wizard.forFun": {
        en: ["for-fun lock", "not encryption", "local data folder"],
        yue: ["玩具鎖", "唔係 encryption", "本機資料 folder"],
    },
    "locks.wizard.ownCredential": {
        en: ["this one element", "no master password"],
        yue: ["呢一個 element", "冇 master password"],
    },
    "locks.wizard.noVault": {
        en: ["nowhere safe", "password"],
        yue: ["冇地方安全", "密碼"],
    },
    "locks.wizard.noHost": { en: ["cannot keep locks"], yue: ["存唔到鎖"] },
    "locks.wizard.pairing": { en: ["authenticator", "current code"], yue: ["authenticator", "現時嘅 code"] },
    "locks.wizard.pairingFailed": {
        en: ["does not match", "no lock was made"],
        yue: ["唔夾", "冇整到鎖"],
    },
    "locks.wizard.confirm": { en: ["do not match"], yue: ["唔一樣"] },
    "locks.wizard.needCode": { en: ["current code"], yue: ["現時嘅 code"] },
    "locks.wizard.needPassword": { en: ["Choose a password"], yue: ["揀個密碼"] },
    "locks.unlock.forFun": { en: ["just for fun", "not encryption"], yue: ["淨係玩下", "唔係 encryption"] },
    // A refusal never grows a hint, so the fact is only that it did not match.
    "locks.unlock.wrongPassword": { en: ["did not match"], yue: ["唔啱"] },
    "locks.unlock.wrongCode": { en: ["did not match"], yue: ["唔啱"] },
    "locks.unlock.noSecret": {
        en: ["Your authenticator is fine", "the stored half is gone"],
        yue: ["你個 authenticator 冇問題", "存喺呢邊嗰半冇咗"],
    },
    "locks.unlock.slowDown": { en: ["{seconds}", "Nothing has been lost"], yue: ["{seconds}", "乜都冇失去"] },
    "locks.unlock.recoveryPath": { en: ["{folder}", "{action}"], yue: ["{folder}", "{action}"] },
    "locks.unlock.recoveryUnknown": {
        en: ["local data folder", "cannot say where"],
        yue: ["本機資料 folder", "講唔到"],
    },
    "locks.list.lede": {
        en: ["own credential", "for fun"],
        yue: ["自己嘅 credential", "玩具"],
    },
    "locks.list.unsupported": { en: ["cannot keep locks"], yue: ["存唔到鎖"] },
    // "Not an empty list" is the fact: an unread list must never read as an empty one.
    "locks.list.failed": { en: ["not an empty list", "{message}"], yue: ["唔係空 list", "{message}"] },
    "locks.list.confirmRemove": { en: ["{count}", "not touched"], yue: ["{count}", "唔會郁到"] },
    "support.disclosure": {
        en: ["sent anywhere", "nobody is reading it", "not a real support service"],
        yue: ["送去任何地方", "冇人喺度睇", "唔係真嘅客服"],
    },
    "support.resolutionText": { en: ["local data folder"], yue: ["本機資料 folder"] },
    "support.weDoNotDelete": { en: ["does not delete it for you"], yue: ["唔會幫你刪"] },
    // Never a real company, a named agent, or a promised response time.
    "support.cannedReply": { en: ["this application"], yue: ["呢個應用程式"] },
    "support.cannotOpen": { en: ["cannot open a file manager"], yue: ["開唔到 file manager"] },
    "support.openFailed": { en: ["did not open"], yue: ["冇開到"] },
    "support.folderUnknown": { en: ["cannot say where"], yue: ["講唔到"] },
    "support.empty": { en: ["No tickets"], yue: ["ticket"] },
} as const satisfies Record<
    keyof typeof LOCKS_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
