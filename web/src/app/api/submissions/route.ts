import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  countRecentSubmissionsByIp,
  createSubmission,
  resolveRegionId,
} from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_SUBMISSIONS_PER_HOUR = 5;
const MAX_PAYLOAD_CHARS = 20_000;

const bodySchema = z.object({
  kind: z.enum(["new_listing", "update_listing", "correction"]),
  payload: z.record(z.string(), z.unknown()),
  organisation_id: z.number().int().positive().optional(),
  region_id: z.number().int().positive().optional(),
  submitter_name: z.string().trim().max(200).optional(),
  submitter_email: z.email().optional(),
  submitter_org_role: z.string().trim().max(200).optional(),
  turnstile_token: z.string().max(4096).optional(),
});

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function ipHash(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "";
  return createHash("sha256").update(`${salt}${ip}`).digest("hex");
}

async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("[submissions] TURNSTILE_SECRET_KEY not set — skipping check");
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          remoteip: ip,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", issues: parsed.error.issues.length },
      { status: 400 },
    );
  }
  const body = parsed.data;

  if (body.kind !== "new_listing" && !body.organisation_id) {
    return NextResponse.json(
      { error: "organisation_id is required for this kind of submission." },
      { status: 400 },
    );
  }

  if (JSON.stringify(body.payload).length > MAX_PAYLOAD_CHARS) {
    return NextResponse.json(
      { error: "Payload is too large." },
      { status: 400 },
    );
  }

  const ip = clientIp(request);
  if (!(await verifyTurnstile(body.turnstile_token, ip))) {
    return NextResponse.json(
      { error: "Verification failed — please try again." },
      { status: 400 },
    );
  }

  const hash = ipHash(ip);
  try {
    const recent = await countRecentSubmissionsByIp(hash, 1);
    if (recent >= MAX_SUBMISSIONS_PER_HOUR) {
      return NextResponse.json(
        { error: "Too many submissions from this network — try again later." },
        { status: 429 },
      );
    }

    const regionId = await resolveRegionId(
      body.organisation_id,
      body.region_id,
    );
    await createSubmission({
      regionId,
      kind: body.kind,
      organisationId: body.organisation_id,
      payload: body.payload,
      submitterName: body.submitter_name,
      submitterEmail: body.submitter_email,
      submitterOrgRole: body.submitter_org_role,
      sourceIpHash: hash,
    });
  } catch (e) {
    console.error(
      "[submissions] insert failed:",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json(
      { error: "The submission could not be saved — please try again later." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
