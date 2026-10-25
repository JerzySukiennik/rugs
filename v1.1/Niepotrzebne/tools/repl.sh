#!/bin/bash
# Rug Rush net REPL client: writes the next command module and waits for its output.
DIR=/tmp/rr-repl
n=0
while [ -e "$DIR/cmd-$n.mjs" ]; do n=$((n+1)); done
cat > "$DIR/cmd-$n.mjs"
for i in $(seq 1 600); do
  if [ -e "$DIR/out-$n.json" ]; then cat "$DIR/out-$n.json"; exit 0; fi
  sleep 0.2
done
echo "timeout waiting for out-$n.json"
