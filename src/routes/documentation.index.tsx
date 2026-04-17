import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, FileText, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/documentation/")({
  component: DocumentationOverview,
  head: () => ({
    meta: [
      { title: "Documentation Overview — HQ Asset Viewer" },
      { name: "description", content: "Choose between technical/security documentation and the end-user guide." },
    ],
  }),
});

function DocumentationOverview() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="mt-2 text-muted-foreground">
          Everything you need to evaluate, approve, and operate the HQ Asset Viewer.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/documentation/technical" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>Technical & Security</CardTitle>
              </div>
              <CardDescription>
                Architecture, data flow, storage, dependencies, GDPR posture — written for IT &
                Security review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-flex items-center gap-1 text-sm text-primary">
                Read the technical doc <ArrowRight className="h-4 w-4" />
              </span>
            </CardContent>
          </Card>
        </Link>

        <Link to="/documentation/user-guide" className="group">
          <Card className="h-full transition-colors group-hover:border-primary/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>User Guide</CardTitle>
              </div>
              <CardDescription>
                Step-by-step walkthrough of every feature: importing, mapping, editing, audit log,
                exporting, and troubleshooting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <span className="inline-flex items-center gap-1 text-sm text-primary">
                Open the user guide <ArrowRight className="h-4 w-4" />
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">At a glance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• Client-side application — all data stays in your browser.</p>
          <p>• No backend, no database, no telemetry, no third-party trackers.</p>
          <p>• Excel parsing happens locally; nothing is uploaded.</p>
          <p>• Edits are tracked in an append-only audit log inside the Comments column.</p>
        </CardContent>
      </Card>
    </div>
  );
}
