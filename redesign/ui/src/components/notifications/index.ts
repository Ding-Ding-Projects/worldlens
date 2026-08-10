/**
 * The notification centre.
 *
 * `NotificationCentre` is the whole feature: a bell with an unread count and, behind it,
 * the reviewable history. The redesigned desktop shell mounts it beside the application rail;
 * a browser-shaped host can mount it inside `components/config/ConfigNotifications.vue` beside
 * ordinary toasts. The state decides which delivery contract applies, so the two consumers do
 * not need duplicate histories or competing live overlays.
 *
 * `NoticeCentrePanel` is the card on its own, exported so a test can mount the panel
 * without driving a menu overlay, and so a future surface (a settings tab, a wider window)
 * can host the same list without reimplementing it.
 *
 * The queue, its levels, its timings and its bounded history stay in
 * `components/config/notifications.ts`. Nothing here owns state.
 */

export { default as NotificationCentre } from "./NotificationCentre.vue";
export { default as NoticeCentrePanel } from "./NoticeCentrePanel.vue";

export {
    NOTICE_LEVELS,
    countByLevel,
    filterNotices,
    formatNoticesAsMarkdown,
    noticeSampleText,
    noticeSearchText,
} from "./noticeCentre.js";
export type { NoticeFilter } from "./noticeCentre.js";
