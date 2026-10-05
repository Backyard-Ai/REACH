"use server";

import { z } from "zod";
import { submitCorrection } from "@/lib/db";

export type CorrectionState = {
  status: "idle" | "ok" | "error";
  message?: string;
};

const inputSchema = z.object({
  details: z
    .string()
    .trim()
    .min(3, "Please tell us what needs updating (a few words is enough).")
    .max(2000, "Please keep the report under 2000 characters."),
  submitterEmail: z.union([z.email(), z.literal("")]),
});

export async function submitCorrectionAction(
  _prev: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const parsed = inputSchema.safeParse({
    details: String(formData.get("details") ?? ""),
    submitterEmail: String(formData.get("submitterEmail") ?? "").trim(),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const regionId = Number(formData.get("regionId"));
  const organisationId = Number(formData.get("organisationId"));
  const resourceSlug = String(formData.get("resourceSlug") ?? "");
  const resourceName = String(formData.get("resourceName") ?? "");
  if (
    !Number.isInteger(regionId) ||
    !Number.isInteger(organisationId) ||
    !resourceSlug
  ) {
    return { status: "error", message: "Missing resource reference." };
  }

  const result = await submitCorrection({
    regionId,
    organisationId,
    resourceSlug,
    resourceName,
    details: parsed.data.details,
    submitterEmail: parsed.data.submitterEmail || undefined,
  });
  if (!result.ok) {
    return { status: "error", message: result.message };
  }
  return {
    status: "ok",
    message: "Thank you — a person will review this listing.",
  };
}
