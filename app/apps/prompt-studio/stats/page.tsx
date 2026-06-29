"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, Upload, Heart, Bookmark, ThumbsUp, MessageSquare, Calendar } from "lucide-react";

interface StatsData {
  publishedPromptsCount: number;
  totalLikesReceived: number;
  totalTimesSaved: number;
  promptsIveUpvoted: number;
  promptsIveSaved: number;
  totalConversations: number;
  recentActivity: Array<{
    id: string;
    title: string | null;
    description: string | null;
    upvote_count: number;
    saved_count: number;
    created_at: string;
  }>;
}

export default function StatsPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsData | null>(null);


  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/apps/prompt-studio/stats");
        if (!response.ok) {
          throw new Error("Failed to fetch stats");
        }
        const data = await response.json();
        setStats(data);
      } catch (error: any) {
        addToast({
          title: "Error",
          description: error.message || "Failed to load stats",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [addToast]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading stats...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Failed to load stats</div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Published Prompts",
      value: stats.publishedPromptsCount,
      icon: Upload,
      description: "Prompts you've shared with the community",
      colorClass: "border-blue-200 bg-blue-50/50",
      iconColorClass: "text-blue-600",
    },
    {
      title: "Total Likes Received",
      value: stats.totalLikesReceived,
      icon: Heart,
      description: "Upvotes on your published prompts",
      colorClass: "border-emerald-200 bg-emerald-50/50",
      iconColorClass: "text-emerald-600",
    },
    {
      title: "Total Times Saved",
      value: stats.totalTimesSaved,
      icon: Bookmark,
      description: "How many times your prompts were saved",
      colorClass: "border-blue-200 bg-blue-50/50",
      iconColorClass: "text-blue-600",
    },
    {
      title: "Prompts I've Upvoted",
      value: stats.promptsIveUpvoted,
      icon: ThumbsUp,
      description: "Prompts you've liked from others",
      colorClass: "border-emerald-200 bg-emerald-50/50",
      iconColorClass: "text-emerald-600",
    },
    {
      title: "Prompts I've Saved",
      value: stats.promptsIveSaved,
      icon: Bookmark,
      description: "Prompts you've bookmarked",
      colorClass: "border-blue-200 bg-blue-50/50",
      iconColorClass: "text-blue-600",
    },
    {
      title: "Total Conversations",
      value: stats.totalConversations,
      icon: MessageSquare,
      description: "Total chat conversations",
      colorClass: "border-emerald-200 bg-emerald-50/50",
      iconColorClass: "text-emerald-600",
    },
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-6 w-6" />
            <h1 className="text-3xl font-bold">Stats</h1>
          </div>
          <p className="text-muted-foreground">
            Your activity and engagement statistics
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className={stat.colorClass}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.iconColorClass}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Your recently published prompts and their engagement
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentActivity.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No published prompts yet</p>
                <p className="text-sm mt-2">
                  Start sharing prompts to see your activity here
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {stats.recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base mb-1">
                        {activity.title || "Untitled Prompt"}
                      </h3>
                      {activity.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {activity.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(activity.created_at)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {activity.upvote_count} like
                          {activity.upvote_count !== 1 ? "s" : ""}
                        </div>
                        <div className="flex items-center gap-1">
                          <Bookmark className="h-3 w-3" />
                          {activity.saved_count} save
                          {activity.saved_count !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
