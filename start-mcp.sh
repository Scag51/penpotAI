#!/bin/sh
set -e

echo "=== Installation pnpm ==="
npm install -g pnpm

echo "=== Installation @penpot/mcp@beta ==="
npm install -g @penpot/mcp@beta

echo "=== Patch vite allowedHosts ==="
CONFIG="/usr/local/lib/node_modules/@penpot/mcp/packages/plugin/vite.config.ts"
node -e "
const fs = require('fs');
let c = fs.readFileSync('$CONFIG', 'utf8');
c = c.replace('allowedHosts: []', 'allowedHosts: [\"mcp.qoma.fr\"]');
fs.writeFileSync('$CONFIG', c);
console.log('Patch OK:', fs.readFileSync('$CONFIG', 'utf8').indexOf('mcp.qoma.fr') > -1 ? 'SUCCESS' : 'FAILED');
"

echo "=== Demarrage penpot-mcp ==="
exec penpot-mcp
