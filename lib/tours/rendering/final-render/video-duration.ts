import { spawn } from "node:child_process";

export type VideoDurationProbe = (filePath: string) => Promise<number>;

export async function probeVideoDurationSeconds(
  filePath: string,
  ffprobePath = process.env.FFPROBE_PATH || "ffprobe"
): Promise<number> {
  const output = await runProcessWithStdout(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const durationSeconds = Number.parseFloat(output.trim());
  if (!Number.isFinite(durationSeconds)) {
    throw new Error(`Could not read video duration for ${filePath}.`);
  }
  return durationSeconds;
}

export function assertVideoDurationAtLeast(input: {
  actualSeconds: number;
  expectedSeconds: number;
  toleranceSeconds?: number;
  label: string;
}): void {
  const toleranceSeconds = input.toleranceSeconds ?? 0.15;
  if (input.actualSeconds + toleranceSeconds < input.expectedSeconds) {
    throw new Error(
      `${input.label} duration ${input.actualSeconds.toFixed(3)}s is shorter than required ${input.expectedSeconds.toFixed(3)}s.`
    );
  }
}

export function assertVideoDurationClose(input: {
  actualSeconds: number;
  expectedSeconds: number;
  toleranceSeconds?: number;
  label: string;
}): void {
  const toleranceSeconds = input.toleranceSeconds ?? 0.2;
  if (Math.abs(input.actualSeconds - input.expectedSeconds) > toleranceSeconds) {
    throw new Error(
      `${input.label} duration ${input.actualSeconds.toFixed(3)}s did not match expected ${input.expectedSeconds.toFixed(3)}s.`
    );
  }
}

async function runProcessWithStdout(command: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString("utf8"));
        return;
      }
      reject(
        new Error(
          `${command} exited with code ${code ?? "unknown"}: ${Buffer.concat(stderrChunks)
            .toString("utf8")
            .trim()}`
        )
      );
    });
  });
}
