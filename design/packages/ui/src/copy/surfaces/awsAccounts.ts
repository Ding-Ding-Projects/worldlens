/**
 * The AWS accounts settings section.
 *
 * This surface shipped with no catalogue module at all, so every one of its strings
 * rendered the English written at its call site in all three language modes and at both
 * funny-level extremes. The catalogue-coverage check found it; this is the answer.
 */

import type { FixedString } from "../../components/setup/setupStrings.js";

export const AWSACCOUNTS_VOICED = {} as const;

export const AWSACCOUNTS_FIXED = {
    "awsAccounts.accountId": { en: "Account", yue: "戶口" },
    "awsAccounts.alias.cancel": { en: "Cancel", yue: "取消" },
    "awsAccounts.alias.needsReachable": { en: "This account must be reachable before it can be named.", yue: "要駁到呢個戶口先改到名。" },
    "awsAccounts.alias.save": { en: "Save", yue: "儲存" },
    "awsAccounts.alias.set": { en: "Set a name", yue: "改個名" },
    "awsAccounts.credits.applied": { en: "{amount} {currency} in credits applied this period", yue: "呢期用咗 {amount} {currency} credit" },
    "awsAccounts.credits.fetch": { en: "Check spending", yue: "睇使咗幾多" },
    "awsAccounts.credits.justNow": { en: "fetched just now", yue: "啱啱攞返嚟" },
    "awsAccounts.credits.minutesAgo": { en: "fetched {minutes} minutes ago", yue: "{minutes} 分鐘前攞嘅" },
    "awsAccounts.credits.net": { en: "{amount} {currency} actually charged after credits", yue: "扣咗 credit 之後實收 {amount} {currency}" },
    "awsAccounts.credits.oneMinuteAgo": { en: "fetched 1 minute ago", yue: "1 分鐘前攞嘅" },
    "awsAccounts.empty": { en: "No AWS CLI profiles were found on this machine.", yue: "呢部機搵唔到 AWS CLI profile。" },
    "awsAccounts.identity": { en: "Identity", yue: "身分" },
    "awsAccounts.list.badPattern": { en: "The pattern is not valid, so nothing is listed.", yue: "個 pattern 唔啱，所以乜都列唔到。" },
    "awsAccounts.list.searchSummary": { en: "Showing {shown} of {total}.", yue: "顯示緊 {total} 個之中嘅 {shown} 個。" },
    "awsAccounts.reachable": { en: "Reachable", yue: "駁得到" },
    "awsAccounts.refresh": { en: "Refresh", yue: "重新讀取" },
    "awsAccounts.unreachable": { en: "Unreachable", yue: "駁唔到" },
    "awsAccounts.alias.hint": { en: "Lower-case letters, numbers and hyphens. 3 to 63 characters. Cannot start or end with a hyphen.", yue: "細楷字母、數字同連字號。3 至 63 個字元。頭尾唔可以係連字號。" },
    "awsAccounts.alias.none": { en: "This account has no name. It is twelve digits, indistinguishable from any other unnamed account.", yue: "呢個戶口冇名，得十二個數字，同其他未改名嘅戶口分唔出。" },
    "awsAccounts.unavailable": { en: "This build cannot reach AWS accounts. Run it as the desktop application to see this list.", yue: "呢個版本駁唔到 AWS 戶口。要用桌面版行先睇到呢張清單。" },
    "awsAccounts.alias.field": { en: "Account name", yue: "戶口名" },
    "awsAccounts.list.label": { en: "AWS accounts", yue: "AWS 戶口" },
    "awsAccounts.search.label": { en: "Search accounts", yue: "搵戶口" },
} as const satisfies Record<string, FixedString>;

export const AWSACCOUNTS_FACTS = {} as const satisfies Record<
    keyof typeof AWSACCOUNTS_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
