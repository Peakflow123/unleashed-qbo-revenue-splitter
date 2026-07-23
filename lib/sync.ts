import { supabaseAdmin } from './supabaseAdmin';
import { getInvoices, getInvoice, unleashedGet } from './unleashed';
import { qboQuery, qboRequest } from './qbo';

const COMPANY_ID = 'default';

type UnleashedConfig = { apiId: string; apiKey: string; clientType: string };

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

function pickAmount(line: any) {
  return Number(
    line.LineTotal ||
      line.Total ||
      line.SubTotal ||
      line.TotalPrice ||
      Number(line.UnitPrice || line.Price || 0) * Number(line.Quantity || 0)
  );
}

function escapeSqlName(name: string) {
  return name.replace(/'/g, "\\'");
}

function getProductGuidFromLine(line: any) {
  return (
    line.Product?.Guid ||
    line.Product?.ProductGuid ||
    line.ProductGuid ||
    line.Product?.GuidIdentifier ||
    line.Product?.guid ||
    null
  );
}

function getProductCodeFromLine(line: any) {
  return (
    line.Product?.ProductCode ||
    line.Product?.Code ||
    line.ProductCode ||
    line.Product?.ProductId ||
    null
  );
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

async function getProductGroupForLine(config: UnleashedConfig, line: any, productCache: Map<string, string>) {
  const fromLine =
    getGroupNameFromObject(line) ||
    getGroupNameFromObject(line.Product) ||
    line.Product?.ProductGroup ||
    line.ProductGroup;

  if (typeof fromLine === 'string' && fromLine.trim()) {
    return fromLine.trim();
  }

  const productGuid = getProductGuidFromLine(line);
  if (productGuid) {
    if (productCache.has(productGuid)) return productCache.get(productGuid) || 'Unmapped';

    try {
      const product = await unleashedGet(config, `Products/${productGuid}`);
      const groupName = getGroupNameFromObject(product) || getGroupNameFromObject(product?.Product);
      if (groupName) {
        productCache.set(productGuid, String(groupName).trim());
        return String(groupName).trim();
      }
    } catch {
      // Continue to Product Code fallback.
    }
  }

  const productCode = getProductCodeFromLine(line);
  if (productCode) {
    return `Unmapped product ${productCode}`;
  }

  return 'Unmapped';
}

export async function runInvoiceSync() {
  const sb = supabaseAdmin();

  const { data: cfg, error } = await sb
    .from('app_config')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .single();

  if (error || !cfg) throw new Error('Missing app configuration');
  if (!cfg.unleashed_api_id || !cfg.unleashed_api_key) throw new Error('Missing Unleashed credentials');

  const unleashedConfig = {
    apiId: cfg.unleashed_api_id,
    apiKey: cfg.unleashed_api_key,
    clientType: cfg.unleashed_client_type || 'Nexvista/revenue-splitter'
  };

  const invoices = await getInvoices(unleashedConfig);
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of invoices) {
    const guid = pickInvoiceGuid(item);
    if (!guid) continue;

    const { data: existing } = await sb
      .from('sync_log')
      .select('id,status')
      .eq('unleashed_invoice_guid', guid)
      .maybeSingle();

    if (existing?.status === 'success') {
      skipped++;
      continue;
    }

    try {
      const invoice = await getInvoice(unleashedConfig, guid);
      const result = await createQboInvoiceFromUnleashed(unleashedConfig, invoice);

      await sb.from('sync_log').upsert(
        {
          unleashed_invoice_guid: guid,
          unleashed_invoice_number: pickInvoiceNumber(invoice),
          qbo_invoice_id: result.qboInvoiceId,
          status: 'success',
          message: 'Created in QBO',
          updated_at: new Date().toISOString()
        },
        { onConflict: 'unleashed_invoice_guid' }
      );

      processed++;
    } catch (e: any) {
      await sb.from('sync_log').upsert(
        {
          unleashed_invoice_guid: guid,
          unleashed_invoice_number: pickInvoiceNumber(item),
          status: 'failed',
          message: e.message,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'unleashed_invoice_guid' }
      );

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

async function createQboInvoiceFromUnleashed(config: UnleashedConfig, invoice: any) {
  const sb = supabaseAdmin();
  const productCache = new Map<string, string>();

  const customerName = pickCustomerName(invoice);
  const customerRef = await getOrCreateCustomer(customerName);
  const lines = pickLines(invoice);

  const qboLines = [];

  for (const line of lines) {
    const groupName = await getProductGroupForLine(config, line, productCache);

    const { data: map } = await sb
      .from('group_account_mappings')
      .select('*')
      .eq('unleashed_group_name', groupName)
      .maybeSingle();

    if (!map?.qbo_account_id) {
      throw new Error(
        `No QBO account mapping for product group: ${groupName}. Product: ${getProductCodeFromLine(line) || 'unknown'}`
      );
    }

    const itemId = await getOrCreateItemForAccount(map.qbo_account_id, map.qbo_account_name);
    const amount = pickAmount(line);

    qboLines.push({
      DetailType: 'SalesItemLineDetail',
      Amount: amount,
      Description:
        line.Product?.ProductDescription ||
        line.Product?.Description ||
        line.Product?.ProductCode ||
        line.Description ||
        groupName,
      SalesItemLineDetail: {
        ItemRef: { value: itemId },
        Qty: Number(line.Quantity || 1),
        UnitPrice: Number(line.UnitPrice || line.Price || amount),
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
