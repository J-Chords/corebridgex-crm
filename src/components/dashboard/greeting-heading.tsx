import { greeting, firstName } from "@/lib/dashboard-greeting";

/** "Good afternoon, Jonathan" — greeting text in the normal heading color, first name in the accent color. Shared by every dashboard and My Day hero so the two never drift apart. */
export function GreetingText({ fullName }: { fullName: string }) {
  return (
    <>
      {greeting(new Date().getHours())}, <span className="text-primary">{firstName(fullName)}</span>
    </>
  );
}
