# Built with the REPO ROOT as the Docker build context, not server/ — see
# compose.yaml, or the `fly deploy` command in CLAUDE.md. server/tsconfig.json
# maps `@/*` to `../src/*`, and Docker's COPY cannot reach outside its build
# context, so the context has to be the whole repo or that mapping has nothing
# to resolve against on the image.
FROM node:22-slim
WORKDIR /app

# Dependencies install at /app, NOT /app/server, and this is load-bearing.
# Node resolves node_modules by walking up from the *importing file*: src/lib
# ends up at /app/src/lib, so it can only ever see /app/node_modules. Installing
# into /app/server instead leaves every @/lib/* import unable to find zod —
# the image builds clean and then dies on boot.
#
# It is still server/package.json: the one npm package those imports touch is
# zod, already a server dependency, so the app's own manifest is not needed.
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# The only part of the app the server ever imports through @/*: src/lib.
# Nothing under src/app, src/components or src/stores is reachable from here —
# that split (keyOf living in cell-key.ts rather than grid.ts, which pulls in
# three.js) is what keeps a headless process out of the browser dependency
# tree in the first place.
COPY src/lib ./src/lib
COPY server ./server

WORKDIR /app/server
ENV NODE_ENV=production
# index.ts reads PORT and falls back to 2567. Pinning it here means the image
# listens on the same port everywhere — Render, Fly and a bare `docker run`
# alike — instead of depending on the platform to inject one. Map it to
# whatever you like on the host side.
ENV PORT=8080
EXPOSE 8080
# tsx by absolute path rather than `npm start`: the binary is at /app, one
# level above this working directory, and spelling it out beats depending on
# npm's PATH walking to find it.
CMD ["/app/node_modules/.bin/tsx", "src/index.ts"]
