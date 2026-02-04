import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import type { Email } from "@/types";
import { Card } from "@/components/ui/card";
import { SendHorizonal, Star, Trash2 } from "lucide-react";
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

export default function Sent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: emails, isLoading } = useQuery({
    queryKey: ["sent"],
    queryFn: () => api.get<Email[]>("/emails/sent").then((res) => res.data),
  });

  const starMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/emails/${id}/star`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sent"] });
      queryClient.invalidateQueries({ queryKey: ["starred"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/emails/${id}`),
    onSuccess: () => {
      toast.success("Moved to trash");
      queryClient.invalidateQueries({ queryKey: ["sent"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">Sent</h2>
        {emails && emails.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {emails.length} {emails.length === 1 ? "email" : "emails"}
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
            <SendHorizonal size={28} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">
            No sent emails
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Emails you send will appear here so you can keep track of your
            conversations.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden divide-y divide-border">
          {emails?.map((email) => {
            const starred = !!email.is_starred;
            return (
              <div
                key={email.id}
                className="flex items-center gap-1 pr-2"
              >
                <button
                  onClick={() => navigate(`/email/${email.id}`)}
                  className="flex-1 text-left p-4 flex items-center gap-3 transition-colors hover:bg-accent/50 cursor-pointer min-w-0"
                >
                  <div className="h-9 w-9 rounded-full bg-muted text-muted-foreground shrink-0 flex items-center justify-center text-xs font-semibold">
                    {email.to_name ? getInitials(email.to_name) : "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        To: {email.to_name}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {formatDate(email.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {email.subject}
                    </p>
                  </div>
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
