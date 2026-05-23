import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { candidateService } from "@/services/candidateService";
import type { Candidate } from "@/types";

export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Candidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) return;
    candidateService.getById(id).then(setData).catch(setError).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="p-6"><div className="h-64 bg-muted animate-pulse rounded-lg" /></div>;
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          Error loading candidate: {error?.message || "Not found"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <Link href="/candidates" className="hover:text-foreground">Candidates</Link>
        <span>/</span>
        <span className="text-foreground">{data.full_name}</span>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">{data.full_name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border status-${data.status}`}>
                {data.status.replace(/_/g, ' ')}
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted border border-border">
                {data.work_auth}
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted border border-border text-muted-foreground">
                {data.experience_years} YOE
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Applications", value: data.total_applications },
          { label: "Replies", value: data.total_replies },
          { label: "Interviews", value: data.total_interviews },
          { label: "Offers", value: data.total_offers },
        ].map((stat, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</span>
            <div className="text-2xl font-display font-bold text-foreground">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
