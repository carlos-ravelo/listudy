export function incrementAchievementCounter(key, { storage = localStorage, events = document } = {}) {
    const value = (Number(storage.getItem(key)) || 0) + 1;
    storage.setItem(key, value);
    events.dispatchEvent(new CustomEvent('achievement-counter-changed', { detail: { key, value } }));
    return value;
}
