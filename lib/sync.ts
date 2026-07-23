import { supabaseAdmin } from './supabaseAdmin';
import { getInvoices, getInvoice, unleashedGet } from './unleashed';
import { qboQuery, qboRequest } from './qbo';

const COMPANY_ID = 'default';

type UnleashedConfig = { apiId: string; apiKey: string; clientType: string };
type SyncOptions = { maxInvoices?: number; sinceDays?: number; forceUpdate?: boolean };
type Mapping = { unleashed_group_name: string; qbo_account_id: string; qbo_account_name: string; qbo_tax_code_id?: string | null };

type SyncContext = {
  config: UnleashedConfig;
  mappings: Mapping[];
  productGroupCache: Map<string, string>;
  qboItemCache: Map<string, string>;
  qboCustomerCache: Map<string, { value: string; name: string }>;
};

function pickInvoiceGuid(inv: any) {
  return inv.Guid || inv.InvoiceGuid || inv.GuidIdentifier || inv.guid;
}

function pickInvoiceNumber(inv: any) {
  return inv.InvoiceNumber || inv.InvoiceNo || inv.OrderNumber || inv.Reference || pickInvoiceGuid(inv);
}

function pickCustomerName(inv: any) {
  return inv.Customer?.CustomerName || inv.Customer?.Name || inv.CustomerName || 'Unknown Customer';
}

function pickLines(inv: any) {
  return inv.InvoiceLines || inv.Lines || inv.SalesInvoiceLines || inv.SalesInvoiceLine || [];
}

function toNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value: number, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function escapeSqlName(name: string) {
  return String(name || '').replace(/'/g, "\\'");
}

function dateDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function getProductGuidFromLine(line: any) {
  return line.Product?.Guid || line.Product?.ProductGuid || line.ProductGuid || line.Product?.GuidIdentifier || line.Product?.guid || null;
}

function getProductCodeFromLine(line: any) {
  return line.Product?.ProductCode || line.Product?.Code || line.ProductCode || line.Product?.ProductId || null;
}

function getGroupNameFromObject(obj: any) {
  return (
    obj?.ProductGroup?.GroupName ||
    obj?.ProductGroup?.Name ||
    obj?.ProductGroup?.ProductGroupName ||
    obj?.ProductGroupName ||
    obj?.GroupName ||
    obj?.Group?.GroupName ||
    obj?.Group?.Name ||
    null
  );
}

function getLineAmount(line: any) {
  return toNumber(
    line.LineTotal ?? line.Total ?? line.SubTotal ?? line.TotalPrice ?? line.LineAmount ?? line.Amount,
    toNumber(line.UnitPrice ?? line.Price, 0) * toNumber(line.Quantity, 1)
  );
}

function getQboLineValues(line: any) {
  const qty = toNumber(line.Quantity, 1) || 1;
  const sourceAmount = getLineAmount(line);

  // QuickBooks requires Amount to exactly equal UnitPrice * Qty.
  // So use the Unleashed line total as the source, then derive UnitPrice from that amount.
  const amount = round(sourceAmount, 2);
  const unitPrice = round(amount / qty, 6);
  const qboAmount = round(unitPrice * qty, 2);

  return { qty, unitPrice, amount: qboAmount };
}

async function getProductGroupForLine(ctx: SyncContext, line: any) {
  const fromLine = getGroupNameFromObject(line) || getGroupNameFromObject(line.Product) || line.Product?.ProductGroup || line.ProductGroup;
  if (typeof fromLine === 'string' && fromLine.trim()) return fromLine.trim();

  const productGuid = getProductGuidFromLine(line);
  if (productGuid) {
    if (ctx.productGroupCache.has(productGuid)) return ctx.productGroupCache.get(productGuid) || 'Unmapped';

    try {
      const product = await unleashedGet(ctx.config, `Products/${productGuid}`);
      const groupName = getGroupNameFromObject(product) || getGroupNameFromObject(product?.Product);
      if (groupName) {
        ctx.productGroupCache.set(productGuid, String(groupName).trim());
        return String(groupName).trim();
      }
    } catch {
      // Continue to product code fallback.
    }
  }

  const productCode = getProductCodeFromLine(line);
  if (productCode) return `Unmapped product ${productCode}`;
  return 'Unmapped';
}

function findMapping(ctx: SyncContext, groupName: string) {
  const normalized = groupName.trim().toLowerCase();
  const exact = ctx.mappings.find((m) => String(m.unleashed_group_name || '').trim().toLowerCase() === normalized);
  if (exact?.qbo_account_id) return exact;

  // Optional fallback: if user creates a mapping with group name "Unmapped", use it for all unmapped products.
  if (normalized.startsWith('unmapped')) {
    const fallback = ctx.mappings.find((m) => String(m.unleashed_group_name || '').trim().toLowerCase() === 'unmapped');
    if (fallback?.qbo_account_id) return fallback;
  }

  return null;
}

async function findExistingQboInvoiceByDocNumber(docNumber: string) {
  const found = await qboQuery(COMPANY_ID, `select * from Invoice where DocNumber = '${escapeSqlName(docNumber)}'`);
  return found?.QueryResponse?.Invoice?.[0] || null;
}

export async function runInvoiceSync(options: SyncOptions = {}) {
  const sb = supabaseAdmin();
  const maxInvoices = Math.min(Math.max(Number(options.maxInvoices || 5), 1), 25);
  const sinceDays = Math.min(Math.max(Number(options.sinceDays || 14), 1), 365);
  const forceUpdate = Boolean(options.forceUpdate);

  const { data: cfg, error } = await sb.from('app_config').select('*').eq('company_id', COMPANY_ID).single();
  if (error || !cfg) throw new Error('Missing app configuration');
  if (!cfg.unleashed_api_id || !cfg.unleashed_api_key) throw new Error('Missing Unleashed credentials');

  const { data: mappingRows } = await sb.from('group_account_mappings').select('*');
  const mappings = (mappingRows || []).filter((m: any) => m.qbo_account_id) as Mapping[];

  const ctx: SyncContext = {
    config: {
      apiId: cfg.unleashed_api_id,
      apiKey: cfg.unleashed_api_key,
      clientType: cfg.unleashed_client_type || 'Nexvista/revenue-splitter'
    },
    mappings,
    productGroupCache: new Map<string, string>(),
    qboItemCache: new Map<string, string>(),
    qboCustomerCache: new Map<string, { value: string; name: string }>()
  };

  const invoices = await getInvoices(ctx.config, dateDaysAgo(sinceDays));
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let checked = 0;
  const details: string[] = [];

  for (const item of invoices) {
    if (checked >= maxInvoices) break;
    checked++;

    const guid = pickInvoiceGuid(item);
    const invoiceNumber = pickInvoiceNumber(item);
    if (!guid) continue;

    const { data: existingLog } = await sb
      .from('sync_log')
      .select('id,status,qbo_invoice_id')
      .eq('unleashed_invoice_guid', guid)
      .maybeSingle();

    if (existingLog?.status === 'success' && existingLog.qbo_invoice_id && !forceUpdate) {
      skipped++;
      details.push(`${invoiceNumber}: skipped, already synced`);
      continue;
    }

    try {
      const invoice = await getInvoice(ctx.config, guid);
      const docNumber = pickInvoiceNumber(invoice);
      const existingQbo = await findExistingQboInvoiceByDocNumber(docNumber);

      if (existingQbo && !forceUpdate) {
        await sb.from('sync_log').upsert(
          {
            unleashed_invoice_guid: guid,
            unleashed_invoice_number: docNumber,
            qbo_invoice_id: existingQbo.Id,
            status: 'success',
            message: 'Already exists in QBO, skipped to avoid duplicate',
            updated_at: new Date().toISOString()
          },
          { onConflict: 'unleashed_invoice_guid' }
        );
        skipped++;
        details.push(`${docNumber}: skipped, already exists in QBO`);
        continue;
      }

      const result = await createQboInvoiceFromUnleashed(ctx, invoice, existingQbo && forceUpdate ? existingQbo : null);

      await sb.from('sync_log').upsert(
        {
          unleashed_invoice_guid: guid,
          unleashed_invoice_number: docNumber,
          qbo_invoice_id: result.qboInvoiceId,
          status: 'success',
          message: result.action === 'updated' ? 'Updated existing QBO invoice' : 'Created in QBO',
          updated_at: new Date().toISOString()
        },
        { onConflict: 'unleashed_invoice_guid' }
      );

      processed++;
      details.push(`${docNumber}: ${result.action}`);
    } catch (e: any) {
      await sb.from('sync_log').upsert(
        {
          unleashed_invoice_guid: guid,
          unleashed_invoice_number: invoiceNumber,
          status: 'failed',
          message: e.message,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'unleashed_invoice_guid' }
      );
      failed++;
      details.push(`${invoiceNumber}: failed - ${e.message}`);
    }
  }

  return { checked, processed, skipped, failed, maxInvoices, sinceDays, forceUpdate, details };
}

async function getOrCreateCustomer(ctx: SyncContext, name: string) {
  if (ctx.qboCustomerCache.has(name)) return ctx.qboCustomerCache.get(name)!;

  const found = await qboQuery(COMPANY_ID, `select * from Customer where DisplayName = '${escapeSqlName(name)}'`);
  const existing = found?.QueryResponse?.Customer?.[0];
  if (existing) {
    const ref = { value: existing.Id, name: existing.DisplayName };
    ctx.qboCustomerCache.set(name, ref);
    return ref;
  }

  const created = await qboRequest(COMPANY_ID, 'POST', 'customer', { DisplayName: name });
  const ref = { value: created.Customer.Id, name: created.Customer.DisplayName };
  ctx.qboCustomerCache.set(name, ref);
  return ref;
}

async function getOrCreateItemForAccount(ctx: SyncContext, accountId: string, accountName: string) {
  if (ctx.qboItemCache.has(accountId)) return ctx.qboItemCache.get(accountId)!;

  const itemName = `Revenue Split - ${accountName}`.slice(0, 95);
  const found = await qboQuery(COMPANY_ID, `select * from Item where Name = '${escapeSqlName(itemName)}'`);
  const existing = found?.QueryResponse?.Item?.[0];
  if (existing) {
    ctx.qboItemCache.set(accountId, existing.Id);
    return existing.Id;
  }

  const created = await qboRequest(COMPANY_ID, 'POST', 'item', {
    Name: itemName,
    Type: 'Service',
    IncomeAccountRef: { value: accountId, name: accountName }
  });

  ctx.qboItemCache.set(accountId, created.Item.Id);
  return created.Item.Id;
}

async function createQboInvoiceFromUnleashed(ctx: SyncContext, invoice: any, existingQboInvoice: any = null) {
  const customerName = pickCustomerName(invoice);
  const customerRef = await getOrCreateCustomer(ctx, customerName);
  const lines = pickLines(invoice);
  const qboLines = [];

  for (const line of lines) {
    const groupName = await getProductGroupForLine(ctx, line);
    const map = findMapping(ctx, groupName);

    if (!map?.qbo_account_id) {
      throw new Error(`No QBO account mapping for product group: ${groupName}. Product: ${getProductCodeFromLine(line) || 'unknown'}`);
    }

    const itemId = await getOrCreateItemForAccount(ctx, map.qbo_account_id, map.qbo_account_name);
    const values = getQboLineValues(line);

    qboLines.push({
      DetailType: 'SalesItemLineDetail',
      Amount: values.amount,
      Description: line.Product?.ProductDescription || line.Product?.Description || line.Product?.ProductCode || line.Description || groupName,
      SalesItemLineDetail: {
        ItemRef: { value: itemId },
        Qty: values.qty,
        UnitPrice: values.unitPrice,
        ...(map.qbo_tax_code_id ? { TaxCodeRef: { value: map.qbo_tax_code_id } } : {})
      }
    });
  }

  if (!qboLines.length) throw new Error('Invoice has no lines');

  const basePayload: any = {
    DocNumber: pickInvoiceNumber(invoice),
    CustomerRef: customerRef,
    TxnDate: invoice.InvoiceDate?.split('T')?.[0] || undefined,
    Line: qboLines,
    PrivateNote: `Created from Unleashed invoice ${pickInvoiceNumber(invoice)}`
  };

  if (existingQboInvoice) {
    const updated = await qboRequest(COMPANY_ID, 'POST', 'invoice', { ...basePayload, Id: existingQboInvoice.Id, SyncToken: existingQboInvoice.SyncToken });
    return { qboInvoiceId: updated.Invoice.Id, action: 'updated' };
  }

  const created = await qboRequest(COMPANY_ID, 'POST', 'invoice', basePayload);
  return { qboInvoiceId: created.Invoice.Id, action: 'created' };
}
