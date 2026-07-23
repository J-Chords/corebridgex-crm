"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const QUICK_LOGIN_ACCOUNTS = [
  { label: "Employee", name: "Alicia Chen", email: "alicia.chen@corebridgex.com" },
  { label: "Supervisor", name: "Priya Nair", email: "priya.nair@corebridgex.com" },
  { label: "Superadmin", name: "Jordan Ellis", email: "jordan.ellis@corebridgex.com" },
];

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(loginEmail: string, loginPassword: string) {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Corebridge X</CardTitle>
        <CardDescription>
          Internal staff sign-in. This tool is invite-only — accounts are
          created by an admin, there is no self-signup.
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin(email, password);
        }}
      >
        <CardContent className="flex flex-col gap-4">
          <FloatingLabelInput
            id="email"
            label="Work email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <FloatingLabelInput
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>

          <div className="w-full">
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">
                mock data · quick demo login
              </span>
              <Separator className="flex-1" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {QUICK_LOGIN_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto flex-col gap-0.5 py-2"
                  disabled={isSubmitting}
                  onClick={() => handleLogin(account.email, "demo")}
                >
                  <span className="text-xs font-medium">{account.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {account.name}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
