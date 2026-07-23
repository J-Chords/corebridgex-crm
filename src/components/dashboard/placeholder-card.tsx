import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContainedIcon } from "@/components/ui/contained-icon";

export function PlaceholderCard({
  icon: Icon,
  title,
  comingIn,
  children,
}: {
  icon: LucideIcon;
  title: string;
  comingIn: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="transition-transform duration-300 ease-spring hover:-translate-y-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-base">
          <ContainedIcon size="sm" tone="neutral">
            <Icon aria-hidden="true" />
          </ContainedIcon>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {children ?? (
          <p className="text-sm text-muted-foreground">
            Nothing here yet — arrives in {comingIn}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
