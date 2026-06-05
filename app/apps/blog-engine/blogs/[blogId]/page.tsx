import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BlogViewClient } from "./blog-view-client";

interface BlogPageProps {
  params: Promise<{ blogId: string }>;
}

export default async function BlogPage({ params }: BlogPageProps) {
  const { blogId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Load blog with ownership check
  const { data: blog } = await supabase
    .from("bofu_blogs")
    .select("*")
    .eq("id", blogId)
    .eq("user_id", user.id)
    .single();

  if (!blog) notFound();

  // Load profile for author name
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  // Load chat history
  const { data: chats } = await supabase
    .from("bofu_blog_chats")
    .select("*")
    .eq("blog_id", blogId)
    .order("created_at", { ascending: true });

  return <BlogViewClient blog={blog} chats={chats || []} authorName={profile?.full_name} />;
}
