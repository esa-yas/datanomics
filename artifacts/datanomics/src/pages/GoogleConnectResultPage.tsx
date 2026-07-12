import { useMemo } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GoogleConnectResultPage() {
  const params = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const status = params.get('status');
  const email = params.get('email');
  const message = params.get('message');
  const success = status === 'success';
  const gmailApiDisabled =
    message?.startsWith('gmail_api_disabled') ||
    message?.includes('Gmail API has not been used');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 text-center space-y-4">
        {success ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <h1 className="text-xl font-bold">Google connected</h1>
            <p className="text-muted-foreground text-sm">
              {email ? `${email} is now linked for Apply label tracking.` : 'Your account is connected.'}
            </p>
            <p className="text-xs text-muted-foreground">You can close this window.</p>
          </>
        ) : (
          <>
            <XCircle className="w-12 h-12 text-destructive mx-auto" />
            <h1 className="text-xl font-bold text-destructive">Connection failed</h1>
            <p className="text-muted-foreground text-sm">
              {gmailApiDisabled
                ? 'Gmail API is not enabled for this Google Cloud project. An admin must enable it, then you can try again.'
                : (message ?? 'Something went wrong.')}
            </p>
            {gmailApiDisabled ? (
              <Button asChild>
                <a
                  href="https://console.cloud.google.com/apis/library/gmail.googleapis.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Enable Gmail API
                </a>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => window.history.back()}>
                Try again
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
