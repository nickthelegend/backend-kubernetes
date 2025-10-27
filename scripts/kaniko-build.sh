#!/usr/bin/env bash
# usage: ./kaniko-build.sh <git-context> <destination>
CONTEXT=$1
DEST=$2
kubectl -n backend apply -f - <<EOF
# paste the job YAML with $CONTEXT and $DEST substituted
EOF
