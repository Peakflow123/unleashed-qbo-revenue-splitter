create table if not exists app_config (
  company_id text primary key default 'default',
  unleashed_api_id text,
  unleashed_api_key text,
  unleashed_client_type text,
  qbo_realm_id text,
  qbo_access_token text,
  qbo_refresh_token text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists unleashed_product_groups (
  guid text primary key,
  name text not null,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists qbo_accounts (
  qbo_id text primary key,
  name text not null,
  account_type text,
  active boolean,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists group_account_mappings (
  unleashed_group_guid text primary key,
  unleashed_group_name text not null,
  qbo_account_id text,
  qbo_account_name text,
  qbo_tax_code_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists sync_log (
  id uuid primary key default gen_random_uuid(),
  unleashed_invoice_guid text unique not null,
  unleashed_invoice_number text,
  qbo_invoice_id text,
  status text not null,
  message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into app_config (company_id) values ('default') on conflict (company_id) do nothing;
