import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import type { SendEmailResponse, User, VoiceNoteUploadResponse } from "@/types";
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
import { Mic, Send, Square, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const composeSchema = z.object({
  recipientsInput: z.string().optional(),
  subject: z.string().min(1, "Subject required"),
  body: z.string(),
});

const emailSchema = z.string().email("Invalid email");
const MAX_RECIPIENTS = 50;

type ComposeForm = z.infer<typeof composeSchema>;

type RecordedVoiceNote = {
  blob: Blob;
  url: string;
  mimeType: string;
  fileName: string;
  durationSeconds: number | null;
};

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingVoiceNote, setIsUploadingVoiceNote] = useState(false);
  const [voiceNote, setVoiceNote] = useState<RecordedVoiceNote | null>(null);
  const [isRecorderSupported] = useState(
    typeof window !== "undefined" &&
      !!window.MediaRecorder &&
      !!navigator.mediaDevices?.getUserMedia,
  );

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
    mutationFn: (data: {
      to_email?: string;
      to_emails?: string[];
      subject: string;
      body: string;
      reply_to_id?: string | null;
      voice_note_upload_id?: number;
    }) => api.post<SendEmailResponse>("/emails", data).then((res) => res.data),
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

  const stopMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const clearVoiceNote = () => {
    if (voiceNote) {
      URL.revokeObjectURL(voiceNote.url);
    }
    setVoiceNote(null);
  };

  const startRecording = async () => {
    if (!isRecorderSupported) {
      toast.error("Voice recording is not supported in this browser");
      return;
    }

    try {
      clearVoiceNote();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      recordingStartedAtRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, {
          type: mediaRecorder.mimeType || mimeType || "audio/webm",
        });

        if (blob.size > 0) {
          const durationMs = recordingStartedAtRef.current
            ? Date.now() - recordingStartedAtRef.current
            : 0;
          const durationSeconds =
            durationMs > 0 ? Math.round((durationMs / 1000) * 100) / 100 : null;

          setVoiceNote({
            blob,
            url: URL.createObjectURL(blob),
            mimeType: blob.type || mimeType || "audio/webm",
            fileName: `voice-note-${Date.now()}.webm`,
            durationSeconds,
          });
          form.clearErrors("body");
        }

        recordingChunksRef.current = [];
        recordingStartedAtRef.current = null;
        stopMediaStream();
        setIsRecording(false);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      stopMediaStream();
      setIsRecording(false);
      toast.error("Microphone access was denied or unavailable");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      stopMediaStream();
      setIsRecording(false);
    }
  };

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

  const onSubmit = async (data: ComposeForm) => {
    const recipients = buildRecipients(data.recipientsInput || "");
    const validationMessage = validateRecipients(recipients);

    if (validationMessage) {
      setRecipientError(validationMessage);
      return;
    }

    setRecipientError(null);

    const trimmedBody = data.body.trim();
    if (!trimmedBody && !voiceNote) {
      form.setError("body", {
        type: "manual",
        message: "Write a message or record a voice note",
      });
      return;
    }

    form.clearErrors("body");

    const payload: {
      to_email?: string;
      to_emails?: string[];
      subject: string;
      body: string;
      reply_to_id?: string | null;
      voice_note_upload_id?: number;
    } =
      recipients.length === 1
        ? {
            to_email: recipients[0],
            subject: data.subject,
            body: trimmedBody,
            reply_to_id: replyTo,
          }
        : {
            to_emails: recipients,
            subject: data.subject,
            body: trimmedBody,
            reply_to_id: null,
          };

    if (voiceNote) {
      try {
        setIsUploadingVoiceNote(true);
        const formData = new FormData();
        formData.append("voice_note", voiceNote.blob, voiceNote.fileName);
        if (voiceNote.durationSeconds !== null) {
          formData.append(
            "voice_note_duration_seconds",
            String(voiceNote.durationSeconds),
          );
        }

        const uploadResponse = await api.post<VoiceNoteUploadResponse>(
          "/emails/voice-note-upload",
          formData,
        );

        payload.voice_note_upload_id = uploadResponse.data.id;
      } catch {
        toast.error("Failed to upload voice note");
        return;
      } finally {
        setIsUploadingVoiceNote(false);
      }
    }

    await mutation.mutateAsync(payload);
  };

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
                        placeholder="Write your message or send a voice note..."
                        className="min-h-[200px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Voice note
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Record a short audio message and send it with your email.
                    </p>
                  </div>

                  {isRecording ? (
                    <Button
                      type="button"
                      variant="destructive"
                      className="gap-2"
                      onClick={stopRecording}
                    >
                      <Square size={16} />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={startRecording}
                      disabled={
                        !isRecorderSupported || mutation.isPending || isUploadingVoiceNote
                      }
                    >
                      <Mic size={16} />
                      {voiceNote ? "Re-record" : "Record"}
                    </Button>
                  )}
                </div>

                {isRecording && (
                  <p className="text-sm text-red-600">Recording in progress...</p>
                )}

                {!isRecorderSupported && (
                  <p className="text-sm text-muted-foreground">
                    Your browser does not support voice recording here.
                  </p>
                )}

                {voiceNote && (
                  <div className="space-y-2">
                    <audio controls src={voiceNote.url} className="w-full" />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {voiceNote.durationSeconds
                          ? `${voiceNote.durationSeconds}s recorded`
                          : "Voice note ready"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={clearVoiceNote}
                        disabled={isUploadingVoiceNote || mutation.isPending}
                      >
                        <Trash2 size={14} />
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={mutation.isPending || isRecording || isUploadingVoiceNote}
                >
                  <Send size={16} />
                  {isUploadingVoiceNote
                    ? "Uploading voice note..."
                    : mutation.isPending
                      ? "Sending..."
                      : "Send"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
