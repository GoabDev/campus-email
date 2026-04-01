export interface User {
  id: number;
  email: string;
  name: string;
  avatar: string | null;
}

export interface VoiceNote {
  file_name: string;
  url: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
}

export interface Email {
  id: number;
  from_user_id: number;
  to_user_id: number;
  subject: string;
  body: string;
  is_read: number;
  is_starred: number;
  reply_to_id: number | null;
  created_at: string;
  from_name?: string;
  from_email?: string;
  to_name?: string;
  to_email?: string;
  deleted_at?: string;
  voice_note: VoiceNote | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface SearchResponse {
  emails: Email[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
