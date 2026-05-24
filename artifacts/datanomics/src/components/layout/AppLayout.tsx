import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuthStore } from "@/stores/authStore";
import SetupBanner from "@/components/SetupBanner";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  MessageSquare,
  BarChart3,
  BookOpen,
  UserCheck,
  Settings2,
  LogOut,
  Bell,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, signOut } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setLocation("/");
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "manager", "team_lead", "job_search_assistant", "resume_specialist", "email_specialist"] },
    { href: "/candidates", label: "Candidates", icon: Users, roles: ["admin", "manager", "team_lead", "job_search_assistant", "resume_specialist", "email_specialist"] },
    { href: "/applications", label: "Applications", icon: Briefcase, roles: ["admin", "manager", "team_lead", "job_search_assistant", "resume_specialist", "email_specialist"] },
    { href: "/resumes", label: "Resumes", icon: FileText, roles: ["admin", "manager", "team_lead", "job_search_assistant", "resume_specialist", "email_specialist"] },
    { href: "/messages", label: "Messages", icon: MessageSquare, roles: ["admin", "manager", "team_lead", "job_search_assistant", "resume_specialist", "email_specialist"] },
    { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "manager", "team_lead", "job_search_assistant", "resume_specialist", "email_specialist"] },
    { href: "/templates", label: "Templates", icon: BookOpen, roles: ["admin", "manager", "team_lead", "job_search_assistant", "resume_specialist", "email_specialist"] },
    { href: "/team", label: "Team", icon: UserCheck, roles: ["admin", "manager"] },
    { href: "/settings", label: "Settings", icon: Settings2, roles: ["admin"] },
  ];

  const visibleNavItems = navItems.filter((item) => user?.role && item.roles.includes(user.role));

  const getPageTitle = () => {
    const currentItem = navItems.find((item) => item.href === location || (item.href !== "/" && location.startsWith(item.href)));
    return currentItem ? currentItem.label : "Job Search OS";
  };

  return (
    <div className="min-h-screen bg-background flex text-foreground font-body">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-200 ease-in-out flex flex-col ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 md:static md:flex-shrink-0`}
      >
        <div className="p-6">
          <div className="text-primary font-display font-bold text-xl tracking-tight">DATANOMICS</div>
          <div className="text-sidebar-foreground/60 text-xs mt-1 uppercase tracking-wider font-semibold">Job Search OS</div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} onClick={() => setIsMobileMenuOpen(false)}>
                <div
                  className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer group ${
                    isActive
                      ? "bg-sidebar-accent text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-white"
                  }`}
                >
                  {isActive && <div className="absolute left-0 w-1 h-8 bg-primary rounded-r-full" />}
                  <item.icon
                    className={`mr-3 h-5 w-5 flex-shrink-0 ${
                      isActive ? "text-primary" : "text-sidebar-foreground/70 group-hover:text-white"
                    }`}
                  />
                  {item.label}
                  {item.label === "Messages" && (
                    <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                      3
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center flex-1 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                {user?.display_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="ml-3 truncate">
                <p className="text-sm font-medium text-white truncate">{user?.display_name}</p>
                <p className="text-xs text-sidebar-foreground/70 truncate capitalize">{user?.role?.replace(/_/g, " ")}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="ml-2 p-2 text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent rounded-md transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <SetupBanner />
        <header className="bg-background border-b border-border h-16 flex items-center justify-between px-4 sm:px-6 z-10 sticky top-0">
          <div className="flex items-center">
            <button
              className="md:hidden mr-4 p-2 text-muted-foreground hover:text-foreground"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-display font-semibold hidden sm:block">{getPageTitle()}</h1>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
