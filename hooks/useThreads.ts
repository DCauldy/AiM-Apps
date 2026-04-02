"use client";

import { useState, useEffect, useCallback } from "react";
import type { Thread } from "@/types";

export function useThreads() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/apps/prompt-studio/threads");
      if (!response.ok) {
        throw new Error("Failed to fetch threads");
      }
      const data = await response.json();
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a3ef0d3d-2763-494e-b47c-1d69118bb7b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useThreads.ts:11',message:'Fetched threads from API',data:{threadCount:data.length,threadIds:data.map((t:Thread)=>t.id),threadTitles:data.map((t:Thread)=>t.title),currentThreadsCount:threads.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      
      // Deduplicate threads by ID to prevent duplicates
      const uniqueThreads: Thread[] = Array.from(
        new Map(data.map((thread: Thread) => [thread.id, thread])).values()
      ) as Thread[];
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a3ef0d3d-2763-494e-b47c-1d69118bb7b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useThreads.ts:25',message:'Setting threads after deduplication',data:{originalCount:data.length,uniqueCount:uniqueThreads.length,removedDuplicates:data.length-uniqueThreads.length,threadIds:uniqueThreads.map((t: Thread)=>t.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      
      const visibleThreads = uniqueThreads.filter(t => t.title !== "__direct_submissions__");
      setThreads(visibleThreads);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load threads");
    } finally {
      setLoading(false);
    }
  }, [threads.length]);

  const createThread = useCallback(async (title?: string) => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/a3ef0d3d-2763-494e-b47c-1d69118bb7b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useThreads.ts:42',message:'createThread - Entry',data:{title:title||'New Conversation',currentThreadsCount:threads.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
      const response = await fetch("/api/apps/prompt-studio/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a3ef0d3d-2763-494e-b47c-1d69118bb7b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useThreads.ts:50',message:'createThread - API response received',data:{responseOk:response.ok,responseStatus:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      if (!response.ok) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a3ef0d3d-2763-494e-b47c-1d69118bb7b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useThreads.ts:55',message:'createThread - API response not ok',data:{responseStatus:response.status,responseStatusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        // Try to parse error message from response
        let errorMessage = "Failed to create thread";
        try {
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            const errorData = await response.clone().json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } else {
            // Non-JSON response (e.g., Cloudflare HTML error page)
            errorMessage = `Server error (${response.status}): ${response.statusText}. Please try again.`;
          }
        } catch {
          // If parsing fails, use default message
          errorMessage = `Failed to create thread: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const newThread = await response.json();
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a3ef0d3d-2763-494e-b47c-1d69118bb7b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useThreads.ts:63',message:'createThread - Thread received from API',data:{threadId:newThread.id,title:newThread.title,currentThreadsCount:threads.length,existingThreadIds:threads.map(t=>t.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Check if thread already exists to prevent duplicates
      setThreads((prev) => {
        const exists = prev.some(t => t.id === newThread.id);
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/a3ef0d3d-2763-494e-b47c-1d69118bb7b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useThreads.ts:67',message:'createThread - Checking for duplicate in state',data:{threadId:newThread.id,exists,prevCount:prev.length,prevThreadIds:prev.map(t=>t.id)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (exists) {
          return prev; // Thread already exists, don't add duplicate
        }
        return [newThread, ...prev];
      });
      
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a3ef0d3d-2763-494e-b47c-1d69118bb7b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useThreads.ts:75',message:'createThread - Success, returning thread',data:{threadId:newThread.id,title:newThread.title},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      return newThread;
    } catch (err: any) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/a3ef0d3d-2763-494e-b47c-1d69118bb7b8',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useThreads.ts:79',message:'createThread - Error',data:{errorMessage:err.message,errorStack:err.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      setError(err.message || "Failed to create thread");
      throw err;
    }
  }, [threads]);

  const deleteThread = useCallback(async (threadId: string) => {
    try {
      const response = await fetch(`/api/apps/prompt-studio/threads/${threadId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete thread");
      }

      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    } catch (err: any) {
      setError(err.message || "Failed to delete thread");
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  return {
    threads,
    loading,
    error,
    fetchThreads,
    createThread,
    deleteThread,
  };
}

