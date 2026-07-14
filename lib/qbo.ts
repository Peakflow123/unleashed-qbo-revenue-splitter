import { supabaseAdmin } from './supabaseAdmin';

export function qboBaseUrl() {
  return process.env.QBO_ENVIRONMENT === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

export function qboAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID || '',
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: `${process.env.APP_BASE_URL}/api/qbo/callback`,
    state
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  const auth = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${process.env.APP_BASE_URL}/api/qbo/callback` });
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`QBO token exchange failed: ${JSON.stringify(data)}`);
  return data;
}

export async function refreshQboToken(companyId = 'default') {
  const sb = supabaseAdmin();
  const { data: cfg } = await sb.from('app_config').select('*').eq('company_id', companyId).single();
  if (!cfg?.qbo_refresh_token) throw new Error('QuickBooks is not connected');
  const auth = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.qbo_refresh_token });
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`QBO refresh failed: ${JSON.stringify(data)}`);
  await sb.from('app_config').update({ qbo_access_token: data.access_token, qbo_refresh_token: data.refresh_token, updated_at: new Date().toISOString() }).eq('company_id', companyId);
  return data.access_token as string;
}

export async function qboRequest(companyId: string, method: string, path: string, body?: any) {
  const sb = supabaseAdmin();
  const { data: cfg } = await sb.from('app_config').select('*').eq('company_id', companyId).single();
  if (!cfg?.qbo_realm_id) throw new Error('Missing QBO realm ID');
  let token = await refreshQboToken(companyId);
  const url = `${qboBaseUrl()}/v3/company/${cfg.qbo_realm_id}/${path}${path.includes('?') ? '&' : '?'}minorversion=75`;
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`QBO API error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function qboQuery(companyId: string, query: string) {
  return qboRequest(companyId, 'GET', `query?query=${encodeURIComponent(query)}`);
}
