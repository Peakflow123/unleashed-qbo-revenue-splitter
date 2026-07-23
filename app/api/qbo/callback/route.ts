import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function env(name: string) {
  return (process.env[name] || '').trim();
}

function mask(value: string) {
  if (!value) return 'MISSING';
  if (value.length <= 8) return 'TOO_SHORT';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export async function GET(req: Request) {
  const currentUrl = new URL(req.url);

  try {
    const code = currentUrl.searchParams.get('code');
    const realmId = currentUrl.searchParams.get('realmId');

    const clientId = env('QBO_CLIENT_ID');
    const clientSecret = env('QBO_CLIENT_SECRET');
    const appBaseUrl = env('APP_BASE_URL');
    const redirectUri = `${appBaseUrl}/api/qbo/callback`;

    if (!code || !realmId) {
      return NextResponse.json(
        {
          success: false,
          step: 'callback_validation',
          error: 'Missing QuickBooks code or realmId',
          codeExists: Boolean(code),
          realmIdExists: Boolean(realmId)
        },
        { status: 400 }
      );
    }

    if (!clientId || !clientSecret || !appBaseUrl) {
      return NextResponse.json(
        {
          success: false,
          step: 'environment_variables',
          error: 'Missing required environment variables',
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
          success: false,
          step: 'qbo_token_exchange',
          error: 'QuickBooks token exchange failed',
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

    const supabase = supabaseAdmin();

    const { error: dbError } = await supabase.from('app_config').upsert(
      {
        company_id: 'default',
        qbo_realm_id: realmId,
        qbo_access_token: tokenData.access_token,
        qbo_refresh_token: tokenData.refresh_token,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'company_id' }
    );

    if (dbError) {
      return NextResponse.json(
        {
          success: false,
          step: 'supabase_save',
          error: 'QuickBooks connected, but Supabase save failed',
          supabaseError: dbError.message,
          realmId
        },
        { status: 500 }
      );
    }

    return NextResponse.redirect(`${appBaseUrl}/settings?connected=1`);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        step: 'unexpected_crash',
        error: error?.message || 'Unknown callback error',
        callbackUrl: currentUrl.toString()
      },
      { status: 500 }
    );
  }
}
