import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import type {
  AttachmentUploadResponse,
  SendEmailResponse,
  User,
  VoiceNoteUploadResponse,
} from "@/types";
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
import {
  File as FileIcon,
  FileImage,
  Mic,
  Paperclip,
  Send,
  Square,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const composeSchema = z.object({
  recipientsInput: z.string().optional(),
  subject: z.string().min(1, "Subject required"),
  body: z.string(),
});

const emailSchema = z.string().email("Invalid email");
const MAX_RECIPIENTS = 50;
const MAX_VOICE_NOTE_DURATION_SECONDS = 60;
const VOICE_NOTE_WARNING_THRESHOLD_SECONDS = 10;
const MAX_ATTACHMENTS_PER_EMAIL = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
const IMAGE_COMPRESSION_DIMENSION_LIMIT = 2200;
const IMAGE_COMPRESSION_QUALITY = 0.82;
const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain";

type ComposeForm = z.infer<typeof composeSchema>;

type RecordedVoiceNote = {
  blob: Blob;
  url: string;
  mimeType: string;
  fileName: string;
  durationSeconds: number | null;
};

type ApiErrorResponse = {
  response?: {
    data?: {
      error?: string;
    };
  };
};

type AttachmentDraft = {
  id: string;
  file: File;
  previewUrl: string | null;
  originalSizeBytes: number;
  wasCompressed: boolean;
};

function parseRecipients(input: string) {
  return input
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function formatRecordingTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${sizeBytes} B`;
}

function isImageAttachment(file: File) {
  return file.type.startsWith("image/");
}

function canCompressImage(file: File) {
  return (
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp"
  );
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to compress image"));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

async function compressImageFile(file: File) {
  if (!canCompressImage(file)) {
    return { file, wasCompressed: false, originalSizeBytes: file.size };
  }

  const image = await loadImage(file);
  const maxDimension = Math.max(image.width, image.height);
  const scale =
    maxDimension > IMAGE_COMPRESSION_DIMENSION_LIMIT
      ? IMAGE_COMPRESSION_DIMENSION_LIMIT / maxDimension
      : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is unavailable");
  }

  context.drawImage(image, 0, 0, width, height);

  const targetType = file.type === "image/png" ? "image/webp" : file.type;
  const compressedBlob = await canvasToBlob(
    canvas,
    targetType,
    IMAGE_COMPRESSION_QUALITY,
  );

  if (compressedBlob.size >= file.size) {
    return { file, wasCompressed: false, originalSizeBytes: file.size };
  }

  const extension =
    targetType === "image/webp"
      ? "webp"
      : targetType === "image/png"
        ? "png"
        : targetType === "image/jpeg"
          ? "jpg"
          : file.name.split(".").pop() || "img";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const compressedFile = new File([compressedBlob], `${baseName}.${extension}`, {
    type: targetType,
    lastModified: Date.now(),
  });

  return {
    file: compressedFile,
    wasCompressed: true,
    originalSizeBytes: file.size,
  };
}

export default function Compose() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingVoiceNote, setIsUploadingVoiceNote] = useState(false);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [voiceNote, setVoiceNote] = useState<RecordedVoiceNote | null>(null);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
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
      attachment_upload_ids?: number[];
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
    onError: (error: unknown) => {
      const apiError = error as ApiErrorResponse;
      const message =
        apiError.response?.data?.error ||
        "Failed to send. Check recipient details.";
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

  const clearRecordingTimers = () => {
    if (recordingIntervalRef.current !== null) {
      window.clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  };

  const clearVoiceNote = () => {
    if (voiceNote) {
      URL.revokeObjectURL(voiceNote.url);
    }
    setVoiceNote(null);
  };

  const clearAttachmentInput = () => {
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const attachment = current.find((item) => item.id === attachmentId);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }

      return current.filter((item) => item.id !== attachmentId);
    });
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
      setRecordingElapsedSeconds(0);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        clearRecordingTimers();
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
        mediaRecorderRef.current = null;
        setRecordingElapsedSeconds(0);
        stopMediaStream();
        setIsRecording(false);
      };

      mediaRecorder.start();
      recordingIntervalRef.current = window.setInterval(() => {
        if (!recordingStartedAtRef.current) {
          return;
        }

        const elapsedSeconds = Math.min(
          MAX_VOICE_NOTE_DURATION_SECONDS,
          Math.floor((Date.now() - recordingStartedAtRef.current) / 1000),
        );
        setRecordingElapsedSeconds(elapsedSeconds);
      }, 250);
      recordingTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
        toast.info("Voice note stopped at 1 minute");
      }, MAX_VOICE_NOTE_DURATION_SECONDS * 1000);
      setIsRecording(true);
    } catch {
      clearRecordingTimers();
      stopMediaStream();
      setIsRecording(false);
      setRecordingElapsedSeconds(0);
      toast.error("Microphone access was denied or unavailable");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    } else {
      clearRecordingTimers();
      stopMediaStream();
      setIsRecording(false);
      setRecordingElapsedSeconds(0);
    }
  };

  useEffect(() => {
    return () => {
      clearRecordingTimers();
      stopMediaStream();
      if (voiceNote) {
        URL.revokeObjectURL(voiceNote.url);
      }
      attachments.forEach((attachment) => {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      });
    };
  }, [attachments, voiceNote]);

  const recipientsInput = form.watch("recipientsInput") || "";
  const selectedRecipientSet = new Set(selectedRecipients);
  const remainingRecordingSeconds = Math.max(
    0,
    MAX_VOICE_NOTE_DURATION_SECONDS - recordingElapsedSeconds,
  );
  const isRecordingNearLimit =
    isRecording &&
    remainingRecordingSeconds <= VOICE_NOTE_WARNING_THRESHOLD_SECONDS;
  const totalAttachmentSizeBytes = attachments.reduce(
    (sum, attachment) => sum + attachment.file.size,
    0,
  );
  const remainingAttachmentBudgetBytes = Math.max(
    0,
    MAX_TOTAL_ATTACHMENT_SIZE_BYTES - totalAttachmentSizeBytes,
  );

  async function handleAttachmentSelection(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files || []);

    if (!files.length) {
      return;
    }

    const availableSlots = MAX_ATTACHMENTS_PER_EMAIL - attachments.length;
    if (availableSlots <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS_PER_EMAIL} files`);
      clearAttachmentInput();
      return;
    }

    if (files.length > availableSlots) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS_PER_EMAIL} files`);
    }

    const nextAttachments: AttachmentDraft[] = [];

    for (const file of files.slice(0, availableSlots)) {
      try {
        const prepared = isImageAttachment(file)
          ? await compressImageFile(file)
          : { file, wasCompressed: false, originalSizeBytes: file.size };

        if (prepared.file.size > MAX_ATTACHMENT_SIZE_BYTES) {
          toast.error(`${file.name} is larger than 10MB`);
          continue;
        }

        const projectedTotalSize =
          totalAttachmentSizeBytes +
          nextAttachments.reduce((sum, attachment) => sum + attachment.file.size, 0) +
          prepared.file.size;

        if (projectedTotalSize > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
          toast.error("Attachments cannot be larger than 25MB total");
          continue;
        }

        nextAttachments.push({
          id: `${Date.now()}-${Math.random()}`,
          file: prepared.file,
          previewUrl: isImageAttachment(prepared.file)
            ? URL.createObjectURL(prepared.file)
            : null,
          originalSizeBytes: prepared.originalSizeBytes,
          wasCompressed: prepared.wasCompressed,
        });
      } catch {
        toast.error(`Couldn't prepare ${file.name}`);
      }
    }

    if (nextAttachments.length > 0) {
      setAttachments((current) => [...current, ...nextAttachments]);
      form.clearErrors("body");
    }

    clearAttachmentInput();
  }

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
    if (!trimmedBody && !voiceNote && attachments.length === 0) {
      form.setError("body", {
        type: "manual",
        message: "Write a message, record a voice note, or add an attachment",
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
      attachment_upload_ids?: number[];
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

    if (attachments.length > 0) {
      try {
        setIsUploadingAttachments(true);
        const uploadedAttachmentIds: number[] = [];

        for (const attachment of attachments) {
          const formData = new FormData();
          formData.append("attachment", attachment.file, attachment.file.name);
          formData.append(
            "attachment_original_size_bytes",
            String(attachment.originalSizeBytes),
          );

          const uploadResponse = await api.post<AttachmentUploadResponse>(
            "/emails/attachment-upload",
            formData,
          );
          uploadedAttachmentIds.push(uploadResponse.data.id);
        }

        payload.attachment_upload_ids = uploadedAttachmentIds;
      } catch {
        toast.error("Failed to upload attachments");
        return;
      } finally {
        setIsUploadingAttachments(false);
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
                        placeholder="Write your message, add attachments, or send a voice note..."
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
                      Attachments
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Add up to 5 files. 10MB per file, 25MB total. Images may be
                      compressed before upload.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      accept={ATTACHMENT_ACCEPT}
                      className="hidden"
                      onChange={handleAttachmentSelection}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => attachmentInputRef.current?.click()}
                      disabled={
                        mutation.isPending ||
                        isUploadingVoiceNote ||
                        isUploadingAttachments ||
                        attachments.length >= MAX_ATTACHMENTS_PER_EMAIL
                      }
                    >
                      <Paperclip size={16} />
                      Add files
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{attachments.length}/{MAX_ATTACHMENTS_PER_EMAIL} files</span>
                  <span>{formatFileSize(totalAttachmentSizeBytes)} used</span>
                  <span>{formatFileSize(remainingAttachmentBudgetBytes)} remaining</span>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/70 p-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0 overflow-hidden">
                            {attachment.previewUrl ? (
                              <img
                                src={attachment.previewUrl}
                                alt={attachment.file.name}
                                className="h-full w-full object-cover"
                              />
                            ) : attachment.file.type.startsWith("image/") ? (
                              <FileImage size={18} />
                            ) : (
                              <FileIcon size={18} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {attachment.file.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatFileSize(attachment.file.size)}</span>
                              {attachment.wasCompressed && (
                                <span className="inline-flex items-center gap-1 text-emerald-600">
                                  <Upload size={12} />
                                  Compressed from{" "}
                                  {formatFileSize(attachment.originalSizeBytes)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-2 shrink-0"
                          onClick={() => removeAttachment(attachment.id)}
                          disabled={
                            mutation.isPending ||
                            isUploadingVoiceNote ||
                            isUploadingAttachments
                          }
                        >
                          <Trash2 size={14} />
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Voice note
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Record up to 1 minute and send it with your email.
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
                        !isRecorderSupported ||
                        mutation.isPending ||
                        isUploadingVoiceNote ||
                        isUploadingAttachments
                      }
                    >
                      <Mic size={16} />
                      {voiceNote ? "Re-record" : "Record"}
                    </Button>
                  )}
                </div>

                {isRecording && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2",
                      isRecordingNearLimit
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-red-200 bg-red-50 text-red-600",
                    )}
                  >
                    <p className="text-sm font-medium">
                      Recording in progress. {formatRecordingTime(remainingRecordingSeconds)}{" "}
                      remaining.
                    </p>
                    {isRecordingNearLimit && (
                      <p className="text-xs">
                        Only 10 seconds left. Recording will stop automatically at
                        1 minute.
                      </p>
                    )}
                  </div>
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
                  disabled={
                    mutation.isPending ||
                    isRecording ||
                    isUploadingVoiceNote ||
                    isUploadingAttachments
                  }
                >
                  <Send size={16} />
                  {isUploadingAttachments
                    ? "Uploading attachments..."
                    : isUploadingVoiceNote
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
