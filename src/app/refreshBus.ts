const listeners = new Map<string, Set<() => void>>();
export function notifyProfileChanged(profileId: string): void {
    for (const callback of [...(listeners.get(profileId) ?? [])])
        callback();
}
export function subscribeProfileChanges(profileId: string, callback: () => void): () => void {
    let callbacks = listeners.get(profileId);
    if (!callbacks) {
        callbacks = new Set();
        listeners.set(profileId, callbacks);
    }
    callbacks.add(callback);
    return () => { callbacks.delete(callback); if (!callbacks.size)
        listeners.delete(profileId); };
}
