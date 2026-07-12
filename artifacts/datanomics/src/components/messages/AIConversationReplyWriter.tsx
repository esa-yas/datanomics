import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  aiRecruiterReplyAdvanced,
  REPLY_INTENT_OPTIONS,
  type ReplyIntent,
} from '@/lib/ai';
import { copyTextToClipboard } from '@/lib/utils/copyText';
import { Loader2, Sparkles, Copy } from 'lucide-react';

type CandidatePick = {
  id: string;
  full_name: string;
  target_roles?: string[];
  work_auth?: string;
};

interface Props {
  candidates: CandidatePick[];
}

export function AIConversationReplyWriter({ candidates }: Props) {
  const [candidateId, setCandidateId] = useState('');
  const [channel, setChannel] = useState('email');
  const [subject, setSubject] = useState('');
  const [conversation, setConversation] = useState('');
  const [intent, setIntent] = useState<ReplyIntent>('interested');
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [generating, setGenerating] = useState(false);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === candidateId),
    [candidates, candidateId],
  );

  const canGenerate = Boolean(selectedCandidate && conversation.trim());

  const handleGenerate = async () => {
    if (!selectedCandidate) {
      toast.error('Select a candidate');
      return;
    }
    if (!conversation.trim()) {
      toast.error('Paste the recruiter message or conversation');
      return;
    }
    setGenerating(true);
    try {
      const result = await aiRecruiterReplyAdvanced(
        {
          conversation,
          candidateName: selectedCandidate.full_name,
          targetRole: selectedCandidate.target_roles?.join(' | ') || 'Professional',
          workAuth: selectedCandidate.work_auth ?? 'Not specified',
          channel,
          subject: subject || undefined,
        },
        intent,
      );
      setReplySubject(result.subject ?? '');
      setReplyBody(result.body);
      toast.success('Reply drafted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI draft failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Candidate</Label>
          <Select value={candidateId} onValueChange={setCandidateId}>
            <SelectTrigger>
              <SelectValue placeholder="Select candidate…" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name}
                  {c.target_roles?.[0] ? ` — ${c.target_roles[0]}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Channel</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="phone">Phone / SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Response intent</Label>
            <Select value={intent} onValueChange={(v) => setIntent(v as ReplyIntent)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPLY_INTENT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Subject (optional)</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Re: Interview request"
          />
        </div>

        <div className="space-y-2">
          <Label>Message or full conversation</Label>
          <Textarea
            value={conversation}
            onChange={(e) => setConversation(e.target.value)}
            className="min-h-[220px] font-mono text-xs leading-relaxed"
            placeholder="Paste the recruiter email or full thread here…"
          />
        </div>

        <Button onClick={handleGenerate} disabled={!canGenerate || generating}>
          {generating ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {generating ? 'Drafting…' : 'Generate reply'}
        </Button>
      </div>

      <div className="space-y-4">
        <Label>AI draft reply</Label>
        {channel === 'email' && (
          <Input
            value={replySubject}
            onChange={(e) => setReplySubject(e.target.value)}
            placeholder="Reply subject"
            className="mb-2"
          />
        )}
        <Textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          className="min-h-[280px] text-sm whitespace-pre-wrap leading-relaxed"
          placeholder="Generated reply appears here — edit before sending"
        />
        <Button
          variant="outline"
          disabled={!replyBody.trim()}
          onClick={() => void copyTextToClipboard(replyBody).then(() => toast.success('Copied'))}
        >
          <Copy className="w-4 h-4 mr-2" /> Copy reply
        </Button>
      </div>
    </div>
  );
}
