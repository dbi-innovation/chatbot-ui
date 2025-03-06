.PHONY: db-migrate-remote db-new-migration db-diff-migration

db-migrate-remote:
	@read -p "Enter database host: " host; \
	read -p "Enter database user: " user; \
	read -sp "Enter database password: " password; echo; \
	supabase migration up --db-url postgresql://$$user:$$password@$$host:5432/postgres

db-new-migration:
	@read -p "Enter migration name: " name; \
	supabase migration new $$name

db-diff-migration:
	@read -p "Enter migration name: " name; \
	read -p "Enter output migration file name: " file; \
	supabase db diff --use-migra $$name > $$file
