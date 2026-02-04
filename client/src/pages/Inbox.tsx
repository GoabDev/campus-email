import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import type { Email } from "@/types";
import { Card } from "@/components/ui/card";
import { MailOpen, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function EmailSkeleton() {
  return (
    <div className="p-4 border-b border-border animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="h-3 w-16 bg-muted rounded" />
          </div>
          <div className="h-3.5 w-48 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: "short" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Inbox() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: emails, isLoading } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => api.get<Email[]>("/emails/inbox").then((res) => res.data),
  });

  const starMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/emails/${id}/star`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["starred"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/emails/${id}`),
    onSuccess: () => {
      toast.success("Moved to trash");
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">Inbox</h2>
        {emails && emails.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {emails.filter((e) => !e.is_read).length} unread
          </span>
        )}
      </div>

      {isLoading ? (
        <Card className="overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <EmailSkeleton key={i} />
          ))}
        </Card>
      ) : emails?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <MailOpen size={28} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">
            No emails yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Your inbox is empty. When someone sends you an email, it will appear
            here.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden divide-y divide-border">
          {emails?.map((email) => {
            const unread = !email.is_read;
            const starred = !!email.is_starred;
            return (
              <div
                key={email.id}
                className={cn(
                  "flex items-center gap-1 pr-2",
                  unread && "bg-primary/5"
                )}
              >
                <button
                  onClick={() => navigate(`/email/${email.id}`)}
                  className="flex-1 text-left p-4 flex items-center gap-3 transition-colors hover:bg-accent/50 cursor-pointer min-w-0"
                >
                  <div
                    className={cn(
                      "h-9 w-9 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold",
                      unread
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {email.from_name ? getInitials(email.from_name) : "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "text-sm truncate",
                          unread
                            ? "font-semibold text-foreground"
                            : "font-medium text-foreground"
                        )}
                      >
                        {email.from_name}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {formatDate(email.created_at)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "text-sm truncate",
                        unread ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {email.subject}
                    </p>
                  </div>

                  {unread && (
                    <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
                  )}
                </button>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => starMutation.mutate(email.id)}
                    className={cn(
                      "p-1.5 rounded-md hover:bg-accent transition-colors",
                      starred
                        ? "text-amber-500"
                        : "text-muted-foreground/40 hover:text-muted-foreground"
                    )}
                  >
                    <Star
                      size={16}
                      fill={starred ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(email.id)}
                    className="p-1.5 rounded-md hover:bg-accent text-muted-foreground/40 hover:text-destructive transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
