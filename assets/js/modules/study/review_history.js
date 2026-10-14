function reviewHistory(previous, now, rating) {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID() : `${now.getTime()}-${Math.random().toString(36).slice(2)}`;
    return [...(previous?.history || []), { id, at: now.toISOString(), rating }].slice(-128);
}
export { reviewHistory };
