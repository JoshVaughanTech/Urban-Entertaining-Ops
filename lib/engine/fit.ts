import { DIETARY_LABELS, type Catalogue, type DietaryTag, type EventInput, type Package } from "./types";

export type IssueCode = "style" | "min_guests" | "max_guests" | "dietary";
export type Severity = "soft" | "hard";

export type FitIssue = {
  code: IssueCode;
  severity: Severity;
  message: string;
};

export type PackageFit = {
  pkg: Package;
  issues: FitIssue[];
  /** Hard issues block selection outright. */
  blocked: boolean;
};

/** Can this package put something in front of a guest with this requirement?
 *  Either a listed menu item carries the tag, or the kitchen can substitute
 *  within the package (packages.adaptable_dietary). */
export function satisfiesDiet(pkg: Package, tag: DietaryTag, cat: Catalogue): boolean {
  if (pkg.adaptableDietary.includes(tag)) return true;
  return pkg.menuItemIds.some((id) => cat.menuItems.get(id)?.dietaryTags.includes(tag));
}

/** Issue order matches the mockup's: style, then guest count, then dietary. */
export function fitPackage(pkg: Package, event: EventInput, cat: Catalogue): FitIssue[] {
  const issues: FitIssue[] = [];

  if (event.style && pkg.style !== event.style) {
    issues.push({ code: "style", severity: "soft", message: "Different service style" });
  }

  if (event.guests < pkg.minGuests) {
    issues.push({
      code: "min_guests",
      severity: "hard",
      message: `Minimum ${pkg.minGuests} guests`,
    });
  }

  if (event.guests > pkg.maxGuests) {
    issues.push({
      code: "max_guests",
      severity: "hard",
      message: `Caps at ${pkg.maxGuests} guests`,
    });
  }

  for (const tag of event.dietary) {
    if (!satisfiesDiet(pkg, tag, cat)) {
      issues.push({
        code: "dietary",
        severity: "hard",
        message: `No ${DIETARY_LABELS[tag].toLowerCase()} option in this package`,
      });
    }
  }

  return issues;
}

export const hasHardIssue = (issues: FitIssue[]) => issues.some((i) => i.severity === "hard");

/** Ranked by issue count, with anything carrying a hard issue pushed last.
 *  Ties keep catalogue order, so the list doesn't reshuffle as guests change. */
export function rankPackages(
  packages: Package[],
  event: EventInput,
  cat: Catalogue,
): PackageFit[] {
  return packages
    .map((pkg) => {
      const issues = fitPackage(pkg, event, cat);
      return { pkg, issues, blocked: hasHardIssue(issues) };
    })
    .sort((a, b) => {
      if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
      return a.issues.length - b.issues.length;
    });
}
