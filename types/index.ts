export interface User {
  id: string;
  email?: string;
  full_name?: string;
}

export interface Profile extends User {
  memberstack_id?: string;
  subscription_status?: string;
  subscription_plan?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Thread {
  id: string;
  user_id: string;
  title: string;
  starred?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  id?: string;
  is_public?: boolean;
  is_verified?: boolean;
  title?: string;
  description?: string;
  topic?: string;
}

export interface PublicPrompt {
  id: string;
  message_id: string;
  content: string;
  title?: string;
  description?: string;
  topic?: string;
  user_id: string;
  author_name?: string;
  author_email?: string;
  upvote_count: number;
  has_upvoted: boolean;
  is_saved: boolean;
  created_at: string;
  access_tier?: "free" | "member";
  locked?: boolean;
}

export type PromptTopic = 
  | "marketing"
  | "development"
  | "content"
  | "research"
  | "business"
  | "education"
  | "creative"
  | "analysis"
  | "productivity"
  | "other"
  | null;

export interface Upvote {
  id: string;
  message_id: string;
  user_id: string;
  created_at: string;
}

export interface SavedPrompt {
  id: string;
  message_id: string;
  user_id: string;
  created_at: string;
  prompt?: PublicPrompt;
}

export type PromptType =
  | "auto"
  | "standard"
  | "reasoning"
  | "deep-research"
  | "custom-gpt"
  | "video"
  | "voice"
  | "image";

export interface AppSubscription {
  id: string;
  user_id: string;
  app_id: string;
  status: "active" | "canceled" | "expired" | "trial";
  plan_id?: string;
  subscription_id?: string;
  trial_ends_at?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface App {
  id: string;
  name: string;
  description: string;
  icon?: string;
  route: string;
  color?: string;
}

