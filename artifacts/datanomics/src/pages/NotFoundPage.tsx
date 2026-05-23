export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-8xl font-display font-bold text-primary mb-4">404</h1>
        <h2 className="text-2xl font-display font-semibold text-foreground mb-4">Page not found</h2>
        <p className="text-muted-foreground mb-8">The page you are looking for does not exist or has been moved.</p>
        <a href="/" className="inline-flex items-center justify-center h-10 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
          Back to Dashboard
        </a>
      </div>
    </div>
  );
}
