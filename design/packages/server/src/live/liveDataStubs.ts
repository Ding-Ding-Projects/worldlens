/**
 * Honest "nothing live yet" suppliers — upstream's own JSON shape for zero online players
 * and zero configured marker sets, never invented data.
 *
 * These are the safe defaults when no live provider has been configured. The local provider
 * in `localLiveProvider.ts` supplies real player samples when a world or explicitly configured
 * RCON endpoint is available; a mounted map still answers the endpoint honestly when neither
 * source is present, rather than 404ing an endpoint the viewer expects to always be able to poll.
 *
 * upstream: `common/.../live/LivePlayersDataSupplier.java` writes
 * `{"players":[<one object per online player>]}`; for zero players that is exactly
 * `{"players":[]}`.
 *
 * upstream: `common/.../live/LiveMarkersDataSupplier.java` writes
 * `MarkerGson.toJson(markerSets)` for a `Map<String, MarkerSet>`; for an empty map that is
 * `{}` — also the only document `BmMap#markerSets` can produce today, per
 * `docs/deviations.md`'s note on it (the markers API has not landed yet).
 */

export function noLivePlayers(): string {
    return JSON.stringify({ players: [] });
}

export function noLiveMarkers(): string {
    return "{}";
}
