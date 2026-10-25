function requestHeaders(token, databricksHost, extra = {}) {
  const headers = { ...extra };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers['X-DB-PAT-Token'] = token;
  }
  if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
  return headers;
}

async function responseError(resp) {
  const errText = await resp.text().catch(() => '');
  let msg = errText || `${resp.status}`;
  let parsed = null;
  try {
    parsed = JSON.parse(errText);
    if (parsed && parsed.error) msg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
  } catch {
    parsed = null;
  }
  const err = new Error(`${resp.status}: ${msg}`);
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
