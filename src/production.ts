await Promise.all([
  import("./dashboard/server.js"),
  import("./bot/index.js")
]);
