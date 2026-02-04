import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import type { User } from "@/types";
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
import { Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const composeSchema = z.object({
  to_email: z.string().email("Invalid email"),
  subject: z.string().min(1, "Subject required"),
  body: z.string().min(1, "Message required"),
});

type ComposeForm = z.infer<typeof composeSchema>;

export default function Compose() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const replyTo = searchParams.get("replyTo");
  const replyEmail = searchParams.get("email");
  const replySubject = searchParams.get("subject");

  const form = useForm<ComposeForm>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      to_email: replyEmail || "",
      subject: replySubject ? `Re: ${replySubject}` : "",
      body: "",
    },
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<User[]>("/users").then((res) => res.data),
  });

  const mutation = useMutation({
    mutationFn: (data: ComposeForm & { reply_to_id?: string | null }) =>
      api.post("/emails", data),
    onSuccess: () => {
      toast.success("Email sent successfully");
      navigate("/sent");
    },
    onError: () => {
      toast.error("Failed to send. Check recipient email.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["sent"] });
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
  });

  const onSubmit = (data: ComposeForm) => {
    mutation.mutate({ ...data, reply_to_id: replyTo });
  };

  const selectedEmail = form.watch("to_email");

  return (
    <div>
      <h2 className="text-xl font-semibold text-foreground mb-4">
        {replyTo ? "Reply" : "New message"}
      </h2>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium text-muted-foreground">
            {replyTo ? "Replying to conversation" : "Compose your email"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="to_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>To</FormLabel>
                    <FormControl>
                      <Input placeholder="recipient@campus.edu" {...field} />
                    </FormControl>
                    <FormMessage />
                    {users && users.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {users.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() =>
                              form.setValue("to_email", user.email)
                            }
                            className={cn(
                              "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                              selectedEmail === user.email
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                            )}
                          >
                            <UserRound size={12} />
                            {user.name}
                          </button>
                        ))}
                      </div>
                    )}
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
