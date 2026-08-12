import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import packageJson from "../../../package.json";

export function AboutSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>About Corebridge X</CardTitle>
        <CardDescription>Internal project + team-ops tool for Corebridge X.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <span className="text-muted-foreground">Version</span>
          <span className="font-mono">{packageJson.version}</span>
        </div>
        <div className="flex items-center justify-between border-b pb-3">
          <span className="text-muted-foreground">Data backend</span>
          <span>Mock (in-memory)</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Swaps to the real Supabase backend via an environment variable — no screen changes required.
        </p>
      </CardContent>
    </Card>
  );
}
