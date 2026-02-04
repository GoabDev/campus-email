import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import type { Email } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Reply, Clock, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatFullDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ViewEmailSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-32 bg-muted rounded" />
      <Card>
        <div className="p-6 space-y-4">
          <div className="h-6 w-3/4 bg-muted rounded" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-40 bg-muted rounded" />
              <div className="h-3 w-28 bg-muted rounded" />
            </div>
          </div>
          <div className="space-y-2 pt-4">
            <div className="h-3.5 w-full bg-muted rounded" />
            <div className="h-3.5 w-full bg-muted rounded" />
            <div className="h-3.5 w-2/3 bg-muted rounded" />
          </div>
        </div>
      </Card>
    </div>
  );
}

function ThreadMessage({ email }: { email: Email }) {
  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold shrink-0">
          {email.from_name ? getInitials(email.from_name) : "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {email.from_name}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatFullDate(email.created_at)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            To: {email.to_name}
          </p>
        </div>
      </div>
      <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap pl-11">
        {email.body}
      </div>
    </div>
  );
}

export default function ViewEmail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: email, isLoading } = useQuery({
    queryKey: ["email", id],
    queryFn: () => api.get<Email>(`/emails/${id}`).then((res) => res.data),
  });

  const { data: thread } = useQuery({
    queryKey: ["thread", id],
    queryFn: () =>
      api.get<Email[]>(`/emails/${id}/thread`).then((res) => res.data),
    enabled: !!email?.reply_to_id,
  });

  const starMutation = useMutation({
    mutationFn: () => api.patch(`/emails/${id}/star`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email", id] });
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["sent"] });
      queryClient.invalidateQueries({ queryKey: ["starred"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/emails/${id}`),
    onSuccess: () => {
      toast.success("Moved to trash");
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["sent"] });
      queryClient.invalidateQueries({ queryKey: ["trash"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
      navigate(-1);
    },
  });

  if (isLoading) return <ViewEmailSkeleton />;
  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <h3 className="text-lg font-medium text-foreground mb-1">
          Email not found
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          This email may have been deleted or doesn't exist.
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    );
  }

  const handleReply = () => {
    navigate(
      `/compose?replyTo=${email.id}&email=${email.from_email}&subject=${encodeURIComponent(email.subject)}`,
    );
  };

  const starred = !!email.is_starred;
  const threadEmails = thread?.filter((e) => e.id !== email.id) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back
        </Button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => starMutation.mutate()}
            className={cn(
              "p-2 rounded-lg hover:bg-accent transition-colors",
              starred
                ? "text-amber-500"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Star size={18} fill={starred ? "currentColor" : "none"} />
          </button>
          <button
            onClick={() => deleteMutation.mutate()}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Thread - previous messages */}
      {threadEmails.length > 0 && (
        <Card className="border-border mb-3 overflow-hidden divide-y divide-border">
          <div className="px-4 sm:px-5 py-3 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground">
              {threadEmails.length} earlier{" "}
              {threadEmails.length === 1 ? "message" : "messages"} in this
              conversation
            </span>
          </div>
          {threadEmails.map((msg) => (
            <ThreadMessage key={msg.id} email={msg} />
          ))}
        </Card>
      )}

      {/* Current email */}
      <Card className="border-border">
        <div className="p-4 sm:p-6">
          <h1 className="text-xl font-semibold text-foreground mb-4">
            {email.subject}
          </h1>

          <div className="flex items-start gap-3 mb-6">
            <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold shrink-0">
              {email.from_name ? getInitials(email.from_name) : "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div>
                  <span className="text-sm font-semibold text-foreground">
                    {email.from_name}
                  </span>
                  <span className="text-sm text-muted-foreground ml-1.5">
                    {"<"}
                    {email.from_email}
                    {">"}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock size={12} />
                  {formatFullDate(email.created_at)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                To: {email.to_name} {"<"}
                {email.to_email}
                {">"}
              </p>
            </div>
          </div>

          <div className="border-t border-border" />

          <CardContent className="px-0 pt-6 pb-2">
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {email.body}
            </div>
          </CardContent>

          <div className="border-t border-border pt-4 mt-4">
            <Button onClick={handleReply} variant="outline" className="gap-2">
              <Reply size={16} />
              Reply
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
