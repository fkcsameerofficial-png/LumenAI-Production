#!/usr/bin/env bash
# Runs automatically once when the Codespace / dev container is created.
set -e
echo "Setting up Lumen..."

cp -n backend/.env.example backend/.env || true
cp -n frontend/.env.example frontend/.env || true

# Generate real random secrets instead of leaving the placeholder values in backend/.env,
# so the app is secure by default even if you forget this step.
node - << 'NODE'
const fs = require("fs");
const crypto = require("crypto");
const path = "backend/.env";
let env = fs.readFileSync(path, "utf-8");
const rand = () => crypto.randomBytes(32).toString("hex");
env = env.replace(/JWT_SECRET=.*/, `JWT_SECRET=${rand()}`);
env = env.replace(/REFRESH_SECRET=.*/, `REFRESH_SECRET=${rand()}`);
env = env.replace(/ENCRYPTION_KEY=.*/, `ENCRYPTION_KEY=${rand()}`);
fs.writeFileSync(path, env);
console.log("Generated random JWT_SECRET / REFRESH_SECRET / ENCRYPTION_KEY in backend/.env");
NODE

echo "Installing backend dependencies..."
(cd backend && npm install && npm run migrate)

echo "Installing frontend dependencies..."
(cd frontend && npm install)

echo "Setup complete. Run 'bash .devcontainer/start.sh' to launch Lumen."
