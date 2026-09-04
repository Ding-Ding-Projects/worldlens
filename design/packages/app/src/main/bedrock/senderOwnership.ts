/** Runtime ownership uses the WebContents object itself, never a caller-supplied id. */
export interface OperationSender {
    isDestroyed(): boolean;
    once(event: "destroyed", listener: () => void): unknown;
    removeListener?(event: "destroyed", listener: () => void): unknown;
}
export class SenderOwnership {
    private readonly owners = new Map<string, OperationSender>();
    private readonly watched = new Set<OperationSender>();
    constructor(private readonly onDestroyed: (id: string) => void) {}
    claim(id: string, sender: OperationSender): void {
        if (sender.isDestroyed()) throw new Error("The originating window is no longer available.");
        if (this.owners.has(id) && this.owners.get(id) !== sender) throw new Error("This operation belongs to another window.");
        this.owners.set(id, sender);
        if (!this.watched.has(sender)) {
            this.watched.add(sender);
            sender.once("destroyed", () => {
                for (const [operation, owner] of this.owners) if (owner === sender) this.onDestroyed(operation);
                // Retain the tombstone until restart. Another live window cannot adopt it.
            });
        }
    }
    owns(id: string, sender: OperationSender): boolean {
        return !sender.isDestroyed() && this.owners.get(id) === sender;
    }
    require(id: unknown, sender: OperationSender): string {
        if (typeof id !== "string" || !this.owns(id, sender)) throw new Error("This operation is not owned by this window. Use explicit saved-operation recovery after restart.");
        return id;
    }
}
