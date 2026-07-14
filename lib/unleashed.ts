import crypto from 'crypto';

type UnleashedConfig = { apiId: string; apiKey: string; clientType: string };

function signature(apiKey: string, queryString: string) {
  return crypto.createHmac('sha256', apiKey).update(queryString || '').digest('base64');
}

export async function unleashedGet(config: UnleashedConfig, endpoint: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.unleashedsoftware.com/${endpoint}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-auth-id': config.apiId,
      'api-auth-signature': signature(config.apiKey, qs),
      'client-type': config.clientType || 'Nexvista/revenue-splitter'
    },
    cache: 'no-store'
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Unleashed API error ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export async function getProductGroups(config: UnleashedConfig) {
  const data = await unleashedGet(config, 'ProductGroups');
  return data?.Items || data?.ProductGroups || data || [];
}

export async function getInvoices(config: UnleashedConfig, startDate?: string, endDate?: string) {
  const params: Record<string,string> = { pageSize: '200' };
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  const data = await unleashedGet(config, 'Invoices', params);
  return data?.Items || data?.Invoices || data || [];
}

export async function getInvoice(config: UnleashedConfig, guid: string) {
  return unleashedGet(config, `Invoices/${guid}`);
}
