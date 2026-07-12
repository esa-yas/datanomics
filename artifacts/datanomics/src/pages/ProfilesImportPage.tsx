import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { friendlyError } from '@/lib/dbError';
import {
  filterProfiles,
  parseImportedProfiles,
  type ImportedProfile,
} from '@/lib/profiles/importedProfiles';
import { importedProfileService } from '@/services/importedProfileService';
import { candidateService } from '@/services/candidateService';
import { useInvalidateData } from '@/hooks/useData';
import { normalizeEmail, profileToCandidateCreate } from '@/lib/profiles/candidateFromProfile';
import { aiSearchProfiles } from '@/lib/profiles/aiProfileSearch';
import { ImportedProfileView } from '@/components/profiles/ImportedProfileView';
import {
  Upload, Search, Sparkles, Trash2, MapPin, Briefcase, FileJson, X, Loader2,
  UserPlus, ArrowRight, Link2 as LinkIcon,
} from 'lucide-react';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

function matchTone(match: number | null): string {
  if (match == null) return 'bg-muted text-muted-foreground';
  if (match >= 90) return 'bg-primary/20 text-primary border border-primary/30';
  if (match >= 80) return 'bg-secondary/20 text-secondary-foreground border border-secondary/30';
  if (match >= 70) return 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30';
  return 'bg-muted text-muted-foreground border border-border';
}

type LinkedCandidate = { id: string; full_name: string; status: string };

export default function ProfilesImportPage() {
  const { user } = useAuthStore();
  const [, setLocation] = useLocation();
  const invalidate = useInvalidateData();
  const [candidateByEmail, setCandidateByEmail] = useState<Map<string, LinkedCandidate>>(new Map());
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ImportedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [appliedOnly, setAppliedOnly] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [aiMode, setAiMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiMatchKeys, setAiMatchKeys] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rows = await importedProfileService.list();
        if (!active) return;
        setProfiles(rows);
        if (rows.length) setSelectedKey(rows[0].key);
        else setImportOpen(true);
      } catch (err) {
        if (active) toast.error(friendlyError(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const picklist = await candidateService.getPicklist();
        if (!active) return;
        const map = new Map<string, LinkedCandidate>();
        for (const c of picklist) {
          const key = normalizeEmail(c.email);
          if (key) map.set(key, { id: c.id, full_name: c.full_name, status: c.status });
        }
        setCandidateByEmail(map);
      } catch {
        /* linkage is best-effort — ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const createCandidateFromProfile = async (profile: ImportedProfile) => {
    if (!profile.email) {
      toast.error('This profile has no email — add one before creating a candidate.');
      return;
    }
    setCreatingKey(profile.key);
    try {
      const candidate = await candidateService.create(profileToCandidateCreate(profile));
      invalidate.addCandidate(candidate);
      setCandidateByEmail((prev) => {
        const next = new Map(prev);
        next.set(normalizeEmail(profile.email), {
          id: candidate.id,
          full_name: candidate.full_name,
          status: candidate.status,
        });
        return next;
      });
      toast.success(`Created candidate ${candidate.full_name}`);
      setLocation(`/candidates/${candidate.id}`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setCreatingKey(null);
    }
  };

  const localMatches = useMemo(
    () => filterProfiles(profiles, query, appliedOnly),
    [profiles, query, appliedOnly],
  );

  const visible = useMemo(() => {
    if (aiMode && aiMatchKeys) {
      const set = new Set(aiMatchKeys);
      return profiles.filter((p) => set.has(p.key));
    }
    return localMatches;
  }, [aiMode, aiMatchKeys, profiles, localMatches]);

  const selected = useMemo(
    () => profiles.find((p) => p.key === selectedKey) ?? null,
    [profiles, selectedKey],
  );

  const stats = useMemo(() => {
    const applied = profiles.filter((p) => p.applied).length;
    const withMatch = profiles.filter((p) => p.jobMatch != null);
    const avg = withMatch.length
      ? Math.round(withMatch.reduce((s, p) => s + (p.jobMatch ?? 0), 0) / withMatch.length)
      : null;
    return { total: profiles.length, applied, avg };
  }, [profiles]);

  const applyImport = async (text: string) => {
    const { profiles: parsed, errors } = parseImportedProfiles(text);
    setImportErrors(errors);
    if (parsed.length === 0) {
      toast.error('No profiles found in that JSON');
      return;
    }
    setSaving(true);
    try {
      await importedProfileService.replaceAll(parsed, user?.id ?? null);
      const rows = await importedProfileService.list();
      setProfiles(rows);
      setSelectedKey(rows[0]?.key ?? null);
      setImportOpen(false);
      setImportText('');
      setAiMode(false);
      setAiMatchKeys(null);
      toast.success(`Saved ${parsed.length} profile${parsed.length === 1 ? '' : 's'} to Supabase`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => void applyImport(String(reader.result ?? ''));
    reader.onerror = () => toast.error('Could not read file');
    reader.readAsText(file);
  };

  const runAiSearch = async () => {
    if (!query.trim()) {
      setAiMatchKeys(null);
      setAiAnswer('');
      return;
    }
    setAiLoading(true);
    setAiAnswer('');
    try {
      const result = await aiSearchProfiles(profiles, query);
      setAiMatchKeys(result.matches.map((p) => p.key));
      setAiAnswer(
        result.answer ||
          (result.usedAI ? 'No strong matches found.' : 'AI unavailable — showing keyword matches.'),
      );
      if (result.matches.length) setSelectedKey(result.matches[0].key);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI search failed');
    } finally {
      setAiLoading(false);
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Remove all imported profiles from Supabase?')) return;
    setSaving(true);
    try {
      await importedProfileService.clear();
      setProfiles([]);
      setSelectedKey(null);
      setAiMode(false);
      setAiMatchKeys(null);
      setImportOpen(true);
      toast.success('Cleared imported profiles');
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Profiles</h1>
          <p className="text-sm text-muted-foreground">
            Load candidate intake JSON into Supabase and explore every detail. {stats.total > 0 && (
              <span>
                {stats.total} profiles · {stats.applied} applied
                {stats.avg != null && ` · avg match ${stats.avg}%`}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen((v) => !v)}>
            <Upload className="w-4 h-4" /> Import JSON
          </Button>
          {profiles.length > 0 && (
            <Button
              variant="outline"
              className="gap-2 text-destructive"
              onClick={() => void clearAll()}
              disabled={saving}
            >
              <Trash2 className="w-4 h-4" /> Clear
            </Button>
          )}
        </div>
      </div>

      {importOpen && (
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Import candidate JSON</h2>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setImportOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste the JSON array of submissions, or upload a <code>.json</code> file. Uploading
            replaces the current dataset and saves it to Supabase — passwords are masked in the
            detail view.
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='[ { "id": "...", "formData": { ... } } ]'
            className="min-h-[160px] w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {importErrors.length > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-300">
              {importErrors.slice(0, 5).map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-2"
              onClick={() => void applyImport(importText)}
              disabled={!importText.trim() || saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
              Load & save
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => fileRef.current?.click()}
              disabled={saving}
            >
              <Upload className="w-4 h-4" /> Upload file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading profiles…
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 py-16 text-center">
          <FileJson className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            No profiles loaded yet. Import a candidate JSON to get started.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card/60 p-3 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (aiMode) {
                      setAiMode(false);
                      setAiMatchKeys(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && aiMode === false) return;
                  }}
                  placeholder={aiMode ? 'Ask: e.g. "senior Power BI devs open to remote"' : 'Search name, role, skill, location…'}
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={aiMode ? 'default' : 'outline'}
                  className="gap-2"
                  onClick={() => {
                    const next = !aiMode;
                    setAiMode(next);
                    if (next) void runAiSearch();
                    else {
                      setAiMatchKeys(null);
                      setAiAnswer('');
                    }
                  }}
                >
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Ask AI
                </Button>
                {aiMode && (
                  <Button variant="outline" onClick={() => void runAiSearch()} disabled={aiLoading}>
                    Run
                  </Button>
                )}
              </div>
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={appliedOnly}
                onChange={(e) => setAppliedOnly(e.target.checked)}
                className="accent-primary"
              />
              Applied only
            </label>
            {aiMode && aiAnswer && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-foreground/90">
                <span className="mr-1 font-semibold text-primary">AI:</span>
                {aiAnswer}
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
            <div className="space-y-2 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto lg:pr-1">
              <p className="px-1 text-xs text-muted-foreground">
                {visible.length} of {profiles.length} shown
              </p>
              {visible.map((p) => {
                const active = p.key === selectedKey;
                return (
                  <button
                    key={p.key}
                    onClick={() => setSelectedKey(p.key)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border bg-card/50 hover:border-primary/30 hover:bg-card'
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-secondary/20 text-sm font-bold text-primary">
                      {initials(p.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{p.name}</span>
                        {candidateByEmail.has(normalizeEmail(p.email)) && (
                          <LinkIcon className="w-3 h-3 shrink-0 text-primary" aria-label="Linked candidate" />
                        )}
                      </div>
                      <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Briefcase className="w-3 h-3 shrink-0" />
                        <span className="truncate">{p.jobTitles || '—'}</span>
                      </div>
                      {p.location && (
                        <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{p.location}</span>
                        </div>
                      )}
                    </div>
                    {p.jobMatch != null && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${matchTone(p.jobMatch)}`}>
                        {p.jobMatch}%
                      </span>
                    )}
                  </button>
                );
              })}
              {visible.length === 0 && (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">No matches.</p>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card/40 p-5">
              {selected ? (
                (() => {
                  const linked = candidateByEmail.get(normalizeEmail(selected.email));
                  const creating = creatingKey === selected.key;
                  return (
                    <ImportedProfileView
                      profile={selected}
                      headerActions={
                        linked ? (
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setLocation(`/candidates/${linked.id}`)}
                          >
                            <ArrowRight className="w-3.5 h-3.5" /> View candidate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => void createCandidateFromProfile(selected)}
                            disabled={creating || !selected.email}
                          >
                            {creating ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UserPlus className="w-3.5 h-3.5" />
                            )}
                            Create candidate
                          </Button>
                        )
                      }
                    />
                  );
                })()
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Select a profile to see every detail.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
