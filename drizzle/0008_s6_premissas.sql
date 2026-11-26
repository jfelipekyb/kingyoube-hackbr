CREATE TABLE "team_premises" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"value" integer NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
