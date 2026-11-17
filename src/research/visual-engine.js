import { searchAuroraMedia } from "../../api/media-search.js";

export async function discoverResearchMedia(query, mediaType = "all") {
  return searchAuroraMedia(query, mediaType);
}
