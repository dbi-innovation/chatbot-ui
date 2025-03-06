alter table "public"."messages" add column "feedback" text;

alter table "public"."messages" add column "incorrect_reason" text;

alter table "public"."messages" add column "is_content_correct" boolean;

alter table "public"."messages" add column "is_content_liked" boolean;



