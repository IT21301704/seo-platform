// Every rule, in ID order. Adding or changing a rule requires bumping RULESET_VERSION.
import { AI_001 } from "../ai/ai-001-content-in-raw-html";
import { AI_002 } from "../ai/ai-002-ai-crawler-access";
import { AI_003 } from "../ai/ai-003-key-pages";
import { AI_004 } from "../ai/ai-004-consistent-nap";
import { AI_005 } from "../ai/ai-005-nosnippet";
import { AI_006 } from "../ai/ai-006-faq-format";
import { AI_007 } from "../ai/ai-007-llms-txt";
import { IDX_001 } from "../indexing/idx-001-canonical-missing";
import { IDX_002 } from "../indexing/idx-002-canonical-valid";
import { IDX_003 } from "../indexing/idx-003-important-noindex";
import { IDX_004 } from "../indexing/idx-004-orphan-pages";
import { IDX_005 } from "../indexing/idx-005-duplicate-content";
import { IDX_006 } from "../indexing/idx-006-hreflang";
import { IDX_007 } from "../indexing/idx-007-pagination";
import { LNK_001 } from "../links/lnk-001-crawlable-links";
import { LNK_002 } from "../links/lnk-002-broken-internal-links";
import { LNK_003 } from "../links/lnk-003-broken-external-links";
import { LNK_004 } from "../links/lnk-004-click-depth";
import { LNK_005 } from "../links/lnk-005-anchor-text";
import { LNK_006 } from "../links/lnk-006-breadcrumbs";
import { LNK_007 } from "../links/lnk-007-internal-nofollow";
import { ONP_001 } from "../onpage/onp-001-title-missing";
import { ONP_002 } from "../onpage/onp-002-title-duplicate";
import { ONP_003 } from "../onpage/onp-003-title-length";
import { ONP_004 } from "../onpage/onp-004-meta-description";
import { ONP_005 } from "../onpage/onp-005-single-h1";
import { ONP_006 } from "../onpage/onp-006-heading-order";
import { ONP_007 } from "../onpage/onp-007-thin-content";
import { ONP_008 } from "../onpage/onp-008-image-alt";
import { ONP_009 } from "../onpage/onp-009-image-filenames";
import { ONP_010 } from "../onpage/onp-010-clean-urls";
import { ONP_011 } from "../onpage/onp-011-open-graph";
import { ONP_012 } from "../onpage/onp-012-twitter-card";
import { ONP_013 } from "../onpage/onp-013-lang";
import { ONP_014 } from "../onpage/onp-014-viewport";
import { PRF_001 } from "../performance/prf-001-lcp";
import { PRF_002 } from "../performance/prf-002-inp";
import { PRF_003 } from "../performance/prf-003-cls";
import { PRF_004 } from "../performance/prf-004-page-weight";
import { PRF_005 } from "../performance/prf-005-image-weight";
import { PRF_006 } from "../performance/prf-006-lazy-loading";
import { PRF_007 } from "../performance/prf-007-render-blocking";
import { PRF_008 } from "../performance/prf-008-compression";
import { PRF_009 } from "../performance/prf-009-caching";
import { SD_001 } from "../schema/sd-001-valid-json-ld";
import { SD_002 } from "../schema/sd-002-organization";
import { SD_003 } from "../schema/sd-003-local-business";
import { SD_004 } from "../schema/sd-004-product";
import { SD_005 } from "../schema/sd-005-breadcrumb-list";
import { SD_006 } from "../schema/sd-006-schema-matches-content";
import { SD_007 } from "../schema/sd-007-faq-page";
import { SD_008 } from "../schema/sd-008-article";
import { SD_009 } from "../schema/sd-009-service";
import { SMP_001 } from "../sitemap/smp-001-sitemap-exists";
import { SMP_002 } from "../sitemap/smp-002-listed-in-robots";
import { SMP_003 } from "../sitemap/smp-003-submitted-in-gsc";
import { SMP_004 } from "../sitemap/smp-004-valid-xml";
import { SMP_005 } from "../sitemap/smp-005-size-limits";
import { SMP_006 } from "../sitemap/smp-006-absolute-urls";
import { SMP_007 } from "../sitemap/smp-007-urls-return-200";
import { SMP_008 } from "../sitemap/smp-008-no-noindex";
import { SMP_009 } from "../sitemap/smp-009-no-robots-blocked";
import { SMP_010 } from "../sitemap/smp-010-canonical-only";
import { SMP_011 } from "../sitemap/smp-011-lastmod";
import { SMP_012 } from "../sitemap/smp-012-missing-from-sitemap";
import { SMP_013 } from "../sitemap/smp-013-gsc-errors";
import { SMP_014 } from "../sitemap/smp-014-listed-not-indexed";
import { SMP_015 } from "../sitemap/smp-015-sitemap-hreflang";
import { SMP_016 } from "../sitemap/smp-016-image-video-entries";
import { TEC_001 } from "../technical/tec-001-robots-valid";
import { TEC_002 } from "../technical/tec-002-key-pages-not-blocked";
import { TEC_003 } from "../technical/tec-003-server-errors";
import { TEC_004 } from "../technical/tec-004-redirect-chains";
import { TEC_005 } from "../technical/tec-005-redirect-loops";
import { TEC_006 } from "../technical/tec-006-https";
import { TEC_007 } from "../technical/tec-007-http-to-https";
import { TEC_008 } from "../technical/tec-008-www-consistency";
import { TEC_009 } from "../technical/tec-009-real-404";
import type { RuleDefinition } from "./types";

export const RULES: readonly RuleDefinition[] = [
  AI_001,
  AI_002,
  AI_003,
  AI_004,
  AI_005,
  AI_006,
  AI_007,
  IDX_001,
  IDX_002,
  IDX_003,
  IDX_004,
  IDX_005,
  IDX_006,
  IDX_007,
  LNK_001,
  LNK_002,
  LNK_003,
  LNK_004,
  LNK_005,
  LNK_006,
  LNK_007,
  ONP_001,
  ONP_002,
  ONP_003,
  ONP_004,
  ONP_005,
  ONP_006,
  ONP_007,
  ONP_008,
  ONP_009,
  ONP_010,
  ONP_011,
  ONP_012,
  ONP_013,
  ONP_014,
  PRF_001,
  PRF_002,
  PRF_003,
  PRF_004,
  PRF_005,
  PRF_006,
  PRF_007,
  PRF_008,
  PRF_009,
  SD_001,
  SD_002,
  SD_003,
  SD_004,
  SD_005,
  SD_006,
  SD_007,
  SD_008,
  SD_009,
  SMP_001,
  SMP_002,
  SMP_003,
  SMP_004,
  SMP_005,
  SMP_006,
  SMP_007,
  SMP_008,
  SMP_009,
  SMP_010,
  SMP_011,
  SMP_012,
  SMP_013,
  SMP_014,
  SMP_015,
  SMP_016,
  TEC_001,
  TEC_002,
  TEC_003,
  TEC_004,
  TEC_005,
  TEC_006,
  TEC_007,
  TEC_008,
  TEC_009,
].sort((a, b) => a.id.localeCompare(b.id));

export const RULES_BY_ID: ReadonlyMap<string, RuleDefinition> = new Map(
  RULES.map((r) => [r.id, r]),
);
