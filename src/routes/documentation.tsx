import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, ShieldCheck, FileText, History } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/documentation")({
  component: DocumentationLayout,
  head: () => ({
    meta: [
      { title: "Documentation — HQ Asset Viewer" },
      { name: "description", content: "Technical documentation and user guide for the HQ Asset Viewer." },
    ],
  }),
});

function DocumentationLayout() {
  const location = useLocation();
  const path = location.pathname.replace(/\/$/, "");

  const navItems: {
    to: "/documentation" | "/documentation/technical" | "/documentation/user-guide" | "/documentation/changelog";
    label: string;
    icon: typeof BookOpen;
    exact?: boolean;
  }[] = [
    { to: "/documentation", label: "Overview", icon: BookOpen, exact: true },
    { to: "/documentation/technical", label: "Technical & Security", icon: ShieldCheck },
    { to: "/documentation/user-guide", label: "User Guide", icon: FileText },
    { to: "/documentation/changelog", label: "Changelog", icon: History },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold tracking-tight">HQ Asset Viewer — Documentation</h1>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        <aside className="hidden md:block w-56 shrink-0">
          <nav className="sticky top-24 flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact ? path === item.to || path === "" : path.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
