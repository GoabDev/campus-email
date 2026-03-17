import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import type { SendEmailResponse, User } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Send, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const composeSchema = z.object({
  recipientsInput: z.string().optional(),
  subject: z.string().min(1, "Subject required"),
  body: z.string().min(1, "Message required"),
});

type ComposeForm = z.infer<typeof composeSchema>;

const emailSchema = z.string().email("Invalid email");
const MAX_RECIPIENTS = 50;

function parseRecipients(input: string) {
  return input
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export default function Compose() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  const replyTo = searchParams.get("replyTo");
  const replyEmail = searchParams.get("email");
  const replySubject = searchParams.get("subject");
  const isReply = Boolean(replyTo);

  const form = useForm<ComposeForm>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      recipientsInput: replyEmail || "",
      subject: replySubject ? `Re: ${replySubject}` : "",
      body: "",
    },
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users").then((res) => res.data),
  });

  const mutation = useMutation({
    mutationFn: (
      data:
        | { to_email: string; subject: string; body: string; reply_to_id?: string | null }
        | { to_emails: string[]; subject: string; body: string; reply_to_id?: string | null },
    ) => api.post<SendEmailResponse>("/emails", data).then((res) => res.data),
    onSuccess: (result) => {
      if (result.failed_recipients.length > 0) {
        toast.success(
          `Sent to ${result.sent_count} recipient(s). ${result.failed_recipients.length} failed.`,
        );
      } else {
        toast.success(
          result.sent_count > 1
            ? `Email sent to ${result.sent_count} recipients`
            : "Email sent successfully",
        );
      }
      navigate("/sent");
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.error || "Failed to send. Check recipient details.";
      toast.error(message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["sent"] });
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });

  const recipientsInput = form.watch("recipientsInput") || "";
  const selectedRecipientSet = new Set(selectedRecipients);

  function toggleRecipient(email: string) {
    if (isReply) {
      return;
    }

    setRecipientError(null);
    setSelectedRecipients((current) =>
      current.includes(email)
        ? current.filter((recipient) => recipient !== email)
        : [...current, email],
    );
  }

  function removeRecipient(email: string) {
    setSelectedRecipients((current) =>
      current.filter((recipient) => recipient !== email),
    );
  }

  function buildRecipients(input: string) {
    const merged = [...parseRecipients(input), ...selectedRecipients];
    return [...new Set(merged)];
  }

  function validateRecipients(recipients: string[]) {
    if (!recipients.length) {
      return "Add at least one recipient";
    }

    if (recipients.length > MAX_RECIPIENTS) {
      return `You can send to at most ${MAX_RECIPIENTS} recipients`;
    }

    const invalidEmail = recipients.find(
      (recipient) => !emailSchema.safeParse(recipient).success,
    );

    if (invalidEmail) {
      return `Invalid email: ${invalidEmail}`;
    }

    if (isReply && recipients.length > 1) {
      return "Replies can only be sent to one recipient";
    }

    return null;
  }

  function onSubmit(data: ComposeForm) {
    const recipients = buildRecipients(data.recipientsInput || "");
    const validationMessage = validateRecipients(recipients);

    if (validationMessage) {
      setRecipientError(validationMessage);
      return;
    }

    setRecipientError(null);

    const payload =
      recipients.length === 1
        ? {
            to_email: recipients[0],
            subject: data.subject,
            body: data.body,
            reply_to_id: replyTo,
          }
        : {
            to_emails: recipients,
            subject: data.subject,
            body: data.body,
            reply_to_id: null,
          };

    mutation.mutate(payload);
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-foreground mb-4">
        {isReply ? "Reply" : "New message"}
      </h2>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium text-muted-foreground">
            {isReply ? "Replying to conversation" : "Compose your email"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="recipientsInput"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>To</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          isReply
                            ? "recipient@campus.edu"
                            : "recipient@campus.edu, second@campus.edu"
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                    {recipientError ? (
                      <p className="text-sm font-medium text-destructive">
                        {recipientError}
                      </p>
                    ) : null}
                    {!isReply ? (
                      <p className="text-xs text-muted-foreground">
                        Type one or more email addresses separated by commas, or
                        select users below.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Replies support one recipient only in this version.
                      </p>
                    )}
                    {selectedRecipients.length > 0 && !isReply ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {selectedRecipients.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary"
                          >
                            {email}
                            <button
                              type="button"
                              onClick={() => removeRecipient(email)}
                              className="rounded-full p-0.5 hover:bg-primary/15"
                              aria-label={`Remove ${email}`}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {users && users.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {users.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => toggleRecipient(user.email)}
                            disabled={isReply}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                              selectedRecipientSet.has(user.email)
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                              isReply && "cursor-not-allowed opacity-50",
                            )}
                          >
                            <UserRound size={12} />
                            {user.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {!isReply && recipientsInput ? (
                      <p className="text-xs text-muted-foreground">
                        Parsed recipients: {buildRecipients(recipientsInput).length}
                      </p>
                    ) : null}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject</FormLabel>
                    <FormControl>
                      <Input placeholder="What's this about?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="body"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Message</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Write your message..."
                        className="min-h-[200px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex items-center justify-between pt-2">
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={mutation.isPending}
                >
                  <Send size={16} />
                  {mutation.isPending ? "Sending..." : "Send"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
