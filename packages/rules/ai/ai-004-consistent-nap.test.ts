import { describe, expect, it } from "vitest";
import { check, page, summary } from "../src/testing";
import { AI_004 } from "./ai-004-consistent-nap";

const store = (telephone: string) => ({ "@type": "Store", name: "Example Store", telephone });
const footer = (tel: string) => `<p><a href="tel:${tel}">Call us</a></p>`;

describe("AI-004 consistent NAP", () => {
  it("passes when the phone is the same everywhere (formatting ignored)", async () => {
    const pages = {
      "/": page("/", {
        nav: ["/about/"],
        jsonLd: [store("+94 91 222 0142")],
        body: footer("+94912220142"),
      }),
      "/about/": page("/about/", { body: footer("+94912220142") }),
    };
    expect(summary(await check(AI_004, { pages }))).toEqual(["pass site"]);
  });

  it("fails for two different phone numbers", async () => {
    const pages = {
      "/": page("/", { nav: ["/about/"], jsonLd: [store("+94 91 222 0142")] }),
      "/about/": page("/about/", { body: footer("+94912229999") }),
    };
    const outcomes = await check(AI_004, { pages });
    expect(summary(outcomes)).toEqual(["fail site"]);
    expect(outcomes[0]?.evidence["phones"]).toEqual(["94912220142", "94912229999"]);
  });

  it("is not applicable without any business details", async () => {
    expect(summary(await check(AI_004))).toEqual(["na site"]);
  });
});
