import { useRef, useState } from "react";
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
import { Mic, Send, Square, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const composeSchema = z.object({
  to_email: z.string().email("Invalid email"),
  subject: z.string().min(1, "Subject required"),
  body: z.string(),
});

type ComposeForm = z.infer<typeof composeSchema>;

type RecordedVoiceNote = {
  blob: Blob;
  url: string;
  mimeType: string;
  fileName: string;
  durationSeconds: number | null;
};

async function blobToBase64(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read recording"));
        return;
      }

      const [, base64 = ""] = result.split(",");
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function Compose() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceNote, setVoiceNote] = useState<RecordedVoiceNote | null>(null);
  const [isRecorderSupported] = useState(
    typeof window !== "undefined" &&
      !!window.MediaRecorder &&
      !!navigator.mediaDevices?.getUserMedia,
  );

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
    mutationFn: (data: {
      to_email: string;
      subject: string;
      body: string;
      reply_to_id?: string | null;
      voice_note_base64?: string;
      voice_note_mime_type?: string;
      voice_note_file_name?: string;
      voice_note_duration_seconds?: number | null;
    }) => api.post("/emails", data),
    onSuccess: () => {
      toast.success("Email sent successfully");
      navigate("/sent");
    },
    onError: (error: unknown) => {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof error.response === "object" &&
        error.response !== null &&
        "data" in error.response &&
        typeof error.response.data === "object" &&
        error.response.data !== null &&
        "error" in error.response.data &&
        typeof error.response.data.error === "string"
          ? error.response.data.error
          : "Failed to send. Check recipient email.";
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

  const onSubmit = async (data: ComposeForm) => {
    const trimmedBody = data.body.trim();

    if (!trimmedBody && !voiceNote) {
      form.setError("body", {
        type: "manual",
        message: "Write a message or record a voice note",
      });
      return;
    }

    form.clearErrors("body");

    try {
      const payload: {
        to_email: string;
        subject: string;
        body: string;
        reply_to_id?: string | null;
        voice_note_base64?: string;
        voice_note_mime_type?: string;
        voice_note_file_name?: string;
        voice_note_duration_seconds?: number | null;
      } = {
        ...data,
        body: trimmedBody,
        reply_to_id: replyTo,
      };

      if (voiceNote) {
        payload.voice_note_base64 = await blobToBase64(voiceNote.blob);
        payload.voice_note_mime_type = voiceNote.mimeType;
        payload.voice_note_file_name = voiceNote.fileName;
        payload.voice_note_duration_seconds = voiceNote.durationSeconds;
      }

      mutation.mutate(payload);
    } catch {
      toast.error("Failed to prepare voice note for upload");
    }
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
                            onClick={() => form.setValue("to_email", user.email)}
                            className={cn(
                              "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                              selectedEmail === user.email
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
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
                      disabled={!isRecorderSupported || mutation.isPending}
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
                  disabled={mutation.isPending || isRecording}
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
