CREATE TABLE "draft" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"idea" text NOT NULL,
	"riff_hook" text DEFAULT '' NOT NULL,
	"source_id" text DEFAULT '' NOT NULL,
	"source_label" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "draft_version" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"channel" text NOT NULL,
	"label" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'writing' NOT NULL,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "draft_version_draft_channel_key" UNIQUE("draft_id","channel")
);

CREATE TABLE "scheduled_post" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"draft_version_id" text NOT NULL,
	"slot_id" text,
	"scheduled_for" timestamp NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_post_version_key" UNIQUE("draft_version_id")
);

CREATE TABLE "slot" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"weekday" integer NOT NULL,
	"time_of_day" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "slot_user_channel_when_key" UNIQUE("user_id","channel","weekday","time_of_day")
);

ALTER TABLE "draft" ADD CONSTRAINT "draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "draft_version" ADD CONSTRAINT "draft_version_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "scheduled_post" ADD CONSTRAINT "scheduled_post_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "scheduled_post" ADD CONSTRAINT "scheduled_post_draft_version_id_draft_version_id_fk" FOREIGN KEY ("draft_version_id") REFERENCES "public"."draft_version"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "scheduled_post" ADD CONSTRAINT "scheduled_post_slot_id_slot_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slot"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "slot" ADD CONSTRAINT "slot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "draft_user_created_idx" ON "draft" USING btree ("user_id","created_at");

CREATE INDEX "draft_version_draft_idx" ON "draft_version" USING btree ("draft_id");

CREATE INDEX "scheduled_post_user_when_idx" ON "scheduled_post" USING btree ("user_id","scheduled_for");

CREATE INDEX "slot_user_idx" ON "slot" USING btree ("user_id");