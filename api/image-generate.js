import cors from "../lib/cors.cjs";
const { applyAuroraCors } = cors;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function jsonError(res, status, error) {
  return res.status(status).json({ error });
}

export default async function handler(req, res) {
  if (applyAuroraCors(req, res, "POST, OPTIONS")) return;
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return jsonError(res, 405, "Use POST.");
  }

  const apiKey = process.env.BFL_API_KEY;
  if (!apiKey) {
    return jsonError(res, 503, "Image generation is not configured yet. Add BFL_API_KEY to the Vercel environment variables.");
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== "object") return jsonError(res, 400, "Send a valid image request.");

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 4000) return jsonError(res, 400, "Enter a prompt between 1 and 4000 characters.");

  const width = Number(body.width || 1024);
  const height = Number(body.height || 1024);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 512 || height < 512 || width > 1280 || height > 1280 || width % 16 !== 0 || height % 16 !== 0) {
    return jsonError(res, 400, "Choose image dimensions between 512 and 1280 pixels in multiples of 16.");
  }

  const inputImage = body.inputImage;
  const payload = {
    prompt,
    width,
    height,
    output_format: ["png", "jpeg", "webp"].includes(body.outputFormat) ? body.outputFormat : "png",
    safety_tolerance: 2
  };

  if (body.seed !== undefined && body.seed !== null && body.seed !== "") {
    const seed = Number(body.seed);
    if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
      return jsonError(res, 400, "Seed must be a whole number from 0 to 2147483647.");
    }
    payload.seed = seed;
  }

  if (inputImage) {
    const mimeType = typeof inputImage.mimeType === "string" ? inputImage.mimeType : "";
    const data = typeof inputImage.data === "string" ? inputImage.data : "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType) ||
        !data || data.length > 4400000 || !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return jsonError(res, 400, "The reference image must be a supported JPEG, PNG, or WebP file under the upload limit.");
    }
    payload.input_image = data;
  }

  try {
    const submitResponse = await fetch("https://api.bfl.ai/v1/flux-2-klein-4b", {
      method: "POST",
      headers: { "x-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    const submitData = await submitResponse.json().catch(() => ({}));
    if (!submitResponse.ok || !submitData.id || !submitData.polling_url) {
      console.error("AURORA image provider submit failed:", submitResponse.status, submitData?.detail || submitData?.message || "No task id");
      return jsonError(res, submitResponse.status === 429 ? 429 : submitResponse.status >= 500 ? 502 : 400,
        submitResponse.status === 429
          ? "The image provider is rate-limiting requests. Please wait a moment and try again."
          : "The image provider could not accept this request. Check the prompt, provider credits, and BFL_API_KEY configuration.");
    }

    const pollUrl = new URL(submitData.polling_url);
    if (pollUrl.protocol !== "https:" || pollUrl.hostname !== "api.bfl.ai") {
      console.error("AURORA image provider returned an unexpected polling URL.");
      return jsonError(res, 502, "The image provider returned an invalid task URL.");
    }

    const deadline = Date.now() + 38000;
    let resultData = null;
    while (Date.now() < deadline) {
      await sleep(1200);
      const pollResponse = await fetch(pollUrl.toString(), {
        method: "GET",
        headers: { "x-key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(10000)
      });
      resultData = await pollResponse.json().catch(() => ({}));
      if (!pollResponse.ok) {
        console.error("AURORA image provider poll failed:", pollResponse.status);
        return jsonError(res, 502, "AURORA could not retrieve the image result. Please try again.");
      }
      if (resultData.status === "Ready" && typeof resultData.result?.sample === "string") {
        const imageUrl = resultData.result.sample;
        let parsedImageUrl;
        try { parsedImageUrl = new URL(imageUrl); } catch {}
        if (!parsedImageUrl || parsedImageUrl.protocol !== "https:" ||
            !["delivery.bfl.ai", "storage.googleapis.com"].includes(parsedImageUrl.hostname)) {
          return jsonError(res, 502, "The image provider returned an invalid image URL.");
        }
        return res.status(200).json({
          imageUrl,
          provider: "Black Forest Labs",
          model: "FLUX.2 Klein 4B",
          seed: body.seed ?? null,
          width,
          height,
          format: payload.output_format,
          note: "Save the image promptly; provider result links may expire."
        });
      }
      if (["Error", "Request Moderated", "Content Moderated", "Task not found"].includes(resultData.status)) {
        const moderated = /Moderated/.test(resultData.status);
        return jsonError(res, moderated ? 422 : 502,
          moderated
            ? "The provider declined this prompt or image. Try changing the request."
            : "Image generation failed at the provider. Please try again.");
      }
    }

    return jsonError(res, 504, "Image generation is taking longer than expected. Please try again; no result was returned in time.");
  } catch (error) {
    console.error("AURORA image generation request failed:", error?.name || "Error", error?.message || "");
    return jsonError(res, error?.name === "TimeoutError" || error?.name === "AbortError" ? 504 : 502,
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "The image provider timed out. Please try again."
        : "AURORA could not connect to the image provider.");
  }
}
