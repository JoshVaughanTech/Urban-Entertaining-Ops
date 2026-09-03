CREATE TYPE "public"."dietary_tag" AS ENUM('vegetarian', 'vegan', 'gf', 'df', 'halal', 'nut_free');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'placed');--> statement-breakpoint
CREATE TYPE "public"."pricing_basis" AS ENUM('head', 'flat');--> statement-breakpoint
CREATE TYPE "public"."quote_line_source" AS ENUM('package', 'addon', 'extended_service', 'custom');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'confirmed', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."style" AS ENUM('cocktail', 'seated', 'grazing', 'corporate');--> statement-breakpoint
CREATE TYPE "public"."unit" AS ENUM('kg', 'L', 'each', 'dozen');--> statement-breakpoint
CREATE TABLE "addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"pricing_basis" "pricing_basis" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "addons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "role" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" text NOT NULL,
	"contact_email" text,
	"event_date" date NOT NULL,
	"guests" integer NOT NULL,
	"style" "style",
	"duration_hours" numeric(4, 1) NOT NULL,
	"venue" text,
	"dietary" "dietary_tag"[] DEFAULT '{}'::dietary_tag[] NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_guests_positive" CHECK ("events"."guests" > 0)
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"supplier_id" uuid,
	"name" text NOT NULL,
	"unit" "unit" NOT NULL,
	"pack_size" numeric(10, 3) NOT NULL,
	"cost_per_unit" integer NOT NULL,
	"cost_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_slug_unique" UNIQUE("slug"),
	CONSTRAINT "ingredients_pack_size_positive" CHECK ("ingredients"."pack_size" > 0),
	CONSTRAINT "ingredients_cost_non_negative" CHECK ("ingredients"."cost_per_unit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"recipe_id" uuid,
	"portions_per_head" numeric(10, 3) NOT NULL,
	"dietary_tags" "dietary_tag"[] DEFAULT '{}'::dietary_tag[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"supplier_id" uuid,
	"needed_qty" numeric(10, 3) NOT NULL,
	"packs" integer NOT NULL,
	"order_qty" numeric(10, 3) NOT NULL,
	"unit_cost" integer NOT NULL,
	"ordered" boolean DEFAULT false NOT NULL,
	"quote_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"window_from" date NOT NULL,
	"window_to" date NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_items" (
	"package_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "package_items_package_id_menu_item_id_pk" PRIMARY KEY("package_id","menu_item_id")
);
--> statement-breakpoint
CREATE TABLE "package_tiers" (
	"package_id" uuid NOT NULL,
	"up_to_guests" integer NOT NULL,
	"price_per_head" integer NOT NULL,
	CONSTRAINT "package_tiers_package_id_up_to_guests_pk" PRIMARY KEY("package_id","up_to_guests")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"style" "style" NOT NULL,
	"blurb" text,
	"min_guests" integer NOT NULL,
	"max_guests" integer NOT NULL,
	"staff_per_guests" integer,
	"service_hours" numeric(4, 1) NOT NULL,
	"includes" text[] DEFAULT '{}'::text[] NOT NULL,
	"adaptable_dietary" "dietary_tag"[] DEFAULT '{}'::dietary_tag[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "quote_addons" (
	"quote_id" uuid NOT NULL,
	"addon_id" uuid NOT NULL,
	CONSTRAINT "quote_addons_quote_id_addon_id_pk" PRIMARY KEY("quote_id","addon_id")
);
--> statement-breakpoint
CREATE TABLE "quote_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"qty" numeric(10, 3) NOT NULL,
	"unit_price" integer NOT NULL,
	"source" "quote_line_source" NOT NULL,
	"addon_id" uuid
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"event_id" uuid NOT NULL,
	"package_id" uuid,
	"price_per_head" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"snapshot" jsonb,
	"public_token" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_ref_unique" UNIQUE("ref"),
	CONSTRAINT "quotes_public_token_unique" UNIQUE("public_token"),
	CONSTRAINT "quotes_discount_non_negative" CHECK ("quotes"."discount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_items" (
	"recipe_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty" numeric(10, 3) NOT NULL,
	CONSTRAINT "recipe_items_recipe_id_ingredient_id_pk" PRIMARY KEY("recipe_id","ingredient_id"),
	CONSTRAINT "recipe_items_qty_positive" CHECK ("recipe_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"yield_portions" numeric(10, 3) NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"staff_hourly_cost" integer NOT NULL,
	"staff_hourly_charge" integer NOT NULL,
	"gst_rate" numeric(5, 4) NOT NULL,
	"quote_validity_days" integer NOT NULL,
	"deposit_pct" integer NOT NULL,
	"quote_ref_prefix" text DEFAULT 'UE' NOT NULL,
	"quote_ref_next" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"contact_email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_tiers" ADD CONSTRAINT "package_tiers_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_addons" ADD CONSTRAINT "quote_addons_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_addons" ADD CONSTRAINT "quote_addons_addon_id_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."addons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_addon_id_addons_id_fk" FOREIGN KEY ("addon_id") REFERENCES "public"."addons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_app_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "ingredients_supplier_idx" ON "ingredients" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_ingredient_idx" ON "order_lines" USING btree ("order_id","ingredient_id");--> statement-breakpoint
CREATE INDEX "order_lines_supplier_idx" ON "order_lines" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_lines_sort_idx" ON "quote_lines" USING btree ("quote_id","sort");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quotes_event_idx" ON "quotes" USING btree ("event_id");