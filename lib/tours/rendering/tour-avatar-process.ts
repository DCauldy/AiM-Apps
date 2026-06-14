import { spawn } from "node:child_process";
import { TourAvatarError } from "./tour-avatar.types";

export async function probeHeyGenAvatarVideo(
  videoPath: string
): Promise<{ width: number; height: number; durationSeconds: number }> {
  const result = await runTextProcess(
    process.env.FFPROBE_PATH || "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      videoPath,
    ],
    `Could not probe HeyGen avatar video: ${videoPath}`
  );

  let payload: {
    streams?: { width?: number; height?: number }[];
    format?: { duration?: string };
  };
  try {
    payload = JSON.parse(result.stdout) as typeof payload;
  } catch (error) {
    throw new TourAvatarError(
      `Could not parse ffprobe output for ${videoPath}: ${error instanceof Error ? error.message : String(error)}`,
      "AVATAR_ALPHA_ANALYSIS_FAILED"
    );
  }

  const stream = payload.streams?.[0];
  const width = stream?.width ?? 0;
  const height = stream?.height ?? 0;
  const durationSeconds = Number(payload.format?.duration ?? 0);
  if (!width || !height || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new TourAvatarError(`Invalid HeyGen avatar video metadata for ${videoPath}`, "AVATAR_ALPHA_ANALYSIS_FAILED");
  }
  return { width, height, durationSeconds };
}

export async function runHeyGenAvatarBinaryProcess(
  command: string,
  args: string[],
  context: string
): Promise<{ stdoutBuffer: Buffer; stderr: string }> {
  try {
    return await runProcess(command, args);
  } catch (error) {
    throw new TourAvatarError(
      `${context}: ${error instanceof Error ? error.message : String(error)}`,
      "AVATAR_ALPHA_ANALYSIS_FAILED"
    );
  }
}

export async function runHeyGenAvatarVoidProcess(command: string, args: string[]): Promise<void> {
  await runProcess(command, args);
}

async function runTextProcess(
  command: string,
  args: string[],
  context: string
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await runProcess(command, args);
    return { stdout: result.stdoutBuffer.toString("utf8"), stderr: result.stderr };
  } catch (error) {
    throw new TourAvatarError(
      `${context}: ${error instanceof Error ? error.message : String(error)}`,
      "AVATAR_ALPHA_ANALYSIS_FAILED"
    );
  }
}

async function runProcess(command: string, args: string[]): Promise<{ stdoutBuffer: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code === 0) {
        resolve({ stdoutBuffer, stderr });
        return;
      }
      reject(new Error(`${command} exited with ${code ?? "unknown"}: ${stderr}`));
    });
  });
}
