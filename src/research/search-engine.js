import { searchAuroraWebMulti } from "../../api/search.js";

export async function discoverWebSources(query) {
  return searchAuroraWebMulti(query);
}
