import { supabaseAdmin } from './supabaseAdmin';

function env(name: string) {
  return (process.env[name] || '').trim();
}

export function qboBaseUrl() {
  return env('QBO_ENVIRONMENT') === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

export function qboAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: env('QBO_CLIENT_ID'),
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: `${env('APP_BASE_URL')}/api/qbo/callback`,
    state
  });

  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  const clientId = env('QBO_CLIENT_ID');
  const clientSecret = env('QBO_CLIENT_SECRET');
  const redirectUri = `${env('APP_BASE_URL')}/api/qbo/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('Missing QBO_CLIENT_ID or QBO_CLIENT_SECRET');
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `QBO token exchange failed. Status: ${res.status}. Redirect URI: ${redirectUri}. Error: ${JSON.stringify(data)}`
    );
  }

  return data;
}

export async function refreshQboToken(companyId = 'default') {
  const sb = supabaseAdmin();

  const { data: cfg } = await sb
    .from('app_config')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (!cfg?.qbo_refresh_token) {
    throw new Error('QuickBooks is not connected');
  }

  const clientId = env('QBO_CLIENT_ID');
  const clientSecret = env('QBO_CLIENT_SECRET');

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: cfg.qbo_refresh_token
  });

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`QBO refresh failed: ${JSON.stringify(data)}`);
  }

  await sb
    .from('app_config')
    .update({
      qbo_access_token: data.access_token,
      qbo_refresh_token: data.refresh_token,
      updated_at: new Date().toISOString()
    })
    .eq('company_id', companyId);

  return data.access_token as string;
}

export async function qboRequest(companyId: string, method: string, path: string, body?: any) {
  const sb = supabaseAdmin();

  const { data: cfg } = await sb
    .from('app_config')
    .select('*')
    .eq('company_id', companyId)
    .single();

  if (!cfg?.qbo_realm_id) {
    throw new Error('Missing QBO realm ID');
  }

  const token = await refreshQboToken(companyId);

  const url = `${qboBaseUrl()}/v3/company/${cfg.qbo_realm_id}/${path}${
    path.includes('?') ? '&' : '?'
  }minorversion=75`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`QBO API error ${res.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

export async function qboQuery(companyId: string, query: string) {
  return qboRequest(companyId, 'GET', `query?query=${encodeURIComponent(query)}`);
}