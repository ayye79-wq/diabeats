import { appendFile } from "node:fs/promises";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}

/**
 * Convert provider and rendering errors to a short message that is safe for
 * GitHub logs and gives the person maintaining the scheduled job a next step.
 */
export function safeFailureReason(error: unknown): string {
  const message = errorMessage(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("requires the configured ai integration")) {
    return "The OpenAI credential is missing. Add the repository secret OPENAI_API_KEY (or AI_INTEGRATIONS_OPENAI_API_KEY) and rerun the workflow.";
  }
  if (/\b401\b|\b403\b/.test(lowerMessage) || /incorrect .*key|invalid .*key|invalid.*credential|unauthori[sz]ed|authentication/i.test(lowerMessage)) {
    return "OpenAI rejected the configured credential. Verify the repository secret and its API permissions, then rerun the workflow.";
  }
  if (/\b429\b|rate limit|too many requests|quota/i.test(lowerMessage)) {
    return "OpenAI rate-limited the run. Check the account quota and retry the scheduled workflow later.";
  }
  if (/timeout|timed out|econnreset|enotfound|network/i.test(lowerMessage)) {
    return "The OpenAI request could not reach the service. Check provider availability or network access and retry the workflow.";
  }
  if (lowerMessage.includes("no unused content rotation package")) {
    return "Every curated meal package is still inside the recent-run window. Review content-agent/state.json cache history before retrying.";
  }
  if (lowerMessage.includes("content generation failed after")) {
    return "The model returned drafts that did not pass the content schema or safety checks after three attempts. Review the model configuration and approved content rules.";
  }
  if (lowerMessage.includes("no audio") || lowerMessage.includes("speech generation")) {
    return "OpenAI speech generation returned no audio. Check gpt-audio access and retry the workflow.";
  }
  if (/\b400\b|model.*not found|does not exist/i.test(lowerMessage)) {
    return "OpenAI rejected the generation configuration. Verify the configured model and API access, then rerun the workflow.";
  }
  if (lowerMessage.includes("video image asset")) {
    return "A checked-in meal image is unavailable. Restore the referenced content-agent asset and retry the workflow.";
  }
  if (lowerMessage.includes("ffmpeg") || lowerMessage.includes("rendering")) {
    return "Video rendering failed. Check the ffmpeg install and the checked-in meal assets, then retry the workflow.";
  }

  return "The draft could not be generated for an unclassified reason. Check the workflow logs and retry.";
}

export function formatFailureLog(error: unknown): string {
  return `Content Agent failed: ${safeFailureReason(error)}`;
}

export async function writeGitHubFailureSummary(error: unknown, summaryPath = process.env.GITHUB_STEP_SUMMARY): Promise<void> {
  if (!summaryPath) return;
  await appendFile(
    summaryPath,
    [
      "## DiabEats Content Agent",
      "",
      "The scheduled draft was not generated. No draft was uploaded or published.",
      "",
      `**Action needed:** ${safeFailureReason(error)}`,
      "",
    ].join("\n"),
  );
}