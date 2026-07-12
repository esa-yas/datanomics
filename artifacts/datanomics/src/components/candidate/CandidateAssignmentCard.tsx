import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { candidateService } from '@/services/candidateService';
import { profileService } from '@/services/profileService';
import type { Candidate, Profile } from '@/types';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserCheck } from 'lucide-react';

interface Props {
  candidate: Candidate;
  onUpdated: (candidate: Candidate) => void;
}

export function CandidateAssignmentCard({ candidate, onUpdated }: Props) {
  const [assistants, setAssistants] = useState<Pick<Profile, 'id' | 'display_name' | 'email'>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    profileService.getJobSearchAssistants().then(setAssistants).catch(() => setAssistants([]));
  }, []);

  const handleChange = async (assigneeId: string) => {
    const value = assigneeId === 'unassigned' ? undefined : assigneeId;
    setSaving(true);
    try {
      const updated = await candidateService.update(candidate.id, {
        primary_assignee_id: value ?? null,
        application_specialist_id: value ?? null,
      } as Partial<Candidate>);
      onUpdated(updated);
      toast.success('Assignment updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update assignment');
    } finally {
      setSaving(false);
    }
  };

  const current = candidate.primary_assignee_id ?? candidate.application_specialist_id ?? 'unassigned';

  return (
    <div className="bg-background rounded-lg border border-border p-4 space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <UserCheck className="w-4 h-4" /> Job search assistant
      </h3>
      <div className="space-y-2 max-w-sm">
        <Label>Assigned to</Label>
        <Select value={current} onValueChange={handleChange} disabled={saving}>
          <SelectTrigger>
            <SelectValue placeholder="Select assistant…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {assistants.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.display_name} ({a.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
