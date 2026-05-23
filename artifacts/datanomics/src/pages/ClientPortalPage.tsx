import { useAuthStore } from "@/stores/authStore";

export default function ClientPortalPage() {
  const { user, signOut } = useAuthStore();

  return (
    <div className="min-h-screen bg-background text-foreground font-body p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-display font-bold text-primary">DATANOMICS</h1>
            <h2 className="text-xl text-muted-foreground mt-2">Welcome, {user?.display_name}</h2>
          </div>
          <button 
            onClick={() => signOut()} 
            className="px-4 py-2 border border-border text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            Sign Out
          </button>
        </header>

        <div className="bg-card border border-border rounded-lg p-6 md:p-8">
          <h3 className="text-xl font-display font-semibold mb-6">Your Job Search Progress</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Apps", value: 142 },
              { label: "Replies", value: 28 },
              { label: "Interviews", value: 5 },
              { label: "Offers", value: 0 },
            ].map((stat, i) => (
              <div key={i} className="bg-background border border-border rounded-lg p-4 text-center">
                <div className="text-3xl font-display font-bold text-primary mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xl font-display font-semibold mb-4">Recent Reports</h3>
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold">Weekly Report - Nov 12</h4>
                <span className="text-xs px-2 py-1 bg-primary/20 text-primary border border-primary/30 rounded-md">New</span>
              </div>
              <p className="text-sm text-muted-foreground">Great traction this week with 3 new interview requests...</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-5 opacity-70">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold">Weekly Report - Nov 5</h4>
              </div>
              <p className="text-sm text-muted-foreground">Consistent application volume maintained...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
