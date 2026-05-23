import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function ResumesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    supabase.from('resumes').select('*, candidates(full_name)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error);
        else setData(data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-bold text-foreground">Resumes</h1>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          Error: {error.message}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-lg p-4 card-hover">
              <h3 className="font-bold text-lg">{r.candidates?.full_name || 'Unknown'}</h3>
              <p className="text-muted-foreground text-sm">{r.version_name}</p>
              <div className="mt-4 flex gap-2">
                <span className="text-xs px-2 py-1 bg-primary/20 text-primary border border-primary/30 rounded-md capitalize">
                  {r.type}
                </span>
                <span className="text-xs px-2 py-1 bg-muted border border-border rounded-md">
                  v{r.version_number}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
