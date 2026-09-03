# Built with the REPO ROOT as the Docker build context, not server/ — see the
# `fly deploy` command this ships with. server/tsconfig.json maps `@/*` to
# `../src/*`, and Docker's COPY cannot reach outside its build context, so the
# context has to be the whole repo or that mapping has nothing to resolve
# against on the image.
FROM node:22-slim
WORKDIR /app

# Only server/'s own dependencies get installed. Every @/lib/* import this
# process makes (traced, not guessed — see server/src/**/*.ts) touches exactly
# one npm package, zod, which is already in server/package.json. There is no
# reason to install the app's node_modules at all.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# The only part of the app the server ever imports through @/*: src/lib.
# Nothing under src/app, src/components or src/stores is reachable from here —
# that split (keyOf living in cell-key.ts rather than grid.ts, which pulls in
# three.js) is what keeps a headless process out of the browser dependency
# tree in the first place.
COPY src/lib ./src/lib
COPY server ./server

WORKDIR /app/server
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm", "start"]
