/**
 * Short, subtle two-tone chime for in-app notifications.
 * Reuses one AudioContext; fails quietly if Web Audio is unavailable or blocked.
 */
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (sharedCtx) return sharedCtx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
        sharedCtx = new Ctor();
    } catch {
        return null;
    }
    return sharedCtx;
}

/** Call after a user gesture so the chime can play under browser autoplay policies. */
export function primeNotificationAudioContext(): void {
    void getAudioContext()?.resume();
}

const NOTIFICATION_TITLE_BY_TYPE: Record<string, string> = {
    WorkItemAssigned: "Work item assigned",
    WorkItemAssignedToSprint: "Work item assigned to sprint",
    WorkItemRemovedFromSprint: "Work item removed from sprint",
    WorkItemCommentAdded: "New comment on work item",
    WorkItemUpdated: "Work item updated",
    WorkItemArchived: "Work item archived",
    SprintManagerAssigned: "Sprint manager assigned",
    SprintCreatedForTeam: "New sprint for your team",
    SprintUpdated: "Sprint updated",
    SprintStarted: "Sprint started",
    SprintStopped: "Sprint stopped",
    SprintCompleted: "Sprint completed",
    SprintDeleted: "Sprint deleted",
    UserAccessUpdated: "Your access was updated",
    StatusChanged: "Work item status changed",
    WorkItemReordered: "Work item reordered",
};

function titleForNotificationType(rawType: string): string {
    const key = rawType.trim();
    if (!key) return "Notification";
    const mapped = NOTIFICATION_TITLE_BY_TYPE[key];
    if (mapped) return mapped;
    return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
}

export function playNotificationChime(): void {
    const ctx = getAudioContext();
    if (!ctx) return;

    const run = () => {
        const master = ctx.createGain();
        master.gain.value = 0.065;
        master.connect(ctx.destination);

        const tone = (freq: number, when: number, duration: number) => {
            const osc = ctx.createOscillator();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, when);
            osc.connect(master);
            osc.start(when);
            osc.stop(when + duration);
        };

        const t0 = ctx.currentTime;
        tone(880, t0, 0.1);
        tone(1174.66, t0 + 0.09, 0.14);
    };

    void ctx.resume().then(run).catch(() => {
        /* autoplay policy or other — ignore */
    });
}

/** Normalize SignalR NotificationBroadcastDto (camelCase or PascalCase JSON). */
export function parseNotificationBroadcast(dto: unknown): { title: string; message: string } {
    if (!dto || typeof dto !== "object") {
        return { title: "Notification", message: "You have a new notification." };
    }
    const o = dto as Record<string, unknown>;
    const message = o.message ?? o.Message;
    const notificationType = o.notificationType ?? o.NotificationType;
    const typeStr = typeof notificationType === "string" ? notificationType : "";
    return {
        title: typeStr.trim() ? titleForNotificationType(typeStr) : "Notification",
        message:
            typeof message === "string" && message.trim() ? message : "You have a new notification.",
    };
}
