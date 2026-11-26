import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/** Estado vazio: uma frase útil e a próxima ação. */
export function EmptyState({
  message,
  action,
  icon: Icon = Inbox,
  className,
}: {
  message: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-kyb border border-dashed border-kyb-linha bg-kyb-branco px-6 py-10 text-center", className)}>
      <Icon aria-hidden className="size-6 text-kyb-mudo" strokeWidth={1.75} />
      <p className="text-sm text-kyb-mudo">{message}</p>
      {action}
    </div>
  );
}
