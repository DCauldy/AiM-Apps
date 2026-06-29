import type { CrmPlatform } from "@/types/hyperlocal";
import type { CrmConnector } from "./types";
import { followupbossConnector } from "./followupboss";
import { loftyConnector } from "./lofty";
import { csvConnector } from "./csv";
import { sierraConnector } from "./sierra";
import { boldtrailConnector } from "./boldtrail";
import { cincConnector } from "./cinc";
import { clozeConnector } from "./cloze";
import { gohighlevelConnector } from "./gohighlevel";

/**
 * Returns the connector implementation for a given CRM platform.
 */
export function getConnector(platform: CrmPlatform): CrmConnector {
  switch (platform) {
    case "followupboss":
      return followupbossConnector;
    case "lofty":
      return loftyConnector;
    case "csv":
      return csvConnector;
    case "sierra":
      return sierraConnector;
    case "boldtrail":
      return boldtrailConnector;
    case "cinc":
      return cincConnector;
    case "cloze":
      return clozeConnector;
    case "gohighlevel":
      return gohighlevelConnector;
    default: {
      const _exhaust: never = platform;
      throw new Error(`Unknown CRM platform: ${String(_exhaust)}`);
    }
  }
}

export type { CrmConnector } from "./types";
