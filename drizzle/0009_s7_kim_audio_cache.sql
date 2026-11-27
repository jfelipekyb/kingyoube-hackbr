CREATE TABLE "kim_audio_cache" (
	"hash" varchar(64) PRIMARY KEY NOT NULL,
	"voice_id" text NOT NULL,
	"model" text NOT NULL,
	"text" text NOT NULL,
	"mime" text NOT NULL,
	"audio_base64" text NOT NULL,
	"alignment" jsonb,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
