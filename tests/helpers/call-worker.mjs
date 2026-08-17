// vinext's App Router build output (dist/server/index.js) can export its
// handler as either a plain `handler(request)` function or a Worker-style
// `{ fetch(request, env, ctx) }` object (see resolveAppRouterHandler in
// node_modules/vinext/dist/server/prod-server.js) — which shape you get
// isn't something project code controls. Tests need to call whichever one
// the current build actually produced instead of assuming one.
export function callWorker(worker, request, env, ctx) {
  if (typeof worker === "function") return worker(request);
  if (worker && typeof worker.fetch === "function") return worker.fetch(request, env, ctx);
  throw new Error("Worker default export is neither a handler function nor a { fetch } object");
}
