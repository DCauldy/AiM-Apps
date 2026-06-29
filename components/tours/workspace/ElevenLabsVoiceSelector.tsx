"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchDigitalTwinVoices,
  tourQueryKeys,
  type ElevenLabsDigitalTwinVoice,
} from "@/components/tours/tours-api-client";

export function ElevenLabsVoiceSelector({
  value,
  disabled = false,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (voiceId: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const voicesQuery = useQuery({
    queryKey: tourQueryKeys.elevenLabsDigitalTwinVoices(),
    queryFn: fetchDigitalTwinVoices,
    staleTime: 5 * 60 * 1000,
  });
  const voices = voicesQuery.data?.voices ?? [];
  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.id === value) ?? null,
    [value, voices]
  );
  const selectedVoicePreviewUrl = selectedVoice?.previewUrl ?? null;
  const selectedVoiceName = selectedVoice?.name ?? "selected voice";
  const selectedVoiceMetadata = selectedVoice ? getVoiceMetadataLabel(selectedVoice) : null;
  const isPreviewPlaying = playingVoiceId === selectedVoice?.id;

  function stopPreview() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingVoiceId(null);
  }

  function handlePreview() {
    if (!selectedVoice || !selectedVoicePreviewUrl) {
      return;
    }
    if (isPreviewPlaying) {
      stopPreview();
      return;
    }

    stopPreview();
    const audio = new Audio(selectedVoicePreviewUrl);
    audioRef.current = audio;
    setPlayingVoiceId(selectedVoice.id);
    audio.addEventListener("ended", stopPreview, { once: true });
    audio.addEventListener("error", stopPreview, { once: true });
    void audio.play().catch(stopPreview);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select
          value={value}
          disabled={disabled || voicesQuery.isLoading || voices.length === 0}
          onValueChange={(voiceId) => {
            stopPreview();
            onChange(voiceId);
          }}
        >
          <SelectTrigger className="min-w-0 flex-1" aria-label="ElevenLabs digital twin voice">
            <SelectValue
              placeholder={voicesQuery.isLoading ? "Loading digital twins..." : "Select a digital twin voice"}
            />
          </SelectTrigger>
          <SelectContent>
            {voices.map((voice) => (
              <SelectItem key={voice.id} value={voice.id}>
                {voice.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled || !selectedVoicePreviewUrl}
          aria-label={isPreviewPlaying ? `Stop ${selectedVoiceName} preview` : `Preview ${selectedVoiceName}`}
          title={
            selectedVoicePreviewUrl
              ? isPreviewPlaying
                ? "Stop preview"
                : "Preview voice"
              : "No preview is available for this voice"
          }
          onClick={handlePreview}
        >
          {isPreviewPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
      </div>
      {voicesQuery.isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading your digital twin voices
        </p>
      ) : null}
      {voicesQuery.error ? (
        <p className="text-xs text-destructive">{voicesQuery.error.message}</p>
      ) : null}
      {!voicesQuery.isLoading && !voicesQuery.error && voices.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No ElevenLabs digital twin voices were found for this account.
        </p>
      ) : null}
      {selectedVoiceMetadata ? (
        <p className="text-xs text-muted-foreground">{selectedVoiceMetadata}</p>
      ) : null}
    </div>
  );
}

function getVoiceMetadataLabel(voice: ElevenLabsDigitalTwinVoice) {
  const labelValues = [voice.labels.accent, voice.labels.gender, voice.labels.age].filter(Boolean);
  const categoryLabel = voice.category === "professional" ? "Professional clone" : "Instant clone";
  return [categoryLabel, voice.fineTuningState, ...labelValues].join(" · ");
}
