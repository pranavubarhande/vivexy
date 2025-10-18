import { drizzle } from "drizzle-orm/d1";
import { cache } from "react";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import * as schema from "./schema";

export const getDB = cache(() => {
  const { env } = getCloudflareContext();

  if (!env.NEXT_TAG_CACHE_D1) {
    throw new Error("D1 database not found");
  }

  return drizzle(env.NEXT_TAG_CACHE_D1, { schema, logger: true });
});
