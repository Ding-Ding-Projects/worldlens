import type { Camera, Scene, WebGLRenderer } from "three";
import { Marker } from "./Marker";
import type { MarkerData } from "./Marker";
import { CSS2DObject } from "../util/CSS2DRenderer";
import { animate, EasingFunctions, htmlToElement } from "../util/Utils";
import { sanitizeHtml } from "../util/sanitize";

export interface PlayerMarkerData extends MarkerData {
    playerUuid: string;
    name: string;
    playerHead: string;
    rotation: { pitch: number; yaw: number };
    foreign: boolean | undefined;
    source?: string | undefined;
    dimension?: string | undefined;
    observedAt?: number | string | undefined;
    freshness?: string | undefined;
    stale?: boolean;
}

export interface PlayerLike {
    uuid: string;
    name?: string;
    foreign?: boolean;
    position?: { x?: number; y?: number; z?: number };
    rotation?: { yaw?: number; pitch?: number; roll?: number };
    source?: string;
    dimension?: string;
    observedAt?: number | string;
    freshness?: string;
    stale?: boolean;
}

export class PlayerMarker extends Marker {
    declare readonly isPlayerMarker: boolean;
    declare data: PlayerMarkerData;

    elementObject: CSS2DObject;
    playerHeadElement: HTMLImageElement;
    playerNameElement: HTMLDivElement;

    constructor(markerId: string, playerUuid: string, playerHead: string = "assets/steve.png") {
        super(markerId);
        Object.defineProperty(this, "isPlayerMarker", { value: true });
        this.data.type = "player";

        this.data.playerUuid = playerUuid;
        this.data.name = playerUuid;
        this.data.playerHead = playerHead;
        this.data.rotation = {
            pitch: 0,
            yaw: 0,
        };

        // The head is decorative: the name sits beside it as real text, so an alt of
        // "playerhead" only makes a screen reader announce the word twice per player.
        this.elementObject = new CSS2DObject(
            htmlToElement(`
<div id="bm-marker-${this.data.id}" class="bm-marker-${this.data.type}" role="button" tabindex="0" aria-label="Player">
    <img src="${this.data.playerHead}" alt="" draggable="false">
    <div class="bm-player-name"></div>
</div>
        `),
        );
        this.elementObject.onBeforeRender = (renderer, scene, camera) =>
            this.onBeforeRender(renderer, scene, camera);

        this.playerHeadElement = this.element.getElementsByTagName("img")[0]!;
        this.playerNameElement = this.element.getElementsByTagName("div")[0]!;

        this.addEventListener("removed", () => {
            if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
        });

        this.playerHeadElement.addEventListener(
            "error",
            () => {
                this.playerHeadElement.src = "assets/steve.png";
            },
            { once: true },
        );

        this.element.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            this.element.click();
        });

        this.add(this.elementObject);
    }

    get element(): HTMLDivElement {
        return this.elementObject.element.getElementsByTagName("div")[0]!;
    }

    override onBeforeRender = (renderer: WebGLRenderer, scene: Scene, camera: Camera): void => {
        const distance = Marker.calculateDistanceToCameraPlane(this.position, camera);

        let value = "near";
        if (distance > 1000) {
            value = "med";
        }
        if (distance > 5000) {
            value = "far";
        }

        this.element.setAttribute("distance-data", value);
    };

    override updateFromData(markerData: PlayerLike): void {
        // animate position update
        const pos = markerData.position || {};
        const rot = markerData.rotation || {};
        if (!this.position.x && !this.position.y && !this.position.z) {
            this.position.set(pos.x || 0, (pos.y || 0) + 1.8, pos.z || 0);
            this.data.rotation.pitch = rot.pitch || 0;
            this.data.rotation.yaw = rot.yaw || 0;
        } else {
            const startPos = {
                x: this.position.x,
                y: this.position.y,
                z: this.position.z,
                pitch: this.data.rotation.pitch,
                yaw: this.data.rotation.yaw,
            };
            const deltaPos = {
                x: (pos.x || 0) - startPos.x,
                y: (pos.y || 0) + 1.8 - startPos.y,
                z: (pos.z || 0) - startPos.z,
                pitch: (rot.pitch || 0) - startPos.pitch,
                yaw: (rot.yaw || 0) - startPos.yaw,
            };
            while (deltaPos.yaw > 180) deltaPos.yaw -= 360;
            while (deltaPos.yaw < -180) deltaPos.yaw += 360;

            if (deltaPos.x || deltaPos.y || deltaPos.z || deltaPos.pitch || deltaPos.yaw) {
                animate((progress) => {
                    const ease = EasingFunctions.easeInOutCubic!(progress);
                    this.position.set(
                        startPos.x + deltaPos.x * ease || 0,
                        startPos.y + deltaPos.y * ease || 0,
                        startPos.z + deltaPos.z * ease || 0,
                    );
                    this.data.rotation.pitch = startPos.pitch + deltaPos.pitch * ease || 0;
                    this.data.rotation.yaw = startPos.yaw + deltaPos.yaw * ease || 0;
                }, 1000);
            }
        }

        // update name
        const name = markerData.name || this.data.playerUuid;
        this.data.name = name;
        if (this.playerNameElement.innerHTML !== name)
            this.playerNameElement.innerHTML = sanitizeHtml(name);

        // update world
        this.data.foreign = markerData.foreign;
        this.data.source = markerData.source;
        this.data.dimension = markerData.dimension;
        this.data.observedAt = markerData.observedAt;
        this.data.freshness = markerData.freshness;
        const observed = typeof markerData.observedAt === "number"
            ? markerData.observedAt
            : typeof markerData.observedAt === "string" ? Date.parse(markerData.observedAt) : NaN;
        const stale = markerData.stale === true || markerData.freshness === "stale" || (Number.isFinite(observed) && Date.now() - observed > 15_000);
        this.data.stale = stale;
        const state = stale ? "stale" : markerData.freshness ?? "fresh";
        const dimension = markerData.dimension ? `, ${markerData.dimension}` : "";
        const source = markerData.source ? `, source ${markerData.source}` : "";
        this.element.setAttribute("aria-label", `${name}${dimension} (${state}${source})`);
        this.element.dataset.source = markerData.source ?? "unknown";
        this.element.dataset.dimension = markerData.dimension ?? "unknown";
        this.element.dataset.freshness = state;
    }

    override dispose(): void {
        super.dispose();

        const element = this.elementObject.element;
        if (element.parentNode) element.parentNode.removeChild(element);
    }
}
