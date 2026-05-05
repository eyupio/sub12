set -o pipefail
(cd '/c/Users/paul/git/sub-12/backend' 2>/dev/null || cd '/mnt/c/Users/paul/git/sub-12/backend') || exit 1
timeout 15s make run > /tmp/sub12_make_run.log 2>&1
ec=$?
echo "EXIT_CODE=$ec"
echo "FIRST20_START"
sed -n '1,20p' /tmp/sub12_make_run.log
echo "FIRST20_END"
