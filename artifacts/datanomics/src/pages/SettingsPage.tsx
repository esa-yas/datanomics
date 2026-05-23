export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-display font-bold text-foreground">Settings</h1>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">AI Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Active AI Provider</label>
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md">Gemini</button>
                <button className="px-4 py-2 bg-muted text-muted-foreground font-medium rounded-md opacity-50 cursor-not-allowed">OpenAI</button>
                <button className="px-4 py-2 bg-muted text-muted-foreground font-medium rounded-md opacity-50 cursor-not-allowed">Claude</button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Operations</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Daily App Target</label>
                <input type="number" defaultValue={5} className="w-full bg-background border border-border rounded-md h-10 px-3" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Reply SLA (Hours)</label>
                <input type="number" defaultValue={24} className="w-full bg-background border border-border rounded-md h-10 px-3" />
              </div>
            </div>
          </div>
        </div>
        
        <button className="w-full h-10 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90">
          Save Settings
        </button>
      </div>
    </div>
  );
}
