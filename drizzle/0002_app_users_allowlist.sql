ALTER TABLE "app_users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "app_users_auth_idx" ON "app_users" USING btree ("auth_user_id");--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_auth_user_id_unique" UNIQUE("auth_user_id");