import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  JOB_RECOMMENDATION_STATUSES,
  JOB_RECOMMENDATION_STATUS_CLASS,
  JOB_RECOMMENDATION_STATUS_LABELS,
} from '@/lib/jobRecommendationStatus';
import type { JobRecommendationStatus } from '@/services/jobResearchService';

interface Props {
  value: JobRecommendationStatus;
  onChange: (status: JobRecommendationStatus) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function JobRecommendationStatusSelect({
  value,
  onChange,
  disabled,
  compact,
}: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as JobRecommendationStatus)} disabled={disabled}>
      <SelectTrigger
        className={`${compact ? 'h-7 text-xs' : 'h-8 text-xs'} w-[9.5rem] border ${JOB_RECOMMENDATION_STATUS_CLASS[value]}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {JOB_RECOMMENDATION_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {JOB_RECOMMENDATION_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
