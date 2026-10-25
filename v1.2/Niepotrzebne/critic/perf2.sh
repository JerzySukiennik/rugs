cd "/Users/jurek/Downloads/Claude/Projects/Rug Rush/Niepotrzebne/critic"
while [ ! -f out/batch.done ]; do sleep 5; done
W=1536 H=960 DPR=2 node run-bot2.mjs ./perf.js perf-retina 200 "test&prof" out/perf-retina.json > out/perf-retina.out 2>&1
node run-bot2.mjs ./misuse2.js misuse2 200 test out/misuse2.json > out/misuse2.out 2>&1
node run-bot2.mjs ./label.js label 120 test out/label.json > out/label.out 2>&1
node run-bot2.mjs ./chaos.js chaos2 200 test out/chaos2.json > out/chaos2.out 2>&1
echo DONE > out/batch2.done
