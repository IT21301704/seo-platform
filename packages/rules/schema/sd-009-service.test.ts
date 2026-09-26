import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { SD_009 } from "./sd-009-service";

const service = {
  "@type": "Service",
  name: "Pottery workshop",
  provider: { "@id": "#store" },
  serviceType: "Class",
};

describe("SD-009 Service", () => {
  it("passes for a complete Service", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { jsonLd: [service] }) };
    expect(summary(await check(SD_009, { pages }))).toEqual(["pass /about/"]);
  });

  it("fails without a provider", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { jsonLd: [{ ...service, provider: undefined }] }),
    };
    expect(summary(await check(SD_009, { pages }))).toEqual(["fail /about/"]);
  });
});
