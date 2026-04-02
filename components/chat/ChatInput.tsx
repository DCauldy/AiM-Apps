"use client";

import React, { useState, KeyboardEvent, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, Sparkles, Brain, Search, User, Video, Mic, Image, BarChart3, FileText, Bot, Check, Target, MessageSquare, Mail, X, Wand2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { PromptType } from "@/types";

// Claude-style send icon: upward arrow (box is provided by button background)
const SendIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {/* Upward arrow */}
    <path d="M12 7v10M8 11l4-4 4 4" />
  </svg>
);

interface ChatInputProps {
  onSend: (message: string, promptType?: PromptType) => void;
  disabled?: boolean;
  placeholder?: string;
  promptType?: PromptType;
  onPromptTypeChange?: (type: PromptType) => void;
  centered?: boolean;
  initialValue?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "I want a prompt that will...",
  promptType = "auto",
  onPromptTypeChange,
  centered = false,
  initialValue = "",
}: ChatInputProps) {
  const [message, setMessage] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [waveformHistory, setWaveformHistory] = useState<number[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const shouldTranscribeRef = useRef<boolean>(true);
  const waveformScrollRefCentered = useRef<HTMLDivElement | null>(null);
  const waveformScrollRefBottom = useRef<HTMLDivElement | null>(null);
  const [isMediaRecorderSupported, setIsMediaRecorderSupported] = useState(true);

  // Check for MediaRecorder support on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsMediaRecorderSupported(
        typeof MediaRecorder !== "undefined" &&
        navigator.mediaDevices !== undefined &&
        navigator.mediaDevices.getUserMedia !== undefined
      );
    }
  }, []);

  // Cleanup audio stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  // Slow down scrolling on waveform containers
  useEffect(() => {
    if (!isRecording) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const target = e.currentTarget as HTMLDivElement;
      // Reduce scroll speed (99% slower)
      const scrollAmount = (e.deltaX || e.deltaY) * 0.01;
      target.scrollLeft += scrollAmount;
    };

    const centeredRef = waveformScrollRefCentered.current;
    const bottomRef = waveformScrollRefBottom.current;

    if (centeredRef) {
      centeredRef.addEventListener('wheel', handleWheel, { passive: false });
    }
    if (bottomRef) {
      bottomRef.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      if (centeredRef) {
        centeredRef.removeEventListener('wheel', handleWheel);
      }
      if (bottomRef) {
        bottomRef.removeEventListener('wheel', handleWheel);
      }
    };
  }, [isRecording]);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim(), promptType);
      setMessage("");
    }
  };

  const startRecording = async () => {
    try {
      setRecordingError(null);
      setRecordingDuration(0);
      setWaveformHistory([]);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up Web Audio API for visualization
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start visualizing audio levels - accumulate waveform over time
      let sampleCount = 0;
      const visualize = () => {
        if (!analyserRef.current) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate average audio level for this sample
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const averageLevel = (sum / bufferLength) / 255; // Normalize to 0-1

        // Add sample to waveform history (every ~8 animation frames to slow down the animation)
        sampleCount++;
        if (sampleCount % 8 === 0) {
          setWaveformHistory((prev) => {
            // Limit to ~200 samples to prevent memory issues
            const newHistory = [...prev, averageLevel];
            return newHistory.length > 200 ? newHistory.slice(-200) : newHistory;
          });
        }

        animationFrameRef.current = requestAnimationFrame(visualize);
      };
      visualize();

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);

      // Check for supported MIME types
      const options: MediaRecorderOptions = {};
      const supportedTypes = [
        "audio/webm",
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/mpeg",
      ];
      
      const supportedType = supportedTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      
      if (supportedType) {
        options.mimeType = supportedType;
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      shouldTranscribeRef.current = true;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Clean up visualization
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        // Only transcribe if shouldTranscribeRef is true
        if (shouldTranscribeRef.current) {
          const mimeType = mediaRecorder.mimeType || "audio/webm";
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mimeType,
          });
          await transcribeAudio(audioBlob);
        }

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error: any) {
      console.error("Error starting recording:", error);
      setRecordingError(
        error.name === "NotAllowedError"
          ? "Microphone permission denied. Please allow microphone access."
          : "Failed to start recording. Please try again."
      );
      setIsRecording(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  };

  const stopRecording = (shouldTranscribe: boolean = true) => {
    if (mediaRecorderRef.current && isRecording) {
      setIsRecording(false);
      // Clean up visualization immediately
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      // Set flag for transcription (onstop handler will check this)
      shouldTranscribeRef.current = shouldTranscribe;
      
      // Stop recording (onstop handler will check shouldTranscribeRef)
      mediaRecorderRef.current.stop();
      
      // If canceling, clean up state immediately
      if (!shouldTranscribe) {
        setRecordingDuration(0);
        setWaveformHistory([]);
      }
    }
  };

  const cancelRecording = () => {
    stopRecording(false);
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    setRecordingError(null);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Transcription failed");
      }

      const data = await response.json();
      if (data.text) {
        setMessage(data.text);
        // Focus the textarea after transcription
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Move cursor to end
          textareaRef.current.setSelectionRange(
            data.text.length,
            data.text.length
          );
        }
      }
    } catch (error: any) {
      console.error("Transcription error:", error);
      setRecordingError(error.message || "Failed to transcribe audio");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleMicrophoneClick = () => {
    if (isRecording) {
      stopRecording(true); // Stop and transcribe
    } else {
      startRecording();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Enter to send message
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    
    // Ensure Cmd+A / Ctrl+A works for select-all in textarea
    // Don't prevent default for select-all - let the browser handle it natively
    if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
      // Do nothing - let the browser's native select-all behavior work
      // The window-level handler in ChatWindow will check activeElement and skip if we're here
      return;
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = "auto";
      // Get the scroll height
      const scrollHeight = textareaRef.current.scrollHeight;
      // Set max height based on mode (centered: 100px, bottom: 200px)
      const maxHeight = centered ? 100 : 200;
      // Set the height, respecting the max height
      textareaRef.current.style.height = Math.min(scrollHeight, maxHeight) + "px";
    }
  }, [message, centered]);


  const promptTypeConfig: Record<PromptType, { label: string; description: string; icon: React.ReactNode }> = {
    auto: {
      label: "Auto Detect",
      description: "AI detects the best prompt type for you",
      icon: <Wand2 className="h-4 w-4" />,
    },
    standard: {
      label: "Standard Prompt",
      description: "Recommended for most tasks",
      icon: <Sparkles className="h-4 w-4" />,
    },
    reasoning: {
      label: "Reasoning Prompt",
      description: "For reasoning tasks (GPT-5 model)",
      icon: <Brain className="h-4 w-4" />,
    },
    "deep-research": {
      label: "Deep Research Prompt",
      description: "For web-based research",
      icon: <Search className="h-4 w-4" />,
    },
    "custom-gpt": {
      label: "Custom GPT/Agent Prompt",
      description: "Design your own Custom GPTs or AI Agents",
      icon: <User className="h-4 w-4" />,
    },
    video: {
      label: "Video Prompt",
      description: "Create prompts for Veo, Kling/Motion, Runway, Pika, and more",
      icon: <Video className="h-4 w-4" />,
    },
    voice: {
      label: "Voice/Audio Prompt",
      description: "Create prompts for Eleven Labs, TTS, and voice generation",
      icon: <Mic className="h-4 w-4" />,
    },
    image: {
      label: "Image Prompt",
      description: "Create prompts for Google Nano Banana, Nano Banana Pro, and ChatGPT Image 1.5",
      icon: <Image className="h-4 w-4" />,
    },
  };

  const quickActions = [
    { label: "Create marketing strategy", icon: <Target className="h-4 w-4" />, prompt: "Create a comprehensive marketing strategy for" },
    { label: "Write social media content", icon: <MessageSquare className="h-4 w-4" />, prompt: "Write engaging social media content for" },
    { label: "Plan email campaign", icon: <Mail className="h-4 w-4" />, prompt: "Plan an effective email marketing campaign for" },
  ];

  if (centered) {
    // Centered mode - wider, more prominent (like Prompt Cowboy)
    return (
      <>
        {/* SVG Gradient Definition for icons - animated flowing effect */}
        <svg className="absolute w-0 h-0 pointer-events-none">
          <defs>
            <linearGradient id="promptGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <animate attributeName="x1" values="0%;100%;0%" dur="6s" repeatCount="indefinite" />
              <animate attributeName="x2" values="100%;200%;100%" dur="6s" repeatCount="indefinite" />
              <stop offset="0%" stopColor="#1C4C8A" />
              <stop offset="50%" stopColor="#31DBA5" />
              <stop offset="100%" stopColor="#1C4C8A" />
            </linearGradient>
          </defs>
        </svg>
        <div className="w-full max-w-2xl mx-auto space-y-4">
          {/* Input bar with prompt selector inside */}
          <div className="relative flex flex-col gap-2 bg-background border border-border rounded-[22px] px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
            {/* First row: prompt selector, textarea, send button */}
            <div className="flex gap-2 items-center">
              {onPromptTypeChange && (
                <DropdownMenu>
                  <DropdownMenuTrigger className="group !bg-transparent !border-none !rounded-[8px] !px-2 !py-1.5 !h-auto hover:!bg-accent !font-sans !text-xs sm:!text-sm flex items-center gap-1.5 shrink-0">
                    <div className="relative inline-block [&>svg]:w-4 [&>svg]:h-4 [&>svg]:fill-none gradient-icon">
                      {promptTypeConfig[promptType].icon}
                    </div>
                    <span className="hidden sm:inline whitespace-nowrap gradient-text-flow font-medium">
                      {promptTypeConfig[promptType].label}
                    </span>
                    <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 fill-none gradient-icon-stroke" />
                  </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="!min-w-[320px] !p-2 !mt-1">
                  {Object.entries(promptTypeConfig).map(([type, config]) => (
                    <DropdownMenuItem
                      key={type}
                      onClick={() => onPromptTypeChange(type as PromptType)}
                      className={`!p-3 !rounded-lg !mb-1 last:!mb-0 cursor-pointer ${
                        promptType === type ? "!bg-primary/10" : "hover:!bg-accent"
                      }`}
                    >
                      <div className="flex items-start gap-3 w-full">
                        <div className="mt-0.5">{config.icon}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-foreground">{config.label}</span>
                            {promptType === type && <Check className="h-4 w-4 text-primary" />}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
                        </div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
              {isRecording ? (
                // Recording UI with waveform
                <div className="flex-1 flex items-center gap-3 px-2 py-2">
                  <Button
                    onClick={cancelRecording}
                    variant="ghost"
                    size="icon"
                    className="!h-8 !w-8 !p-0 shrink-0 hover:!bg-red-50"
                    title="Cancel recording"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <div className="flex-1 min-w-0" style={{ width: 0 }}>
                    <div ref={waveformScrollRefCentered} className="overflow-x-auto overflow-y-hidden" style={{ width: '100%' }}>
                      <div className="flex items-center gap-0.5 h-6" style={{ flexDirection: 'row-reverse' }}>
                        {waveformHistory.length > 0 ? (
                          [...waveformHistory].reverse().map((level, index) => (
                            <div
                              key={index}
                              className="flex-none bg-[#1C4C8A] rounded-sm"
                              style={{
                                width: "2px",
                                height: `${Math.max(2, level * 24)}px`,
                                minHeight: "2px",
                              }}
                            />
                          ))
                        ) : (
                          <div className="flex items-center gap-0.5 w-full" style={{ flexDirection: 'row-reverse' }}>
                            {Array.from({ length: 60 }).map((_, i) => (
                              <div
                                key={i}
                                className="flex-1 bg-muted rounded-sm"
                                style={{ height: "2px" }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono shrink-0 min-w-[36px]">
                    {formatDuration(recordingDuration)}
                  </div>
                  <Button
                    onClick={() => stopRecording(true)}
                    variant="ghost"
                    size="icon"
                    className="!h-8 !w-8 !p-0 shrink-0 !bg-[#1C4C8A] hover:!bg-[#183f73]"
                    title="Finish recording"
                  >
                    <Check className="h-4 w-4 text-white" />
                  </Button>
                </div>
              ) : (
                <>
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={1}
                    className="flex-1 px-2 py-1 bg-transparent text-foreground resize-none font-sans text-[15px] sm:text-base leading-[1.4] max-h-[100px] focus:outline-none placeholder:text-muted-foreground"
                  />
                  {isMediaRecorderSupported && (
                    <Button
                      onClick={handleMicrophoneClick}
                      disabled={disabled || isTranscribing}
                      className="!border-none !rounded-full !w-10 !h-10 !min-w-10 !p-0 !m-0 !flex !items-center !justify-center transition-all shrink-0 !bg-transparent hover:!bg-accent !text-muted-foreground"
                      title="Start voice recording"
                    >
                      <Mic className="h-[18px] w-[18px]" />
                    </Button>
                  )}
                  <Button
                    onClick={handleSend}
                    disabled={disabled || !message.trim() || isRecording || isTranscribing}
                    className="!bg-[#1C4C8A] !text-white !border-none !rounded-lg !w-10 !h-10 !min-w-10 !p-0 !m-0 !flex !items-center !justify-center hover:!bg-[#183f73] hover:!scale-105 transition-all shrink-0"
                  >
                    <SendIcon className="h-5 w-5" />
                  </Button>
                </>
              )}
            </div>
            
          </div>

          {/* Error message */}
          {recordingError && (
            <div className="text-xs text-red-500 px-2">{recordingError}</div>
          )}

          {/* Transcribing indicator */}
          {isTranscribing && (
            <div className="text-xs text-muted-foreground px-2">
              Transcribing audio...
            </div>
          )}

          {/* Quick action buttons below */}
          <div className="flex gap-2 flex-wrap justify-center">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                onClick={() => {
                  setMessage(action.prompt);
                  if (textareaRef.current) {
                    textareaRef.current.focus();
                  }
                }}
                disabled={disabled}
                className="!bg-background !border-border !text-foreground !rounded-[12px] !px-3 !py-2 !h-auto hover:!bg-accent !font-sans !text-sm flex items-center gap-2"
              >
                {action.icon}
                <span className="hidden sm:inline">{action.label}</span>
              </Button>
            ))}
          </div>
          
          {/* Disclaimer text below input */}
          <p className="text-xs text-muted-foreground text-center mt-2">
            AiM Prompt Studio can make mistakes.
          </p>
        </div>
      </>
    );
  }

  // Bottom mode - ChatGPT/Claude style: centered, clean input
  return (
      <div className="w-full">
      <div className="flex gap-2 items-center w-full relative">
        <div 
          className="flex-1 border border-border rounded-2xl bg-background shadow-sm hover:shadow-md transition-shadow focus-within:border-border focus-within:shadow-md min-h-[36px] flex items-center px-2 overflow-visible relative"
        >
          {isRecording ? (
            // Recording UI with waveform
            <div className="flex-1 flex items-center gap-3 px-2 py-2">
              <Button
                onClick={cancelRecording}
                variant="ghost"
                size="icon"
                className="!h-7 !w-7 !p-0 shrink-0 hover:!bg-red-50"
                title="Cancel recording"
              >
                <X className="h-3.5 w-3.5 text-gray-600" />
              </Button>
              <div className="flex-1 min-w-0" style={{ width: 0 }}>
                <div ref={waveformScrollRefBottom} className="overflow-x-auto overflow-y-hidden" style={{ width: '100%' }}>
                  <div className="flex items-center gap-0.5 h-5" style={{ flexDirection: 'row-reverse' }}>
                    {waveformHistory.length > 0 ? (
                      [...waveformHistory].reverse().map((level, index) => (
                        <div
                          key={index}
                          className="flex-none bg-[#1C4C8A] rounded-sm"
                          style={{
                            width: "2px",
                            height: `${Math.max(2, level * 20)}px`,
                            minHeight: "2px",
                          }}
                        />
                      ))
                    ) : (
                      <div className="flex items-center gap-0.5 w-full" style={{ flexDirection: 'row-reverse' }}>
                        {Array.from({ length: 60 }).map((_, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-gray-300 rounded-sm"
                            style={{ height: "2px" }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground font-mono shrink-0 min-w-[32px]">
                {formatDuration(recordingDuration)}
              </div>
              <Button
                onClick={() => stopRecording(true)}
                variant="ghost"
                size="icon"
                className="!h-7 !w-7 !p-0 shrink-0 !bg-[#1C4C8A] hover:!bg-[#183f73]"
                title="Finish recording"
              >
                <Check className="h-3.5 w-3.5 text-white" />
              </Button>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              disabled={disabled}
              rows={1}
              className="flex-1 px-2 py-2.5 bg-transparent text-foreground resize-none font-sans text-[15px] leading-[1.4] max-h-[200px] focus:outline-none placeholder:text-muted-foreground caret-primary min-h-[24px]"
            />
          )}
        </div>
        {isMediaRecorderSupported && !isRecording && (
          <Button
            onClick={handleMicrophoneClick}
            disabled={disabled || isTranscribing}
            className="!border-none !rounded-full !w-9 !h-9 !min-w-9 !p-0 !m-0 !flex !items-center !justify-center transition-all shrink-0 !bg-transparent hover:!bg-accent !text-muted-foreground"
            title="Start voice recording"
          >
            <Mic className="h-4 w-4" />
          </Button>
        )}
        {!isRecording && (
          <Button
            onClick={handleSend}
            disabled={disabled || !message.trim() || isRecording || isTranscribing}
            className="!bg-[#1C4C8A] !text-white !border-none !rounded-lg !w-9 !h-9 !min-w-9 !p-0 !m-0 !flex !items-center !justify-center hover:!bg-[#183f73] disabled:!opacity-40 disabled:!cursor-not-allowed transition-all shrink-0"
          >
            <SendIcon className="h-[18px] w-[18px]" />
          </Button>
        )}
      </div>
      {/* Error message */}
      {recordingError && (
        <div className="text-xs text-red-500 text-center mt-1">
          {recordingError}
        </div>
      )}
      {/* Transcribing indicator */}
      {isTranscribing && (
        <div className="text-xs text-muted-foreground text-center mt-1">
          Transcribing audio...
        </div>
      )}
      {/* Disclaimer text below input */}
      <p className="text-xs text-muted-foreground text-center mt-2">
        AiM Prompt Studio can make mistakes.
      </p>
    </div>
  );
}
