import { useEffect, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { aiProfileInsight } from '@/lib/profiles/aiProfileSearch';
import type { ImportedProfile, ProfileField } from '@/lib/profiles/importedProfiles';
import {
  Sparkles, Mail, Phone, ExternalLink, FileJson, ChevronRight, Loader2, CheckCircle2, Copy, Eye, EyeOff,
} from 'lucide-react';

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function matchTone(match: number | null): string {
  if (match == null) return 'bg-muted text-muted-foreground';
  if (match >= 90) return 'bg-primary/20 text-primary border border-primary/30';
  if (match >= 80) return 'bg-secondary/20 text-secondary-foreground border border-secondary/30';
  if (match >= 70) return 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30';
  return 'bg-muted text-muted-foreground border border-border';
}

export function FieldValue({ field }: { field: ProfileField }) {
  const [revealed, setRevealed] = useState(false);

  if (field.kind === 'image') {
    return (
      <img
        src={field.value}
        alt={field.label}
        className="max-h-24 rounded-md border border-border bg-white p-1"
      />
    );
  }

  if (field.kind === 'password') {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="font-mono text-sm">{revealed ? field.value : '••••••••'}</span>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
          title={revealed ? 'Hide' : 'Reveal'}
        >
          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </span>
    );
  }

  if (field.kind === 'link') {
    const href = /^https?:\/\//i.test(field.value) ? field.value : `https://${field.value}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline break-all"
      >
        {field.value} <ExternalLink className="w-3 h-3 shrink-0" />
      </a>
    );
  }

  if (field.kind === 'email') {
    return (
      <a href={`mailto:${field.value}`} className="text-primary hover:underline break-all">
        {field.value}
      </a>
    );
  }

  return <span className="whitespace-pre-wrap break-words">{field.value}</span>;
}

interface Props {
  profile: ImportedProfile;
  /** Injected next to the action buttons (e.g. a "View candidate" link). */
  headerActions?: ReactNode;
  showInsight?: boolean;
}

export function ImportedProfileView({ profile, headerActions, showInsight = true }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    setInsight(null);
    setShowRaw(false);
  }, [profile.key]);

  const runInsight = async () => {
    setInsightLoading(true);
    try {
      setInsight(await aiProfileInsight(profile));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI insight failed');
    } finally {
      setInsightLoading(false);
    }
  };

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error('Copy failed'),
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-secondary/20 text-lg font-bold text-primary border border-primary/25">
          {initials(profile.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-display font-bold truncate">{profile.name}</h2>
          <p className="text-sm text-muted-foreground truncate">
            {profile.jobTitles || 'No target role listed'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {profile.jobMatch != null && (
              <span className={`rounded-full px-2 py-0.5 font-semibold ${matchTone(profile.jobMatch)}`}>
                {profile.jobMatch}% match
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                profile.applied ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              }`}
            >
              {profile.applied && <CheckCircle2 className="w-3 h-3" />}
              {profile.applied ? 'Applied' : 'Not applied'}
            </span>
            {profile.userId && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground font-mono">
                {profile.userId}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {headerActions}
        {profile.email && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(profile.email, 'Email')}>
            <Mail className="w-3.5 h-3.5" /> Copy email
          </Button>
        )}
        {profile.phone && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(profile.phone, 'Phone')}>
            <Phone className="w-3.5 h-3.5" /> Copy phone
          </Button>
        )}
        {showInsight && (
          <Button size="sm" className="gap-1.5" onClick={() => void runInsight()} disabled={insightLoading}>
            {insightLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AI insight
          </Button>
        )}
      </div>

      {insight && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="w-3.5 h-3.5" /> AI insight
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{insight}</p>
        </div>
      )}

      {profile.groups.map((group) => (
        <div key={group.title} className="rounded-xl border border-border bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {group.fields.map((field) => (
              <div key={field.key} className={field.value.length > 80 ? 'sm:col-span-2' : ''}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  {field.label}
                </dt>
                <dd className="mt-0.5 text-sm text-foreground">
                  <FieldValue field={field} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {profile.signatureImage && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Agreement signature
          </h3>
          <img
            src={profile.signatureImage}
            alt="Signature"
            className="max-h-28 rounded-md border border-border bg-white p-1"
          />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card/50 p-4">
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-1.5">
            <FileJson className="w-3.5 h-3.5" /> Raw JSON
          </span>
          <ChevronRight className={`w-4 h-4 transition-transform ${showRaw ? 'rotate-90' : ''}`} />
        </button>
        {showRaw && (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              className="mb-2 gap-1.5"
              onClick={() => copy(JSON.stringify(profile.raw, null, 2), 'JSON')}
            >
              <Copy className="w-3.5 h-3.5" /> Copy JSON
            </Button>
            <pre className="max-h-80 overflow-auto rounded-lg bg-background p-3 text-[11px] leading-relaxed text-muted-foreground">
              {JSON.stringify(profile.raw, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
