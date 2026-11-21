#!/bin/sh
# Vextra Studio: stop a bundled server that is still running from an earlier version (before installing or removing the package).
pkill -x vextra-server >/dev/null 2>&1 || true
exit 0
