// Publishing targets (REQUIREMENTS M13): every CMS integration reads and writes the same
// normalised fields as the WordPress plugin, and refuses a write when the site no longer has the
// value we expect, so publish and rollback behave the same everywhere.
import type {
  WpField,
  WpItem,
  WpReadResult,
  WpRef,
  WpValue,
  WpWriteItem,
  WpWriteResult,
} from "./wordpress/client";
import { sameWpValue } from "./wordpress/client";

export type TargetKind = "wordpress" | "shopify" | "webflow";

export interface PublishTarget {
  readonly kind: TargetKind;
  /** Fields this target can change; others are skipped as "manual". */
  readonly fields: ReadonlySet<WpField>;
  read(items: WpItem[]): Promise<WpReadResult[]>;
  write(items: WpWriteItem[]): Promise<WpWriteResult[]>;
  /** Makes written values live (Webflow: publish the site). */
  publish?(): Promise<void>;
  /** Demo targets have no live site: verification reads the value back instead. */
  readonly demo?: boolean;
}

/** Key of one value in a demo store: field + the ref it belongs to. */
export const storeKey = (field: WpField, ref: WpRef): string =>
  `${field}|${ref.url ?? ""}|${ref.src ?? ""}|${ref.from ?? ""}`;

/**
 * Local test mode target (Shopify / Webflow demo stores): values live in a JSON map that the
 * caller persists. Same conditional-write contract as a real store.
 */
export class MemoryTarget implements PublishTarget {
  readonly demo = true;

  constructor(
    readonly kind: TargetKind,
    readonly fields: ReadonlySet<WpField>,
    private readonly values: Record<string, WpValue>,
    private readonly save: (values: Record<string, WpValue>) => Promise<void>,
    private readonly initial: (field: WpField, ref: WpRef) => WpValue = () => null,
  ) {}

  private current(field: WpField, ref: WpRef): WpValue {
    const key = storeKey(field, ref);
    return key in this.values ? (this.values[key] ?? null) : this.initial(field, ref);
  }

  async read(items: WpItem[]): Promise<WpReadResult[]> {
    return items.map(({ field, ref }) =>
      this.fields.has(field)
        ? { value: this.current(field, ref), error: null, resolved: ref.url ?? ref.from ?? null }
        : { value: null, error: "unsupported", resolved: null },
    );
  }

  async write(items: WpWriteItem[]): Promise<WpWriteResult[]> {
    const out: WpWriteResult[] = [];
    for (const { field, ref, value, expect } of items) {
      if (!this.fields.has(field)) {
        out.push({ ok: false, previous: null, error: "unsupported" });
        continue;
      }
      const previous = this.current(field, ref);
      if (!sameWpValue(previous, expect)) {
        out.push({ ok: false, previous, error: "conflict" });
        continue;
      }
      this.values[storeKey(field, ref)] = value;
      out.push({ ok: true, previous, error: null });
    }
    await this.save(this.values);
    return out;
  }
}
