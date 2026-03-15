import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? '';
const MATVERSE_REDIRECT_URI =
  process.env.MATVERSE_REDIRECT_URI ?? 'http://localhost:3000/api/oauth/callback';

const pendingStates = new Map<string, { repo: string; timestamp: number }>();

function cleanupPendingStates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of pendingStates.entries()) {
    if (value.timestamp < cutoff) {
      pendingStates.delete(key);
    }
  }
}

export async function GETAuthorize(request: NextRequest) {
  if (!GITHUB_CLIENT_ID) {
    return NextResponse.json({ error: 'missing_client_id' }, { status: 500 });
  }

  const repo = request.nextUrl.searchParams.get('repo') ?? '';
  const state = crypto.randomBytes(32).toString('hex');

  pendingStates.set(state, { repo, timestamp: Date.now() });
  cleanupPendingStates();

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', MATVERSE_REDIRECT_URI);
  authorizeUrl.searchParams.set('scope', ['repo', 'read:org', 'read:user', 'user:email'].join(' '));
  authorizeUrl.searchParams.set('state', state);

  return NextResponse.redirect(authorizeUrl);
}

export async function GETCallback(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json(
      { error: 'oauth_error', message: searchParams.get('error_description') ?? error },
      { status: 400 },
    );
  }

  if (!state || !pendingStates.has(state)) {
    return NextResponse.json(
      { error: 'invalid_state', message: 'Invalid or expired state parameter' },
      { status: 400 },
    );
  }

  const { repo } = pendingStates.get(state)!;
  pendingStates.delete(state);

  if (!code) {
    return NextResponse.json(
      { error: 'missing_code', message: 'Authorization code not provided' },
      { status: 400 },
    );
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return NextResponse.json({ error: 'missing_oauth_configuration' }, { status: 500 });
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: MATVERSE_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description ?? tokenData.error ?? 'missing_access_token');
    }

    const accessToken: string = tokenData.access_token;
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    });

    const userData = await userResponse.json();
    const sessionToken = crypto.randomBytes(64).toString('hex');

    const dashboardPath = repo ? `/dashboard?repo=${encodeURIComponent(repo)}` : '/dashboard';
    const response = NextResponse.redirect(new URL(dashboardPath, request.url));

    response.cookies.set('matverse_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    response.cookies.set('matverse_user', userData.login ?? 'unknown', {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.json(
      { error: 'token_exchange_failed', message: 'Failed to complete OAuth flow' },
      { status: 500 },
    );
  }
}

export async function POSTRefresh() {
  return NextResponse.json({ message: 'Token refresh is currently not required for GitHub OAuth' });
}

export async function POSTRevoke(request: NextRequest) {
  const session = request.cookies.get('matverse_session');
  if (!session) {
    return NextResponse.json({ error: 'no_session' }, { status: 400 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('matverse_session');
  response.cookies.delete('matverse_user');
  return response;
}

export async function POSTWebhook(request: NextRequest) {
  const signature = request.headers.get('x-hub-signature-256');
  const event = request.headers.get('x-github-event') ?? 'unknown';

  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 401 });
  }

  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: 'missing_webhook_secret' }, { status: 500 });
  }

  const payload = await request.text();
  const hmac = crypto.createHmac('sha256', webhookSecret);
  const digest = `sha256=${hmac.update(payload).digest('hex')}`;

  if (signature !== digest) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  try {
    const data = JSON.parse(payload);
    switch (event) {
      case 'push':
        await handlePushEvent(data);
        break;
      case 'pull_request':
        await handlePullRequestEvent(data);
        break;
      case 'issues':
        await handleIssuesEvent(data);
        break;
      case 'workflow_run':
        await handleWorkflowRunEvent(data);
        break;
      default:
        console.log(`Unhandled event: ${event}`);
    }

    return NextResponse.json({ success: true, event });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}

type GitHubRepositoryPayload = { repository?: { full_name?: string } };

async function handlePushEvent(data: GitHubRepositoryPayload & { commits?: unknown[]; after?: string }) {
  const repo = data.repository?.full_name ?? 'unknown/repo';
  const commits = data.commits ?? [];
  const sha = data.after ?? 'unknown_sha';
  console.log(`Push to ${repo}: ${commits.length} commits at ${sha}`);
}

async function handlePullRequestEvent(
  data: GitHubRepositoryPayload & { number?: number; action?: string },
) {
  const repo = data.repository?.full_name ?? 'unknown/repo';
  const pr = data.number ?? 0;
  const action = data.action ?? 'unknown';
  console.log(`PR ${action}: ${repo}#${pr}`);
}

async function handleIssuesEvent(
  data: GitHubRepositoryPayload & { issue?: { number?: number }; action?: string },
) {
  const repo = data.repository?.full_name ?? 'unknown/repo';
  const issue = data.issue?.number ?? 0;
  const action = data.action ?? 'unknown';
  console.log(`Issue ${action}: ${repo}#${issue}`);
}

async function handleWorkflowRunEvent(
  data: GitHubRepositoryPayload & { workflow_run?: { name?: string; conclusion?: string } },
) {
  const repo = data.repository?.full_name ?? 'unknown/repo';
  const workflow = data.workflow_run?.name ?? 'unknown_workflow';
  const conclusion = data.workflow_run?.conclusion ?? 'unknown';
  console.log(`Workflow ${workflow} completed: ${conclusion} in ${repo}`);
}
