CREATE TYPE "public"."contact_role" AS ENUM('booker', 'on_site', 'billing');--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"role" "contact_role" DEFAULT 'booker' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"discount_pct" integer DEFAULT 0 NOT NULL,
	"preferences" text,
	"staff_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_discount_pct_range" CHECK ("clients"."discount_pct" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_contacts_one_primary_idx" ON "client_contacts" USING btree ("client_id") WHERE "client_contacts"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "clients_name_lower_idx" ON "clients" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_client_idx" ON "events" USING btree ("client_id");--> statement-breakpoint
/* Backfill. Hand-written: drizzle-kit generates DDL only, and this is the
   first migration in the repo to carry data SQL.

   One client per distinct event client_name, compared case-insensitively and
   trimmed, taking the earliest-used spelling as canonical. Then link the
   events. An event whose name is blank gets no client and keeps a null
   client_id, which is the case read paths already have to handle. */
INSERT INTO "clients" ("name")
SELECT DISTINCT ON (lower(trim("client_name"))) trim("client_name")
FROM "events"
WHERE trim("client_name") <> ''
ORDER BY lower(trim("client_name")), "created_at";
--> statement-breakpoint
UPDATE "events" e
SET "client_id" = c."id"
FROM "clients" c
WHERE lower(trim(e."client_name")) = lower(c."name")
  AND e."client_id" IS NULL;
