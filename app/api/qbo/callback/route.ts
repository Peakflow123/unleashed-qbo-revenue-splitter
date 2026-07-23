import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readEnv(name: string) {
  return (process.env[name] || '').trim();
}

function mask(value: string) {
  if (!value) return 'MISSING';
  if (value.length <= 8) return 'TOO_SHORT';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function saveToSupabase(realmId: string, tokenData: any) {
  const { supabaseAdmin } = await import('@/lib/supabaseAdmin');
  const supabase = supabaseAdmin();

  const { error } = await supabase.from('app_config').upsert(
    {
      company_id: 'default',
      qbo_realm_id: realmId,
      qbo_access_token: tokenData.access_token,
      qbo_refresh_token: tokenData.refresh_token,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'company_id' }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function GET(req: Request) {
  const currentUrl = new URL(req.url);

  const code = currentUrl.searchParams.get('code');
  const realmId = currentUrl.searchParams.get('realmId');

  const clientId = readEnv('QBO_CLIENT_ID');
  const clientSecret = readEnv('QBO_CLIENT_SECRET');
  const appBaseUrl = readEnv('APP_BASE_URL');
  const redirectUri = `${appBaseUrl}/api/qbo/callback`;

  try {
    if (!code || !realmId) {
      return NextResponse.json(
        {
          ok: false,
          version: 'qbo-debug-pack-v2',
          step: 'missing_callback_params',
          codeExists: Boolean(code),
          realmIdExists: Boolean(realmId)
        },
        { status: 400 }
      );
    }

    if (!clientId || !clientSecret || !appBaseUrl) {
      return NextResponse.json(
        {
          ok: false,
          version: 'qbo-debug-pack-v2',
          step: 'missing_environment_variables',
          QBO_CLIENT_ID: mask(clientId),
          QBO_CLIENT_SECRET: mask(clientSecret),
          APP_BASE_URL: appBaseUrl || 'MISSING',
          redirectUri
        },
        { status: 500 }
      );
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    });

    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    const tokenText = await tokenResponse.text();

    let tokenData: any;
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      tokenData = { raw: tokenText };
    }

    if (!tokenResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          version: 'qbo-debug-pack-v2',
          step: 'qbo_token_exchange_failed',
          qboStatus: tokenResponse.status,
          qboResponse: tokenData,
          debug: {
            QBO_CLIENT_ID: mask(clientId),
            QBO_CLIENT_SECRET: mask(clientSecret),
            APP_BASE_URL: appBaseUrl,
            redirectUri,
            realmId
          }
        },
        { status: 500 }
      );
    }

    try {
      await saveToSupabase(realmId, tokenData);
    } catch (dbError: any) {
      return NextResponse.json(
        {
          ok: false,
          version: 'qbo-debug-pack-v2',
          step: 'supabase_save_failed',
          error: dbError?.message || 'Unknown Supabase error',
          realmId
        },
        { status: 500 }
      );
    }

    return NextResponse.redirect(`${appBaseUrl}/settings?connected=1`);
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        version: 'qbo-debug-pack-v2',
        step: 'unexpected_crash_inside_callback',
        error: error?.message || 'Unknown error',
        callbackUrl: currentUrl.toString(),
        debug: {
          QBO_CLIENT_ID: mask(clientId),
          QBO_CLIENT_SECRET: mask(clientSecret),
          APP_BASE_URL: appBaseUrl || 'MISSING',
          redirectUri
        }
      },
      { status: 500 }
    );
  }
}
