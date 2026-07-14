import { supabaseAdmin } from './supabaseAdmin';
import { getInvoices, getInvoice } from './unleashed';
import { qboQuery, qboRequest } from './qbo';

const COMPANY_ID = 'default';

function pickInvoiceGuid(inv: any) { return inv.Guid || inv.InvoiceGuid || inv.GuidIdentifier || inv.guid; }
function pickInvoiceNumber(inv: any) { return inv.InvoiceNumber || inv.InvoiceNo || inv.OrderNumber || inv.Reference || pickInvoiceGuid(inv); }
function pickCustomerName(inv: any) { return inv.Customer?.CustomerName || inv.Customer?.Name || inv.CustomerName || 'Unknown Customer'; }
function pickLines(inv: any) { return inv.InvoiceLines || inv.Lines || inv.SalesInvoiceLines || []; }
function pickProductGroup(line: any) { return line.Product?.ProductGroup?.GroupName || line.Product?.ProductGroup?.Name || line.Product?.ProductGroup || line.ProductGroup || 'Unmapped'; }
function pickAmount(line: any) { return Number(line.LineTotal || line.Total || line.SubTotal || (Number(line.UnitPrice || 0) * Number(line.Quantity || 0))); }
function escapeSqlName(name: string) { return name.replace(/'/g, "\\'"); }

export async function runInvoiceSync() {
  const sb = supabaseAdmin();
  const { data: cfg, error } = await sb.from('app_config').select('*').eq('company_id', COMPANY_ID).single();
  if (error || !cfg) throw new Error('Missing app configuration');
  if (!cfg.unleashed_api_id || !cfg.unleashed_api_key) throw new Error('Missing Unleashed credentials');

  const unleashedConfig = { apiId: cfg.unleashed_api_id, apiKey: cfg.unleashed_api_key, clientType: cfg.unleashed_client_type || 'Nexvista/revenue-splitter' };
  const invoices = await getInvoices(unleashedConfig);
  let processed = 0, skipped = 0, failed = 0;

  for (const item of invoices) {
    const guid = pickInvoiceGuid(item);
    if (!guid) continue;
    const { data: existing } = await sb.from('sync_log').select('id,status').eq('unleashed_invoice_guid', guid).maybeSingle();
    if (existing?.status === 'success') { skipped++; continue; }

    try {
      const invoice = await getInvoice(unleashedConfig, guid);
      const result = await createQboInvoiceFromUnleashed(invoice);
      await sb.from('sync_log').upsert({ unleashed_invoice_guid: guid, unleashed_invoice_number: pickInvoiceNumber(invoice), qbo_invoice_id: result.qboInvoiceId, status: 'success', message: 'Created in QBO', updated_at: new Date().toISOString() }, { onConflict: 'unleashed_invoice_guid' });
      processed++;
    } catch (e: any) {
      await sb.from('sync_log').upsert({ unleashed_invoice_guid: guid, unleashed_invoice_number: pickInvoiceNumber(item), status: 'failed', message: e.message, updated_at: new Date().toISOString() }, { onConflict: 'unleashed_invoice_guid' });
      failed++;
    }
  }
  return { processed, skipped, failed };
}

async function getOrCreateCustomer(name: string) {
  const found = await qboQuery(COMPANY_ID, `select * from Customer where DisplayName = '${escapeSqlName(name)}'`);
  const existing = found?.QueryResponse?.Customer?.[0];
  if (existing) return { value: existing.Id, name: existing.DisplayName };
  const created = await qboRequest(COMPANY_ID, 'POST', 'customer', { DisplayName: name });
  return { value: created.Customer.Id, name: created.Customer.DisplayName };
}

async function getOrCreateItemForAccount(accountId: string, accountName: string) {
  const itemName = `Revenue Split - ${accountName}`.slice(0, 95);
  const found = await qboQuery(COMPANY_ID, `select * from Item where Name = '${escapeSqlName(itemName)}'`);
  const existing = found?.QueryResponse?.Item?.[0];
  if (existing) return existing.Id;
  const created = await qboRequest(COMPANY_ID, 'POST', 'item', {
    Name: itemName,
    Type: 'Service',
    IncomeAccountRef: { value: accountId, name: accountName }
  });
  return created.Item.Id;
}

async function createQboInvoiceFromUnleashed(invoice: any) {
  const sb = supabaseAdmin();
  const customerName = pickCustomerName(invoice);
  const customerRef = await getOrCreateCustomer(customerName);
  const lines = pickLines(invoice);

  const qboLines = [];
  for (const line of lines) {
    const groupName = pickProductGroup(line);
    const { data: map } = await sb.from('group_account_mappings').select('*').eq('unleashed_group_name', groupName).maybeSingle();
    if (!map?.qbo_account_id) throw new Error(`No QBO account mapping for product group: ${groupName}`);
    const itemId = await getOrCreateItemForAccount(map.qbo_account_id, map.qbo_account_name);
    qboLines.push({
      DetailType: 'SalesItemLineDetail',
      Amount: pickAmount(line),
      Description: line.Product?.ProductDescription || line.Product?.ProductCode || line.Description || groupName,
      SalesItemLineDetail: {
        ItemRef: { value: itemId },
        Qty: Number(line.Quantity || 1),
        UnitPrice: Number(line.UnitPrice || line.Price || pickAmount(line)),
        TaxCodeRef: map.qbo_tax_code_id ? { value: map.qbo_tax_code_id } : undefined
      }
    });
  }

  if (!qboLines.length) throw new Error('Invoice has no lines');
  const payload = {
    DocNumber: pickInvoiceNumber(invoice),
    CustomerRef: customerRef,
    TxnDate: invoice.InvoiceDate?.split('T')?.[0] || undefined,
    Line: qboLines,
    PrivateNote: `Created from Unleashed invoice ${pickInvoiceNumber(invoice)}`
  };
  const created = await qboRequest(COMPANY_ID, 'POST', 'invoice', payload);
  return { qboInvoiceId: created.Invoice.Id };
}
