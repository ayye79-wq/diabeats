import { randomUUID } from "node:crypto";
import { link, open, readdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { APPROVED_FEATURE_IDS } from "./feature-manifest";
import { validateContent } from "./safety";

const draftIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, "Invalid draft ID");
const APPROVAL_CLAIM_STALE_AFTER_MS = 5 * 60 * 1000;

const contentPackageSchema = z.object({
  id: draftIdSchema,
  createdAt: z.string().datetime(),
  status: z.enum(["draft", "approved", "published", "rejected"]),
  topic: z.string().min(1).max(100),
  featureIds: z.array(z.enum(APPROVED_FEATURE_IDS)).min(1).max(3).refine(
    (ids) => new Set(ids).size === ids.length,
    "Feature IDs must be unique",
  ),
  featureClaims: z.array(
    z.object({
      featureId: z.enum(APPROVED_FEATURE_IDS),
      claim: z.string().min(1).max(240),
    }).strict(),
  ).min(1).max(3),
  hook: z.string().min(5).max(55),
  voiceover: z.string().min(40).max(900),
  scenes: z.array(
    z.object({
      seconds: z.number().int().min(2).max(8),
      onScreenText: z.string().max(90),
      visual: z.string().max(180),
    }).strict(),
  ).min(3).max(7),
  caption: z.string().min(10).max(1200),
  hashtags: z.array(z.string().regex(/^#[A-Za-z0-9_]+$/)).min(2).max(8),
  disclaimer: z.string().min(1).max(160),
  callToAction: z.string().min(3).max(160),
}).passthrough();

type StoredContentPackage = z.infer<typeof contentPackageSchema>;

export type ContentReviewDraft = Pick<
  StoredContentPackage,
  | "id"
  | "createdAt"
  | "status"
  | "topic"
  | "featureIds"
  | "featureClaims"
  | "hook"
  | "voiceover"
  | "scenes"
  | "caption"
  | "hashtags"
  | "disclaimer"
  | "callToAction"
> & {
  hasVideo: boolean;
};

export class ContentDraftStoreError extends Error {
  constructor(
    public readonly code: "invalid_id" | "not_found" | "invalid_draft" | "not_approvable" | "video_missing",
    message: string,
  ) {
    super(message);
    this.name = "ContentDraftStoreError";
  }
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function isExistingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "EEXIST";
}

export function createContentDraftStore(root = path.resolve(process.cwd(), "content-agent")) {
  const outbox = path.join(root, "outbox");
  // Review-ready packages are versioned with the application so a production
  // deployment can render a required demonstration without depending on a
  // developer's ignored local outbox.
  const reviewDrafts = path.join(root, "review-drafts");
  const draftRoots = [outbox, reviewDrafts];

  function parseId(id: string): string {
    const parsed = draftIdSchema.safeParse(id);
    if (!parsed.success) {
      throw new ContentDraftStoreError("invalid_id", "Invalid draft ID.");
    }
    return parsed.data;
  }

  function draftPath(id: string): string {
    return path.join(outbox, `${parseId(id)}.json`);
  }

  function videoPath(id: string): string {
    return path.join(outbox, `${parseId(id)}.mp4`);
  }

  async function findFile(id: string, extension: ".json" | ".mp4" | ".webm"): Promise<string | null> {
    const safeId = parseId(id);
    for (const directory of draftRoots) {
      const candidate = path.join(directory, `${safeId}${extension}`);
      try {
        if ((await stat(candidate)).isFile()) return candidate;
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
    }
    return null;
  }

  function approvalClaimPath(id: string): string {
    return path.join(outbox, `${parseId(id)}.approval-${randomUUID()}.json`);
  }

  async function findApprovalClaim(id: string): Promise<string | null> {
    const prefix = `${parseId(id)}.approval-`;
    try {
      const filename = (await readdir(outbox)).find(
        (candidate) => candidate.startsWith(prefix) && candidate.endsWith(".json"),
      );
      return filename ? path.join(outbox, filename) : null;
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async function recoverStaleApprovalClaim(id: string, claimPath: string) {
    try {
      if (Date.now() - (await stat(claimPath)).mtimeMs <= APPROVAL_CLAIM_STALE_AFTER_MS) {
        throw new ContentDraftStoreError("not_approvable", "This draft is already being approved.");
      }
      await restoreClaim(claimPath, id);
    } catch (error) {
      if (isMissingFile(error)) return;
      throw error;
    }
  }

  async function claimDraftForApproval(id: string): Promise<string> {
    const sourcePath = draftPath(id);
    for (let attempt = 0; attempt < 3; attempt++) {
      const claimPath = approvalClaimPath(id);
      try {
        await rename(sourcePath, claimPath);
        return claimPath;
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }

      const existingClaim = await findApprovalClaim(id);
      if (existingClaim) {
        await recoverStaleApprovalClaim(id, existingClaim);
        continue;
      }

      try {
        await load(id);
      } catch (error) {
        if (error instanceof ContentDraftStoreError && error.code === "not_found") throw error;
        if (error instanceof ContentDraftStoreError) throw error;
        throw error;
      }
    }

    throw new ContentDraftStoreError("not_approvable", "This draft is already being approved.");
  }

  async function restoreClaim(claimPath: string, id: string) {
    try {
      await link(claimPath, draftPath(id));
      await unlink(claimPath);
    } catch (error) {
      if (!isMissingFile(error) && !isExistingFile(error)) throw error;
    }
  }

  async function commitApprovedClaim(claimPath: string, id: string, content: StoredContentPackage) {
    const replacementPath = `${claimPath}.${randomUUID()}.replacement`;
    const committingPath = `${claimPath}.committing.json`;
    let handle;
    try {
      handle = await open(replacementPath, "wx");
      await handle.write(JSON.stringify(content, null, 2), 0, "utf8");
      await handle.sync();
    } finally {
      if (handle) await handle.close();
    }

    try {
      await rename(claimPath, committingPath);
    } catch (error) {
      await unlink(replacementPath).catch(() => undefined);
      if (isMissingFile(error)) {
        throw new ContentDraftStoreError("not_approvable", "This draft approval was interrupted. Please try again.");
      }
      throw error;
    }

    try {
      await link(replacementPath, draftPath(id));
    } catch (error) {
      if (isExistingFile(error)) {
        throw new ContentDraftStoreError("not_approvable", "This draft approval was interrupted. Please try again.");
      }
      throw error;
    } finally {
      await unlink(replacementPath).catch(() => undefined);
    }

    await unlink(committingPath).catch((error: unknown) => {
      if (!isMissingFile(error)) throw error;
    });
  }

  async function recoverAfterFailedCommit(claimPath: string, id: string) {
    const committingPath = `${claimPath}.committing.json`;
    await restoreClaim(claimPath, id);
    await restoreClaim(committingPath, id);
  }

  async function load(id: string, filename = draftPath(id)): Promise<StoredContentPackage> {
    let raw: string;
    try {
      if (filename === draftPath(id)) {
        const existingDraft = await findFile(id, ".json");
        if (!existingDraft) throw new ContentDraftStoreError("not_found", "Draft not found.");
        filename = existingDraft;
      }
      raw = await readFile(filename, "utf8");
    } catch (error) {
      if (error instanceof ContentDraftStoreError) throw error;
      if (isMissingFile(error)) {
        throw new ContentDraftStoreError("not_found", "Draft not found.");
      }
      throw error;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ContentDraftStoreError("invalid_draft", "Draft is unavailable.");
    }
    const parsed = contentPackageSchema.safeParse(json);
    if (!parsed.success || parsed.data.id !== id || validateContent(parsed.data).length > 0) {
      throw new ContentDraftStoreError("invalid_draft", "Draft is unavailable.");
    }
    return parsed.data;
  }

  async function hasVideo(id: string): Promise<boolean> {
    return Boolean(await findFile(id, ".mp4"));
  }

  async function reviewDraft(draft: StoredContentPackage): Promise<ContentReviewDraft> {
    return {
      id: draft.id,
      createdAt: draft.createdAt,
      status: draft.status,
      topic: draft.topic,
      featureIds: draft.featureIds,
      featureClaims: draft.featureClaims,
      hook: draft.hook,
      voiceover: draft.voiceover,
      scenes: draft.scenes,
      caption: draft.caption,
      hashtags: draft.hashtags,
      disclaimer: draft.disclaimer,
      callToAction: draft.callToAction,
      hasVideo: await hasVideo(draft.id),
    };
  }

  return {
    async list(): Promise<ContentReviewDraft[]> {
      const ids = new Set<string>();
      for (const directory of draftRoots) {
        let filenames: string[];
        try {
          filenames = await readdir(directory);
        } catch (error) {
          if (isMissingFile(error)) continue;
          throw error;
        }
        for (const filename of filenames) {
          const id = /^([A-Za-z0-9_-]{1,80})\.json$/.exec(filename)?.[1];
          if (id) ids.add(id);
        }
      }

      const results = await Promise.all(
        [...ids].map(async (id) => {
          try {
            return await reviewDraft(await load(id));
          } catch (error) {
            if (error instanceof ContentDraftStoreError && error.code === "invalid_draft") return null;
            throw error;
          }
        }),
      );

      return results
        .filter((draft): draft is ContentReviewDraft => draft !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async approve(id: string): Promise<ContentReviewDraft> {
      const claimPath = await claimDraftForApproval(id);
      try {
        const draft = await load(id, claimPath);
        if (draft.status !== "draft") {
          const message =
            draft.status === "approved"
              ? "This draft has already been approved."
              : "Only draft content can be approved.";
          throw new ContentDraftStoreError("not_approvable", message);
        }

        const approved = { ...draft, status: "approved" as const };
        await commitApprovedClaim(claimPath, id, approved);
        return reviewDraft(approved);
      } catch (error) {
        await recoverAfterFailedCommit(claimPath, id);
        throw error;
      }
    },

    async getVideoPath(id: string): Promise<string> {
      await load(id);
      const filename = await findFile(id, ".mp4");
      if (!filename) {
        throw new ContentDraftStoreError("video_missing", "A rendered video preview is not available for this draft.");
      }
      return filename;
    },

    async getPreviewPath(id: string): Promise<string> {
      await load(id);
      return (await findFile(id, ".webm")) ?? (await this.getVideoPath(id));
    },
  };
}

export const contentDraftStore = createContentDraftStore();