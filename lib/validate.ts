/* Small form-parsing helpers.
 *
 * Staff type dollars; the database stores cents. This is the only place that
 * conversion happens on the way in, matching lib/engine/format on the way out. */

export type FieldErrors = Record<string, string>;

export class Validator {
  readonly errors: FieldErrors = {};

  constructor(private readonly data: FormData) {}

  private raw(name: string): string {
    const v = this.data.get(name);
    return typeof v === "string" ? v.trim() : "";
  }

  text(name: string, label: string, opts: { required?: boolean; max?: number } = {}): string {
    const value = this.raw(name);
    if (opts.required && !value) this.errors[name] = `${label} is required.`;
    if (opts.max && value.length > opts.max) {
      this.errors[name] = `${label} must be ${opts.max} characters or fewer.`;
    }
    return value;
  }

  optionalText(name: string): string | null {
    const value = this.raw(name);
    return value === "" ? null : value;
  }

  /** Dollars in, integer cents out. */
  money(name: string, label: string, opts: { required?: boolean; min?: number } = {}): number {
    const value = this.raw(name).replace(/^\$/, "").replace(/,/g, "");
    if (value === "") {
      if (opts.required) this.errors[name] = `${label} is required.`;
      return 0;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      this.errors[name] = `${label} must be an amount, like 62.50.`;
      return 0;
    }
    const cents = Math.round(parsed * 100);
    if (opts.min !== undefined && cents < opts.min) {
      this.errors[name] = `${label} cannot be less than ${opts.min / 100}.`;
    }
    return cents;
  }

  number(
    name: string,
    label: string,
    opts: { required?: boolean; min?: number; max?: number; integer?: boolean } = {},
  ): number {
    const value = this.raw(name);
    if (value === "") {
      if (opts.required) this.errors[name] = `${label} is required.`;
      return 0;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      this.errors[name] = `${label} must be a number.`;
      return 0;
    }
    if (opts.integer && !Number.isInteger(parsed)) {
      this.errors[name] = `${label} must be a whole number.`;
    }
    if (opts.min !== undefined && parsed < opts.min) {
      this.errors[name] = `${label} must be at least ${opts.min}.`;
    }
    if (opts.max !== undefined && parsed > opts.max) {
      this.errors[name] = `${label} must be at most ${opts.max}.`;
    }
    return parsed;
  }

  optionalNumber(name: string, label: string, opts: { min?: number } = {}): number | null {
    const value = this.raw(name);
    if (value === "") return null;
    return this.number(name, label, { ...opts, required: true });
  }

  enum<T extends string>(name: string, label: string, allowed: readonly T[]): T {
    const value = this.raw(name) as T;
    if (!allowed.includes(value)) {
      this.errors[name] = `${label} must be one of: ${allowed.join(", ")}.`;
      return allowed[0] as T;
    }
    return value;
  }

  multi<T extends string>(name: string, allowed: readonly T[]): T[] {
    return this.data
      .getAll(name)
      .filter((v): v is string => typeof v === "string")
      .filter((v): v is T => allowed.includes(v as T));
  }

  /** One value per line, blanks dropped — for a package's "includes" list. */
  lines(name: string): string[] {
    const value = this.data.get(name);
    if (typeof value !== "string") return [];
    return value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  email(name: string, label: string): string | null {
    const value = this.raw(name);
    if (value === "") return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      this.errors[name] = `${label} must be a valid email address.`;
    }
    return value;
  }

  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }
}

export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
};

export const idle: ActionState = { ok: false };

export const failed = (message: string, errors?: FieldErrors): ActionState => ({
  ok: false,
  message,
  errors,
});

export const succeeded = (message: string): ActionState => ({ ok: true, message });
