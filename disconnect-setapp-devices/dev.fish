#!/usr/bin/env -S fish

set current_dir (cd (dirname (status -f)); and pwd)
deno run --allow-env --allow-run --reload --allow-net $current_dir"/main.ts"