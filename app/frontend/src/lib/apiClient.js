import { apiErrorDetail, parseApiErrorMessage } from './ucPermissionErrors.js';

function requestHeaders(token, databricksHost, extra = {}) {
  const headers = { ...extra };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-DB-PAT-Token'] = token;
  }
  if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
  return headers;
}

export async function responseError(resp) {
  const errText = await resp.text().catch(() => '');
  let parsed;
  try {
    parsed = JSON.parse(errText);
  } catch {
    parsed = undefined;
  }
  const message = parsed === undefined || typeof parsed === 'string' ? parseApiErrorMessage(errText) : apiErrorDetail(parsed);
  const err = new Error(message || `The request failed (HTTP ${resp.status})`);
  err.status = resp.status;
  err.body = parsed && typeof parsed === 'object' ? parsed : null;
  return err;
}

export function makeApiFetch({ token, databricksHost } = {}) {
  return async (url) => {
    const resp = await fetch(url, { headers: requestHeaders(token, databricksHost) });
    if (!resp.ok) throw await responseError(resp);
    return resp.json();
  };
}

export function makeApiPostJson({ token, databricksHost } = {}) {
  return async (url, body) => {
    const resp = await fetch(url, {
      method: 'POST',
      headers: requestHeaders(token, databricksHost, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw await responseError(resp);
    return resp.json();
  };
}
