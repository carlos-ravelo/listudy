export class JsonRequestError extends Error {
    constructor(message, status, data = null) {
        super(message);
        this.name = 'JsonRequestError';
        this.status = status;
        this.data = data;
    }
}

export async function requestJson(url, { method = 'GET', body, signal,
    errorMessage = 'The request could not be completed.' } = {}) {
    method = method.toUpperCase();
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const token = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
            document.querySelector('input[name="_csrf_token"]')?.value;
        if (!token) throw new Error(errorMessage);
        headers['x-csrf-token'] = token;
    }
    const response = await fetch(url, {
        method, credentials: 'same-origin', headers, signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let data;
    try {
        data = await response.json();
    } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new JsonRequestError(errorMessage, response.status);
    }
    if (!response.ok) {
        throw new JsonRequestError(typeof data?.error === 'string' && data.error || errorMessage,
            response.status, data);
    }
    return data;
}
